const mongoose = require('mongoose');
const pick = require('lodash').pick;
const _ = require('lodash');
const distributions = require('./distributions');
const computeFacets = require('../../helpers/facets').compute;
const Promise = require('bluebird');
const convertDataset = require('../../helpers/convertDataset');

const RecordRevision = mongoose.model('RecordRevision');
const CatalogRecord = mongoose.model('CatalogRecord');
const ConsolidatedRecord = mongoose.model('ConsolidatedRecord');
const RelatedResource = mongoose.model('RelatedResource');
const OrganizationSpelling = mongoose.model('OrganizationSpelling');

export function getCatalogRecords(recordId) {
    return CatalogRecord
        .find({ recordId })
        .sort('-createdAt -revisionDate')
        .populate('catalog', 'name')
        .lean()
        .exec()
        .then(catalogRecords => {
            if (catalogRecords.length === 0) throw new Error('No catalog record found for recordId: ' + recordId);
            return catalogRecords;
        });
}

export function getBestRecordRevision(catalogRecordsPromise) {
    return catalogRecordsPromise
        .then(catalogRecords => RecordRevision.findOne(pick(catalogRecords[0], 'recordId', 'recordHash')).exec())
        .then(recordRevision => {
            if (!recordRevision) throw new Error('Record revision not found for: ' + recordRevision.toJSON());
            return recordRevision;
        });
}

export function fetchRelatedResources(recordId) {
    return RelatedResource.find({ record: recordId }).exec();
}

export function getConsolidatedRecord(recordId) {
    return ConsolidatedRecord.findOne({ recordId }).exec()
        .then(record => {
            if (!record) throw new Error('ConsolidatedRecord not found for ' + recordId);
            return record;
        });
}

function createDatasetFromRecord(recordRevision) {
    if (recordRevision.recordType === 'Record') {
        return convertDataset.fromDublinCore(recordRevision.content);
    }
    if (recordRevision.recordType === 'MD_Metadata') {
        return convertDataset.fromIso(recordRevision.content);
    }
    throw new Error('Not supported record type: ' + recordRevision.recordType);
}

export function applyRecordRevisionChanges(record, recordRevision) {
    // if (record.recordHash && record.recordHash === recordRevision.recordHash) return Promise.resolve(record);
    record
        .set('recordHash', recordRevision.recordHash)
        .set('revisionDate', recordRevision.revisionDate)
        .set('metadata', createDatasetFromRecord(recordRevision));

    return Promise.resolve(record);
}

export function applyOrganizationsFilter(record) {

    const spellings = record.metadata.contributors;

    return Promise.map(spellings, spelling => {
        return OrganizationSpelling
            .findByIdAndUpdate(spelling, {}, { upsert: true })
            .populate('organization')
            .lean()
            .exec()
            .then(organizationSpelling => {
                if (organizationSpelling.rejected) return;
                if (organizationSpelling.organization && organizationSpelling.organization.name)
                    return organizationSpelling.organization.name;
                return spelling;
            });
    })
    .then(organizationNames => {
        organizationNames = _.chain(organizationNames).compact().uniq().valueOf();
        return record.set('organizations', organizationNames);
    });
}

export function applyResources(record, relatedResources) {
    const dist = [];
    const alt = [];

    relatedResources.forEach(function (resource) {
        var distribution;
        if (resource.type === 'feature-type') {
            distribution = distributions.buildFeatureType(resource);
            if (distribution) dist.push(distribution);
        } else if (resource.type === 'remote-resource' && resource.remoteResource.type === 'file-distribution') {
            Array.prototype.push.apply(dist, distributions.buildLayers(resource));
        } else {
            alt.push({
                name: resource.name,
                location: resource.remoteResource.location,
                available: resource.remoteResource.available
            });
        }
    });

    return Promise.resolve(record
        .set('dataset.distributions', _.uniq(dist, 'uniqueId'))
        .set('alternateResources', _.uniq(alt, 'location')));
}

export function exec(job, done) {
    const recordId = job.data.recordId;
    const now = new Date();

    return ConsolidatedRecord.toggleConsolidating(recordId, true)
        .then(marked => {
            const catalogRecordsPromise = getCatalogRecords(recordId);
            if (!marked) throw new Error('Already consolidating...');
            return Promise.props({
                catalogRecords: catalogRecordsPromise,
                record: getConsolidatedRecord(recordId),
                relatedResources: fetchRelatedResources(recordId),
                recordRevision: getBestRecordRevision(catalogRecordsPromise)
            }).then(r => {
                const process = Promise.try(() => applyRecordRevisionChanges(r.record, r.recordRevision))
                    .then(() => applyOrganizationsFilter(r.record))
                    .then(() => applyResources(r.record, r.relatedResources))
                    .then(() => {
                        return r.record
                            .set('catalogs', r.catalogRecords.map(catalogRecord => catalogRecord.catalog._id))
                            .set('dataset.updatedAt', now)
                            .set('facets', computeFacets(r.record, r.catalogRecords.map(catalogRecord => catalogRecord.catalog)))
                            .save();
                    });
                process.finally(() => ConsolidatedRecord.toggleConsolidating(recordId, false));
                return process;
            });
        })
        .nodeify(done);
}

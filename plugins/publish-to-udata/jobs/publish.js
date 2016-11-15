const mongoose = require('mongoose');
const Promise = require('bluebird');
const publication = require('../publication');
const { getRecord } = require('../geogw');

const Dataset = mongoose.model('Dataset');


module.exports = function (job, jobDone) {
    const { recordId, organizationId, updateOnly } = job.data;

    Promise.join(
        getRecord(recordId),
        Dataset.findById(recordId).exec(),

        function (record, publicationInfo) {
            if (!record) throw new Error('Record not found');
            if (updateOnly && (!publicationInfo || !publicationInfo.publication._id)) {
                throw new Error('Unable to update: not published yet!');
            }

            return publication.publishDataset(record, {
                owner: publicationInfo ? publicationInfo.publication.organization : organizationId,
                publicationStatus: 'public',
                id: publicationInfo ? publicationInfo.publication._id : null
            });
        }
    )
    .catch(err => jobDone(err))
    .then(() => jobDone());
};
const hasha = require('hasha')
const {get} = require('lodash')
const debug = require('debug')('geoplatform:metadata:iso')

const {cleanKeywords} = require('../common/keywords')
const {normalizeContacts} = require('../common/contacts')
const {getLicenseFromLinks, getLicenseFromKeywords, getLicenseFromCatalogs} = require('../common/licenses')
const {castLink} = require('../common/links')
const {getAllContacts} = require('./contacts')
const {getInspireThemeFromKeywords} = require('./themes')
const {getTopicCategory} = require('./categories')
const {getCoupledResources, isWFSService, getWFSServiceLocation} = require('./services')
const {getConsolidatedExtent, getCoveredTerritories} = require('./extent')
const {prepareThumbnails} = require('./thumbnails')
const {getStatus} = require('./statuses')
const {getUpdateFrequency} = require('./update-frequencies')
const {getDates} = require('./dates')
const {getAllKeywords} = require('./keywords')
const {getAllOnLineResources} = require('./online-resources')
const {getSpatialResolution} = require('./spatial-resolution')
const {getLicenseFromConstraints} = require('./licenses')

function convert(originalRecord, catalogs = []) {
  const record = {metadataType: 'ISO 19139'}

  record.id = originalRecord.fileIdentifier
  record.resourceId = get(originalRecord, 'identificationInfo.citation.identifier')
  record.title = get(originalRecord, 'identificationInfo.citation.title')
  record.alternateTitle = get(originalRecord, 'identificationInfo.citation.alternateTitle')
  record.description = get(originalRecord, 'identificationInfo.abstract')
  record.type = get(originalRecord, 'hierarchyLevel')

  const keywords = getAllKeywords(originalRecord)
  record.keywords = cleanKeywords(keywords)

  record.contacts = normalizeContacts(getAllContacts(originalRecord))

  if (record.type === 'service') {
    record.serviceType = get(originalRecord, 'identificationInfo.serviceType')

    if (isWFSService(originalRecord)) {
      record.serviceProtocol = 'wfs'
      record.serviceURL = getWFSServiceLocation(originalRecord)

      const coupledResources = getCoupledResources(originalRecord)

      if (record.serviceURL && coupledResources.length > 0) {
        record.featureTypes = coupledResources.map(coupledResource => ({
          relatedTo: hasha(coupledResource.identifier, {algorithm: 'sha1'}),
          typeName: coupledResource.scopedName,
          serviceURL: record.serviceURL
        }))
      }
    }
  } else {
    record.spatialRepresentationType = get(originalRecord, 'identificationInfo.spatialRepresentationType')
    record.lineage = get(originalRecord, 'dataQualityInfo.lineage.statement')
    record.purpose = get(originalRecord, 'identificationInfo.purpose')
    record.credit = get(originalRecord, 'identificationInfo.credit')
    record.status = getStatus(originalRecord)

    record.inspireTheme = getInspireThemeFromKeywords(keywords)

    // Topic category
    record.topicCategory = getTopicCategory(originalRecord)

    // Thumbnails
    record.thumbnails = prepareThumbnails(get(originalRecord, 'identificationInfo.graphicOverview'))

    // Links
    const rawLinks = getAllOnLineResources(originalRecord).map(castLink)

    record.links = rawLinks.filter(result => result.href)
    record.featureTypes = rawLinks.filter(result => result.typeName)

    record.license = getLicenseFromLinks(record.links) ||
      getLicenseFromConstraints(get(originalRecord, 'identificationInfo.resourceConstraints', [])) ||
      getLicenseFromKeywords(record.keywords) ||
      getLicenseFromCatalogs(catalogs)

    try {
      record.spatialExtent = getConsolidatedExtent(originalRecord)
    } catch (error) {
      debug(`Failed computing spatial extent for ${record.id}`)
    }

    record.coveredTerritories = getCoveredTerritories(originalRecord)
    record.updateFrequency = getUpdateFrequency(originalRecord)
    record.equivalentScaleDenominator = get(originalRecord, 'identificationInfo.spatialResolution.equivalentScale.denominator')

    record.spatialResolution = getSpatialResolution(originalRecord)

    Object.assign(record, getDates(originalRecord))
  }

  return record
}

module.exports = {
  convert
}

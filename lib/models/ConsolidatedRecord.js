'use strict'

/* eslint no-multi-spaces: 0, key-spacing: 0 */
const mongoose = require('mongoose')
const {Schema} = require('mongoose')
const hasha = require('hasha')
const moment = require('moment')
const through = require('through2')
const Promise = require('bluebird')
const {omit} = require('lodash')
const stringify = require('json-stable-stringify')
const {enqueue} = require('bull-manager')

const {ObjectId, Mixed} = Schema.Types

const collectionName = 'consolidated_records'

const FIELDS_TO_OMIT_IN_HASH = [
  'createdAt',
  'updatedAt',
  'consolidatedAt'
]

function getHash(record) {
  return hasha(stringify(omit(record, ...FIELDS_TO_OMIT_IN_HASH)), {algorithm: 'sha1'})
}

const schema = new Schema({
  hash: String,

  /* Identification */
  recordId: {
    type: String,
    required: true,
    unique: true
  },

  /* Attributes */
  recordHash: {
    type: String,
    required: true
  },

  revisionDate: {
    type: Date
  },

  /* Catalogs */
  catalogs: [{
    type: ObjectId,
    ref: 'Service',
    index: true
  }],

  /* Content */
  metadata: {
    type: Mixed
  },

  organizations: {
    type: [String],
    index: true
  },

  _links: {
    type: [Mixed],
    select: false
  },

  resources: [Mixed],

  // Outgoing relations
  relatedTo: {
    type: [String],
    index: true
  },

  /* Facets */
  facets: {
    type: [Mixed],
    select: false
  },

  /* Dates */
  createdAt: {type: Date},
  updatedAt: {type: Date},
  consolidatedAt: {type: Date, index: true}
})

/* Indexes */
schema.index({'resources.serviceId': 1})
schema.index({'_links.proxyId': 1})
schema.index({
  'facets.name': 1,
  'facets.value': 1
})

schema.index({
  'metadata.type': 1,
  'metadata.serviceType': 1,
  'metadata.serviceProtocol': 1,
  'metadata.featureTypes.relatedTo': 1
}, {
  partialFilterExpression: {
    'metadata.type': 'service',
    'metadata.serviceType': 'download'
  }
})

schema.pre('save', function (next) {
  const hash = getHash(this.toObject())
  const now = new Date()

  if (this.isNew) {
    this.set('createdAt', now)
  }

  if (this.hash && this.hash === hash) {
    FIELDS_TO_OMIT_IN_HASH.forEach(field => this.unmarkModified(field))
  } else {
    this.set('hash', hash)
    this.set('updatedAt', now)
  }

  this.set('consolidatedAt', now)
  next()
})

schema.method('isFresh', function (freshness = 3600) {
  return this.consolidatedAt && moment(this.consolidatedAt).add(freshness, 'seconds').isAfter()
})

/* Statics */

schema.static('triggerUpdated', (recordId, reason) => {
  return enqueue('consolidate-record', `${recordId}: ${reason}`, {
    recordId,
    freshness: 0,
    reason
  })
})

schema.static('markAsOutdated', function (query = {}) {
  return this.updateMany(query, {
    $set: {
      consolidatedAt: new Date(2000, 0)
    }
  }).exec()
})

schema.static('consolidateMany', function ({freshness = 3600, limit = 1000}) {
  let count = 0

  return new Promise((resolve, reject) => {
    this.find({consolidatedAt: {$lt: moment().subtract(freshness, 'seconds').toDate()}})
      .select('recordId')
      .sort('consolidatedAt')
      .limit(limit)
      .lean()
      .cursor()
      .pipe(through.obj(async (record, enc, cb) => {
        try {
          await enqueue('consolidate-record', record.recordId, {
            recordId: record.recordId,
            freshness
          })

          count++

          cb()
        } catch (error) {
          cb(error)
        }
      }))
      .on('error', reject)
      .on('finish', () => resolve({count}))
  })
})

mongoose.model('ConsolidatedRecord', schema, collectionName)

'use strict'

/*
** Module dependencies
*/
const records = require('../controllers/records')

module.exports = function (app) {
  /* Params */
  app.param('recordId', records.record)
  app.param('recordHash', records.recordRevision)

  /* Routes */
  app.route('/records/:recordId')
    .get(records.show)

  app.route('/records/:recordId/consolidate')
    .post(records.consolidate)

  app.get('/records/:recordId/thumbnails/:originalUrlHash', records.thumbnail)

  app.route('/records')
    .get(records.search)

  app.route('/services/:serviceId/records')
    .get(records.search)

  app.get('/records/:recordId/revisions/best', records.showBestRevision)
  app.get('/records/:recordId/revisions/:recordHash', records.showRevision)
}

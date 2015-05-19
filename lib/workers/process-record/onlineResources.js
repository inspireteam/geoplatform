/* Module dependencies */
var URI = require('URIjs');
var ipaddr = require('ipaddr.js');
var _ = require('lodash');
var _s = require('underscore.string');
var tld = require('tldjs');


function OnlineResource(onlineResource) {
    this.name = onlineResource.name;
    this.sourceLocation = onlineResource.link;
    this.sourceProtocol = onlineResource.protocol;
    this.description = onlineResource.description;

    this.location = this.parseLocation();
    this.query = this.parseAndNormalizeQuery();
}

OnlineResource.prototype.parseLocation = function () {
    if (!this.sourceLocation) throw new Error('location must be defined');

    var uri = new URI(this.sourceLocation);

    if (uri.is('urn')) throw new Error('Location must be an url');
    if (uri.is('relative')) throw new Error('Location must be absolute');
    if (uri.protocol() !== 'http' && uri.protocol() !== 'https') throw new Error('Location protocol must be http ou https');
    if (!uri.is('ip') && !uri.is('name')) throw new Error('Location must contain an IP address or a hostname');

    if (uri.is('ip')) {
        var addr = ipaddr.parse(uri.hostname());
        var range = addr.range();
        var rangesToExclude = [
            'unspecified',
            'broadcast',
            'multicast',
            'linkLocal',
            'loopback',
            'private',
            'reserved'
        ];
        if (range && _.includes(rangesToExclude, range)) throw new Error('IP address must be public');
    }

    if (uri.is('name')) {
        var hostname = uri.hostname();
        if (!tld.tldExists(hostname)) throw new Error('Hostname must be a valid TLD');
        if (_s.endsWith(hostname, 'ader.gouv.fr')) throw new Error('Hostname must be publicly accessible');
    }

    return uri;
};

OnlineResource.prototype.parseAndNormalizeQuery = function () {
    var query = {};
    
    // Ensure query string param names are lower-cased
    _.forEach(this.location.search(true), function (val, key) {
        query[key.toLowerCase()] = val;
    });

    return query;
};

OnlineResource.prototype.isWfsFeatureType = function () {
    var sourceProtocolContainsWfs = (this.sourceProtocol || '').toLowerCase().indexOf('wfs') >= 0;
    var sourceLocationIsWfsQuery = (this.query.service || '').toLowerCase() === 'wfs';

    var detectWfsProtocol = sourceProtocolContainsWfs || sourceLocationIsWfsQuery;

    if (!detectWfsProtocol) return false;

    var typeNameInQuery = this.query.typename || this.query.typenames || this.query.layers;
    var typeNameFromName = sourceProtocolContainsWfs && this.name;

    this.typeNameFound = typeNameInQuery || typeNameFromName;

    return !!this.typeNameFound;
};

OnlineResource.prototype.getFeatureTypeName = function () {
    return this.typeNameFound;
};

OnlineResource.prototype.getNormalizedWfsServiceLocation = function () {
    var location = this.location.clone();
    location.search(_.pick(this.query, 'map')); // Pick only map param from query string (MapServer)
    location.fragment('').normalize();
    return location.valueOf();
};

OnlineResource.prototype.isWmsLayer = function () {
    var sourceProtocolContainsWms = (this.sourceProtocol || '').toLowerCase().indexOf('wms') >= 0;
    var sourceLocationIsWmsQuery = (this.query.service || '').toLowerCase() === 'wms';

    var detectWmsProtocol = sourceProtocolContainsWms || sourceLocationIsWmsQuery;

    return detectWmsProtocol;
};

OnlineResource.prototype.isWellKnownService = function () {
    return _.includes(['wfs', 'wms'], this.query.service);
};

exports.OnlineResource = OnlineResource;
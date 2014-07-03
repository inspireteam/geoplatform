var _ = require('lodash');

exports = module.exports = require('url');

var normalizeDefaultOptions = {
    supportedProtocols: { 'http:': true, 'https:': true },
    defaultProtocol: 'http:',
    removeKeys: {}
};

exports.normalize = function(location, options) {
    options = options || {};
    _.defaults(options, normalizeDefaultOptions);

    var l = location;

    // Protocol
    if (!l.protocol) l.protocol = options.defaultProtocol;
    if (!(l.protocol in options.supportedProtocols)) throw new Error('Protocol not supported.');

    // Query string
    if (l.query) {
        var normalizedQuery = {};
        _.forEach(l.query, function(value, key) {
            if (key.toLowerCase() in options.removeKeys) return;
            normalizedQuery[key.toLowerCase()] = value;
        });
        l.query = normalizedQuery;
    }

    return location;
};

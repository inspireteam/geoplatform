var csv = require('csv');
var fs = require('fs');
var path = require('path');

var organizations = {};

fs.createReadStream(path.join(__dirname, '..', '..', '..', 'data', 'organizations.csv'))
    .pipe(csv.parse({ columns: true, trim: true }))
    .on('data', function (entry) {

        if (entry.normalizedName && entry.normalizedName !== entry.originalName) {
            organizations[entry.originalName] = { rename: entry.normalizedName };
        }

        if (entry.actions.indexOf('reject') >= 0) {
            organizations[entry.originalName] = { reject: true };
        }

    });

module.exports = organizations;

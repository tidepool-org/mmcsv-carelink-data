var csvStream = require('csv-streamify');

exports.fetch = require('./fetch.js');

exports.parse = require('./parse.js');

exports.fromCsv = function(obs) {
  return obs
    .readline()
    .skip(17)
    .passThroughStream(csvStream({objectMode: true, columns: true, empty: null}))
    .apply(exports.parse);
}

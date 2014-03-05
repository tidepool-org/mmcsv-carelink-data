var fs = require('fs');

var expect = require('salinity').expect;
var rx = require('rx');

var carelink = require('../../lib/carelink');

describe('carelink/parse', function () {

  it('should parse as expected', function (done) {
    rx.Node.fromStream(fs.createReadStream(__dirname + '/input.csv'))
      .passThroughStream(require('csv-streamify')({objectMode: true, columns: true, empty: null}))
      .apply(carelink.parse)
      .toArray()
      .subscribe(
      function(e) {
        var expectation = JSON.parse(fs.readFileSync(__dirname + '/output.json'));
        expect(e).deep.equals(expectation);
        done();
      },
      function(err) {
        done(err);
      }
    );
  });
});

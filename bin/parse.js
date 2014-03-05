// Require this to get things registered with rx
require('../lib/rx');

var fs = require('fs');

var rx = require('rx');

var carelink = require('../lib/carelink');

var file = process.argv[2];

rx.Node.fromStream(fs.createReadStream(file))
  .apply(carelink.fromCsv)
  .take(5)
  .subscribe(
  function (e) {
    console.log('%j', e);
  },
  function (err) {
    console.log(err);
  });
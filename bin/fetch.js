var es = require('event-stream');
function fetch (opts) {
  var mmcsv = require('../');
  var out = es.through( );
  if (!opts.username || !opts.password || !opts.days) {
    if (!opts.username) {
      console.error('Missing --username');
    }
    if (!opts.password) {
      console.error('Missing --password');
    }
    if (isNaN(opts.days)) {
      console.error('Set --days to the number of days to fetch');
    }
    console.error(opts.help( ));
    process.exit(1);
  }
  opts.daysAgo = opts.days;
  if (opts.json) {
    out = es.pipeline(out, mmcsv.parse.all( ), es.stringify( ));
  }
  mmcsv.fetch(opts).pipe(out).pipe(process.stdout);
}
module.exports = fetch;

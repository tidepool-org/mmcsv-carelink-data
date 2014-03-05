#!/usr/bin/env node

var args = require('./args.js');
function main (opts) {
  require('./' + opts.command)(opts);
}

if (!module.parent) {
  var proc = process.argv.slice(2);
  var opts = args(proc);
  if (opts.command == 'help') opts.h = true;
  if (opts.command && !opts.h) {
    main(opts);
  } else {
    console.log(opts.help( ));
  }
}

'use strict';

var es    = require('event-stream')
  , mmcsv = require('./parse')
  , _     = require('lodash')
  ;

function recommended ( ) {
  var sink = [ ];
  function writer (json) {
    if (sink.length === 0 && json.type === 'wizard') {
      sink.push(json);
      return;
    }
    if (sink.length === 1 && json.type === 'bolus-normal') {
      return;
    }
  }
  return es.through(writer);
}

function dispatcher ( ) {
  var bolus = recommended( );
  function writer (json) {
    switch (json.type) {
      case 'carbs':
      case 'cbg':
      case 'smbg':
        this.queue(json);
        break;
      default:
        if ((/bolus-?|wizard/g).test(json.type)) {
        }
        break;
    }
  }
  return writer;
}

function config ( ) {
 var out = es.through(dispatcher( ));
 var stream = es.pipeline(mmcsv.all( ), out);
 return stream;
}

module.exports = config;

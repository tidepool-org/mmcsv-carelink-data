/*
 * == BSD2 LICENSE ==
 * Copyright (c) 2014, Tidepool Project
 * 
 * This program is free software; you can redistribute it and/or modify it under
 * the terms of the associated License, which is identical to the BSD 2-Clause
 * License as published by the Open Source Initiative at opensource.org.
 * 
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the License for more details.
 * 
 * You should have received a copy of the License along with this program; if
 * not, you can obtain one from Tidepool Project at tidepool.org.
 * == BSD2 LICENSE ==
 */

var csvStream = require('csv-streamify');

exports.fetch = require('./fetch.js');

exports.parse = require('./parse.js');

exports.fromCsv = function (observable) {
  return observable
    .readline()
    // A carelink has a preamble that we don't care about, skip until we see the beginning of the header
    .skipWhile(function (line) {
                 return line.indexOf('Index,Date,Time') !== 0;
               })
    .passThroughStream(csvStream({objectMode: true, columns: true, empty: null}))
    // TODO: pull the actual start time out of the preamble
    .apply(exports.parse(function(){ return { startTime: '2010-01-01' }}));
};
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

// Require this to get things registered with rx
require('../rx');

var _ = require('lodash');
var except = require('amoeba').except;
var moment = require('moment');

var bolusJoin = require('./bolusJoiner.js');
var wizardSettingsJoin = require('./settingsJoiner.js');
var eventParser = require('./eventParser.js');
var parsing = require('../parsing.js');

function compareFn(lhs, rhs) {
  if (lhs < rhs) {
    return -1;
  } else if ( lhs > rhs) {
    return 1;
  } else {
    return 0;
  }
}

function buildSortCompareFn(fieldExtractors) {
  return function(lhs, rhs) {
    var retVal = 0;
    for (var i = 0; i < fieldExtractors.length && retVal === 0; ++i) {
      retVal = compareFn(fieldExtractors[i](lhs), fieldExtractors[i](rhs));
    }
    return retVal;
  }
}

function omitNullFields(e) {
  return _.omit(e, function (element) { return element == null; });
}

function convertRawValues(e) {
  var RAW_VALUES = e['Raw-Values'];
  if (RAW_VALUES == null) {
    return e;
  }

  var rawVals = {};
  var keyValSplits = RAW_VALUES.split(',');
  for (var i = 0; i < keyValSplits.length; ++i) {
    var keyVal = keyValSplits[i].trim().split('=');
    if (keyVal.length !== 2) {
      throw except.ISE('keyVal didn\'t split on = well[%s], input was[%s]', keyValSplits[i], RAW_VALUES);
    }
    rawVals[keyVal[0]] = keyVal[1];
  }

  e['Raw-Values'] = rawVals;
  return e;
}

function addDeviceTime(e) {
  e.deviceTime = moment(e['Timestamp'], 'MM/DD/YYTHH:mm:ss').format('YYYY-MM-DDTHH:mm:ss');
  return e;
}

function addCompany(company) {
  return function (e) {
    e.company = company;
    return e;
  }
}

module.exports = function(observable){
  return observable
    // Carelink data flows based on a sequence id, not based on timestamp, so we re-sort
    .sort(buildSortCompareFn([parsing.extract('Raw-Upload ID'), parsing.asNumber('Raw-Seq Num')]))
    .map(omitNullFields)
    .map(convertRawValues)
    .map(addDeviceTime)
    .keep(eventParser)
    .apply(bolusJoin)
    .apply(wizardSettingsJoin)
    .map(addCompany('carelink'));
};
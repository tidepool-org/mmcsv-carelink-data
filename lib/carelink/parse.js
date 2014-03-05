// Require this to get things registered with rx
require('../rx/index.js');

var _ = require('lodash');
var except = require('amoeba').except;
var moment = require('moment');
var rx = require('rx');

var parsing = require('../parsing.js');

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

var extractionSpecs = {
  'BolusNormal': {
    type: 'bolus',
    subType: parsing.toLower('Bolus Type'),
    deviceTime: parsing.extract('deviceTime'),
    value: parsing.asNumber('Bolus Volume Delivered (U)'),
    programmed: parsing.asNumber('Bolus Volume Selected (U)'),
    uploadId: parsing.extract('Raw-Upload ID'),
    uploadSeqNum: parsing.asNumber('Raw-Seq Num'),
    deviceId: parsing.extract('Raw-Device Type')
  },
  'BolusSquare': {
    type: 'bolus',
    subType: parsing.toLower('Bolus Type'),
    deviceTime: parsing.extract('deviceTime'),
    value: parsing.asNumber('Bolus Volume Delivered (U)'),
    programmed: parsing.asNumber('Bolus Volume Selected (U)'),
    duration: parsing.asNumber(['Raw-Values', 'DURATION']),
    uploadId: parsing.extract('Raw-Upload ID'),
    uploadSeqNum: parsing.asNumber('Raw-Seq Num'),
    deviceId: parsing.extract('Raw-Device Type')
  },
  'BolusWizardBolusEstimate': {
    type: 'wizard',
    deviceTime: parsing.extract('deviceTime'),
    uploadId: parsing.extract('Raw-Upload ID'),
    uploadSeqNum: parsing.asNumber('Raw-Seq Num'),
    deviceId: parsing.extract('Raw-Device Type'),
    payload: {
      estimate: parsing.asNumber('BWZ Estimate (U)'),
      targetLow: parsing.asNumber('BWZ Target Low BG (mg/dL)'),
      targetHigh: parsing.asNumber('BWZ Target High BG (mg/dL)'),
      carbRatio: parsing.asNumber('BWZ Carb Ratio (grams)'),
      insulinSensitivity: parsing.asNumber('BWZ Insulin Sensitivity (mg/dL)'),
      carbInput: parsing.asNumber('BWZ Carb Input (grams)'),
      bgInput: parsing.asNumber('BWZ BG Input (mg/dL)'),
      correctionEstimate: parsing.asNumber('BWZ Correction Estimate (U)'),
      foodEstimate: parsing.asNumber('BWZ Food Estimate (U)'),
      activeInsulin: parsing.asNumber('BWZ Active Insulin (U)')
    }
  },
  'BasalProfileStart': {
    type: 'basal-rate-change',
    deliveryType: 'scheduled',
    deviceTime: parsing.extract('deviceTime'),
    scheduleName: parsing.extract(['Raw-Values', 'PATTERN_NAME']),
    value: parsing.asNumber(['Raw-Values', 'RATE']),
    deviceId: parsing.extract('Raw-Device Type')
  },
  'GlucoseSensorData': {
    type: 'cbg',
    deviceTime: parsing.extract('deviceTime'),
    value: parsing.asNumber('Sensor Glucose (mg/dL)'),
    deviceId: parsing.extract('Raw-Device Type')
  },
  'CalBGForPH': {
    type: 'smbg',
    deviceTime: parsing.extract('deviceTime'),
    value: parsing.asNumber('Sensor Calibration BG (mg/dL)'),
    deviceId: parsing.extract('Raw-Device Type')
  }
};

var parserBuilder = parsing.parserBuilder();
Object.keys(extractionSpecs).forEach(function(type) {
  parserBuilder.whenFieldIs('Raw-Type', type).applyConversion(extractionSpecs[type])
});
var messageParser = parserBuilder.build();

module.exports = function(observable){
  return observable
    .map(omitNullFields)
    .map(convertRawValues)
    .map(addDeviceTime)
    .keep(messageParser)
    .map(addCompany('carelink'));
};
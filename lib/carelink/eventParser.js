var parsing = require('../parsing.js');

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
      carbInput: parsing.asNumber(['Raw-Values', 'CARB_INPUT']),
      carbUnits: parsing.extract(['Raw-Values', 'CARB_UNITS']),
      bgInput: parsing.asNumber(['Raw-Values', 'BG_INPUT']),
      bgUnits: parsing.extract(['Raw-Values', 'BG_UNITS']),
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

module.exports = parserBuilder.build();


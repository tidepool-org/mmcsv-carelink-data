/*
 * == BSD2 LICENSE ==
 */

// Make sure rx stuff is registered
require('../rx');

var _ = require('lodash');
var except = require('amoeba').except;

var misc = require('./misc.js');

function bolusWizardSetupPredicate(setupType) {
  return function (e) {
    return e.type === 'settings' && e.subType === 'bolusWizardSetup' && e.phase === setupType;
  };
}

function makeListJoiner(setupPredicateFn, itemType) {
  return function (event) {
    if (!setupPredicateFn(event)) {
      return null;
    }

    var setup = null;
    var payload = [];
    return {
      handle: function (e) {
        // First event is always the one we started with
        if (setup == null) {
          setup = e;
          return null;
        }

        if (e.phase == null || e.phase !== itemType) {
          if (payload.length === setup.size) {
            // Done, emit stuff.
            return [
              _.assign(
                {},
                _.omit(setup, 'subType', 'phase', 'eventId', 'uploadId', 'uploadSeqNum', 'size'),
                { subType: itemType, payload: payload}
              ),
              e
            ];
          } else {
            throw except.ISE(
              'Expected %s event, got [%s,%s,%s], ts[%s]', itemType, e.type, e.subType, e.phase, e.deviceTime
            );
          }
        }

        if (e.setupId !== setup.eventId) {
          throw except.ISE('%s event for wrong setup[%s], expected[%s]', itemType, e.setupId, setup.eventId);
        }

        if (e.index !== payload.length) {
          throw except.ISE(
            '%s event out of order, index[%s], but [%s] stored, setupId[%s]',
            itemType, e.index, payload.length, e.setupId
          );
        }

        payload.push(e.payload);
        return null;
      },
      completed: function () {
        throw except.ISE('Incomplete %s event, ts[%s]', itemType, setup.deviceTime);
      }
    }
  }
}

function expectSettingsEvent(e) {
  if (e.type !== 'settings') {
    throw except.ISE('Bad event[%s], expected a settings event, ts[%s]', e.type, e.deviceTime);
  }
}

/**
 * Combines together the various chunks of bolus wizard settings objects into a bolus wizard settings
 * object.
 *
 * @param event an event
 * @returns {*} A handler that eventually returns a completed bolusWizardSettings object
 */
function scheduleBuilder(event) {
  if (!(event.type === 'settings' && event.subType === 'bolusWizardSetup' && event.phase === 'start')) {
    return null;
  }

  var currSettings = null;
  var expectedSubEvents = 3;
  return {
    handle: function (e) {
      expectSettingsEvent(e);

      switch (e.subType) {
        case 'carbRatio':
        case 'insulinSensitivity':
        case 'bgTarget':
          if (currSettings[e.subType] != null) {
            throw except.ISE('Attempt to override subType[%s], ts[%s]', e.subType, e.deviceTime);
          }
          currSettings[e.subType] = e.payload;
          --expectedSubEvents;
          if (expectedSubEvents === 0) {
            return [currSettings];
          } else {
            return null;
          }
        case 'bolusWizardSetup':
          // First event
          currSettings = _.assign(
            _.omit(e, 'uploadId', 'uploadSeqNum', 'phase'),
            {
              type: 'settings',
              subType: 'bolusWizard'
            }
          );

          if (e.eventId != null) {
            // Attach the eventId if it exists so that the lifecycle annotator can do its thing
            currSettings.eventId = e.eventId;
          }

          return null;
        default:
          throw except.ISE('Unknown subType[%s], ts[%s]', e.subType, e.deviceTime);
      }
    },
    completed: function () {
      throw except.ISE('Incomplete schedule events, ts[%s].', currSettings.deviceTime);
    }
  }
}

/**
 * Combines together bolusWizardSettings events with a `(bolusWizardSetup, complete)` event
 * to determine the stage of lifecycle that bolusWizardSettings object represents.
 *
 * "Stage of lifecycle" is either
 *
 * * "start" meaning that the object represents the start of a period of time where these
 * settings were in effect
 * * "end" meaning that the object represents the end of a period of time where these
 * settings were in effect
 *
 * @param event an event
 * @returns {*} a handler that annotates bolusWizardSettings objects with their lifecycle
 */
function scheduleLifecycleAnnotator(event) {
  if (! (event.type === 'settings' && event.subType === 'bolusWizard' && event.eventId != null)) {
    return null;
  }

  var settingsHolder = {};
  return {
    handle: function(e) {
      expectSettingsEvent(e);

      switch(e.subType) {
        case 'bolusWizard':
          settingsHolder[e.eventId] = _.omit(e, 'eventId');
          break;
        case 'bolusWizardSetup':
          settingsHolder[e.prevConfigId].lifecycle = 'end';
          settingsHolder[e.nextConfigId].lifecycle = 'start';
          return [settingsHolder[e.prevConfigId], settingsHolder[e.nextConfigId]];
          break;
        default:
          throw except.ISE('Unexpected settings object of subType[%s], ts[%s]', e.subType, e.deviceTime);
      }
    },
    completed: function() {
      throw except.ISE('Incomplete lifecycle annotator [%s]', Object.keys(settingsHolder));
    }
  };
}

module.exports = function (obs) {
  return obs.apply(misc.assertSortedByUploadIdAndSeqNum(
      function(e) {
        return e.type === 'settings';
      }
    )).selfJoin(
      [
        makeListJoiner(bolusWizardSetupPredicate('carbSetup'), 'carbRatio'),
        makeListJoiner(bolusWizardSetupPredicate('insulinSensitivitySetup'), 'insulinSensitivity'),
        makeListJoiner(bolusWizardSetupPredicate('bgTargetSetup'), 'bgTarget')
      ]
    )
    .selfJoin(scheduleBuilder)
    .selfJoin(scheduleLifecycleAnnotator)
    .selfJoin(makeListJoiner(
      function (e) {
        return e.type === 'settings' && e.subType === 'basalScheduleConfig' && e.phase === 'basalScheduleSetup'
      },
      'basalSchedule'
    ))
    // Now inject some schedules!
    .link(function (obs) {
            obs.onNext(
              {
                "_id": "settings123",
                "type": "settings",
                "deviceTime": "2014-02-15T12:00:00",
                "deviceId": "neverland",
                "activeBasalSchedule": "standard",
                "units": {
                  "carb": "grams",
                  "bg": "mg dL"
                },
                "basalSchedules": {
                  "standard": [
                    { "rate": 0.8, "start": 0 },
                    { "rate": 0.75, "start": 3600000 },
                    { "rate": 0.85, "start": 10800000 },
                    { "rate": 0.9, "start": 14400000 },
                    { "rate": 0.9, "start": 18000000 },
                    { "rate": 0.95, "start": 21600000 },
                    { "rate": 0.9, "start": 32400000 },
                    { "rate": 0.95, "start": 54000000 },
                    { "rate": 0.9, "start": 61200000 }
                  ],
                  "pattern a": [
                    { "rate": 0.95, "start": 0 },
                    { "rate": 0.9, "start": 3600000 },
                    { "rate": 1, "start": 10800000 },
                    { "rate": 1, "start": 14400000 },
                    { "rate": 1.1, "start": 18000000 },
                    { "rate": 1.15, "start": 21600000 },
                    { "rate": 1.05, "start": 32400000 },
                    { "rate": 1.1, "start": 54000000 },
                    { "rate": 1.05, "start": 61200000 }
                  ]
                },
                "carbRatio": [
                  { "amount": 12, "start": 0 },
                  { "amount": 10, "start": 21600000 },
                  { "amount": 12, "start": 32400000 },
                  { "amount": 12, "start": 61200000 },
                  { "amount": 12, "start": 81000000 }
                ],
                "insulinSensitivity": [
                  { "amount": 65, "start": 0 },
                  { "amount": 45, "start": 18000000 },
                  { "amount": 65, "start": 82800000 }
                ],
                "bgTarget": [
                  { "low": 100, "high": 120, "start": 0 },
                  { "low": 90, "high": 110, "start": 18000000 },
                  { "low": 100, "high": 120, "start": 82800000 }
                ]
              }
            );

            obs.onNext(
              {
                "_id": "settings1234",
                "type": "settings",
                "deviceTime": "2014-03-01T12:00:00",
                "deviceId": "neverland",
                "activeBasalSchedule": "pattern a",
                "units": {
                  "carb": "grams",
                  "bg": "mg dL"
                },
                "basalSchedules": {
                  "standard": [
                    { "rate": 0.8, "start": 0 },
                    { "rate": 0.75, "start": 3600000 },
                    { "rate": 0.85, "start": 10800000 },
                    { "rate": 0.9, "start": 14400000 },
                    { "rate": 0.9, "start": 18000000 },
                    { "rate": 0.95, "start": 21600000 },
                    { "rate": 0.9, "start": 32400000 },
                    { "rate": 0.95, "start": 54000000 },
                    { "rate": 0.9, "start": 61200000 }
                  ],
                  "pattern a": [
                    { "rate": 0.95, "start": 0 },
                    { "rate": 0.9, "start": 3600000 },
                    { "rate": 1, "start": 10800000 },
                    { "rate": 1, "start": 14400000 },
                    { "rate": 1.1, "start": 18000000 },
                    { "rate": 1.15, "start": 21600000 },
                    { "rate": 1.05, "start": 32400000 },
                    { "rate": 1.1, "start": 54000000 },
                    { "rate": 1.05, "start": 61200000 }
                  ]
                },
                "carbRatio": [
                  { "amount": 12, "start": 0 },
                  { "amount": 10, "start": 21600000 },
                  { "amount": 12, "start": 32400000 },
                  { "amount": 12, "start": 61200000 },
                  { "amount": 12, "start": 81000000 }
                ],
                "insulinSensitivity": [
                  { "amount": 65, "start": 0 },
                  { "amount": 45, "start": 18000000 },
                  { "amount": 65, "start": 82800000 }
                ],
                "bgTarget": [
                  { "low": 100, "high": 120, "start": 0 },
                  { "low": 90, "high": 110, "start": 18000000 },
                  { "low": 100, "high": 120, "start": 82800000 }
                ]
              }
            );

            return obs;
          });
};
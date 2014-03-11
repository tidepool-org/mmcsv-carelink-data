/*
 * == BSD2 LICENSE ==
 */

// Make sure rx stuff is registered
require('../rx');

var _ = require('lodash');
var except = require('amoeba').except;

var misc = require('./misc.js');
var parsing = require('../parsing.js');

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
function wizardSettingsBuilder(event) {
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

function scheduleBuilder(event) {
  return null;
}

/**
 * Generating full-fledged settings objects is a tricky proposition.
 *
 * Carelink provides data in individual events.  When settings are changed, the changes get dumped out as
 * events.  We need to combine those events together into more complex "basal schedule" and "bolus wizard
 * settings" objects.
 *
 * Some of these objects are created at the "end" of the effectiveness of the setting and other events
 * are created at the "start" of the effectiveness.  We need to keep track of this semantic difference
 * in order to build up as good of an indication of the actual schedule as possible.  That is, there are
 * times where we only get the "end" event and we want to interpolate those settings as far back as
 * possible.  So, we annotate all of these events with a "lifecycle" field indicating the semantics of
 * what it represents.
 *
 * Once we have all the events aggregated up into their complex object counterparts, and we have it all
 * annotated for its lifecycle semantics, we then re-sort those datums according to their timestamp
 * and start walking them backwards in order to combine all of the data together into full-fledged
 * "settings" objects.
 */
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
    .selfJoin(wizardSettingsBuilder)
    .selfJoin(scheduleLifecycleAnnotator)
    .selfJoin(makeListJoiner(
      function (e) {
        return e.type === 'settings' && e.subType === 'basalScheduleConfig' && e.phase === 'basalScheduleSetup'
      },
      'basalSchedule'
    ))
  // re-sort by timestamp decreasing in order to walk the settings backwards
    .sort(
      misc.invertSort(
        misc.buildSortCompareFn([parsing.extract('deviceTime')])
      )
    )
    .selfJoin(scheduleBuilder);
};
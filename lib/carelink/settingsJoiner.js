/*
 * == BSD2 LICENSE ==
 */

// Make sure rx stuff is registered
require('../rx');

var _ = require('lodash');
var except = require('amoeba').except;

function bolusWizardSetupPred(setupType) {
  return function (e) {
    return e.type === 'settings' && e.subType === 'bolusWizardSetupPred' && e.phase === setupType;
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
                _.omit(setup, 'subType', 'phase', 'eventId', 'size'),
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

function scheduleBuilder(event) {
  if (!(event.type === 'settings' && event.subType === 'bolusWizardSetupPred' && event.phase === 'start')) {
    return null;
  }

  var settingsHolder = {};
  var currSettings = null;

  function setupNewSettings(e) {
    currSettings = {
      type: 'settings',
      subType: 'bolusWizard',
      deviceTime: e.deviceTime,
      units: {
        carb: e.carbUnits,
        bg: e.bgUnits
      }
    };
    settingsHolder[e.eventId] = currSettings;
  }

  return {
    handle: function (e) {
      if (e.type !== 'settings') {
        throw except.ISE('Bad event[%s], expected a setting event, ts[%s]', e.type, e.deviceTime);
      }

      switch (e.subType) {
        case 'carbRatio':
        case 'insulinSensitivity':
        case 'bgTarget':
          currSettings[e.subType] = e.payload;
          return null;
        case 'bolusWizardSetupPred':
          switch (e.phase) {
            case 'start':
              setupNewSettings(e);
              return null;
            case 'complete':
              settingsHolder[e.prevConfigId].phase = 'end';
              settingsHolder[e.nextConfigId].phase = 'start';
              return [settingsHolder[e.prevConfigId], settingsHolder[e.nextConfigId]];
            default:
              throw except.ISE('Unknown phase[%s], ts[%s]', e.phase, e.deviceTime);
          }
        default:
          throw except.ISE('Unknown subType[%s], ts[%s]', e.subType, e.deviceTime);
      }
    },
    completed: function () {
      throw except.ISE('Incomplete schedule events [%s].', Object.keys(settingsHolder));
    }
  }
}

module.exports = function (obs) {
  return obs.selfJoin(
      [
        makeListJoiner(bolusWizardSetupPred('carbSetup'), 'carbRatio'),
        makeListJoiner(bolusWizardSetupPred('insulinSensitivitySetup'), 'insulinSensitivity'),
        makeListJoiner(bolusWizardSetupPred('bgTargetSetup'), 'bgTarget')
      ]
    ).selfJoin(scheduleBuilder)
    .selfJoin(makeListJoiner(
      function(e) {
        return e.type === 'settings' && e.subType === 'basalScheduleConfig' && e.phase === 'basalScheduleSetup'
      },
      'basalSchedule'
    ));
};
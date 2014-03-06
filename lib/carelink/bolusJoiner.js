// Ensure rx extensions are loaded
require('../rx');

var crypto = require('crypto');

var _ = require('lodash');
var amoeba = require('amoeba');
var base32hex = amoeba.base32hex;

function notNull(item) {
  return item != null;
}

var EVENT_BUFFER_LIMIT = 100;
function handlerWithLimitedEventBuffer(handler) {
  var eventBuffer = [];
  return {
    handle: function (e) {
      var retVal = handler.handle(e);
      if (Array.isArray(retVal)) {
        return retVal.concat(eventBuffer);
      }

      if (retVal === 'buffer') {
        eventBuffer.push(e);
        if (eventBuffer.length > EVENT_BUFFER_LIMIT) {
          return handler.completed().concat(eventBuffer);
        }
      }
      return null;
    },
    completed: function () {
      return handler.completed().concat(eventBuffer);
    }
  };
}


function isMatchingPair(first, second) {
  if (first == null || second == null) {
    return false;
  }

  var retVal = first.uploadId === second.uploadId;
  retVal = retVal && first.deviceId === second.deviceId;
  retVal = retVal && (first.uploadSeqNum + 1) === second.uploadSeqNum;
  return retVal;
}

function finalizeWithJoinKey(obj, joinKey) {
  if (joinKey == null) {
    var hasher = crypto.createHash('sha1');
    hasher.update(obj.uploadId);
    hasher.update(String(obj.uploadSeqNum));
    hasher.update(obj.deviceId);
    joinKey = base32hex.encodeBuffer(hasher.digest(), { paddingChar: '-' });
  }

  return _.assign({}, _.omit(obj, 'uploadId', 'uploadSeqNum'), { joinKey: joinKey });
}

function handleWizardFirst(event) {
  if (event.type !== 'wizard') {
    return null;
  }

  if (event.joinKey != null) {
    return null;
  }

  var wizard = null;
  // The strategy with a wizard first is to wait until we see a bolus event and then re-emit with the bolus event first
  return handlerWithLimitedEventBuffer(
    {
      handle: function (e) {
        // First event will always be the one we started with, capture it.
        if (wizard == null) {
          wizard = e;
          return null;
        } else if (e.type === 'bolus') {
          return [e, wizard];
        } else {
          return 'buffer';
        }
      },
      completed: function () {
        return [finalizeWithJoinKey(wizard)];
      }
    });
}

function handleSingleBolusFirst(event) {
  if (!(event.type === 'bolus' && (event.subType === 'normal' || event.subType === 'square'))) {
    return null;
  }

  if (event.joinKey != null) {
    return null;
  }

  var bolus = null;
  return handlerWithLimitedEventBuffer(
    {
      handle: function (e) {
        // First event will always be the one we started with, capture it.
        if (bolus == null) {
          bolus = e;
          return null;
        } else if (e.type === 'wizard' && isMatchingPair(bolus, e)) {
          var finalNormal = finalizeWithJoinKey(bolus);
          return [finalNormal, finalizeWithJoinKey(e, finalNormal.joinKey)];
        } else {
          return 'buffer';
        }
      },
      completed: function () {
        return [finalizeWithJoinKey(bolus)];
      }
    });
}

function handleDualSquareFirst(event) {
  if (!(event.type === 'bolus' && event.subType === 'dual/square')) {
    return null;
  }

  if (event.joinKey != null) {
    return null;
  }

  var square = null;
  var wizard = null;
  // Strategy here is generally to re-order just like if we get a wizard first.
  // However, it is possible for a wizard and dual/square to exist without a dual/normal.
  // In that case, we fabricate a dual/normal with a value of 0.
  return handlerWithLimitedEventBuffer(
    {
      handle: function (e) {
        // First event will always be the one we started with, capture it.
        if (square == null) {
          square = e;
          return null;
        } else if (e.type === 'bolus' && e.subType === 'dual/normal') {
          return [e, square, wizard].filter(notNull);
        } else if (e.type === 'wizard' && isMatchingPair(square, e)) {
          wizard = e;
          return null;
        } else {
          return 'buffer';
        }
      },
      completed: function () {
        if (wizard == null) {
          return [finalizeWithJoinKey(square)];
        } else {
          var finalSquare = finalizeWithJoinKey(square);
          return [
            _.assign({}, finalSquare, { subType: 'dual/normal', value: 0 }),
            finalSquare,
            finalizeWithJoinKey(wizard, finalSquare.joinKey)
          ];
        }
      }
    });
}

function handleDualNormalFirst(event) {
  if (!(event.type === 'bolus' && event.subType === 'dual/normal')) {
    return null;
  }

  if (event.joinKey != null) {
    return null;
  }

  var normal = null;
  var square = null;
  var wizardBuffered = false;
  return handlerWithLimitedEventBuffer(
    {
      handle: function (e) {
        if (normal == null) {
          normal = e;
          return null;
        } else if (e.type === 'bolus' && e.subType === 'dual/square' && isMatchingPair(normal, e)) {
          square = e;
          if (wizardBuffered) {
            // Re-emit with normal and square first
            return [normal, square];
          } else {
            return null;
          }
        } else if (e.type === 'wizard') {
          if (square == null) {
            // We got a wizard before the square. Buffer the wizard object so that we can re-order
            // the events with the square first and re-emit
            wizardBuffered = true;
            return 'buffer';
          } else if (isMatchingPair(square, e)) {
            var finalNormal = finalizeWithJoinKey(normal);
            var joinKey = finalNormal.joinKey;
            return [finalNormal, finalizeWithJoinKey(square, joinKey), finalizeWithJoinKey(e, joinKey)];
          }
        } else {
          return 'buffer';
        }
      },
      completed: function () {
        var finalNormal = finalizeWithJoinKey(normal);
        if (square == null) {
          return [finalNormal]
        } else {
          return [finalNormal, finalizeWithJoinKey(square, finalNormal.joinKey)];
        }
      }
    });
}


/*
 * This attempts to correlate bolus and bolus wizard events.  It's not an exact science, unfortunately.
 *
 * The various bolus events are not guaranteed to happen in any specific chronological order.  They do,
 * however, appear to happen in "sequence" order.  This means that if we assume that the data is
 * sorted in `(uploadId, uploadSeqNum)` order, then we will see the events in a semi-deterministic order
 *
 * Thus, we first ensure that we are looking at the data in the correct sort order and then do a selfJoin
 * on the stream.  The selfJoin has a number of handlers, each of them charged with handling the case that
 * a certain type of event is seen first.
 */
module.exports = function (obs) {
  var maxUploadId = '';
  var maxSeqNum = -1;

  return obs
    // Assert the expected sort order, uploadId -> seqNum
    .map(function (e) {
           if (e.uploadId > maxUploadId) {
             maxUploadId = e.uploadId;
             maxSeqNum = -1;
           }

           if (e.uploadId !== maxUploadId || e.uploadSeqNum <= maxSeqNum) {
             throw except.ISE(
               'Unsorted input. (uploadId,seqNum)[%s,%s] < [%s,%s]',
               e.uploadId, e.uploadSeqNum, maxUploadId, maxSeqNum
             );
           }

           maxSeqNum = e.uploadSeqNum;
           return e;
         })
    .selfJoin(
      [
        handleWizardFirst,
        handleSingleBolusFirst,
        handleDualSquareFirst,
        handleDualNormalFirst
      ]
    );
};
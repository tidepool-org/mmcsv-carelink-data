/**
 * Builds a function that can be applied to an observable to assert that messages
 * which meet the given predicate are ordered by uploadId -> seqNum
 *
 * @param predicateFn predicate to determine if the event is one that should be sorted
 * @returns {Function} a function that can be `apply()`d to an observable to assert the ordering
 */
exports.assertSortedByUploadIdAndSeqNum = function(predicateFn) {
  return function(obs) {
    var maxUploadId = '';
    var maxSeqNum = -1;

    return obs.map(function (e) {
      if (! predicateFn(e)) {
        return e;
      }

      if (e.uploadId == null || e.uploadSeqNum == null) {
        throw except.ISE(
          '%s message without uploadId[%s] or uploadSeqNum[%s]!? WTF',
          e.type, e.uploadId, e.uploadSeqNum
        );
        return e;
      }

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
    });
  }

};


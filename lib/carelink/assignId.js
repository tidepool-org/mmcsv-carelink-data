var crypto = require('crypto');

var amoeba = require('amoeba');
var except = amoeba.except;
var base32hex = amoeba.base32hex;

function hashVals(vals) {
  var hasher = crypto.createHash('sha1');
  for (var i = 0; i < vals.length; ++i) {
    hasher.update(String(vals[i]));
  }
  return base32hex.encodeBuffer(hasher.digest());
}

function buildHasher() {
  var getters = Array.prototype.slice.call(arguments, 0).map(function(field){
    return function(e) {
      return e[field];
    }
  });

  return function(e) {
    return hashVals(getters.map(function(getter){
      var retVal = getter(e);
      if (retVal == null) {
        throw except.ISE('Unable to make id for event type[%s]', e.type);
      }
      return  retVal;
    }));
  }
}

var idifiers = {
  'basal-rate-change': buildHasher('type', 'deliveryType', 'deviceId', 'deviceTime'),
  bolus: buildHasher('type', 'subType', 'deviceId', 'deviceTime'),
  wizard: buildHasher('type', 'deviceId', 'deviceTime'),
  cbg: buildHasher('type', 'deviceId', 'deviceTime'),
  smbg: buildHasher('type', 'deviceId', 'deviceTime'),
  settings: buildHasher('type', 'deviceId', 'deviceTime')
};

module.exports = function(obs) {
  return obs.map(
    function(e) {
      var handler = idifiers[e.type];
      if (handler == null) {
        throw except.ISE('Unknown event type[%s] for idification. ts[%s]', e.type, e.deviceTime);
      }
      e['_id'] = handler(e);
      return e;
    }
  )
}
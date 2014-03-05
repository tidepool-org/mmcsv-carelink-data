var _ = require('lodash');
var except = require('amoeba').except;

exports.extract = function(field) {
  if (Array.isArray(field)) {
    return function(e) {
      var retVal = e;
      for (var i = 0; i < field.length; ++i) {
        retVal = retVal[field[i]];
      }
      return retVal;
    }
  }

  return function(e) {
    return e[field];
  }
};

function defaultFieldFn(fieldFn) {
  if (typeof fieldFn === 'function') {
    return fieldFn;
  }
  return exports.extract(fieldFn);
}

exports.asNumber = function(fieldFn) {
  fieldFn = defaultFieldFn(fieldFn);

  return function(e) {
    var extractedValue = fieldFn(e);
    var retVal = Number(extractedValue);
    if (retVal == null || Number.isNaN(retVal)) {
      throw except.ISE('Expected [%s] to be a number, it was not.', extractedValue);
    }
    return  retVal;
  };
};

exports.toLower = function(fieldFn) {
  fieldFn = defaultFieldFn(fieldFn);

  return function(e) {
    var val = fieldFn(e);
    return val == null ? null : val.toLowerCase();
  }
};

function buildParserSpecs(spec) {
  var valueType = typeof(spec);

  if (valueType === 'string') {
    return function() {
      return spec;
    }
  } else if (Array.isArray(spec)) {
    return _.compose.apply(_, spec.map(buildParserSpecs).reverse());
  } else if (valueType === 'object') {
    var fns = [];

    Object.keys(spec).forEach(function(key){
      var subFn = buildParserSpecs(spec[key]);
      fns.push(function(obj, event) {
        obj[key] = subFn(event);
      });
    });

    return function(e){
      var retVal = {};
      fns.forEach(function(fn) {
        fn(retVal, e);
      });
      return retVal;
    }
  } else if (valueType === 'function') {
    return spec;
  }
  throw except.ISE('Unknown type[%s]', valueType);
}

exports.parserBuilder = function() {
  var rules = [];

  return {
    when: function(predicate) {
      var handler = {
        pred: predicate
      };
      rules.push(handler);

      return {
        apply: function(parserFn) {
          if (handler.parserFn == null) {
            handler.parserFn = parserFn;
          } else {
            handler.parserFn = _.compose(parserFn, handler.parserFn);
          }
          return this;
        },
        applyConversion: function(spec) {
          return this.apply(buildParserSpecs(spec));
        }
      }
    },
    whenFieldIs: function(field, value) {
      return this.when(function(e){
        return e[field] === value;
      });
    },
    build: function() {
      return function(e) {
        for (var i = 0; i < rules.length; ++i) {
          var rule = rules[i];
          if (rule.pred(e)) {
            return rule.parserFn(e);
          }
        }
        return null;
      }
    }
  };
};
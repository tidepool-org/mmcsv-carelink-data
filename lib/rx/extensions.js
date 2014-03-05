var rx = require('rx');

rx.Observable.prototype.link = function (fn) {
  var inputObservable = this;
  return rx.Observable.create(function (outputObserverable) {
    inputObservable.subscribe(fn(outputObserverable));
  });
};

rx.Observable.prototype.apply = function(fn) {
  return fn(this);
}

rx.Observable.prototype.passThroughStream = function(stream) {
  var inputObs = this;
  return rx.Observable.create(function (outputObs) {
    var writer = rx.Node.writeToStream(inputObs, stream);

    var currOutputErr = outputObs.onError.bind(outputObs);
    outputObs.onError = function(err) {
      writer.dispose();
      currOutputErr(err);
    }

    rx.Node.fromStream(stream).subscribe(outputObs);
  });
}

rx.Observable.prototype.readline = function () {
  var bufferedString = '';
  return this.link(function (outputObs) {
    return rx.Observer.create(
      function (e) {
        bufferedString += e;
        var splits = bufferedString.split('\n');
        for (var i = 0; i < splits.length - 1; ++i) {
          outputObs.onNext(splits[i] + '\n');
        }
        bufferedString = splits[splits.length - 1];
      },
      function (err) {
        outputObs.onError(err);
      },
      function () {
        outputObs.onNext(bufferedString);
        outputObs.onCompleted();
      }
    )
  });
};

rx.Observable.prototype.keep = function(fn) {
  return this.map(fn).filter(function(e){ return e != null; })
};

exports.required = true;
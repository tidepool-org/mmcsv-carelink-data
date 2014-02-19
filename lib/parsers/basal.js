
module.exports = function configure (utils) {
  function parse (row, callback) {

    var detail = utils.select(row, 'Raw-Values');
    if (!detail) {
      return callback( );
    }

    detail = detail.split(',');

    var data = {
      basal: detail[2].split('=')[1],
      basal_type: detail[0].split('=')[1],
      value: detail[2].split('=')[1],
      type: 'basal',
      start: detail[3].split('=')[1],
      deviceTime: utils.reformatISO(utils.select(row, 'Timestamp'))
    };
    return callback(null, data);
  }

  function isValid (data) {
    return (!isNaN(data.basal)
      && data.basal != ""
      && !isNaN(data.value)
      && data.value != ""
      && data.start
      && data.basal_type
      && data.type == 'basal'
      );
  }

  var pattern = /BasalProfileStart/g;
  var stream = utils.pipeline(utils.split( ), utils.map(parse), utils.validator(isValid));
  var parser = { pattern: pattern, stream: stream, parse: parse };
  return parser;
}


var fixture = {
  name: 'bolus'
, parser: 'bolus'
, schema: 'bolus'
, input: '124,10/5/13,20:17:54,10/5/13 20:17:54,,,,,,,Normal,5.4,5.4,,,,,,,,,,,,,,,,,,,,,BolusNormal,"AMOUNT=5.4, CONCENTRATION=null, PROGRAMMED_AMOUNT=5.4, ACTION_REQUESTOR=paradigm link or b key, ENABLE=true, IS_DUAL_COMPONENT=false, UNABSORBED_INSULIN_TOTAL=1",11528764588,AABBCCDD,191,Paradigm Revel - 523'
, proof: function proof (err, results) {
    var result = results.pop( );
    // console.log(result);
    result.errors.should.be.empty;
  }
};
module.exports = fixture;

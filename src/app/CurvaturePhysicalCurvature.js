/* Physical-only, logarithmic radius control with a REAL k=0 endpoint.
 * The existing showModel/rEarth state remains the sole persistence format:
 * Globe has k=1/rEarth; Flat has k=0 and retains the finite radius value.
 */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvaturePhysicalCurvature=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var MIN_RADIUS=100000,MAX_RADIUS=1e16,MAX_STEP=1000,EARTH_RADIUS=6371000;
  function radiusToStep(radius){
    if(!Number.isFinite(radius)||radius<=0)throw RangeError('Invalid radius');
    var x=(Math.log10(radius)-Math.log10(MIN_RADIUS)) /
      (Math.log10(MAX_RADIUS)-Math.log10(MIN_RADIUS));
    return Math.round(Math.max(0,Math.min(1,x))*(MAX_STEP-1));
  }
  function stepToGeometry(step){
    step=Number(step);
    if(!Number.isInteger(step)||step<0||step>MAX_STEP)throw RangeError('Invalid curvature step');
    if(step===MAX_STEP)return {showModel:2,curvature:0,radius:Infinity};
    var r=MIN_RADIUS*Math.pow(MAX_RADIUS/MIN_RADIUS,step/(MAX_STEP-1));
    return {showModel:1,curvature:1/r,radius:r};
  }
  function modelStep(model){
    if(!model||![1,2].includes(model.showModel))return null;
    return model.showModel===2?MAX_STEP:radiusToStep(model.rEarth);
  }
  function applyStep(model,step){
    var p=stepToGeometry(step);
    model.showModel=p.showModel;
    if(p.showModel===1)model.rEarth=p.radius;
    return p;
  }
  function resetEarth(model){model.showModel=1;model.rEarth=EARTH_RADIUS;}
  function label(model){
    if(model.showModel===2)return 'Flat (exact curvature = 0)';
    var r=model.rEarth;
    if(!Number.isFinite(r)||r<=0)return 'Invalid radius';
    return 'R = '+(r/1000).toLocaleString('en-US',{maximumSignificantDigits:7})+' km; curvature = '+(1/r).toExponential(4)+' 1/m';
  }
  return Object.freeze({MIN_RADIUS:MIN_RADIUS,MAX_RADIUS:MAX_RADIUS,MAX_STEP:MAX_STEP,
    EARTH_RADIUS:EARTH_RADIUS,radiusToStep:radiusToStep,stepToGeometry:stepToGeometry,
    modelStep:modelStep,applyStep:applyStep,resetEarth:resetEarth,label:label});
}));

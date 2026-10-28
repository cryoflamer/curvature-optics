/* Patch 132 baseline A/B comparison. The default pair stays current-vs-flat.
 * Patch 133 reuses clone() and the shared camera/object invariant for
 * independently configured physics, with no duplicate optical implementation.
 * No Legacy DOM, renderer, or global model state is accessed here.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernCompareModel132=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function clone(source){
    if(!source||typeof source.Update!=='function')throw TypeError('A physical CurveAppClass is required');
    var copy=Object.create(Object.getPrototypeOf(source));
    Object.keys(source).forEach(function(key){
      var value=source[key];
      copy[key]=Array.isArray(value)?value.slice():value;
    });
    return copy;
  }
  function pair(source){
    var a=clone(source),b=clone(source);
    // Compare must never silently aim at two different curvature-dependent horizons.
    a.viewcenterHorizon=3;
    b.viewcenterHorizon=3;
    b.showModel=2; // Exact κ = 0, not an approximating huge radius.
    a.Update();b.Update();
    return {A:a,B:b};
  }
  function invariant(pairResult){
    var a=pairResult.A,b=pairResult.B;
    var fields=['Height','FocalLengthField','Pan','Nick','Roll','deviceRatio',
      'viewcenterHorizon','camViewAngle','showGrid'];
    var groups=['NObjects','ObjType','ObjDist','ObjDeltaDist','ObjSideType',
      'ObjSidePos','ObjSideVar','ObjSizeType','ObjSize','ObjSizeVar'];
    return fields.every(function(key){return a[key]===b[key];})&&
      groups.every(function(key){return JSON.stringify(a[key])===JSON.stringify(b[key]);});
  }
  return Object.freeze({pair:pair,clone:clone,invariant:invariant});
}));

/* Deterministic camera pose interpolation. No DOM, rendering, or wall-clock state.
 * The saved Modern camera coordinates are local East/North and height above surface.
 * Geodesic paths and fly-through splines are intentionally out of scope.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernCameraInterpolator=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var NUMERIC=['CameraEast','CameraNorth','Height','Pan','Nick','Roll','FocalLengthField'];
  var DISCRETE=['viewcenterHorizon','deviceRatio'];
  var LIMITS={CameraEast:[-1e7,1e7],CameraNorth:[-1e7,1e7],Height:[.001,1e9],
    Pan:[-360,360],Nick:[-90,90],Roll:[-180,180],FocalLengthField:[1,100000]};
  function validPose(pose){
    if(!pose||typeof pose!=='object')throw RangeError('Invalid camera pose');
    NUMERIC.forEach(function(key){
      var v=pose[key],range=LIMITS[key];
      if(typeof v!=='number'||!Number.isFinite(v)||v<range[0]||v>range[1])
        throw RangeError('Invalid camera '+key);
    });
    if(!Number.isInteger(pose.viewcenterHorizon)||pose.viewcenterHorizon<0||pose.viewcenterHorizon>3)
      throw RangeError('Invalid camera aim mode');
    if(![1.5,2/3,16/9,9/16].some(function(v){return Math.abs(v-pose.deviceRatio)<1e-8;}))
      throw RangeError('Invalid camera aspect ratio');
    return pose;
  }
  function easing(u,mode){
    if(mode==='linear')return u;
    if(mode==='smoothstep')return u*u*(3-2*u);
    throw RangeError('Unsupported camera easing');
  }
  function shortestAngle(a,b){return ((b-a+540)%360)-180;}
  function clamp(v,range){return Math.max(range[0],Math.min(range[1],v));}
  function interpolate(start,end,progress,mode){
    validPose(start);validPose(end);
    if(!Number.isFinite(progress)||progress<0||progress>1)throw RangeError('Invalid camera progress');
    var u=easing(progress,mode||'smoothstep');
    if(progress===0)return Object.freeze(Object.assign({},start));
    if(progress===1)return Object.freeze(Object.assign({},end));
    if(start.deviceRatio!==end.deviceRatio||start.viewcenterHorizon!==end.viewcenterHorizon)
      throw RangeError('Camera aim mode and aspect ratio must remain fixed during a transition');
    var result={};
    ['CameraEast','CameraNorth','Height','Nick'].forEach(function(key){
      result[key]=clamp(start[key]+(end[key]-start[key])*u,LIMITS[key]);
    });
    ['Pan','Roll'].forEach(function(key){
      var v=start[key]+shortestAngle(start[key],end[key])*u;
      // Normalize only when the shortest path leaves the Modern allowed interval.
      if(v>LIMITS[key][1])v-=360;
      if(v<LIMITS[key][0])v+=360;
      result[key]=clamp(v,LIMITS[key]);
    });
    result.FocalLengthField=Math.exp(Math.log(start.FocalLengthField)*(1-u)+Math.log(end.FocalLengthField)*u);
    DISCRETE.forEach(function(key){result[key]=start[key];});
    return Object.freeze(result);
  }
  function cameraAt(start,end,timeMs,durationMs,mode){
    if(!Number.isFinite(durationMs)||durationMs<=0||!Number.isFinite(timeMs))
      throw RangeError('Invalid camera transition time');
    return interpolate(start,end,Math.max(0,Math.min(1,timeMs/durationMs)),mode);
  }
  return Object.freeze({interpolate:interpolate,cameraAt:cameraAt,shortestAngle:shortestAngle});
}));

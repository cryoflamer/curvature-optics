/* Deterministic camera pose interpolation. No DOM, rendering, or wall-clock state.
 * The saved Modern camera coordinates are local East/North and height above surface.
 * Geographic paths are out of scope; spline interpolation operates in the
 * existing local East/North/height coordinates.
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
  // Shape-preserving cubic Hermite slope (PCHIP). The harmonic mean avoids
  // overshoot even with unequal transition durations, and zero at a turn
  // keeps each numeric camera channel within its neighbouring keyframes.
  function interiorSlope(previousDuration,nextDuration,previousSlope,nextSlope){
    if(previousSlope===0||nextSlope===0||Math.sign(previousSlope)!==Math.sign(nextSlope))return 0;
    var left=2*nextDuration+previousDuration;
    var right=nextDuration+2*previousDuration;
    return (left+right)/(left/previousSlope+right/nextSlope);
  }
  function hermite(a,b,leftSlope,rightSlope,duration,u){
    var u2=u*u,u3=u2*u;
    var value=(2*u3-3*u2+1)*a+(u3-2*u2+u)*duration*leftSlope+
      (-2*u3+3*u2)*b+(u3-u2)*duration*rightSlope;
    // Floating-point roundoff must not leak beyond either end value.
    return Math.max(Math.min(a,b),Math.min(Math.max(a,b),value));
  }
  function wrapWithin(value,range){
    while(value>range[1])value-=360;
    while(value<range[0])value+=360;
    return clamp(value,range);
  }
  // `frames` has the Animation Project keyframe shape: each frame owns a
  // camera `value`, its inbound `travelMs`, and its subsequent `holdMs`.
  // This is intentionally independent of per-transition easing: composing a
  // smoothstep with the spline would force zero speed at every keyframe.
  function interpolateSpline(frames,segmentIndex,progress){
    if(!Array.isArray(frames)||frames.length<2||!Number.isInteger(segmentIndex)||
      segmentIndex<1||segmentIndex>=frames.length||!Number.isFinite(progress)||
      progress<0||progress>1)throw RangeError('Invalid camera spline segment');
    var startIndex=segmentIndex-1,endIndex=segmentIndex;
    var start=frames[startIndex],end=frames[endIndex];
    if(!start||!end||!Number.isFinite(end.travelMs)||end.travelMs<=0)
      throw RangeError('Invalid camera spline duration');
    validPose(start.value);validPose(end.value);
    if(start.value.deviceRatio!==end.value.deviceRatio||
      start.value.viewcenterHorizon!==end.value.viewcenterHorizon)
      throw RangeError('Camera aim mode and aspect ratio must remain fixed during a transition');
    if(progress===0)return Object.freeze(Object.assign({},start.value));
    if(progress===1)return Object.freeze(Object.assign({},end.value));
    var before=startIndex>0&&start.holdMs===0?frames[startIndex-1]:null;
    var after=endIndex<frames.length-1&&end.holdMs===0?frames[endIndex+1]:null;
    if(before){
      validPose(before.value);
      if(!Number.isFinite(start.travelMs)||start.travelMs<=0)
        throw RangeError('Invalid camera spline duration');
    }
    if(after){
      validPose(after.value);
      if(!Number.isFinite(after.travelMs)||after.travelMs<=0)
        throw RangeError('Invalid camera spline duration');
    }
    var result={},duration=end.travelMs;
    NUMERIC.forEach(function(key){
      var angle=key==='Pan'||key==='Roll',logScale=key==='FocalLengthField';
      function scalar(frame){
        var v=frames[frame].value[key];
        return logScale?Math.log(v):v;
      }
      var a=scalar(startIndex),b=angle?a+shortestAngle(a,scalar(endIndex)):
        scalar(endIndex);
      var secant=(b-a)/duration;
      var slopeA=0,slopeB=0;
      if(before){
        var previousDuration=start.travelMs;
        var prev=angle?a-shortestAngle(before.value[key],start.value[key]):
          scalar(startIndex-1);
        slopeA=interiorSlope(previousDuration,duration,(a-prev)/previousDuration,secant);
      }
      if(after){
        var nextDuration=after.travelMs;
        var next=angle?b+shortestAngle(end.value[key],after.value[key]):
          scalar(endIndex+1);
        slopeB=interiorSlope(duration,nextDuration,secant,(next-b)/nextDuration);
      }
      var value=hermite(a,b,slopeA,slopeB,duration,progress);
      if(logScale)value=Math.exp(value);
      result[key]=angle?wrapWithin(value,LIMITS[key]):clamp(value,LIMITS[key]);
    });
    DISCRETE.forEach(function(key){result[key]=start.value[key];});
    return Object.freeze(result);
  }
  function cameraAt(start,end,timeMs,durationMs,mode){
    if(!Number.isFinite(durationMs)||durationMs<=0||!Number.isFinite(timeMs))
      throw RangeError('Invalid camera transition time');
    return interpolate(start,end,Math.max(0,Math.min(1,timeMs/durationMs)),mode);
  }
  return Object.freeze({interpolate:interpolate,interpolateSpline:interpolateSpline,
    cameraAt:cameraAt,shortestAngle:shortestAngle});
}));

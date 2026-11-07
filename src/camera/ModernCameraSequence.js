/* Pure Modern camera keyframe sequence. Each keyframe is an owned pose snapshot.
 * travelMs/easing describe the inbound segment; holdMs is the pause AFTER arrival.
 * The first frame has travelMs = 0. Sampling never relies on previous frames.
 */
(function(root,factory){
  var interpolator=root.CurvatureModernCameraInterpolator;
  if(typeof module==='object'&&module.exports){
    interpolator=require('./ModernCameraInterpolator');
    module.exports=factory(interpolator);
  }else root.CurvatureModernCameraSequence=factory(interpolator);
}(typeof globalThis!=='undefined'?globalThis:this,function(interpolator){
  'use strict';
  var POSE=['Height','FocalLengthField','Pan','Nick','Roll',
    'CameraEast','CameraNorth','viewcenterHorizon','deviceRatio'];
  var FIELDS=['name','camera','travelMs','holdMs','easing'];
  function finiteRange(n,min,max){
    if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw RangeError('Invalid camera sequence duration');
    return n;
  }
  function validate(frames){
    if(!interpolator||typeof interpolator.interpolate!=='function')
      throw Error('Camera interpolator is unavailable');
    if(!Array.isArray(frames)||frames.length>20)throw RangeError('Camera sequence allows up to 20 keyframes');
    var result=frames.map(function(frame,i){
      if(!frame||typeof frame!=='object'||Array.isArray(frame)||
        Object.keys(frame).length!==FIELDS.length||FIELDS.some(function(key){return !Object.hasOwn(frame,key);}))
        throw RangeError('Invalid camera keyframe fields');
      var name=frame.name;
      if(typeof name!=='string'||!name.trim()||name.length>80)throw RangeError('Invalid keyframe name');
      var source=frame.camera;
      if(!source||typeof source!=='object'||Array.isArray(source)||
        Object.keys(source).length!==POSE.length||POSE.some(function(key){return !Object.hasOwn(source,key);}))
        throw RangeError('Invalid keyframe camera fields');
      var pose={};POSE.forEach(function(key){pose[key]=source[key];});
      // Validate even a single frame; the interpolator validates all limits.
      interpolator.interpolate(pose,pose,0,'linear');
      var travelMs=finiteRange(frame.travelMs,i===0?0:200,i===0?0:120000);
      var holdMs=finiteRange(frame.holdMs,0,120000);
      if(!['linear','smoothstep'].includes(frame.easing))throw RangeError('Invalid keyframe easing');
      return {name:name.trim(),camera:pose,travelMs:travelMs,holdMs:holdMs,easing:frame.easing};
    });
    for(var i=1;i<result.length;i++){
      // Verify that a continuous path is possible BEFORE any playback starts.
      interpolator.interpolate(result[i-1].camera,result[i].camera,.5,result[i].easing);
    }
    return result;
  }
  function totalMs(frames){
    var list=validate(frames);
    return list.reduce(function(ms,frame){return ms+frame.travelMs+frame.holdMs;},0);
  }
  function timeline(frames){
    var list=validate(frames),ms=0;
    return list.map(function(frame){
      ms+=frame.travelMs;
      var arrivalMs=ms;
      ms+=frame.holdMs;
      return {name:frame.name,arrivalMs:arrivalMs,departureMs:ms};
    });
  }
  function cameraAt(frames,timeMs){
    var list=validate(frames);
    if(list.length<2)throw RangeError('At least two camera keyframes are needed');
    if(typeof timeMs!=='number'||!Number.isFinite(timeMs))throw RangeError('Invalid camera sequence time');
    var time=Math.max(0,timeMs),clock=0;
    for(var i=0;i<list.length;i++){
      var frame=list[i];
      if(i>0){
        var arrived=clock+frame.travelMs;
        if(time<arrived)return interpolator.cameraAt(list[i-1].camera,frame.camera,
          time-clock,frame.travelMs,frame.easing);
        clock=arrived;
      }
      if(time<=clock+frame.holdMs)return Object.freeze(Object.assign({},frame.camera));
      clock+=frame.holdMs;
    }
    return Object.freeze(Object.assign({},list[list.length-1].camera));
  }
  return Object.freeze({validate:validate,totalMs:totalMs,timeline:timeline,cameraAt:cameraAt});
}));

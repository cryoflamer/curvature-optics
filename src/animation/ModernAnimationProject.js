/* Self-contained, deterministic Modern animation projects. The embedded v1
 * experiment is authoritative; local History IDs are provenance only.
 * Playback samples an owned copy and never mutates live session or History.
 */
(function(root,factory){
  var state=root.CurvatureModernExperimentState;
  var compat=root.CurvatureModernAnimationCompatibility;
  var camera=root.CurvatureModernCameraInterpolator;
  var hud=root.CurvatureModernCameraHud;
  if(typeof module==='object'&&module.exports){
    state=require('../ui/modern/ModernExperimentState');
    compat=require('./ModernAnimationCompatibility');
    camera=require('../camera/ModernCameraInterpolator');
    hud=require('../ui/modern/ModernCameraHud');
  }
  var api=factory(state,compat,camera,hud);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationProject=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(state,compat,camera,hud){
  'use strict';
  var VERSION=1,MAX_FRAMES=200,MAX_TIME=120000;
  var POSE=['Height','FocalLengthField','Pan','Nick','Roll',
    'CameraEast','CameraNorth','viewcenterHorizon','deviceRatio'];
  function object(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
  function shape(value,keys){
    if(!object(value)||Object.keys(value).sort().join(',')!==keys.slice().sort().join(','))
      throw RangeError('Invalid animation project fields');
  }
  function text(value,max,empty){
    if(typeof value!=='string'||value.length>max||(!empty&&!value.trim()))
      throw RangeError('Invalid animation project text');
    return value.trim();
  }
  function finite(value,min,max){
    if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)
      throw RangeError('Invalid animation number');
    return value;
  }
  function freeze(value){
    if(value&&typeof value==='object'){
      Object.keys(value).forEach(function(k){freeze(value[k]);});Object.freeze(value);
    }
    return value;
  }
  function pose(value){
    shape(value,POSE);
    var copy={};POSE.forEach(function(k){copy[k]=value[k];});
    camera.interpolate(copy,copy,0,'linear');
    return copy;
  }
  function readTarget(experiment,target){
    var scope=target.scope,parameter=target.parameter;
    if((experiment.display.mode==='scene')!==(scope==='scene'))
      throw RangeError('Physical target is outside the active display mode');
    var p=scope==='scene'?experiment.scene:experiment.compare[scope];
    if(parameter==='surface.curvature'){
      var globe=scope==='scene'?p.surface.showModel===1:p.surface==='globe';
      var radius=scope==='scene'?p.surface.rEarth:p.radiusKm*1000;
      return globe?1/radius:0;
    }
    if(parameter==='temperatureProfile.gradientKPerKm'&&p.atmosphere==='temperature-lapse')
      return p.temperatureProfile.gradientKPerKm;
    throw RangeError('Physical parameter is inactive or unsupported');
  }
  function applyValue(experiment,mode,target,value){
    // state.validate allocates fresh owned arrays and objects.
    var result=state.validate(experiment);
    if(mode==='camera')result.scene.camera=pose(value);
    else{
      var p=target.scope==='scene'?result.scene:result.compare[target.scope];
      if(target.parameter==='temperatureProfile.gradientKPerKm'){
        finite(value,-20,20);
        if(p.atmosphere!=='temperature-lapse')throw RangeError('Gradient requires temperature-lapse');
        p.temperatureProfile.gradientKPerKm=value;
      }else{
        finite(value,0,1/100000);
        if(value===0){
          if(target.scope==='scene')p.surface.showModel=2;
          else p.surface='flat';
        }else{
          var radius=1/value;
          if(!Number.isFinite(radius)||radius<100000||radius>1e16)
            throw RangeError('Interpolated curvature exceeds supported radius range');
          if(target.scope==='scene'){
            p.surface.showModel=1;p.surface.rEarth=radius;
          }else{
            p.surface='globe';p.radiusKm=radius/1000;
          }
        }
      }
    }
    return state.validate(result);
  }
  function validate(input){
    // Optional appearance keeps existing v1 projects byte-for-byte compatible.
    var hasHud=Object.prototype.hasOwnProperty.call(input||{},'cameraHudAppearance');
    var hasInterpolation=Object.prototype.hasOwnProperty.call(input||{},'interpolation');
    shape(input,['version','id','name','description','mode','target','baseExperiment',
      'keyframes'].concat(hasHud?['cameraHudAppearance']:[],
      hasInterpolation?['interpolation']:[]));
    if(input.version!==VERSION)throw RangeError('Unsupported animation project version');
    var id=text(input.id,80,false),name=text(input.name,120,false);
    if(!/^[A-Za-z0-9_-]+$/.test(id))throw RangeError('Invalid animation project ID');
    var description=text(input.description,1000,true),mode=input.mode,target=input.target;
    if(!['camera','physical'].includes(mode))throw RangeError('Invalid animation mode');
    var interpolation=hasInterpolation?input.interpolation:'linear';
    if(!['linear','spline'].includes(interpolation))throw RangeError('Invalid animation interpolation');
    if(mode!=='camera'&&interpolation==='spline')
      throw RangeError('Spline interpolation requires camera animation');
    if(mode==='camera'){
      if(target!==null)throw RangeError('Camera animation target must be null');
    }else compat.targetPath(target);
    var baseExperiment=state.validate(input.baseExperiment);
    if(mode==='physical')readTarget(baseExperiment,target);
    if(!Array.isArray(input.keyframes)||input.keyframes.length<2||input.keyframes.length>MAX_FRAMES)
      throw RangeError('Animation requires 2–200 keyframes');
    var keyframes=input.keyframes.map(function(frame,index){
      shape(frame,['sourceSnapshotId','name','value','travelMs','holdMs','easing']);
      var source=frame.sourceSnapshotId;
      if(source!==null&&!(Number.isSafeInteger(source)&&source>0)&&
        !(typeof source==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(source)))
        throw RangeError('Invalid source snapshot ID');
      var name=text(frame.name,120,false);
      var travel=finite(frame.travelMs,index===0?0:200,index===0?0:MAX_TIME);
      var hold=finite(frame.holdMs,0,MAX_TIME);
      if(!['linear','smoothstep'].includes(frame.easing))throw RangeError('Invalid keyframe easing');
      var value=mode==='camera'?pose(frame.value):readTarget(
        applyValue(baseExperiment,mode,target,frame.value),target);
      return {sourceSnapshotId:source,name:name,value:value,travelMs:travel,
        holdMs:hold,easing:frame.easing};
    });
    if(mode==='camera'){
      for(var i=1;i<keyframes.length;i++)camera.interpolate(keyframes[i-1].value,keyframes[i].value,.5,keyframes[i].easing);
    }
    var result={version:VERSION,id:id,name:name,description:description,mode:mode,
      target:mode==='camera'?null:{scope:target.scope,parameter:target.parameter},
      baseExperiment:baseExperiment,keyframes:keyframes};
    if(hasHud)result.cameraHudAppearance=hud.validateAppearance(input.cameraHudAppearance);
    if(hasInterpolation)result.interpolation=interpolation;
    return freeze(result);
  }
  function create(snapshots,options){
    options=options||{};
    if(!Array.isArray(snapshots)||snapshots.length<2||snapshots.length>MAX_FRAMES)
      throw RangeError('Animation needs 2–200 snapshots');
    var entries=snapshots.map(function(item){
      if(object(item)&&item.experiment)return {source:item,experiment:state.validate(item.experiment)};
      return {source:{},experiment:state.validate(item)};
    });
    var inspected=compat.inspect(entries.map(function(entry){return entry.experiment;}),
      {mode:options.mode,target:options.target});
    if(!inspected.compatible){
      var error=new RangeError('Incompatible animation snapshots: '+
        inspected.issues.map(function(issue){return issue.path;}).join(', '));
      error.issues=inspected.issues;throw error;
    }
    var mode=inspected.mode,target=inspected.target;
    var frames=entries.map(function(entry,i){
      var source=entry.source,id=source.sourceSnapshotId===undefined?source.id:source.sourceSnapshotId;
      return {sourceSnapshotId:id===undefined?null:id,
        name:source.name&&source.name.trim()?source.name:'Frame '+(i+1),
        value:mode==='camera'?entry.experiment.scene.camera:readTarget(entry.experiment,target),
        travelMs:i===0?0:(source.travelMs===undefined?5000:source.travelMs),
        holdMs:source.holdMs===undefined?0:source.holdMs,
        easing:source.easing===undefined?(mode==='camera'?'smoothstep':'linear'):source.easing};
    });
    var result={version:VERSION,id:options.id,name:options.name||'Animation',
      description:options.description||'',mode:mode,target:target,
      baseExperiment:entries[0].experiment,keyframes:frames};
    if(options.cameraHudAppearance!==undefined)result.cameraHudAppearance=options.cameraHudAppearance;
    if(options.interpolation!==undefined)result.interpolation=options.interpolation;
    return validate(result);
  }
  function totalMs(input){var p=validate(input);return p.keyframes.reduce(function(n,f){return n+f.travelMs+f.holdMs;},0);}
  function timeline(input){
    var p=validate(input),ms=0;
    return p.keyframes.map(function(frame){
      ms+=frame.travelMs;var arrivalMs=ms;ms+=frame.holdMs;
      return {name:frame.name,arrivalMs:arrivalMs,departureMs:ms};
    });
  }
  function sampleAt(input,timeMs){
    var p=validate(input);
    if(typeof timeMs!=='number'||!Number.isFinite(timeMs))throw RangeError('Invalid sample time');
    var time=Math.max(0,timeMs),clock=0,frames=p.keyframes;
    function at(value){return applyValue(p.baseExperiment,p.mode,p.target,value);}
    for(var i=0;i<frames.length;i++){
      var frame=frames[i];
      if(i){
        var arrival=clock+frame.travelMs;
        if(time<arrival){
          var u=(time-clock)/frame.travelMs;
          if(p.mode==='camera')return at(p.interpolation==='spline'?
            camera.interpolateSpline(frames,i,u):
            camera.interpolate(frames[i-1].value,frame.value,u,frame.easing));
          var eased=frame.easing==='smoothstep'?u*u*(3-2*u):u;
          var number=frames[i-1].value+(frame.value-frames[i-1].value)*eased;
          return at(number);
        }
        clock=arrival;
      }
      if(time<=clock+frame.holdMs)return at(frame.value);
      clock+=frame.holdMs;
    }
    return at(frames[frames.length-1].value);
  }
  return Object.freeze({VERSION:VERSION,validate:validate,create:create,
    validateHudAppearance:hud.validateAppearance,
    totalMs:totalMs,timeline:timeline,sampleAt:sampleAt});
}));

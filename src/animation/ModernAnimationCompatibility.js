/* Pure cross-snapshot compatibility checks for Modern Animation Studio.
 * The A/B relations in ModernExperimentFingerprint are INSIDE one snapshot;
 * this module compares different snapshots and enforces one global channel.
 * No DOM, storage, rendering, or live model mutations.
 */
(function(root,factory){
  var state=root.CurvatureModernExperimentState;
  var fingerprint=root.CurvatureModernExperimentFingerprint;
  if(typeof module==='object'&&module.exports){
    state=require('../ui/modern/ModernExperimentState');
    fingerprint=require('../ui/modern/ModernExperimentFingerprint');
  }
  var api=factory(state,fingerprint);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationCompatibility=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(state,fingerprint){
  'use strict';
  var CAMERA_FIELDS=['CameraEast','CameraNorth','Height','Pan','Nick','Roll','FocalLengthField'];
  var CHANNELS=['surface.curvature','temperatureProfile.gradientKPerKm'];
  function object(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
  function curvature(geometry){return geometry.kind==='flat'?0:1/(geometry.radiusKm*1000);}
  function activeVisibility(value){return value.enabled?{enabled:true,rangeKm:value.rangeKm}:{enabled:false};}
  function physical(feature){
    // features() already removes inactive radius / refractive model controls.
    var ref=feature.refraction;
    var result={surface:{curvature:curvature(feature.geometry)},atmosphere:ref.kind};
    Object.keys(ref).forEach(function(k){if(k!=='kind')result[k]=ref[k];});
    return result;
  }
  function effective(input){
    var e=state.validate(input),f=fingerprint.features(e);
    // Only the active Scene or Compare optics matter. Unused editor presets,
    // title, saved camera positions and legacy camera sequence are not imagery.
    var result={mode:e.display.mode,camera:e.scene.camera,
      scene:{objects:e.scene.objects,showGrid:e.scene.showGrid},
      display:{eyeLevel:e.display.eyeLevel,horizon:e.display.horizon,
        gpuProbe:e.display.gpuProbe,probeTargets:e.display.probeTargets,
        showTemperatureProfile:e.display.showTemperatureProfile,
        temperaturePlacement:e.display.temperaturePlacement}};
    if(e.display.mode==='scene'){
      result.scene=Object.assign(result.scene,physical(f.scene),
        {visibility:activeVisibility(e.scene.visibility)});
    }else{
      result.compare={A:physical(f.compare.A),B:physical(f.compare.B),
        visibility:activeVisibility(e.compare.A.visibility)};
    }
    return result;
  }
  function changed(a,b,path,paths){
    if(Object.is(a,b))return;
    if(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length){
      for(var i=0;i<a.length;i++)changed(a[i],b[i],path+'.'+i,paths);
    }else if(object(a)&&object(b)){
      var keys=new Set(Object.keys(a).concat(Object.keys(b)));
      Array.from(keys).sort().forEach(function(k){changed(a[k],b[k],path?path+'.'+k:k,paths);});
    }else paths.add(path);
  }
  // Adjacent-frame diagnostics supplement the global one-channel decision.
  // We retain the original compatibility verdict: displaying a discontinuity
  // must never imply that the renderer supports stepping or interpolation.
  function atPath(frame,path){
    return path.split('.').reduce(function(value,key){
      return value===null||value===undefined?undefined:value[key];
    },frame);
  }
  function transitions(frames){
    var list=[];
    for(var i=1;i<frames.length;i++){
      var paths=new Set();changed(frames[i-1],frames[i],'',paths);
      list.push({fromIndex:i-1,toIndex:i,changes:Array.from(paths).sort().map(function(path){
        return {path:path,from:atPath(frames[i-1],path),to:atPath(frames[i],path)};
      })});
    }
    return list;
  }
  function targetPath(target){
    if(!object(target)||!['scene','A','B'].includes(target.scope)||
      !CHANNELS.includes(target.parameter)||Object.keys(target).sort().join(',')!=='parameter,scope')
      throw RangeError('Invalid physical animation target');
    return (target.scope==='scene'?'scene':'compare.'+target.scope)+'.'+target.parameter;
  }
  function validTarget(first,target){
    var path=targetPath(target);
    if((first.mode==='scene')!==(target.scope==='scene'))return false;
    var phy=target.scope==='scene'?first.scene:first.compare[target.scope];
    return target.parameter==='surface.curvature'||phy.atmosphere==='temperature-lapse';
  }
  function inspect(experiments,options){
    options=options||{};
    if(!Array.isArray(experiments)||experiments.length<2||experiments.length>200)
      throw RangeError('Animation needs 2–200 snapshots');
    var frames=experiments.map(effective),base=frames[0],paths=new Set();
    for(var i=1;i<frames.length;i++)changed(base,frames[i],'',paths);
    var differences=Array.from(paths).sort();
    var dynamicCamera=differences.filter(function(p){return CAMERA_FIELDS.some(function(k){return p==='camera.'+k;});});
    var physical=differences.filter(function(p){return CHANNELS.some(function(k){return p==='scene.'+k||p==='compare.A.'+k||p==='compare.B.'+k;});});
    var disallowed=differences.filter(function(p){return !dynamicCamera.includes(p)&&!physical.includes(p);});
    var mode=options.mode||null,target=options.target||null,issues=[];
    if(mode!==null&&!['camera','physical'].includes(mode))throw RangeError('Invalid animation mode');
    if(target!==null)targetPath(target);
    if(mode==='camera'&&target!==null)throw RangeError('Camera mode cannot have a physical target');
    if(!mode&&target)mode='physical';
    if(!mode){
      if(dynamicCamera.length&&!physical.length&&!disallowed.length)mode='camera';
      else if(!dynamicCamera.length&&physical.length===1&&!disallowed.length){
        mode='physical';
        var parts=physical[0].split('.');
        target=parts[0]==='scene'?{scope:'scene',parameter:parts.slice(1).join('.')}:
          {scope:parts[1],parameter:parts.slice(2).join('.')};
      }
    }
    if(mode==='camera'){
      physical.forEach(function(p){issues.push({code:'physical-change',path:p});});
      disallowed.forEach(function(p){issues.push({code:'fixed-state-change',path:p});});
    }else if(mode==='physical'){
      if(!target)issues.push({code:'missing-target',path:'target'});
      else{
        var wanted=targetPath(target);
        if(!validTarget(base,target))issues.push({code:'inactive-target',path:wanted});
        physical.filter(function(p){return p!==wanted;}).forEach(function(p){
          issues.push({code:'multiple-physical-channels',path:p});
        });
      }
      dynamicCamera.forEach(function(p){issues.push({code:'camera-change',path:p});});
      disallowed.forEach(function(p){issues.push({code:'fixed-state-change',path:p});});
    }else{
      if(!differences.length)issues.push({code:'ambiguous-unchanged',path:'mode'});
      else differences.forEach(function(p){issues.push({code:'mixed-or-unsupported-change',path:p});});
    }
    return {compatible:issues.length===0,mode:mode,target:target,
      changedPaths:differences,issues:issues,transitions:transitions(frames)};
  }
  return Object.freeze({inspect:inspect,effective:effective,targetPath:targetPath});
}));

/* Prospective, self-contained constraints for Animation Projects. This pure
 * module describes which snapshots may join a project BEFORE a timeline has
 * been assembled. Project v2 embeds this immutable contract. It reuses the
 * existing renderer's authoritative validator; it is not a new interpolator.
 */
(function(root,factory){
  var state=root.CurvatureModernExperimentState;
  var compatibility=root.CurvatureModernAnimationCompatibility;
  if(typeof module==='object'&&module.exports){
    state=require('../ui/modern/ModernExperimentState');
    compatibility=require('./ModernAnimationCompatibility');
  }
  var api=factory(state,compatibility);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationContract=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(state,compatibility){
  'use strict';
  var VERSION=1,MODES=['camera','physical','experimental'];
  var CAMERA_FIELDS=['CameraEast','CameraNorth','Height','Pan','Nick','Roll','FocalLengthField'];
  function object(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
  function freeze(value){
    if(value&&typeof value==='object'){
      Object.keys(value).forEach(function(key){freeze(value[key]);});
      Object.freeze(value);
    }
    return value;
  }
  function canonical(v){
    if(typeof v==='number'&&Object.is(v,-0))return '(-0)';
    if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
    if(object(v))return '{'+Object.keys(v).sort().map(function(k){
      return JSON.stringify(k)+':'+canonical(v[k]);
    }).join(',')+'}';
    return JSON.stringify(v);
  }
  function effectiveParts(input){
    var e=compatibility.effective(input);
    var scene={objects:e.scene.objects,showGrid:e.scene.showGrid};
    var physics=e.mode==='scene'?{
      mode:'scene',surface:e.scene.surface,atmosphere:e.scene.atmosphere,
      visibility:e.scene.visibility
    }:{mode:'compare',compare:e.compare};
    // Include every other active refraction field without assuming a fixed
    // list of atmosphere models. Their canonical order is deterministic.
    if(e.mode==='scene')Object.keys(e.scene).forEach(function(k){
      if(!['objects','showGrid','surface','atmosphere','visibility'].includes(k))
        physics[k]=e.scene[k];
    });
    return {scene:scene,physics:physics,camera:e.camera,display:e.display};
  }
  function signatures(input){
    var parts=effectiveParts(input),result={};
    Object.keys(parts).forEach(function(k){result[k]=canonical(parts[k]);});
    return freeze(result);
  }
  function validate(input){
    if(!object(input)||Object.keys(input).sort().join(',')!==
      'mode,referenceExperiment,target,version')
      throw RangeError('Invalid animation contract fields');
    if(input.version!==VERSION||!MODES.includes(input.mode))
      throw RangeError('Unsupported animation contract');
    var reference=state.validate(input.referenceExperiment),target=input.target;
    if(input.mode==='physical'){
      // This also validates the target shape, active display scope, and
      // support for temperature-gradient interpolation in the active model.
      var verdict=compatibility.inspect([reference,reference],{mode:'physical',target:target});
      if(!verdict.compatible)throw RangeError('Inactive physical animation target');
      target={scope:verdict.target.scope,parameter:verdict.target.parameter};
    }else if(target!==null){
      throw RangeError('Only physical contracts can specify a target');
    }
    return freeze({version:VERSION,mode:input.mode,target:target,
      referenceExperiment:reference});
  }
  function create(reference,options){
    if(!object(options)||!MODES.includes(options.mode)||
      Object.keys(options).some(function(k){return !['mode','target'].includes(k);}))
      throw RangeError('Animation contract requires an explicit mode');
    return validate({version:VERSION,mode:options.mode,
      target:options.target===undefined?null:options.target,
      referenceExperiment:reference});
  }
  function allowedPaths(contract){
    var c=validate(contract);
    if(c.mode==='experimental')return freeze(['*']);
    if(c.mode==='camera')return freeze(CAMERA_FIELDS.map(function(k){return 'camera.'+k;}));
    return freeze([compatibility.targetPath(c.target)]);
  }
  function inspectCandidate(contract,candidate){
    var c=validate(contract),snapshot=state.validate(candidate);
    // Even an experimental contract must validate incoming snapshots, but it
    // deliberately does not claim the renderer can interpolate arbitrary ones.
    var requested=c.mode==='experimental'?{mode:'camera'}:{mode:c.mode,target:c.target};
    var verdict=compatibility.inspect([c.referenceExperiment,snapshot],requested);
    return freeze({allowed:c.mode==='experimental'||verdict.compatible,
      mode:c.mode,target:c.target,changedPaths:verdict.changedPaths,
      issues:c.mode==='experimental'?[]:verdict.issues,
      // For experimental mode the preview readiness of a whole timeline is
      // undecided. A pairwise result must never be presented as exportability.
      previewCompatible:c.mode==='experimental'?null:verdict.compatible});
  }
  function inspectFrames(contract,experiments){
    var c=validate(contract);
    if(!Array.isArray(experiments)||experiments.length>200)
      throw RangeError('Invalid animation project frame count');
    var frames=experiments.map(function(e){return state.validate(e);});
    var checks=frames.map(function(e){return inspectCandidate(c,e);});
    var accepted=checks.every(function(r){return r.allowed;});
    var previewCompatible=false,previewIssues=[];
    if(frames.length>=2){
      var opts=c.mode==='experimental'?{}:{mode:c.mode,target:c.target};
      var result=compatibility.inspect(frames,opts);
      previewCompatible=result.compatible;
      previewIssues=result.issues;
    }
    return freeze({accepted:accepted,checks:checks,
      // Still require the full authoritative sequence check, not just each
      // frame's compatibility with the reference experiment.
      previewCompatible:previewCompatible,previewIssues:previewIssues});
  }
  return Object.freeze({VERSION:VERSION,create:create,validate:validate,
    signatures:signatures,allowedPaths:allowedPaths,
    inspectCandidate:inspectCandidate,inspectFrames:inspectFrames});
}));

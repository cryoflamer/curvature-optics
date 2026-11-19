/* Runtime-only atmosphere variants. Eligibility follows the active physics and
 * animation contract, not History search filters or independent permissions.
 * No renderer, storage, workspace or DOM side effects. */
(function(root,factory){
  var state=root.CurvatureModernExperimentState;
  var fingerprint=root.CurvatureModernExperimentFingerprint;
  var projects=root.CurvatureModernAnimationProject;
  var compatibility=root.CurvatureModernAnimationCompatibility;
  var contracts=root.CurvatureModernAnimationContract;
  if(typeof module==='object'&&module.exports){
    state=require('../ui/modern/ModernExperimentState');
    fingerprint=require('../ui/modern/ModernExperimentFingerprint');
    projects=require('./ModernAnimationProject');
    compatibility=require('./ModernAnimationCompatibility');
    contracts=require('./ModernAnimationContract');
  }
  var api=factory(state,fingerprint,projects,compatibility,contracts);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationAtmosphereVariant=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(state,fingerprint,projects,compatibility,contracts){
  'use strict';
  var MODES=Object.freeze(['vacuum','standard']);
  function verdict(eligible,reason,authoredMode){
    return Object.freeze({eligible:eligible,reason:reason,authoredMode:authoredMode||null,
      modes:eligible?MODES:Object.freeze([])});
  }
  function compatibleFrames(project){
    var frames=projects.frameExperiments(project);
    if(project.contract){
      var check=contracts.inspectFrames(project.contract,frames);
      return check.accepted&&check.previewCompatible;
    }
    return compatibility.inspect(frames,{mode:project.mode,target:project.target}).compatible;
  }
  function inspectValidated(project){
    if(project.mode==='experimental')return verdict(false,'experimental');
    if(project.mode==='physical'&&project.target.parameter!=='surface.curvature')
      return verdict(false,'atmosphere-channel');
    if(!projects.ready(project))return verdict(false,'not-preview-ready');
    var f=fingerprint.features(project.baseExperiment);
    if(f.mode==='compare'&&!f.relations.refractionSame)
      return verdict(false,'different-refraction');
    var kind=f.mode==='compare'?f.compare.A.refraction.kind:f.scene.refraction.kind;
    if(!MODES.includes(kind))return verdict(false,'unsupported-atmosphere');
    if(!compatibleFrames(project))return verdict(false,'incompatible-frames');
    return verdict(true,null,kind);
  }
  function inspect(input){return inspectValidated(projects.validate(input));}
  function derive(input,mode){
    if(!MODES.includes(mode))throw RangeError('Unknown atmosphere variant');
    var p=projects.validate(input),check=inspectValidated(p);
    if(!check.eligible)throw RangeError('Ineligible atmosphere variant: '+check.reason);
    // Returning to the authored mode recovers the exact normalized original,
    // including preset provenance. Always derive from the authored project,
    // never chain overrides on a previously derived project.
    if(mode===check.authoredMode)return p;
    var base=state.validate(p.baseExperiment);
    if(base.display.mode==='compare'){
      base.compare.A.atmosphere=mode;base.compare.B.atmosphere=mode;
      base.compare.preset='custom';
    }else{
      base.scene.atmosphere=mode;base.scene.preset='custom';
    }
    var candidate=Object.assign({},p,{baseExperiment:base});
    if(p.contract)candidate.contract=Object.assign({},p.contract,{referenceExperiment:base});
    var variant=projects.validate(candidate);
    if(!compatibleFrames(variant))
      throw RangeError('Atmosphere variant violates animation contract');
    return variant;
  }
  return Object.freeze({MODES:MODES,inspect:inspect,derive:derive});
}));

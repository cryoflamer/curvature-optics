/* Isolated Animation Studio keyframe edit-session preparation.
 * This pure controller does not mutate Studio, Scene/Compare, History or storage.
 * The host must guard navigation and persistence before mounting an editor.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationKeyframeEditSession=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function immutable(value){
    if(value&&typeof value==='object'){
      Object.keys(value).forEach(function(key){immutable(value[key]);});
      Object.freeze(value);
    }
    return value;
  }
  function required(value,name){
    if(typeof value!=='string'||!value.trim())throw RangeError('Missing '+name);
    return value;
  }
  function begin(options){
    if(!options||!options.contract||!options.frame||!options.frame.experiment||
       !options.workspaceExperiment)throw TypeError('Incomplete keyframe edit session');
    var projectId=required(options.projectId,'project identity');
    var revision=required(options.revision,'project revision');
    var frameKey=required(options.frame.key,'keyframe identity');
    var mode=options.frame.experiment.display&&options.frame.experiment.display.mode;
    if(mode!=='scene'&&mode!=='compare')throw RangeError('Unsupported keyframe editor mode');
    if(!options.contractApi||typeof options.contractApi.inspectCandidate!=='function'||
       typeof options.contractApi.allowedPaths!=='function')
      throw TypeError('Animation contract validator is required');
    var contract=clone(options.contract),original=clone(options.frame.experiment);
    var verdict=options.contractApi.inspectCandidate(contract,original);
    if(!verdict.allowed||contract.mode==='experimental')
      throw RangeError('Keyframe cannot safely enter contract edit mode');
    var paths=options.contractApi.allowedPaths(contract);
    var workspace=clone(options.workspaceExperiment);
    var candidate=clone(original),active=true;
    function assertActive(){if(!active)throw Error('Keyframe edit session has ended');}
    function snapshot(){assertActive();return clone(candidate);}
    function replace(next){
      assertActive();
      var copy=clone(next);
      if(!copy.display||copy.display.mode!==mode)
        throw RangeError('Keyframe editor mode cannot change');
      candidate=copy;
      return snapshot();
    }
    function cancel(){
      assertActive();active=false;
      return clone(workspace);
    }
    function prepareApply(current){
      assertActive();
      if(!current||current.projectId!==projectId||current.revision!==revision||
         current.frameKey!==frameKey)
        throw Error('Animation project changed during keyframe edit');
      var result=options.contractApi.inspectCandidate(contract,candidate);
      if(!result.allowed)throw RangeError('Keyframe violates animation contract');
      return immutable({projectId:projectId,revision:revision,frameKey:frameKey,
        experiment:clone(candidate)});
    }
    function finish(){assertActive();active=false;return clone(workspace);}
    return Object.freeze({projectId:projectId,revision:revision,frameKey:frameKey,
      mode:mode,allowedPaths:immutable(clone(paths)),original:immutable(original),
      workspace:immutable(workspace),snapshot:snapshot,replace:replace,
      cancel:cancel,prepareApply:prepareApply,finish:finish,
      active:function(){return active;}});
  }
  return Object.freeze({begin:begin});
}));

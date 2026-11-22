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
    // Only candidate snapshots are recorded. This is independent from the
    // persistent Studio edit history and disappears with the edit session.
    var past=[],future=[],group=null,groupRecorded=false,limit=30;
    var originalFingerprint=JSON.stringify(original);
    function assertActive(){if(!active)throw Error('Keyframe edit session has ended');}
    function snapshot(){assertActive();return clone(candidate);}
    function history(){assertActive();return Object.freeze({
      undo:past.length,redo:future.length,
      dirty:JSON.stringify(candidate)!==originalFingerprint
    });}
    function beginGroup(token){
      assertActive();
      if(typeof token!=='string'||!token)throw TypeError('A gesture identity is required');
      if(group!==token){group=token;groupRecorded=false;}
    }
    function endGroup(token){
      assertActive();
      if(token===undefined||group===token){group=null;groupRecorded=false;}
    }
    function replace(next){
      assertActive();
      var copy=clone(next);
      if(!copy.display||copy.display.mode!==mode)
        throw RangeError('Keyframe editor mode cannot change');
      if(JSON.stringify(copy)===JSON.stringify(candidate))return snapshot();
      if(!groupRecorded){
        past.push(clone(candidate));
        if(past.length>limit)past.shift();
        groupRecorded=!!group;
      }else if(past.length&&JSON.stringify(copy)===JSON.stringify(past[past.length-1])){
        // Returning to the gesture's starting pose is a no-op, not an
        // extra history entry waiting to be undone.
        past.pop();groupRecorded=false;
      }
      candidate=copy;future=[];
      return snapshot();
    }
    function travel(direction){
      assertActive();endGroup();
      var from=direction==='undo'?past:future;
      var to=direction==='undo'?future:past;
      if(!from.length)return null;
      to.push(clone(candidate));
      if(to.length>limit)to.shift();
      candidate=from.pop();
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
      history:history,beginGroup:beginGroup,endGroup:endGroup,
      undo:function(){return travel('undo');},redo:function(){return travel('redo');},
      cancel:cancel,prepareApply:prepareApply,finish:finish,
      active:function(){return active;}});
  }
  return Object.freeze({begin:begin});
}));

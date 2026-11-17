/* Diagnostic-only Playback sampling modes. The application owns the actual
 * renderer; this module only chooses whether to sample the advancing clock,
 * reuse a captured camera/scene sample, or skip painting altogether.
 * No experiment, physics, export or History state is modified here.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationPlaybackExperiment=api;
}(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  var MODES=Object.freeze(['normal','compute','replay']);
  function create(){
    var mode='normal',frozen=null;
    function clear(){frozen=null;}
    function setMode(value){
      if(!MODES.includes(value))throw RangeError('Invalid Playback experiment mode');
      mode=value;clear();
    }
    function plan(sampleAt,positionMs){
      if(typeof sampleAt!=='function'||!Number.isFinite(positionMs))
        throw TypeError('Playback experiment requires a live sample and playhead');
      if(mode==='replay'){
        if(!frozen)frozen={sample:sampleAt(),timeMs:positionMs};
        return {mode:mode,paint:true,sample:frozen.sample,timeMs:frozen.timeMs};
      }
      return {mode:mode,paint:mode!=='compute',sample:sampleAt(),timeMs:positionMs};
    }
    return Object.freeze({mode:function(){return mode;},setMode:setMode,
      clear:clear,plan:plan});
  }
  return Object.freeze({MODES:MODES,create:create});
}));

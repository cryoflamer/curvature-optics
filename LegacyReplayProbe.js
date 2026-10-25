/* Phase 7: isolated command-stream replay preflight.
 * No canvas is created or modified. This proves command transport only,
 * NOT rendering equivalence or coverage of direct graph mutations.
 */
(function(root,factory){
  var api=factory(root.LegacySceneAdapter || (typeof require==='function' ? require('./LegacySceneAdapter') : null));
  if(typeof module==='object' && module.exports) module.exports=api;
  root.LegacyReplayProbe=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(adapter){
  'use strict';
  if(!adapter) throw new Error('LegacySceneAdapter required');
  function preflight(trace, polygonCtor){
    if(trace && trace.kind==='scene-command-frame')
      trace=(typeof globalThis!=='undefined' && globalThis.SceneFrame ? globalThis.SceneFrame : require('./SceneFrame')).toTrace(trace);
    if(!trace || !trace.complete || !Array.isArray(trace.commands))
      return {ok:false,reason:'Trace is incomplete or missing',commands:0};
    var seen=[], shadow={};
    adapter.METHODS.forEach(function(name){
      shadow[name]=function(){
        seen.push({method:name,args:Array.prototype.slice.call(arguments)});
      };
    });
    try {
      adapter.replay(shadow,JSON.parse(JSON.stringify(trace)),{JsgPolygon:polygonCtor});
    } catch(error){
      return {ok:false,reason:error.message,commands:seen.length};
    }
    if(seen.length!==trace.commands.length)
      return {ok:false,reason:'Replay command count mismatch',commands:seen.length};
    for(var i=0;i<seen.length;i++){
      if(seen[i].method!==trace.commands[i].method)
        return {ok:false,reason:'Replay order mismatch at '+i,commands:seen.length};
    }
    return {ok:true,commands:seen.length,reason:'Command dispatch succeeded on isolated shadow graph; pixel equivalence NOT tested'};
  }
  return {preflight:preflight};
}));

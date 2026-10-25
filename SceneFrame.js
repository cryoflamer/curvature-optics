/* Immutable-by-convention, JSON-safe command frame at the legacy graph API
 * boundary. This is a transitional drawing-command representation, NOT a
 * renderer-independent 3D geometry scene or a full graph-state snapshot.
 */
(function(root,factory){
  var api=factory(root.LegacySceneAdapter || (typeof require==='function'?require('./LegacySceneAdapter'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SceneFrame=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(adapter){
  'use strict';
  if(!adapter)throw new Error('LegacySceneAdapter required');
  var VERSION=1, KIND='scene-command-frame';
  function snapshot(value){
    if(value===null||typeof value==='string'||typeof value==='boolean')return value;
    if(typeof value==='number'&&Number.isFinite(value))return value;
    if(Array.isArray(value))return value.map(snapshot);
    if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype){
      var copy={};
      Object.keys(value).forEach(function(key){
        if(key==='__proto__'||key==='constructor'||key==='prototype')throw new TypeError('Unsafe frame key');
        copy[key]=snapshot(value[key]);
      });
      return copy;
    }
    throw new TypeError('Non-serializable frame value');
  }
  function validate(commands){
    if(!Array.isArray(commands))throw new TypeError('Frame commands must be an array');
    commands.forEach(function(command){
      if(!command||typeof command!=='object'||!adapter.METHODS.includes(command.method)||!Array.isArray(command.args))
        throw new TypeError('Unsupported frame command');
    });
  }
  function fromTrace(trace){
    if(!trace||trace.version!==adapter.VERSION||trace.kind!=='legacy-graph-commands'||
       trace.complete!==true||!Array.isArray(trace.commands)||
       !Array.isArray(trace.unsupported)||trace.unsupported.length)
      throw new TypeError('Complete legacy trace required');
    validate(trace.commands);
    var commands=snapshot(trace.commands);
    return {version:VERSION,kind:KIND,source:'legacy-graph-api',commands:commands};
  }
  function toTrace(frame){
    if(!frame||frame.version!==VERSION||frame.kind!==KIND||frame.source!=='legacy-graph-api')
      throw new TypeError('Invalid scene frame');
    validate(frame.commands);
    return {version:adapter.VERSION,kind:'legacy-graph-commands',
      commands:snapshot(frame.commands),unsupported:[],complete:true};
  }
  function replay(graph,frame,options){return adapter.replay(graph,toTrace(frame),options);}
  return {VERSION:VERSION,fromTrace:fromTrace,toTrace:toTrace,replay:replay};
}));

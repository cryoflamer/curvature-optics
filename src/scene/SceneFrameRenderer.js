/* Transitional command-frame renderer. Rendering is an explicit operation on
 * a caller-supplied graph; it never constructs a graph or invokes DrawModel.
 * Graph initialization and state outside the command boundary remain the
 * caller's responsibility.
 */
(function(root,factory){
  var api=factory(root.SceneFrame || (typeof require==='function'?require('./SceneFrame'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SceneFrameRenderer=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(sceneFrame){
  'use strict';
  if(!sceneFrame)throw new Error('SceneFrame required');
  function render(graph,frame,options){
    if(!graph||typeof graph!=='object')throw new TypeError('Target graph required');
    // Validation and defensive copying are performed by SceneFrame.toTrace.
    // In particular, incomplete captures cannot be rendered as full frames.
    return sceneFrame.replay(graph,frame,options);
  }
  return {render:render};
}));

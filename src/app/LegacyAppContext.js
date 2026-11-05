/* Owns one Legacy model and its GraphX3D canvas. The standalone page and the
 * Demos host still expose the historical CurveApp/graph aliases for older
 * modules; those aliases do not own either object. Callers supply the actual
 * model constructor, canvas factory and state deserializer explicitly.
 *
 * This is an instance boundary, not yet a separate execution realm: drawing,
 * panel updates and the authored animations still use browser globals. */
(function(root){
  'use strict';
  function create(ports){
    if(!ports||typeof ports.createModel!=='function'||
       typeof ports.createGraph!=='function'||typeof ports.applyState!=='function')
      throw new TypeError('Legacy app context requires model, graph and state ports');
    var model=ports.createModel();
    if(!model||typeof model!=='object')
      throw new TypeError('Legacy app context requires a model object');
    var graph=null;
    return {
      model:model,
      mountGraph:function(options){
        if(graph)throw new Error('Legacy canvas is already mounted');
        var created=ports.createGraph(options);
        if(!created||typeof created.Redraw!=='function')
          throw new TypeError('Legacy canvas must expose Redraw');
        graph=created;
        return graph;
      },
      getGraph:function(){return graph;},
      redraw:function(){
        if(!graph)return false;
        graph.Redraw();
        return true;
      },
      applyState:function(state){return ports.applyState(model,state);}
    };
  }
  root.CurvatureLegacyAppContext={create:create};
}(typeof window==='undefined'?globalThis:window));

/* Latest-pose RAF scheduler for display-only Canvas Direct camera interaction.
 * The application owns camera math, eligibility, rendering and exact settle;
 * this helper never changes a model, experiment or persistence state.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernCameraCanvasDirectDrag=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function create(options){
    if(!options||typeof options.paint!=='function')throw TypeError('Direct drag painter required');
    var request=options.requestFrame||function(fn){return requestAnimationFrame(fn);};
    var cancel=options.cancelFrame||function(id){cancelAnimationFrame(id);};
    var onError=options.onError||function(error){throw error;};
    var active=false,pending=false,frame=null,latest=null,painted=false,generation=0;
    function clear(){
      generation++;active=false;latest=null;
      if(pending){cancel(frame);pending=false;frame=null;}
    }
    function paint(){
      frame=null;pending=false;
      if(!active||latest===null)return;
      try{options.paint(latest);painted=true;}
      catch(error){clear();onError(error);}
    }
    return Object.freeze({
      begin:function(){clear();painted=false;active=true;},
      move:function(pose){
        if(!active)return;
        if(!pose||typeof pose!=='object')throw TypeError('Direct drag pose required');
        latest=pose;
        if(pending)return;
        pending=true;
        // Both synchronous test schedulers and browser RAF are supported.
        var called=false,epoch=generation;
        var id=request(function(){called=true;if(epoch===generation)paint();});
        if(!called)frame=id;
      },
      clear:clear,
      isActive:function(){return active;},
      hasPainted:function(){return painted;}
    });
  }
  return Object.freeze({create:create});
}));

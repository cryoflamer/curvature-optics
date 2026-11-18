/* Latest-pose RAF scheduler for display-only Canvas Direct camera interaction.
 * Owns scheduling and detached-frame preflight for every camera input.
 * The application owns rendering and exact settle; no live model mutation.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernCameraDirectMotion=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function checkFrame(view,frame,checker){
    var support=checker.canvasDirectSupport(frame,view.options);
    if(!support.supported)throw checker.canvasDirectUnsupported(view.side+': '+support.reason);
    return frame;
  }
  // Build and qualify the entire batch before the caller can paint any side.
  function prepareFrames(views,livePose,pose,options){
    return views.map(function(view){
      var frame=Object.assign({},view.model,livePose,pose);
      if(options.deriveFov){
        frame.ViewAngle=Math.max(.1,Math.min(160,options.focalViewAngle(frame.FocalLengthField)));
        frame.camViewAngle=frame.ViewAngle*Math.PI/180;
      }
      return {view:view,frame:checkFrame(view,frame,options.checker)};
    });
  }
  function create(options){
    if(!options||typeof options.paint!=='function')throw TypeError('Direct motion painter required');
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
        if(!pose||typeof pose!=='object')throw TypeError('Direct motion pose required');
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
  return Object.freeze({create:create,checkFrame:checkFrame,prepareFrames:prepareFrames});
}));

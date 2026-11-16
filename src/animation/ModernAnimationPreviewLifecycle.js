/* Animation Preview's paused-frame lifecycle.
 * Owns pending RAF callbacks, layout retries and resize invalidation; the
 * application retains live playback, the physical renderer and DOM notices.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationPreviewLifecycle=api;
}(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function create(options){
    if(!options||typeof options.requestFrame!=='function'||
       typeof options.cancelFrame!=='function'||typeof options.ready!=='function'||
       typeof options.visible!=='function'||typeof options.render!=='function')
      throw TypeError('Animation Preview lifecycle requires frame scheduling and rendering');
    var frame=null,token=0,observedWidths={A:0,B:0};
    function cancel(){
      token++;
      if(frame!==null){options.cancelFrame(frame);frame=null;}
    }
    function schedule(reason){
      if(!options.ready())return;
      options.markPending(true);
      cancel();
      if(!options.visible())return;
      var generation=token,attempts=0,position=options.position();
      options.begin(reason,position);
      // GraphX3DX may have been hidden during bootstrap; allow two layout
      // frames before the first physical paint or a saved-position repaint.
      function next(){frame=options.requestFrame(paint);}
      function paint(){
        frame=null;
        if(generation!==token||!options.ready()||!options.visible())return;
        var width=options.width('A');
        if(width!==null&&width<2&&attempts++<12){next();return;}
        try{
          options.render();
          options.markPending(false);
          options.complete();
        }catch(error){options.failed(error);}
      }
      frame=options.requestFrame(function(){
        if(generation===token)next();
      });
    }
    function observe(){
      function resized(){
        if(!options.ready()||!options.open()||options.playing())return;
        var changed=false;
        ['A','B'].forEach(function(side){
          var width=options.width(side);
          if(width!==null)width=Math.round(width);
          if(width!==null&&width>1&&observedWidths[side]!==width){
            observedWidths[side]=width;changed=true;
          }
        });
        if(changed)schedule('resized');
      }
      if(typeof options.resizeObserver==='function'){
        var observer=new options.resizeObserver(resized);
        ['A','B'].forEach(function(side){
          var host=options.host(side);
          if(host)observer.observe(host);
        });
      }else if(typeof options.listenResize==='function')options.listenResize(resized);
    }
    return Object.freeze({cancel:cancel,schedule:schedule,observe:observe,
      hasFrame:function(){return frame!==null;}});
  }
  return Object.freeze({create:create});
}));

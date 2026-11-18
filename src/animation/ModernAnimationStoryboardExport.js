/* Isolated keyframe rendering and complete portable storyboard collection. */
(function(root,factory){
  var projects=root.CurvatureModernAnimationProject,thumbnails=root.CurvatureModernExperimentThumbnail;
  if(typeof module==='object'&&module.exports){
    projects=require('./ModernAnimationProject');thumbnails=require('../ui/modern/ModernExperimentThumbnail');
  }
  var api=factory(projects,thumbnails);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationStoryboardExport=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(projects,thumbnails){
  'use strict';
  // A job owns its results independently of the bounded, shared image cache.
  // Yield between physical frames; cancellation never publishes an incomplete export.
  async function collect(project,options){
    var frames=projects.frameExperiments(project),images=new Map(),chars=0;
    function check(){if(options.cancelled&&options.cancelled())throw Error('Storyboard capture cancelled');}
    for(var i=0;i<frames.length;i++){
      check();
      var experiment=frames[i],key=JSON.stringify(experiment),image=images.get(key);
      if(!image){
        image=!options.refresh&&options.lookup?options.lookup(experiment):null;
        if(!image){
          if(options.yieldFrame)await options.yieldFrame();
          check();image=await options.render(experiment);check();
        }
        image=thumbnails.validate(image,experiment.display.mode);
        if(!image)throw Error('Thumbnail unavailable for keyframe '+(i+1));
        images.set(key,image);
        if(options.put)options.put(experiment,image);
      }
      // The portable representation counts repeated images at every index.
      chars+=image.dataUrl.length;
      if(chars>12000000)throw Error('Complete storyboard exceeds the portable image limit (12 million characters)');
      if(options.progress)options.progress(i+1,frames.length);
    }
    check();
    return function(experiment){return images.get(JSON.stringify(experiment))||null;};
  }
  // Create fixed-size GraphX3DX plumbing without document.write, resize timers,
  // shared transforms, or access to the visible player. Same setup as PNG workers.
  function graphForCanvas(canvas,Graph,Camera){
    var graph=Object.create(Graph.prototype);
    graph.InitInternals();graph.Camera=new Camera();
    graph.CameraClipPlaneDist=0;graph.ClipPlaneList=[null];graph.ClipPlaneListSize=1;
    graph.Canvas=canvas;graph.Context2D=canvas.getContext('2d');
    if(!graph.Context2D)throw Error('Storyboard Canvas 2D unavailable');
    graph.ContextScale=1;graph.DevicePixelRatio=1;graph.CanvasPixelRatio=1;graph.PixelRatio=1;
    graph.CanvasWidth=canvas.width;graph.CanvasHeight=canvas.height;graph.AutoScalePix=true;
    graph.UpdateCanvasSize=function(){};graph.SetClipping=function(){};
    graph.SaveAttrs();graph.SaveDefaultAttrs();return graph;
  }
  function renderPair(renderer,graphs,experiment,options){
    var compare=experiment.display.mode==='compare';
    var a=renderer.render(experiment,'A',graphs.A,options);
    var b=compare?renderer.render(experiment,'B',graphs.B,options):null;
    // Match the visible preview's paired fallback policy.
    if(b&&(a.fallback||b.fallback)&&a.quality!==b.quality&&
      (a.quality==='accurate'||b.quality==='accurate')){
      var exact=Object.assign({},options,{quality:'accurate'});
      if(a.quality!=='accurate')renderer.render(experiment,'A',graphs.A,exact);
      if(b.quality!=='accurate')renderer.render(experiment,'B',graphs.B,exact);
    }
    var views=[{layers:[graphs.A.Canvas]}];
    if(compare)views.push({layers:[graphs.B.Canvas]});
    return views;
  }
  return Object.freeze({collect:collect,graphForCanvas:graphForCanvas,renderPair:renderPair});
}));

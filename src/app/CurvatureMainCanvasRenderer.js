/* Optional independent painter output on the existing main Canvas.
 * This adapter is the only place the new world-frame renderer talks to the
 * legacy GraphX3DX viewport. It never invokes DrawModel or replays its trace.
 */
(function(root,factory){
  var api=factory(
    root.CurvatureIndependentComposition||(typeof require==='function'?require('../scene/CurvatureIndependentComposition'):null),
    root.CurvatureRenderFrame||(typeof require==='function'?require('../scene/CurvatureRenderFrame'):null),
    root.CurvatureFrameRenderer||(typeof require==='function'?require('../renderers/CurvatureFrameRenderer'):null),
    root.CurvaturePerspectivePreview||(typeof require==='function'?require('../renderers/CurvaturePerspectivePreview'):null),
    root.CurvatureCanvasProjection||(typeof require==='function'?require('../renderers/CurvatureCanvasProjection'):null),
    root.CurvatureFullSceneDecorations||(typeof require==='function'?require('../scene/CurvatureFullSceneDecorations'):null),
    root.CurvaturePhysicalSceneOptics||(typeof require==='function'?require('../optics/CurvaturePhysicalSceneOptics'):null),
    root.CurvatureSceneContract||(typeof require==='function'?require('../scene/CurvatureSceneContract'):null),
    root.CurvatureScreenSpaceGuides119||(typeof require==='function'?require('../renderers/CurvatureScreenSpaceGuides119'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureMainCanvasRenderer=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(composition,frames,renderer,perspective,projection,decorations,optical,contract,screenGuides){
  'use strict';
  var opticalSession=optical.create();
  function now(){return typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now():Date.now();}
  // During high-frequency camera interaction, only the presentation of dense
  // Globe ground guides is sampled by WHOLE source curves. Never sample
  // individual segments (which would make dotted guides) or touch tower
  // geometry, the physical horizon, or the cached optical field.
  function previewComposition(full){
    var ranges=full.ranges,primitives=full.scene.primitives;
    var guides=ranges.filter(function(r){return r.role==='visual-aid';})
      .reduce(function(n,r){return n+r.count;},0);
    if(guides<12000)return {composition:full,preview:false};
    var chosen=[],outputRanges=[],curveIndex=new Map(),nCurves=0;
    ranges.forEach(function(r){
      var start=chosen.length;
      for(var i=r.start;i<r.end;i++){
        var p=primitives[i],meta=p.metadata||{};
        if(r.role==='visual-aid'&&meta.kind!=='physical-horizon'){
          var key=meta.kind+':'+String(meta.angle);
          if(!curveIndex.has(key))curveIndex.set(key,nCurves++);
          if(curveIndex.get(key)%12!==0)continue;
        }
        chosen.push(Object.assign({},p,{commandIndex:chosen.length}));
      }
      outputRanges.push({name:r.name,role:r.role,start:start,end:chosen.length,count:chosen.length-start});
    });
    var meta=Object.assign({},full.scene.metadata,{layerRanges:outputRanges});
    return {composition:{scene:contract.createScene(full.scene.source,chosen,meta),ranges:outputRanges},
      preview:true,guidePrimitives:guides,drawnGuides:outputRanges.filter(function(r){return r.role==='visual-aid';})
        .reduce(function(n,r){return n+r.count;},0)};
  }
  function selectObject(m){
    var index=m.NObjects[0]===0?1:0;
    if(m.NObjects[0]>0&&m.NObjects[1]>0&&m.ObjDist[0]>m.ObjDist[1])index=1;
    return index;
  }
  function support(m){
    if(m.showModel!==1&&m.showModel!==2)
      return {supported:false,reason:'Independent supports Globe or Flat separately; Both uses Legacy.'};
    for(var i=0;i<2;i++){
      if(m.NObjects[i]>0&&![0,1,2,3].includes(m.ObjType[i]))
        return {supported:false,reason:'Unsupported object group '+(i+1)+' uses Legacy.'};
    }
    return {supported:true,reason:''};
  }
  function configureCamera(g,m){
    // Match the reference camera bootstrap without painting any legacy geometry.
    // GraphX3DX is retained solely as the main Canvas/viewport owner.
    g.SetViewport(0,1,-0.5,-2);
    g.SetGraphClipping(true,'',0);
    g.SetCameraClipping(0.001);
    g.SetWindowToCameraScreen();
    g.SetCamera({SceneSize:m.camSceneSize,CamPos:m.camPos,
      CamUp:m.camUp,CamViewCenter:m.camViewCenter});
    g.SetCameraZoom(1);
    var camera=perspective.snapshot(g.Camera);
    camera.near=g.CameraClipPlaneDist>0?g.CameraClipPlaneDist:1e-6;
    camera.pixelTransform=projection.capture(g,g.Canvas.width,g.Canvas.height);
    return camera;
  }
  function render(g,m){
    var available=support(m);
    if(!available.supported)throw new RangeError(available.reason);
    if(!g||!g.Canvas)throw new TypeError('Main graph Canvas required');
    var width=g.Canvas.width,height=g.Canvas.height;
    if(!Number.isInteger(width)||width<1||!Number.isInteger(height)||height<1)
      throw new RangeError('Invalid main Canvas dimensions');
    var camera=configureCamera(g,m);
    var globe=m.showModel===1;
    var composed=composition.composeMain(m,globe);
    var audit=composition.auditFull(composed);
    if(!audit.rendererReady)throw new Error('Independent composition is not renderer-ready');
    var frame=frames.fromComposition(composed,camera,width,height);
    // GraphX3DX keeps its 2D context scaled for HiDPI. The independent
    // painter projects directly into backing-store pixels, so temporarily
    // remove that graph-owned transform (restoring it for legacy redraws).
    var ctx=g.Canvas.getContext('2d');
    if(!ctx||typeof ctx.save!=='function'||typeof ctx.setTransform!=='function'||
       typeof ctx.restore!=='function')throw new TypeError('Canvas 2D context required');
    var result;
    ctx.save();
    try {
      ctx.setTransform(1,0,0,1,0,0);
      result=renderer.render(g.Canvas,frame,{mode:'painter'});
      if(decorations)decorations.draw(g.Canvas,m,camera);
    } finally {ctx.restore();}
    return {mode:result.mode,primitiveCount:audit.primitiveCount,
      warning:'Independent preview: both object groups are rendered; optical overlays and annotations are not yet ported.'};
  }
  function renderPhysical(g,m,options){
    var available=support(m);
    if(!available.supported)throw RangeError(available.reason);
    if(!g||!g.Canvas)throw TypeError('Main graph Canvas required');
    var frameStart=now(),camera=configureCamera(g,m),ctx=g.Canvas.getContext('2d');
    if(!ctx||typeof ctx.save!=='function'||typeof ctx.setTransform!=='function'||
       typeof ctx.restore!=='function')throw TypeError('Canvas 2D context required');
    // The optical backend transforms the SAME independently authored scene;
    // the exact same frame/painter handles camera, styles and all guides.
    var globe=m.showModel===1;
    var physicalModel=Object.assign({},m,{geometryRadius:m.rEarth});
    var composed=composition.composeOpticalMain(physicalModel,globe);
    var composedAt=now();
    var opticalFrame=opticalSession.transform(composed,physicalModel,options);
    var opticalAt=now();
    var drawSource=options.interactive?previewComposition(opticalFrame.composition):
      {composition:opticalFrame.composition,preview:false};
    var lodStarted=now();
    var guideLod=!options.interactive?screenGuides.simplify(drawSource.composition,
      camera,g.Canvas.width,g.Canvas.height,{tolerancePixels:0.5}):null;
    var drawComposition=guideLod?guideLod.composition:drawSource.composition;
    var lodFinished=now();
    var frame=frames.fromComposition(drawComposition,camera,g.Canvas.width,g.Canvas.height);
    var frameAt=now();
    var painted;
    ctx.save();
    try {
      ctx.setTransform(1,0,0,1,0,0);
      painted=renderer.render(g.Canvas,frame,{mode:'painter'});
      if(decorations)decorations.draw(g.Canvas,m,camera);
    } finally {ctx.restore();}
    var finishedAt=now(),stats=opticalFrame.stats;
    return {interactiveGuidePreview:drawSource.preview,previewGuidePrimitives:drawSource.drawnGuides,
      fullGuidePrimitives:drawSource.guidePrimitives,
      guideScreenLod:guideLod?guideLod.stats:null,
      timings:{totalMs:finishedAt-frameStart,composeMs:composedAt-frameStart,
      opticsMs:opticalAt-composedAt,frameMs:frameAt-opticalAt,
      screenLodMs:lodFinished-lodStarted,snapshotOnlyMs:frameAt-lodFinished,
      paintMs:painted.timings.totalMs,validationMs:painted.timings.validationMs,
      projectionMs:painted.timings.fillGeometryMs,canvasMs:painted.timings.canvasPaintMs,
      decorationsMs:finishedAt-frameAt-painted.timings.totalMs,
      strokeCalls:painted.statistics.canvasStrokeCalls},
      mode:'physical-scene',drawn:stats.visibleSegments,
      unresolved:stats.unresolved,buildMs:stats.buildMs,
      cacheReused:opticalFrame.reused,budgetExceeded:stats.budgetExceeded,
      primitiveCount:frame.scene.primitives.length,
      layerCounts:painted.layerCounts,fieldStats:stats.fieldStats,fieldPrism:stats.fieldPrism,
      opticalStages:stats.opticalStages,opticalWork:stats.opticalWork,
      unresolvedReasons:stats.unresolvedReasons,sampleStatuses:stats.sampleStatuses,
      perGroup:stats.perGroup,step:stats.step,groundHorizon:stats.groundHorizon,
      guideSegments:stats.guideSegments,guideSolves:stats.guideSolves,
      sharedGroundSolves:stats.sharedGroundSolves,
      sharedGroundCacheHits:stats.sharedGroundCacheHits,towerSolves:stats.towerSolves,
      guideRenderExtent:stats.guideRenderExtent,guideCulling:stats.guideCulling,
      fillTriangles:stats.fillTriangles,fillUnresolved:stats.fillUnresolved,
      fillUnresolvedReasons:stats.fillUnresolvedReasons,fillHidden:stats.fillHidden,
      fillSamples:stats.fillSamples,fillSubdivisions:stats.fillSubdivisions,
      warning:'Physical optics in shared painter; physical ground/horizon guides projected through optical rays.'+
        ' Authored foundations are filled where ground-visible; mutual object occlusion is pending.'+
        (stats.budgetExceeded?' Numerical preview budget exceeded.':'')+
        ((stats.sampleStatuses.solver_failed||0)?' Some optical point solves failed.':'')+
        (stats.unresolved?' '+stats.unresolved+' uncertain outline leaves.':'')+
        (stats.fillUnresolved?' '+stats.fillUnresolved+' unresolved fill triangles omitted.':'')};
  }
  function resetPhysicalSession(){opticalSession=optical.create();}
  return {render:render,renderPhysical:renderPhysical,resetPhysicalSession:resetPhysicalSession,previewComposition:previewComposition,support:support,
    supportPhysical:support,selectObject:selectObject,configureCamera:configureCamera};
}));

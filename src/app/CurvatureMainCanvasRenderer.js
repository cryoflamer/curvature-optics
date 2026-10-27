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
    root.CurvatureFullSceneDecorations||(typeof require==='function'?require('../scene/CurvatureFullSceneDecorations'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureMainCanvasRenderer=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(composition,frames,renderer,perspective,projection,decorations){
  'use strict';
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
  return {render:render,support:support,selectObject:selectObject,configureCamera:configureCamera};
}));

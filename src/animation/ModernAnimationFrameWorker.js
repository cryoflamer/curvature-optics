/* One isolated accurate optical renderer per background worker. Import the
 * browser's same production physics and painter in their dependency order.
 * GraphX3DX's DOM canvas constructor must NEVER run in a Worker: only its
 * pure viewport/camera prototype and scratch state are instantiated here.
 */
'use strict';
// GraphX3DX has a top-level requestAnimationFrame polyfill referencing window.
// Alias only that global; no document or DOM canvas is provided.
var window=self;
importScripts(
  '../legacy/GraphX3DX.js',
  '../scene/CurvatureSceneContract.js',
  '../scene/CurvatureRenderFrame.js',
  '../geometry/CurvatureSurfaceGeometry.js',
  '../geometry/CurvaturePhysicalWorldGeometry.js',
  '../geometry/CurvatureCameraTranslation.js',
  '../geometry/CurvatureGeometryEngine.js',
  '../renderers/CurvatureCanvasProjection.js',
  '../renderers/CurvaturePerspectivePreview.js',
  '../renderers/CurvatureViewportReference.js',
  '../renderers/CurvatureNearPlaneReference.js',
  '../renderers/CurvatureFilledPreview.js',
  '../renderers/CurvatureViewportPolygonClip.js',
  '../renderers/CurvatureZBufferPreview.js',
  '../renderers/CurvatureStrokePreview.js',
  '../renderers/CurvatureStyledCombinedPreview.js',
  '../renderers/CurvatureLegacyOrderPreview.js',
  '../scene/CurvatureIndependentComposition.js',
  '../geometry/CurvatureEarClip.js',
  '../renderers/CurvatureFrameRenderer.js',
  '../renderers/CurvatureScreenSpaceGuides.js',
  '../scene/CurvatureFullSceneDecorations.js',
  '../optics/OpticalRayTracer.js',
  '../optics/OpticalRayHorizon.js',
  '../optics/OpticalTargetProjection.js',
  '../optics/OpticalConformalPredictor.js',
  '../optics/OpticalSharedRayField.js',
  '../optics/OpticalFastRayField.js',
  '../optics/OpticalPreviewLod.js',
  '../optics/OpticalTowerSilhouette.js',
  '../optics/CurvaturePhysicalGroundGuides.js',
  '../optics/CurvaturePhysicalPolygonFills.js',
  '../optics/CurvaturePhysicalSceneOptics.js',
  '../app/CurvatureModel.js',
  '../app/CurvaturePhysicalCamera.js',
  '../app/CurvaturePhysicalCurvature.js',
  '../renderers/CurvatureAtmosphericVisibility.js',
  '../app/CurvatureMainCanvasRenderer.js',
  '../ui/modern/ModernSceneState.js',
  '../ui/modern/ModernCompareState.js',
  '../ui/modern/ModernExperimentState.js',
  '../camera/ModernCameraInterpolator.js',
  'ModernAnimationCompatibility.js',
  'ModernAnimationProject.js',
  'ModernAnimationPreview.js',
  'ModernAnimationFrameExport.js'
);

function createGraph(canvas){
  if(typeof JsGraphX3D!=='function'||typeof JsgCamera!=='function')
    throw Error('GraphX3DX camera primitives were not loaded');
  var graph=Object.create(JsGraphX3D.prototype);
  // InitInternals is pure: unlike new JsGraphX3D(), it does not access
  // document, install timers, or create a parser-time DOM canvas.
  graph.InitInternals();
  graph.Camera=new JsgCamera();
  graph.CameraClipPlaneDist=0;
  graph.ClipPlaneList=[null];
  graph.ClipPlaneListSize=1;
  graph.Canvas=canvas;
  graph.Context2D=canvas.getContext('2d');
  if(!graph.Context2D)throw Error('Worker OffscreenCanvas 2D context unavailable');
  graph.ContextScale=1;
  graph.DevicePixelRatio=1;
  graph.CanvasPixelRatio=1;
  graph.PixelRatio=1;
  graph.CanvasWidth=canvas.width;
  graph.CanvasHeight=canvas.height;
  graph.AutoScalePix=true; // Same as the Animation preview graph.
  graph.UpdateCanvasSize=function(){}; // Fixed backing dimensions for the ZIP.
  // The independent painter clips its own world-frame primitives. Legacy
  // GraphX3DX SetClipping draws via a DOM text handler and is not used here.
  graph.SetClipping=function(){};
  graph.SaveAttrs();graph.SaveDefaultAttrs();
  return graph;
}

function errorMessage(error){return String(error&&error.message||error);}
var active=false;
self.onmessage=async function(event){
  var data=event.data;
  if(!data||data.type!=='start'||active)return;
  active=true;
  try{
    if(typeof OffscreenCanvas!=='function')
      throw Error('OffscreenCanvas is not available in this browser worker');
    var api=self.CurvatureModernAnimationFrameExport;
    var plan=api.plan(data.project,{fps:data.fps,width:data.width,height:data.height});
    var contexts={};
    plan.sides.forEach(function(side){
      contexts[side]=createGraph(new OffscreenCanvas(plan.width,plan.height));
    });
    var painter=self.CurvatureModernAnimationPreview.create({
      Model:self.CurveAppClass,
      renderer:self.CurvatureMainCanvasRenderer,
      optics:self.CurvaturePhysicalSceneOptics
    });
    self.postMessage({type:'ready',total:plan.timesMs.length,sides:plan.sides.length});
    var start=performance.now();
    var result=await api.run({project:plan.project,fps:plan.fps,width:plan.width,height:plan.height,
      // Yield between frames so progress messages are delivered promptly.
      yieldUi:function(){return new Promise(function(resolve){setTimeout(resolve,0);});},
      render:function(sample,side,dimensions){
        var graph=contexts[side];
        // Clearing the backing store resets 2D state for each independent frame.
        graph.Canvas.width=dimensions.width;
        graph.Canvas.height=dimensions.height;
        var report=painter.render(sample,side,graph,{quality:'accurate',animationMode:plan.project.mode});
        return {quality:report.quality,canvas:graph.Canvas,metrics:report.result};
      },
      onProgress:function(info){self.postMessage({type:'progress',completed:info.completed,
        total:info.total,timeMs:info.timeMs,elapsedMs:performance.now()-start});}
    });
    if(result.cancelled)throw Error('Unexpected worker cancellation');
    self.postMessage({type:'complete',blob:result.blob,manifest:result.manifest});
  }catch(error){self.postMessage({type:'error',message:errorMessage(error)});}
  finally{active=false;}
};

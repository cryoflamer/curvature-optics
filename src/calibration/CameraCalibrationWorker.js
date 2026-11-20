/* Isolated local camera fit. Terminating the worker cancels the synchronous solver. */
'use strict';
importScripts(
  '../scene/CurvatureSceneContract.js?fit-diagnostics=1',
  '../scene/CurvatureRenderFrame.js?fit-diagnostics=1',
  '../geometry/CurvatureSurfaceGeometry.js?fit-diagnostics=1',
  '../geometry/CurvaturePhysicalWorldGeometry.js?fit-diagnostics=1',
  '../geometry/CurvatureCameraTranslation.js?fit-diagnostics=1',
  '../geometry/CurvatureGeometryEngine.js?fit-diagnostics=1',
  '../renderers/CurvatureCanvasProjection.js?fit-diagnostics=1',
  '../geometry/CurvatureEarClip.js?fit-diagnostics=1',
  '../optics/OpticalRayTracer.js?fit-diagnostics=1',
  '../optics/OpticalRayHorizon.js?fit-diagnostics=1',
  '../optics/OpticalTargetProjection.js?fit-diagnostics=1',
  '../optics/OpticalConformalPredictor.js?fit-diagnostics=1',
  '../optics/OpticalSharedRayField.js?fit-diagnostics=1',
  '../optics/OpticalFastRayField.js?fit-diagnostics=1',
  '../optics/OpticalPreviewLod.js?fit-diagnostics=1',
  '../optics/OpticalTowerSilhouette.js?fit-diagnostics=1',
  '../optics/CurvaturePhysicalGroundGuides.js?fit-diagnostics=1',
  '../optics/CurvaturePhysicalPolygonFills.js?fit-diagnostics=1',
  '../optics/CurvaturePhysicalSceneOptics.js?fit-diagnostics=1',
  '../optics/OpticalEffectiveRadiusPreview.js?fit-diagnostics=1',
  '../app/CurvaturePhysicalCamera.js?fit-diagnostics=1',
  '../renderers/CurvatureAtmosphericVisibility.js?fit-diagnostics=1',
  '../renderers/CurvatureCanvasDirectPreview.js?fit-diagnostics=1',
  'CameraMaterialAnchor.js?fit-diagnostics=1',
  'CameraMaterialAnchorResolver.js?projection-bank=1&fit-diagnostics=1',
  'CameraLandmarkProjection.js?vertex-scale=1&material-projection=1&material-fit=1&fit-diagnostics=1',
  'CameraPhysicalPose.js?fit-diagnostics=1',
  'CameraPhysicalFit.js?progress=1&vertex-scale=1&material-fit=1&fit-diagnostics=1'
);
self.onmessage=event=>{
  try{
    const {model,input,options}=event.data;
    const result=self.CurvatureCameraPhysicalFit.fit(model,model,input,{...options,method:'canvas-direct',
      onProgress:result=>self.postMessage({type:'progress',result})});
    self.postMessage({type:'complete',result,revision:'fit-diagnostics-1'});
  }catch(error){self.postMessage({type:'error',message:String(error?.message||error)});}
};

/* Isolated local camera fit. Terminating the worker cancels the synchronous solver. */
'use strict';
importScripts(
  '../scene/CurvatureSceneContract.js',
  '../scene/CurvatureRenderFrame.js',
  '../geometry/CurvatureSurfaceGeometry.js',
  '../geometry/CurvaturePhysicalWorldGeometry.js',
  '../geometry/CurvatureCameraTranslation.js',
  '../geometry/CurvatureGeometryEngine.js',
  '../renderers/CurvatureCanvasProjection.js',
  '../geometry/CurvatureEarClip.js',
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
  '../optics/OpticalEffectiveRadiusPreview.js',
  '../app/CurvaturePhysicalCamera.js',
  '../renderers/CurvatureAtmosphericVisibility.js',
  '../renderers/CurvatureCanvasDirectPreview.js',
  'CameraLandmarkProjection.js?vertex-scale=1',
  'CameraPhysicalPose.js',
  'CameraPhysicalFit.js?progress=1&vertex-scale=1'
);
self.onmessage=event=>{
  try{
    const {model,input,options}=event.data;
    const result=self.CurvatureCameraPhysicalFit.fit(model,model,input,{...options,method:'canvas-direct',
      onProgress:result=>self.postMessage({type:'progress',result})});
    self.postMessage({type:'complete',result});
  }catch(error){self.postMessage({type:'error',message:String(error?.message||error)});}
};

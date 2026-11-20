/* Fixed photo registration in backing-store pixels.
 * Pure presentation math: no DOM, live camera, renderer, fit or storage.
 * The caller owns original/archive verification and completed-render freshness.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernPhotoOverlayRegistration=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SENSOR_DIAGONAL=43.2;
  const ASPECTS=Object.freeze([1.5,2/3,16/9,9/16]);
  const positive=n=>Number.isFinite(n)&&n>0;
  const dimension=n=>Number.isSafeInteger(n)&&n>0;
  const rectangle=(x,y,width,height)=>Object.freeze({x,y,width,height});

  // CurvaturePhysicalCamera.create uses a vertical scene size for <=3:2,
  // and width/1.5 for wider views. This is the existing camera convention,
  // not an image contain/cover rule or an EXIF focal length.
  function aspectFactor(ratio){
    return Math.hypot(1,ratio)/Math.max(1,ratio/1.5);
  }
  function create(origin){
    const width=origin?.photo?.width,height=origin?.photo?.height;
    const baseline=origin?.baselineCamera,focal=baseline?.FocalLengthField;
    if(!dimension(width)||!dimension(height)||width>32768||height>32768||width*height>100000000)
      throw RangeError('Invalid original photo dimensions');
    if(baseline?.viewcenterHorizon!==3||!positive(focal))
      throw RangeError('Calibrated Eye-Lvl baseline required');
    const angle=2*Math.atan(SENSOR_DIAGONAL/(2*focal))*180/Math.PI;
    if(angle<.1-1e-12||angle>160+1e-12)
      throw RangeError('Baseline field of view outside supported range');
    // Same centered, square-pixel pinhole as CameraPhysicalPose.photoCamera.
    // Keep only immutable scalar inputs; live poses are never consulted.
    const photoAspectFactor=aspectFactor(width/height);
    const focalPx=height*(focal/SENSOR_DIAGONAL)*photoAspectFactor;
    function ray(pixel){
      if(!Array.isArray(pixel)||pixel.length!==2||!pixel.every(Number.isFinite))
        throw RangeError('Invalid photo pixel');
      return [(pixel[0]-width/2)/focalPx,(height/2-pixel[1])/focalPx,1];
    }
    // Inputs are a completed layout, NOT a projection camera. Use its
    // actual captured pixelTransform, the render's selected display aspect
    // and camera screenSize, never the live focal/pose/sceneSize/zoom.
    function layout({aspect,width:canvasWidth,height:canvasHeight,screenSize,pixelTransform:v}={}){
      if(!ASPECTS.some(a=>Math.abs(a-aspect)<1e-8)||!Number.isFinite(aspect))
        throw RangeError('Unsupported Scene display aspect');
      if(!dimension(canvasWidth)||!dimension(canvasHeight)||!positive(screenSize)||
        !v||v.width!==canvasWidth||v.height!==canvasHeight||
        !positive(v.scaleX)||!positive(-v.scaleY)||!positive(v.contextScale)||
        ![v.offsetX,v.offsetY].every(Number.isFinite))
        throw RangeError('Completed viewport transform required');
      // GraphX3DX.SetWindowToCameraScreen uses VpWidth/VpHeight, while
      // SetWindow uses VpInnerWidth/Height (minus one logical pixel).
      // Permit that bounded edge-rounding discrepancy, not arbitrary
      // anisotropy. The vertical convention supplies ONE uniform scale.
      const windowSkewPx=Math.abs(v.scaleX+v.scaleY)*screenSize;
      const roundingBudget=v.contextScale*(1+canvasHeight/canvasWidth);
      if(windowSkewPx>roundingBudget+1e-9*Math.max(1,roundingBudget))
        throw RangeError('Viewport has unsupported nonuniform pixel scale');
      // Both sides use the same baseline focal field; it cancels in the
      // ratio. Changing the live focal field cannot resize the photo.
      const ratio=aspectFactor(aspect)/(height*photoAspectFactor);
      const scale=-v.scaleY*screenSize*ratio;
      const horizontalScale=v.scaleX*screenSize*ratio;
      const w=width*scale,h=height*scale,x=v.offsetX-w/2,y=v.offsetY-h/2;
      if(!positive(scale)||!positive(w)||!positive(h)||
        ![x,y,x+w,y+h,horizontalScale].every(Number.isFinite))
        throw RangeError('Invalid registered photo rectangle');
      const left=Math.max(0,x),top=Math.max(0,y),
        right=Math.min(canvasWidth,x+w),bottom=Math.min(canvasHeight,y+h);
      const rect=rectangle(x,y,w,h);
      // Clipping is only an intersection for presentation; do NOT draw
      // the whole photo into this smaller rectangle.
      const clip=right>left&&bottom>top?rectangle(left,top,right-left,bottom-top):null;
      return Object.freeze({rect,clip,scale,
        maxHorizontalErrorPx:Math.abs(horizontalScale-scale)*width/2});
    }
    return Object.freeze({width,height,focalPx,ray,layout});
  }
  return Object.freeze({create});
}));

/* Convert independent camera-screen coordinates into Canvas backing-store pixels.
 * Only the 2D window transform and Canvas scale are captured from GraphX3DX;
 * the camera, clipping, tessellation and visibility remain independent. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CurvatureCanvasProjection=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function finite(v){return typeof v==='number'&&Number.isFinite(v);}
function capture(graph,width,height){
 if(!graph||!graph.WinTrans||!(graph.ContextScale>0)||!(width>0&&height>0))throw new TypeError('Missing legacy window transform');
 var w=graph.WinTrans,k=graph.ContextScale;
 if(![w.ScaleX,w.ScaleY,w.OffsetX,w.OffsetY].every(finite))throw new TypeError('Invalid legacy window transform');
 return {width:width,height:height,scaleX:w.ScaleX*k,scaleY:w.ScaleY*k,
  offsetX:w.OffsetX*k,offsetY:w.OffsetY*k,contextScale:k,
  stroke:{autoScale:!!graph.AutoScalePix,pixelScale:graph.GetPixScaling(),
   minWidth:graph.MinLineWidth,scaleInt:!!graph.ScalePixInt,devicePixelRatio:graph.DevicePixelRatio}};
}
function resolve(camera,width,height){
 if(!(width>0&&height>0)||!camera||!(camera.screenSize>0))throw new TypeError('Invalid projection parameters');
 var v=camera.pixelTransform;
 if(v){
  if(v.width!==width||v.height!==height||![v.scaleX,v.scaleY,v.offsetX,v.offsetY].every(finite))throw new TypeError('Canvas projection does not match captured pixels');
  return {scaleX:v.scaleX,scaleY:v.scaleY,offsetX:v.offsetX,offsetY:v.offsetY,mode:'captured-GraphX3DX-window'};
 }
 // Existing snapshots and small synthetic fixtures have no viewport capture.
 var scale=height/camera.screenSize;
 return {scaleX:scale,scaleY:-scale,offsetX:width/2,offsetY:height/2,mode:'legacy-full-canvas-fallback'};
}
function point(view,x,y,depth){var p=[view.offsetX+x*view.scaleX,view.offsetY+y*view.scaleY];if(depth!==undefined)p.push(depth);return p;}
function lineWidth(raw,camera){
 var cfg=camera&&camera.pixelTransform;
 if(!cfg||!cfg.stroke)return raw===0?1:Math.max(0.01,finite(raw)?raw:1);
 var s=cfg.stroke,width=finite(raw)?Math.max(0,raw):1;
 if(width>0&&s.autoScale){
  width=Math.max(width*s.pixelScale,s.minWidth);
  if(s.scaleInt)width=Math.max(1,Math.round(width));
 }
 if(width===0)width=1/s.devicePixelRatio;
 return width*cfg.contextScale;
}
return {capture:capture,resolve:resolve,point:point,lineWidth:lineWidth};
});

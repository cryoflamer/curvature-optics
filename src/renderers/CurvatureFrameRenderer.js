/* One rendering entrypoint for world-space frames. Painter ordering and
 * z-buffering consume the same validated snapshot but have distinct semantics:
 * a globe painter mask is NOT a substitute for physical depth occlusion.
 * The default DrawModel/GraphX3DX path is untouched.
 */
(function(root,factory){
  var api=factory(
    root.CurvatureRenderFrame||(typeof require==='function'?require('../scene/CurvatureRenderFrame'):null),
    root.CurvatureZBufferPreview||(typeof require==='function'?require('./CurvatureZBufferPreview'):null),
    root.CurvatureLegacyOrderPreview||(typeof require==='function'?require('./CurvatureLegacyOrderPreview'):null),
    root.CurvatureEarClip||(typeof require==='function'?require('../geometry/CurvatureEarClip'):null),
    root.CurvatureWebGLGeometryRenderer||(typeof require==='function'?require('./CurvatureWebGLGeometryRenderer'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureFrameRenderer=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(frames,zbuffer,painter,earClip,gpuPainter){
  'use strict';
  if(!frames||!zbuffer||!painter||!earClip)throw new Error('World frame and independent renderers required');
  var MODES=['painter','zbuffer','gpu-painter'];
  function now(){return typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now():Date.now();}
  function modeFrom(options){
    var mode=(options&&options.mode)||'painter';
    if(!MODES.includes(mode))throw new RangeError('Unknown world-frame renderer mode');
    return mode;
  }
  function paintValidated(canvas,snapshot,mode,start,validated){
    var width=snapshot.viewport.width,height=snapshot.viewport.height;
    if(!canvas||typeof canvas.getContext!=='function'||canvas.width!==width||canvas.height!==height)
      throw new RangeError('Canvas viewport does not match scene frame');
    if(typeof earClip.triangulate!=='function')throw new TypeError('Ear clipping triangulator required');
    var result,geometry,built=validated;
    if(mode==='painter'||mode==='gpu-painter'){
      geometry=zbuffer.build(snapshot.scene,snapshot.camera,width,height,earClip.triangulate);
      built=now();
      if(mode==='gpu-painter'){
        try {
          if(!gpuPainter||typeof gpuPainter.draw!=='function')throw Error('GPU painter module unavailable');
          result=gpuPainter.draw(canvas,snapshot.scene,snapshot.camera,geometry.triangles);
        } catch(error) {
          // Never leave the physical canvas blank if GPU is unavailable/lost.
          result=painter.draw(canvas,snapshot.scene,snapshot.camera,geometry.triangles);
          result.gpuFallback=String(error&&error.message||error);
        }
      } else result=painter.draw(canvas,snapshot.scene,snapshot.camera,geometry.triangles);
    }else{
      result=zbuffer.draw(canvas,snapshot.scene,snapshot.camera,earClip.triangulate);
    }
    var finished=now();
    return {mode:mode==='gpu-painter'&&!result.gpuFallback?'gpu-painter':
        mode==='gpu-painter'?'painter':mode,
      requestedMode:mode,gpuFallback:result.gpuFallback||null,statistics:result.statistics,geometryStatistics:geometry?geometry.statistics:result.statistics,
      timings:{validationMs:validated-start,snapshotMs:validated-start,
        fillGeometryMs:built-validated,canvasPaintMs:finished-built,totalMs:finished-start},
      layerCounts:snapshot.layers.map(function(layer){return {name:layer.name,role:layer.role,count:layer.count};})};
  }
  function render(canvas,frame,options){
    // Public frame entrypoint retains full defensive validation, including for
    // callers who mutate an otherwise valid frame after constructing it.
    var mode=modeFrom(options),start=now(),snapshot=frames.validate(frame);
    return paintValidated(canvas,snapshot,mode,start,now());
  }
  function renderComposition(canvas,composed,camera,width,height,options){
    // Atomic composition-to-Canvas entrypoint: fromComposition creates and
    // validates an owned snapshot, which cannot be modified by a caller
    // between its creation and painting. Avoid the redundant second frame
    // serialization while retaining public render(frame) validation.
    var mode=modeFrom(options),start=now();
    if(!canvas||typeof canvas.getContext!=='function'||canvas.width!==width||canvas.height!==height)
      throw new RangeError('Canvas viewport does not match scene frame');
    var snapshot=frames.fromComposition(composed,camera,width,height);
    return paintValidated(canvas,snapshot,mode,start,now());
  }
  return {MODES:MODES.slice(),render:render,renderComposition:renderComposition};
}));

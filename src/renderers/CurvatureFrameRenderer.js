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
    root.CurvatureEarClip||(typeof require==='function'?require('../geometry/CurvatureEarClip'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureFrameRenderer=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(frames,zbuffer,painter,earClip){
  'use strict';
  if(!frames||!zbuffer||!painter||!earClip)throw new Error('World frame and independent renderers required');
  var MODES=['painter','zbuffer'];
  function now(){return typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now():Date.now();}
  function render(canvas,frame,options){
    options=options||{};
    var mode=options.mode||'painter';
    if(!MODES.includes(mode))throw new RangeError('Unknown world-frame renderer mode');
    // Validate and copy before any Canvas call to prevent partial drawing of
    // malformed data or subsequent mutation of the caller's input frame.
    var start=now(),snapshot=frames.validate(frame),validated=now(),width=snapshot.viewport.width,height=snapshot.viewport.height;
    if(!canvas||typeof canvas.getContext!=='function'||canvas.width!==width||canvas.height!==height)
      throw new RangeError('Canvas viewport does not match scene frame');
    if(typeof earClip.triangulate!=='function')throw new TypeError('Ear clipping triangulator required');
    var result,geometry,built=validated;
    if(mode==='painter'){
      geometry=zbuffer.build(snapshot.scene,snapshot.camera,width,height,earClip.triangulate);
      built=now();
      result=painter.draw(canvas,snapshot.scene,snapshot.camera,geometry.triangles);
    }else{
      result=zbuffer.draw(canvas,snapshot.scene,snapshot.camera,earClip.triangulate);
    }
    var finished=now();
    return {mode:mode,statistics:result.statistics,geometryStatistics:geometry?geometry.statistics:result.statistics,
      timings:{validationMs:validated-start,fillGeometryMs:built-validated,canvasPaintMs:finished-built,totalMs:finished-start},
      layerCounts:snapshot.layers.map(function(layer){return {name:layer.name,role:layer.role,count:layer.count};})};
  }
  return {MODES:MODES.slice(),render:render};
}));

/* Explicit capture bridge. Legacy frames must be captured by the caller from
 * the real DrawModel canvas; this module never substitutes a synthetic frame.
 * The candidate uses the independent world-space composition and painter renderer.
 */
(function(root,factory){
 var api=factory(root.CurvatureCompositionComparison||(typeof require==='function'?require('./CurvatureCompositionComparison'):null),root.CurvatureZBufferPreview||(typeof require==='function'?require('./CurvatureZBufferPreview'):null),root.CurvatureLegacyOrderPreview||(typeof require==='function'?require('./CurvatureLegacyOrderPreview'):null),root.CurvatureEarClip||(typeof require==='function'?require('./CurvatureEarClip'):null),root.CurvatureIndependentComposition||(typeof require==='function'?require('./CurvatureIndependentComposition'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.CurvatureCompositionCapture=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(comparison,zbuffer,painter,earClip,composition){
 'use strict';
 function pixels(canvas,width,height){
  if(!canvas||canvas.width!==width||canvas.height!==height)throw new RangeError('Canvas viewport mismatch');
  var ctx=canvas.getContext('2d');if(!ctx||typeof ctx.getImageData!=='function')throw new TypeError('Readable 2D canvas required');
  return new Uint8ClampedArray(ctx.getImageData(0,0,width,height).data);
 }
 function capture(args){
  if(!args||typeof args.captureLegacy!=='function'||typeof args.createCanvas!=='function')throw new TypeError('Legacy capture and independent canvas factory required');
  var width=args.width,height=args.height;
  if(!Number.isInteger(width)||width<1||!Number.isInteger(height)||height<1)throw new RangeError('Invalid viewport');
  if(!args.camera||typeof args.camera!=='object')throw new TypeError('Camera snapshot required');
  // Full-scene capture is explicit: preserve the original partial-scene default.
  var full=args.compositionScope==='full';
  if(args.compositionScope!=null && !full && args.compositionScope!=='partial')
   throw new RangeError('Unknown composition scope');
  var prepared;
  if(full){
   if(!composition||typeof composition.composeFull!=='function')throw new Error('Full composition unavailable');
   var assembled=composition.composeFull(args.model,args.objectIndex,args.globe,args.geometryOptions);
   var audit=composition.auditFull(assembled);
   if(!audit.rendererReady)throw new Error('Full composition is not renderer-ready');
   prepared={scene:assembled.scene,audit:audit,limitations:assembled.scene.metadata.limitations};
  }else prepared=comparison.prepare(args.model,args.objectIndex,args.globe,args.geometryOptions);
  // Capture the reference first. It must be the actual legacy output, not a
  // frame produced from the independent scene.
  var legacy=args.captureLegacy({width:width,height:height,camera:args.camera});
  if(!legacy||!legacy.canvas)throw new TypeError('Legacy capture must return {canvas,camera}');
  if(!legacy.camera)throw new TypeError('Legacy camera metadata required');
  var reference={width:width,height:height,camera:legacy.camera,rgba:pixels(legacy.canvas,width,height)};
  var canvas=args.createCanvas(width,height);
  if(!canvas||canvas.width!==width||canvas.height!==height||canvas===legacy.canvas)throw new TypeError('Distinct candidate canvas with matching dimensions required');
  var camera=args.camera;
  // Fail explicitly instead of silently using fan triangulation.
  if(!earClip||typeof earClip.triangulate!=='function')throw new Error('CurvatureEarClip.triangulate is required before composition capture');
  var triangles=zbuffer.build(prepared.scene,camera,width,height,earClip.triangulate).triangles;
  var render=painter.draw(canvas,prepared.scene,camera,triangles);
  var candidate={width:width,height:height,camera:camera,rgba:pixels(canvas,width,height)};
  var result=comparison.compare(reference,candidate,args.compareOptions);
  if(full)result.caveats=result.caveats.filter(function(x){return !x.includes('only type-2 towers');}).concat([
   'Full independent guides still omit labels, optical overlays and unsupported object types',
   'Guide discretization and painter ordering may differ from legacy DrawModel']);
  return {comparison:result,reference:reference,candidate:candidate,compositionAudit:prepared.audit,renderStatistics:render.statistics,limitations:prepared.limitations,compositionScope:full?'full':'partial'};
 }
 return {capture:capture};
}));

/* Explicit capture bridge. Legacy frames must be captured by the caller from
 * the real DrawModel canvas; this module never substitutes a synthetic frame.
 * The candidate uses the independent world-space composition and painter renderer.
 */
(function(root,factory){
 var api=factory(root.CurvatureCompositionComparison||(typeof require==='function'?require('./CurvatureCompositionComparison'):null),root.CurvatureRenderFrame||(typeof require==='function'?require('../scene/CurvatureRenderFrame'):null),root.CurvatureFrameRenderer||(typeof require==='function'?require('../renderers/CurvatureFrameRenderer'):null),root.CurvatureIndependentComposition||(typeof require==='function'?require('../scene/CurvatureIndependentComposition'):null),root.CurvatureFullSceneDecorations||(typeof require==='function'?require('../scene/CurvatureFullSceneDecorations'):null),root.CurvatureRegionComparison||(typeof require==='function'?require('./CurvatureRegionComparison'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.CurvatureCompositionCapture=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(comparison,frames,renderer,composition,decorations,regions){
 'use strict';
 function pixels(canvas,width,height){
  if(!canvas||canvas.width!==width||canvas.height!==height)throw new RangeError('Canvas viewport mismatch');
  var ctx=canvas.getContext('2d');if(!ctx||typeof ctx.getImageData!=='function')throw new TypeError('Readable 2D canvas required');
  return new Uint8ClampedArray(ctx.getImageData(0,0,width,height).data);
 }
 function capture(args){
  if(!args||(typeof args.captureLegacy!=='function'&&!args.legacyReference)||typeof args.createCanvas!=='function')throw new TypeError('Legacy capture or reference and independent canvas factory required');
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
   prepared={scene:assembled.scene,ranges:assembled.ranges,audit:audit,limitations:assembled.scene.metadata.limitations};
  }else prepared=comparison.prepare(args.model,args.objectIndex,args.globe,args.geometryOptions);
  // A caller may reuse the exact same immutable reference for partial and full
  // comparisons. This avoids recapturing a mutable legacy canvas between modes.
  var reference;
  if(args.legacyReference){
   var supplied=args.legacyReference;
   if(supplied.width!==width||supplied.height!==height||!supplied.camera||
      !supplied.rgba||supplied.rgba.length!==width*height*4)
    throw new RangeError('Invalid shared legacy reference');
   reference={width:width,height:height,camera:supplied.camera,
    rgba:new Uint8ClampedArray(supplied.rgba)};
  }else{
   var legacy=args.captureLegacy({width:width,height:height,camera:args.camera});
   if(!legacy||!legacy.canvas)throw new TypeError('Legacy capture must return {canvas,camera}');
   if(!legacy.camera)throw new TypeError('Legacy camera metadata required');
   reference={width:width,height:height,camera:legacy.camera,rgba:pixels(legacy.canvas,width,height)};
  }
  var canvas=args.createCanvas(width,height);
  if(!canvas||canvas.width!==width||canvas.height!==height||(typeof legacy!=='undefined'&&legacy&&canvas===legacy.canvas))throw new TypeError('Distinct candidate canvas with matching dimensions required');
  var camera=args.camera;
  // Both independent renderers now consume the same validated world frame.
  // Keep painter ordering as the reference-comparison default; z-buffer depth
  // semantics are deliberately opt-in rather than a disguised paint-order mask.
  var frame=frames.fromComposition(prepared,camera,width,height);
  var render=renderer.render(canvas,frame,{mode:args.rendererMode||'painter'});
  // Capture the geometry before drawing frame/captions. Full-frame parity
  // includes the decorations, while a separately reported geometry score
  // excludes their measured bounds from both reference and candidate.
  var geometricRgba=full?pixels(canvas,width,height):null;
  var deco=full&&decorations?decorations.draw(canvas,args.model,camera):null;
  if(deco)render.statistics.decorations={frameSegments:deco.frameSegments,captionCount:deco.captionCount};
  var candidate={width:width,height:height,camera:camera,rgba:pixels(canvas,width,height)};
  var result=comparison.compare(reference,candidate,args.compareOptions);
  var geometryForeground=null;
  if(full&&deco&&regions){
   geometryForeground=regions.compare(reference.rgba,geometricRgba,width,height,deco.excludedRects,
     args.compareOptions&&args.compareOptions.foregroundThreshold);
  }
  if(full)result.caveats=result.caveats.filter(function(x){return !x.includes('only type-2 towers');}).concat([
   'The frame and demo captions are now separately rendered without legacy GraphX3DX',
   'Data annotations, optical overlays and unsupported object types are not yet ported',
   'Guide discretization and painter ordering may differ from legacy DrawModel']);
  return {comparison:result,reference:reference,candidate:candidate,compositionAudit:prepared.audit,renderStatistics:render.statistics,limitations:prepared.limitations,geometryForeground:geometryForeground,decorations:deco,compositionScope:full?'full':'partial'};
 }
 return {capture:capture};
}));

/* Opt-in frame comparison: only genuine, externally captured RGBA frames. */
(function(root,factory){
 var api=factory(root.CurvatureIndependentComposition||(typeof require==='function'?require('../scene/CurvatureIndependentComposition'):null),root.CurvaturePixelComparison||(typeof require==='function'?require('./CurvaturePixelComparison'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.CurvatureCompositionComparison=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(composition,pixels){
 'use strict';
 function ordered(value){if(Array.isArray(value))return value.map(ordered);if(value&&typeof value==='object'){var obj={};Object.keys(value).sort().forEach(function(k){obj[k]=ordered(value[k]);});return obj;}return value;}
 function cameraKey(camera){if(!camera||typeof camera!=='object')throw new TypeError('Camera required');return JSON.stringify(ordered(camera));}
 function prepare(model,objIx,globe,options){var result=composition.compose(model,objIx,globe,options),audit=composition.audit(result);if(!audit.rendererReady)throw new Error('Composition is not renderer-ready');return {scene:result.scene,audit:audit,ranges:result.ranges,limitations:result.scene.metadata.limitations};}
 function compare(reference,candidate,options){options=options||{};
  if(!reference||!candidate||!Number.isInteger(reference.width)||!Number.isInteger(reference.height)||reference.width<1||reference.height<1)throw new TypeError('Valid reference viewport required');
  if(reference.width!==candidate.width||reference.height!==candidate.height)throw new RangeError('Viewport mismatch');
  if(cameraKey(reference.camera)!==cameraKey(candidate.camera))throw new RangeError('Camera mismatch');
  var w=reference.width,h=reference.height;
  if(!reference.rgba||!candidate.rgba||reference.rgba.length!==w*h*4||candidate.rgba.length!==w*h*4)throw new RangeError('RGBA buffer mismatch');
  var foreground=pixels.compare(reference.rgba,candidate.rgba,w,h,options.foregroundThreshold),edges=pixels.compareEdges(reference.rgba,candidate.rgba,w,h,options.edges),rgba=pixels.compareRgba(reference.rgba,candidate.rgba,w,h);
  return {cameraMatched:true,viewport:{width:w,height:h},foreground:foreground.statistics,edges:edges.statistics,rgba:rgba,differenceImages:{foreground:foreground.rgba,edges:edges.rgba},caveats:['Frames must originate from separate render pipelines','Camera metadata equality does not prove projection parity','Independent scene includes only type-2 towers and polygonal horizon','White mask can hide geometry discrepancies']};
 }
 return {prepare:prepare,compare:compare};
}));

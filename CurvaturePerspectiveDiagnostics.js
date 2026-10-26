/* Serialize the actual independent perspective projection result for ZIP diagnostics. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CurvaturePerspectiveDiagnostics=api;}(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function summarize(result,camera){
 if(!result||!Array.isArray(result.segments))throw new TypeError('Missing perspective result');
 var keys=['skippedBehindCamera','clippedOutsideViewport','clippedToViewport','clippedAtNearPlane'];
 var out={camera:camera,segments:result.segments.length};
 keys.forEach(function(key){if(!Number.isSafeInteger(result[key])||result[key]<0)throw new TypeError('Invalid perspective counter: '+key);out[key]=result[key];});
 if(result.clippingMode!=='independent-near-and-viewport')throw new TypeError('Unexpected perspective clipping mode');
 out.clippingMode=result.clippingMode;
 out.limitations=['Independent near-plane and diagnostic viewport line clipping; not verified against legacy clipping','No polygon fill, depth ordering or legacy styling'];
 return out;
}
return {summarize:summarize};
}));

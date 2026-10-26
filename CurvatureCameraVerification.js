/* Numerical comparison against the original camera transform. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CurvatureCameraVerification=api;}(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function sub(a,b){return a.map(function(v,i){return v-b[i];});}
function dot(a,b){return a.reduce(function(s,v,i){return s+v*b[i];},0);}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function unit(a){var n=Math.hypot.apply(null,a);if(!(n>0))throw new RangeError('Degenerate camera basis');return a.map(function(v){return v/n;});}
function verify(scene,camera,preview,tolerance){
 if(!scene||!Array.isArray(scene.primitives)||!camera||typeof camera.Trans!=='function')throw new TypeError('Invalid verification inputs');
 tolerance=tolerance===undefined?1e-7:tolerance;
 var c=preview.snapshot(camera),back=unit(sub(c.pos,c.center)),right=unit(cross(unit(c.up),back)),up=unit(cross(back,right));
 var distance=Math.hypot.apply(null,sub(c.center,c.pos)),focal=c.sceneSize!==0?c.screenSize/c.sceneSize*(distance-c.objectZExtend):1;
 var r={passed:true,tolerance:tolerance,comparedPoints:0,comparedCoordinates:0,skippedBehindCamera:0,maxAbsoluteError:0,firstMismatch:null};
 scene.primitives.forEach(function(p){p.points.forEach(function(v,i){var d=sub(v,c.pos),depth=-dot(d,back);
  if(!(depth>1e-6)){r.skippedBehindCamera++;return;}
  var legacy=camera.Trans(v),actual=[dot(d,right)*focal*c.zoom/depth,dot(d,up)*focal*c.zoom/depth];
  r.comparedPoints++;
  for(var j=0;j<2;j++){var error=Math.abs(actual[j]-legacy[j]);r.comparedCoordinates++;if(!Number.isFinite(error)||error>tolerance){r.passed=false;if(!r.firstMismatch)r.firstMismatch={commandIndex:p.commandIndex,vertexIndex:i,axis:j?'y':'x',independent:actual[j],legacy:legacy[j],absoluteError:error};}if(Number.isFinite(error))r.maxAbsoluteError=Math.max(r.maxAbsoluteError,error);}
 });});return r;
}
return {verify:verify};
}));

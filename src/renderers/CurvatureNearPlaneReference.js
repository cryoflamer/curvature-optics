/* Independent parametric half-space reference for camera-space near clipping. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CurvatureNearPlaneReference=api;}(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function clip(a,b,near){
 if(!a||!b||![a.x,a.y,a.z,b.x,b.y,b.z,near].every(Number.isFinite)||!(near>0))throw new TypeError('Invalid near-plane segment');
 var dz=b.z-a.z,t0=0,t1=1;
 if(dz===0){if(a.z<=near)return null;}
 else if(dz>0)t0=Math.max(0,(near-a.z)/dz);
 else t1=Math.min(1,(near-a.z)/dz);
 if(t0>t1||t1<0||t0>1||a.z<=near&&b.z<=near)return null;
 function at(t){return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};}
 return [at(t0),at(t1)];
}
function compare(actual,expected,tolerance){
 if(actual===null||expected===null)return actual===expected?0:Infinity;
 var error=0;
 for(var i=0;i<2;i++)for(var k of ['x','y','z']){
  if(!Number.isFinite(actual[i][k])||!Number.isFinite(expected[i][k]))return Infinity;
  error=Math.max(error,Math.abs(actual[i][k]-expected[i][k]));
 }
 return error<=tolerance?error:Infinity;
}
return {clip:clip,compare:compare};
}));

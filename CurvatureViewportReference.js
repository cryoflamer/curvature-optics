/* Independent Cohen-Sutherland reference for diagnostic viewport line clipping.
   This checks the viewport operation, NOT GraphX3DX's clipping semantics. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CurvatureViewportReference=api;}(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function code(x,y,w,h){return (x<0?1:0)|(x>w?2:0)|(y<0?4:0)|(y>h?8:0);}
function clip(a,b,w,h){
 var x0=a[0],y0=a[1],x1=b[0],y1=b[1];
 if(![x0,y0,x1,y1,w,h].every(Number.isFinite)||!(w>0&&h>0))throw new TypeError('Invalid clipping input');
 for(var i=0;i<8;i++){
  var c0=code(x0,y0,w,h),c1=code(x1,y1,w,h);
  if(!(c0|c1))return [[x0,y0],[x1,y1]];
  if(c0&c1)return null;
  var c=c0||c1,x,y;
  if(c&8){if(y1===y0)return null;x=x0+(x1-x0)*(h-y0)/(y1-y0);y=h;}
  else if(c&4){if(y1===y0)return null;x=x0+(x1-x0)*(0-y0)/(y1-y0);y=0;}
  else if(c&2){if(x1===x0)return null;y=y0+(y1-y0)*(w-x0)/(x1-x0);x=w;}
  else {if(x1===x0)return null;y=y0+(y1-y0)*(0-x0)/(x1-x0);x=0;}
  if(c===c0){x0=x;y0=y;}else{x1=x;y1=y;}
 }
 throw new Error('Reference clip failed to converge');
}
function compare(actual,expected,tolerance){
 if(!actual||!expected)return actual===expected?0:Infinity;
 var error=0;
 for(var i=0;i<2;i++)for(var j=0;j<2;j++){
  var delta=Math.abs(actual[i][j]-expected[i][j]);
  if(!Number.isFinite(delta))return Infinity;
  error=Math.max(error,delta);
 }
 return error<=tolerance?error:Infinity;
}
return {clip:clip,compare:compare};
}));

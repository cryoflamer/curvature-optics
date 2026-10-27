/* Clip perspective-projected fill polygons to the visible pixel rectangle.
 * Each vertex is [screenX,screenY,cameraZ].  At intersections, interpolate
 * inverse camera depth in screen space, not cameraZ linearly.
 */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CurvatureViewportPolygonClip=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function clip(points,width,height){
 if(!(width>0&&height>0)||!Array.isArray(points)||points.some(p=>p.length!==3||!p.every(Number.isFinite)||p[2]<=0))return [];
 var result=points.map(p=>p.slice());
 for(var side=0;side<4;side++){
  var axis=side<2?0:1,limit=side===0||side===2?0:(side===1?width:height),keepAbove=side===0||side===2,out=[];
  function inside(p){return keepAbove?p[axis]>=limit:p[axis]<=limit;}
  function cut(a,b){var t=(limit-a[axis])/(b[axis]-a[axis]),inv=(1-t)/a[2]+t/b[2],p=a.map((v,i)=>v+t*(b[i]-v));p[axis]=limit;p[2]=1/inv;return p;}
  for(var i=0;i<result.length;i++){var a=result[(i+result.length-1)%result.length],b=result[i],ai=inside(a),bi=inside(b);if(ai!==bi)out.push(cut(a,b));if(bi)out.push(b);}
  result=out;if(!result.length)break;
 }
 // Removing identical adjacent points is safe; do not remove collinear vertices
 // here because depth along an edge can still vary.
 var clean=[];for(var p of result)if(!clean.length||Math.hypot(p[0]-clean[clean.length-1][0],p[1]-clean[clean.length-1][1])>1e-8)clean.push(p);
 if(clean.length>1&&Math.hypot(clean[0][0]-clean[clean.length-1][0],clean[0][1]-clean[clean.length-1][1])<=1e-8)clean.pop();
 return clean.length>=3?clean:[];
}
return {clip};
});

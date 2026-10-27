/* World-space diagnostics for polygons rejected by screen-space triangulation. */
(function(root,factory){var api=factory(root.CurvatureEarClip||(typeof require==='function'?require('../geometry/CurvatureEarClip'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.CurvatureWorldTopologyAudit=api;})(typeof globalThis!=='undefined'?globalThis:this,function(ear){
'use strict';
function sub(a,b){return a.map((x,i)=>x-b[i]);}
function dot(a,b){return a.reduce((s,x,i)=>s+x*b[i],0);}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function norm(a){return Math.hypot(...a);}
function analyze(p,includePoints){
 var pts=p.points||[],out={commandIndex:p.commandIndex,sourceCommandIndices:p.sourceCommandIndices||[],mode:p.mode,vertices:pts.length};
 if(pts.length<3||pts.some(v=>!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite))){out.invalid=true;return out;}
 var origin=pts[0],span=Math.max(...pts.map(v=>norm(sub(v,origin))));out.span=span;
 var best=0,normal=null,axis=null;
 for(var i=1;i<pts.length;i++)for(var j=i+1;j<pts.length;j++){
  var a=sub(pts[i],origin),b=sub(pts[j],origin),n=cross(a,b),size=norm(n);
  if(size>best){best=size;normal=n;axis=a;}
 }
 if(!(best>0)||!(span>0)){out.degeneratePlane=true;if(includePoints)out.worldPoints=pts;return out;}
 normal=normal.map(x=>x/best);var axisLength=norm(axis);axis=axis.map(x=>x/axisLength);
 var other=cross(normal,axis),residuals=pts.map(v=>dot(sub(v,origin),normal));
 out.maxPlaneDeviation=Math.max(...residuals.map(Math.abs));out.relativePlaneDeviation=out.maxPlaneDeviation/span;
 out.planarWithinTolerance=out.relativePlaneDeviation<=1e-8;
 var projected=pts.map(v=>{var d=sub(v,origin);return [dot(d,axis),dot(d,other)];});
 var inspected=ear.inspect(projected);out.worldPlaneProjection={selfIntersection:inspected.selfIntersection,intersectionPairs:inspected.intersectionPairs};
 if(includePoints){out.worldPoints=pts.map(v=>v.slice());out.planeProjection=projected;out.planeNormal=normal;}
 return out;
}
function summarize(scene,failures){
 var ids=new Set(failures.map(x=>x.commandIndex)),items=scene.primitives.filter(p=>p.type==='polygon'&&ids.has(p.commandIndex));
 var results=items.map(p=>analyze(p,false)),examples=items.slice(0,25).map(p=>analyze(p,true));
 return {failedCommandCount:ids.size,matchedPolygons:items.length,planarPolygons:results.filter(x=>x.planarWithinTolerance).length,
  nonplanarPolygons:results.filter(x=>x.planarWithinTolerance===false).length,
  selfIntersectingPlaneProjections:results.filter(x=>x.worldPlaneProjection&&x.worldPlaneProjection.selfIntersection).length,
  invalidOrDegenerate:results.filter(x=>x.invalid||x.degeneratePlane).length,
  examples:examples,examplesTruncated:items.length>25,
  interpretation:'2D intersection in a best-fit world plane is not a 3D segment intersection for nonplanar polygons; original command mode and vertex order are preserved'};
}
return {analyze,summarize};
});

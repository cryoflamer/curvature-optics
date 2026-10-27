/* Conservative triangulation of simple projected polygons; preserves camera depth. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CurvatureEarClip=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function orient(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function inspect(input){
 var points=input.map(p=>p.slice()),n=points.length;
 if(n<3||points.some(p=>p.length<2||!p.slice(0,2).every(Number.isFinite)))return {vertices:n,selfIntersection:false,intersectionPairs:[],invalid:true};
 var xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),scale=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));
 var tol=1e-9*Math.max(scale,1),areaTol=tol*Math.max(scale,1),pairs=[];
 function on(a,b,p){return Math.abs(orient(a,b,p))<=areaTol&&p[0]>=Math.min(a[0],b[0])-tol&&p[0]<=Math.max(a[0],b[0])+tol&&p[1]>=Math.min(a[1],b[1])-tol&&p[1]<=Math.max(a[1],b[1])+tol;}
 function intersects(a,b,c,d){var x=orient(a,b,c),y=orient(a,b,d),z=orient(c,d,a),w=orient(c,d,b);return (x*y< -areaTol*areaTol&&z*w< -areaTol*areaTol)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);}
 for(var i=0;i<n;i++)for(var j=i+1;j<n;j++){if(j===i+1||(i===0&&j===n-1))continue;if(intersects(points[i],points[(i+1)%n],points[j],points[(j+1)%n])){if(pairs.length<5)pairs.push([i,j]);}}
 return {vertices:n,selfIntersection:pairs.length>0,intersectionPairs:pairs};
}
function triangulate(input){
 var points=input.map(p=>p.slice()),removed=0,eps=1e-9;
 if(points.some(p=>p.length!==3||!p.every(Number.isFinite)))return {triangles:[],removed,reason:'invalid-coordinate'};
 // Normalize scale for robust orientation and collinearity tests.
 var xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);var scale=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));
 if(!(scale>0))return {triangles:[],removed,reason:'zero-area'};
 var areaTol=eps*scale*scale,distTol=eps*scale;
 function distance(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1]);}
 var changed=true;
 while(changed&&points.length>=3){changed=false;for(var i=0;i<points.length;i++){
  var a=points[(i+points.length-1)%points.length],b=points[i],c=points[(i+1)%points.length];
  if(distance(a,b)<=distTol||Math.abs(orient(a,b,c))<=areaTol){points.splice(i,1);removed++;changed=true;break;}
 }}
 if(points.length<3)return {triangles:[],removed,reason:'zero-area'};
 function onSegment(a,b,p){return Math.abs(orient(a,b,p))<=areaTol&&p[0]>=Math.min(a[0],b[0])-distTol&&p[0]<=Math.max(a[0],b[0])+distTol&&p[1]>=Math.min(a[1],b[1])-distTol&&p[1]<=Math.max(a[1],b[1])+distTol;}
 function intersects(a,b,c,d){var ab1=orient(a,b,c),ab2=orient(a,b,d),cd1=orient(c,d,a),cd2=orient(c,d,b);
  if(ab1*ab2< -areaTol*areaTol&&cd1*cd2< -areaTol*areaTol)return true;
  return onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);
 }
 for(var i=0;i<points.length;i++)for(var j=i+1;j<points.length;j++){
  if(j===i+1||(i===0&&j===points.length-1))continue;
  if(intersects(points[i],points[(i+1)%points.length],points[j],points[(j+1)%points.length]))return {triangles:[],removed,reason:'self-intersection',cleanedPoints:points};
 }
 var twiceArea=0;for(var i=0;i<points.length;i++){var p=points[i],q=points[(i+1)%points.length];twiceArea+=p[0]*q[1]-q[0]*p[1];}
 if(Math.abs(twiceArea)<=areaTol)return {triangles:[],removed,reason:'zero-area'};
 var winding=Math.sign(twiceArea),indices=points.map((_,i)=>i),triangles=[],guard=0;
 while(indices.length>3&&guard++<points.length*points.length){var found=false;
  for(var k=0;k<indices.length;k++){
   var ia=indices[(k+indices.length-1)%indices.length],ib=indices[k],ic=indices[(k+1)%indices.length],a=points[ia],b=points[ib],c=points[ic];
   if(winding*orient(a,b,c)<=areaTol)continue;
   var occupied=indices.some(idx=>{if(idx===ia||idx===ib||idx===ic)return false;var p=points[idx],o1=winding*orient(a,b,p),o2=winding*orient(b,c,p),o3=winding*orient(c,a,p);return o1>=-areaTol&&o2>=-areaTol&&o3>=-areaTol;});
   if(occupied)continue;
   triangles.push([a,b,c]);indices.splice(k,1);found=true;break;
  }
  if(!found)return {triangles:[],removed,reason:'no-ear'};
 }
 if(indices.length!==3)return {triangles:[],removed,reason:'iteration-limit'};
 triangles.push(indices.map(i=>points[i]));return {triangles,removed,reason:null};
}
return {triangulate,inspect};
});

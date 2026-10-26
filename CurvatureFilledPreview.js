/* Independent diagnostic filled polygons; deliberately approximate painter ordering. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CurvatureFilledPreview=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function sub(a,b){return a.map((x,i)=>x-b[i]);}
function dot(a,b){return a.reduce((s,x,i)=>s+x*b[i],0);}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function unit(v){var n=Math.hypot(...v);if(!(n>0))throw Error('Invalid camera basis');return v.map(x=>x/n);}
function lerp(a,b,t){return a.map((x,i)=>x+(b[i]-x)*t);}
function clip(poly,inside,intersection){var out=[];for(var i=0;i<poly.length;i++){var a=poly[(i+poly.length-1)%poly.length],b=poly[i],ai=inside(a),bi=inside(b);if(ai!==bi)out.push(intersection(a,b));if(bi)out.push(b);}return out;}
function build(scene,camera,width,height){
 if(!scene||!Array.isArray(scene.primitives)||!(width>0&&height>0))throw TypeError('Invalid scene');
 var c=camera.pos?camera:globalThis.CurvaturePerspectivePreview.snapshot(camera);
 var back=unit(sub(c.pos,c.center)),right=unit(cross(unit(c.up),back)),up=unit(cross(back,right));
 var distance=Math.hypot(...sub(c.center,c.pos)),focal=c.sceneSize!==0?c.screenSize/c.sceneSize*(distance-c.objectZExtend):1;
 if(!(c.screenSize>0)||!Number.isFinite(focal))throw Error('Invalid camera scale');
 var polygons=[],stats={inputPolygons:0,filledPolygons:0,clippedNearPlane:0,clippedViewport:0,rejectedNearPlane:0,rejectedViewport:0,skippedDegenerate:0,depthOrder:'average-camera-depth (approximate)',limitations:['No legacy polygon styles or lighting','Average-depth painter sorting cannot resolve intersecting polygons','No parity check against GraphX3DX polygon clipping']};
 scene.primitives.forEach(function(p){if(p.type!=='polygon')return;stats.inputPolygons++;
 var points=p.points.map(function(v){var d=sub(v,c.pos);return [dot(d,right),dot(d,up),-dot(d,back)];});
 if(points.length<3||points.some(v=>!v.every(Number.isFinite))){stats.skippedDegenerate++;return;}
 var near=1e-6,changed=points.some(v=>v[2]<near);
 points=clip(points,v=>v[2]>=near,(a,b)=>lerp(a,b,(near-a[2])/(b[2]-a[2])));
 if(points.length<3){stats.rejectedNearPlane++;return;}if(changed)stats.clippedNearPlane++;
 var depth=points.reduce((s,v)=>s+v[2],0)/points.length,scale=height/c.screenSize;
 points=points.map(v=>[width/2+v[0]*focal*c.zoom/v[2]*scale,height/2-v[1]*focal*c.zoom/v[2]*scale]);
 if(points.some(v=>!v.every(Number.isFinite))){stats.skippedDegenerate++;return;}
 var original=points;
 [[0,0,true],[0,width,false],[1,0,true],[1,height,false]].forEach(function(edge){var axis=edge[0],bound=edge[1],lower=edge[2];points=clip(points,v=>lower?v[axis]>=bound:v[axis]<=bound,(a,b)=>lerp(a,b,(bound-a[axis])/(b[axis]-a[axis])));});
 if(points.length<3){stats.rejectedViewport++;return;}
 if(points.length!==original.length||points.some((v,i)=>!original[i]||v[0]!==original[i][0]||v[1]!==original[i][1]))stats.clippedViewport++;
 polygons.push({commandIndex:p.commandIndex,points:points,depth:depth});
 });
 polygons.sort((a,b)=>b.depth-a.depth);stats.filledPolygons=polygons.length;return {polygons:polygons,statistics:stats,camera:c};
}
function draw(canvas,scene,camera){var ctx=canvas.getContext('2d');if(!ctx)throw Error('2D context unavailable');var r=build(scene,camera,canvas.width,canvas.height);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);r.polygons.forEach(function(p){ctx.beginPath();p.points.forEach((v,i)=>i?ctx.lineTo(v[0],v[1]):ctx.moveTo(v[0],v[1]));ctx.closePath();ctx.fillStyle='#a8b8c7';ctx.fill();ctx.strokeStyle='#34495e';ctx.lineWidth=0.45;ctx.stroke();});return r;}
return {build:build,draw:draw};
});

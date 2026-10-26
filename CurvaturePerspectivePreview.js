/* Independent camera wireframe projection; no GraphX3DX drawing calls. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CurvaturePerspectivePreview=api;}(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function valid(v){return Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);}
function sub(a,b){return a.map(function(x,i){return x-b[i];});}
function dot(a,b){return a.reduce(function(s,x,i){return s+x*b[i];},0);}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function unit(v){var n=Math.hypot.apply(null,v);if(!(n>0))throw new RangeError('Degenerate camera basis');return v.map(function(x){return x/n;});}
function snapshot(cam){if(!cam||!valid(cam.CamPos)||!valid(cam.CamViewCenter)||!valid(cam.CamUp))throw new TypeError('Invalid camera');var c={pos:cam.CamPos.slice(),center:cam.CamViewCenter.slice(),up:cam.CamUp.slice(),sceneSize:cam.SceneSize,screenSize:cam.ScreenSize,objectZExtend:cam.ObjectZExtend,zoom:cam.Zoom};if(![c.sceneSize,c.screenSize,c.objectZExtend,c.zoom].every(Number.isFinite))throw new TypeError('Invalid camera scale');return c;}
function project(scene,camera,width,height){
if(!scene||!Array.isArray(scene.primitives)||!(width>0&&height>0))throw new TypeError('Invalid scene or dimensions');
var c=camera.pos?camera:snapshot(camera),back=unit(sub(c.pos,c.center)),right=unit(cross(unit(c.up),back)),up=unit(cross(back,right));
var distance=Math.hypot.apply(null,sub(c.center,c.pos)),focal=c.sceneSize!==0?c.screenSize/c.sceneSize*(distance-c.objectZExtend):1;
if(!(c.screenSize>0))throw new RangeError('Invalid screen size');
var segments=[],skipped=0;
scene.primitives.forEach(function(p){if(p.type!=='line'&&p.type!=='polygon')throw new TypeError('Unknown primitive');
var pts=p.points.map(function(v){if(!valid(v))throw new TypeError('Invalid world point');var d=sub(v,c.pos);return {x:dot(d,right),y:dot(d,up),z:-dot(d,back)};});
var count=p.type==='polygon'?pts.length:pts.length-1;
for(var i=0;i<count;i++){var a=pts[i],b=pts[(i+1)%pts.length],near=1e-6;
if(a.z<=near&&b.z<=near){skipped++;continue;}
if(a.z<=near){var t=(near-a.z)/(b.z-a.z);a={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:near};}
if(b.z<=near){var t2=(near-b.z)/(a.z-b.z);b={x:b.x+(a.x-b.x)*t2,y:b.y+(a.y-b.y)*t2,z:near};}
function pix(q){var scale=height/c.screenSize;return [width/2+q.x*focal*c.zoom/q.z*scale,height/2-q.y*focal*c.zoom/q.z*scale];}
segments.push({commandIndex:p.commandIndex,points:[pix(a),pix(b)]});
}});
return {segments:segments,skippedBehindCamera:skipped,camera:c};}
function draw(canvas,scene,camera){var ctx=canvas.getContext('2d');if(!ctx)throw new Error('2D context unavailable');var r=project(scene,camera,canvas.width,canvas.height);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#333';ctx.lineWidth=0.8;r.segments.forEach(function(s){ctx.beginPath();ctx.moveTo(s.points[0][0],s.points[0][1]);ctx.lineTo(s.points[1][0],s.points[1][1]);ctx.stroke();});return r;}
return {snapshot:snapshot,project:project,draw:draw};
}));

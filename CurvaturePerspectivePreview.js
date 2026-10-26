/* Independent camera wireframe projection; no GraphX3DX drawing calls. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CurvaturePerspectivePreview=api;}(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function valid(v){return Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);}
function sub(a,b){return a.map(function(x,i){return x-b[i];});}
function dot(a,b){return a.reduce(function(s,x,i){return s+x*b[i];},0);}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function unit(v){var n=Math.hypot.apply(null,v);if(!(n>0))throw new RangeError('Degenerate camera basis');return v.map(function(x){return x/n;});}
function snapshot(cam){if(!cam||!valid(cam.CamPos)||!valid(cam.CamViewCenter)||!valid(cam.CamUp))throw new TypeError('Invalid camera');var c={pos:cam.CamPos.slice(),center:cam.CamViewCenter.slice(),up:cam.CamUp.slice(),sceneSize:cam.SceneSize,screenSize:cam.ScreenSize,objectZExtend:cam.ObjectZExtend,zoom:cam.Zoom};if(![c.sceneSize,c.screenSize,c.objectZExtend,c.zoom].every(Number.isFinite))throw new TypeError('Invalid camera scale');return c;}
/* Clip a projected segment to the finite diagnostic viewport. This is
   independent of GraphX3DX and does not claim legacy clipping parity. */
function clipViewport(a,b,width,height){
 var dx=b[0]-a[0],dy=b[1]-a[1],lo=0,hi=1;
 var p=[-dx,dx,-dy,dy],q=[a[0],width-a[0],a[1],height-a[1]];
 for(var i=0;i<4;i++){
  if(p[i]===0){if(q[i]<0)return null;continue;}
  var t=q[i]/p[i];
  if(p[i]<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
  if(lo>hi)return null;
 }
 return [[a[0]+lo*dx,a[1]+lo*dy],[a[0]+hi*dx,a[1]+hi*dy]];
}
function project(scene,camera,width,height){
if(!scene||!Array.isArray(scene.primitives)||!(width>0&&height>0))throw new TypeError('Invalid scene or dimensions');
var c=camera.pos?camera:snapshot(camera),back=unit(sub(c.pos,c.center)),right=unit(cross(unit(c.up),back)),up=unit(cross(back,right));
var distance=Math.hypot.apply(null,sub(c.center,c.pos)),focal=c.sceneSize!==0?c.screenSize/c.sceneSize*(distance-c.objectZExtend):1;
if(!(c.screenSize>0))throw new RangeError('Invalid screen size');
var segments=[],skipped=0,clippedOutsideViewport=0,clippedToViewport=0,clippedAtNearPlane=0;
scene.primitives.forEach(function(p){if(p.type!=='line'&&p.type!=='polygon')throw new TypeError('Unknown primitive');
var pts=p.points.map(function(v){if(!valid(v))throw new TypeError('Invalid world point');var d=sub(v,c.pos);return {x:dot(d,right),y:dot(d,up),z:-dot(d,back)};});
var count=p.type==='polygon'?pts.length:pts.length-1;
for(var i=0;i<count;i++){var a=pts[i],b=pts[(i+1)%pts.length],near=1e-6;
if(a.z<=near&&b.z<=near){skipped++;continue;}
if(a.z<=near){clippedAtNearPlane++;var t=(near-a.z)/(b.z-a.z);a={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:near};}
if(b.z<=near){clippedAtNearPlane++;var t2=(near-b.z)/(a.z-b.z);b={x:b.x+(a.x-b.x)*t2,y:b.y+(a.y-b.y)*t2,z:near};}
function pix(q){var scale=height/c.screenSize;return [width/2+q.x*focal*c.zoom/q.z*scale,height/2-q.y*focal*c.zoom/q.z*scale];}
var raw=[pix(a),pix(b)];
if(!raw[0].every(Number.isFinite)||!raw[1].every(Number.isFinite)){clippedOutsideViewport++;continue;}
var visible=clipViewport(raw[0],raw[1],width,height);
if(!visible){clippedOutsideViewport++;continue;}
if(visible.some(function(v,i){return v.some(function(n,j){return n!==raw[i][j];});}))clippedToViewport++;
segments.push({commandIndex:p.commandIndex,points:visible});
}});
return {segments:segments,skippedBehindCamera:skipped,clippedOutsideViewport:clippedOutsideViewport,clippedToViewport:clippedToViewport,clippedAtNearPlane:clippedAtNearPlane,clippingMode:"independent-near-and-viewport",camera:c};}
function draw(canvas,scene,camera){var ctx=canvas.getContext('2d');if(!ctx)throw new Error('2D context unavailable');var r=project(scene,camera,canvas.width,canvas.height);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#333';ctx.lineWidth=0.8;r.segments.forEach(function(s){ctx.beginPath();ctx.moveTo(s.points[0][0],s.points[0][1]);ctx.lineTo(s.points[1][0],s.points[1][1]);ctx.stroke();});return r;}
return {snapshot:snapshot,project:project,draw:draw,clipViewport:clipViewport};
}));

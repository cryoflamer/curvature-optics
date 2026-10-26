/* Diagnostic painter-order experiment: no depth testing, no legacy styling. */
(function(root,factory){var api=factory(root.CurvatureStrokePreview||(typeof require==='function'?require('./CurvatureStrokePreview'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.CurvatureLegacyOrderPreview=api;})(typeof globalThis!=='undefined'?globalThis:this,function(strokes){
'use strict';
function group(items){var map=new Map();for(var item of items){var key=item.commandIndex;if(!map.has(key))map.set(key,[]);map.get(key).push(item);}return map;}
function build(scene,camera,width,height,triangles){var outline=strokes.build(scene,camera,width,height),fills=group(triangles||[]),lines=group(outline.segments),commands=[];
 for(var p of scene.primitives){if(p.type!=='polygon')continue;var mode=p.mode==null?1:p.mode;commands.push({commandIndex:p.commandIndex,mode,triangles:(mode&2)?(fills.get(p.commandIndex)||[]):[],segments:(mode&1)?(lines.get(p.commandIndex)||[]):[]});}
 return {commands,statistics:{inputPolygons:commands.length,fillCommands:commands.filter(x=>x.mode&2).length,strokeCommands:commands.filter(x=>x.mode&1).length,drawnTriangles:commands.reduce((n,x)=>n+x.triangles.length,0),drawnSegments:commands.reduce((n,x)=>n+x.segments.length,0),mode:'scene command order; fill then stroke per command; no depth test',limitations:['Uses independently ear-clipped triangles for fills, not original Canvas winding paths','Uses uniform diagnostic colors and one-pixel strokes, not legacy styles','No 3D depth test or legacy clipping parity']}};}
function draw(canvas,scene,camera,triangles){var result=build(scene,camera,canvas.width,canvas.height,triangles),ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.lineWidth=1;ctx.lineJoin='miter';
 for(var cmd of result.commands){ctx.fillStyle='#a8b8c7';for(var t of cmd.triangles){var p=t.points;ctx.beginPath();ctx.moveTo(p[0][0],p[0][1]);ctx.lineTo(p[1][0],p[1][1]);ctx.lineTo(p[2][0],p[2][1]);ctx.closePath();ctx.fill();}ctx.strokeStyle='#30435a';for(var s of cmd.segments){var q=s.points;ctx.beginPath();ctx.moveTo(q[0][0],q[0][1]);ctx.lineTo(q[1][0],q[1][1]);ctx.stroke();}}
 return result;}
return {build,draw};
});

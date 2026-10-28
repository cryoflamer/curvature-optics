/* Diagnostic painter-order experiment: respects captured fill/stroke style and
 * alpha where available; still uses independent tessellation and projection. */
(function(root,factory){var api=factory(root.CurvatureStrokePreview||(typeof require==='function'?require('./CurvatureStrokePreview'):null),root.CurvatureCanvasProjection||(typeof require==='function'?require('./CurvatureCanvasProjection'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.CurvatureLegacyOrderPreview=api;})(typeof globalThis!=='undefined'?globalThis:this,function(strokes,canvasProjection){
'use strict';
function group(items){var map=new Map();for(var item of items){var key=item.commandIndex;if(!map.has(key))map.set(key,[]);map.get(key).push(item);}return map;}
function build(scene,camera,width,height,triangles){var outline=strokes.build(scene,camera,width,height),fills=group(triangles||[]),lines=group(outline.segments),commands=[];
 for(var p of scene.primitives){if(p.type!=='polygon'&&p.type!=='line')continue;var mode=p.type==='line'?1:(p.mode==null?1:p.mode);commands.push({commandIndex:p.commandIndex,mode,type:p.type,style:p.style||null,triangles:(mode&2)?(fills.get(p.commandIndex)||[]):[],segments:(mode&1)?(lines.get(p.commandIndex)||[]):[]});}
 return {commands,statistics:{inputPolygons:commands.filter(x=>x.type==='polygon').length,inputLines:commands.filter(x=>x.type==='line').length,fillCommands:commands.filter(x=>x.mode&2).length,strokeCommands:commands.filter(x=>x.mode&1).length,drawnTriangles:commands.reduce((n,x)=>n+x.triangles.length,0),drawnSegments:commands.reduce((n,x)=>n+x.segments.length,0),mode:'scene command order; fill then stroke per command; no depth test',styleMode:'captured Canvas fill, stroke, line width and alpha (approximate)',limitations:['Uses independently ear-clipped triangles for fills, not original Canvas winding paths','Stroke path continuity is reconstructed from clipped edges; graph clipping and native paths may differ','No 3D depth test or legacy clipping parity']}};}
// Reconnect adjacent clipped edges into paths. Disconnected pieces retain
// separate subpaths; clipped endpoints must never create invented edges.
function strokePaths(ctx,segments){
 ctx.beginPath();var previous=null,paths=0;
 for(var s of segments){var q=s.points,a=q[0],b=q[1];
  if(!previous||Math.hypot(a[0]-previous[0],a[1]-previous[1])>1e-6){ctx.moveTo(a[0],a[1]);paths++;}
  ctx.lineTo(b[0],b[1]);previous=b;
 }
 ctx.stroke();return paths;
}
// Adjacent stroke-only commands with identical Canvas styling may be stroked
// together. Each source command starts a NEW subpath, so coincident endpoints
// of unrelated guide lines cannot create invented connections. Filled commands
// are barriers: the existing painter/z-order semantics are preserved.
function draw(canvas,scene,camera,triangles){
 var result=build(scene,camera,canvas.width,canvas.height,triangles),ctx=canvas.getContext('2d');
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.lineJoin='round';ctx.lineCap='butt';
 var pending=false,pendingKey=null,pendingSegments=0,strokeCalls=0,batchedCommands=0;
 var MAX_STROKE_SEGMENTS=512;
 function flush(){if(pending){ctx.stroke();strokeCalls++;pending=false;pendingKey=null;pendingSegments=0;}}
 for(var cmd of result.commands){
  var style=cmd.style||{},alpha=style.alpha==null?1:style.alpha;
  var stroke=style.stroke||'#30435a',width=canvasProjection.lineWidth(style.lineWidth,camera);
  if(cmd.triangles.length){
   flush();ctx.globalAlpha=alpha;ctx.fillStyle=style.fill||'#a8b8c7';
   ctx.beginPath();for(var t of cmd.triangles){var p=t.points;ctx.moveTo(p[0][0],p[0][1]);ctx.lineTo(p[1][0],p[1][1]);ctx.lineTo(p[2][0],p[2][1]);ctx.closePath();}ctx.fill();
  }
  if(!cmd.segments.length)continue;
  // Fill-and-stroke commands cannot be merged across their fill operation.
  if(cmd.triangles.length){ctx.globalAlpha=alpha;ctx.strokeStyle=stroke;ctx.lineWidth=width;
   strokePaths(ctx,cmd.segments);strokeCalls++;continue;}
  // Scalars are used as a stable style identity; style object references are
  // not reliable because captured scene commands copy their style objects.
  var key=JSON.stringify([alpha,stroke,width]);
  if(pending&&pendingKey!==key)flush();
  if(!pending){ctx.globalAlpha=alpha;ctx.strokeStyle=stroke;ctx.lineWidth=width;
   ctx.beginPath();pending=true;pendingKey=key;}
  batchedCommands++;
  var previous=null;
  for(var seg of cmd.segments){var a=seg.points[0],b=seg.points[1];
   if(pendingSegments>=MAX_STROKE_SEGMENTS){
    flush();ctx.globalAlpha=alpha;ctx.strokeStyle=stroke;ctx.lineWidth=width;
    ctx.beginPath();pending=true;pendingKey=key;previous=null;
   }
   if(!previous||Math.hypot(a[0]-previous[0],a[1]-previous[1])>1e-6)
    ctx.moveTo(a[0],a[1]);
   ctx.lineTo(b[0],b[1]);previous=b;pendingSegments++;
  }
  // For consistency with the original command-by-command implementation,
  // always start another subpath at the next primitive.
 }
 flush();ctx.globalAlpha=1;
 result.statistics.canvasStrokeCalls=strokeCalls;
 result.statistics.batchedStrokeCommands=batchedCommands;
 return result;
}
return {build,draw,strokePaths};
});

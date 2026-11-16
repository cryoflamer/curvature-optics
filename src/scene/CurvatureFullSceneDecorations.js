/* Independent diagnostic rendering of the camera-aligned frame and the demo
 * caption. These are screen presentation, not Earth/object geometry; keeping
 * them outside GeometryEngine avoids contaminating horizon visibility tests.
 * No mutable GraphX3DX state or legacy drawing calls are used.
 */
(function(root,factory){
 var api=factory(root.CurvatureStrokePreview||(typeof require==='function'?require('../renderers/CurvatureStrokePreview'):null),
                 root.CurvatureCanvasProjection||(typeof require==='function'?require('../renderers/CurvatureCanvasProjection'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.CurvatureFullSceneDecorations=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(strokes,projection){
 'use strict';
 function sub(a,b){return a.map(function(v,i){return v-b[i];});}
 function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
 function unit(a){var n=Math.hypot.apply(null,a);if(!(n>0))throw new RangeError('Degenerate camera basis');return a.map(function(x){return x/n;});}
 function add(a,b,scale){return a.map(function(v,i){return v+scale*b[i];});}
 function framePrimitive(model,camera){
  if(!model||model.FrameCol==null||model.FrameCol===''||
      !Number.isFinite(model.sceneWidth)||model.sceneWidth<=0||
      !Number.isFinite(model.sceneHeight)||model.sceneHeight<=0)return null;
  if(!camera||!Array.isArray(camera.pos)||!Array.isArray(camera.center)||!Array.isArray(camera.up))
   throw new TypeError('Camera basis required for frame');
  // DrawModel: xDir = ViewDir x CamUp; yDir = ViewDir x xDir; SetPlane(..., true).
  var view=unit(sub(camera.center,camera.pos)),x=unit(cross(view,camera.up)),y=unit(cross(view,x)),c=camera.center;
  function point(u,v){return add(add(c,x,u),y,v);}
  var w=model.sceneWidth/2,h=model.sceneHeight/2;
  return {type:'polygon',points:[point(-w,-h),point(w,-h),point(w,h),point(-w,h)],
   mode:1,closed:true,commandIndex:0,style:{stroke:model.FrameCol,lineWidth:2,alpha:1},
   metadata:{kind:'camera-frame',role:'screen-decoration'}};
 }
 function scales(camera){
  var p=camera&&camera.pixelTransform||{},s=p.stroke||{},k=p.contextScale>0?p.contextScale:1;
  function scale(value,min){
   var n=s.autoScale?value*(s.pixelScale||1):value;
   if(min!=null)n=Math.max(n,min);
   if(s.autoScale&&s.scaleInt)n=Math.max(1,Math.round(n));
   return n*k;
  }
  return {size:function(v){return scale(v,1);},pad:function(v){return scale(v);},contextScale:k};
 }
 function demoBounds(canvas,model,camera){
  var text=typeof model.DemoText==='string'?model.DemoText:'',description=typeof model.Description==='string'?model.Description:'';
  if(!text)return [];
  var ctx=canvas.getContext('2d'),s=scales(camera),centerX=canvas.width/2,rects=[];
  // GraphX3DX uses middle-baseline text with 10-pixel padding and a top
  // alignment: centerY = viewY + textHeight/2 + verticalPadding.
  function item(value,fontSize,logicalY){
   var size=s.size(fontSize),pad=s.pad(10),cy=logicalY+size/2+pad;
   if(typeof ctx.save==='function')ctx.save();
   ctx.font=size+'px Arial';
   var width=typeof ctx.measureText==='function'?ctx.measureText(value).width:size*value.length*.65;
   if(typeof ctx.restore==='function')ctx.restore();
   rects.push({x:Math.max(0,Math.floor(centerX-width/2-2)),
     y:Math.max(0,Math.floor(cy-size/2-3)),
     width:Math.ceil(width+4),height:Math.ceil(size+6),kind:fontSize===20?'demo-title':'demo-description',
     text:value,fontSize:size,baselineY:cy});
  }
  item(text,20,0);
  if(description)item(description,16,s.pad(30));
  return rects;
 }
 // Camera-oriented supplementary guides are a PRESENTATION overlay. Reuse
 // already traced metric ground samples; neither ray shooting nor surface
 // geometry depends on the camera heading or narrow field of view.
 function metricGridOverlay(canvas,model,camera,physicalGuides){
  if(!(model.showGrid&1)||!Array.isArray(physicalGuides)||!physicalGuides.length)
   return {spokes:0,labels:0};
  var meridian=physicalGuides.filter(function(p){return p.metadata&&
   p.metadata.kind==='metric-spoke'&&p.metadata.physicalGround&&
   Math.abs(p.metadata.angle)<1e-10&&p.points.length===2;});
  if(!meridian.length)return {spokes:0,labels:0};
  var heading=Math.atan2(camera.center[0]-camera.pos[0],
   camera.center[1]-camera.pos[1]);
  var fov=Number.isFinite(model.camViewAngle)&&model.camViewAngle>0?
   model.camViewAngle:Math.PI/6;
  var separation=Math.min(.07,Math.max(.004,fov/10));
  function turn(p,az){var horizontal=Math.hypot(p[0],p[1]);
   return [horizontal*Math.sin(az),horizontal*Math.cos(az),p[2]];}
  var lines=[];
  for(var offset=-3;offset<=3;offset++){
   var az=heading+offset*separation;
   meridian.forEach(function(p){lines.push({type:'line',mode:1,
    points:p.points.map(function(v){return turn(v,az);}),
    commandIndex:lines.length,style:{stroke:'#426bc7'}});});
  }
  var projected=strokes.build({primitives:lines,metadata:{}},camera,canvas.width,canvas.height),
   ctx=canvas.getContext('2d'),pixel=scales(camera).contextScale;
  ctx.save();ctx.strokeStyle='#345ab4';ctx.globalAlpha=.42;
  ctx.lineWidth=Math.max(1,pixel);
  if(typeof ctx.setLineDash==='function')ctx.setLineDash([3*pixel,5*pixel]);
  ctx.beginPath();
  projected.segments.forEach(function(s){ctx.moveTo(s.points[0][0],s.points[0][1]);
   ctx.lineTo(s.points[1][0],s.points[1][1]);});
  if(projected.segments.length)ctx.stroke();ctx.restore();
  // Labels are anchored to the same physical ring samples as the lines.
  // Never use a geometric horizon or an invented pixel-distance mapping.
  var samples=new Map();
  physicalGuides.forEach(function(p){var meta=p.metadata||{};
   if(meta.kind==='metric-ring'&&meta.physicalGround&&
      Number.isFinite(meta.radius)&&p.points.length&&!samples.has(meta.radius))
    samples.set(meta.radius,p.points[0]);});
  var marks=[];
  samples.forEach(function(point,r){
   if(r<1000||r===7500||r===12500)return;
   var v=turn(point,heading+2*separation);
   marks.push({type:'line',mode:1,points:[v,v],commandIndex:marks.length,
    style:{stroke:'#345ab4'},metadata:{radius:r}});
  });
  if(!marks.length)return {spokes:projected.segments.length,labels:0};
  var positions=strokes.build({primitives:marks,metadata:{}},camera,canvas.width,canvas.height);
  var candidates=positions.segments.map(function(seg){return {
   x:seg.points[0][0],y:seg.points[0][1],radius:marks[seg.commandIndex].metadata.radius
  };}).sort(function(a,b){return b.radius-a.radius;});
  var shown=[],right=canvas.width-58*pixel;
  ctx.save();ctx.font=Math.max(10,11*pixel)+'px Arial';ctx.textAlign='left';
  ctx.textBaseline='middle';
  candidates.forEach(function(p){
   if(p.y<75*pixel||p.y>canvas.height-30*pixel||p.x<5*pixel||p.x>right||
      shown.some(function(y){return Math.abs(y-p.y)<19*pixel;}))return;
   var label=(p.radius/1000)+' km';
   var width=ctx.measureText(label).width;
   if(p.x+width+8*pixel>canvas.width)return;
   ctx.globalAlpha=.83;ctx.fillStyle='#fff';
   if(typeof ctx.fillRect==='function')ctx.fillRect(p.x+2*pixel,p.y-8*pixel,
     width+6*pixel,16*pixel);
   ctx.globalAlpha=1;ctx.fillStyle='#34509e';ctx.fillText(label,p.x+5*pixel,p.y);
   shown.push(p.y);
  });ctx.restore();
  return {spokes:projected.segments.length,labels:shown.length};
 }
 function draw(canvas,model,camera,options){
  options=options||{};
  if(!canvas||!model||!camera)throw new TypeError('Canvas, model and camera required');
  var ctx=canvas.getContext('2d');if(!ctx)throw new TypeError('Canvas 2D context required');
  var exclusions=[],frame=framePrimitive(model,camera),frameSegments=0;
  if(frame){
   var result=strokes.build({primitives:[frame],metadata:{}},camera,canvas.width,canvas.height);
   ctx.save();ctx.strokeStyle=model.FrameCol;ctx.lineWidth=projection.lineWidth(2,camera);
   ctx.globalAlpha=1;ctx.lineJoin='round';ctx.lineCap='butt';ctx.beginPath();
   var prev=null;
   result.segments.forEach(function(segment){
    var a=segment.points[0],b=segment.points[1];
    if(!prev||Math.hypot(prev[0]-a[0],prev[1]-a[1])>1e-6)ctx.moveTo(a[0],a[1]);
    ctx.lineTo(b[0],b[1]);prev=b;frameSegments++;
   });
   if(frameSegments)ctx.stroke();ctx.restore();
   var half=2+Math.ceil(projection.lineWidth(2,camera));
   exclusions.push({kind:'camera-frame',x:0,y:0,width:canvas.width,height:half},
     {kind:'camera-frame',x:0,y:canvas.height-half,width:canvas.width,height:half},
     {kind:'camera-frame',x:0,y:0,width:half,height:canvas.height},
     {kind:'camera-frame',x:canvas.width-half,y:0,width:half,height:canvas.height});
  }
  var metricOverlay=metricGridOverlay(canvas,model,camera,options.physicalGuides);
  var captions=demoBounds(canvas,model,camera);
  if(captions.length){
   ctx.save();ctx.fillStyle='black';ctx.textAlign='center';ctx.textBaseline='middle';ctx.globalAlpha=1;
   captions.forEach(function(item){ctx.font=item.fontSize+'px Arial';ctx.fillText(item.text,canvas.width/2,item.baselineY);});
   ctx.restore();
   captions.forEach(function(item){exclusions.push({kind:item.kind,x:item.x,y:item.y,width:item.width,height:item.height});});
  }
  return {frameSegments:frameSegments,captionCount:captions.length,metricOverlay:metricOverlay,excludedRects:exclusions,
   limitations:['Canvas font rasterization can vary by browser and device',
    'Camera frame and demo text are presentation, not surface geometry']};
 }
 return {framePrimitive:framePrimitive,demoBounds:demoBounds,metricGridOverlay:metricGridOverlay,draw:draw};
}));

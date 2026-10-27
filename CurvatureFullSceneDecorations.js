/* Independent diagnostic rendering of the camera-aligned frame and the demo
 * caption. These are screen presentation, not Earth/object geometry; keeping
 * them outside GeometryEngine avoids contaminating horizon visibility tests.
 * No mutable GraphX3DX state or legacy drawing calls are used.
 */
(function(root,factory){
 var api=factory(root.CurvatureStrokePreview||(typeof require==='function'?require('./CurvatureStrokePreview'):null),
                 root.CurvatureCanvasProjection||(typeof require==='function'?require('./CurvatureCanvasProjection'):null));
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
 function draw(canvas,model,camera){
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
  var captions=demoBounds(canvas,model,camera);
  if(captions.length){
   ctx.save();ctx.fillStyle='black';ctx.textAlign='center';ctx.textBaseline='middle';ctx.globalAlpha=1;
   captions.forEach(function(item){ctx.font=item.fontSize+'px Arial';ctx.fillText(item.text,canvas.width/2,item.baselineY);});
   ctx.restore();
   captions.forEach(function(item){exclusions.push({kind:item.kind,x:item.x,y:item.y,width:item.width,height:item.height});});
  }
  return {frameSegments:frameSegments,captionCount:captions.length,excludedRects:exclusions,
   limitations:['Canvas font rasterization can vary by browser and device',
    'Camera frame and demo text are presentation, not surface geometry']};
 }
 return {framePrimitive:framePrimitive,demoBounds:demoBounds,draw:draw};
}));

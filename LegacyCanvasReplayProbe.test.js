const assert=require('node:assert/strict');
const {test}=require('node:test');
const probe=require('./LegacyCanvasReplayProbe');
function canvas(bytes,w=1,h=1){return {width:w,height:h,getContext(){return {getImageData(){return {data:new Uint8ClampedArray(bytes)}}}}};}
test('pixel comparison detects exact match',()=>{
 const a=canvas([0,12,255,255]);assert.equal(probe.comparePixels(a,a).identical,true);
});
test('pixel comparison counts pixels and max channel difference',()=>{
 const result=probe.comparePixels(canvas([0,12,255,255]),canvas([0,18,255,255]));
 assert.equal(result.mismatchedPixels,1);assert.equal(result.maxChannelDifference,6);
});
test('refuses incomplete trace without touching DOM',()=>{
 assert.equal(probe.run(null,{complete:false}).ok,false);
});

test('dimension mismatch reports both backing-store sizes',()=>{
 const result=probe.comparePixels(canvas([],320,180),canvas([],640,360));
 assert.equal(result.ok,false);
 assert.deepEqual(result.originalSize,{width:320,height:180});
 assert.deepEqual(result.replaySize,{width:640,height:360});
});

test('diagnostic PNGs and quadrants are derived from actual pixel differences',()=>{
 const previous=global.document;
 const created=[];
 global.document={createElement(){
   const obj={width:0,height:0};
   obj.toDataURL=()=> 'data:image/png;base64,TEST';
   obj.getContext=()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
     putImageData:(img)=>{obj.diffData=img.data;}});
   created.push(obj);return obj;
 }};
 try{
   const a=canvas([0,0,0,255, 0,0,0,255, 0,0,0,255, 0,0,0,255],2,2);
   const b=canvas([10,0,0,255, 0,0,0,255, 0,0,0,255, 0,0,0,255],2,2);
   a.toDataURL=b.toDataURL=()=> 'data:image/png;base64,TEST';
   const result=probe.analyzePixels(a,b);
   assert.equal(result.comparison.mismatchedPixels,1);
   assert.deepEqual(result.diagnostics.bounds,{minX:0,minY:0,maxX:0,maxY:0});
   assert.equal(result.diagnostics.quadrants.topLeft,1);
   assert.deepEqual(result.diagnostics.thresholds.map(x=>x.count),[1,1,1,0]);
   assert.equal(created[0].diffData[0],255);
   assert.equal(created[0].diffData[2],255);
   assert.equal(result.images.diff,'data:image/png;base64,TEST');
 }finally{global.document=previous;}
});

test('paint observer counts real canvas operations and restores methods',()=>{
 const calls=[];
 const ctx={fill(){calls.push('fill');},stroke(){calls.push('stroke');},clearRect(){calls.push('clear');}};
 const originalFill=ctx.fill;
 const counts=probe.observePaint(ctx,()=>{ctx.fill();ctx.fill();ctx.stroke();ctx.clearRect();});
 assert.deepEqual(counts,{fill:2,stroke:1,fillRect:0,strokeRect:0,clearRect:1});
 assert.equal(ctx.fill,originalFill);
 assert.deepEqual(calls,['fill','fill','stroke','clear']);
});
test('paint observer restores methods after a replay failure',()=>{
 const ctx={fill(){}};const original=ctx.fill;
 assert.throws(()=>probe.observePaint(ctx,()=>{ctx.fill();throw Error('failed');}),/failed/);
 assert.equal(ctx.fill,original);
});

test('pipeline observer counts stages, modes and fill requests and restores methods',()=>{
 const graph={
   DrawPoly3D(mode){this.Polygon3D({Size:4},mode);},
   Polygon3D(poly,mode){this.TransClipPolygon3D(poly,mode);},
   TransClipPolygon3D(poly,mode){this.ClipPolygon3D(poly,true);this.DrawPolygonList3D(poly,mode);return poly;},
   ClipPolygon3D(poly){return {Size:0};},
   DrawPolygonList3D(poly,mode){this.Polygon(poly,mode);},
   Polygon(poly,mode){this.DriverDrawPoly([],[],poly.Size,!!(mode&2));},
   DriverDrawPoly(){}
 };
 const original=graph.DrawPoly3D;
 const result=probe.observePipeline(graph,()=>{graph.DrawPoly3D(3);graph.DrawPoly3D(1);});
 assert.equal(result.DrawPoly3D.calls,2);
 assert.deepEqual(result.DrawPoly3D.modes,{'1':1,'3':1});
 assert.equal(result.ClipPolygon3D.emptyOutputs,2);
 assert.equal(result.DriverDrawPoly.fillCalls,1);
 assert.equal(result.DriverDrawPoly.outlineCalls,1);
 assert.equal(graph.DrawPoly3D,original);
});
test('pipeline observer restores original methods after failure',()=>{
 const graph={Polygon(){throw Error('pipeline failed');}};
 const original=graph.Polygon;
 assert.throws(()=>probe.observePipeline(graph,()=>graph.Polygon()),/pipeline failed/);
 assert.equal(graph.Polygon,original);
});

test('clipping snapshots locate the first divergent call and restore instrumentation',()=>{
 const graph={Trans3D:[[1,0],[0,1]],Camera:{Zoom:2},
   TransClipPolygon3D(poly){return {Size:poly.Size,X:poly.X,Y:poly.Y,Z:poly.Z};}};
 const original=graph.TransClipPolygon3D,first=[],second=[];
 probe.observePipeline(graph,()=>{
   graph.TransClipPolygon3D({Size:1,X:[1],Y:[2],Z:[3]},1);
   graph.TransClipPolygon3D({Size:1,X:[4],Y:[5],Z:[6]},1);
 },first);
 graph.Camera.Zoom=3;
 probe.observePipeline(graph,()=>{
   graph.TransClipPolygon3D({Size:1,X:[1],Y:[2],Z:[3]},1);
   graph.TransClipPolygon3D({Size:1,X:[4],Y:[5],Z:[6]},1);
 },second);
 assert.equal(first.length,2);
 assert.equal(probe.firstClippingDifference(first,second).callIndex,1);
 assert.equal(first[0].input.X[0],1);
 assert.equal(first[0].state.Camera.Zoom,2);
 assert.equal(graph.TransClipPolygon3D,original);
 assert.equal(probe.firstClippingDifference(first,first),null);
});

test('clipping snapshots ignore unused polygon array capacity but detect active coordinate differences',()=>{
 const graph={TransClipPolygon3D(poly){return {Size:poly.Size,X:poly.X,Y:poly.Y,Z:poly.Z};}};
 const first=[],second=[],changed=[];
 probe.observePipeline(graph,()=>graph.TransClipPolygon3D({Size:1,X:[10,20,30],Y:[40,50,60],Z:[70,80,90]},1),first);
 probe.observePipeline(graph,()=>graph.TransClipPolygon3D({Size:1,X:[10],Y:[40],Z:[70]},1),second);
 probe.observePipeline(graph,()=>graph.TransClipPolygon3D({Size:1,X:[11,20,30],Y:[40,50,60],Z:[70,80,90]},1),changed);
 assert.deepEqual(first[0].input.X,[10]);
 assert.deepEqual(first[0].output.Y,[40]);
 assert.equal(probe.firstClippingDifference(first,second),null);
 assert.equal(probe.firstClippingDifference(first,changed).callIndex,1);
});

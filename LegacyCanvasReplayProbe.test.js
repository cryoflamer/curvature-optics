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

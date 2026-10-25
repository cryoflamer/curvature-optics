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

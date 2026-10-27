'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const bridge=require('../src/diagnostics/CurvatureCompositionCapture');
const camera={pos:[0,-100,50],center:[0,0,0],up:[0,0,1],sceneSize:100,screenSize:100,objectZExtend:0,zoom:1};
const model={geometryRadius:6371000,Height:7,ObjType:[3,3],NObjects:[1,0],ObjDist:[100,0],ObjDeltaDist:[400,0],ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSideType:[0,0],ObjSize:[12,0],ObjSizeVar:[0,0],ObjSizeType:[0,0],rDisk:400,zDisk:3,hDip:1,rFEarth:1000,showGrid:3,hDisk:100,aDip:0.05,aDelta:0.02,sceneWidth:500,PanRad:0,showTangent:true,showData:false};
function canvas(w,h){let data=new Uint8ClampedArray(w*h*4);let ctx={clearRect(){data.fill(0)},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},getImageData(){return {data}}};return {width:w,height:h,getContext(){return ctx}};}
for(const globe of [false,true])test(`full composition capture globe=${globe}`,()=>{
 let calls=0;const args={model,objectIndex:0,globe,width:24,height:24,camera,geometryOptions:{segments:12},createCanvas:canvas,captureLegacy:()=>{calls++;return {canvas:canvas(24,24),camera}}};
 const partial=bridge.capture(args),full=bridge.capture({...args,compositionScope:'full'});
 assert.equal(calls,2);assert.equal(partial.compositionScope,'partial');assert.equal(full.compositionScope,'full');
 assert.equal(full.comparison.cameraMatched,true);assert.equal(full.compositionAudit.rendererReady,true);
 assert.ok(full.compositionAudit.layerCounts.some(x=>x.name==='surface-guides'&&x.count>0));
 assert.ok(full.compositionAudit.primitiveCount>partial.compositionAudit.primitiveCount);
 assert.equal(full.candidate.rgba.length,24*24*4);
 assert.equal(full.geometryForeground.comparedPixels,24*24);
 assert.equal(full.geometryForeground.excludedPixels,0);
 assert.equal(full.decorations.frameSegments,0);
 assert.equal(full.decorations.captionCount,0);
});
test('unknown composition scope is rejected',()=>assert.throws(()=>bridge.capture({compositionScope:'unknown',captureLegacy(){},createCanvas(){},width:4,height:4,camera}),/scope/));

for(const globe of [false,true])test(`shared legacy reference globe=${globe}`,()=>{
 let calls=0;const args={model,objectIndex:0,globe,width:24,height:24,camera,geometryOptions:{segments:12},createCanvas:canvas,captureLegacy:()=>{calls++;return {canvas:canvas(24,24),camera}}};
 const partial=bridge.capture(args);
 const full=bridge.capture({...args,compositionScope:'full',legacyReference:partial.reference,
  captureLegacy:()=>{throw new Error('legacy capture must not run twice')}});
 assert.equal(calls,1);assert.deepEqual(full.reference.rgba,partial.reference.rgba);
 assert.notStrictEqual(full.reference.rgba,partial.reference.rgba);
 assert.equal(full.comparison.cameraMatched,true);
});
test('shared reference rejects viewport and RGBA mismatch',()=>{
 const args={model,objectIndex:0,globe:false,width:24,height:24,camera,createCanvas:canvas};
 assert.throws(()=>bridge.capture({...args,legacyReference:{width:25,height:24,camera,rgba:new Uint8ClampedArray(24*24*4)}}),/reference/);
 assert.throws(()=>bridge.capture({...args,legacyReference:{width:24,height:24,camera,rgba:new Uint8ClampedArray(5)}}),/reference/);
});

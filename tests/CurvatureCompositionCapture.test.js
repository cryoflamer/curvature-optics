'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const bridge=require('../src/diagnostics/CurvatureCompositionCapture');
const camera={pos:[0,-100,50],center:[0,0,0],up:[0,0,1],sceneSize:100,screenSize:100,objectZExtend:0,zoom:1};
const model={geometryRadius:6371000,Height:7,ObjType:[3,3],NObjects:[1,0],ObjDist:[100,0],ObjDeltaDist:[400,0],ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSideType:[0,0],ObjSize:[12,0],ObjSizeVar:[0,0],ObjSizeType:[0,0],rDisk:400,zDisk:3,hDip:1};
function canvas(w,h){let data=new Uint8ClampedArray(w*h*4);let ctx={clearRect(){data.fill(0)},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},getImageData(){return {data}}};return {width:w,height:h,getContext(){return ctx}};}
test('captures a real reference callback and renders independent candidate',()=>{
 let called=0;const result=bridge.capture({model,objectIndex:0,globe:true,width:32,height:32,camera,geometryOptions:{segments:12},createCanvas:canvas,captureLegacy:()=>{called++;return {canvas:canvas(32,32),camera}}});
 assert.equal(called,1);assert.equal(result.comparison.cameraMatched,true);assert.equal(result.compositionAudit.rendererReady,true);assert.equal(result.reference.rgba.length,4096);assert.equal(result.candidate.rgba.length,4096);
});
test('rejects missing legacy callback, reused canvas and camera mismatch',()=>{
 const args={model,objectIndex:0,globe:true,width:16,height:16,camera,geometryOptions:{segments:12},createCanvas:canvas};
 assert.throws(()=>bridge.capture(args),/Legacy capture/);
 const same=canvas(16,16);assert.throws(()=>bridge.capture({...args,createCanvas:()=>same,captureLegacy:()=>({canvas:same,camera})}),/Distinct candidate/);
 assert.throws(()=>bridge.capture({...args,captureLegacy:()=>({canvas:canvas(16,16),camera:{...camera,zoom:2}})}),/Camera mismatch/);
});

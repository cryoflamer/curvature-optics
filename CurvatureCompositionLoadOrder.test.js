'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'CurvatureApp.html'),'latin1');

test('browser loads ear clipping before composition capture factory',()=>{
 const scripts=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m=>m[1]);
 for(const name of ['CurvatureZBufferPreview.js','CurvatureLegacyOrderPreview.js','CurvatureCompositionComparison.js','CurvatureEarClip.js','CurvatureCompositionCapture.js'])assert.ok(scripts.includes(name),name);
 assert.ok(scripts.indexOf('CurvatureEarClip.js')<scripts.indexOf('CurvatureCompositionCapture.js'));
});

test('browser-global capture resolves real ear clipping dependency',()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'CurvatureCompositionCapture.js'),'utf8');
 let received=null;
 const context={Uint8ClampedArray,Number,Error,RangeError,TypeError,
  CurvatureCompositionComparison:{prepare:()=>({scene:{primitives:[]},audit:{},limitations:[]}),compare:()=>({cameraMatched:true})},
  CurvatureZBufferPreview:{build:(_scene,_camera,_w,_h,triangulate)=>{received=triangulate;return {triangles:[]}}},
  CurvatureLegacyOrderPreview:{draw:()=>({statistics:{}})},
  CurvatureEarClip:{triangulate:()=>({triangles:[]})}};
 vm.runInNewContext(source,context,{filename:'CurvatureCompositionCapture.js'});
 const canvas=()=>({width:2,height:2,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(16)})})});
 context.CurvatureCompositionCapture.capture({model:{},objectIndex:0,globe:true,width:2,height:2,camera:{zoom:1},captureLegacy:()=>({canvas:canvas(),camera:{zoom:1}}),createCanvas:canvas});
 assert.equal(received,context.CurvatureEarClip.triangulate);
});

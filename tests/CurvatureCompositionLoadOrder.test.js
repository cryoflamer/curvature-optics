'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=require('./helpers/readCurvatureSources')();

test('browser loads ear clipping before composition capture factory',()=>{
 const scripts=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m=>m[1]);
 for(const name of ['src/renderers/CurvatureZBufferPreview.js','src/renderers/CurvatureLegacyOrderPreview.js','src/diagnostics/CurvatureCompositionComparison.js','src/geometry/CurvatureEarClip.js','src/diagnostics/CurvatureCompositionCapture.js'])assert.ok(scripts.includes(name),name);
 assert.ok(scripts.indexOf('src/geometry/CurvatureEarClip.js')<scripts.indexOf('src/diagnostics/CurvatureCompositionCapture.js'));
});

test('browser-global capture resolves frame contract and ear clipping before rendering',()=>{
 const captureSource=fs.readFileSync(require('node:path').join(__dirname,'../src/diagnostics/CurvatureCompositionCapture.js'),'utf8');
 const rendererSource=fs.readFileSync(require('node:path').join(__dirname,'../src/renderers/CurvatureFrameRenderer.js'),'utf8');
 let received=null,rendered=false;
 const frameContract={fromComposition:(composed,camera,width,height)=>({scene:composed.scene,camera,viewport:{width,height},layers:[{name:'geometry',role:'geometry',count:composed.scene.primitives.length}]}),validate:frame=>frame};
 const context={Uint8ClampedArray,Number,Error,RangeError,TypeError,
  CurvatureRenderFrame:frameContract,
  CurvatureCompositionComparison:{prepare:()=>({scene:{primitives:[]},audit:{},limitations:[]}),compare:()=>({cameraMatched:true})},
  CurvatureZBufferPreview:{build:(_scene,_camera,_w,_h,triangulate)=>{received=triangulate;return {triangles:[],statistics:{}}}},
  CurvatureLegacyOrderPreview:{draw:()=>{rendered=true;return {statistics:{}}}},
  CurvatureEarClip:{triangulate:()=>({triangles:[]})}};
 vm.runInNewContext(rendererSource,context,{filename:'src/renderers/CurvatureFrameRenderer.js'});
 vm.runInNewContext(captureSource,context,{filename:'src/diagnostics/CurvatureCompositionCapture.js'});
 const canvas=()=>({width:2,height:2,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(16)})})});
 context.CurvatureCompositionCapture.capture({model:{},objectIndex:0,globe:true,width:2,height:2,camera:{zoom:1},captureLegacy:()=>({canvas:canvas(),camera:{zoom:1}}),createCanvas:canvas});
 assert.equal(received,context.CurvatureEarClip.triangulate);
 assert.equal(rendered,true);
});

test('world-frame scripts load before composition capture',()=>{
 const scripts=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m=>m[1]);
 for(const name of ['src/scene/CurvatureSceneContract.js','src/scene/CurvatureRenderFrame.js',
  'src/renderers/CurvatureFrameRenderer.js','src/diagnostics/CurvatureCompositionCapture.js'])
  assert.ok(scripts.includes(name),name);
 assert.ok(scripts.indexOf('src/scene/CurvatureSceneContract.js')<scripts.indexOf('src/scene/CurvatureRenderFrame.js'));
 assert.ok(scripts.indexOf('src/scene/CurvatureRenderFrame.js')<scripts.indexOf('src/renderers/CurvatureFrameRenderer.js'));
 assert.ok(scripts.indexOf('src/geometry/CurvatureEarClip.js')<scripts.indexOf('src/renderers/CurvatureFrameRenderer.js'));
 assert.ok(scripts.indexOf('src/renderers/CurvatureFrameRenderer.js')<scripts.indexOf('src/diagnostics/CurvatureCompositionCapture.js'));
});

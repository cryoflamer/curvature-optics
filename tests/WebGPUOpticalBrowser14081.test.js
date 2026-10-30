'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const b=require('../src/diagnostics/CurvatureWebGPUOpticsBenchmark');
const html=fs.readFileSync(path.join(__dirname,'../tools/webgpu-optics-1408.html'),'utf8');

test('140.8.1: shader does not write through multi-component vector swizzles',()=>{
 assert.doesNotMatch(b.WGSL,/\b\w+\.(?:xy|xz|yz|zw|xyz|xyzw)\s*(?:[+*\/-]?=)/);
 assert.match(b.WGSL,/out\.z=out\.z\*inv;/);
 assert.match(b.WGSL,/out\.w=out\.w\*inv;/);
});

test('140.8.1: real-valued HTML controls allow their defaults and arbitrary fractions',()=>{
 for(const name of ['observerHeight','occlusionRadius','step','maxPositionError','maxAngularError']){
  const match=html.match(new RegExp('<input\\s+name="'+name+'"[^>]*>'));
  assert.ok(match,`Missing ${name}`);
  assert.match(match[0],/step="any"/,`${name} should not suffer HTML step mismatch`);
 }
 for(const name of ['count','steps','repeats']){
  const match=html.match(new RegExp('<input\\s+name="'+name+'"[^>]*>'));
  assert.ok(match);
  assert.match(match[0],/step="1"/);
 }
 assert.match(html,/control\.valueAsNumber/);
 assert.doesNotMatch(html,/Number\(pair\[1\]\)|parseFloat\(pair\[1\]\)/);
});

test('140.8.1: browser shader compilation errors are surfaced before compute dispatch',async()=>{
 let pipelineCalls=0;
 const device={limits:{maxStorageBufferBindingSize:1000000},createShaderModule:()=>({getCompilationInfo:async()=>({messages:[
  {type:'error',message:'shader rejected by compiler'}]})}),
  createComputePipelineAsync:async()=>{pipelineCalls++;}};
 const nav={gpu:{requestAdapter:async()=>({requestDevice:async()=>device})}};
 await assert.rejects(b.run({count:1,steps:1},{navigator:nav,
  GPUBufferUsage:{STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8},GPUMapMode:{READ:1}}),
 /WGSL compilation failed: shader rejected by compiler/);
 assert.equal(pipelineCalls,0);
});

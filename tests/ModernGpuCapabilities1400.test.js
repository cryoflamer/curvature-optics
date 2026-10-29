'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cap=require('../src/ui/modern/ModernGpuCapabilities');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
test('unsupported browser reports unavailable and never asserts hardware',async()=>{
  const result=await cap.probe({document:{createElement(){return {getContext(){return null;}};}},navigator:{}});
  assert.equal(result.webgl.status,'unavailable');assert.equal(result.webgl2.status,'unavailable');
  assert.equal(result.webgpu.status,'unavailable');assert.equal(result.hardwareAcceleration,'unverified');
});
test('context probe reports discovered properties and releases only its own canvas',()=>{
  let lost=0;const gl={MAX_TEXTURE_SIZE:3379,getParameter(k){return k===3379?4096:'SwiftShader';},
    getExtension(name){if(name==='WEBGL_debug_renderer_info')return {UNMASKED_RENDERER_WEBGL:1,UNMASKED_VENDOR_WEBGL:2};
      if(name==='WEBGL_lose_context')return {loseContext(){lost++;}};
      if(name==='EXT_color_buffer_float')return {};
      return null;}};
  const result=cap.webglResult({createElement(){return {getContext(kind,opts){
    assert.equal(kind,'webgl2');assert.equal(opts.failIfMajorPerformanceCaveat,true);return gl;}};}},'webgl2');
  assert.equal(result.status,'available');assert.equal(result.software,'suspected');
  assert.equal(result.floatTexture,'renderable');assert.equal(result.maxTextureSize,4096);
  assert.equal(lost,1);
});
test('WebGPU absent, denied and present are differentiated',async()=>{
  assert.equal((await cap.webgpuResult({})).status,'unavailable');
  assert.equal((await cap.webgpuResult({gpu:{requestAdapter:async()=>null}})).status,'unavailable');
  assert.equal((await cap.webgpuResult({gpu:{requestAdapter:async()=>{throw Error('denied');}}})).status,'error');
  assert.equal((await cap.webgpuResult({gpu:{requestAdapter:async()=>({features:new Set(['x'])})}})).status,'available');
});
test('opt-in Display controls and standalone module are wired without replacing renderer',()=>{
  for(const id of ['ModernGpuCheck','ModernGpuWebGL','ModernGpuWebGL2','ModernGpuWebGPU','ModernGpuHardware'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(html.includes('ModernGpuCapabilities.js'));
  assert.ok(app.includes('bindGpuDiagnostics();'));
  assert.ok(app.includes('getGpuCapabilities:function()'));
  assert.ok(html.includes('Selected scene backend'));
});

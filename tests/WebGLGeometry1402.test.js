'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const contract=require('../src/scene/CurvatureSceneContract');
const frames=require('../src/scene/CurvatureRenderFrame');
const gpu=require('../src/renderers/CurvatureWebGLGeometryRenderer');
const frameRenderer=require('../src/renderers/CurvatureFrameRenderer');
const camera={pos:[0,-20,10],center:[0,0,0],up:[0,0,1],sceneSize:40,screenSize:40,objectZExtend:0,zoom:1};
const scene=contract.createScene('legacy',[
  {type:'line',points:[[0,0,0],[1,0,0]],commandIndex:0,style:{stroke:'#ff0000',lineWidth:2}},
  {type:'polygon',points:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],commandIndex:1,
    mode:3,style:{fill:'#0000ff',stroke:'#008000'}}]);
function fakeCanvas(){const ctx={clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){}};
  return {width:64,height:48,getContext(){return ctx;}};}
test('experimental mode is opt-in and falls back on unavailable GPU',()=>{
  const frame=frames.fromScene(scene,camera,64,48),canvas=fakeCanvas();
  const reference=frameRenderer.render(canvas,frame);
  const attempt=frameRenderer.render(canvas,frame,{mode:'gpu-painter'});
  assert.equal(reference.mode,'painter');
  assert.equal(attempt.mode,'painter');
  assert.equal(attempt.requestedMode,'gpu-painter');
  assert.match(attempt.gpuFallback,/GPU canvas is unavailable/);
  assert.equal(attempt.statistics.drawnSegments,reference.statistics.drawnSegments);
  assert.equal(frameRenderer.MODES.includes('gpu-painter'),true);
});
test('GPU pure geometry batches preserve painter command order and segment sizes',()=>{
  const data=gpu.commands(scene,camera,64,48,[]);
  assert.equal(data.statistics.inputLines,1);
  assert.ok(data.batches.length>=2);
  assert.ok(data.batches.every(b=>b.vertices.length%6===0));
  assert.deepEqual(gpu.parseColor('#0f08'),[0,1,0,136/255]);
  assert.equal(gpu.parseColor('red')[0],1);
  assert.throws(()=>gpu.parseColor('rebeccapurple'),/Unsupported/);
  const quad=[];gpu.segmentQuad([0,0],[10,0],2,quad);
  assert.deepEqual(quad,[0,1,0,-1,10,1,10,1,0,-1,10,-1]);
  assert.deepEqual(data.batches[0].rgba,[1,0,0,1]);
});
test('GPU context failure triggers CPU fallback without repainting unvalidated frame',()=>{
  const frame=frames.fromScene(scene,camera,64,48),canvas=fakeCanvas();
  assert.throws(()=>frameRenderer.render(canvas,{...frame,viewport:{width:32,height:48}},
    {mode:'gpu-painter'}),/viewport/);
});
test('Modern UI loads GPU module before the shared frame renderer and exposes explicit selection',()=>{
  const base=path.join(__dirname,'..');
  const html=fs.readFileSync(path.join(base,'CurvatureModern.html'),'utf8');
  // Cache-busting version numbers can change independently of the WebGL2 wiring.
  // Assert actual, unique script dependencies and their required load order.
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
    .map(m=>m[1].split('?')[0]);
  const webgl='src/renderers/CurvatureWebGLGeometryRenderer.js';
  const frame='src/renderers/CurvatureFrameRenderer.js';
  const appScript='src/ui/modern/ModernApp.js';
  for(const script of [webgl,frame,appScript])
    assert.equal(scripts.filter(s=>s===script).length,1,`${script} must load exactly once`);
  assert.ok(scripts.indexOf(webgl)<scripts.indexOf(frame));
  assert.ok(scripts.indexOf(frame)<scripts.indexOf(appScript));
  assert.match(html,/id="ModernGeometryBackend"/);
  const app=fs.readFileSync(path.join(base,'src/ui/modern/ModernApp.js'),'utf8');
  assert.match(app,/geometryBackend:state\.geometryBackend/);
  assert.match(app,/bindGeometryBackend\(\)/);
});
test('WebGL2 draw uploads projected batches and composites only after successful draw',()=>{
  const calls=[],gl={NO_ERROR:0,VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
    DEPTH_TEST:5,CULL_FACE:6,BLEND:7,SRC_ALPHA:8,ONE_MINUS_SRC_ALPHA:9,ONE:10,
    ARRAY_BUFFER:11,FLOAT:12,STREAM_DRAW:13,TRIANGLES:14,COLOR_BUFFER_BIT:15,
    createShader(){return {};},shaderSource(){},compileShader(){},getShaderParameter(){return true;},
    createProgram(){return {};},attachShader(){},linkProgram(){},deleteShader(){},
    getProgramParameter(){return true;},createBuffer(){return {};},getAttribLocation(){return 0;},
    getUniformLocation(){return {};},viewport(){},disable(){},enable(){},blendFuncSeparate(){},
    clearColor(){},clear(){},useProgram(){},uniform2f(){},bindBuffer(){},
    enableVertexAttribArray(){},vertexAttribPointer(){},uniform4fv(){},
    bufferData(_target,data){calls.push(['upload',data.length]);},
    drawArrays(_mode,_first,n){calls.push(['draw',n]);},getError(){return 0;},isContextLost(){return false;}};
  const offscreen={width:0,height:0,getContext(kind){assert.equal(kind,'webgl2');return gl;},addEventListener(){}};
  const target={width:64,height:48,getContext(kind){assert.equal(kind,'2d');return {
    clearRect(){calls.push(['clear']);},drawImage(source){assert.equal(source,offscreen);calls.push(['composite']);}};}};
  const output=gpu.draw(target,scene,camera,[],{createCanvas:()=>offscreen});
  assert.ok(output.statistics.gpuVertices>0);
  assert.ok(output.statistics.gpuBatches>0);
  assert.ok(calls.some(c=>c[0]==='draw'));
  assert.equal(calls.at(-1)[0],'composite');
  assert.deepEqual([offscreen.width,offscreen.height],[64,48]);
  calls.length=0;
  gpu.draw(target,scene,camera,[],{createCanvas:()=>{throw Error('not expected');}});
  assert.ok(calls.some(c=>c[0]==='draw'),'WebGL context reused for same viewport');
});

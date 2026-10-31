'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const profiler=require('../src/ui/modern/ModernRenderProfiler');
const report=require('../src/ui/modern/ModernPerformanceReport');
const shimmer=require('../src/ui/modern/ModernAtmosphericShimmer');
const root=path.resolve(__dirname,'..');

test('140.1: profiler has bounded, independent CPU WebGL and GPU elapsed samples',()=>{
  const p=profiler.create({capacity:2});
  for(let i=1;i<=3;i++){
    p.recordPresentation({viewport:'Scene',cpuTotalMs:i,uploaded:i===1,
      cpuUploadMs:i===1?2:undefined,cpuSubmitMs:.5});
    p.recordGpuDraw({viewport:'Scene',gpuDrawMs:i/10});
  }
  p.recordPresentation({viewport:'A',cpuTotalMs:9,uploaded:false});
  const s=p.summary();
  assert.equal(s.presentations.Scene.count,2);
  assert.equal(s.presentations.Scene.median.cpuTotalMs,2);
  assert.equal(s.presentations.Scene.p95.cpuTotalMs,3);
  assert.equal(s.presentations.Scene.latest.uploaded,false);
  assert.equal(s.gpuDraws.Scene.count,2);
  assert.equal(s.gpuDraws.Scene.latest.gpuDrawMs,.3);
  assert.equal(s.presentations.A.count,1);
  assert.equal(s.presentations.B.count,0);
  p.setEnabled(false);
  p.recordPresentation({viewport:'Scene',cpuTotalMs:20});
  p.recordGpuDraw({viewport:'Scene',gpuDrawMs:20});
  p.recordRender({viewport:'Scene',totalMs:20});
  assert.equal(p.summary().presentations.Scene.count,2);
  assert.equal(p.summary().renders.Scene.count,0);
  p.setEnabled(true);p.clear();
  assert.equal(p.summary().gpuDraws.Scene.count,0);
  assert.throws(()=>p.recordPresentation({viewport:'X'}),RangeError);
  assert.throws(()=>p.recordGpuDraw({viewport:'X'}),RangeError);
});

test('140.1: report clearly distinguishes CPU, Canvas, GPU timer and RAF wait',()=>{
  const p=profiler.create();
  p.recordRender({viewport:'Scene',totalMs:15,rendererMs:12,overlayMs:3,cacheReused:true,
    stages:{composeMs:1,opticsMs:4,projectionMs:2,canvasMs:5,decorationsMs:1}});
  p.recordBatch({mode:'scene',totalMs:16,queueMs:8});
  p.recordPresentation({viewport:'Scene',cpuTotalMs:2,cpuUploadMs:1,cpuSubmitMs:1,uploaded:true});
  p.recordGpuDraw({viewport:'Scene',gpuDrawMs:.75});
  const output=report.format(p.summary());
  for(const expected of ['Scene · 1 physical redraw','latest rays cached',
    'Optical transform: 4.00 / 4.00 ms','Raster + Canvas presentation (CPU wall): 5.00',
    'RAF wait (not rendering): 8.00','Canvas→texture upload call',
    'GPU draw execution (timer extension): 0.75','not GPU completion times'])
    assert.ok(output.includes(expected),expected);
  const empty=report.format(profiler.create().summary());
  assert.match(empty,/No GPU samples/);
  assert.doesNotMatch(empty,/GPU draw execution \(timer extension\): 0\.00/);
});

function fakeCanvas(options={}){
  const calls=[];let nextId=0;
  const ext=options.timer?{
    TIME_ELAPSED_EXT:35007,QUERY_RESULT_AVAILABLE_EXT:34919,QUERY_RESULT_EXT:34918,GPU_DISJOINT_EXT:36795,
    createQueryEXT(){calls.push('query-create');return {id:++nextId};},
    beginQueryEXT(){calls.push('query-begin');},endQueryEXT(){calls.push('query-end');},
    deleteQueryEXT(){calls.push('query-delete');},
    getQueryObjectEXT(q,key){if(key===34919)return true;return 800000;}
  }:null;
  const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
    ARRAY_BUFFER:5,STATIC_DRAW:6,FLOAT:7,TEXTURE0:8,TEXTURE_2D:9,
    TEXTURE_MIN_FILTER:10,TEXTURE_MAG_FILTER:11,LINEAR:12,TEXTURE_WRAP_S:13,
    TEXTURE_WRAP_T:14,CLAMP_TO_EDGE:15,UNPACK_FLIP_Y_WEBGL:16,RGBA:17,
    UNSIGNED_BYTE:18,TRIANGLE_STRIP:19,NO_ERROR:0,
    getShaderParameter(){return true;},getProgramParameter(){return true;},
    getAttribLocation(){return 0;},getUniformLocation(_p,name){return name;},
    getError(){return 0;},getParameter(){return !!options.disjoint;},
    getExtension(name){calls.push('extension');return name==='EXT_disjoint_timer_query'?ext:null;}};
  for(const key of ['shaderSource','compileShader','deleteShader','attachShader','linkProgram',
    'deleteTexture','deleteBuffer','deleteProgram','useProgram','bindBuffer','bufferData',
    'enableVertexAttribArray','vertexAttribPointer','activeTexture','bindTexture',
    'texParameteri','pixelStorei','uniform1i','texImage2D','viewport','uniform2f',
    'uniform1f','drawArrays'])gl[key]=()=>calls.push(key);
  for(const key of ['createShader','createProgram','createBuffer','createTexture'])gl[key]=()=>({});
  const target={width:800,height:400,offsetWidth:400,getContext(){return gl;},addEventListener(){}};
  return {target,calls};
}

test('140.1: shimmer samples only while explicitly enabled; GPU query is asynchronous',()=>{
  const {target,calls}=fakeCanvas({timer:true}),source={width:800,height:400,offsetWidth:400};
  const cpu=[],gpu=[];
  const effect=shimmer.create({onProfile:(name,entry)=>cpu.push({name,...entry}),
    onGpuTime:(name,entry)=>gpu.push({name,...entry})});
  effect.present(source,target,'Scene',{capture:true});
  assert.equal(cpu.length,0);assert.equal(gpu.length,0);
  assert.ok(!calls.includes('extension'),'GPU timing must not initialize without opt-in');
  effect.setProfiling(true);
  effect.present(source,target,'Scene',{capture:false,timeMs:100});
  effect.present(source,target,'Scene',{capture:false,timeMs:120});
  assert.equal(cpu.length,2);
  assert.equal(cpu[0].uploaded,false);
  assert.ok(Number.isFinite(cpu[0].cpuSubmitMs));
  assert.deepEqual(gpu,[{name:'Scene',gpuDrawMs:.8}]);
  assert.equal(calls.filter(x=>x==='texImage2D').length,1);
  assert.ok(!calls.includes('finish')&&!calls.includes('readPixels'));
  effect.setProfiling(false);
  effect.present(source,target,'Scene',{capture:false,timeMs:140});
  assert.equal(cpu.length,2);assert.equal(gpu.length,1);
});

test('140.1: disjoint GPU results and stale recording-generation queries are excluded',()=>{
  const source={width:100,height:50,offsetWidth:100};
  const a=fakeCanvas({timer:true,disjoint:true}),bad=[];
  const ea=shimmer.create({onGpuTime:(_name,data)=>bad.push(data)});
  ea.setProfiling(true);ea.present(source,a.target,'A',{capture:true});
  ea.present(source,a.target,'A',{capture:false});
  assert.equal(bad.length,0,'disjoint GPU measurement cannot be trusted');
  const b=fakeCanvas({timer:true}),good=[];
  const eb=shimmer.create({onGpuTime:(_name,data)=>good.push(data)});
  eb.setProfiling(true);eb.present(source,b.target,'B',{capture:true});
  eb.setProfiling(false);eb.setProfiling(true);
  eb.present(source,b.target,'B',{capture:false});
  assert.equal(good.length,0,'an old query must not pollute the new recording');
  eb.present(source,b.target,'B',{capture:false});
  assert.equal(good.length,1);
  const c=fakeCanvas({timer:false}),absent=[];
  const ec=shimmer.create({onGpuTime:(_name,data)=>absent.push(data)});
  ec.setProfiling(true);ec.present(source,c.target,'Scene',{capture:true});
  ec.present(source,c.target,'Scene',{capture:false});
  assert.equal(absent.length,0,'unsupported timer means unknown GPU time, never zero');
});

test('140.1: profiler controls and documentation remain available with optional GPU backend',()=>{
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  for(const id of ['ModernPerfRecord','ModernPerfStop','ModernPerfSnapshot','ModernPerfReset','ModernPerfExport','ModernPerfResults'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(html,/ModernPerformanceReport\.js/);
  assert.match(app,/bindPerformanceDiagnostics\(\);/);
  assert.match(app,/getPerformanceSnapshot:performanceSnapshot/);
  assert.match(html,/id="ModernGpuActiveBackend"/);
  assert.match(html,/Canvas 2D · reference/);
});


test('140.1.2: profiler and app use explicit cache-busted module versions',()=>{
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  assert.match(html,/ModernRenderProfiler\.js\?v=140\.3/);
  assert.match(html,/ModernApp\.js\?v=140\.12\.28/);
  assert.match(app,/typeof renderProfiler\.setEnabled!==['"]function['"]/);
  assert.match(app,/Profiler API mismatch/);
  const actual=profiler.create();
  assert.equal(typeof actual.setEnabled,'function');
  actual.setEnabled(false);
  assert.equal(actual.summary().enabled,false);
  actual.setEnabled(true);
  assert.equal(actual.summary().enabled,true);
});

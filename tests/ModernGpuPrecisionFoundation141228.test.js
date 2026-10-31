'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const p=require('../src/diagnostics/CurvatureGpuPrecisionFoundation141228');
const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');

test('140.12.28: original f64 coordinates survive hi/lo upload; references are not pre-f32-rounded',()=>{
  const samples=[6371000.01,6371000.000001,6371000.0001,.00029300001,1.00000001,1/3,-123456.7890123];
  for(const n of samples){
    const limbs=p.split64(n);
    assert.equal(limbs[0],Math.fround(n));
    assert.equal(limbs[1],Math.fround(n-limbs[0]));
    assert.ok(Math.abs(limbs[0]+limbs[1]-n)<=1e-10*Math.max(1,Math.abs(n)));
  }
  const a=p.split64(6371000.01);
  assert.equal(a[0],6371000);
  assert.ok(Math.abs(a[1]-.01)<1e-8);
  assert.throws(()=>p.split64(Infinity),/Unsupported/);
  assert.throws(()=>p.split64(1e40),/Unsupported/);
  const vectors=p.makeVectors();
  assert.ok(vectors.length>=60);
  const row=vectors.find(x=>x.op==='sub'&&x.label==='earth radius + 1 cm');
  assert.ok(row);
  assert.ok(Math.abs(p.oracle(row)-.01)<1e-8);
  const data=p.packedInput([row]);
  assert.deepEqual(Array.from(data.limbs).map(x=>x),[
    ...p.split64(row.a),...p.split64(row.b)]);
  assert.equal(data.operations[0],1);
  assert.throws(()=>p.packedInput([{op:'oops',a:1,b:2}]),/Unknown precision operation/);
});

test('140.12.28: three independent optimized WGSL modes use integer residual logic only in mode 2',()=>{
  assert.deepEqual(p.MODES,['f32','classic_ds','integer_residual_ds']);
  assert.deepEqual(p.OPS,['add','sub','mul','div','sqrt']);
  const shaders=p.MODES.map(p.wgsl);
  shaders.forEach((code,i)=>{
    assert.match(code,new RegExp(`const MODE:u32=${i}u;`));
    assert.match(code,/@compute @workgroup_size\(64\)/);
    assert.match(code,/@binding\(3\) var<storage,read> settings/);
    assert.match(code,/result=oneStep\(result/);
    assert.doesNotMatch(code,/@MODE@|@HELPERS@/);
  });
  assert.match(shaders[2],/fn intTwoSum/);
  assert.match(shaders[2],/fn intTwoProd/);
  assert.match(shaders[2],/countLeadingZeros/);
  assert.match(shaders[2],/bitcast<u32>/);
  assert.match(shaders[2],/u64sub\(exact,rounded\)/);
  assert.match(shaders[1],/fn classicTwoProd/);
  assert.match(shaders[1],/4097\.0/);
  assert.match(shaders[2],/fn dsDiv/);
  assert.match(shaders[2],/fn dsSqrt/);
  assert.throws(()=>p.wgsl('fp64'),/Unknown precision mode/);
});

test('140.12.28: decoder checks real f32 words; analysis does not overclaim certification',()=>{
  const v=[{op:'sub',a:6371000.01,b:6371000,label:'earth radius + 1 cm'},
    {op:'sqrt',a:2,b:1,label:'sqrt 2'}];
  const f32=p.decode(v,new Float32Array([0,0,1,0,Math.fround(Math.sqrt(2)),0,1,0]));
  const reference=Math.fround(.01);
  const ds=p.decode(v,new Float32Array([reference,0,1,0,...p.split64(Math.sqrt(2)),1,0]));
  assert.equal(f32.length,2);
  const runs={};
  for(const mode of p.MODES)runs[mode]={results:mode==='f32'?f32:ds,
    setupMs:2,correctnessMs:1,benchmarkIterations:128,benchmarkMs:[3,1,2]};
  const out=p.analyze(v,runs);
  assert.equal(out.version,'140.12.28');
  assert.equal(out.summary.classic_ds.benchmarkWarmMedianMs,2);
  assert.equal(out.summary.integer_residual_ds.strictlyBetterThanF32,2);
  assert.equal(out.perCase.length,6);
  assert.equal(out.framePaintingChanged,false);
  assert.equal(out.shootingChanged,false);
  assert.equal(out.productionAuthorized,false);
  assert.match(out.arithmeticContract,/not IEEE binary64/i);
  assert.match(out.compilerCaveat,/reassociation/);
  assert.throws(()=>p.decode(v,new Float32Array(4)),/mismatch/);
  assert.throws(()=>p.decode(v,new Float32Array([1,0,0,0,1,0,1,0])),/Invalid GPU/);
  assert.throws(()=>p.analyze(v,{}),/Missing mode/);
});

test('140.12.28: UI is a separate diagnostic with export and no scene mutation',()=>{
  assert.match(html,/src\/diagnostics\/CurvatureGpuPrecisionFoundation141228\.js/);
  assert.match(html,/ModernGpuPrecisionFoundationRun/);
  assert.match(html,/ModernApp\.js\?v=140\.12\.28/);
  assert.match(app,/addEventListener\('click',runGpuPrecisionFoundation141228\)/);
  assert.match(app,/curvature-compare-140\.12\.28-gpu-arithmetic\.json/);
  const body=app.slice(app.indexOf('async function runGpuPrecisionFoundation141228(){'),
    app.indexOf('function bindCompareGpuProbe(){'));
  assert.match(body,/precision\.makeVectors/);
  assert.match(body,/session\.run\(vectors/);
  assert.match(body,/state\.probeFrameLast=report/);
  assert.doesNotMatch(body,/solveCpuBatch|renderComposition|renderPhysical|gpuRayField|Redraw\(/);
});

function mockedGpu(){
  const usage={STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8},buffers=[],codes=[],writes=[];
  let activePipeline=null,activeBind=null,dispatches=0,deviceDestroyed=false;
  const device={limits:{maxStorageBufferBindingSize:1e8},
    createShaderModule({code}){codes.push(code);return {code,getCompilationInfo:async()=>({messages:[]})};},
    async createComputePipelineAsync({compute}){return {code:compute.module.code,getBindGroupLayout:()=>({})};},
    createBindGroup({entries}){return entries;},
    createBuffer({size}){const b={bytes:new ArrayBuffer(size),destroy(){this.destroyed=true;},
      mapAsync:async()=>{},getMappedRange(offset,length){return this.bytes.slice(offset,offset+length);},
      unmap(){}};buffers.push(b);return b;},
    createCommandEncoder(){let copy;
      return {beginComputePass(){return {setPipeline(v){activePipeline=v;},setBindGroup(i,v){activeBind=v;},
        dispatchWorkgroups(){dispatches++;},end(){}};},
        copyBufferToBuffer(from,fromOffset,to,toOffset,length){copy={from,fromOffset,to,toOffset,length};},
        finish(){return {copy};}};},
    queue:{writeBuffer(buffer,offset,values){writes.push(values.slice());
      new Uint8Array(buffer.bytes,offset,values.byteLength).set(
        new Uint8Array(values.buffer,values.byteOffset,values.byteLength));},
      submit(commands){
        const c=commands[0].copy,mode=Number(activePipeline.code.match(/const MODE:u32=(\d)u/)[1]);
        const inputs=new Float32Array(activeBind[0].resource.buffer.bytes);
        const operations=new Uint32Array(activeBind[1].resource.buffer.bytes);
        const outputs=new Float32Array(activeBind[2].resource.buffer.bytes);
        const config=new Uint32Array(activeBind[3].resource.buffer.bytes);
        for(let i=0;i<config[0];i++){
          const j=i*4, a=inputs[j]+inputs[j+1],b=inputs[j+2]+inputs[j+3];
          let v;
          switch(operations[i]){
            case 0:v=a+b;break;case 1:v=a-b;break;case 2:v=a*b;break;
            case 3:v=a/b;break;case 4:v=Math.sqrt(a);break;
          }
          const hi=Math.fround(v),lo=mode===0?0:Math.fround(v-hi);
          outputs.set([hi,lo,1,0],j);
        }
        new Uint8Array(c.to.bytes,c.toOffset,c.length).set(
          new Uint8Array(c.from.bytes,c.fromOffset,c.length));
      }},destroy(){deviceDestroyed=true;}};
  const deps={navigator:{gpu:{requestAdapter:async()=>({
    info:{vendor:'mock'},requestDevice:async()=>device})}},
    GPUBufferUsage:usage,GPUMapMode:{READ:1}};
  return {deps,buffers,codes,writes,get dispatches(){return dispatches;},
    get deviceDestroyed(){return deviceDestroyed;}};
}

test('140.12.28: three mocked GPU pipelines run serially, read back, export and release buffers',async()=>{
  const mock=mockedGpu(),vectors=p.makeVectors().slice(0,6),session=await p.createSession(vectors.length,mock.deps);
  try{
    const report=await session.run(vectors,{warmRepeats:2,benchmarkIterations:8});
    assert.equal(mock.codes.length,3);
    assert.equal(mock.dispatches,3*(1+1+2));
    assert.equal(report.perCase.length,18);
    assert.ok(report.summary.integer_residual_ds.benchmarkWarmMedianMs>=0);
    assert.equal(report.productionAuthorized,false);
    assert.ok(mock.writes.some(v=>v instanceof Float32Array));
    await assert.rejects(()=>session.run(vectors,{warmRepeats:21}),/Invalid precision benchmark/);
    await assert.rejects(()=>session.run([...vectors,...vectors]),/exceed capacity/);
  }finally{session.close();session.close();}
  assert.ok(mock.buffers.every(b=>b.destroyed));
  assert.equal(mock.deviceDestroyed,true);
  await assert.rejects(()=>session.run(vectors),/closed/);
  await assert.rejects(()=>p.createSession(1,{navigator:{}}),/unavailable/);
});

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

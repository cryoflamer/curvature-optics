'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const bench=require('../src/diagnostics/CurvatureWebGPUOpticsBenchmark');
const matrix=require('../src/diagnostics/CurvatureWebGPUOpticsMatrix1409');
const precise=require('../src/diagnostics/CurvatureWebGPUOpticsPrecision14091');
const html=fs.readFileSync(path.join(__dirname,'../tools/webgpu-optics.html'),'utf8');
function result(p,mode){
 const a=p.atmosphere==='vacuum'?{
  cpuVsAnalytic:{qualified:true},gpuVsAnalytic:{qualified:true}}:null;
 return {status:'measured',qualified:true,parameters:p,
  timing:{ratioCpuToGpu:mode==='compensated'?8:15},
  validation:{qualified:true,failedRays:0,nonFiniteRays:0},analyticVacuum:a};
}
function passingPairs(){return matrix.cases({}).map(item=>({id:item.id,parameters:item.parameters,
 naive:result(item.parameters,'naive'),compensated:result(item.parameters,'compensated')}));}

test('140.9.1: the baseline WGSL is unchanged and compensation retains RK4 stage evaluation',()=>{
 assert.match(bench.WGSL,/for\(var j=0u;j<config\[1\];j=j\+1u\)\{s=advance\(s,ds\);\}/);
 assert.match(bench.WGSL_COMPENSATED,/let delta=\(ds\/6\.0\)\*\(a\+2\.0\*b\+2\.0\*c\+d\)/);
 assert.match(bench.WGSL_COMPENSATED,/let adjusted=delta\.xy-correction/);
 assert.match(bench.WGSL_COMPENSATED,/let nextCorrection=\(summed-s\.xy\)-adjusted/);
 assert.match(bench.WGSL_COMPENSATED,/advanceCompensated\(s,ds,correction\)/);
 assert.doesNotMatch(bench.WGSL_COMPENSATED,/out\.(?:xy|zw)\s*=/);
 assert.equal(bench.check({}).accumulation,undefined);
 assert.equal(bench.check({accumulation:'compensated'}).accumulation,'compensated');
 assert.throws(()=>bench.check({accumulation:'quietly-relax'}),/Invalid/);
});

test('140.9.1: Kahan f32 accumulation addresses demonstrable vacuum drift (offline algorithm sanity, not WGSL proof)',()=>{
 const f=Math.fround,delta=f(50*f(0.99995));let naive=0,compensated=0,correction=0;
 for(let i=0;i<2000;i++){
  naive=f(naive+delta);
  const adjusted=f(delta-correction),summed=f(compensated+adjusted);
  correction=f(f(summed-compensated)-adjusted);compensated=summed;
 }
 const reference=2000*delta;
 assert.ok(Math.abs(naive-reference)>0.5);
 assert.ok(Math.abs(compensated-reference)<0.01);
});

test('140.9.1: independent vacuum analytic line agrees with CPU RK4 at 100 km, both geometries',()=>{
 for(const geometry of ['flat','globe']){
  const p={count:256,steps:2000,step:50,atmosphere:'vacuum',geometry};
  const seed=bench.seeds(p),exact=bench.vacuumAnalytic(seed,p),cpu=bench.cpuIntegrate(p,seed);
  assert.ok(bench.compare(exact,cpu,p).maxPositionErrorMetres<0.001);
  assert.equal(bench.compare(exact,cpu,p).qualified,true);
  assert.throws(()=>bench.vacuumAnalytic(seed,{...p,atmosphere:'standard'}),/vacuum/i);
 }
});

test('140.9.1: one compensated GPU failure stops promotion even when baseline had failed too',()=>{
 const rows=passingPairs();
 assert.equal(precise.evaluate(rows,18).verdict,'SPIKE_CANDIDATE');
 assert.equal(precise.evaluate(rows,18).experimentsRemaining,0);
 assert.equal(precise.evaluate(rows,18).productionAuthorized,false);
 rows[1].compensated.validation.failedRays=1;
 assert.equal(precise.evaluate(rows,18).verdict,'NUMERICAL_STOP');
 assert.match(precise.evaluate(rows,18).nextAction,/STOP this f32 GPU/);
});

test('140.9.1: analytical ground truth is mandatory and cannot be silenced by GPU-vs-CPU parity',()=>{
 const rows=passingPairs();
 rows[0].compensated.analyticVacuum.gpuVsAnalytic.qualified=false;
 assert.equal(precise.evaluate(rows,18).verdict,'NUMERICAL_STOP');
 rows[0].compensated.analyticVacuum=null;
 assert.equal(precise.evaluate(rows,18).verdict,'INCONCLUSIVE');
});

test('140.9.1: no promotion on missing pair, failed GPU shader, or lack of representative speedup',()=>{
 const rows=passingPairs();
 rows[0].naiveError='WGSL failed';delete rows[0].naive;
 assert.equal(precise.evaluate(rows,18).verdict,'INCONCLUSIVE');
 const slow=passingPairs();
 slow.find(r=>r.id==='standard.flat.long').compensated.timing.ratioCpuToGpu=2.8;
 assert.equal(precise.evaluate(slow,18).verdict,'PERFORMANCE_STOP');
 assert.equal(precise.evaluate(passingPairs().slice(0,17),18).verdict,'INCONCLUSIVE');
 assert.throws(()=>precise.evaluate([rows[0],rows[0]],2),/Duplicate/);
});

test('140.9.1: runner pairs baseline and compensated independently, recording the chosen mode',async()=>{
 const seen=[];
 const report=await precise.run({repeats:2},{runner:async p=>{
  seen.push(p.accumulation);return result(p,p.accumulation);
 }});
 assert.equal(seen.length,36);
 assert.deepEqual(seen.slice(0,4),['naive','compensated','naive','compensated']);
 assert.equal(report.version,'140.9.1');
 assert.equal(report.status,'finished');
 assert.equal(report.decision.verdict,'SPIKE_CANDIDATE');
 assert.equal(report.decision.productionAuthorized,false);
});

test('140.9.1: partial run or throwing GPU mode yields explicit inconclusive evidence',async()=>{
 let completed=0;
 const partial=await precise.run({}, {runner:async p=>{completed++;return result(p,p.accumulation);},
   isCancelled:()=>completed>=3});
 assert.equal(partial.decision.verdict,'INCONCLUSIVE');
 const failed=await precise.run({}, {runner:async p=>{
  if(p.accumulation==='compensated'&&p.steps===2000)throw Error('WGSL shader fail');
  return result(p,p.accumulation);
 }});
 assert.equal(failed.decision.verdict,'INCONCLUSIVE');
 assert.equal(failed.cases[1].compensatedError,'WGSL shader fail');
});

test('140.9.1: HTML exposes unchanged tolerances, paired run and JSON download',()=>{
 assert.match(html,/CurvatureWebGPUOpticsPrecision14091\.js/);
 assert.match(html,/CurvatureWebGPUOpticsPrecision14091\.run/);
 assert.match(html,/control\.valueAsNumber/);
 assert.match(html,/curvature-webgpu-optics-140\.9\.1-precision\.json/);
 assert.match(html,/isCancelled/);
 for(const name of ['maxPositionError','maxAngularError'])
  assert.match(html,new RegExp('<input name="'+name+'"[^>]+step="any"'));
});

test('140.9.1: opt-in shader is selected by GPU run and compilation failures are surfaced',async()=>{
 for(const mode of ['naive','compensated']){
  let selected;
  const device={limits:{maxStorageBufferBindingSize:100000},
    createShaderModule:({code})=>{selected=code;return {getCompilationInfo:async()=>({
      messages:[{type:'error',message:'deliberate validator rejection'}]})};},
    createComputePipelineAsync:()=>{throw Error('should not compile pipeline after shader error');}};
  const adapter={requestDevice:async()=>device};
  await assert.rejects(bench.run({count:1,steps:1,accumulation:mode},{
    navigator:{gpu:{requestAdapter:async()=>adapter}},
    GPUBufferUsage:{STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8},GPUMapMode:{READ:1}
  }),/WGSL compilation failed/);
  assert.equal(selected,mode==='compensated'?bench.WGSL_COMPENSATED:bench.WGSL);
 }
});

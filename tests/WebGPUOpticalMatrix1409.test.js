'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const m=require('../src/diagnostics/CurvatureWebGPUOpticsMatrix1409');
const b=require('../src/diagnostics/CurvatureWebGPUOpticsBenchmark');
const html=fs.readFileSync(path.join(__dirname,'../tools/webgpu-optics.html'),'utf8');

function success(p,ratio=5){
 return {status:'measured',qualified:true,parameters:p,
  validation:{qualified:true,failedRays:0,nonFiniteRays:0},
  timing:{ratioCpuToGpu:ratio}};
}
function allPassed(){return m.cases().map(({id,parameters})=>({id,parameters,result:success(parameters)}));}

test('140.9: matrix is finite, deterministic, covers eight models at two distances and two extra batch sizes',()=>{
 const plan=m.cases();
 assert.equal(plan.length,18);
 assert.deepEqual(plan,m.cases());
 assert.equal(new Set(plan.map(p=>p.id)).size,18);
 for(const atmosphere of ['vacuum','standard','exponential-occlusion','inverse-spherical']){
  for(const geometry of ['flat','globe']){
   for(const [kind,count,steps] of [['normal',1024,256],['long',256,2000]]){
    const entry=plan.find(x=>x.id===`${atmosphere}.${geometry}.${kind}`);
    assert.ok(entry);assert.equal(entry.parameters.count,count);
    assert.equal(entry.parameters.steps,steps);
    assert.equal(entry.parameters.step,50);
    assert.equal(entry.parameters.repeats,5);
    assert.deepEqual(b.check(entry.parameters),Object.assign({},entry.parameters,{
      observerHeight:15,radius:6371000,occlusionRadius:6371000,refractivity:0.000293,scaleHeight:7350}));
   }
  }
 }
 assert.equal(plan.find(x=>x.id==='standard.flat.small').parameters.count,128);
 assert.equal(plan.find(x=>x.id==='standard.flat.large').parameters.count,4096);
});

test('140.9: settings cannot bypass existing numeric and workload guards',()=>{
 for(const v of [{repeats:0},{repeats:21},{maxPositionError:0},
   {maxAngularError:0},{maxPositionError:NaN},{repeats:1.5}]){
  assert.throws(()=>m.cases(v));
 }
 assert.equal(m.cases({repeats:10})[0].parameters.repeats,10);
});

test('140.9: completed numerical/performance qualification only authorizes one bounded spike',()=>{
 const rows=allPassed(),gate=m.evaluate(rows,18);
 assert.equal(gate.verdict,'SPIKE_CANDIDATE');
 assert.equal(gate.stats.passed,18);
 assert.equal(gate.stats.complete,true);
 assert.equal(gate.productionAuthorized,false);
 assert.equal(gate.representativeSpeedups.length,2);
 assert.match(gate.nextAction,/Stop isolated microbenchmarks/);
});

test('140.9: every numeric failure fails closed, including non-finite results',()=>{
 const rows=allPassed();rows[11].result.validation.nonFiniteRays=1;
 assert.equal(m.evaluate(rows,18).verdict,'NUMERICAL_STOP');
 const another=allPassed();another[3].result.qualified=false;
 assert.equal(m.evaluate(another,18).stats.failed,1);
 assert.equal(m.evaluate(another,18).productionAuthorized,false);
});

test('140.9: missing, unavailable and thrown cases are never silently treated as passing',()=>{
 const rows=allPassed();
 assert.equal(m.evaluate(rows.slice(0,17),18).verdict,'INCONCLUSIVE');
 rows[0].result={status:'unavailable',qualified:false};
 assert.equal(m.evaluate(rows,18).verdict,'INCONCLUSIVE');
 rows[0].error='device lost';delete rows[0].result;
 assert.equal(m.evaluate(rows,18).stats.errors,1);
 assert.throws(()=>m.evaluate([rows[0],rows[0]],2),/Duplicate/);
});

test('140.9: speed gate is evaluated after numeric qualification on representative workloads only',()=>{
 const rows=allPassed();
 rows.find(x=>x.id==='standard.flat.small').result.timing.ratioCpuToGpu=0.5;
 assert.equal(m.evaluate(rows,18).verdict,'SPIKE_CANDIDATE');
 rows.find(x=>x.id==='standard.flat.long').result.timing.ratioCpuToGpu=2.9;
 assert.equal(m.evaluate(rows,18).verdict,'PERFORMANCE_STOP');
 rows.find(x=>x.id==='standard.flat.long').result.timing.ratioCpuToGpu=Infinity;
 assert.equal(m.evaluate(rows,18).verdict,'PERFORMANCE_STOP');
});

test('140.9: injected worker generates a complete 18-case report without claiming GPU execution',async()=>{
 let calls=0,updates=0;
 const result=await m.run({repeats:2},{runner:async p=>{calls++;return success(p);},
  onProgress:()=>updates++});
 assert.equal(calls,18);assert.equal(updates,36);
 assert.equal(result.status,'finished');assert.equal(result.version,'140.9');
 assert.equal(result.cases.length,18);
 assert.equal(result.decision.verdict,'SPIKE_CANDIDATE');
 assert.equal(result.cases[0].parameters.repeats,2);
 assert.equal(result.decision.productionAuthorized,false);
});

test('140.9: cancellation between cases exports a usable, explicitly inconclusive partial report',async()=>{
 let completed=0;
 const result=await m.run({}, {runner:async p=>{completed++;return success(p);},
  isCancelled:()=>completed>=3});
 assert.equal(result.cases.length,3);
 assert.equal(result.status,'incomplete');
 assert.equal(result.decision.verdict,'INCONCLUSIVE');
});

test('140.9: a GPU error is recorded as a failed case rather than an accepted result',async()=>{
 const result=await m.run({repeats:1},{runner:async p=>{
  if(p.atmosphere==='vacuum'&&p.geometry==='flat'&&p.steps===256)throw Error('shader rejected');
  return success(p);
 }});
 assert.equal(result.decision.verdict,'INCONCLUSIVE');
 assert.equal(result.cases[0].error,'shader rejected');
 assert.equal(result.decision.stats.errors,1);
});

test('140.9: standalone HTML has honest controls and complete progress/export plumbing',()=>{
 assert.match(html,/CurvatureWebGPUOpticsMatrix1409\.js/);
 assert.match(html,/CurvatureWebGPUOpticsMatrix1409\.run/);
 assert.match(html,/control\.valueAsNumber/);
 assert.match(html,/isCancelled/);
 assert.match(html,/curvature-webgpu-optics-140\.9-matrix\.json/);
 for(const name of ['maxPositionError','maxAngularError']){
  assert.match(html,new RegExp('<input name="'+name+'"[^>]*step="any"'));
 }
});

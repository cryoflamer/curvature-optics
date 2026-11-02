#!/usr/bin/env node
/* #140.12.49: reproducible local CPU composition check for the fused kernel.
 * The independent Browser Compare gate is the ONLY full Canvas parity test.
 */
'use strict';
const {performance}=require('node:perf_hooks');
const assert=require('node:assert/strict');
const composition=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const {model}=require('./benchmark-adaptive-prism-112');
const configs=[
  {id:'authored',eye:15,distances:[50,25550],deltas:[297.55,373]},
  {id:'near-ground',eye:2,distances:[50,3500],deltas:[300,400]},
  {id:'horizon',eye:15,distances:[9000,22000],deltas:[700,850]},
  {id:'far-field',eye:100,distances:[25000,65000],deltas:[750,900]}
];
const rounds=Number((process.argv.find(a=>a.startsWith('--rounds='))||'--rounds=4').split('=')[1]);
if(!Number.isInteger(rounds)||rounds<1||rounds>30)throw Error('Use --rounds=1..30');
function median(a){const b=a.slice().sort((x,y)=>x-y),n=b.length;
  return (b[(n-1)>>1]+b[n>>1])/2;}
function run(input,m,mode){const start=performance.now(),result=optics.create().transform(input,m,
  {atmosphere:'standard',settings:mode==='fused'?{traceOptimization:'fused-gradient'}:{}});
  return {totalMs:performance.now()-start,stats:result.stats,
    primitives:result.composition.scene.primitives};}
const results=[];
for(const scene of configs){
  const m=model(2,'globe');m.Height=scene.eye;
  m.ObjDist=scene.distances.slice();m.ObjDeltaDist=scene.deltas.slice();
  const input=composition.composeOpticalMain(m,true),observed={baseline:[],fused:[]};
  run(input,m,'baseline');run(input,m,'fused');
  let last={};
  for(let r=0;r<rounds;r++){
    const order=r%2?['fused','baseline']:['baseline','fused'];
    for(const mode of order){const current=run(input,m,mode);
      observed[mode].push(current.totalMs);last[mode]=current;}
  }
  assert.deepEqual(last.fused.primitives,last.baseline.primitives,scene.id);
  for(const k of ['perGroup','perObject','sampleStatuses','unresolved','fillTriangles',
      'fillHidden','fillUnresolved','visibleSegments'])
    assert.deepEqual(last.fused.stats[k],last.baseline.stats[k],scene.id+' '+k);
  assert.equal(last.fused.stats.fieldStats.shootRK4Calls,
    last.baseline.stats.fieldStats.shootRK4Calls,scene.id+' RK4 call parity');
  results.push({id:scene.id,eye:scene.eye,distances:scene.distances,
    baselineMedianMs:median(observed.baseline),fusedMedianMs:median(observed.fused),
    rk4Calls:last.baseline.stats.fieldStats.shootRK4Calls,
    parity:'pass',runs:observed});
}
console.log(JSON.stringify({version:'140.12.49',kind:'local CPU composition gate',
  node:process.version,rounds,productionDefaultUnchanged:true,results,
  limitations:'Not a Canvas pixel test or an FPS prediction. Use Modern Compare browser ZIP for full-frame parity.'},null,2));

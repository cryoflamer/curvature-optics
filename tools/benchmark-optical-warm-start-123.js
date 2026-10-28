#!/usr/bin/env node
/* Paired cold physical scene benchmark. Exact scene is rebuilt on every run,
 * and baseline keeps #121 predictor/ground proof but disables ONLY #123 seeds.
 * No browser frame/CSS/Canvas timings are inferred from this benchmark. */
'use strict';
const {performance}=require('node:perf_hooks');
const {model}=require('./benchmark-adaptive-prism-112');
const {atHeight}=require('./benchmark-height-change-120');
const compose=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
function run({towers=85,heights=[15,15.3,14.7,15.3],repeats=2}={}){
 const rows=[];
 for(let r=0;r<repeats;r++)for(let i=0;i<heights.length;i++){
  const h=heights[i],m=atHeight(model(towers,'globe'),h);
  const source=compose.composeOpticalMain(m,true);
  for(const enabled of ((i+r)%2?[true,false]:[false,true])){
   const t=performance.now();
   const x=optics.create().transform(source,m,{atmosphere:'standard',
     settings:{shootingWarmStart:enabled}});
   const stats=x.stats.fieldStats;
   rows.push({height:h,enabled,totalMs:+(performance.now()-t).toFixed(2),
     exactSolveMs:+x.stats.opticalStages.exactSolveMs.toFixed(2),
     solves:stats.solves,shootEvaluations:stats.shootEvaluations,
     shootRK4Calls:stats.shootRK4Calls,warmStartAttempts:stats.warmStartAttempts,
     warmStartAccepted:stats.warmStartAccepted,warmStartMisses:stats.warmStartMisses,
     primitives:x.composition.scene.primitives.length,
     visible:x.stats.visibleSegments,unresolved:x.stats.unresolved});
  }
 }
 function median(values){const sorted=values.slice().sort((a,b)=>a-b);
  return (sorted[(sorted.length-1)>>1]+sorted[sorted.length>>1])/2;}
 const old=rows.filter(x=>!x.enabled),fast=rows.filter(x=>x.enabled);
 return {node:process.version,rows,median:{baselineMs:median(old.map(x=>x.totalMs)),
   acceleratedMs:median(fast.map(x=>x.totalMs))},limitations:[
   'Cold Node optical composition only, not measured browser interaction latency',
   'Alternating paired order partially mitigates JIT/GC; execution remains noisy',
   'The baseline retains the same #121 verified standard-atmosphere predictor',
   'Optical hashes may differ at sub-micrometre scene-coordinate scale because both paths meet the same residual tolerance']};
}
if(require.main===module)console.log(JSON.stringify(run(),null,2));
module.exports={run};

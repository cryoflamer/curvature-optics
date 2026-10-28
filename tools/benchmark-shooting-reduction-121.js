#!/usr/bin/env node
/* Compare identical, fully rebuilt physical scenes with the reference solver
 * enabled or the #121 guarded standard shooting path. This runs in one Node
 * process but alternates execution order to reduce first-JIT bias. */
'use strict';
const {performance}=require('node:perf_hooks');
const {model}=require('./benchmark-adaptive-prism-112');
const {atHeight}=require('./benchmark-height-change-120');
const composition=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
function run({towers=85,heights=[15,15.3,14.7,15.3]}={}){
 const rows=[];
 for(let index=0;index<heights.length;index++){
   const height=heights[index],m=atHeight(model(towers,'globe'),height);
   const input=composition.composeOpticalMain(m,true);
   const pair=index%2?[true,false]:[false,true];
   for(const accelerated of pair){
     const begin=performance.now();
     const result=optics.create().transform(input,m,{atmosphere:'standard',
       settings:accelerated?{}:{shootingOptimization:false}});
     const stats=result.stats.fieldStats;
     rows.push({height,accelerated,totalMs:+(performance.now()-begin).toFixed(2),
       exactSolveMs:+result.stats.opticalStages.exactSolveMs.toFixed(2),
       solves:stats.solves,shootEvaluations:stats.shootEvaluations,
       shootRK4Calls:stats.shootRK4Calls,clearGroundSteps:stats.clearGroundSteps,
       fullGroundEventSteps:stats.fullGroundEventSteps,
       predictorAccepted:stats.predictorAccepted,predictorFallbacks:stats.predictorFallbacks,
       primitives:result.composition.scene.primitives.length,
       visibleSegments:result.stats.visibleSegments,unresolved:result.stats.unresolved});
   }
 }
 return {node:process.version,rows,notes:[
   'This is Node cold optical composition, not browser Canvas or total height-input latency',
   'The reference and accelerated configurations run in the same sources and process',
   'All times include JIT/GC noise; use paired comparisons and a browser ZIP']};
}
if(require.main===module)console.log(JSON.stringify(run({
 towers:Number((process.argv.find(a=>a.startsWith('--towers='))||'').split('=')[1]||85)}),null,2));
module.exports={run};

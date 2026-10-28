#!/usr/bin/env node
/* Cold optical scene costs after 122: same physical scene and exact shooting
 * settings as 121. Compare using this SAME script in both source trees when
 * possible; timestamps are Node wall time, not browser input latency/FPS. */
'use strict';
const {performance}=require('node:perf_hooks');
const {model}=require('./benchmark-adaptive-prism-112');
const {atHeight}=require('./benchmark-height-change-120');
const compose=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
function run({towers=85,geometry='globe',heights=[15,15.3,14.7,15.3]}={}){
 const rows=[];
 for(const h of heights){
  const m=atHeight(model(towers,geometry),h),c=compose.composeOpticalMain(m,geometry==='globe');
  const started=performance.now();
  const r=optics.create().transform(c,m,{atmosphere:'standard'});
  const st=r.stats.opticalStages,work=r.stats.opticalWork||{};
  rows.push({height:h,totalMs:+(performance.now()-started).toFixed(2),
   assemblyMs:+st.assemblyMs.toFixed(2),sceneAdoptionMs:st.sceneAdoptionMs===undefined?
    null:+st.sceneAdoptionMs.toFixed(2),exactSolverMs:+st.exactSolveMs.toFixed(2),
   scenePrimitives:r.composition.scene.primitives.length,exactSolves:r.stats.fieldStats.solves,
   shootEvaluations:r.stats.fieldStats.shootEvaluations,
   opticalWorkByPhase:Object.fromEntries(Object.entries(work).map(([k,v])=>[k,{
    solves:v.solves,hits:v.hits,shootEvaluations:v.shootEvaluations,
    shootRK4Calls:v.shootRK4Calls}]))});
 }
 return {node:process.version,rows,limitations:[
  'Cold Node optical scene build only; no Canvas, browser scheduling or GPU',
  'A scene with a different observer height is a different physical problem',
  'Stage counters are nested inside the total, not independent additions',
  'GC/JIT vary; compare several runs and use browser ZIP as the final measurement']};
}
if(require.main===module)console.log(JSON.stringify(run(),null,2));
module.exports={run};

#!/usr/bin/env node
/* #140.12.48: CPU-only reproducible RK4/ground-event attribution.
 * This tests the REAL physical scene composition, not browser Canvas drawing.
 * Results are local Node medians; browser A/B ZIP is the rendering gate.
 */
'use strict';
const {performance}=require('node:perf_hooks');
const composition=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const {model}=require('./benchmark-adaptive-prism-112');
const {atHeight}=require('./benchmark-height-change-120');
const m=atHeight(model(2,'globe'),15);
const composed=composition.composeOpticalMain(m,true);
const modes=['baseline','fused-gradient','fused-preflight','scalar-rk4'];
const observations=Object.fromEntries(modes.map(k=>[k,[]]));
function median(a){const v=a.slice().sort((a,b)=>a-b);return (v[4]+v[5])/2;}
function run(mode){
  const settings={profileShootingStages:true};
  if(mode!=='baseline')settings.traceOptimization=mode;
  const start=performance.now();
  const result=optics.create().transform(composed,m,{atmosphere:'standard',settings});
  const stats=result.stats,field=stats.fieldStats||{};
  return {totalMs:performance.now()-start,exactSolveMs:field.exactSolveMs,
    traceMs:field.shootingStageMs?.trace||0,
    shootRK4Calls:field.shootRK4Calls,shootEvaluations:field.shootEvaluations,
    clearGroundSteps:field.clearGroundSteps,
    preflightGroundSteps:field.preflightGroundSteps,
    fullGroundEventSteps:field.fullGroundEventSteps,
    visibleSegments:stats.visibleSegments,unresolved:stats.unresolved,
    fillTriangles:stats.fillTriangles,fillHidden:stats.fillHidden};
}
// One full warmup per mode. Each measured cold field has a fresh optical session.
for(const mode of modes)run(mode);
for(let round=0;round<10;round++){
  const order=modes.slice(round%modes.length).concat(modes.slice(0,round%modes.length));
  for(const mode of order)observations[mode].push(run(mode));
}
const fields=['totalMs','exactSolveMs','traceMs'];
const output={kind:'#140.12.48 local physical-scene CPU trace audit',
  node:process.version,rounds:10,orderRotation:true,scene:'2+2 towers, standard Globe, eye 15m',
  browserCanvas:false,profileStagesEnabled:true,productionDefaultUnchanged:true,
  summary:Object.fromEntries(modes.map(mode=>[mode,{
    ...Object.fromEntries(fields.map(k=>['median'+k[0].toUpperCase()+k.slice(1),median(observations[mode].map(r=>r[k]))])),
    ...Object.fromEntries(['shootRK4Calls','shootEvaluations','clearGroundSteps','preflightGroundSteps',
      'fullGroundEventSteps','visibleSegments','unresolved','fillTriangles','fillHidden']
      .map(k=>[k,observations[mode][9][k]]))}])),runs:observations,
  limitation:'Canvas rendering, JIT and FPS are only measured by the Modern Compare ZIP audit.'};
console.log(JSON.stringify(output,null,2));

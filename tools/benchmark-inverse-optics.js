#!/usr/bin/env node
'use strict';
/* Deterministic 200-tower inverse-atmosphere workload, outside the browser.
 * Benchmarks cold optical composition; results are platform-dependent.
 * Run with: node tools/benchmark-inverse-optics.js --towers=200 --weight=1
 */
const {performance}=require('node:perf_hooks');
const {createHash}=require('node:crypto');
const benchmark=require('./benchmark-adaptive-prism-112');
const composition=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const R=6371000;
function measure({towers=200,weight=1,source='temperature-lapse',step,profileShootingStages=false}={}){
  if(!Number.isInteger(towers)||towers<1||towers>200||!Number.isFinite(weight)||weight<0||weight>1)throw Error('Invalid towers or weight');
  const m=benchmark.model(200,'flat');m.NObjects=[towers,0];m.ObjSidePos=[35,25.4];
  const setup=performance.now();
  const input=composition.composeOpticalMain(m,false,{physicalWorld:true});
  const session=optics.create(),begin=performance.now();
  const result=session.transform(input,m,{atmosphere:'inverse-temperature',occlusionRadius:R,
    temperatureProfile:{temperatureC:15,pressureHpa:1013.25,gradientKPerKm:-6.5},
    inverseProfile:{source,weight},settings:Object.assign({profileShootingStages},step?{step}:{})});
  const end=performance.now(),s=result.stats,f=s.fieldStats||{};
  const output={towers,weight,source,step:s.step,composeMs:Math.round(begin-setup),opticsMs:Math.round(end-begin),
    stages:s.opticalStages,segments:s.visibleSegments,fills:s.fillTriangles,unresolved:s.unresolved,
    field:{solves:f.solves,hits:f.hits,shootEvaluations:f.shootEvaluations,rk4:f.shootRK4Calls,
      exactSolveMs:f.exactSolveMs,stages:f.shootingStageMs,stats:s.opticalWork},
    checksum:result.composition.scene.primitives.reduce((n,p)=>n+p.points.reduce((a,q)=>a+(q[2]||0)*1e-6,0),0),
    sceneHash:createHash('sha256').update(JSON.stringify(result.composition.scene.primitives)).digest('hex')};
  console.log(JSON.stringify(output,null,2));return output;
}
if(require.main===module){const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')).map(x=>x.slice(2).split('=')));
  measure({towers:args.towers?Number(args.towers):200,weight:args.weight===undefined?1:Number(args.weight),
    source:args.source||'temperature-lapse',step:args.step?Number(args.step):undefined,profileShootingStages:args.stages==='1'});
}
module.exports={measure};

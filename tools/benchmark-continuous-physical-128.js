/* Cold, repeatable 85+2 tower physical-scene benchmark for patches 127/128.
 * Run: node tools/benchmark-continuous-physical-128.js [repeat-count]
 * Timings are single-process medians, not a browser FPS guarantee.
 */
'use strict';
const {performance}=require('node:perf_hooks');
const {model}=require('./benchmark-adaptive-prism-112');
const composition=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
function median(values){const x=values.slice().sort((a,b)=>a-b);return x[Math.floor(x.length/2)];}
function benchmark(repetitions=3){
 if(!Number.isInteger(repetitions)||repetitions<1||repetitions>20)throw RangeError('1..20 repeats required');
 const rows=[];
 for(const [name,R,flat] of [
  ['earth',6371000,false],['large-radius',6000370000,false],
  ['near-flat',1e16,false],['exact-flat',6371000,true]
 ]){
  const samples=[];
  for(let i=0;i<repetitions;i++){
   const m=model(85,flat?'flat':'globe');m.rEarth=m.geometryRadius=R;
   const start=performance.now();
   const source=composition.composeOpticalMain(m,!flat,{physicalWorld:true});
   const authored=performance.now();
   const session=optics.create(),frame=session.transform(source,m,{atmosphere:'standard'});
   const solved=performance.now(),again=session.transform(source,m,{atmosphere:'standard'});
   if(!again.reused||frame.stats.unresolved||frame.stats.fillUnresolved||frame.stats.budgetExceeded)
    throw Error('Physical scene failed correctness/cache requirement: '+name);
   samples.push({composeMs:authored-start,opticsMs:solved-authored,
    totalMs:solved-start,cacheMs:performance.now()-solved,stats:frame.stats});
  }
  const last=samples[samples.length-1],stats=last.stats;
  rows.push({scenario:name,radiusMetres:flat?null:R,curvature:flat?0:1/R,
   towers:87,renderExtentMetres:stats.guideRenderExtent,
   composeMedianMs:+median(samples.map(s=>s.composeMs)).toFixed(2),
   opticsMedianMs:+median(samples.map(s=>s.opticsMs)).toFixed(2),
   fullMedianMs:+median(samples.map(s=>s.totalMs)).toFixed(2),
   cachedMedianMs:+median(samples.map(s=>s.cacheMs)).toFixed(2),
   visibleOutlinePieces:stats.visibleSegments,fillTriangles:stats.fillTriangles,
   unresolved:stats.unresolved,fillUnresolved:stats.fillUnresolved,
   groundHorizonMetres:stats.groundHorizon,
   metricGuidePieces:stats.guideSegments,groundRayQueries:stats.guideSolves,
   exactSolves:stats.fieldStats.solves,shootingRK4Calls:stats.fieldStats.shootRK4Calls});
 }
 return {repetitions,atmosphere:'standard',integration:'cold optical adapter, no Canvas',rows};
}
if(require.main===module){
 const n=process.argv[2]===undefined?3:Number(process.argv[2]);
 console.log(JSON.stringify(benchmark(n),null,2));
}
module.exports={benchmark};

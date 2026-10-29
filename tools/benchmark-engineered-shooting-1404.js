#!/usr/bin/env node
/* #140.4: offline, opt-in qualification of the existing guarded CPU shooting
 * predictor for engineered atmospheres. Never changes app/UI defaults.
 * Each pair rebuilds the same physical scene with fresh independent sessions.
 */
'use strict';
const {performance}=require('node:perf_hooks');
const {model}=require('./benchmark-adaptive-prism-112');
const compose=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const R=6371000;
const EXPERIMENT='engineered-experimental';
const PHASES=['visibleSegments','unresolved','hiddenLeaves','boundaryClipped',
  'groundHorizon','fillTriangles','fillUnresolved','fillHidden'];
const CLASSIFICATIONS=['sampleStatuses','unresolvedReasons','fillUnresolvedReasons'];
const TOPOLOGY_EPS=2e-5; // metres, in the physical scene's coordinate system
function median(input){
 const a=input.slice().sort((x,y)=>x-y);
 return a.length?(a[(a.length-1)>>1]+a[a.length>>1])/2:null;
}
function compareScenes(reference,experimental){
 const p=reference.composition.scene.primitives;
 const q=experimental.composition.scene.primitives;
 const violations=[];let maxCoordinateDelta=0,comparedCoordinates=0;
 for(const name of PHASES){
  if(reference.stats[name]!==experimental.stats[name])
   violations.push(name+': '+reference.stats[name]+' / '+experimental.stats[name]);
 }
 for(const name of CLASSIFICATIONS){
  const a=reference.stats[name]||{},b=experimental.stats[name]||{};
  const keys=new Set([...Object.keys(a),...Object.keys(b)]);
  for(const key of keys)if((a[key]||0)!==(b[key]||0))
   violations.push(name+'.'+key+': '+a[key]+' / '+b[key]);
 }
 if(reference.stats.unresolved||experimental.stats.unresolved||
    reference.stats.fillUnresolved||experimental.stats.fillUnresolved)
  violations.push('incomplete optical scene: unresolved targets must be qualified separately');
 if(p.length!==q.length)violations.push('primitive count: '+p.length+' / '+q.length);
 for(let i=0;i<Math.min(p.length,q.length);i++){
  const a=p[i],b=q[i];
  if(a.type!==b.type||a.mode!==b.mode||a.points.length!==b.points.length){
   violations.push('primitive '+i+' topology');continue;
  }
  for(let j=0;j<a.points.length;j++){
   if(a.points[j].length!==b.points[j].length){
    violations.push('primitive '+i+' point '+j+' dimensions');continue;
   }
   for(let k=0;k<a.points[j].length;k++){
    const delta=Math.abs(a.points[j][k]-b.points[j][k]);
    comparedCoordinates++;
    if(!Number.isFinite(delta))violations.push('nonfinite coordinate at '+i+'/'+j+'/'+k);
    else maxCoordinateDelta=Math.max(maxCoordinateDelta,delta);
   }
  }
 }
 if(maxCoordinateDelta>TOPOLOGY_EPS)
  violations.push('max scene-coordinate delta '+maxCoordinateDelta+' exceeds '+TOPOLOGY_EPS+' m');
 return {qualified:violations.length===0,violations,maxCoordinateDelta,
  comparedCoordinates,toleranceMetres:TOPOLOGY_EPS};
}
function run({towers=10,geometry='flat',atmosphere='exponential-occlusion',
  repeats=3,radius=R}={}){
 if(!['exponential-occlusion','inverse-spherical'].includes(atmosphere))
  throw Error('Choose an engineered atmosphere');
 if(!['flat','globe'].includes(geometry))throw Error('Choose flat or globe geometry');
 if(!Number.isInteger(repeats)||repeats<1||repeats>20)throw Error('repeats must be 1..20');
 if(!Number.isFinite(radius)||radius<=0)throw Error('Invalid refractive comparison radius');
 const m=model(towers,geometry);
 const source=compose.composeOpticalMain(m,geometry==='globe');
 const rows=[];
 for(let i=0;i<repeats;i++){
  const order=i%2?['experimental','reference']:['reference','experimental'];
  const pair={};
  for(const mode of order){
   const enabled=mode==='experimental',started=performance.now();
   const result=optics.create().transform(source,m,{atmosphere,occlusionRadius:radius,
    settings:{shootingOptimization:enabled?EXPERIMENT:false}});
   const field=result.stats.fieldStats;
   pair[mode]=result;
   pair[mode+'Metrics']={totalMs:performance.now()-started,
    exactSolveMs:result.stats.opticalStages.exactSolveMs,
    solves:field.solves,shootEvaluations:field.shootEvaluations,
    shootRK4Calls:field.shootRK4Calls,
    predictorAttempts:field.predictorAttempts,predictorAccepted:field.predictorAccepted,
    predictorFallbacks:field.predictorFallbacks,
    warmStartAttempts:field.warmStartAttempts,warmStartAccepted:field.warmStartAccepted,
    warmStartMisses:field.warmStartMisses,
    unresolved:result.stats.unresolved};
  }
  const comparison=compareScenes(pair.reference,pair.experimental);
  rows.push({run:i+1,reference:pair.referenceMetrics,
   experimental:pair.experimentalMetrics,comparison});
 }
 const sum=(key,mode)=>rows.reduce((v,r)=>v+r[mode][key],0);
 const allQualified=rows.every(r=>r.comparison.qualified);
 return {version:'140.4',scope:'offline CPU qualification; not a GPU benchmark',
  atmosphere,geometry,towers,radius,comparisonRadiusMetres:radius,
  node:process.version,numberOfPairs:repeats,qualifiedInSample:allQualified,
  maxCoordinateDeltaMetres:Math.max(...rows.map(r=>r.comparison.maxCoordinateDelta)),
  summary:{referenceMedianMs:median(rows.map(r=>r.reference.totalMs)),
   experimentalMedianMs:median(rows.map(r=>r.experimental.totalMs)),
   referenceMedianExactSolveMs:median(rows.map(r=>r.reference.exactSolveMs)),
   experimentalMedianExactSolveMs:median(rows.map(r=>r.experimental.exactSolveMs)),
   referenceTotalShootEvaluations:sum('shootEvaluations','reference'),
   experimentalTotalShootEvaluations:sum('shootEvaluations','experimental'),
   referenceTotalRK4Calls:sum('shootRK4Calls','reference'),
   experimentalTotalRK4Calls:sum('shootRK4Calls','experimental'),
   predictorAccepted:sum('predictorAccepted','experimental'),
   warmStartsAccepted:sum('warmStartAccepted','experimental')},
  rows,limitations:[
   'Empirical equality for the chosen cold scenes is NOT a global proof of branch equivalence near grazing/multipath rays',
   'The reference is the existing CPU bracket-first solver; it is not a certified analytic oracle',
   'Both runs use the same RK4 step and numerical tolerances; output coordinates are compared in metres, not screen pixels',
   'Node wall-clock timing includes GC/JIT/OS noise; no browser, GPU or transfer time is measured',
   'Scene composition, geometry, atmosphere and model are identical between each reference/experiment pair',
   'The optimized path is NOT selected by default or exposed as a production UI control']};
}
function integerFlag(name,defaultValue){
 const a=process.argv.find(x=>x.startsWith('--'+name+'='));
 return a?Number(a.slice(name.length+3)):defaultValue;
}
function stringFlag(name,defaultValue){
 const a=process.argv.find(x=>x.startsWith('--'+name+'='));
 return a?a.slice(name.length+3):defaultValue;
}
if(require.main===module){
 try{
  const report=run({towers:integerFlag('towers',10),repeats:integerFlag('repeats',3),
   atmosphere:stringFlag('atmosphere','exponential-occlusion'),
   geometry:stringFlag('geometry','flat'),radius:integerFlag('radius',R)});
  console.log(JSON.stringify(report,null,2));
  if(!report.qualifiedInSample)process.exitCode=1;
 }catch(error){console.error(error.stack);process.exitCode=1;}
}
module.exports={run,compareScenes};

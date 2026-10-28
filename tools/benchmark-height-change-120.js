#!/usr/bin/env node
/* Exact, height-dependent Physical scene cold-build benchmark. For meaningful
 * before/after comparisons run this SAME script on #119 and #120 in identical
 * Node environments; figures are not browser main-thread or FPS measurements.
 */
'use strict';
const {performance}=require('node:perf_hooks');
const {model}=require('./benchmark-adaptive-prism-112');
const composition=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const R=6371000;
function atHeight(base,height){
 const m={...base,Height:height},radius=m.geometryRadius||m.rEarth;
 m.aDip=Math.acos(radius/(radius+height));
 m.rDisk=radius*Math.sin(m.aDip);
 m.hDisk=radius*Math.cos(m.aDip);
 m.zDisk=radius+height-m.hDisk;
 m.hDip=radius-m.hDisk;
 m.dHorizon=radius*m.aDip;
 m.dView=(radius+height)*Math.sin(m.aDip);
 m.aDelta=m.aDip/m.nLines||m.aDip/45;
 return m;
}
function run({towers=85,geometry='globe',atmosphere='standard',heights=[15,15.3,14.7,15.3]}={}){
 const base=model(towers,geometry),session=optics.create(),rows=[];
 for(const height of heights){
   const m=atHeight(base,height);
   const composed=composition.composeOpticalMain(m,geometry==='globe');
   const start=performance.now();
   const result=session.transform(composed,m,{atmosphere});
   const ms=performance.now()-start;
   const f=result.stats.fieldStats||{},st=result.stats.opticalStages||{};
   rows.push({height,reused:result.reused,totalMs:+ms.toFixed(2),
     exactSolves:f.solves||0,shootRK4Calls:f.shootRK4Calls||null,
     exactSolverMs:+(st.exactSolveMs||0).toFixed(2),
     outlinesMs:+(st.outlinesMs||0).toFixed(2),fillsMs:+(st.fillsMs||0).toFixed(2),
     groundGuidesMs:+(st.groundGuidesMs||0).toFixed(2),
     horizonM:result.stats.groundHorizon,visibleSegments:result.stats.visibleSegments,
     unresolved:result.stats.unresolved});
 }
 return {environment:{node:process.version,platform:process.platform},geometry,atmosphere,towers,rows,
   limitations:['Only cold optics composition, no browser Canvas or GPU',
     'Same-height result is reusable only when the intervening key is unchanged',
     'All height changes use fresh exact solver states; no interpolation between observer heights']};
}
if(require.main===module){
 const arg=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.split('=')[1];
 const towers=Number(arg('towers')||85);
 console.log(JSON.stringify(run({towers,geometry:arg('geometry')||'globe',
   atmosphere:arg('atmosphere')||'standard'}),null,2));
}
module.exports={run,atHeight};

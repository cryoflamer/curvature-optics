#!/usr/bin/env node
/* Repeatable CPU optical composition benchmark: NO Canvas or browser FPS.
 * Uses unmodified authored scene and fresh Fast sessions per LOD sample.
 */
'use strict';
const {performance}=require('node:perf_hooks');
const composer=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const {model}=require('./benchmark-adaptive-prism-112');
function median(a){const b=a.slice().sort((x,y)=>x-y);return b[Math.floor(b.length/2)];}
function run({towers=200,runs=3,strides=[1,2,4,8,16,32]}={}){
  if(![10,85,200].includes(towers)||!Number.isInteger(runs)||runs<1||runs>20)
    throw RangeError('Invalid tower count or run count');
  const rows=[];
  for(const geometry of ['globe','flat']){
    const m=model(towers,geometry);m.showGrid=0;
    const composeBegin=performance.now();
    const c=composer.composeOpticalMain(m,geometry==='globe',{physicalWorld:true});
    const composeMs=performance.now()-composeBegin;
    // Warm JIT, never use a warmed composition cache for the timed samples.
    optics.create().transform(c,m,{atmosphere:'standard',opticalQuality:'fast',previewLod:{stride:8}});
    for(const stride of strides){
      const ms=[];let stats;
      for(let i=0;i<runs;i++){
        const session=optics.create(),started=performance.now();
        const r=session.transform(c,m,{atmosphere:'standard',opticalQuality:'fast',previewLod:{stride}});
        ms.push(performance.now()-started);stats=r.stats;
      }
      rows.push({geometry,towers,previewStride:stride,
        objectCount:stats.previewLod.original,projected:stats.previewLod.selected,
        skipped:stats.previewLod.skipped,contours:stats.visibleSegments,
        fills:stats.fillTriangles,unresolved:stats.unresolved,
        composeMs:+composeMs.toFixed(2),medianOpticsMs:+median(ms).toFixed(2),
        outlinesMs:+stats.opticalStages.outlinesMs.toFixed(2),
        fillsMs:+stats.opticalStages.fillsMs.toFixed(2)});
    }
  }
  return rows;
}
if(require.main===module){
  const towers=Number(process.argv.find(s=>s.startsWith('--towers='))?.split('=')[1]||200);
  const runs=Number(process.argv.find(s=>s.startsWith('--runs='))?.split('=')[1]||3);
  try{console.log(JSON.stringify({environment:{node:process.version},rows:run({towers,runs})},null,2));}
  catch(e){console.error(e.stack);process.exitCode=1;}
}
module.exports={run};

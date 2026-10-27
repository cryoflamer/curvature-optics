/* Cold + redraw optical-composition benchmark on real meshes, no Canvas timing. */
'use strict';
const {performance}=require('node:perf_hooks');
const composition=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const {model}=require('./benchmark-adaptive-prism-112');
function benchmark(options={}){
  const geometry=options.geometry||'flat',atmosphere=options.atmosphere||'standard';
  const counts=options.counts||[2,10,85,200],rows=[];
  for(const count of counts){
    const m=model(count,geometry);
    const begin=performance.now(),scene=composition.composeOpticalMain(m,geometry==='globe');
    const composeMs=performance.now()-begin;
    const session=optics.create(),coldStart=performance.now();
    const first=session.transform(scene,m,{atmosphere});
    const coldMs=performance.now()-coldStart;
    const redrawStart=performance.now();
    const second=session.transform(scene,{...m,PanRad:0.27},{atmosphere});
    const reuseMs=performance.now()-redrawStart;
    rows.push({geometry,atmosphere,towers:count+2,composeMs:+composeMs.toFixed(2),
      coldOpticsMs:+coldMs.toFixed(2),cachedOpticsMs:+reuseMs.toFixed(2),
      cacheReused:second.reused,sameComposition:second.composition===first.composition,
      strokes:first.stats.visibleSegments,unresolved:first.stats.unresolved,
      exactTotal:first.stats.fieldStats?.solves||0,
      towerExact:first.stats.towerSolves,groundExact:first.stats.sharedGroundSolves,
      interpolated:first.stats.fieldStats?.interpolations||0,
      surfacePieces:first.stats.guideSegments});
  }
  return rows;
}
if(require.main===module){
  const geometry=process.argv.includes('--globe')?'globe':'flat';
  const atmosphere=(process.argv.find(x=>x.startsWith('--atmosphere='))||'').split('=')[1]||'standard';
  const n=(process.argv.find(x=>x.startsWith('--towers='))||'').split('=')[1];
  console.log(JSON.stringify(benchmark({geometry,atmosphere,counts:n?[Number(n)]:undefined}),null,2));
}
module.exports={benchmark};

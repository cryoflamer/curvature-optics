/* Real tower-mesh, cold optical projection benchmark. No Canvas/JIT promises. */
'use strict';
const composition = require('../src/scene/CurvatureIndependentComposition');
const optics = require('../src/optics/CurvaturePhysicalSceneOptics');
const {performance} = require('node:perf_hooks');
const R=6371000;
function model(n,geometry){
  if (![2,10,85,200].includes(n) || !['globe','flat'].includes(geometry))
    throw Error('Choose 2, 10, 85, or 200 towers and globe/flat geometry');
  return {rEarth:R,geometryRadius:R,Height:15,showModel:geometry==='globe'?1:2,
    ObjType:[3,3],NObjects:[n,2],ObjDist:[50,25550],ObjDeltaDist:[297.55,373],
    ObjSidePos:[32,22.4],ObjSideVar:[0,0],ObjSideType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0],ObjSizeType:[0,0],
    rDisk:1000,zDisk:999,hDip:1,hDisk:R/2,aDip:.065,aDelta:.025,
    showGrid:1,rFEarth:10007543,PanRad:0,sceneWidth:5000,
    GlobeGridCol:'green',GlobeFGridCol:'yellow',TangentCol:'red',
    FEGridCol:'gray',FEEqCol:'blue',showTangent:true,showData:false,
    camPos:[0,0,0],camViewCenter:[0,1,0],camUp:[0,0,1],camSceneSize:1};
}
function run(opts={}){
  const geometry=opts.geometry||'flat';
  const atmosphere=opts.atmosphere||'standard';
  const counts=opts.counts||[2,10,85];
  const rows=[];
  for(const n of counts){
    const m=model(n,geometry),input=composition.composeOpticalMain(m,geometry==='globe');
    for(const depth of [0,3]){
      const session=optics.create(),begin=performance.now();
      const result=session.transform(input,m,{atmosphere,
        settings:{fieldAdaptiveDepth:depth}});
      const coldMs=performance.now()-begin;
      const redrawStart=performance.now();
      const cached=session.transform(input,m,{atmosphere,
        settings:{fieldAdaptiveDepth:depth}});
      const cacheMs=performance.now()-redrawStart;
      rows.push({geometry,atmosphere,towers:n+2,adaptiveDepth:depth,
        coldMs:+coldMs.toFixed(2),cachedTransformMs:+cacheMs.toFixed(2),
        cacheReused:cached.reused,lines:result.stats.visibleSegments,
        unresolved:result.stats.unresolved,unresolvedReasons:result.stats.unresolvedReasons,
        field:result.stats.fieldStats,guideSolves:result.stats.guideSolves});
    }
  }
  return rows;
}
if(require.main===module){
  const geometry=process.argv.includes('--globe')?'globe':'flat';
  const atmosphere=(process.argv.find(x=>x.startsWith('--atmosphere='))||'').split('=')[1]||'standard';
  const n=(process.argv.find(x=>x.startsWith('--towers='))||'').split('=')[1];
  console.log(JSON.stringify(run({geometry,atmosphere,counts:n?[Number(n)]:undefined}),null,2));
}
module.exports={model,run};

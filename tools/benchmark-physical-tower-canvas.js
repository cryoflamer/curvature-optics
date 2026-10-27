/* Real GeometryEngine towers + physically clipped outline workload.
 * A bounded preview benchmark, NOT a guarantee of 85 fully rendered towers
 * or a browser FPS measurement. Run: node tools/benchmark-physical-tower-canvas.js
 */
'use strict';
const physical=require('../src/renderers/CurvaturePhysicalTowerCanvas');
const R=6371000;
function model(n){
  return {rEarth:R,geometryRadius:R,Height:15,showModel:2,ObjType:[3,3],
    NObjects:[n,0],ObjDist:[50,25550],ObjDeltaDist:[297.55,373],
    ObjSidePos:[32,22.4],ObjSideVar:[0,0],ObjSideType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0],ObjSizeType:[0,0]};
}
function run(options={}){
  const counts=options.counts||[2,10,85];
  const atmosphere=options.atmosphere||'vacuum';
  const settings={maxBuildMs:3500,maxSamples:10000,maximumDepth:10,
    step:200,...options.settings};
  return counts.map(n=>{
    const engine=physical.create(),m=model(n);
    const start=process.hrtime.bigint();
    const first=engine.outlines(m,{atmosphere,occlusionRadius:R,settings});
    const buildMs=Number(process.hrtime.bigint()-start)/1e6;
    const again=process.hrtime.bigint();
    const warm=engine.outlines(m,{atmosphere,occlusionRadius:R,settings});
    const reuseMs=Number(process.hrtime.bigint()-again)/1e6;
    return {towers:first.data.towers,primitives:first.data.primitives,
      builtSegments:first.data.segments.length,unresolved:first.data.unresolved.length,
      budgetExceeded:!!first.data.budgetExceeded,
      solverCalls:first.data.fieldStats?first.data.fieldStats.solves:0,
      buildMs,reuseMs,cacheReused:warm.reused};
  });
}
if(require.main===module){
  const atmosphere=process.argv[2]||'vacuum';
  console.log(JSON.stringify({atmosphere,limitations:'Single Node run, bounded incomplete outline scene; no browser FPS',cases:run({atmosphere})},null,2));
}
module.exports={model,run};

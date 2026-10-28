'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const outline=require('../src/optics/OpticalTowerSilhouette');
const validation=require('../tools/validate-physical-scene-115');
const R=6371000;
function edge(field,heights=[0,10],options={}){
  return outline.projectPrimitives({geometry:'flat',radius:R,observerHeight:0,
    field,primitives:[{type:'line',points:heights.map(h=>[0,5000,h])}],
    minimumDepth:0,maximumDepth:14,boundaryTolerance:0.1,...options});
}
function switchField(threshold){
  return {sample(d,h){return {status:h>=threshold?'visible':'blocked',
    angle:Math.atan2(h,Math.max(1,d)),method:'exact'};}};
}
test('116: monotone ground boundary is conservatively clipped with a measured small gap',()=>{
  const result=edge(switchField(4.8));
  assert.equal(result.unresolved.length,0);
  assert.ok(result.stats.boundaryClipped>0);
  assert.ok(result.stats.maxBoundaryGapMetres>0);
  assert.ok(result.stats.maxBoundaryGapMetres<=0.01);
  assert.ok(result.segments.length>0);
  assert.ok(result.segments.every(s=>s.world.every(p=>p[2]>=4.8)),
    'no visible stroke may cross into confirmed hidden surface');
  const low=Math.min(...result.segments.flatMap(s=>s.world.map(p=>p[2])));
  assert.ok(low>=4.8&&low<4.82,'the bounded clip stops close to the known boundary');
});
test('116: a confirmed-visible island is not replaced by a made-up monotone clip',()=>{
  const field={sample(d,h){return {status:h>4.9&&h<5.1?'visible':'blocked',
    angle:Math.atan2(h,Math.max(1,d))};}};
  const result=edge(field);
  assert.ok(result.segments.length>0);
  assert.ok(result.segments.every(s=>s.world.every(p=>p[2]>4.9&&p[2]<5.1)));
});
test('116: a failed or entirely grazing ray never turns into a visible boundary stroke',()=>{
  for(const status of ['solver_failed','indeterminate']){
    const result=edge({sample(){return {status};}});
    assert.equal(result.segments.length,0);
    assert.equal(result.stats.boundaryClipped,0);
    assert.ok(result.unresolved.length>0);
  }
});
test('116: explicit low sample budget remains unresolved and is not hidden by clipping',()=>{
  const result=edge(switchField(5),[0,10],{maxSamples:4});
  assert.equal(result.stats.boundaryClipped,0);
  assert.ok(result.unresolved.length>0);
  assert.ok(result.unresolved.some(x=>x.reason==='sample-budget'));
});
test('116: Globe and engineered Flat boundary gaps remain bounded and painter fills are camera-tested',()=>{
  const result=validation.sceneMatrix({workloads:[['globe','vacuum',2],
    ['flat','inverse-spherical',2],['globe','standard',85]]});
  assert.deepEqual(result.failures,[]);
  for(const row of result.rows){
    assert.equal(row.outlineUnresolved,0);
    assert.ok(row.boundaryClipped>0);
    assert.ok(row.maxBoundaryGapMetres<=0.1);
    assert.ok(row.painterViews.find(v=>v.name==='foundation-targeted').fillCalls>0);
    assert.equal(row.painterViewsChecked,3);
    assert.equal(row.unresolvedReasons['optical-solver']||0,0);
  }
});
test('116: flat validation does not invent a boundary clip or a horizon',()=>{
  const result=validation.sceneMatrix({workloads:[['flat','standard',85]]});
  assert.deepEqual(result.failures,[]);
  const row=result.rows[0];
  assert.equal(row.boundaryClipped,0);
  assert.equal(row.groundHorizon,null);
  assert.ok(row.painterViews.find(v=>v.name==='foundation-targeted').fillCalls>0);
});

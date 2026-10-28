'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const validation=require('../tools/validate-physical-scene-115');

test('115: independent vacuum camera/world angular geometry is preserved on Globe and Flat',()=>{
  const result=validation.vacuumGeometry();
  assert.equal(result.cases,24);
  assert.deepEqual(result.failures,[]);
  assert.ok(result.maxAngleError<2e-10);
});

test('115: engineered Flat grazing boundary matches independent analytic horizon at different radii/heights',()=>{
  const result=validation.boundaryMatrix();
  assert.equal(result.cases,32);
  assert.deepEqual(result.failures,[]);
});

test('115: Standard atmosphere RK4 coarse/fine angles and downward bending agree for both geometries',()=>{
  const result=validation.standardNumericalQualification();
  assert.equal(result.cases,12);
  assert.deepEqual(result.failures,[]);
  assert.ok(result.maxPixelError<0.05);
  assert.ok(result.minimumApparentLift>0);
});

test('115: adaptive prism agrees with independent direct RK4 at off-grid samples',()=>{
  const result=validation.projectionMatrix();
  assert.equal(result.rows.length,4);
  assert.deepEqual(result.failures,[]);
  for(const row of result.rows){
    assert.equal(row.mismatches,0);
    assert.ok(row.compared>=5);
    assert.ok(row.maxPixelError<0.5);
  }
});

test('115: full 87-tower Flat Standard scene has complete painter batches, visible fills and reusable optics',()=>{
  const result=validation.sceneMatrix({workloads:[['flat','standard',85]]});
  assert.deepEqual(result.failures,[]);
  const row=result.rows[0];
  assert.equal(row.towers,87);
  assert.equal(row.outlineUnresolved,0);
  assert.ok(row.drawnFillCalls>0);
  assert.ok(row.visibleSegments>3000);
  assert.equal(row.painterViewsChecked,3);
  assert.equal(row.cacheReused,true);
});

test('115/116: Globe Standard boundary leaves are conservatively clipped without budget failures',()=>{
  const result=validation.sceneMatrix({workloads:[['globe','standard',85]]});
  assert.deepEqual(result.failures,[]);
  const row=result.rows[0];
  assert.equal(row.towers,87);
  assert.equal(row.outlineUnresolved,0);
  assert.equal(row.boundaryClipped,130);
  assert.ok(row.maxBoundaryGapMetres<0.1);
  assert.ok(row.painterViews.find(v=>v.name==='foundation-targeted').fillCalls>0);
  assert.equal(row.unresolvedReasons['sample-budget']||0,0);
  assert.equal(row.unresolvedReasons['optical-solver']||0,0);
  assert.equal(row.fillUnresolved,0);
  assert.equal(row.cacheReused,true);
});

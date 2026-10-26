'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const extractor=require('./LegacyGeometryExtractor');
test('explicit Line3D vectors are extracted without mutating the frame',()=>{
  const frame={commands:[{method:'Line3D',args:[[1,2,3],[4,5,6]]},{method:'SetCamera',args:[1]}]};
  const before=JSON.stringify(frame);
  const result=extractor.extract(frame);
  assert.equal(JSON.stringify(frame),before);
  assert.deepEqual(result.scene.primitives[0].points,[[1,2,3],[4,5,6]]);
  assert.equal(result.scene.primitives[0].commandIndex,0);
  assert.equal(result.coverage.supported,1);
  assert.equal(result.coverage.unsupportedByMethod.SetCamera,1);
  assert.equal(result.coverage.complete,false);
});
test('numeric Line3D form and invalid shapes are handled conservatively',()=>{
  const result=extractor.extract({commands:[
    {method:'Line3D',args:[0,1,2,3,4,5]},
    {method:'Line3D',args:[[0,1],[2,3]]}
  ]});
  assert.deepEqual(result.scene.primitives[0].points,[[0,1,2],[3,4,5]]);
  assert.equal(result.coverage.supported,1);
  assert.equal(result.coverage.unsupported,1);
});

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
test('polygon lifecycle extracts ordered vertices and preserves command provenance',()=>{
  const frame={commands:[
    {method:'NewPoly3D',args:[]},
    {method:'AddPointToPoly3D',args:[0,0,0]},
    {method:'AddPointToPoly3D',args:[[1,0,0]]},
    {method:'AddPointToPoly3D',args:[0,1,0]},
    {method:'DrawPoly3D',args:[2]},
    {method:'SetPlane',args:[1]}
  ]};
  const before=JSON.stringify(frame);
  const result=extractor.extract(frame);
  assert.equal(JSON.stringify(frame),before);
  assert.equal(result.coverage.supported,5);
  assert.equal(result.coverage.completedPolygons,1);
  assert.equal(result.coverage.polygonVertices,3);
  assert.deepEqual(result.scene.primitives[0].points,[[0,0,0],[1,0,0],[0,1,0]]);
  assert.deepEqual(result.scene.primitives[0].sourceCommandIndices,[0,1,2,3,4]);
  assert.equal(result.coverage.unsupportedByMethod.SetPlane,1);
});
test('transformed and incomplete polygons are rejected conservatively',()=>{
  const result=extractor.extract({commands:[
    {method:'NewPoly3D',args:[true]},
    {method:'AddPointToPoly3D',args:[0,0,0]},
    {method:'DrawPoly3D',args:[2]},
    {method:'NewPoly3D',args:[]},
    {method:'AddPointToPoly3D',args:[0,0,0]},
    {method:'DrawPoly3D',args:[2]}
  ]});
  assert.equal(result.coverage.completedPolygons,0);
  assert.equal(result.coverage.discardedPolygonSequences,2);
  assert.equal(result.scene.primitives.length,0);
});
test('polygon invert mode reverses emitted vertices without mutating frame',()=>{
  const commands=[{method:'NewPoly3D',args:[]},
    ...[[0,0,0],[1,0,0],[0,1,0]].map(p=>({method:'AddPointToPoly3D',args:[p]})),
    {method:'DrawPoly3D',args:[17]}];
  const result=extractor.extract({commands});
  assert.deepEqual(result.scene.primitives[0].points,[[0,1,0],[1,0,0],[0,0,0]]);
});

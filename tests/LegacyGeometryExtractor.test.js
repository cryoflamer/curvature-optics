'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const extractor=require('../src/legacy/LegacyGeometryExtractor');
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
test('incomplete polygons are rejected conservatively',()=>{
  const result=extractor.extract({commands:[
    {method:'NewPoly3D',args:[true]},
    {method:'AddPointToPoly3D',args:[0,0,0]},
    {method:'DrawPoly3D',args:[2]},
    {method:'NewPoly3D',args:[]},
    {method:'AddPointToPoly3D',args:[0,0,0]},
    {method:'DrawPoly3D',args:[2]}
  ]});
  assert.equal(result.coverage.completedPolygons,0);
  assert.equal(result.coverage.discardedPolygonSequences,3);
  assert.equal(result.scene.primitives.length,0);
});
test('polygon invert mode reverses emitted vertices without mutating frame',()=>{
  const commands=[{method:'NewPoly3D',args:[]},
    ...[[0,0,0],[1,0,0],[0,1,0]].map(p=>({method:'AddPointToPoly3D',args:[p]})),
    {method:'DrawPoly3D',args:[17]}];
  const result=extractor.extract({commands});
  assert.deepEqual(result.scene.primitives[0].points,[[0,1,0],[1,0,0],[0,0,0]]);
});

test('affine composition, stack and degree angles match GraphX3DX ordering',()=>{
 const commands=[
 {method:'TransMove3D',args:[10,0,0]},
 {method:'SaveTrans3D',args:[]},
 {method:'TransRotateZ3D',args:[90]},
 {method:'Line3D',args:[[1,0,0],[0,1,0]]},
 {method:'RestoreTrans3D',args:[]},
 {method:'NewPoly3D',args:[true]},
 ...[[0,0,0],[1,0,0],[0,1,0]].map(p=>({method:'AddPointToPoly3D',args:[p]})),
 {method:'DrawPoly3D',args:[2]}];
 const result=extractor.extract({bootstrap:{AngleMeasure:'deg'},commands});
 const line=result.scene.primitives[0].points;
 assert.ok(Math.abs(line[0][0])<1e-10);assert.ok(Math.abs(line[0][1]-11)<1e-10);
 assert.deepEqual(result.scene.primitives[1].points,[[10,0,0],[11,0,0],[10,1,0]]);
 assert.equal(result.coverage.unsupported,0);
});
test('polygon transformed on draw, and saved reset stack semantics',()=>{
 const commands=[{method:'NewPoly3D',args:[]},
 ...[[0,0,0],[1,0,0],[0,1,0]].map(p=>({method:'AddPointToPoly3D',args:[p]})),
 {method:'TransMove3D',args:[2,3,4]}, {method:'DrawPoly3D',args:[2]},
 {method:'SaveTrans3D',args:[true]}, {method:'TransMove3D',args:[9,0,0]},
 {method:'RestoreTrans3D',args:[]}, {method:'DrawPoly3D',args:[2]}];
 const result=extractor.extract({commands});
 assert.deepEqual(result.scene.primitives[0].points,[[2,3,4],[3,3,4],[2,4,4]]);
 assert.deepEqual(result.scene.primitives[1].points,result.scene.primitives[0].points);
});

test('plane polygons and lines resolve independent world coordinates',()=>{
 const commands=[
  {method:'SetPlane',args:[[1,2,3],[2,0,0],[0,0,3]]},
  {method:'PolygonOnPlane',args:[[0,1,0],[0,0,1],2]},
  {method:'LineOnPlane',args:[0,0,1,1]}
 ];
 const result=extractor.extract({commands});
 assert.equal(result.coverage.supported,3);
 assert.deepEqual(result.scene.primitives[0].points,[[1,2,3],[3,2,3],[1,2,6]]);
 assert.deepEqual(result.scene.primitives[1].points,[[1,2,3],[3,2,6]]);
});
test('plane normalization and affine transforms compose without modifying input',()=>{
 const frame={commands:[
  {method:'SetPlane',args:[[0,0,0],[2,0,0],[0,0,3],true]},
  {method:'TransMove3D',args:[5,0,0]},
  {method:'PolygonOnPlane',args:[[0,1,0],[0,0,1],1]}
 ]};
 const original=JSON.stringify(frame),r=extractor.extract(frame);
 assert.equal(JSON.stringify(frame),original);
 assert.deepEqual(r.scene.primitives[0].points,[[5,0,0],[6,0,0],[5,0,1]]);
});
test('invalid plane and malformed on-plane polygon are rejected',()=>{
 const r=extractor.extract({commands:[
  {method:'SetPlane',args:[[0,0,0],[0,0,0],[0,1,0],true]},
  {method:'PolygonOnPlane',args:[[0,1,0],[0,0,1],1]},
  {method:'SetPlane',args:[[0,0,0],[1,0,0],[0,1,0]]},
  {method:'PolygonOnPlane',args:[[0,1,0],[0,1],1]}
 ]});
 assert.equal(r.coverage.supported,1);
 assert.equal(r.coverage.unsupportedByMethod.PolygonOnPlane,2);
});

test('filled CircleOnPlane is extracted in source order as a diagnostic occluder',()=>{
 const result=extractor.extract({commands:[
  {method:'SetPlane',args:[[0,0,2],[1,0,0],[0,1,0]]},
  {method:'CircleOnPlane',args:[0,0,10,2]},
  {method:'PolygonOnPlane',args:[[0,1,0],[0,0,1],1]}
 ]});
 assert.equal(result.coverage.unsupported,0);
 assert.equal(result.scene.primitives[0].mode,2);
 assert.equal(result.scene.primitives[0].commandIndex,1);
 assert.equal(result.scene.primitives[0].points.length,256);
 assert.ok(Math.abs(result.scene.primitives[0].points[0][0]-10)<1e-10);
 assert.equal(result.scene.primitives[1].commandIndex,2);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const extract=require('../src/legacy/LegacyGeometryExtractor');
const verify=require('../src/legacy/LegacyGeometryFrameVerification');
const context=vm.createContext({Math,Array,Number,Object,console,window:{},setTimeout:()=>0,clearTimeout:()=>{}});
vm.runInContext(fs.readFileSync(require.resolve('../src/legacy/GraphX3DX.js'),'utf8'),context);
const math=vm.runInContext('({mat:JsgMat3,plane:JsgPlane})',context);
test('real-frame verifier cross-checks transform and plane geometry',()=>{
  const frame={bootstrap:{AngleMeasure:'rad'},commands:[
    {method:'TransMove3D',args:[3,4,5]},
    {method:'TransRotateX3D',args:[0.3]},
    {method:'NewPoly3D',args:[]},
    {method:'AddPointToPoly3D',args:[[0,0,0]]},
    {method:'AddPointToPoly3D',args:[[1,0,0]]},
    {method:'AddPointToPoly3D',args:[[0,1,0]]},
    {method:'DrawPoly3D',args:[1]},
    {method:'SetPlane',args:[[0,0,0],[1,0,0],[0,1,0],true]},
    {method:'PolygonOnPlane',args:[[0,1,0],[0,0,1],1,3]}
  ]};
  const scene=extract.extract(frame).scene;
  const result=verify.verify(frame,scene,math);
  assert.equal(result.passed,true,JSON.stringify(result));
  assert.equal(result.comparedPrimitives,2);
  const changed=JSON.parse(JSON.stringify(scene));changed.primitives[0].points[0][0]+=0.01;
  assert.equal(verify.verify(frame,changed,math).passed,false);
});

test('verification rejects missing, duplicate, and non-finite extracted coordinates',()=>{
  const frame={commands:[
    {method:'Line3D',args:[[0,0,0],[1,0,0]]},
    {method:'Line3D',args:[[0,1,0],[1,1,0]]}
  ]};
  const scene=extract.extract(frame).scene;
  const baseline=verify.verify(frame,scene,math);
  assert.equal(baseline.passed,true,JSON.stringify(baseline));
  const missing={primitives:scene.primitives.slice(0,1)};
  const missingResult=verify.verify(frame,missing,math);
  assert.equal(missingResult.passed,false);
  assert.equal(missingResult.missingExtractedPrimitives,1);
  const duplicate={primitives:[scene.primitives[0],scene.primitives[0]]};
  const duplicateResult=verify.verify(frame,duplicate,math);
  assert.equal(duplicateResult.passed,false);
  assert.equal(duplicateResult.duplicateCommandIndices,1);
  const corrupted=JSON.parse(JSON.stringify(scene));
  corrupted.primitives[0].points[0][0]=null;
  const bad=verify.verify(frame,corrupted,math);
  assert.equal(bad.passed,false);
  assert.equal(bad.invalidCoordinates,1);
});

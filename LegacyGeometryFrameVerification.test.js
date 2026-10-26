'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const extract=require('./LegacyGeometryExtractor');
const verify=require('./LegacyGeometryFrameVerification');
const context=vm.createContext({Math,Array,Number,Object,console,window:{},setTimeout:()=>0,clearTimeout:()=>{}});
vm.runInContext(fs.readFileSync(require.resolve('./GraphX3DX.js'),'utf8'),context);
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

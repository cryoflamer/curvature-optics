'use strict';
// Numerical cross-check against the original GraphX3DX math, without a Canvas.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const extractor=require('../src/legacy/LegacyGeometryExtractor');
const context=vm.createContext({Math,Array,Number,Object,console,window:{},setTimeout:()=>0,clearTimeout:()=>{}});
vm.runInContext(fs.readFileSync(require.resolve('../src/legacy/GraphX3DX.js'),'utf8'),context);
const reference=vm.runInContext('({mat:JsgMat3,plane:JsgPlane})',context);
function compare(frame,expected,tolerance=1e-10){
  const primitives=extractor.extract(frame).scene.primitives;
  assert.equal(primitives.length,expected.length);
  let maximum=0,count=0;
  for(let i=0;i<expected.length;i++){
    assert.equal(primitives[i].points.length,expected[i].length);
    for(let j=0;j<expected[i].length;j++)for(let k=0;k<3;k++){
      const delta=Math.abs(primitives[i].points[j][k]-expected[i][j][k]);
      assert.ok(Number.isFinite(delta));maximum=Math.max(maximum,delta);count++;
    }
  }
  assert.ok(maximum<=tolerance,`max coordinate error ${maximum} exceeds ${tolerance}`);
  return {comparedCoordinates:count,maxAbsoluteError:maximum};
}
test('world-space polygon coordinates match GraphX3DX affine matrix composition',()=>{
  const m=reference.mat;
  let matrix=m.Moving(5,-3,2);
  matrix=m.RotatingX(0.37,matrix);
  matrix=m.RotatingY(-0.2,matrix);
  matrix=m.Scaling(2,3,0.5,matrix);
  const input=[[0,0,0],[1,2,3],[-2,1,0],[4,-1,2]];
  const expected=input.map(p=>Array.from(m.TransTo(matrix,p.slice())));
  const frame={commands:[
    {method:'TransMove3D',args:[5,-3,2]},
    {method:'TransRotateX3D',args:[0.37]},
    {method:'TransRotateY3D',args:[-0.2]},
    {method:'TransScale3D',args:[2,3,0.5]},
    {method:'NewPoly3D',args:[]},
    ...input.map(p=>({method:'AddPointToPoly3D',args:[p]})),
    {method:'DrawPoly3D',args:[1]}
  ]};
  compare(frame,[expected]);
});
test('SetPlane polygon vertices match original JsgPlane basis and affine transform',()=>{
  const pos=[1,2,3],x=[1,1,0],y=[0,1,2];
  const plane=new reference.plane(pos.slice(),x.slice(),y.slice(),true);
  const xs=[0,2,-1],ys=[0,1,3];
  const expected=xs.map((v,i)=>Array.from(plane.PointOnPlane(v,ys[i])).slice());
  compare({commands:[
    {method:'SetPlane',args:[pos,x,y,true]},
    {method:'PolygonOnPlane',args:[xs,ys,1,3]}
  ]},[expected]);
});
test('saved transform and degree-angle rotation agree with GraphX3DX reference',()=>{
  const m=reference.mat;
  const base=m.Moving(4,5,6);
  const rotated=m.RotatingZ(Math.PI/2,base);
  const p=[2,1,-3];
  const expected=[Array.from(m.TransTo(rotated,p.slice())),Array.from(m.TransTo(base,p.slice()))];
  const commands=[{method:'TransMove3D',args:[4,5,6]},{method:'SaveTrans3D',args:[]},
    {method:'SetAngleMeasure',args:['deg']},{method:'TransRotateZ3D',args:[90]},
    {method:'Line3D',args:[p,p]},{method:'RestoreTrans3D',args:[]},
    {method:'Line3D',args:[p,p]}];
  compare({commands},[[expected[0],expected[0]],[expected[1],expected[1]]]);
});

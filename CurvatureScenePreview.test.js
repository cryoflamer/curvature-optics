'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const preview=require('./CurvatureScenePreview');
const scene={primitives:[{type:'line',commandIndex:7,points:[[0,0,1],[10,20,2]]},{type:'polygon',points:[[0,0,0],[10,0,0],[0,10,0]]}]};
test('orthographic projection fits geometry and preserves provenance without mutation',()=>{
  const before=JSON.stringify(scene);
  const result=preview.project(scene,'xy',200,100,10);
  assert.equal(result.primitives.length,2);
  assert.equal(result.primitives[0].commandIndex,7);
  assert.deepEqual(result.bounds,{minX:0,maxX:10,minY:0,maxY:20});
  assert.ok(result.primitives.every(p=>p.points.every(v=>v.every(Number.isFinite))));
  assert.equal(JSON.stringify(scene),before);
});
test('XZ and YZ use world axes and empty scenes are valid',()=>{
  assert.deepEqual(preview.project(scene,'xz',200,100).bounds,{minX:0,maxX:10,minY:0,maxY:2});
  assert.deepEqual(preview.project(scene,'yz',200,100).bounds,{minX:0,maxX:20,minY:0,maxY:2});
  assert.deepEqual(preview.project({primitives:[]},'xy',200,100).primitives,[]);
});
test('invalid views, dimensions and coordinates are rejected',()=>{
  assert.throws(()=>preview.project(scene,'bad',200,100),/view/);
  assert.throws(()=>preview.project(scene,'xy',0,100),/dimensions/);
  assert.throws(()=>preview.project({primitives:[{type:'line',points:[[NaN,0,0]]}]},'xy',200,100),/point/);
});
test('drawing uses only independent canvas 2D operations',()=>{
  const calls=[];
  const ctx={clearRect(){calls.push('clear');},fillRect(){calls.push('fill');},beginPath(){calls.push('begin');},moveTo(){},lineTo(){},closePath(){calls.push('close');},stroke(){calls.push('stroke');}};
  const result=preview.draw({width:200,height:100,getContext:()=>ctx},scene,'xy');
  assert.equal(result.primitives.length,2);
  assert.equal(calls.filter(x=>x==='stroke').length,2);
  assert.equal(calls.filter(x=>x==='close').length,1);
});

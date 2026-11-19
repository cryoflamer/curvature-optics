'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const editor=require('../src/ui/modern/ModernPhotoCalibrationEditor');
test('photo viewport preserves original pixel coordinates through zoom and pan',()=>{
  const v=editor.fit(4000,3000,800,540),x=v.x+1300*v.scale,y=v.y+2500*v.scale;
  const z=editor.zoomAt(v,x,y,4,.01,20);
  const p=editor.imagePoint(z,x,y,4000,3000);
  assert.ok(Math.hypot(p[0]-1300,p[1]-2500)<1e-8);
  z.x+=81;z.y-=35;
  assert.deepEqual(editor.imagePoint(z,x+81,y-35,4000,3000).map(Math.round),[1300,2500]);
  assert.equal(editor.imagePoint(v,-1,-1,4000,3000),null);
});
test('correspondence IDs and weights survive editing without mutating input',()=>{
  const l={id:'b0:p2:v3',bank:0,objectType:3,primitive:2,vertex:3},p=[12.5,34.25];
  const row=editor.pair(l,p,100,80),rows=editor.upsert([],row);
  const edited=editor.pair(l,[15,20],100,80,.1);
  assert.throws(()=>editor.upsert(rows,edited),/already paired/);
  assert.deepEqual(editor.upsert(rows,edited,l.id),[edited]);
  assert.deepEqual(rows[0].pixel,p);assert.equal(rows[0].weight,1);
  assert.throws(()=>editor.pair(l,[100,0],100,80),/Invalid/);
  assert.throws(()=>editor.pair(l,p,100,80,0),/Invalid/);
});

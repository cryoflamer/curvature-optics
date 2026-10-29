'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const interaction=require('../src/ui/modern/ModernCameraInteraction');

const camera={Pan:0.0464,Nick:0.0121,Roll:0};
test('137: a single viewport-agnostic camera drag tracks both axes relative to its origin',()=>{
  const previews=[],commits=[];
  const drag=interaction.create({onPreview:s=>previews.push(s),onCommit:s=>commits.push(s)});
  assert.equal(drag.snapshot(),null);
  const origin=drag.begin({viewport:'Scene',x:100,y:200,width:800,height:500,camera});
  assert.equal(origin.dx,0);
  assert.equal(drag.isActive(),true);
  assert.throws(()=>drag.begin({viewport:'A',x:0,y:0,width:1,height:1,camera}),/already active/);
  const sample=drag.move({x:130,y:170});
  assert.equal(sample.dx,30);
  assert.equal(sample.dy,-30);
  assert.deepEqual(previews,[sample]);
  assert.equal(sample.camera.Pan,camera.Pan);
  camera.Pan=100; // initial camera snapshot cannot silently change during drag
  assert.equal(drag.snapshot().camera.Pan,0.0464);
  assert.ok(Object.isFrozen(sample));
  assert.ok(Object.isFrozen(sample.camera));
  assert.equal(drag.end({x:145,y:160}).dx,45);
  assert.equal(commits.length,1);
  assert.equal(commits[0].dy,-40);
  assert.equal(drag.isActive(),false);
  assert.equal(drag.move({x:1,y:2}),null);
  assert.equal(drag.end(),null);
});
test('137: Compare A and B use the same pointer-independent camera interaction contract',()=>{
  const committed=[];
  const drag=interaction.create({onCommit:s=>committed.push(s.viewport)});
  for(const viewport of ['A','B']){
    drag.begin({viewport,x:50,y:60,width:400,height:260,camera:{Pan:1,Nick:2,Roll:3}});
    drag.move({x:70,y:90});
    drag.end();
  }
  assert.deepEqual(committed,['A','B']);
});
test('137: cancel and unchanged pointer release never commit camera changes',()=>{
  let commits=0,cancels=0;
  const drag=interaction.create({onCommit:()=>commits++,onCancel:()=>cancels++});
  const start={viewport:'Scene',x:0,y:0,width:400,height:200,camera};
  drag.begin(start);
  drag.end();
  drag.begin(start);
  drag.move({x:100,y:40});
  const cancelled=drag.cancel();
  assert.equal(cancelled.dx,100);
  assert.equal(drag.isActive(),false);
  assert.equal(drag.cancel(),null);
  assert.equal(commits,0);
  assert.equal(cancels,1);
});
test('137: invalid camera, coordinate and viewport values are rejected atomically',()=>{
  const drag=interaction.create();
  const args={viewport:'Scene',x:1,y:2,width:800,height:400,camera};
  for(const invalid of [{viewport:'Z'},{x:Infinity},{y:NaN},{width:0},
    {height:-1},{camera:{Pan:0,Nick:NaN,Roll:0}},{camera:null}]){
    assert.throws(()=>drag.begin(Object.assign({},args,invalid)));
    assert.equal(drag.isActive(),false);
  }
  drag.begin(args);
  assert.throws(()=>drag.move({x:NaN,y:9}),RangeError);
  assert.equal(drag.snapshot().dx,0);
  drag.cancel();
});

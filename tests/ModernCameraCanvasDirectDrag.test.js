'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const drag=require('../src/ui/modern/ModernCameraCanvasDirectDrag');
function harness(){
  const frames=new Map(),drawn=[],errors=[];let next=0,cancelled=0;
  const preview=drag.create({requestFrame(fn){const id=++next;frames.set(id,fn);return id;},
    cancelFrame(id){if(frames.delete(id))cancelled++;},paint(pose){
      if(pose.fail)throw Error('Painter failed');
      drawn.push(pose);
    },onError(error){errors.push(error.message);}});
  return {preview,frames,drawn,errors,flush(){const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn());},
    get cancelled(){return cancelled;}};
}
test('Canvas Direct drag coalesces to latest pointer pose and never paints after clear',()=>{
  const h=harness();h.preview.begin();
  h.preview.move({Pan:1});h.preview.move({Pan:2});h.preview.move({Pan:3});
  assert.equal(h.frames.size,1);assert.equal(h.preview.hasPainted(),false);
  h.flush();assert.deepEqual(h.drawn,[{Pan:3}]);assert.equal(h.preview.hasPainted(),true);
  h.preview.move({Pan:4});h.preview.clear();
  assert.equal(h.cancelled,1);assert.equal(h.frames.size,0);
  h.flush();assert.equal(h.drawn.length,1);
  h.preview.begin();assert.equal(h.preview.hasPainted(),false);
  h.preview.move({Pan:5});h.flush();assert.equal(h.drawn.at(-1).Pan,5);
});
test('Canvas Direct drag fails closed on painter errors; next gesture can restart',()=>{
  const h=harness();h.preview.begin();h.preview.move({fail:true});h.flush();
  assert.deepEqual(h.errors,['Painter failed']);
  assert.equal(h.preview.isActive(),false);
  h.preview.move({Pan:4});assert.equal(h.frames.size,0);
  h.preview.begin();h.preview.move({Pan:8});h.flush();
  assert.deepEqual(h.drawn,[{Pan:8}]);
});
test('Canvas Direct drag accepts synchronous RAF test harnesses without stale pending IDs',()=>{
  const values=[];let cancelled=0;
  const p=drag.create({requestFrame(fn){fn();return 7;},cancelFrame(){cancelled++;},
    paint(value){values.push(value);}});
  p.begin();p.move({Pan:1});p.move({Pan:2});p.clear();
  assert.deepEqual(values,[{Pan:1},{Pan:2}]);assert.equal(cancelled,0);
  assert.throws(()=>drag.create({}),TypeError);
});

test('Cancelled RAF callback cannot paint or consume the next interaction frame',()=>{
  const h=harness();h.preview.begin();h.preview.move({Pan:1});
  const stale=[...h.frames.values()][0];h.preview.clear();h.preview.begin();h.preview.move({Pan:2});
  stale();assert.equal(h.drawn.length,0);assert.equal(h.frames.size,1);
  h.flush();assert.deepEqual(h.drawn,[{Pan:2}]);
});

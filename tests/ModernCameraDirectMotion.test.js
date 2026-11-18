'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const drag=require('../src/ui/modern/ModernCameraDirectMotion');
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

function frameFixture(){
  const views=['A','B'].map((side,i)=>({side,model:Object.freeze({Height:15,Pan:0,
    FocalLengthField:100,ViewAngle:5,camViewAngle:5*Math.PI/180,showModel:i===0?1:0}),
    options:Object.freeze({atmosphere:i===0?'standard':'vacuum'})}));
  const checks=[];
  const checker={canvasDirectSupport(frame,options){checks.push({frame,options});
    return frame.Height>100&&options.atmosphere==='vacuum'?{supported:false,reason:'test domain'}:{supported:true};},
    canvasDirectUnsupported(reason){return Object.assign(new RangeError(reason),{code:'CANVAS_DIRECT_UNSUPPORTED'});}};
  return {views,checks,checker};
}
test('shared motion prepares detached A/B frames with current pose and independent physics',()=>{
  const {views,checks,checker}=frameFixture();
  const frames=drag.prepareFrames(views,{Height:20,Pan:1,FocalLengthField:200},
    {Pan:3},{checker,deriveFov:true,focalViewAngle:f=>f===200?2:5});
  assert.equal(checks.length,2);
  assert.deepEqual(frames.map(e=>e.frame.showModel),[1,0]);
  assert.deepEqual(checks.map(e=>e.options.atmosphere),['standard','vacuum']);
  for(const {view,frame} of frames){
    assert.notEqual(frame,view.model);assert.equal(frame.Pan,3);assert.equal(frame.Height,20);
    assert.equal(frame.camViewAngle,2*Math.PI/180);assert.equal(view.model.Height,15);
  }
});
test('shared motion preserves pointer FOV and rejects the complete batch with side-specific reason',()=>{
  const {views,checks,checker}=frameFixture();
  const options={checker,deriveFov:false,focalViewAngle(){throw Error('must not derive pointer FOV');}};
  assert.equal(drag.prepareFrames(views,{}, {Height:20},options)[1].frame.ViewAngle,5);
  assert.throws(()=>drag.prepareFrames(views,{}, {Height:200},options),
    {code:'CANVAS_DIRECT_UNSUPPORTED',message:'B: test domain'});
  assert.equal(checks.length,4);
  assert.equal(views[1].model.Height,15);
  assert.equal(drag.prepareFrames(views,{}, {Height:20},options).length,2);
});

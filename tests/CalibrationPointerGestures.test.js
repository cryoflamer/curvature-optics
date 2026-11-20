'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const gestures=require('../src/ui/modern/CalibrationPointerGestures');
const event=(x,y,button=0,timeStamp=0,pointerId=1)=>({clientX:x,clientY:y,button,timeStamp,pointerId,preventDefault(){}});
const saved={kind:'saved',id:'p1'},draft={kind:'draft'},bg={kind:'background'};
test('CSS threshold latches initial target; right drag always pans',()=>{
  const g=gestures.create();
  g.begin(event(0,0),saved,'orbit');assert.equal(g.active.action,'marker');
  assert.equal(g.move(event(3,3)),null);assert.deepEqual(g.move(event(5,0)).delta,[5,0]);
  assert.equal(g.move(event(0,0)).moved,true);assert.equal(g.finish(event(0,0)).kind,'drag');
  g.begin(event(0,0,2),saved,'orbit');assert.equal(g.active.action,'pan');
  assert.equal(g.finish(event(8,0,2)).kind,'drag');
  g.begin(event(0,0,2),bg,'orbit');assert.equal(g.finish(event(0,0,2)).kind,'context');
  g.begin(event(0,0),bg,'orbit');assert.equal(g.active.action,'orbit');
  assert.equal(g.move(event(7,0,0,0,2)),null);assert.equal(g.finish(event(0,0,0,0,2)),null);
  assert.equal(g.finish(event(8,0),false).kind,'drag');
});
test('double-click is separate, background to draft is allowed; drag/cancel breaks sequence',()=>{
  const g=gestures.create(),click=(t,target=bg,x=0)=>{g.begin(event(x,0,0,t),target);return g.finish(event(x,0,0,t)).kind;};
  assert.equal(click(10),'click');assert.equal(click(100,draft),'double-click');
  assert.equal(click(150,draft),'click');assert.equal(click(700,draft),'click');
  assert.equal(click(710,saved),'click');assert.equal(click(720,saved,20),'click');
  g.begin(event(20,0,0,730),saved);g.move(event(26,0));assert.equal(g.finish(event(20,0,0,740)).kind,'drag');
  assert.equal(click(750,saved,20),'click');
  g.begin(event(20,0),saved);assert.equal(g.cancel(2),null);assert.equal(g.cancel(1).kind,'cancel');
  assert.equal(click(760,saved,20),'click');
  g.begin(event(20,0),saved);assert.equal(g.finish(event(30,0),false).kind,'cancel');
  assert.equal(click(770,saved,20),'click');
});
test('marker hit tests use both CSS scales and draft wins exact overlap',()=>{
  const p=[20,40],a={...saved,pixel:p},b={...draft,pixel:p};
  assert.equal(gestures.markerAt([a,b],[30,60],[2,4]),b);
  assert.equal(gestures.markerAt([a],[46,40],[2,4]),null);
  assert.equal(gestures.markerAt([a],[44,40],[2,4]),a);
});
test('mounted adapter suppresses browser menu, captures once and cancels outside drops',()=>{
  const events={},log=[];let capture=null;
  const canvas={addEventListener(k,fn){events[k]=fn;},getBoundingClientRect(){return {left:0,top:0,width:100,height:100};},
    setPointerCapture(id){capture=id;},hasPointerCapture(id){return capture===id;},releasePointerCapture(id){capture=null;events.lostpointercapture({pointerId:id});}};
  const m=gestures.mount(canvas,{target:()=>saved,onDrag:a=>log.push(a.action),onAction:a=>log.push(a.kind),onEnd:a=>log.push('end:'+a.kind)});
  events.pointerdown(event(10,10,2));events.pointerup(event(30,10,2));assert.deepEqual(log,['pan','drag','end:drag']);assert.equal(capture,null);
  events.pointerdown(event(10,10));events.pointermove(event(20,20));events.pointerup(event(110,20));
  assert.deepEqual(log.slice(-3),['marker','marker','end:cancel']);
  events.pointerdown(event(10,10));events.lostpointercapture({pointerId:1});assert.equal(m.active,null);assert.equal(log.at(-1),'end:cancel');
  let prevented=false;events.contextmenu({preventDefault(){prevented=true;}});assert.equal(prevented,true);
});

test('empty background double-click is distinct from a pick and cannot link a draft',()=>{
  const g=gestures.create(),empty={kind:'background',empty:true},object={kind:'background',empty:false};
  const click=(t,target)=>{g.begin(event(10,10,0,t),target,'orbit');return g.finish(event(10,10,0,t));};
  assert.equal(click(10,empty).kind,'click');
  assert.equal(click(110,object).kind,'click');
  assert.equal(click(210,draft).kind,'double-click');
  assert.equal(click(310,empty).kind,'click');assert.equal(click(410,draft).kind,'click');
  assert.equal(click(510,empty).kind,'click');const reset=click(610,empty);
  assert.equal(reset.kind,'double-click');assert.equal(reset.target.empty,true);
  g.begin(event(10,10),empty,'orbit');assert.equal(g.active.action,'orbit');
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const preview=require('../src/ui/modern/ModernCameraDragPreview');
function classes(){const s=new Set();return {add:v=>s.add(v),remove:v=>s.delete(v),contains:v=>s.has(v)};}
function setup(){
  const pending=new Map(),cursorHost={classList:classes()};let next=0,cancelled=0;
  const viewport=(name,width,height)=>({name,canvas:{style:{transform:'rotate(0deg)',willChange:'auto'},
    classList:classes(),getBoundingClientRect(){return {width,height};}}});
  const a=viewport('A',400,250),b=viewport('B',200,125);
  const p=preview.create({requestFrame(fn){const id=++next;pending.set(id,fn);return id;},
    cancelFrame(id){if(pending.delete(id))cancelled++;},cursorHost});
  return {p,a,b,pending,cursorHost,flush(){const q=[...pending.values()];pending.clear();q.forEach(fn=>fn());},
    get cancelled(){return cancelled;}};
}
test('137.2: preview coalesces pointer samples and scales both Compare viewports',()=>{
  const t=setup();t.p.begin({source:'A',viewports:[t.a,t.b]});
  assert.equal(t.cursorHost.classList.contains('modern-camera-dragging-global'),true);
  assert.equal(t.a.canvas.classList.contains('is-camera-dragging'),true);
  t.p.move({dx:10,dy:20});t.p.move({dx:80,dy:-40});
  assert.equal(t.pending.size,1,'one compositor update per animation frame');
  assert.equal(t.a.canvas.style.transform,'rotate(0deg)','no synchronous redraw per move');
  t.flush();
  assert.equal(t.a.canvas.style.transform,'translate3d(80px, -40px, 0)');
  assert.equal(t.b.canvas.style.transform,'translate3d(40px, -20px, 0)');
  t.p.hold({dx:100,dy:50});
  assert.equal(t.a.canvas.style.transform,'translate3d(100px, 50px, 0)');
  assert.equal(t.b.canvas.style.transform,'translate3d(50px, 25px, 0)');
  assert.equal(t.p.isHolding(),true);
  assert.equal(t.cursorHost.classList.contains('modern-camera-dragging-global'),false);
  t.p.clear();
  assert.equal(t.p.isActive(),false);
  assert.equal(t.a.canvas.style.transform,'rotate(0deg)');
  assert.equal(t.b.canvas.style.transform,'rotate(0deg)');
  assert.equal(t.a.canvas.style.willChange,'auto');
  assert.equal(t.a.canvas.classList.contains('is-camera-dragging'),false);
});
test('137.2: dragging B controls A and B, and cancelling drops queued transforms',()=>{
  const t=setup();t.p.begin({source:'B',viewports:[t.a,t.b]});
  t.p.move({dx:20,dy:-10});t.flush();
  assert.equal(t.a.canvas.style.transform,'translate3d(40px, -20px, 0)');
  assert.equal(t.b.canvas.style.transform,'translate3d(20px, -10px, 0)');
  t.p.move({dx:90,dy:100});t.p.clear();
  assert.equal(t.pending.size,0);assert.equal(t.cancelled,1);
  t.flush();
  assert.equal(t.a.canvas.style.transform,'rotate(0deg)');
  assert.equal(t.b.canvas.style.transform,'rotate(0deg)');
  assert.equal(t.cursorHost.classList.contains('modern-camera-dragging-global'),false);
});
test('137.2: failed start leaves existing graphics untouched; invalid movement is rejected',()=>{
  const t=setup();
  assert.throws(()=>t.p.begin({source:'C',viewports:[t.a,t.b]}),RangeError);
  assert.equal(t.p.isActive(),false);
  assert.throws(()=>t.p.begin({source:'A',viewports:[{name:'A',canvas:{}}]}),RangeError);
  assert.equal(t.p.isActive(),false);
  t.p.begin({source:'A',viewports:[t.a]});
  assert.throws(()=>t.p.move({dx:NaN,dy:1}),RangeError);
  assert.equal(t.pending.size,0);
  t.p.clear();
});

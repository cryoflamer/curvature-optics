'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const preview=require('../src/ui/modern/ModernCameraDragPreview');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function style(initial='',priority=''){
  const values=new Map(initial?[['cursor',{value:initial,priority}]]:[]);
  const obj={transform:'',willChange:'',
    setProperty(key,value,weight=''){values.set(key,{value,priority:weight});},
    getPropertyValue(key){return values.get(key)?.value||'';},
    getPropertyPriority(key){return values.get(key)?.priority||'';},
    removeProperty(key){values.delete(key);},
    get cursor(){return obj.getPropertyValue('cursor');},
    set cursor(value){obj.setProperty('cursor',value);}};
  return obj;
}
function classes(){const values=new Set();return {
  add:name=>values.add(name),remove:name=>values.delete(name),contains:name=>values.has(name)};}
function viewport(name){return {name,canvas:{style:style(),classList:classes(),
  getBoundingClientRect(){return {width:400,height:220};}}};}
test('137.2.1: cursor is assigned directly with important priority, even if CSS is stale',()=>{
  const canvas={style:style('auto')};
  preview.setCursor(canvas,'grab');
  assert.equal(canvas.style.cursor,preview.cursorValue('grab'));
  assert.equal(canvas.style.getPropertyPriority('cursor'),'important');
  preview.setCursor(canvas,'grabbing');
  assert.equal(canvas.style.cursor,preview.cursorValue('grabbing'));
  assert.equal(canvas.style.getPropertyPriority('cursor'),'important');
  const oldShim={style:{}};
  preview.setCursor(oldShim,'grab');
  assert.equal(oldShim.style.cursor,preview.cursorValue('grab'));
});
test('137.2.1: Scene and Compare cursors follow begin/hold/cancel and host style is restored',()=>{
  const host={style:style('crosshair','important'),classList:classes()};
  const a=viewport('A'),b=viewport('B');
  const handler=preview.create({cursorHost:host,requestFrame:fn=>{fn();return 1;},cancelFrame(){}});
  handler.begin({source:'B',viewports:[a,b]});
  for(const view of [a,b]){
    assert.equal(view.canvas.style.cursor,preview.cursorValue('grabbing'));
    assert.equal(view.canvas.style.getPropertyPriority('cursor'),'important');
  }
  assert.equal(host.style.cursor,preview.cursorValue('grabbing'));
  handler.hold({dx:20,dy:10});
  for(const view of [a,b])assert.equal(view.canvas.style.cursor,preview.cursorValue('grab'));
  assert.equal(host.style.cursor,'crosshair');
  assert.equal(host.style.getPropertyPriority('cursor'),'important');
  handler.clear();
  for(const view of [a,b])assert.equal(view.canvas.style.cursor,preview.cursorValue('grab'));
  handler.begin({source:'A',viewports:[a,b]});
  handler.clear();
  assert.equal(host.style.cursor,'crosshair');
  assert.equal(host.classList.contains('modern-camera-dragging-global'),false);
});
test('137.2.1: absent host cursor is restored without leaving an inline override',()=>{
  const host={style:style(),classList:classes()},scene=viewport('Scene');
  const handler=preview.create({cursorHost:host});
  handler.begin({source:'Scene',viewports:[scene]});
  assert.equal(host.style.cursor,preview.cursorValue('grabbing'));
  handler.clear();
  assert.equal(host.style.cursor,'');
  assert.equal(host.style.getPropertyPriority('cursor'),'');
});
test('137.2.1: Modern stylesheet is cache-busted and declares both camera cursor states',()=>{
  assert.match(read('CurvatureModern.html'),/ModernApp\.css\?v=137\.2\.3/);
  const css=read('src/ui/modern/ModernApp.css');
  assert.match(css,/\.modern-camera-draggable\s*\{cursor:url\(/);
  assert.match(css,/\.modern-camera-draggable\.is-camera-dragging\s*\{cursor:url\(/);
});

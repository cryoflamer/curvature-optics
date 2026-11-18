'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const api=require('../src/animation/ModernAnimationPresentation');
function harness(){
  const listeners={},doc={body:null,activeElement:null,fullscreenElement:null,addEventListener(k,f){listeners[k]=f;}};
  function node(parent){
    const attrs={},classes=new Set();
    const n={parentElement:parent,children:[],inert:false,hidden:true,isConnected:true,style:{overflow:'auto'},tabIndex:0,
      classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},
      setAttribute(k,v){attrs[k]=v;},removeAttribute(k){delete attrs[k];},getAttribute:k=>attrs[k],
      focus(){doc.activeElement=n;},getClientRects(){return [1];},querySelectorAll(){return n.children;}};
    if(parent)parent.children.push(n);return n;
  }
  doc.body=node(null);const app=node(doc.body),side=node(doc.body),workspace=node(app),editor=node(workspace),stage=node(workspace),header=node(app),bar=node(stage),exit=node(stage),canvas=node(stage);
  side.inert=true;header.focus();let ready=true,resize=0,sync=0,errors=0;
  stage.requestFullscreen=()=>{doc.fullscreenElement=stage;listeners.fullscreenchange();return Promise.resolve();};
  doc.exitFullscreen=()=>{doc.fullscreenElement=null;listeners.fullscreenchange();return Promise.resolve();};
  const controller=api.create({document:doc,stage,bar,exitButton:exit,ready:()=>ready,
    sync(){sync++;},resize(){resize++;},fullscreenError(){errors++;}});
  return {doc,stage,bar,exit,canvas,header,editor,side,controller,listeners,stats:()=>({resize,sync,errors}),setReady(v){ready=v;}};
}
test('presentation retains mounted stage and restores background state and focus',()=>{
  const h=harness(),parent=h.stage.parentElement;h.setReady(false);assert.equal(h.controller.enter(),false);h.setReady(true);
  assert.equal(h.controller.enter(),true);assert.equal(h.controller.enter(),false);assert.equal(h.stage.parentElement,parent);
  assert.equal(h.canvas.parentElement,h.stage);assert.equal(h.editor.inert,true);assert.equal(h.header.inert,true);
  assert.equal(h.doc.activeElement,h.exit);assert.equal(h.doc.body.style.overflow,'hidden');assert.equal(h.bar.hidden,false);
  assert.equal(h.controller.leave(),true);assert.equal(h.controller.leave(),false);
  assert.equal(h.editor.inert,false);assert.equal(h.header.inert,false);assert.equal(h.side.inert,true);
  assert.equal(h.doc.activeElement,h.header);assert.equal(h.doc.body.style.overflow,'auto');assert.equal(h.bar.hidden,true);
  assert.deepEqual(h.stats(),{resize:2,sync:2,errors:0});
});
test('fullscreen uses the same element, Escape exits presentation after native fullscreen',async()=>{
  const h=harness();h.controller.enter();await h.controller.fullscreen();assert.equal(h.doc.fullscreenElement,h.stage);
  h.listeners.keydown({key:'Escape',preventDefault(){throw Error('native Escape must remain available');}});
  assert.equal(h.controller.isActive(),true);await h.doc.exitFullscreen();let prevented=false;
  h.listeners.keydown({key:'Escape',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(h.controller.isActive(),false);
  h.controller.enter();await h.controller.fullscreen();h.controller.leave();assert.equal(h.doc.fullscreenElement,null);
});
test('fullscreen denial leaves the viewer usable',async()=>{
  const h=harness();h.controller.enter();h.stage.requestFullscreen=()=>Promise.reject(Error('denied'));
  await h.controller.fullscreen();assert.equal(h.stats().errors,1);assert.equal(h.controller.isActive(),true);h.controller.leave();
});
test('current frame labels distinguish holds and transitions at exact arrival',()=>{
  const times=[{name:'A',arrivalMs:0,departureMs:100},{name:'B',arrivalMs:300,departureMs:400}];
  assert.equal(api.frameLabel(times,100),'1 / 2 · A');assert.equal(api.frameLabel(times,101),'1 → 2 · A → B');
  assert.equal(api.frameLabel(times,300),'2 / 2 · B');assert.equal(api.frameLabel(times,400),'2 / 2 · B');assert.equal(api.frameLabel(times,NaN),'');
});

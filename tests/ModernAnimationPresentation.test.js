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

test('Narration follows painted time, including holds, travel, reverse seeks and empty destination',()=>{
  const times=[{name:'A',arrivalMs:0,departureMs:200,description:'First <b>literal</b>'},
    {name:'B',arrivalMs:500,departureMs:500},
    {name:'C',arrivalMs:1000,departureMs:1200,description:'Last'}];
  const first={label:'1 / 3 · A',text:'First <b>literal</b>'};
  assert.equal(api.narrativeAt(times,NaN),null);
  for(const time of [0,200,201,499])assert.deepEqual(api.narrativeAt(times,time),first);
  for(const time of [500,501,999])assert.equal(api.narrativeAt(times,time),null);
  assert.deepEqual(api.narrativeAt(times,1000),{label:'3 / 3 · C',text:'Last'});
  const panel={},label={textContent:''},body={textContent:'',scrollTop:7};
  Object.defineProperty(body,'innerHTML',{set(){throw Error('Narration must remain plain text');}});
  api.syncNarrative(panel,label,body,times,1000);
  assert.equal(body.textContent,'Last');assert.equal(body.scrollTop,0);assert.equal(panel.hidden,false);
  api.syncNarrative(panel,label,body,times,499);assert.equal(body.textContent,first.text);
  body.scrollTop=5;api.syncNarrative(panel,label,body,times,300);assert.equal(body.scrollTop,5);
  api.syncNarrative(panel,label,body,times,500);assert.equal(body.textContent,'');assert.equal(label.textContent,'');
  api.syncNarrative(panel,label,body,times,NaN);assert.equal(body.textContent,'');
  api.syncNarrative(panel,label,body,[{name:'Old',arrivalMs:0,departureMs:10}],0);assert.equal(panel.hidden,true);
});

test('observations are only valid at painted arrivals and holds; adjacent travel reserves empty space',()=>{
  const times=[{name:'Photo A',arrivalMs:0,departureMs:100,referenceImageIds:['a','b']},
    {name:'No photo',arrivalMs:300,departureMs:400},
    {name:'Photo C',arrivalMs:600,departureMs:600,referenceImageIds:['c']},
    {name:'No photo',arrivalMs:800,departureMs:900},
    {name:'No photo II',arrivalMs:1000,departureMs:1100}];
  const at=t=>api.referencesAt(times,t);
  assert.deepEqual(at(NaN),{index:-1,ids:[],reserve:false});
  for(const t of [0,100])assert.deepEqual(at(t),{index:0,ids:['a','b'],reserve:true});
  for(const t of [101,299,401,599,601,799])assert.deepEqual(at(t),{index:-1,ids:[],reserve:true});
  assert.deepEqual(at(300),{index:1,ids:[],reserve:false});
  assert.deepEqual(at(600),{index:2,ids:['c'],reserve:true});
  assert.deepEqual(at(950),{index:-1,ids:[],reserve:false});
  assert.deepEqual(at(0),{index:0,ids:['a','b'],reserve:true});
});
function referenceHarness(){
  function node(){const attrs={},classes=new Set(),events={};return {hidden:true,disabled:false,textContent:'',value:'',
    classList:{toggle(k,v){if(v)classes.add(k);else classes.delete(k);},contains:k=>classes.has(k)},
    style:{setProperty(k,v){this[k]=v;}},setAttribute(k,v){attrs[k]=v;},getAttribute:k=>attrs[k],removeAttribute(k){delete this[k];},
    addEventListener(k,cb){events[k]=cb;},emit(k,event={}){events[k](event);}};}
  const nodes=Object.fromEntries(['panel','panels','control','splitter','select','image','status','title','view','prev','next','meta'].map(k=>[k,node()]));
  nodes.select.value='side';const pending=[];
  const controller=api.createReferences({...nodes,get:id=>new Promise((resolve,reject)=>pending.push({id,resolve,reject}))});
  const p={},times=[{arrivalMs:0,departureMs:100,referenceImageIds:['a','b']},{arrivalMs:300,departureMs:500,referenceImageIds:['c']},{arrivalMs:800,departureMs:900}];
  const sync=t=>controller.sync(p,times,t),flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
  const record=id=>({record:{title:id,author:'Observer',original:{dataUrl:'data:image/png;base64,'+id}}});
  return {nodes,pending,sync,flush,record,controller};
}
test('viewer ignores stale async loads, keeps original bytes, supports ordering and avoids per-tick reads',async()=>{
  const h=referenceHarness(),n=h.nodes;h.sync(0);await h.flush();assert.equal(h.pending[0].id,'a');
  h.sync(50);await h.flush();assert.equal(h.pending.length,1);
  n.next.emit('click');await h.flush();assert.equal(h.pending[1].id,'b');
  h.pending[1].resolve(h.record('b'));await h.flush();assert.equal(n.image.src,'data:image/png;base64,b');
  h.pending[0].resolve(h.record('a'));await h.flush();assert.equal(n.title.textContent,'b');
  h.sync(150);assert.equal(n.image.hidden,true);assert.equal(n.image.src,undefined);assert.equal(n.panel.hidden,false);
  h.sync(300);await h.flush();assert.equal(h.pending[2].id,'c');
  h.sync(800);h.pending[2].resolve(h.record('c'));await h.flush();assert.equal(n.panel.hidden,true);assert.equal(n.image.hidden,true);
  h.sync(0);await h.flush();h.pending[3].resolve(null);await h.flush();assert.match(n.status.textContent,/Missing local photograph: a/);
});
test('viewer layout and keyboard splitter are independent of reference selection and hide invalidates reads',async()=>{
  const h=referenceHarness(),n=h.nodes;h.sync(0);await h.flush();
  n.select.value='below';n.select.emit('change');await h.flush();assert.equal(h.pending.length,1);
  assert.equal(n.panels.classList.contains('has-reference-below'),true);
  n.splitter.emit('keydown',{key:'ArrowUp',preventDefault(){}});
  assert.equal(n.panels.style['--reference-height'],'34dvh');
  n.select.value='hidden';n.select.emit('change');h.pending[0].resolve(h.record('a'));await h.flush();
  assert.equal(n.image.hidden,true);assert.equal(n.panel.hidden,true);assert.equal(n.control.hidden,false);
  n.select.value='side';n.select.emit('change');await h.flush();assert.equal(h.pending[1].id,'a');
  h.pending[1].reject(Error('storage offline'));await h.flush();assert.match(n.status.textContent,/storage offline/);
  n.splitter.emit('keydown',{key:'ArrowRight',preventDefault(){}});
  assert.equal(n.panels.style['--reference-share'],'35%');
  h.controller.sync(null,null,NaN);assert.equal(n.panel.hidden,true);assert.equal(n.control.hidden,true);
});


test('Chapter list follows painted timeline, title-only frames and visibility without mutating data',()=>{
  const times=[{name:'A',narrativeTitle:'<b>First</b>',arrivalMs:0,departureMs:100},
    {name:'B',description:'Explanation',arrivalMs:300,departureMs:500}];
  const doc={createElement(){return {};}};
  const select={children:[],replaceChildren(){this.children=[];},appendChild(n){this.children.push(n);}};
  api.syncNavigation(doc,select,times,NaN);assert.equal(select.value,'');
  assert.deepEqual(select.children.map(n=>n.textContent),['Rendering frame…','1 · <b>First</b>','2 · B']);
  const options=select.children;
  api.syncNavigation(doc,select,times,200);assert.equal(select.value,'0');assert.equal(select.children,options);
  api.syncNavigation(doc,select,times,300);assert.equal(select.value,'1');
  assert.equal(api.navigationTarget(times,'0'),0);assert.equal(api.navigationTarget(times,'1'),300);
  for(const bad of ['',null,'-1','1.5','2'])assert.equal(api.navigationTarget(times,bad),null);
  assert.deepEqual(api.narrativeAt(times,100),{label:'1 / 2 · <b>First</b>',text:''});
  const panel={},label={},body={};
  api.syncNarrative(panel,label,body,times,100,false);assert.equal(panel.hidden,true);
  api.syncNarrative(panel,label,body,times,100,true);assert.equal(panel.hidden,false);
  assert.equal(label.textContent,'1 / 2 · <b>First</b>');
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const preview=require('../src/ui/modern/ModernThumbnailPreview');
const history=require('../src/ui/modern/ModernExperimentHistoryUI');
const studio=require('../src/ui/modern/ModernAnimationStudioUI');
const root=path.resolve(__dirname,'..');

function fakeDom(){
  const doc={listeners:{},defaultView:{innerWidth:1024,innerHeight:750,
    listeners:{},addEventListener(type,cb){(this.listeners[type]??=[]).push(cb);},
    removeEventListener(type,cb){this.listeners[type]=(this.listeners[type]||[]).filter(f=>f!==cb);}},
  addEventListener(type,cb){(this.listeners[type]??=[]).push(cb);},
  removeEventListener(type,cb){this.listeners[type]=(this.listeners[type]||[]).filter(f=>f!==cb);}};
  function createElement(tag){
    let text='';
    const node={tagName:tag,children:[],listeners:{},style:{},className:'',hidden:false,
      parentNode:null,value:'',
      get textContent(){return text;},set textContent(v){text=String(v);this.children=[];},
      appendChild(c){this.children.push(c);c.parentNode=this;return c;},
      removeChild(c){this.children.splice(this.children.indexOf(c),1);c.parentNode=null;return c;},
      addEventListener(type,cb){(this.listeners[type]??=[]).push(cb);},
      removeEventListener(type,cb){this.listeners[type]=(this.listeners[type]||[]).filter(f=>f!==cb);},
      setAttribute(k,v){this[k]=String(v);},getAttribute(k){return this[k]===undefined?null:String(this[k]);},
      contains(n){return this===n||this.children.some(c=>c.contains(n));},
      getBoundingClientRect(){return this.className==='modern-history-inspector'?
        {left:0,right:600,top:0,bottom:400,width:600,height:400}:
        {left:720,right:870,top:500,bottom:590,width:150,height:90};},
      focus(){(this.listeners.focus||[]).forEach(fn=>fn());},
    };
    return node;
  }
  doc.createElement=createElement;doc.body=createElement('body');
  return {doc,host:createElement('section')};
}
function send(node,type,event={}){for(const cb of node.listeners[type]||[])cb(event);}
function collect(node,match){return [node,...node.children.flatMap(n=>collect(n,match))].filter(match);}
function snapshot(id=1,withImage=true){
  const experiment={display:{mode:'scene'},
    scene:{surface:{showModel:1,rEarth:6371000},atmosphere:'standard',
      objects:{NObjects:[1,0],ObjType:[3,0]},camera:{Height:15,Pan:0,Nick:0}}};
  return {id,name:'Snapshot '+id,description:'Photo of towers',createdAt:1760000000000,
    source:'manual',features:{mode:'scene'},experiment,
    thumbnail:withImage?{dataUrl:'data:image/webp;base64,YQ==',width:480,height:240,mode:'scene'}:null};
}
function overlay(doc){return doc.body.children.find(n=>n.className==='modern-history-inspector');}
function imageSrc(ov){return collect(ov,n=>n.className==='modern-history-preview-image')[0]?.src;}

// The same History inspector renderer (including the full saved screenshot and
// physical settings) is shared by every visual card, without optics calls.
test('Controller delays hover, flips at viewport edges and excludes action buttons',async()=>{
  const {doc,host}=fakeDom(),entry=snapshot(),card=doc.createElement('li'),action=doc.createElement('button');
  card.appendChild(action);host.appendChild(card);
  const ctrl=preview.create(doc,host,history.inspectorMarkup);
  ctrl.bind(card,entry,card);
  send(card,'mouseover',{target:action});
  await new Promise(r=>setTimeout(r,380));
  assert.equal(overlay(doc).hidden,true,'delete/action hover must not open a preview');
  send(card,'mouseover',{target:card});
  assert.equal(overlay(doc).hidden,true,'preview has a dwell delay');
  await new Promise(r=>setTimeout(r,380));
  assert.equal(overlay(doc).hidden,false);
  assert.equal(imageSrc(overlay(doc)),entry.thumbnail.dataUrl);
  assert.ok(parseInt(overlay(doc).style.left,10)<720,'right edge flips the preview left');
  assert.ok(parseInt(overlay(doc).style.top,10)<500,'bottom edge clamps the preview above');
  send(card,'mouseleave');send(overlay(doc),'mouseenter');
  await new Promise(r=>setTimeout(r,170));
  assert.equal(overlay(doc).hidden,false,'moving into preview does not dismiss it');
  ctrl.destroy();assert.equal(doc.body.children.length,0);
});

test('Only one visible popup across galleries; touch pin, Escape, scroll, rerender and cleanup',()=>{
  const {doc,host}=fakeDom(),other=doc.createElement('section');
  const a=preview.create(doc,host,history.inspectorMarkup),b=preview.create(doc,other,history.inspectorMarkup);
  const card=doc.createElement('article'),entry=snapshot();a.bind(card,entry,card);
  send(card,'click',{pointerType:'touch',target:card});
  assert.equal(doc.body.children[0].role,'dialog');
  b.show(snapshot(2),other,false);
  assert.equal(doc.body.children[0].hidden,true);
  assert.equal(doc.body.children[1].hidden,false);
  doc.listeners.keydown.forEach(f=>f({key:'Escape'}));
  assert.equal(doc.body.children[1].hidden,true);
  a.show(entry,card,false);
  doc.listeners.scroll.forEach(f=>f({target:host}));
  assert.equal(doc.body.children[0].hidden,true,'outer scroll dismisses floating preview');
  a.show(entry,card,false);
  doc.listeners.scroll.forEach(f=>f({target:doc.body.children[0]}));
  assert.equal(doc.body.children[0].hidden,false,'reading preview itself must not dismiss it');
  a.destroy();b.destroy();assert.equal(doc.body.children.length,0);
  assert.equal(doc.listeners.keydown.length,0,'no leaked document listeners');
});

test('History → Animation shortlist uses the full preview without affecting reorder/remove',()=>{
  const {doc,host}=fakeDom(),s=snapshot(),calls=[];
  history.renderStoryboardQueue(doc,host,[s.id],[s],{move(){},remove(id){calls.push(id);}});
  const card=collect(host,n=>n.className==='modern-history-storyboard-item')[0];
  assert.ok(card.listeners.mouseover?.length);
  host.__thumbnailPreview.show(s,card,false);
  assert.equal(imageSrc(overlay(doc)),s.thumbnail.dataUrl);
  send(card.children[0],'click',{stopPropagation(){}});
  assert.deepEqual(calls,[s.id]);
  history.renderStoryboardQueue(doc,host,[s.id],[s],{move(){},remove(){}});
  assert.equal(doc.body.children.length,1,'rerender replaces rather than duplicates the overlay');
  host.__thumbnailPreview.destroy();
});

test('Snapshot Picker and timeline keyframes use one inspector per host and saved History images',()=>{
  const {doc,host}=fakeDom(),s=snapshot(),actions={};
  studio.renderPicker(doc,host,[s],actions,{open:true});
  const picker=collect(host,n=>n.className==='modern-studio-picker-card')[0];
  assert.ok(picker.listeners.mouseover?.length);
  host.__thumbnailPreview.show(s,picker,false);
  assert.equal(imageSrc(overlay(doc)),s.thumbnail.dataUrl);
  studio.renderPicker(doc,host,[s],actions,{open:false});
  assert.equal(doc.body.children.length,0,'closing picker removes its inspector');
  const frame={key:'history-1',name:'Frame 1',sourceSnapshotId:s.id,experiment:s.experiment,
    travelMs:0,holdMs:1000,easing:'linear'};
  const draft={frames:[frame],mode:'auto',target:'auto',name:'Test',description:'',activeFrameKeys:null};
  studio.render(doc,host,draft,{compatible:false,issues:[],transitions:[]},{},false,
    {entries:[s]});
  const keyframe=collect(host,n=>n.className.includes('modern-studio-keyframe')&&n.tagName==='button')[0];
  assert.ok(keyframe.listeners.mouseover?.length);
  assert.equal(collect(host,n=>n.className==='modern-studio-staged-card').length,0,
    'staging no longer creates redundant thumbnail cards');
  const ctrl=host.__thumbnailPreview;
  ctrl.show(s,keyframe,false);assert.equal(imageSrc(overlay(doc)),s.thumbnail.dataUrl);
  assert.equal(doc.body.children.length,1,'same overlay is reused after picker closes');
  ctrl.destroy();
});

test('Animation Library card uses saved project thumbnail and preserves click controls',()=>{
  const {doc,host}=fakeDom(),s=snapshot(),calls=[];
  const entry={id:'study',thumbnail:s.thumbnail,updatedAt:1760000000000,
    project:{name:'My project',description:'Full preview',mode:'camera',
      baseExperiment:s.experiment,keyframes:[{travelMs:1000,holdMs:500}],target:null}};
  const actions={select:id=>calls.push('select:'+id),open:id=>calls.push('open:'+id),
    renameStart(){},remove(){}};
  studio.renderLibrary(doc,host,[entry],{},actions);
  const card=collect(host,n=>n.className.startsWith('modern-animation-library-card')&&n.tagName==='article')[0];
  assert.ok(card.listeners.mouseover?.length);
  host.__thumbnailPreview.show({name:'My project',source:'Animation Library',
    experiment:s.experiment,thumbnail:s.thumbnail},card,false);
  assert.equal(imageSrc(overlay(doc)),s.thumbnail.dataUrl);
  const open=collect(card,n=>n.tagName==='button'&&n.textContent==='Open')[0];
  send(card,'mouseover',{target:open});
  assert.ok(overlay(doc).hidden||overlay(doc).role==='tooltip');
  send(open,'click');assert.deepEqual(calls,['open:study']);
  assert.equal(doc.body.children.length,1);
  studio.renderLibrary(doc,host,[entry],{},actions);
  assert.equal(doc.body.children.length,1);
  host.__thumbnailPreview.destroy();
});


test('Keyframe and Library selection focus do not open a surprise tooltip; P pins deliberately',()=>{
  const {doc,host}=fakeDom(),entry=snapshot();
  const ctrl=preview.create(doc,host,history.inspectorMarkup),card=doc.createElement('button');
  ctrl.bind(card,entry,card,{keyboardPin:false,focusPreview:false});
  card.focus();assert.equal(overlay(doc).hidden,true,'programmatic focus does not open preview');
  send(card,'keydown',{key:'p',target:card,preventDefault(){}});
  assert.equal(overlay(doc).role,'dialog','P opens a pinned, keyboard-accessible preview');
  ctrl.destroy();
  const child=doc.createElement('button'),second=preview.create(doc,host,history.inspectorMarkup);
  second.bind(child,entry,child);
  second.destroy();
  send(child,'click',{pointerType:'touch',target:child});
  assert.equal(doc.body.children.length,0,'stale card handlers cannot reopen destroyed popups');
});

test('Thumbnail-less imported camera frames show metadata instead of a fabricated image',()=>{
  const {doc,host}=fakeDom(),entry=snapshot(19,false),card=doc.createElement('div');
  const ctrl=preview.create(doc,host,history.inspectorMarkup);ctrl.show(entry,card,false);
  assert.equal(imageSrc(overlay(doc)),undefined);
  assert.ok(collect(overlay(doc),n=>String(n.textContent).includes('No screenshot saved')).length);
  assert.ok(collect(overlay(doc),n=>String(n.textContent).includes('Camera height')).length);
  ctrl.destroy();
});

test('Audit inventories remaining thumbnail galleries without changing Legacy',()=>{
  const file=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const old=fs.readFileSync(path.join(root,'CurvatureApp.html'),'utf8');
  const ui=fs.readFileSync(path.join(root,'src/ui/modern/ModernAnimationStudioUI.js'),'utf8');
  const hist=fs.readFileSync(path.join(root,'src/ui/modern/ModernExperimentHistoryUI.js'),'utf8');
  assert.ok(file.indexOf('ModernThumbnailPreview.js')<file.indexOf('ModernExperimentHistoryUI.js'));
  assert.match(ui,/inspector\.bind\(card,libraryPreviewEntry\(entry\)/);
  assert.match(ui,/inspector\.bind\(item,entry,item\)/);
  assert.doesNotMatch(ui,/modern-studio-staged-card/);
  assert.match(ui,/inspector\.bind\(pick,/);
  assert.match(hist,/inspector\.bind\(item,entry,item\)/);
  assert.match(hist,/inspector\.hover\(entry,card,select\)/);
  assert.doesNotMatch(old,/ModernThumbnailPreview/);
});

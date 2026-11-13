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
function info(parent){return collect(parent,n=>n.className==='modern-card-info-button')[0];}
function click(node){send(node,'click',{target:node,stopPropagation(){}});}

// A single details renderer is reused by every saved card, without optics calls.
test('Details are click-only and never appear on card, hover, mouse or keyboard selection',()=>{
  const {doc,host}=fakeDom(),entry=snapshot(),card=doc.createElement('li');
  host.appendChild(card);
  const ctrl=preview.create(doc,host,history.inspectorMarkup);
  const trigger=ctrl.infoButton(card,entry,card);
  send(card,'mouseover',{target:card});send(card,'mouseenter',{target:card});
  send(card,'focus',{});click(card);
  assert.equal(overlay(doc).hidden,true,'hover, focus or selecting card do not open details');
  click(trigger);
  assert.equal(overlay(doc).role,'dialog');
  assert.equal(overlay(doc).hidden,false);
  assert.equal(trigger['aria-expanded'],'true');
  assert.equal(imageSrc(overlay(doc)),entry.thumbnail.dataUrl);
  assert.ok(parseInt(overlay(doc).style.left,10)<720,'dialog flips at right viewport edge');
  assert.ok(parseInt(overlay(doc).style.top,10)<500,'dialog clamps vertically');
  click(trigger);
  assert.equal(overlay(doc).hidden,true,'second click closes dialog');
  assert.equal(trigger['aria-expanded'],'false');
  ctrl.destroy();assert.equal(doc.body.children.length,0);
});

test('One dialog across galleries, close, Escape, outside click, scroll, drag and cleanup',()=>{
  const {doc,host}=fakeDom(),other=doc.createElement('section');
  const a=preview.create(doc,host,history.inspectorMarkup),b=preview.create(doc,other,history.inspectorMarkup);
  const card=doc.createElement('article'),entry=snapshot(),trigger=a.infoButton(card,entry,card);
  click(trigger);
  assert.equal(overlay(doc).hidden,false);
  b.show(snapshot(2),other);
  assert.equal(doc.body.children[0].hidden,true,'opening another gallery closes old dialog');
  assert.equal(doc.body.children[1].hidden,false);
  doc.listeners.keydown.forEach(f=>f({key:'Escape'}));
  assert.equal(doc.body.children[1].hidden,true);
  click(trigger);
  doc.listeners.click.forEach(f=>f({target:other}));
  assert.equal(doc.body.children[0].hidden,true,'outside click closes');
  click(trigger);
  doc.listeners.dragstart.forEach(f=>f({target:host}));
  assert.equal(doc.body.children[0].hidden,true,'drag closes before drop');
  click(trigger);
  doc.listeners.scroll.forEach(f=>f({target:host}));
  assert.equal(doc.body.children[0].hidden,true,'gallery scroll closes');
  click(trigger);
  doc.listeners.scroll.forEach(f=>f({target:doc.body.children[0]}));
  assert.equal(doc.body.children[0].hidden,false,'reading panel itself does not dismiss it');
  const close=collect(overlay(doc),n=>n.className==='modern-history-inspector-close')[0];
  click(close);assert.equal(overlay(doc).hidden,true);
  a.destroy();b.destroy();assert.equal(doc.body.children.length,0);
  assert.equal(doc.listeners.keydown.length,0);
  assert.equal(doc.listeners.dragstart.length,0);
});

test('Info button stops bubbling and cannot initiate selection, double-click or drag',()=>{
  const {doc,host}=fakeDom(),card=doc.createElement('article'),entry=snapshot();
  const ctrl=preview.create(doc,host,history.inspectorMarkup);
  const trigger=ctrl.infoButton(card,entry,card),types=['pointerdown','mousedown','dblclick','dragstart','click'];
  assert.equal(trigger.draggable,false);
  for(const type of types){
    let stopped=false,prevented=false;
    send(trigger,type,{stopPropagation(){stopped=true;},preventDefault(){prevented=true;}});
    assert.equal(stopped,true,type+' must not bubble to card selection / drag');
    if(type==='dragstart')assert.equal(prevented,true);
  }
  assert.equal(overlay(doc).hidden,false,'button click opens panel');
  ctrl.destroy();
});

test('History and shortlist expose buttons without changing selection/restore/remove',()=>{
  const {doc,host}=fakeDom(),s=snapshot(),calls=[];
  history.render(doc,host,[s],null,{select:id=>calls.push('select:'+id),
    restore:id=>calls.push('restore:'+id),pin(){},remove(){},multi(){}},{},{});
  const card=collect(host,n=>n.className.startsWith('modern-history-card')&&n.tagName==='article')[0];
  assert.ok(info(card));
  send(card,'mouseover',{target:card});assert.equal(overlay(doc).hidden,true);
  click(info(card));assert.equal(imageSrc(overlay(doc)),s.thumbnail.dataUrl);
  assert.deepEqual(calls,[],'info does not select or restore the snapshot');
  host.__historyInspector.destroy();host.__historyInspector=null;
  history.renderStoryboardQueue(doc,host,[s.id],[s],{move(){},remove(id){calls.push('remove:'+id);}});
  const item=collect(host,n=>n.className==='modern-history-storyboard-item')[0];
  click(info(item));assert.equal(imageSrc(overlay(doc)),s.thumbnail.dataUrl);
  send(item.children[0],'click',{stopPropagation(){}});
  assert.deepEqual(calls,['remove:'+s.id]);
  history.renderStoryboardQueue(doc,host,[s.id],[s],{move(){},remove(){}});
  assert.equal(doc.body.children.length,1,'rerender replaces and destroys previous dialog');
  host.__thumbnailPreview.destroy();
});

test('Snapshot Picker and timeline keyframes expose explicit info controls',()=>{
  const {doc,host}=fakeDom(),s=snapshot();
  studio.renderPicker(doc,host,[s],{}, {open:true});
  const picker=collect(host,n=>n.className==='modern-studio-picker-card')[0];
  assert.ok(info(picker));
  send(picker,'mouseover',{target:picker});assert.equal(overlay(doc).hidden,true);
  click(info(picker));assert.equal(imageSrc(overlay(doc)),s.thumbnail.dataUrl);
  studio.renderPicker(doc,host,[s],{}, {open:false});
  assert.equal(doc.body.children.length,0,'closing picker removes dialog');
  const frame={key:'history-1',name:'Frame 1',sourceSnapshotId:s.id,experiment:s.experiment,
    travelMs:0,holdMs:1000,easing:'linear'};
  const draft={frames:[frame],mode:'auto',target:'auto',name:'Test',description:'',activeFrameKeys:null};
  studio.render(doc,host,draft,{compatible:false,issues:[],transitions:[]},{},false,{entries:[s]});
  const timeline=collect(host,n=>n.className==='modern-studio-filmstrip-item')[0];
  assert.ok(info(timeline),'info button sits outside the keyframe selection button');
  click(info(timeline));assert.equal(imageSrc(overlay(doc)),s.thumbnail.dataUrl);
  host.__thumbnailPreview.destroy();
});

test('Animation Library info uses project image and does not invoke Open or Select',()=>{
  const {doc,host}=fakeDom(),s=snapshot(),calls=[];
  const entry={id:'study',thumbnail:s.thumbnail,updatedAt:1760000000000,
    project:{name:'My project',description:'Full preview',mode:'camera',
      baseExperiment:s.experiment,keyframes:[{travelMs:1000,holdMs:500}],target:null}};
  const actions={select:id=>calls.push('select:'+id),open:id=>calls.push('open:'+id),
    renameStart(){},remove(){}};
  studio.renderLibrary(doc,host,[entry],{},actions);
  const card=collect(host,n=>n.className.startsWith('modern-animation-library-card')&&n.tagName==='article')[0];
  assert.ok(info(card));
  click(info(card));assert.equal(imageSrc(overlay(doc)),s.thumbnail.dataUrl);
  assert.deepEqual(calls,[]);
  const open=collect(card,n=>n.tagName==='button'&&n.textContent==='Open')[0];
  send(open,'click');assert.deepEqual(calls,['open:study']);
  studio.renderLibrary(doc,host,[entry],{},actions);
  assert.equal(doc.body.children.length,1);
  host.__thumbnailPreview.destroy();
});

test('Imported frames without screenshots show metadata, not a fabricated image',()=>{
  const {doc,host}=fakeDom(),entry=snapshot(19,false),card=doc.createElement('div');
  const ctrl=preview.create(doc,host,history.inspectorMarkup);
  click(ctrl.infoButton(card,entry,card));
  assert.equal(imageSrc(overlay(doc)),undefined);
  assert.ok(collect(overlay(doc),n=>String(n.textContent).includes('No screenshot saved')).length);
  assert.ok(collect(overlay(doc),n=>String(n.textContent).includes('Camera height')).length);
  ctrl.destroy();
});

test('All five galleries use the shared details control; Legacy is untouched',()=>{
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const old=fs.readFileSync(path.join(root,'CurvatureApp.html'),'utf8');
  const ui=fs.readFileSync(path.join(root,'src/ui/modern/ModernAnimationStudioUI.js'),'utf8');
  const hist=fs.readFileSync(path.join(root,'src/ui/modern/ModernExperimentHistoryUI.js'),'utf8');
  assert.ok(html.indexOf('ModernThumbnailPreview.js')<html.indexOf('ModernExperimentHistoryUI.js'));
  assert.match(ui,/inspector\.infoButton\(card,libraryPreviewEntry\(entry\)/);
  assert.match(ui,/inspector\.infoButton\(item,entry,item/);
  assert.match(ui,/inspector\.infoButton\(item,\{name:frame\.name/);
  assert.match(hist,/inspector\.infoButton\(card,entry,card/);
  assert.match(hist,/inspector\.infoButton\(item,entry,item/);
  assert.doesNotMatch(hist,/inspector\.hover\(/);
  assert.doesNotMatch(old,/ModernThumbnailPreview/);
});

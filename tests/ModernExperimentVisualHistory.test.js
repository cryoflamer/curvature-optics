'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const thumbnail=require('../src/ui/modern/ModernExperimentThumbnail');
const ui=require('../src/ui/modern/ModernExperimentHistoryUI');
const root=path.resolve(__dirname,'..');
function canvas(width=800,height=500){return {width,height};}
function outputDoc(options={}){
  const operations=[];
  const ctx={drawImage(...args){operations.push(['draw',...args]);if(options.tainted)throw Error('Tainted canvas');},
    fillRect(...args){operations.push(['fill',...args]);},fillText(...args){operations.push(['text',...args]);}};
  return {operations,createElement(name){
    if(name!=='canvas')throw Error('Canvas-only document');
    return {width:0,height:0,getContext(){return ctx;},toDataURL(type){
      operations.push(['export',type]);return options.invalid?'data:text/html,x':
        'data:image/webp;base64,YQ==';}};
  }};
}
test('Scene captures one completed real Canvas image with bounded data, dimensions and format',()=>{
  const doc=outputDoc();
  const captured=thumbnail.capture(doc,'scene',[{layers:[canvas()]}]);
  assert.deepEqual(captured,{dataUrl:'data:image/webp;base64,YQ==',width:480,height:300,mode:'scene'});
  assert.deepEqual(thumbnail.validate(captured,'scene'),captured);
  assert.equal(doc.operations.filter(x=>x[0]==='draw').length,1);
  assert.equal(doc.operations.filter(x=>x[0]==='text').length,0);
  assert.deepEqual(doc.operations.filter(x=>x[0]==='export').map(x=>x[1]),['image/webp']);
});
test('Thumbnail uses source aspect ratio without drawing artificial dark padding',()=>{
  const doc=outputDoc(),wide=canvas(1200,400);
  const snap=thumbnail.capture(doc,'scene',[{layers:[wide]}]);
  assert.equal(snap.width,480);
  assert.equal(snap.height,160);
  assert.equal(doc.operations.filter(op=>op[0]==='fill').length,0);
  assert.deepEqual(doc.operations.filter(op=>op[0]==='draw')[0].slice(2),[0,0,480,160]);
  const tall=thumbnail.capture(outputDoc(),'scene',[{layers:[canvas(400,800)]}]);
  assert.equal(tall.width,150);
  assert.equal(tall.height,300);
});
test('Compare composites both distinct A/B Canvas sources and retains guide overlays',()=>{
  const doc=outputDoc(),a=canvas(),b=canvas(),guides=canvas();
  const captured=thumbnail.capture(doc,'compare',[{layers:[a,guides]},{layers:[b]}]);
  assert.equal(captured.width,960);assert.equal(captured.mode,'compare');
  assert.deepEqual(doc.operations.filter(x=>x[0]==='draw').map(x=>x[1]),[a,guides,b]);
  assert.deepEqual(doc.operations.filter(x=>x[0]==='text').map(x=>x[1]),['A','B']);
  assert.notDeepEqual(doc.operations.filter(x=>x[0]==='draw')[0].slice(2),
    doc.operations.filter(x=>x[0]==='draw')[2].slice(2));
});
test('Per-side render keys reject stale A/B images but retain unchanged opposite side',()=>{
  const e={scene:{camera:{Height:10},objects:{NObjects:[20,2]},showGrid:true,
    surface:{showModel:1,rEarth:6371000}},
    compare:{A:{surface:'globe',atmosphere:'standard'},B:{surface:'flat',atmosphere:'standard'}},
    display:{eyeLevel:false,horizon:true}};
  const a=thumbnail.viewKey(e,'A'),b=thumbnail.viewKey(e,'B');
  e.compare.A.atmosphere='vacuum';
  assert.notEqual(thumbnail.viewKey(e,'A'),a);
  assert.equal(thumbnail.viewKey(e,'B'),b,'B remains current after A-only edit');
  e.scene.camera.Height=20;
  assert.notEqual(thumbnail.viewKey(e,'B'),b,'camera changes invalidate both images');
  assert.throws(()=>thumbnail.viewKey(e,'C'),/Unknown screenshot viewport/);
});
test('Missing/inconsistent/tainted/non-exportable Canvas never substitutes a screenshot',()=>{
  assert.equal(thumbnail.capture(outputDoc(),'compare',[{layers:[canvas()]}]),null);
  assert.equal(thumbnail.capture(outputDoc(),'scene',[{layers:[]}]),null);
  assert.equal(thumbnail.capture(outputDoc(),'scene',[{layers:[canvas(),canvas(40,50)]}]),null);
  assert.equal(thumbnail.capture(outputDoc({tainted:true}),'scene',[{layers:[canvas()]}]),null);
  assert.equal(thumbnail.capture(outputDoc({invalid:true}),'scene',[{layers:[canvas()]}]),null);
  assert.equal(thumbnail.validate(null,'scene'),null);
  assert.throws(()=>thumbnail.validate({dataUrl:'javascript:alert(1)',mode:'scene',width:320,height:200},'scene'),
    /Invalid experiment thumbnail/);
  assert.throws(()=>thumbnail.validate({dataUrl:'data:image/webp;base64,YQ==',mode:'scene',width:320,height:200},'compare'),
    /Invalid experiment thumbnail/);
});
function dom(){
  const events=[];
  const doc={createElement(name){
    return {tagName:name,children:[],listeners:{},style:{},textContent:'',hidden:false,
      appendChild(child){this.children.push(child);return child;},
      setAttribute(key,value){this[key]=value;},
      getAttribute(key){return this[key];},
      addEventListener(name,callback){this.listeners[name]=callback;}};
  }};
  return {doc,events};
}
function entry(id,mode,image){return {id,source:'manual',pinned:false,createdAt:1700000000000,
  thumbnail:image?{mode,dataUrl:'data:image/webp;base64,YQ=='}:null,
  features:{mode,scene:{geometry:{kind:'flat'}},relations:{physicsSame:false,geometrySame:true}},
  experiment:{display:{mode}}};}
test('Visual gallery selects, previews, pins and deletes via explicit actions only',()=>{
  const {doc}=dom(),host=doc.createElement('div'),calls=[];
  const actions={select:id=>calls.push(['select',id]),preview:id=>calls.push(['preview',id]),
    multi:(id,value)=>calls.push(['multi',id,value]),
    pin:(id,value)=>calls.push(['pin',id,value]),remove:id=>calls.push(['remove',id])};
  ui.render(doc,host,[entry(1,'scene',true),entry(2,'compare',false)],2,actions,{2:true});
  assert.equal(host.children.length,2);
  const one=host.children[0],two=host.children[1];
  assert.equal(two.className.includes('is-selected'),true);
  assert.equal(two.children[1].children[4].children[0].checked,true);
  ui.select(host,1);
  assert.equal(one.className.includes('is-selected'),true);
  assert.equal(two.className.includes('is-selected'),false);
  assert.equal(one.children[0].children[0].tagName,'img');
  assert.match(two.children[0].children[0].textContent,/No preview/);
  one.children[0].listeners.click();
  const buttons=one.children[1].children[2].children;
  for(const b of buttons)b.listeners.click({stopPropagation(){}});
  one.children[1].children[4].children[0].checked=true;
  one.children[1].children[4].children[0].listeners.change();
  assert.deepEqual(calls,[['select',1],['preview',1],['pin',1,true],['remove',1],['multi',1,true]]);
  const dialog=doc.createElement('dialog');dialog.hidden=true;
  ui.preview(doc,dialog,entry(1,'scene',true));
  assert.equal(dialog.hidden,false);
  assert.equal(dialog.children[1].tagName,'img');
  ui.close(dialog);assert.equal(dialog.hidden,true);
  ui.preview(doc,dialog,entry(1,'scene',true));
  assert.equal(dialog.hidden,false,'a reopened preview must not stay hidden');
});
test('History gallery S/M/L, double-click restore and action isolation',()=>{
  const {doc}=dom(),host=doc.createElement('div'),calls=[];
  const actions={select:id=>calls.push(['select',id]),restore:id=>calls.push(['restore',id]),
    preview:id=>calls.push(['preview',id]),pin:(id,value)=>calls.push(['pin',id,value]),
    remove:id=>calls.push(['remove',id]),multi:(id,value)=>calls.push(['multi',id,value])};
  ui.setSize(host,'medium');assert.equal(host['data-size'],'medium');
  ui.setSize(host,'large');assert.equal(host['data-size'],'large');
  ui.setSize(host,'bogus');assert.equal(host['data-size'],'small');
  ui.render(doc,host,[entry(10,'scene',true)],10,actions,{});
  const card=host.children[0],thumbnail=card.children[0],body=card.children[1];
  const menu=body.children[3],checkbox=body.children[4];
  thumbnail.listeners.click({stopPropagation(){}});
  thumbnail.listeners.dblclick({stopPropagation(){calls.push('thumbnail-stop');}});
  card.listeners.dblclick({target:{closest(){return null;}}});
  thumbnail.listeners.keydown({key:'Enter',preventDefault(){calls.push(['preventDefault']);}});
  assert.deepEqual(calls,[['select',10],'thumbnail-stop',['restore',10],['restore',10],
    ['preventDefault'],['restore',10]]);
  card.listeners.dblclick({target:{closest(){return menu;}}});
  card.listeners.dblclick({target:{closest(){return checkbox;}}});
  card.listeners.click({target:{closest(){return checkbox;}}});
  assert.equal(calls.length,6,'checkbox or menu never initiates restore/selection');
  menu.children[1].children[0].listeners.click({stopPropagation(){}});
  assert.deepEqual(calls.pop(),['preview',10],'compact actions remain operational');
  menu.children[1].children[1].listeners.dblclick({stopPropagation(){calls.push('stopped');}});
  assert.equal(calls.pop(),'stopped','action double-click cannot bubble');
});

test('Visual History loaded before Modern app; restore guards remain and thumbnails stay outside experiment JSON',()=>{
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  assert.ok(html.indexOf('ModernExperimentThumbnail.js')<html.indexOf('ModernExperimentHistory.js'));
  assert.ok(html.indexOf('ModernExperimentHistoryUI.js')<html.indexOf('ModernApp.js'));
  for(const id of ['ModernHistoryGallery','ModernHistoryPreview','ModernHistoryPin','ModernHistoryClearAll','ModernHistorySort','ModernHistoryMultiCount','ModernHistoryDeleteChecked','ModernHistorySize'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(app,/historyRenderedKeys\[view\]!==historyViewKey\(snapshot,view\)/);
  assert.match(app,/restore:function\(id\)\{handleHistoryRestore\(id\);\}/);
  assert.match(app,/historyGallerySize=remembered.historyGallerySize/);
  assert.match(app,/effectiveOpticalQuality\(\)!=='accurate'/);
  assert.match(app,/experimentHistory\.record\(current,'recovery',historyThumbnail\(current\)\)/);
  assert.match(app,/if\(!entry\)throw RangeError\('History snapshot not found'\)/);
});

test('Snapshot inspector reports active Scene/Compare physics and meaningful A/B differences',()=>{
  const model={Height:15,FocalLengthField:2000,Pan:12,Nick:-2,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Test',Description:'',
    ObjType:[3,2],NObjects:[85,1],ObjDist:[50,20000],ObjDeltaDist:[297.55,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  const state=require('../src/ui/modern/ModernExperimentState');
  const compare=require('../src/ui/modern/ModernCompareState');
  const fp=require('../src/ui/modern/ModernExperimentFingerprint');
  const experiment=state.capture(model,{atmosphere:'vacuum',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},compare.preset('globe-flat-vacuum'),
  {mode:'compare',eyeLevel:false,horizon:true,selected:'A'});
  experiment.compare.A.atmosphere='standard';
  experiment.compare.B.atmosphere='temperature-lapse';
  experiment.compare.B.temperatureProfile.gradientKPerKm=7;
  const snapshot={id:1,source:'manual',createdAt:1700000000000,
    experiment,features:fp.features(experiment)};
  const result=ui.inspect(snapshot);
  assert.equal(result.mode,'compare');
  assert.match(result.A.find(row=>row[0]==='Surface')[1],/Globe.*6,371 km/);
  assert.match(result.B.find(row=>row[0]==='Surface')[1],/Flat/);
  assert.deepEqual(result.B.find(row=>row[0]==='Gradient'),['Gradient','7 K/km']);
  assert.ok(!result.A.some(row=>row[0]==='Gradient'),'Standard has no lapse-gradient control');
  assert.deepEqual(result.relations,['Different geometry','Different atmosphere models']);
  assert.match(result.shared.find(row=>row[0]==='Objects')[1],/85.*transmission tower/);
  assert.match(result.shared.find(row=>row[0]==='Camera height')[1],/15 m/);
  experiment.compare.B.surface='globe';
  experiment.compare.B.radiusKm=experiment.compare.A.radiusKm;
  experiment.compare.B.atmosphere='standard';
  snapshot.features=fp.features(experiment);
  assert.deepEqual(ui.inspect(snapshot).relations,['Identical physical settings']);
  experiment.display.mode='scene';
  snapshot.features=fp.features(experiment);
  const scene=ui.inspect(snapshot);
  assert.equal(scene.mode,'scene');assert.equal(scene.B,undefined);
  assert.deepEqual(scene.A.find(row=>row[0]==='Atmosphere'),['Atmosphere','Vacuum']);
  assert.ok(!scene.A.some(row=>row[0]==='Gradient'),'Inactive Vacuum gradient is hidden');
});

function inspectorDom(){
  const doc={listeners:{},defaultView:{innerWidth:800,innerHeight:560,
    listeners:{},addEventListener(name,callback){this.listeners[name]=callback;},
    removeEventListener(name){delete this.listeners[name];}},
    addEventListener(name,callback){this.listeners[name]=callback;},
    removeEventListener(name){delete this.listeners[name];}};
  function element(name){
    return {tagName:name,children:[],listeners:{},style:{},textContent:'',hidden:false,
      setAttribute(key,value){this[key]=value;},getAttribute(key){return this[key];},
      addEventListener(key,callback){this.listeners[key]=callback;},
      removeEventListener(key){delete this.listeners[key];},
      appendChild(child){child.parentNode=this;this.children.push(child);return child;},
      removeChild(child){this.children.splice(this.children.indexOf(child),1);child.parentNode=null;},
      contains(child){return this===child||this.children.some(item=>item.contains(child));},
      getBoundingClientRect(){return this.className==='modern-history-inspector'?
        {left:0,right:480,top:0,bottom:310,width:480,height:310}:
        {left:620,right:770,top:460,bottom:535,width:150,height:80};}};
  }
  doc.createElement=element;doc.body=element('body');return doc;
}
test('Hover inspector delays, stays viewport-bound, supports Info and Escape without Restore',async()=>{
  const doc=inspectorDom(),host=doc.createElement('div'),calls=[];
  const actions={select:id=>calls.push(['select',id]),restore:id=>calls.push(['restore',id]),
    preview:()=>{},pin:()=>{},remove:()=>{},multi:()=>{}};
  const cardEntry=entry(1,'compare',true);
  cardEntry.experiment.scene={camera:{Height:15,Pan:0,Nick:0},objects:{NObjects:[1,0],ObjType:[3,0]},
    surface:{showModel:1,rEarth:6371000},atmosphere:'standard'};
  cardEntry.experiment.compare={A:{surface:'globe',radiusKm:6371,atmosphere:'standard'},
    B:{surface:'flat',radiusKm:6371,atmosphere:'vacuum'}};
  cardEntry.features.relations={geometrySame:false,atmosphereSame:false,refractionSame:false,physicsSame:false};
  ui.render(doc,host,[cardEntry],1,actions,{});
  const overlay=doc.body.children[0],card=host.children[0];
  assert.equal(overlay.hidden,true);
  card.listeners.mouseenter();
  assert.equal(overlay.hidden,true,'hover does not appear immediately');
  await new Promise(resolve=>setTimeout(resolve,390));
  assert.equal(overlay.hidden,false,'tooltip is shown after dwell');
  assert.equal(overlay.role,'tooltip');
  assert.ok(parseInt(overlay.style.left,10)<620,'tooltip flips at right viewport edge');
  assert.ok(parseInt(overlay.style.top,10)<460,'tooltip clamps above bottom edge');
  card.listeners.mouseleave();overlay.listeners.mouseenter();
  await new Promise(resolve=>setTimeout(resolve,180));
  assert.equal(overlay.hidden,false,'pointer over tooltip keeps it open');
  const info=card.children[1].children[1].children[0];
  assert.equal(info.className,'modern-history-info');
  info.listeners.click({stopPropagation(){}});
  assert.equal(overlay.role,'dialog','Info pins inspector for touch users');
  card.listeners.dblclick({target:{closest(selector){return selector.includes('.modern-history-info')?info:null;}}});
  assert.equal(calls.length,0,'Info never restores a snapshot');
  doc.listeners.keydown({key:'Escape'});assert.equal(overlay.hidden,true);
  ui.render(doc,host,[cardEntry],1,actions,{});
  assert.equal(doc.body.children.length,1,'rerender destroys previous overlay');
  assert.equal(host.__historyInspector!==null,true);
  ui.hideInspector(host);assert.equal(doc.body.children[0].hidden,true);
});

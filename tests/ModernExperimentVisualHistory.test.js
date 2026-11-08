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
  assert.equal(two.children[1].children[3].children[0].checked,true);
  ui.select(host,1);
  assert.equal(one.className.includes('is-selected'),true);
  assert.equal(two.className.includes('is-selected'),false);
  assert.equal(one.children[0].children[0].tagName,'img');
  assert.match(two.children[0].children[0].textContent,/No preview/);
  one.children[0].listeners.click();
  const buttons=one.children[1].children[2].children;
  for(const b of buttons)b.listeners.click({stopPropagation(){}});
  one.children[1].children[3].children[0].checked=true;
  one.children[1].children[3].children[0].listeners.change();
  assert.deepEqual(calls,[['select',1],['preview',1],['pin',1,true],['remove',1],['multi',1,true]]);
  const dialog=doc.createElement('dialog');dialog.hidden=true;
  ui.preview(doc,dialog,entry(1,'scene',true));
  assert.equal(dialog.hidden,false);
  assert.equal(dialog.children[1].tagName,'img');
  ui.close(dialog);assert.equal(dialog.hidden,true);
  ui.preview(doc,dialog,entry(1,'scene',true));
  assert.equal(dialog.hidden,false,'a reopened preview must not stay hidden');
});
test('Visual History loaded before Modern app; restore guards remain and thumbnails stay outside experiment JSON',()=>{
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  assert.ok(html.indexOf('ModernExperimentThumbnail.js')<html.indexOf('ModernExperimentHistory.js'));
  assert.ok(html.indexOf('ModernExperimentHistoryUI.js')<html.indexOf('ModernApp.js'));
  for(const id of ['ModernHistoryGallery','ModernHistoryPreview','ModernHistoryPin','ModernHistoryClearAll','ModernHistorySort','ModernHistoryMultiCount','ModernHistoryDeleteChecked'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(app,/historyRenderedKeys\[view\]!==historyViewKey\(snapshot,view\)/);
  assert.match(app,/effectiveOpticalQuality\(\)!=='accurate'/);
  assert.match(app,/experimentHistory\.record\(current,'recovery',historyThumbnail\(current\)\)/);
  assert.match(app,/if\(!entry\)throw RangeError\('History snapshot not found'\)/);
});

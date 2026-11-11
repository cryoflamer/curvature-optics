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
    fillRect(...args){operations.push(['fill',this.fillStyle,...args]);},fillText(...args){operations.push(['text',...args]);}};
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
  assert.deepEqual(doc.operations[0],['fill','#fff',0,0,480,300],
    'opaque white viewport background must precede transparent physical pixels');
  assert.equal(doc.operations.filter(x=>x[0]==='text').length,0);
  assert.deepEqual(doc.operations.filter(x=>x[0]==='export').map(x=>x[1]),['image/webp']);
});
test('Thumbnail uses source aspect ratio with the displayed white Canvas background, without bars',()=>{
  const doc=outputDoc(),wide=canvas(1200,400);
  const snap=thumbnail.capture(doc,'scene',[{layers:[wide]}]);
  assert.equal(snap.width,480);
  assert.equal(snap.height,160);
  assert.deepEqual(doc.operations.filter(op=>op[0]==='fill'),
    [['fill','#fff',0,0,480,160]],'white is the viewport backdrop, not a padded border');
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
  assert.deepEqual(doc.operations.filter(x=>x[0]==='fill'&&x[1]==='#fff'),
    [['fill','#fff',0,0,960,300]],'Compare keeps white underneath BOTH transparent views');
  assert.deepEqual(doc.operations.slice(0,3).map(x=>x[0]),['fill','draw','draw'],
    'white backdrop precedes the physical image and transparent guide overlay');
  assert.ok(doc.operations.findIndex(x=>x[0]==='draw'&&x[1]===b)>2,
    'B physical image is composited after A, its guides and label');
  assert.deepEqual(doc.operations.filter(x=>x[0]==='text').map(x=>x[1]),['A','B']);
  assert.notDeepEqual(doc.operations.filter(x=>x[0]==='draw')[0].slice(2),
    doc.operations.filter(x=>x[0]==='draw')[2].slice(2));
});
test('Thumbnail transparency matches the live white Modern viewport and legacy alpha images are displayed consistently',()=>{
  const css=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.css'),'utf8');
  const painter=fs.readFileSync(path.join(root,'src/renderers/CurvatureLegacyOrderPreview.js'),'utf8');
  assert.match(painter,/ctx\.clearRect\(0,0,canvas\.width,canvas\.height\)/,
    'the physical painter clears to transparent instead of painting a background');
  assert.match(css,/\.modern-graph-host canvas\{[^}]*background:white/,
    'the live physical viewport supplies the missing white backdrop through CSS');
  assert.match(css,/\.modern-history-card-select\.has-preview\{background:#fff\}/,
    'previously stored alpha thumbnails display over white without IDB migration');
  assert.match(css,/\.modern-history-preview-image\{[^}]*background:#fff/,
    'enlarged previews also display older alpha images over white');
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
      addEventListener(name,callback){this.listeners[name]=callback;},
      querySelectorAll(selector){
        const found=[];
        function walk(node){for(const child of node.children){
          if(selector.startsWith('.')&&child.className&&
            child.className.split(' ').includes(selector.slice(1)))found.push(child);
          walk(child);
        }}walk(this);return found;
      },
      querySelector(selector){return this.querySelectorAll(selector)[0]||null;}};
  }};
  return {doc,events};
}
function entry(id,mode,image){return {id,source:'manual',pinned:false,createdAt:1700000000000,
  thumbnail:image?{mode,dataUrl:'data:image/webp;base64,YQ=='}:null,
  features:{mode,scene:{geometry:{kind:'flat'}},relations:{physicsSame:false,geometrySame:true}},
  experiment:{display:{mode}}};}
test('Pinned/Recent grouping, action icons, protected deletion and bulk selection',()=>{
  const {doc}=dom(),host=doc.createElement('div'),calls=[];
  const actions={select:id=>calls.push(['select',id]),restore:id=>calls.push(['restore',id]),
    multi:(id,value)=>calls.push(['multi',id,value]),
    pin:(id,value)=>calls.push(['pin',id,value]),remove:id=>calls.push(['remove',id]),
    setPinnedCollapsed:value=>calls.push(['collapse',value])};
  const a=entry(1,'scene',true),b=entry(2,'compare',false),c=entry(3,'scene',true);
  a.pinned=true;
  ui.render(doc,host,[a,b,c],2,actions,{2:true});
  const pinnedSection=host.children[0],recentSection=host.children[1];
  assert.equal(pinnedSection['aria-label'],'Pinned experiments');
  assert.equal(recentSection['aria-label'],'Recent experiments');
  assert.equal(pinnedSection.children[1].children.length,1);
  assert.equal(recentSection.children[1].children.length,2);
  const pinned=pinnedSection.children[1].children[0];
  const recent=recentSection.children[1].children[0];
  assert.equal(pinned['data-snapshot-id'],'1');
  assert.equal(recent['data-snapshot-id'],'2');
  assert.equal(pinned.children[2].disabled,true,'pinned is protected from direct deletion');
  pinned.children[2].listeners.click({stopPropagation(){}});
  assert.equal(calls.length,0);
  pinned.children[1].listeners.click({stopPropagation(){}});
  recent.children[2].listeners.click({stopPropagation(){}});
  recent.children[3].children[2].children[0].children[0].checked=true;
  recent.children[3].children[2].children[0].children[0].listeners.change();
  assert.deepEqual(calls,[['pin',1,false],['remove',2],['multi',2,true]]);
  assert.equal(recent.children[3].children[2].className,'modern-history-card-footer');
  pinnedSection.children[0].children[0].listeners.click({stopPropagation(){}});
  assert.deepEqual(calls.at(-1),['collapse',true]);
  ui.select(host,1);
  assert.match(pinned.className,/is-selected/);
  assert.doesNotMatch(recent.className,/is-selected/);
  assert.equal(pinned.children[0]['aria-pressed'],'true');
  assert.equal(recent.children[0]['aria-pressed'],'false');
  assert.equal(pinned.children[0].children[0].tagName,'img');
  assert.match(recent.children[0].children[0].textContent,/No preview/);
});

test('History S/M/L and double-click/keyboard restore isolate icon and bulk controls',()=>{
  const {doc}=dom(),host=doc.createElement('div'),calls=[];
  const actions={select:id=>calls.push(['select',id]),restore:id=>calls.push(['restore',id]),
    pin:(id,value)=>calls.push(['pin',id,value]),remove:id=>calls.push(['remove',id]),multi:()=>{}};
  ui.setSize(host,'medium');assert.equal(host['data-size'],'medium');
  ui.setSize(host,'large');assert.equal(host['data-size'],'large');
  ui.setSize(host,'bogus');assert.equal(host['data-size'],'small');
  const pinned=entry(10,'scene',true);pinned.pinned=true;
  ui.render(doc,host,[pinned],10,actions,{});
  const card=host.children[0].children[1].children[0],thumbnail=card.children[0];
  const pin=card.children[1],del=card.children[2],checkbox=card.children[3].children[2].children[0];
  assert.match(pin.className,/is-pinned/);
  assert.equal(pin['aria-pressed'],'true');
  assert.equal(del.disabled,true);
  thumbnail.listeners.click({stopPropagation(){}});
  thumbnail.listeners.dblclick({stopPropagation(){calls.push('thumbnail-stop');}});
  thumbnail.listeners.keydown({key:'Enter',preventDefault(){calls.push('preventDefault');}});
  assert.deepEqual(calls,[['select',10],'thumbnail-stop',['restore',10],'preventDefault',['restore',10]]);
  for(const control of [pin,del,checkbox]){
    card.listeners.dblclick({target:{closest(selector){return selector.includes('modern-history-')?control:null;}}});
    card.listeners.click({target:{closest(selector){return selector.includes('modern-history-')?control:null;}}});
  }
  assert.equal(calls.length,5,'action controls never trigger selection or restore');
  pin.listeners.dblclick({stopPropagation(){calls.push('pin-stopped');}});
  del.listeners.dblclick({stopPropagation(){calls.push('delete-stopped');}});
  checkbox.children[0].listeners.dblclick({stopPropagation(){calls.push('checkbox-stopped');}});
  pin.listeners.click({stopPropagation(){}});
  assert.deepEqual(calls.slice(-4),['pin-stopped','delete-stopped','checkbox-stopped',['pin',10,false]]);
});

test('Compact section grids use bounded columns and menu-free minimal controls',()=>{
  const css=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.css'),'utf8');
  assert.match(css,/grid-template-columns:repeat\(auto-fill,minmax\(0,min\(150px,100%\)\)\)/);
  assert.match(css,/data-size="medium"\] \.modern-history-section-grid/);
  assert.match(css,/data-size="large"\] \.modern-history-section-grid/);
  assert.match(css,/\.modern-history-pin\{right:35px\}/);
  assert.match(css,/@media\(hover:none\)\{\.modern-history-pin,\.modern-history-delete:not\(:disabled\)\{opacity:1\}/);
  const {doc}=dom(),host=doc.createElement('div');
  ui.render(doc,host,[entry(3,'compare',true)],3,{
    select(){},restore(){},pin(){},remove(){},multi(){}
  },{});
  const card=host.children[1].children[1].children[0];
  assert.deepEqual(card.children.map(c=>c.className),[
    'modern-history-card-select has-preview','modern-history-pin','modern-history-delete','modern-history-card-body']);
  assert.deepEqual(card.children[3].children.map(c=>c.className),[
    'modern-history-card-title','modern-history-card-meta','modern-history-card-footer']);
  assert.equal(card.children[3].children[2].children[0].className,'modern-history-multi');
});

test('Pinned section can collapse without duplicating snapshots or changing stored pins',()=>{
  const {doc}=dom(),host=doc.createElement('div'),entries=[entry(1,'scene',true),entry(2,'scene',true)];
  entries[0].pinned=true;
  ui.render(doc,host,entries,1,{select(){},pin(){},remove(){},multi(){}},{},{pinnedCollapsed:true});
  assert.equal(host.children[0].children.length,1,'collapsed section does not build cards');
  assert.equal(host.children[0].children[0].children[0]['aria-expanded'],'false');
  assert.equal(host.children[1].children[1].children.length,1,'recent does not duplicate pinned');
  assert.equal(entries[0].pinned,true);
});

test('filtered Pinned has an accurate empty state without changing pinned records',()=>{
  const {doc}=dom(),host=doc.createElement('div'),saved=entry(1,'scene',true);
  saved.pinned=true;
  ui.render(doc,host,[entry(2,'scene',true)],2,
    {select(){},pin(){},remove(){},multi(){}},{},{filtersActive:true,hasPinned:true});
  assert.match(host.children[0].children[1].children[0].textContent,/No pinned snapshots match/);
  assert.equal(saved.pinned,true);
  ui.render(doc,host,[],null,{},null,{emptyFiltered:true});
  assert.match(host.children.at(-1).textContent,/No snapshots match/);
});

test('Visual History loaded before Modern app; restore guards remain and thumbnails stay outside experiment JSON',()=>{
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  assert.ok(html.indexOf('ModernExperimentThumbnail.js')<html.indexOf('ModernExperimentHistory.js'));
  assert.ok(html.indexOf('ModernExperimentHistoryUI.js')<html.indexOf('ModernApp.js'));
  for(const id of ['ModernHistoryGallery','ModernHistoryPin','ModernHistoryClearAll','ModernHistorySort','ModernHistoryMultiCount','ModernHistoryDeleteChecked','ModernHistorySize'])
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
test('Unified preview contains image and physical settings, hover dwell and sticky modes without Restore',async()=>{
  const doc=inspectorDom(),host=doc.createElement('div'),calls=[];
  const actions={select:id=>calls.push(['select',id]),restore:id=>calls.push(['restore',id]),
    pin:()=>{},remove:()=>{},multi:()=>{}};
  const cardEntry=entry(1,'compare',true);
  cardEntry.experiment.scene={camera:{Height:15,Pan:0,Nick:0},objects:{NObjects:[1,0],ObjType:[3,0]},
    surface:{showModel:1,rEarth:6371000},atmosphere:'standard'};
  cardEntry.experiment.compare={A:{surface:'globe',radiusKm:6371,atmosphere:'standard'},
    B:{surface:'flat',radiusKm:6371,atmosphere:'vacuum'}};
  cardEntry.features.relations={geometrySame:false,atmosphereSame:false,refractionSame:false,physicsSame:false};
  ui.render(doc,host,[cardEntry],1,actions,{});
  const overlay=doc.body.children[0],card=host.children[1].children[1].children[0],image=card.children[0];
  assert.equal(overlay.hidden,true);
  image.listeners.mouseenter();
  assert.equal(overlay.hidden,true,'hover is deferred');
  await new Promise(resolve=>setTimeout(resolve,450));
  assert.equal(overlay.hidden,false);
  assert.equal(overlay.role,'tooltip');
  assert.equal(overlay.children[0].children[0].tagName,'img','enlarged screenshot precedes the physics');
  assert.equal(overlay.children[0].children[0].src,cardEntry.thumbnail.dataUrl);
  assert.ok(parseInt(overlay.style.left,10)<620,'preview flips at right viewport edge');
  assert.ok(parseInt(overlay.style.top,10)<460,'preview clamps above bottom edge');
  image.listeners.mouseleave();overlay.listeners.mouseenter();
  await new Promise(resolve=>setTimeout(resolve,180));
  assert.equal(overlay.hidden,false,'pointer over popup keeps it open');
  overlay.children[1].listeners.click({stopPropagation(){}});
  assert.equal(overlay.role,'dialog','Keep open makes the popup persistent');
  overlay.listeners.mouseleave();
  await new Promise(resolve=>setTimeout(resolve,180));
  assert.equal(overlay.hidden,false,'locked preview survives pointer leaving');
  doc.listeners.keydown({key:'Escape'});assert.equal(overlay.hidden,true);
  image.listeners.click({pointerType:'touch'});
  assert.equal(overlay.role,'dialog','touch opens persistent preview');
  assert.equal(overlay.hidden,false);
  image.listeners.keydown({key:' ',preventDefault(){}});
  assert.equal(overlay.role,'dialog','Space also pins the keyboard preview');
  for(const ctrl of [card.children[1],card.children[2]]){
    card.listeners.dblclick({target:{closest(){return ctrl;}}});
  }
  assert.equal(calls.length,0,'pin and delete do not restore experiments');
  ui.hideInspector(host);assert.equal(overlay.hidden,true);
  ui.render(doc,host,[cardEntry],1,actions,{});
  assert.equal(doc.body.children.length,1,'rerender destroys previous overlay');
});

test('Named history cards keep physical classification and edit without Restore',()=>{
  const {doc}=dom(),host=doc.createElement('div'),calls=[];
  const saved=entry(31,'compare',false);
  saved.name='  Geometry check  ';saved.description='Why this snapshot matters';
  assert.equal(ui.displayName(saved),'  Geometry check  ');
  assert.match(ui.label(saved),/Compare A\/B/);
  ui.render(doc,host,[saved],31,{
    select:id=>calls.push(['select',id]),restore:id=>calls.push(['restore',id]),
    edit:id=>calls.push(['edit',id]),pin(){},remove(){},multi(){}
  },{});
  const card=host.children[1].children[1].children[0];
  const body=card.children[3],rename=body.children[2].children[1];
  assert.equal(body.children[0].textContent,'  Geometry check  ');
  assert.match(body.children[0].title,/Compare A\/B/);
  assert.equal(rename.className,'modern-history-rename');
  assert.equal(rename['aria-label'],'Edit snapshot name and description');
  rename.listeners.click({stopPropagation(){}});
  assert.deepEqual(calls,[['edit',31]]);
  rename.listeners.dblclick({stopPropagation(){}});
  card.listeners.dblclick({target:{closest(selector){return selector.includes('modern-history-rename')?rename:null;}}});
  card.listeners.click({target:{closest(selector){return selector.includes('modern-history-rename')?rename:null;}}});
  assert.deepEqual(calls,[['edit',31]],'editing does not select or restore a snapshot');
  const old=entry(32,'scene',false);
  assert.equal(ui.displayName(old),ui.label(old),'old records retain automatic labels');
});

test('Named snapshots expose description and automatic physical label in Preview',()=>{
  const doc=inspectorDom(),host=doc.createElement('div');
  const saved=entry(40,'scene',false);saved.name='My horizon';saved.description='Check height 15 m';
  saved.experiment.scene={camera:{Height:15,Pan:0,Nick:0},objects:{NObjects:[1,0],ObjType:[3,0]},
    surface:{showModel:1,rEarth:6371000},atmosphere:'standard'};
  ui.render(doc,host,[saved],40,{select(){},restore(){},edit(){},pin(){},remove(){},multi(){}},{});
  const image=host.children[1].children[1].children[0].children[0];
  image.listeners.keydown({key:' ',preventDefault(){}});
  const overlay=doc.body.children[0],inner=overlay.children[0];
  assert.equal(inner.children[1].textContent,'My horizon');
  assert.match(inner.children[2].textContent,/Scene/);
  assert.equal(inner.children[3].textContent,'Check height 15 m');
  ui.hideInspector(host);
});

test('Storyboard shortlist renders compact real screenshots and distinct physics summaries without touching experiments',()=>{
  const {doc}=dom(),host=doc.createElement('ol'),calls=[];
  Object.defineProperty(host,'textContent',{get(){return '';},set(value){if(value==='')this.children=[];}});
  const first=entry(12,'scene',false),second=entry(22,'compare',true);
  first.name='Globe sunrise';second.name='Refracted skyline';
  first.experiment.scene={camera:{Height:2},surface:{showModel:1,rEarth:6371000},atmosphere:'vacuum'};
  second.experiment.scene={camera:{Height:50}};
  second.experiment.compare={A:{surface:'globe',radiusKm:6371,atmosphere:'vacuum'},
    B:{surface:'flat',atmosphere:'temperature-lapse',temperatureProfile:{gradientKPerKm:10}}};
  const original=structuredClone([first,second]);
  ui.renderStoryboardQueue(doc,host,[22,12],[first,second],{
    move:(id,step)=>calls.push(['move',id,step]),
    remove:id=>calls.push(['remove',id])});
  assert.equal(host.children.length,2);
  const firstCard=host.children[0],secondCard=host.children[1];
  assert.match(firstCard.className,/modern-history-storyboard-item/);
  assert.equal(firstCard.children[0].textContent,'×');
  assert.match(firstCard.children[0].className,/modern-history-storyboard-remove/);
  assert.equal(firstCard.children[1].children[0].tagName,'img');
  assert.match(firstCard.children[1].children[0].src,/^data:image\/webp/);
  assert.equal(firstCard.children[2].textContent,'1. Refracted skyline');
  assert.match(firstCard.children[3].textContent,/A: Globe.*B: Flat.*Camera 50 m/);
  assert.equal(secondCard.children[1].children[0].textContent,'No screenshot');
  assert.match(secondCard.children[3].textContent,/Camera 2 m/);
  const controls=firstCard.children[4];
  assert.equal(controls.children.length,2,'footer retains reorder controls without duplicate removal');
  assert.equal(controls.children[0].disabled,true);
  assert.equal(controls.children[1].disabled,false);
  controls.children[1].listeners.click({stopPropagation(){}});
  secondCard.children[0].listeners.click({stopPropagation(){}});
  assert.deepEqual(calls,[['move',22,1],['remove',12]]);
  ui.renderStoryboardQueue(doc,host,[12],[first,second],{move(){},remove(){}});
  assert.equal(host.children.length,1,'refresh replaces the shortlist; no duplicated DOM nodes');
  assert.equal(host.children[0].children[2].textContent,'1. Globe sunrise');
  assert.deepEqual([first,second],original,'render never mutates History or optics');
});

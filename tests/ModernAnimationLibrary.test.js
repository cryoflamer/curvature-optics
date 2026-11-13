'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const library=require('../src/animation/ModernAnimationLibrary');
const studio=require('../src/animation/ModernAnimationStudio');
const animation=require('../src/animation/ModernAnimationProject');
const codec=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');

function experiment(){
  const model={Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Animation Library test',Description:'',
    ObjType:[3,3],NObjects:[2,0],ObjDist:[50,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[10,10],ObjSizeVar:[0,0]};
  return codec.capture(model,{atmosphere:'standard',occlusionRadius:6371000,
    preset:'custom',resetPreset:'single'},compare.preset('globe-flat-vacuum'),
    {mode:'scene',eyeLevel:true,horizon:true,selected:'A'});
}
function source(){
  const a=experiment(),b=structuredClone(a);b.scene.surface.showModel=2;
  const draft=studio.history([11,12],[{id:11,name:'Globe',experiment:a},
    {id:12,name:'Flat',experiment:b}]);
  return studio.edit(draft,'name','Globe to Flat');
}
function memoryIndexedDB(){
  const records=new Map();let exists=false;
  return {open(name,version){
    assert.equal(name,library.DATABASE);assert.equal(version,1);
    const request={result:null,error:null};
    queueMicrotask(()=>{
      const db={objectStoreNames:{contains:()=>exists},
        createObjectStore(name,opts){assert.equal(name,library.STORE);assert.equal(opts.keyPath,'id');exists=true;},
        close(){},transaction(name,mode){
          assert.equal(name,library.STORE);
          let pending=0,finished=false;
          const tx={oncomplete:null,onabort:null,onerror:null,error:null,
            abort(){finished=true;queueMicrotask(()=>tx.onabort&&tx.onabort());},
            objectStore(){
              function operation(method,key,value){
                const r={result:undefined,error:null,onsuccess:null};pending++;
                queueMicrotask(()=>{
                  if(finished)return;
                  if(method==='get')r.result=records.get(key)?structuredClone(records.get(key)):undefined;
                  if(method==='all')r.result=[...records.values()].map(v=>structuredClone(v));
                  if(method==='put'||method==='add'){
                    assert.equal(mode,'readwrite');
                    const id=value.id;
                    if(method==='add'&&records.has(id)){
                      finished=true;tx.error=Error('Constraint');tx.onerror&&tx.onerror();return;
                    }
                    records.set(id,structuredClone(value));
                  }
                  if(method==='delete')records.delete(key);
                  r.onsuccess&&r.onsuccess();pending--;
                  if(pending===0&&!finished){finished=true;queueMicrotask(()=>tx.oncomplete&&tx.oncomplete());}
                });return r;
              }
              return {get:k=>operation('get',k),getAll:()=>operation('all'),
                put:v=>operation('put',null,v),add:v=>operation('add',null,v),
                delete:k=>operation('delete',k)};
            }};
          return tx;
        }};
      request.result=db;
      if(!exists)request.onupgradeneeded();
      request.onsuccess();
    });return request;
  }};
}

test('named projects round-trip without History and retain exact physical endpoints',async()=>{
  const db=memoryIndexedDB();const initial=source();
  const first=studio.build(initial,'animation_one');
  const stored=await library.create(db,first,'accurate',1000);
  assert.equal(stored.createdAt,1000);assert.equal(stored.updatedAt,1000);
  assert.deepEqual(await library.get(db,'animation_one'),stored);
  assert.equal((await library.list(db)).length,1);
  const loaded=studio.fromProject(stored.project);
  assert.equal(loaded.name,'Globe to Flat');
  assert.equal(loaded.frames[0].sourceSnapshotId,11);
  assert.equal(loaded.frames[1].sourceSnapshotId,12);
  assert.equal(animation.sampleAt(studio.build(loaded,'animation_one'),5000).scene.surface.showModel,2);
  assert.deepEqual(studio.build(loaded,'animation_one'),stored.project);
  // Destroy the in-memory source and test that History data is irrelevant.
  initial.frames[0].experiment.scene.surface.rEarth=9000000;
  assert.equal(animation.sampleAt((await library.get(db,'animation_one')).project,0)
    .scene.surface.rEarth,6371000);
  assert.equal((await library.get(db,'animation_one')).project.keyframes.length,2);
});

test('Save As owns another ID and Save Changes uses optimistic revisions',async()=>{
  const db=memoryIndexedDB();const sourceDraft=source();
  const first=await library.create(db,studio.build(sourceDraft,'animation_a'),'fast',100);
  const second=await library.create(db,studio.build(sourceDraft,'animation_b'),'accurate',120,null,true);
  assert.equal((await library.list(db))[0].id,'animation_b');
  await assert.rejects(library.create(db,first.project,'fast',130),/already exists/);
  const changed=studio.edit(sourceDraft,'description','A later explanation');
  const updated=await library.update(db,studio.build(changed,'animation_a'),'accurate',100,200);
  assert.equal(updated.createdAt,100);assert.equal(updated.updatedAt,200);
  assert.equal(updated.project.description,'A later explanation');
  assert.equal((await library.get(db,'animation_b')).project.description,'');
  await assert.rejects(library.update(db,first.project,'fast',100,220),/another tab/);
  await assert.rejects(library.update(db,studio.build(sourceDraft,'missing'),'fast',100),/deleted/);
  assert.equal(await library.remove(db,'animation_a'),true);
  assert.equal(await library.remove(db,'animation_a'),false);
  assert.equal((await library.list(db)).length,1);
  assert.equal(second.project.name,'Globe to Flat');
});

test('semantic fingerprint ignores metadata and inactive controls but preserves animation content',()=>{
  const base=studio.build(source(),'first');
  const clone=structuredClone(base);
  clone.id='another';clone.name='Another title';clone.description='A second description';
  clone.keyframes.forEach((f,i)=>{f.name='Alternative '+i;f.sourceSnapshotId=null;});
  clone.baseExperiment.compare.A.radiusKm=9000; // inactive in Scene
  assert.equal(library.fingerprint(base),library.fingerprint(clone));
  const differentTime=structuredClone(clone);differentTime.keyframes[1].travelMs+=200;
  assert.notEqual(library.fingerprint(base),library.fingerprint(differentTime));
  const differentHold=structuredClone(clone);differentHold.keyframes[0].holdMs+=300;
  assert.notEqual(library.fingerprint(base),library.fingerprint(differentHold));
  const differentEasing=structuredClone(clone);differentEasing.keyframes[1].easing='smoothstep';
  assert.notEqual(library.fingerprint(base),library.fingerprint(differentEasing));
  const differentEndpoint=structuredClone(clone);differentEndpoint.keyframes[1].value=1/10000000;
  assert.notEqual(library.fingerprint(base),library.fingerprint(differentEndpoint));
  const differentObjects=structuredClone(clone);differentObjects.baseExperiment.scene.objects.ObjDist[0]+=10;
  assert.notEqual(library.fingerprint(base),library.fingerprint(differentObjects));
  const reversed=structuredClone(clone);reversed.keyframes.reverse();
  // First frame travelMs must remain zero, so move the physical values only.
  reversed.keyframes[0].travelMs=0;reversed.keyframes[1].travelMs=5000;
  assert.notEqual(library.fingerprint(base),library.fingerprint(reversed));
});

test('duplicate create is blocked atomically, Save copy anyway is explicit, and groups are review-only',async()=>{
  const db=memoryIndexedDB(),base=studio.build(source(),'semantic_a');
  await library.create(db,base,'accurate',100);
  const duplicate=structuredClone(base);duplicate.id='semantic_b';
  duplicate.name='Different title';duplicate.description='Notes';
  duplicate.keyframes[0].name='Origin';duplicate.keyframes[1].sourceSnapshotId=null;
  let conflict;
  try{await library.create(db,duplicate,'fast',200);}catch(error){conflict=error;}
  assert.equal(conflict.code,'ANIMATION_DUPLICATE');
  assert.equal(conflict.existingId,'semantic_a');
  assert.equal(conflict.existingName,base.name);
  assert.equal((await library.list(db)).length,1);
  const copy=await library.create(db,duplicate,'fast',201,null,true);
  assert.equal(copy.id,'semantic_b');
  assert.equal(library.findDuplicates(await library.list(db))[0].length,2);
  assert.equal(await library.remove(db,'semantic_a'),true);
  assert.equal(library.findDuplicates(await library.list(db)).length,0);
  const revised=structuredClone(base);revised.id='different_timing';revised.keyframes[1].travelMs+=500;
  await library.create(db,revised,'auto',202);
  assert.equal((await library.list(db)).length,2);
});

test('library UI offers nonblocking duplicate review without save warnings',()=>{
  const ui=require('../src/ui/modern/ModernAnimationStudioUI');
  const doc={createElement(tag){return {tagName:tag,children:[],listeners:{},textContent:'',
    className:'',value:'',disabled:false,appendChild(node){this.children.push(node);return node;},
    addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(name,v){this[name]=v;}};}};
  const host=doc.createElement('section'),original=studio.build(source(),'one'),copy=structuredClone(original);
  copy.id='two';copy.name='Other title';
  const a=library.record(original,'auto','one',10,11),b=library.record(copy,'fast','two',12,13);
  const calls=[],actions={save:()=>{},saveAs:()=>{},saveChanges:()=>{},
    toggleExpanded:()=>{},toggleDuplicates:()=>calls.push('review'),
    open:id=>calls.push(['open',id]),remove:id=>calls.push(['delete',id]),
    select:()=>{},renameStart:()=>{},renameCancel:()=>{},rename:()=>{}};
  ui.renderLibrary(doc,host,[a,b],{expanded:true,duplicateGroups:library.findDuplicates([a,b]),showDuplicates:true},actions);
  const nodes=(function walk(n){return [n,...n.children.flatMap(walk)];})(host);
  for(const [label,value] of [['Hide duplicates','review']]){
    nodes.find(n=>n.tagName==='button'&&n.textContent===label).listeners.click();
    assert.equal(calls.at(-1),value);
  }
  assert.ok(nodes.some(n=>n.textContent.includes('none will be deleted automatically')));
  assert.ok(!nodes.some(n=>n.textContent.includes('Identical animation already saved')));
  assert.equal(nodes.filter(n=>n.className==='modern-animation-library-duplicate-entry').length,2);
  nodes.find(n=>n.className==='modern-animation-library-duplicate-entry').children
    .find(n=>n.textContent==='Delete').listeners.click();
  assert.deepEqual(calls.at(-1),['delete','one']);
});

test('invalid projects never enter storage and malformed records are rejected',async()=>{
  const db=memoryIndexedDB();
  const good=studio.build(source(),'valid_one');
  assert.throws(()=>library.record({...good,name:''},'fast','valid_one',1,1),/text/);
  assert.throws(()=>library.record(good,'wat','valid_one',1,1),/optics/);
  assert.throws(()=>library.record(good,'fast','wrong_id',1,1),/ID/);
  assert.throws(()=>library.normalize({version:2}),/Unsupported/);
  assert.throws(()=>library.normalize({version:1,id:'valid_one',project:good,
    quality:'auto',createdAt:10,updatedAt:9}),/revision/);
  assert.match(library.makeId({randomUUID:()=> '0000-1111'},300),/^animation_/);
  await assert.rejects(library.list(null),/IndexedDB/);
  await assert.rejects(library.get({open(){throw Error('blocked');}},'valid_one'),/blocked/);
});

test('HTML load order and application expose named project save/open actions separately from draft',()=>{
  const root=path.join(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  const ui=fs.readFileSync(path.join(root,'src/ui/modern/ModernAnimationStudioUI.js'),'utf8');
  assert.ok(html.indexOf('ModernAnimationProject.js')<html.indexOf('ModernAnimationLibrary.js'));
  assert.ok(html.indexOf('ModernAnimationLibrary.js')<html.indexOf('ModernApp.js'));
  assert.match(html,/id="ModernAnimationLibrary"/);
  assert.match(app,/studioLibrary\.create\(/);
  assert.match(app,/studioLibrary\.update\(/);
  assert.match(app,/studioLibrary\.get\(/);
  assert.match(app,/studioLibrary\.remove\(/);
  assert.match(app,/studioLibraryActive\.updatedAt/);
  assert.match(ui,/New project/);
  assert.doesNotMatch(ui,/Save and continue|Discard and continue|Identical animation already saved/);
  assert.match(ui,/Open draft/);
  assert.match(ui,/Save As/);
  assert.match(app,/function requestStudioSwitch\(kind,id\)/);
  assert.match(app,/function studioHasUnsavedWork\(\)/);
  assert.match(app,/Animation Library module failed to load; check the browser console/);
});

test('classic-browser script loading has no CommonJS dependency and can save via IndexedDB',async()=>{
  // Node tests previously missed a top-level require() executed outside its
  // CommonJS guard. Execute the REAL browser-facing UMD scripts with neither
  // require nor module defined, as in Opera's classic <script> environment.
  const root=path.join(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const files=[
    'src/ui/modern/ModernExperimentThumbnail.js',
    'src/animation/ModernAnimationLibrary.js'
  ];
  const requiredScriptOrder=[
    'src/ui/modern/ModernExperimentThumbnail.js',
    'src/animation/ModernAnimationCompatibility.js',
    'src/animation/ModernAnimationProject.js',
    'src/animation/ModernAnimationLibrary.js'
  ];
  const scripts=[...html.matchAll(/<script\s+src="([^"]+)"/g)]
    .map(match=>match[1].split('?')[0]);
  const positions=requiredScriptOrder.map(file=>scripts.indexOf(file));
  assert.ok(positions.every(index=>index>=0),'every library dependency is loaded by Modern HTML');
  assert.ok(positions.every((index,i)=>i===0||index>positions[i-1]),
    'thumbnail and project must load before Animation Library');
  // The project's UMD script has its own tests; supply its validated API as
  // the prior <script> global and execute the library/thumbnail scripts as-is.
  const browser=vm.createContext({CurvatureModernAnimationProject:animation,
    CurvatureModernAnimationCompatibility:require('../src/animation/ModernAnimationCompatibility')});
  assert.equal(vm.runInContext('typeof require',browser),'undefined');
  assert.equal(vm.runInContext('typeof module',browser),'undefined');
  for(const file of files){
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),browser,{filename:file});
  }
  const browserLibrary=browser.CurvatureModernAnimationLibrary;
  assert.ok(browserLibrary,'the browser must expose a usable library');
  assert.equal(typeof browserLibrary.create,'function');
  const db=memoryIndexedDB(),project=studio.build(source(),'browser_saved');
  const image={dataUrl:'data:image/png;base64,AAAA',width:2,height:2,mode:'scene'};
  const saved=await browserLibrary.create(db,project,'auto',100,image);
  assert.equal(saved.project.name,'Globe to Flat');
  assert.equal(saved.thumbnail.dataUrl,image.dataUrl);
  assert.equal((await browserLibrary.list(db)).length,1);
  const portable=browserLibrary.exportPortable([saved]);
  const restored=browserLibrary.parsePortable(portable);
  assert.equal(restored[0].project.name,'Globe to Flat');
  const reimported=await browserLibrary.importEntries(db,restored,200);
  assert.equal(reimported.created,0);
  assert.equal(reimported.reused,1);
  assert.equal((await browserLibrary.get(db,'browser_saved')).project.id,'browser_saved');
  const changed=studio.edit(source(),'description','Browser storage round-trip');
  const updated=await browserLibrary.update(db,studio.build(changed,'browser_saved'),
    'accurate',100,150);
  assert.equal(updated.project.description,'Browser storage round-trip');
  assert.equal((await browserLibrary.get(db,'browser_saved')).quality,'accurate');
  assert.equal(await browserLibrary.remove(db,'browser_saved'),true);
  assert.equal((await browserLibrary.list(db)).length,0);
});

test('saved project association survives F5 without changing older draft checkpoints',()=>{
  const autosave=require('../src/animation/ModernAnimationDraftAutosave');
  const draft=source();
  const basic={draft,selectedKey:'history-11',quality:'auto',prepared:true,positionMs:900};
  const old=autosave.checkpoint(basic,1000);
  assert.equal(old.libraryId,null);
  assert.equal(old.libraryRevision,null);
  const named=autosave.checkpoint({...basic,libraryId:'animation_abc',libraryRevision:44},1001);
  assert.equal(named.libraryId,'animation_abc');
  assert.equal(named.libraryRevision,44);
  assert.throws(()=>autosave.checkpoint({...basic,libraryId:'!bad',libraryRevision:44},1001),/ID/);
  assert.throws(()=>autosave.checkpoint({...basic,libraryId:'animation_abc',libraryRevision:null},1001),/revision/);
});

test('saved thumbnails are bounded, optional and detached from History',async()=>{
  const db=memoryIndexedDB(),project=studio.build(source(),'visual_one');
  const image={dataUrl:'data:image/png;base64,AAAA',width:2,height:2,mode:'scene'};
  const saved=await library.create(db,project,'auto',101,image);
  assert.deepEqual(saved.thumbnail,image);
  assert.deepEqual((await library.get(db,project.id)).thumbnail,image);
  const changed=studio.edit(source(),'description','Changed notes');
  const updated=await library.update(db,studio.build(changed,project.id),'fast',101,103);
  assert.deepEqual(updated.thumbnail,image,'editing timing/description retains physical first-frame image');
  // Malformed or misleading screenshots must be rejected before a durable write.
  assert.throws(()=>library.record(project,'auto',project.id,1,2,{...image,mode:'compare'}),
    /thumbnail/);
  const changedPhysics=source();
  changedPhysics.frames.forEach(f=>{f.experiment.scene.camera.Height=35;});
  const resaved=await library.update(db,studio.build(changedPhysics,project.id),'fast',103,105);
  assert.equal(resaved.thumbnail,null,'a changed initial physical frame invalidates the old screenshot');
  const old={...updated};delete old.thumbnail;
  assert.equal(library.normalize(old).thumbnail,null);
});

test('rename changes only saved metadata with revision safety and preserves preview',async()=>{
  const db=memoryIndexedDB(),project=studio.build(source(),'rename_one');
  const image={dataUrl:'data:image/png;base64,AAAA',width:2,height:2,mode:'scene'};
  await library.create(db,project,'accurate',100,image);
  const renamed=await library.rename(db,'rename_one','Curvature experiment',100,150);
  assert.equal(renamed.project.name,'Curvature experiment');
  assert.deepEqual(renamed.project.baseExperiment,project.baseExperiment);
  assert.deepEqual(renamed.project.keyframes,project.keyframes);
  assert.deepEqual(renamed.thumbnail,image);
  assert.equal(renamed.quality,'accurate');
  assert.equal(renamed.createdAt,100);
  assert.equal(renamed.updatedAt,150);
  await assert.rejects(library.rename(db,'rename_one','Stale',100,160),/another tab/);
  await assert.rejects(library.rename(db,'rename_one','',150,160),/text/);
  assert.equal((await library.get(db,'rename_one')).project.name,'Curvature experiment');
});

test('Animation Library gallery shows cards, genuine images, rename and direct open',()=>{
  const ui=require('../src/ui/modern/ModernAnimationStudioUI');
  const doc={createElement(tag){return {tagName:tag,children:[],listeners:{},
    textContent:'',className:'',value:'',disabled:false,
    appendChild(node){this.children.push(node);return node;},
    addEventListener(name,fn){this.listeners[name]=fn;},
    setAttribute(name,value){this[name]=value;}};}};
  const host=doc.createElement('section'),project=studio.build(source(),'animation_a'),calls=[];
  const preview={dataUrl:'data:image/png;base64,AAAA',width:2,height:2,mode:'scene'};
  const entries=[library.record(project,'auto','animation_a',10,11,preview)];
  const actions={select:id=>calls.push(['select',id]),save:()=>calls.push('save'),
    saveAs:()=>calls.push('saveAs'),newProject:()=>calls.push('newProject'),
    saveBeforeSwitch:()=>calls.push('saveBeforeSwitch'),
    discardSwitch:()=>calls.push('discardSwitch'),cancelSwitch:()=>calls.push('cancelSwitch'),
    open:id=>calls.push(['open',id]),remove:id=>calls.push(['delete',id]),
    renameStart:id=>calls.push(['renameStart',id]),
    renameCancel:()=>calls.push('renameCancel'),
    rename:(id,name)=>calls.push(['rename',id,name]),
    toggleExpanded:()=>calls.push('toggle')};
  function nodes(){return (function collect(n){return [n,...n.children.flatMap(collect)];})(host);}
  ui.renderLibrary(doc,host,entries,
    {selectedId:'animation_a',activeId:'animation_a',canSave:true,dirty:true,expanded:true},actions);
  assert.ok(nodes().some(n=>n.textContent.includes('Working edits autosaved separately')));
  assert.equal(nodes().find(n=>n.tagName==='img').src,preview.dataUrl);
  assert.ok(nodes().find(n=>n.textContent==='Physical · Surface curvature' ||
    n.textContent.includes('Earth curvature · 2 frames')));
  for(const [label,value] of [['New project','newProject'],['Save changes','save'],['Save As','saveAs']]){
    nodes().find(n=>n.tagName==='button'&&n.textContent===label).listeners.click();
    assert.equal(calls.at(-1),value);
  }
  const card=nodes().find(n=>n.tagName==='article'&&n.className.includes('modern-animation-library-card'));
  assert.equal(card.tabindex,'0');
  assert.equal(card.role,'group');
  assert.equal(nodes().some(n=>n.tagName==='button'&&n.textContent==='Select'),false);
  assert.equal(nodes().filter(n=>n.tagName==='button'&&n.textContent==='Open').length,1);
  nodes().find(n=>n.tagName==='button'&&n.textContent==='Open').listeners.click();
  assert.deepEqual(calls.at(-1),['open','animation_a']);
  card.listeners.click({target:card});
  assert.deepEqual(calls.at(-1),['select','animation_a']);
  card.listeners.dblclick({target:card});
  assert.deepEqual(calls.at(-1),['open','animation_a']);
  card.listeners.keydown({target:card,key:' ',preventDefault(){}});
  assert.deepEqual(calls.at(-1),['select','animation_a']);
  card.listeners.keydown({target:card,key:'Enter',preventDefault(){}});
  assert.deepEqual(calls.at(-1),['open','animation_a']);
  const nestedButton=nodes().find(n=>n.tagName==='button'&&n.textContent==='Rename');
  const countBefore=calls.length;
  card.listeners.dblclick({target:{tagName:'BUTTON',parentNode:card}});
  card.listeners.keydown({target:{tagName:'BUTTON',parentNode:card},key:'Enter'});
  assert.equal(calls.length,countBefore);
  nodes().find(n=>n.tagName==='button'&&n.textContent==='Delete').listeners.click();
  assert.deepEqual(calls.at(-1),['delete','animation_a']);
  nodes().find(n=>n.tagName==='button'&&n.textContent==='Rename').listeners.click();
  assert.deepEqual(calls.at(-1),['renameStart','animation_a']);
  host.children=[];ui.renderLibrary(doc,host,entries,
    {selectedId:'animation_a',renameId:'animation_a',expanded:true},actions);
  const input=nodes().find(n=>n.tagName==='input'&&n.type==='text');input.value='New title';
  nodes().find(n=>n.tagName==='button'&&n.textContent==='Save name').listeners.click();
  assert.deepEqual(calls.at(-1),['rename','animation_a','New title']);
  host.children=[];ui.renderLibrary(doc,host,entries,{selectedId:'',expanded:false},actions);
  assert.equal(nodes().filter(n=>n.className.includes('modern-animation-library-card')).length,0);
  nodes().find(n=>n.textContent==='Show projects').listeners.click();
  assert.equal(calls.at(-1),'toggle');
  host.children=[];ui.renderLibrary(doc,host,[],{selectedId:'',canSave:false},actions);
  assert.equal(nodes().find(n=>n.textContent==='Save project').disabled,true);
});


test('Animation Library distinguishes selected backup card from opened editing card',()=>{
  const ui=require('../src/ui/modern/ModernAnimationStudioUI');
  const doc={createElement(tag){return {tagName:tag,children:[],listeners:{},
    textContent:'',className:'',value:'',disabled:false,
    appendChild(node){this.children.push(node);return node;},
    addEventListener(name,fn){this.listeners[name]=fn;},
    setAttribute(name,value){this[name]=value;}};}};
  const host=doc.createElement('section');
  const one=studio.build(source(),'animation_a');
  const two=studio.build(studio.edit(source(),'name','Second animation'),'animation_b');
  const entries=[library.record(one,'auto','animation_a',10,11),
    library.record(two,'auto','animation_b',12,13)];
  const calls=[];
  const actions={select:id=>calls.push(['select',id]),open:id=>calls.push(['open',id])};
  const nodes=()=>{function collect(n){return [n,...n.children.flatMap(collect)];}return collect(host);};
  const cards=()=>nodes().filter(n=>n.tagName==='article'&&
    n.className.includes('modern-animation-library-card'));
  const badge=(card,text)=>{function collect(n){return [n,...n.children.flatMap(collect)];}
    const exists=collect(card).some(n=>n.tagName==='span'&&n.textContent===text);
    // The Selected badge stays mounted for dblclick stability and is visible
    // only while the card has the same is-selected class as its blue outline.
    return text==='Selected for backup'?exists&&card.className.split(' ').includes('is-selected'):exists;};

  // Single-click selection and the opened project can be different records.
  ui.renderLibrary(doc,host,entries,{selectedId:'animation_b',activeId:'animation_a',
    activeName:one.name,expanded:true},actions);
  assert.equal(cards().length,2);
  assert.ok(cards()[0].className.includes('is-editing'));
  assert.ok(!cards()[0].className.includes('is-selected'));
  assert.ok(badge(cards()[0],'Editing'));
  assert.ok(!badge(cards()[0],'Selected for backup'));
  assert.ok(cards()[1].className.includes('is-selected'));
  assert.ok(!cards()[1].className.includes('is-editing'));
  assert.ok(badge(cards()[1],'Selected for backup'));
  assert.ok(!badge(cards()[1],'Editing'));
  assert.match(cards()[0]['aria-label'],/Editing animation/);
  cards()[1].listeners.click({target:cards()[1]});
  assert.deepEqual(calls.pop(),['select','animation_b']);
  // Simulate the in-place class update used for single-click selection.
  cards()[0].className+=' is-selected';
  cards()[1].className=cards()[1].className.replace(' is-selected','');
  assert.ok(badge(cards()[0],'Selected for backup'));
  assert.ok(!badge(cards()[1],'Selected for backup'));
  assert.ok(badge(cards()[0],'Editing'));
  // Same DOM cards survive the click, so dblclick is still delivered.
  const originalSecond=cards()[1];
  cards()[1].listeners.dblclick({target:cards()[1]});
  assert.deepEqual(calls.pop(),['open','animation_b']);
  assert.equal(cards()[1],originalSecond);

  // The same project may be both selected and opened, without losing either signal.
  host.children=[];
  ui.renderLibrary(doc,host,entries,{selectedId:'animation_a',activeId:'animation_a',expanded:true},actions);
  assert.ok(badge(cards()[0],'Editing'));
  assert.ok(badge(cards()[0],'Selected for backup'));
  assert.ok(!badge(cards()[1],'Editing'));
  assert.ok(!badge(cards()[1],'Selected for backup'));

  // Independent working draft has no opened Library card.
  host.children=[];
  ui.renderLibrary(doc,host,entries,{selectedId:'animation_b',activeId:null,expanded:true},actions);
  assert.ok(!cards().some(card=>badge(card,'Editing')));
  assert.ok(badge(cards()[1],'Selected for backup'));
});

test('Animation Library backup badge follows the outline class without rebuilding cards',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.css'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  assert.match(css,/\.modern-animation-library-card:not\(\.is-selected\) \.modern-animation-library-status-selected\{display:none\}/);
  assert.match(css,/\.modern-animation-library-card:not\(\.is-selected\):not\(\.is-editing\) \.modern-animation-library-card-status\{display:none\}/);
  assert.match(app,/card\.classList\.toggle\('is-selected',chosen\)/);
});

test('portable Animation Library JSON round-trips complete projects, annotations and genuine thumbnails',async()=>{
  const sourceDb=memoryIndexedDB(),targetDb=memoryIndexedDB();
  const original=studio.build(studio.edit(source(),'description','Surface study with saved notes'),'portable_one');
  const image={dataUrl:'data:image/png;base64,AAAA',width:2,height:2,mode:'scene'};
  await library.create(sourceDb,original,'fast',1234,image);
  const another=structuredClone(original);
  another.id='portable_two';another.name='Slower curvature';another.keyframes[1].travelMs=11000;
  await library.create(sourceDb,another,'accurate',4321);
  const exported=library.exportPortable(await library.list(sourceDb));
  const parsed=JSON.parse(exported);
  assert.equal(parsed.format,library.PORTABLE_FORMAT);
  assert.equal(parsed.version,library.PORTABLE_VERSION);
  assert.equal(parsed.animations.length,2);
  assert.equal(parsed.animations[1].project.description,'Surface study with saved notes');
  const imported=library.parsePortable(exported);
  const result=await library.importEntries(targetDb,imported,9999,{randomUUID:()=> '0000-1111'});
  assert.deepEqual([result.created,result.reused],[2,0]);
  const entries=await library.list(targetDb);
  assert.equal(entries.length,2);
  assert.ok(entries.every(e=>!['portable_one','portable_two'].includes(e.id)),
    'imported files never overwrite a local ID');
  assert.deepEqual(entries.map(e=>e.project.name).sort(),['Globe to Flat','Slower curvature'].sort());
  assert.equal(entries.find(e=>e.project.name==='Globe to Flat').createdAt,1234);
  const stored=entries.find(e=>e.project.name==='Globe to Flat');
  assert.equal(stored.thumbnail.dataUrl,image.dataUrl);
  assert.equal(stored.quality,'fast');
  assert.equal(stored.project.description,'Surface study with saved notes');
  assert.ok(stored.project.keyframes.every(f=>f.sourceSnapshotId===null),
    'a different browser must not resolve stale History IDs to unrelated screenshots');
  assert.equal(animation.sampleAt(stored.project,5000).scene.surface.showModel,2);
  assert.equal((await library.list(sourceDb)).length,2,'export never mutates the source');
  assert.equal((await library.list(targetDb)).length,2,'import does not require History');
});

test('repeat and intra-file duplicate imports reuse existing content without changing originals',async()=>{
  const db=memoryIndexedDB(),original=studio.build(source(),'original');
  await library.create(db,original,'auto',100);
  const other=structuredClone(original);other.id='different';other.keyframes[1].travelMs=6000;
  const file=library.exportPortable([
    library.record({...original,id:'external1',name:'Renamed export'},'fast','external1',10,20),
    library.record({...original,id:'external2',name:'A second title'},'accurate','external2',10,20),
    library.record(other,'accurate','different',30,40)
  ]);
  const first=await library.importEntries(db,library.parsePortable(file),400);
  assert.deepEqual([first.created,first.reused],[1,2]);
  assert.equal((await library.get(db,'original')).project.name,original.name);
  const second=await library.importEntries(db,library.parsePortable(file),500);
  assert.deepEqual([second.created,second.reused],[0,3]);
  assert.equal((await library.list(db)).length,2);
  assert.equal((await library.get(db,'original')).quality,'auto',
    'duplicate import cannot overwrite metadata or optics preference');
});

test('single Animation Project is supported, but unsupported and malformed bundles never write',async()=>{
  const db=memoryIndexedDB(),project=studio.build(source(),'single_project');
  const parsed=library.parsePortable(JSON.stringify(project));
  assert.equal(parsed.length,1);assert.equal(parsed[0].quality,'auto');
  const added=await library.importEntries(db,parsed,777);
  assert.equal(added.created,1);
  const file=JSON.parse(library.exportPortable([library.record(project,'fast',project.id,1,2)]));
  for(const broken of [
    {...file,version:100},
    {...file,animations:[]},
    {...file,animations:[...file.animations,{project:{version:99},quality:'auto'}]},
    {...file,animations:[{...file.animations[0],quality:'unsupported'}]},
    {...file,animations:[{...file.animations[0],thumbnail:{dataUrl:'not-an-image',width:5,height:5,mode:'scene'}}]},
    {...file,animations:[{...file.animations[0],createdAt:100,updatedAt:5}]},
    {...file,animations:[{...file.animations[0],extra:'unexpected'}]},
    {...file,unrecognized:true}
  ]){
    assert.throws(()=>library.parsePortable(JSON.stringify(broken)),/Invalid|Unsupported|thumbnail|text|optics|version|timestamp|fields|format/);
    assert.equal((await library.list(db)).length,1);
  }
  assert.throws(()=>library.parsePortable('{invalid'),SyntaxError);
  assert.throws(()=>library.exportPortable([]),/Select/);
  assert.equal((await library.list(db)).length,1);
});

test('import is all-or-nothing when validation fails before IndexedDB writes',async()=>{
  const db=memoryIndexedDB(),project=studio.build(source(),'valid');
  const good=library.parsePortable(library.exportPortable([library.record(project,'auto',project.id,10,10)]))[0];
  const bad={...good,project:{...good.project,name:''}};
  assert.throws(()=>library.importEntries(db,[good,bad],100),/text/);
  assert.equal((await library.list(db)).length,0);
  await assert.rejects(library.importEntries(null,[good],100),/IndexedDB/);
  assert.equal((await library.list(db)).length,0);
});

test('Animation Library UI exposes portable export and file import without modifying draft',()=>{
  const ui=require('../src/ui/modern/ModernAnimationStudioUI');
  const calls=[];
  const doc={createElement(tag){return {tagName:tag,children:[],listeners:{},value:'',
    setAttribute(n,v){this[n]=v;},appendChild(n){this.children.push(n);return n;},
    addEventListener(n,fn){this.listeners[n]=fn;},click(){this.clicked=true;}};}};
  const host=doc.createElement('section'),record=library.record(studio.build(source(),'saved_1'),
    'auto','saved_1',10,10);
  const noop=()=>{};
  const actions={save:noop,saveChanges:noop,saveAs:noop,select:noop,open:noop,
    renameStart:noop,remove:noop,toggleExpanded:noop,
    exportSelected:()=>calls.push('selected'),exportAll:()=>calls.push('all'),
    importFile:file=>calls.push(file.name)};
  ui.renderLibrary(doc,host,[record],{selectedId:'saved_1',expanded:false},actions);
  const nodes=(function walk(node){return [node,...node.children.flatMap(walk)];})(host);
  function press(label){nodes.find(n=>n.tagName==='button'&&n.textContent===label).listeners.click();}
  press('Export selected');press('Export all');press('Import JSON');
  const input=nodes.find(n=>n.tagName==='input'&&n.type==='file');
  assert.equal(input.clicked,true);
  input.files=[{name:'backup.json'}];input.listeners.change();
  assert.deepEqual(calls,['selected','all','backup.json']);
  assert.equal(input.value,'');
});

test('project lifecycle has independent draft controls and no conflicting confirmation panels',()=>{
  const ui=require('../src/ui/modern/ModernAnimationStudioUI');
  const doc={createElement(tag){return {tagName:tag,children:[],listeners:{},textContent:'',className:'',
    value:'',disabled:false,appendChild(node){this.children.push(node);return node;},
    addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(name,value){this[name]=value;}};}};
  const host=doc.createElement('section'),calls=[];
  const actions={newProject:()=>calls.push('new'),save:()=>calls.push('save'),
    saveAs:()=>calls.push('saveAs'),openDraft:id=>calls.push(['openDraft',id]),
    removeDraft:id=>calls.push(['removeDraft',id])};
  const nodes=()=>{const walk=n=>[n,...n.children.flatMap(walk)];return walk(host);};
  ui.renderLibrary(doc,host,[],{canSave:true,draftWorkspaces:[
    {id:'draft_one',name:'Tour of towers',frames:3,active:false},
    {id:'draft_two',name:'Current work',frames:1,active:true}
  ]},actions);
  const button=label=>nodes().find(n=>n.tagName==='button'&&n.textContent===label);
  for(const [label,event] of [['New project','new'],['Save project','save'],['Save As','saveAs']]){
    button(label).listeners.click();assert.equal(calls.at(-1),event);
  }
  button('Open draft').listeners.click();assert.deepEqual(calls.at(-1),['openDraft','draft_one']);
  button('Delete draft').listeners.click();assert.deepEqual(calls.at(-1),['removeDraft','draft_one']);
  assert.equal(button('Current').disabled,true);
  assert.ok(nodes().some(n=>n.textContent.includes('Each draft is kept independently')));
  assert.ok(!nodes().some(n=>n.className==='modern-animation-library-pending'));
  assert.ok(!nodes().some(n=>n.className==='modern-animation-library-duplicate-warning'));
});

function projectLifecycleHarness(){
  const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  const excerpt=(first,last)=>{
    const a=app.indexOf('  '+first),b=app.indexOf('  '+last);
    assert.ok(a>=0&&b>a,`missing ${first}`);return app.slice(a,b);
  };
  const stored=new Map(),events=[];
  const oldDraft={name:'Existing work',description:'',mode:'auto',target:'auto',source:'history',
    frames:[{key:'a'},{key:'b'}]};
  stored.set('old',{id:'old',updatedAt:1,quality:'auto',
    project:{id:'old',name:'Existing work',frames:[{key:'a'},{key:'b'}]}});
  stored.set('other',{id:'other',updatedAt:2,quality:'fast',
    project:{id:'other',name:'Other work',frames:[{key:'a'},{key:'b'}]}});
  let rejectSave=false,rejectDraft=false,sequence=0;
  const studioApi={blank(){return {name:'Animation study',description:'',mode:'auto',target:'auto',
    source:'none',frames:[],cameraHudAppearance:null};},
    edit(draft,key,value){return {...draft,[key]:value};},build(draft,id){
    if(draft.frames.length<2)throw Error('not enough frames');
    return {id,name:draft.name,frames:draft.frames};
  },fromProject(p){return {name:p.name,description:'',mode:'auto',target:'auto',source:'mixed',
    frames:p.frames.map(f=>({...f}))};}};
  const checkpoints=new Map([['project_old',{
    draft:{...oldDraft},selectedKey:'a',quality:'auto',prepared:false,positionMs:0,
    libraryId:'old',libraryRevision:1,savedAt:100
  }]]);
  const autosave={projectWorkspaceId:id=>'project_'+id,
    makeWorkspaceId:()=> 'draft_'+(++sequence),
    getWorkspace:(_,id)=>checkpoints.get(id)||null};
  const ctx={Promise,Date,Object,semanticNaming:null,root:{indexedDB:{},crypto:{}},studioApi,studioDraft:{...oldDraft},
    studioDraftAutosave:autosave,studioWorkspaceReady:true,studioWorkspaceId:'project_old',
    studioWorkspaces:{workspaces:[{id:'project_old',checkpoint:checkpoints.get('project_old')}]},
    studioLibraryActive:stored.get('old'),studioLibraryPending:null,
    studioLibrarySelected:'old',studioLibraryEntries:[...stored.values()],
    studioLibraryBusy:false,studioLibraryExpanded:false,studioLibraryScroll:750,
    studioPlaybackQuality:'auto',studioLibraryError:false,studioLibraryMessage:'',
    cameraHudAppearance:{opacity:90,position:'top-left',size:100},
    studioDraftGeneration:0,studioSelectedKey:'a',studioFilmstripScroll:0,
    studioLibraryRenamingId:'',studioPickerOpen:false,studioPickerSearch:'',
    studioPickerScroll:0,studioPickerChecked:{},studioDragSession:null,
    studioRemovedFrameUndo:null,studioRestorePreviewPending:false,
    studioPrepared:null,studioPlayback:null,
    studioPlaybackApi:null,animationWorkspaceOpen:false,experimentHistory:null,
    studioHistoryEntries:[],studioLibraryDirty(){return ctx.studioDraft.name!==
      ctx.studioLibraryActive.project.name||ctx.studioDraft.frames.length!==2;},
    studioLibraryThumbnail(){return null;},
    studioLibraryNotice(text){ctx.studioLibraryMessage=text;events.push(text);},
    renderStudioLibrary(){events.push('library UI');},
    renderAnimationStudio(){events.push('editor UI');},
    saveStudioDraft(){ctx.studioDraftGeneration++;events.push('checkpoint');
      const cp={draft:structuredClone(ctx.studioDraft),selectedKey:ctx.studioSelectedKey,
        quality:ctx.studioPlaybackQuality,prepared:!!ctx.studioPrepared,positionMs:0,
        libraryId:ctx.studioLibraryActive?.id||ctx.studioLibraryPending?.id||null,
        libraryRevision:ctx.studioLibraryActive?.updatedAt||ctx.studioLibraryPending?.revision||null,
        savedAt:100+ctx.studioDraftGeneration};
      checkpoints.set(ctx.studioWorkspaceId,cp);
      ctx.studioWorkspaces.workspaces=[...checkpoints].map(([id,checkpoint])=>({id,checkpoint}));
      return true;
    },
    persistStudioWorkspace(){return Promise.resolve(!rejectDraft);},
    dropStudioWorkspace(id){checkpoints.delete(id);
      ctx.studioWorkspaces.workspaces=[...checkpoints].map(([key,checkpoint])=>({id:key,checkpoint}));},
    restoreStudioDraft(cp){ctx.studioDraft=structuredClone(cp.draft);
      ctx.studioSelectedKey=cp.selectedKey;ctx.studioPlaybackQuality=cp.quality;
      ctx.studioLibraryActive=null;ctx.studioLibraryPending=cp.libraryId?{
        id:cp.libraryId,revision:cp.libraryRevision}:null;},
    stopStudioPlayback(){events.push('stopped');},
    syncStudioPlaybackControls(){},syncWorkspaceVisibility(){},
    newUiEl(){return null;},
    refreshStudioLibrary(){ctx.studioLibraryEntries=[...stored.values()];return Promise.resolve([]);},
    studioLibrary:{makeId(){return 'created-'+(++sequence);},
      create(db,p){if(rejectSave)return Promise.reject(Error('storage unavailable'));
        const saved={id:p.id,updatedAt:10,quality:'auto',project:p};stored.set(saved.id,saved);
        return Promise.resolve(saved);},
      update(db,p){if(rejectSave)return Promise.reject(Error('stale revision'));
        const saved={id:p.id,updatedAt:20,quality:'auto',project:p};stored.set(saved.id,saved);
        return Promise.resolve(saved);},
      get(db,id){return Promise.resolve(stored.get(id));},
      rename(db,id,name){const old=stored.get(id);const saved={...old,updatedAt:old.updatedAt+1,
        project:{...old.project,name}};stored.set(id,saved);return Promise.resolve(saved);}}
  };
  vm.runInNewContext(
    excerpt('function studioHasUnsavedWork(){','function renderStudioLibrary(){')+'\n'+
    excerpt('function renameNamedAnimation(id,name){','function studioWorkspaceEditedIds(){')+'\n'+
    excerpt('function studioWorkspaceDraftCards(){','function deleteNamedAnimation(id){'),ctx);
  const tick=async()=>{await new Promise(resolve=>setImmediate(resolve));};
  return {ctx,stored,events,tick,checkpoints,
    failSave(value){rejectSave=value;},failDraft(value){rejectDraft=value;}};
}

test('New creates a separate workspace; returning to a saved project resumes unsaved edits',async()=>{
  const h=projectLifecycleHarness(),{ctx,stored}=h;
  ctx.studioDraft={...ctx.studioDraft,name:'Working modification'};
  ctx.requestStudioSwitch('new');await h.tick();
  assert.equal(ctx.studioLibraryActive,null);
  assert.equal(ctx.studioDraft.frames.length,0);
  assert.equal(ctx.studioWorkspaceId,'draft_1');
  assert.equal(h.checkpoints.get('project_old').draft.name,'Working modification');
  assert.equal(stored.get('old').project.name,'Existing work');
  ctx.requestStudioSwitch('open','old');await h.tick();
  assert.equal(ctx.studioLibraryActive.id,'old');
  assert.equal(ctx.studioDraft.name,'Working modification');
  assert.equal(ctx.studioLibraryDirty(),true);
  assert.equal(ctx.studioWorkspaceId,'project_old');
});

test('two independent new drafts can be resumed without Save, Discard or duplicate dialog',async()=>{
  const h=projectLifecycleHarness(),{ctx}=h;
  ctx.requestStudioSwitch('new');await h.tick();
  ctx.studioDraft={...ctx.studioDraft,name:'Draft alpha',frames:[{key:'a'}]};
  const alpha=ctx.studioWorkspaceId;
  ctx.requestStudioSwitch('new');await h.tick();
  const beta=ctx.studioWorkspaceId;
  assert.notEqual(alpha,beta);
  ctx.studioDraft={...ctx.studioDraft,name:'Draft beta',frames:[{key:'b'}]};
  ctx.requestStudioSwitch('draft',alpha);await h.tick();
  assert.equal(ctx.studioDraft.name,'Draft alpha');
  ctx.requestStudioSwitch('draft',beta);await h.tick();
  assert.equal(ctx.studioDraft.name,'Draft beta');
  assert.equal(ctx.studioLibraryBusy,false);
});

test('switching cannot discard an editor when checkpoint validation fails',()=>{
  const h=projectLifecycleHarness(),{ctx}=h;
  ctx.studioDraft={...ctx.studioDraft,name:'Invalid but valuable editor'};
  ctx.saveStudioDraft=()=>false;
  ctx.requestStudioSwitch('new');
  assert.equal(ctx.studioDraft.name,'Invalid but valuable editor');
  assert.equal(ctx.studioWorkspaceId,'project_old');
  assert.match(ctx.studioLibraryMessage,/failed validation or storage/);
});

test('switching is blocked if both local and IndexedDB persistence fail',async()=>{
  const h=projectLifecycleHarness(),{ctx}=h;
  ctx.studioDraft={...ctx.studioDraft,name:'Do not lose me'};
  h.failDraft(true);ctx.requestStudioSwitch('new');await h.tick();
  assert.equal(ctx.studioDraft.name,'Do not lose me');
  assert.equal(ctx.studioWorkspaceId,'project_old');
  assert.match(ctx.studioLibraryMessage,/could not be stored/);
  h.failDraft(false);ctx.requestStudioSwitch('new');await h.tick();
  assert.equal(ctx.studioDraft.frames.length,0);
});

test('failed library Save keeps the working copy and saved project unchanged',async()=>{
  const h=projectLifecycleHarness(),{ctx,stored}=h;
  ctx.studioDraft={...ctx.studioDraft,name:'Uncommitted title'};
  h.failSave(true);
  assert.equal(await ctx.saveNamedAnimation(true),false);
  assert.equal(ctx.studioDraft.name,'Uncommitted title');
  assert.equal(stored.get('old').project.name,'Existing work');
  h.failSave(false);
  assert.equal(await ctx.saveNamedAnimation(true),true);
  assert.equal(stored.get('old').project.name,'Uncommitted title');
});

test('renaming an active saved record updates its revision without overwriting editor changes',async()=>{
  const h=projectLifecycleHarness(),{ctx,stored}=h;
  ctx.studioDraft={...ctx.studioDraft,name:'Locally edited title'};
  ctx.renameNamedAnimation('old','Renamed in library');await h.tick();
  assert.equal(stored.get('old').project.name,'Renamed in library');
  assert.equal(ctx.studioDraft.name,'Locally edited title');
  assert.equal(ctx.studioLibraryActive.updatedAt,2);
  assert.equal(h.checkpoints.get('project_old').libraryRevision,2);
});

test('Save As creates a deliberate copy, keeps the original working state',async()=>{
  const h=projectLifecycleHarness(),{ctx,stored}=h;
  ctx.studioDraft={...ctx.studioDraft,name:'Fork'};
  assert.equal(await ctx.saveNamedAnimation(false),true);
  assert.equal(ctx.studioWorkspaceId,'project_created-1');
  assert.equal(stored.get('old').project.name,'Existing work');
  assert.equal(h.checkpoints.get('project_old').draft.name,'Existing work');
});

test('opening a project is generation-guarded against concurrent edits',async()=>{
  const h=projectLifecycleHarness(),{ctx}=h;
  ctx.requestStudioSwitch('open','other');
  ctx.studioDraftGeneration+=2;await h.tick();
  assert.equal(ctx.studioDraft.name,'Existing work');
  assert.equal(ctx.studioLibraryActive.id,'old');
  assert.match(ctx.studioLibraryMessage,/draft changed while switching/);
});

test('Save project reveals its card and failed save never does',async()=>{
  const h=projectLifecycleHarness(),{ctx,stored}=h;
  ctx.studioLibraryActive=null;ctx.studioLibrarySelected='old';
  ctx.studioWorkspaceId='draft_7';
  ctx.studioDraft={...ctx.studioDraft,name:'New library animation'};
  ctx.studioLibraryExpanded=false;ctx.studioLibraryScroll=750;
  h.failSave(true);
  assert.equal(await ctx.saveNamedAnimation(false),false);
  assert.equal(ctx.studioLibraryExpanded,false);
  h.failSave(false);
  assert.equal(await ctx.saveNamedAnimation(false),true);
  assert.equal(ctx.studioLibraryExpanded,true);
  assert.equal(ctx.studioLibraryScroll,0);
  assert.equal(ctx.studioLibrarySelected,ctx.studioLibraryActive.id);
  assert.equal(stored.get(ctx.studioLibrarySelected).project.name,'New library animation');
});

test('Save project and JSON backup controls are visually grouped, not a single export action',()=>{
  const ui=require('../src/ui/modern/ModernAnimationStudioUI');
  const doc={createElement(tag){return {tagName:tag,children:[],listeners:{},textContent:'',className:'',
    disabled:false,appendChild(node){this.children.push(node);return node;},
    addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(name,value){this[name]=value;}};}};
  const host=doc.createElement('section');
  ui.renderLibrary(doc,host,[],{canSave:true},{});
  const row=host.children.find(n=>n.className==='modern-animation-library-controls');
  assert.equal(row.children.length,2);
  assert.equal(row.children[0].children[0].textContent,'Projects');
  assert.equal(row.children[1].children[0].textContent,'JSON backup');
  assert.ok(row.children[0].children.some(n=>n.textContent==='Save project'));
  assert.ok(row.children[1].children.some(n=>n.textContent==='Export selected'));
  assert.ok(host.children.some(n=>n.textContent.includes('Preview animation never adds')));
});

test('Spline and Linear camera projects are distinct saved animations, but missing v1 mode equals Linear',async()=>{
  const db=memoryIndexedDB(),a=experiment(),b=structuredClone(a),c=structuredClone(a);
  b.scene.camera.Height=45;
  c.scene.camera.Height=25;
  let draft=studio.history([101,102,103],[a,b,c].map((value,i)=>({
    id:101+i,name:'Camera '+i,experiment:value
  })));
  draft=studio.edit(draft,'name','Camera flight');
  const linear=studio.build(draft,'linear_camera');
  const old=structuredClone(linear);delete old.interpolation;
  assert.equal(library.fingerprint(linear),library.fingerprint(old),
    'pre-Spline version-1 projects have the same semantic identity as explicit Linear');
  const spline=studio.build(studio.edit(draft,'interpolation','spline'),'spline_camera');
  assert.notEqual(library.fingerprint(linear),library.fingerprint(spline),
    'same camera endpoints and timing do not mean the same flight');
  await library.create(db,old,'auto',100);
  await library.create(db,spline,'auto',200);
  assert.equal((await library.list(db)).length,2);
  await assert.rejects(library.create(db,{...linear,id:'linear_duplicate'},'auto',300),
    error=>error.code==='ANIMATION_DUPLICATE'&&error.existingId==='linear_camera');
  const groups=library.findDuplicates(await library.list(db));
  assert.equal(groups.length,0,'different interpolation modes must not be grouped as duplicates');
});

test('Spline named project survives Save Changes, reopen, portable JSON and full resave',async()=>{
  const sourceDb=memoryIndexedDB(),targetDb=memoryIndexedDB();
  const a=experiment(),b=structuredClone(a),c=structuredClone(a),d=structuredClone(a);
  b.scene.camera.Height=45;c.scene.camera.Height=25;d.scene.camera.Height=60;
  b.scene.camera.Pan=4;c.scene.camera.Pan=9;d.scene.camera.Pan=11;
  const snapshots=[a,b,c,d].map((value,i)=>({id:i+101,name:'Waypoint '+i,experiment:value}));
  let draft=studio.history([101,102,103,104],snapshots);
  draft=studio.edit(draft,'name','Camera spline saved');
  draft=studio.edit(draft,'interpolation','spline');
  draft=studio.editFrame(draft,'history-102','travelMs','2.5');
  draft=studio.editFrame(draft,'history-103','holdMs','1.25');
  draft=studio.editFrame(draft,'history-104','travelMs','6.5');
  const first=studio.build(draft,'camera_saved');
  await library.create(sourceDb,first,'accurate',1100);
  const reopened=studio.fromProject((await library.get(sourceDb,'camera_saved')).project);
  assert.equal(reopened.interpolation,'spline');
  assert.deepEqual(studio.build(reopened,'camera_saved'),first,
    'opening a saved animation and rebuilding its editable keyframes must not alter the project');
  const time=3100;
  const expected=animation.sampleAt(first,time).scene.camera;
  assert.deepEqual(animation.sampleAt(studio.build(reopened,'camera_saved'),time).scene.camera,expected);
  const changed=studio.edit(reopened,'description','Saved spline draft after reopen');
  const saved=await library.update(sourceDb,studio.build(changed,'camera_saved'),'accurate',1100,1200);
  assert.equal(saved.project.interpolation,'spline');
  const backup=library.exportPortable([saved]);
  assert.equal(JSON.parse(backup).animations[0].project.interpolation,'spline');
  const restored=await library.importEntries(targetDb,library.parsePortable(backup),1300,
    {randomUUID:()=> '1111-2222'});
  assert.deepEqual([restored.created,restored.reused],[1,0]);
  const imported=(await library.list(targetDb))[0];
  assert.equal(imported.project.interpolation,'spline');
  assert.equal(imported.project.description,'Saved spline draft after reopen');
  assert.equal(imported.project.keyframes[2].holdMs,1250);
  assert.deepEqual(imported.project.keyframes.map(f=>f.travelMs),[0,2500,5000,6500]);
  assert.ok(imported.project.keyframes.every(f=>f.sourceSnapshotId===null));
  assert.deepEqual(animation.sampleAt(imported.project,time).scene.camera,expected);
  const rebuilt=studio.build(studio.fromProject(imported.project),imported.id);
  assert.deepEqual(rebuilt,imported.project,'JSON-imported project must reopen and resave without drift');
  const repeat=await library.importEntries(targetDb,library.parsePortable(backup),1400,
    {randomUUID:()=> '3333-4444'});
  assert.deepEqual([repeat.created,repeat.reused],[0,1]);
});

test('Portable JSON retains both Linear and Spline alternatives and restores legacy linear projects',async()=>{
  const db=memoryIndexedDB(),a=experiment(),b=structuredClone(a),c=structuredClone(a);
  b.scene.camera.Height=45;c.scene.camera.Height=25;
  let draft=studio.history([201,202,203],[a,b,c].map((value,i)=>({
    id:201+i,name:'Flight '+i,experiment:value
  })));
  draft=studio.edit(draft,'name','Flight');
  const linear=studio.build(draft,'linear_export');
  const spline=studio.build(studio.edit(draft,'interpolation','spline'),'spline_export');
  const legacy=structuredClone(linear);delete legacy.interpolation;
  const payload=library.exportPortable([
    library.record(legacy,'auto','linear_export',100,100),
    library.record(spline,'fast','spline_export',101,101)
  ]);
  const batch=library.parsePortable(payload);
  const result=await library.importEntries(db,batch,200,
    {randomUUID:()=> '0000-1111'});
  assert.deepEqual([result.created,result.reused],[2,0]);
  const saved=await library.list(db);
  assert.equal(saved.filter(x=>x.project.interpolation==='spline').length,1);
  assert.equal(saved.filter(x=>!Object.hasOwn(x.project,'interpolation')).length,1);
  const rebuilt=studio.build(studio.fromProject(saved.find(x=>!x.project.interpolation).project),'legacy_rebuilt');
  assert.equal(rebuilt.interpolation,'linear');
  assert.deepEqual(animation.sampleAt(rebuilt,2500).scene.camera,
    animation.sampleAt(legacy,2500).scene.camera);
  const again=await library.importEntries(db,batch,300);
  assert.deepEqual([again.created,again.reused],[0,2]);
  const solo=library.parsePortable(JSON.stringify(spline));
  assert.equal(solo[0].project.interpolation,'spline');
  assert.equal((await library.list(db)).length,2);
});

test('Studio Save changes compares restored Spline mode but keeps old v1 Linear projects clean',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  const start=app.indexOf('  function studioProjectDiffers(');
  const end=app.indexOf('  function renderStudioLibrary(){',start);
  assert.ok(start>0&&end>start);
  const a=experiment(),b=structuredClone(a),c=structuredClone(a);
  b.scene.camera.Height=45;c.scene.camera.Height=25;
  let draft=studio.history([11,12,13],[a,b,c].map((value,i)=>({
    id:11+i,name:'Camera '+i,experiment:value
  })));
  draft=studio.edit(draft,'name','Legacy flight');
  const old=structuredClone(studio.build(draft,'saved_v1'));
  delete old.interpolation;
  const context=vm.createContext({studioApi:studio,studioPlaybackQuality:'auto',
    studioLibraryActive:{id:'saved_v1',project:old,quality:'auto'},
    studioDraft:studio.fromProject(old),cameraHudAppearance:null});
  vm.runInContext(app.slice(start,end)+'\nthis.dirty=studioLibraryDirty;',context);
  assert.equal(context.dirty(),false,'opening an old project must not create a false dirty badge');
  context.studioDraft=studio.edit(context.studioDraft,'interpolation','spline');
  assert.equal(context.dirty(),true,'switching Linear to Spline requires Save changes');
  const committed=studio.build(context.studioDraft,'saved_v1');
  context.studioLibraryActive={id:'saved_v1',project:committed,quality:'auto'};
  assert.equal(context.dirty(),false,'after Save changes the selected Spline mode is clean');
  context.studioDraft=studio.edit(context.studioDraft,'interpolation','linear');
  assert.equal(context.dirty(),true,'switching back to Linear is also an unsaved edit');
  context.studioLibraryActive={id:'saved_v1',project:old,quality:'auto'};
  assert.equal(context.dirty(),false,'returning to a legacy v1 Linear project clears the dirty flag');
});


test('Library card edit badge and Save changes agree for legacy Linear and actual Spline edits',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  const helper=app.slice(app.indexOf('  function studioProjectDiffers('),
    app.indexOf('  function studioHasUnsavedWork(){'));
  const card=app.slice(app.indexOf('  function studioWorkspaceEditedIds(){'),
    app.indexOf('  function studioWorkspaceDraftCards(){'));
  const a=experiment(),b=structuredClone(a),c=structuredClone(a);
  b.scene.camera.Height=45;c.scene.camera.Height=25;
  let draft=studio.history([21,22,23],[a,b,c].map((scene,i)=>({
    id:21+i,name:'Camera '+i,experiment:scene
  })));
  draft=studio.edit(draft,'name','Legacy camera motion');
  const saved=structuredClone(studio.build(draft,'saved_v1'));
  delete saved.interpolation;
  const record={id:'saved_v1',project:saved,quality:'auto',updatedAt:100};
  const checkpoint={draft:studio.fromProject(saved),quality:'auto',libraryRevision:100};
  const ctx=vm.createContext({studioApi:studio,studioDraft:checkpoint.draft,
    studioPlaybackQuality:'auto',studioLibraryActive:record,studioLibraryEntries:[record],
    studioWorkspaces:{},studioDraftAutosave:{projectWorkspaceId:id=>'project_'+id,
      getWorkspace:()=>checkpoint}});
  vm.runInContext(helper+card+'\nthis.dirty=studioLibraryDirty;this.edited=studioWorkspaceEditedIds;',ctx);
  assert.equal(ctx.dirty(),false);
  assert.deepEqual(Array.from(ctx.edited()),[],'legacy Linear draft has no false badge');
  checkpoint.libraryRevision=50;
  assert.deepEqual(Array.from(ctx.edited()),[],'revision mismatch alone is not an edit');
  checkpoint.draft=studio.edit(checkpoint.draft,'interpolation','spline');
  ctx.studioDraft=checkpoint.draft;
  assert.equal(ctx.dirty(),true);
  assert.deepEqual(Array.from(ctx.edited()),['saved_v1']);
  record.project=studio.build(checkpoint.draft,'saved_v1');
  assert.equal(ctx.dirty(),false);
  assert.deepEqual(Array.from(ctx.edited()),[]);
  checkpoint.quality='fast';ctx.studioPlaybackQuality='fast';
  assert.equal(ctx.dirty(),true);
  assert.deepEqual(Array.from(ctx.edited()),['saved_v1']);
});

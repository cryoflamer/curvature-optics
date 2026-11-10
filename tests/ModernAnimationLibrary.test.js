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

test('library UI warns before duplicates and offers explicit copy plus manual review',()=>{
  const ui=require('../src/ui/modern/ModernAnimationStudioUI');
  const doc={createElement(tag){return {tagName:tag,children:[],listeners:{},textContent:'',
    className:'',value:'',disabled:false,appendChild(node){this.children.push(node);return node;},
    addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(name,v){this[name]=v;}};}};
  const host=doc.createElement('section'),original=studio.build(source(),'one'),copy=structuredClone(original);
  copy.id='two';copy.name='Other title';
  const a=library.record(original,'auto','one',10,11),b=library.record(copy,'fast','two',12,13);
  const calls=[],actions={save:()=>{},saveAs:()=>{},saveChanges:()=>{},
    toggleExpanded:()=>{},toggleDuplicates:()=>calls.push('review'),
    openDuplicate:()=>calls.push('existing'),forceCopy:()=>calls.push('force'),
    open:id=>calls.push(['open',id]),remove:id=>calls.push(['delete',id]),
    select:()=>{},renameStart:()=>{},renameCancel:()=>{},rename:()=>{}};
  ui.renderLibrary(doc,host,[a,b],{expanded:true,duplicate:{id:'one',name:original.name},
    duplicateGroups:library.findDuplicates([a,b]),showDuplicates:true},actions);
  const nodes=(function walk(n){return [n,...n.children.flatMap(walk)];})(host);
  for(const [label,value] of [['Open existing','existing'],['Save copy anyway','force'],
    ['Hide duplicates','review']]){
    nodes.find(n=>n.tagName==='button'&&n.textContent===label).listeners.click();
    assert.equal(calls.at(-1),value);
  }
  assert.ok(nodes.some(n=>n.textContent.includes('none will be deleted automatically')));
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
  assert.match(ui,/Save changes/);
  assert.match(ui,/Save As/);
  assert.match(app,/Opening a saved animation replaces the current draft/);
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
    saveAs:()=>calls.push('saveAs'),saveChanges:()=>calls.push('saveChanges'),
    open:id=>calls.push(['open',id]),remove:id=>calls.push(['delete',id]),
    renameStart:id=>calls.push(['renameStart',id]),
    renameCancel:()=>calls.push('renameCancel'),
    rename:(id,name)=>calls.push(['rename',id,name]),
    toggleExpanded:()=>calls.push('toggle')};
  function nodes(){return (function collect(n){return [n,...n.children.flatMap(collect)];})(host);}
  ui.renderLibrary(doc,host,entries,
    {selectedId:'animation_a',activeId:'animation_a',canSave:true,dirty:true,expanded:true},actions);
  assert.ok(nodes().find(n=>n.textContent==='Editing saved project · Unsaved changes'));
  assert.equal(nodes().find(n=>n.tagName==='img').src,preview.dataUrl);
  assert.ok(nodes().find(n=>n.textContent==='Physical · Surface curvature' ||
    n.textContent.includes('Earth curvature · 2 frames')));
  assert.equal(nodes().find(n=>n.textContent==='Save animation').disabled,true);
  for(const [label,value] of [['Save changes','saveChanges'],['Save As','saveAs']]){
    nodes().find(n=>n.tagName==='button'&&n.textContent===label).listeners.click();
    assert.equal(calls.at(-1),value);
  }
  nodes().find(n=>n.tagName==='button'&&n.textContent==='Open').listeners.click();
  assert.deepEqual(calls.at(-1),['open','animation_a']);
  nodes().find(n=>n.tagName==='button'&&n.textContent==='Delete').listeners.click();
  assert.deepEqual(calls.at(-1),['delete','animation_a']);
  nodes().find(n=>n.tagName==='button'&&n.textContent==='Rename').listeners.click();
  assert.deepEqual(calls.at(-1),['renameStart','animation_a']);
  host.children=[];ui.renderLibrary(doc,host,entries,
    {selectedId:'animation_a',renameId:'animation_a',expanded:true},actions);
  const input=nodes().find(n=>n.tagName==='input');input.value='New title';
  nodes().find(n=>n.tagName==='button'&&n.textContent==='Save name').listeners.click();
  assert.deepEqual(calls.at(-1),['rename','animation_a','New title']);
  host.children=[];ui.renderLibrary(doc,host,entries,{selectedId:'',expanded:false},actions);
  assert.equal(nodes().filter(n=>n.className.includes('modern-animation-library-card')).length,0);
  nodes().find(n=>n.textContent==='Show projects').listeners.click();
  assert.equal(calls.at(-1),'toggle');
  host.children=[];ui.renderLibrary(doc,host,[],{selectedId:'',canSave:false},actions);
  assert.equal(nodes().find(n=>n.textContent==='Save animation').disabled,true);
});

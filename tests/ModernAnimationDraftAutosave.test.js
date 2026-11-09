'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const autosave=require('../src/animation/ModernAnimationDraftAutosave');
const studio=require('../src/animation/ModernAnimationStudio');
const projects=require('../src/animation/ModernAnimationProject');
const playback=require('../src/animation/ModernAnimationPlayback');
const experiments=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');

function scene(){
  const model={Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Saved studio',Description:'',
    ObjType:[3,3],NObjects:[2,0],ObjDist:[50,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[10,10],ObjSizeVar:[0,0]};
  return experiments.capture(model,{atmosphere:'standard',occlusionRadius:6371000,
    preset:'custom',resetPreset:'single'},compare.preset('globe-flat-vacuum'),
  {mode:'scene',eyeLevel:true,horizon:true,selected:'A'});
}
function storage(){
  const data=new Map();
  return {getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,v),
    removeItem:k=>data.delete(k)};
}
function memoryIndexedDB(){
  const records=new Map();
  return {open(name,version){
    assert.equal(name,autosave.DATABASE);assert.equal(version,1);
    const request={result:null,error:null};
    queueMicrotask(()=>{
      const upgrade=!records.has('created');
      const db={objectStoreNames:{contains:k=>k===autosave.STORE&&records.has('created')},
        createObjectStore:k=>{assert.equal(k,autosave.STORE);records.set('created',true);},
        close(){},transaction(k,mode){
          assert.equal(k,autosave.STORE);
          const tx={oncomplete:null,onerror:null,onabort:null,error:null};
          const done=()=>queueMicrotask(()=>tx.oncomplete&&tx.oncomplete());
          tx.objectStore=()=>({
            get(key){const op={result:undefined};queueMicrotask(()=>{
              op.result=records.get(key);done();});return op;},
            put(value,key){assert.equal(mode,'readwrite');records.set(key,structuredClone(value));done();},
          });return tx;
        }};
      request.result=db;
      if(upgrade)request.onupgradeneeded();
      request.onsuccess();
    });
    return request;
  }};
}
function physicalDraft(){
  const a=scene(),b=structuredClone(a);b.scene.surface.showModel=2;
  const draft=studio.history([41,42],[{id:41,name:'Globe',experiment:a},
    {id:42,name:'Flat',experiment:b}]);
  return studio.editFrame(studio.edit(draft,'name','Globe → Flat'),'history-42','travelMs','7.5');
}

test('versioned checkpoint restores independent Globe → Flat draft, prepared project and paused seek',()=>{
  const draft=physicalDraft(),project=studio.build(draft,'studio_draft');
  assert.equal(project.mode,'physical');
  const before=structuredClone(draft),local=storage();
  const checkpoint=autosave.checkpoint({draft,selectedKey:'history-42',quality:'accurate',
    prepared:true,positionMs:3750},1000);
  assert.equal(autosave.writeLocal(local,checkpoint),true);
  const restored=autosave.readLocal(local);
  assert.deepEqual(restored,checkpoint);
  const rebuilt=studio.build(restored.draft,'studio_draft');
  const player=playback.create(rebuilt);
  player.seek(restored.positionMs,10000);
  assert.equal(player.status().playing,false);
  assert.equal(player.status().positionMs,3750);
  assert.equal(player.sample().scene.surface.showModel,1);
  assert.ok(player.sample().scene.surface.rEarth>6371000);
  player.seek(7500,10000);
  assert.equal(player.sample().scene.surface.showModel,2);
  assert.equal(restored.draft.frames[1].name,'Flat');
  assert.deepEqual(draft,before,'autosave does not mutate source draft');
});

test('an incompatible or unfinished draft is still recovered without forced preparation',()=>{
  const draft=physicalDraft();
  draft.frames[1].experiment.scene.camera.Height=99;
  assert.equal(studio.inspect(draft).compatible,false);
  let checkpoint=autosave.checkpoint({draft,selectedKey:'history-41',quality:'fast',
    prepared:false,positionMs:0},2000);
  assert.equal(autosave.normalize(checkpoint).draft.frames.length,2);
  assert.throws(()=>studio.build(checkpoint.draft,'broken'),/incompatible/i);
  checkpoint=autosave.checkpoint({draft:studio.blank(),selectedKey:null,quality:'auto',
    prepared:false,positionMs:0},2001);
  assert.equal(checkpoint.draft.frames.length,0);
});

test('checkpoint validation rejects corrupt records and duplicate IDs without overwriting data',()=>{
  const checkpoint=autosave.checkpoint({draft:physicalDraft(),selectedKey:'missing',
    quality:'auto',prepared:false,positionMs:0},30);
  assert.equal(checkpoint.selectedKey,null,'missing selected key is cleared');
  assert.throws(()=>autosave.normalize({...checkpoint,version:2}),/checkpoint/);
  assert.throws(()=>autosave.normalize({...checkpoint,positionMs:Infinity}),/number/);
  assert.throws(()=>autosave.normalize({...checkpoint,quality:'unsupported'}),/quality/);
  const corrupted=structuredClone(checkpoint);
  corrupted.draft.frames[1].key=corrupted.draft.frames[0].key;
  assert.throws(()=>autosave.normalize(corrupted),/Duplicate/);
  const old=storage();old.setItem(autosave.STORAGE_KEY,'{"version":99}');
  assert.equal(autosave.readLocal(old),null);
  old.setItem(autosave.STORAGE_KEY,'{broken');
  assert.equal(autosave.readLocal(old),null);
  assert.equal(autosave.readLocal(null),null);
  assert.equal(autosave.writeLocal(null,checkpoint),false);
  const denied={getItem(){throw Error('denied');},setItem(){throw Error('quota');}};
  assert.equal(autosave.readLocal(denied),null);
  assert.throws(()=>autosave.writeLocal(denied,checkpoint),/quota/);
  assert.equal(autosave.newer({...checkpoint,savedAt:20},checkpoint).savedAt,30);
  assert.equal(autosave.newer(checkpoint,{...checkpoint,savedAt:20}).savedAt,30);
});

test('IndexedDB retains a single durable animation checkpoint independent of localStorage',async()=>{
  const db=memoryIndexedDB(),local=storage();
  assert.equal(await autosave.read(db),null);
  const first=autosave.checkpoint({draft:physicalDraft(),selectedKey:'history-41',
    quality:'accurate',prepared:true,positionMs:1000},100);
  await autosave.write(db,first);
  const newer=autosave.checkpoint({draft:physicalDraft(),selectedKey:'history-42',
    quality:'fast',prepared:true,positionMs:7400},200);
  await autosave.write(db,newer);
  assert.deepEqual(await autosave.read(db),newer);
  assert.equal(autosave.readLocal(local),null);
  assert.deepEqual(autosave.newer(first,await autosave.read(db)),newer);
  assert.deepEqual(autosave.newer(null,newer),newer);
  assert.deepEqual(autosave.newer(first,null),first);
  assert.equal(await autosave.read(null),null);
  assert.equal(await autosave.write(null,newer),null);
  await assert.rejects(autosave.read({open(){throw Error('blocked');}}),/blocked/);
});

test('Modern entrypoint wires draft recovery separately from physical session and History',()=>{
  const root=path.join(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  assert.ok(html.indexOf('ModernAnimationStudio.js')<html.indexOf('ModernAnimationDraftAutosave.js'));
  assert.ok(html.indexOf('ModernAnimationDraftAutosave.js')<html.indexOf('ModernApp.js'));
  assert.match(html,/id="ModernAnimationDraftStatus"/);
  assert.match(app,/bindStudioDraftPersistence\(\)/);
  assert.match(app,/studioDraftGeneration!==generation/);
  assert.match(app,/studioPlayback\.seek\(saved\.positionMs,profileNow\(\)\)/);
  assert.match(app,/saveStudioDraft\(!!next\.playing\)/);
  assert.match(app,/root\.addEventListener\('pagehide'/);
});

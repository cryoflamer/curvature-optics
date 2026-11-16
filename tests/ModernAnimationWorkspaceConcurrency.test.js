'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const autosave=require('../src/animation/ModernAnimationDraftAutosave');
const studio=require('../src/animation/ModernAnimationStudio');
const experiments=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');

function draft(name,stamp,libraryId=null){
  const model={Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Draft',Description:'',
    ObjType:[3,3],NObjects:[2,0],ObjDist:[50,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[10,10],ObjSizeVar:[0,0]};
  const experiment=experiments.capture(model,{atmosphere:'standard',occlusionRadius:6371000,
    preset:'custom',resetPreset:'single'},compare.preset('globe-flat-vacuum'),
  {mode:'scene',eyeLevel:true,horizon:true,selected:'A'});
  const initial=studio.history([1],[{id:1,name:'Reference',experiment}]);
  const edited=studio.edit(initial,'name',name);
  return autosave.checkpoint({draft:edited,selectedKey:edited.frames[0].key,
    quality:'auto',prepared:false,positionMs:0,libraryId:libraryId,
    libraryRevision:libraryId?10:null},stamp);
}
function clock(){let n=0;return {randomUUID(){return 'unique00000000'+(++n).toString(16).padStart(20,'0');}};}
function memoryStorage(){
  const values=new Map();return {get length(){return values.size;},
    key(i){return [...values.keys()][i]??null;},
    getItem(k){return values.has(k)?values.get(k):null;},
    setItem(k,v){values.set(k,String(v));},removeItem(k){values.delete(k)} };
}
// Transaction-complete events and single readwrite writer emulate the
// IndexedDB guarantee on which atomic collection reconciliation depends.
function memoryIndexedDB(){
  const values=new Map();let lock=Promise.resolve(),created=false;
  return {values,open(name,version){
    assert.equal(name,autosave.DATABASE);assert.equal(version,1);
    const request={};queueMicrotask(()=>{
      const db={objectStoreNames:{contains:()=>created},createObjectStore(){created=true;},close(){},
        transaction(store,mode){
          assert.equal(store,autosave.STORE);
          let unlock;const prev=lock;lock=new Promise(resolve=>unlock=resolve);
          let pending=0,finished=false;
          const tx={oncomplete:null,onerror:null,onabort:null,error:null,abort(){
            if(finished)return;finished=true;unlock();queueMicrotask(()=>tx.onabort?.());
          }};
          function run(action){
            pending++;prev.then(()=>queueMicrotask(()=>{
              if(finished)return;
              try{action();}catch(e){tx.error=e;tx.abort();return;}
              pending--;if(!pending){finished=true;unlock();queueMicrotask(()=>tx.oncomplete?.());}
            }));
          }
          tx.objectStore=()=>({
            get(k){const op={result:undefined,error:null};run(()=>{
              op.result=values.get(k);op.onsuccess?.();
            });return op;},
            put(record,key){assert.equal(mode,'readwrite');run(()=>{
              values.set(key,structuredClone(record));
            });},
          });return tx;
        }};
      request.result=db;if(!created)request.onupgradeneeded?.();request.onsuccess?.();
    });return request;
  }};
}
function makeTwo(){
  const a=draft('A first',100,'alpha'),b=draft('B first',101,'beta');
  return autosave.withWorkspace(autosave.collection('project_alpha',a,200),
    'project_beta',b,201);
}

test('concurrent tabs editing different projects merge atomically rather than overwriting',async()=>{
  const db=memoryIndexedDB(),crypto=clock(),base=makeTwo();
  await autosave.writeCollection(db,base);
  const a=autosave.withWorkspace(base,'project_alpha',draft('A edited',300,'alpha'),301);
  const b=autosave.withWorkspace(base,'project_beta',draft('B edited',400,'beta'),401);
  const results=await Promise.all([
    autosave.writeCollectionMerged(db,a,base,crypto),
    autosave.writeCollectionMerged(db,b,base,crypto)
  ]);
  assert.deepEqual(results.map(x=>x.conflicts),[[],[]]);
  const stored=await autosave.readCollection(db);
  assert.equal(autosave.getWorkspace(stored,'project_alpha').draft.name,'A edited');
  assert.equal(autosave.getWorkspace(stored,'project_beta').draft.name,'B edited');
});

test('same-ID edit conflict creates a distinct recoverable draft, never a silent overwrite',async()=>{
  const db=memoryIndexedDB(),crypto=clock(),base=makeTwo();
  await autosave.writeCollection(db,base);
  const left=autosave.withWorkspace(base,'project_alpha',draft('Left changes',310,'alpha'),312);
  const right=autosave.withWorkspace(base,'project_alpha',draft('Right changes',320,'alpha'),322);
  await autosave.writeCollectionMerged(db,left,base,crypto);
  const result=await autosave.writeCollectionMerged(db,right,base,crypto);
  assert.equal(result.conflicts.length,1);
  const {forkId}=result.conflicts[0];assert.match(forkId,/^draft_/);
  const stored=await autosave.readCollection(db);
  assert.equal(autosave.getWorkspace(stored,'project_alpha').draft.name,'Left changes');
  const recovered=autosave.getWorkspace(stored,forkId);
  assert.equal(recovered.draft.name,'Right changes');
  assert.equal(recovered.libraryId,null);
  assert.equal(result.collection.activeId,forkId);
  assert.deepEqual((await autosave.readCollection(db)).workspaces,stored.workspaces);
});

test('stale delete cannot erase another tab edit, and stale edit cannot resurrect a deletion',async()=>{
  const crypto=clock(),base=makeTwo();
  const deleted=autosave.withoutWorkspace(base,'project_alpha','project_beta',410);
  const modified=autosave.withWorkspace(base,'project_alpha',draft('Keep newer work',420,'alpha'),421);
  const db=memoryIndexedDB();await autosave.writeCollection(db,base);
  await autosave.writeCollectionMerged(db,modified,base,crypto);
  const rejection=await autosave.writeCollectionMerged(db,deleted,base,crypto);
  assert.deepEqual(rejection.protectedDeletes,['project_alpha']);
  assert.equal(autosave.getWorkspace(await autosave.readCollection(db),'project_alpha').draft.name,
    'Keep newer work');
  const db2=memoryIndexedDB();await autosave.writeCollection(db2,base);
  await autosave.writeCollectionMerged(db2,deleted,base,crypto);
  const result=await autosave.writeCollectionMerged(db2,modified,base,crypto);
  assert.equal(result.conflicts.length,1);
  const saved=await autosave.readCollection(db2);
  assert.equal(autosave.getWorkspace(saved,'project_alpha'),null);
  assert.equal(autosave.getWorkspace(saved,result.conflicts[0].forkId).draft.name,'Keep newer work');
});

test('session-local crash backups remain independent and combine with durable data',()=>{
  const storage=memoryStorage(),base=makeTwo();
  const a=autosave.withWorkspace(base,'project_alpha',draft('A unsent',500,'alpha'),501);
  const b=autosave.withWorkspace(base,'project_beta',draft('B unsent',600,'beta'),601);
  autosave.writeSessionLocal(storage,a,'tab_aaaaaaaa');
  autosave.writeSessionLocal(storage,b,'tab_bbbbbbbb');
  assert.equal(autosave.readSessionLocals(storage).length,2);
  const recovered=autosave.combineCollections([...autosave.readSessionLocals(storage),base]);
  assert.equal(autosave.getWorkspace(recovered,'project_alpha').draft.name,'A unsent');
  assert.equal(autosave.getWorkspace(recovered,'project_beta').draft.name,'B unsent');
  assert.equal(storage.getItem(autosave.COLLECTION_KEY),null,
    'new backups never overwrite the legacy shared key');
  assert.throws(()=>autosave.writeSessionLocal(storage,a,'oops'),/session/);
});

test('deletion tombstones prevent stale local crash backup from reviving removed workspace',()=>{
  const base=makeTwo(),deleted=autosave.withoutWorkspace(base,'project_alpha','project_beta',600);
  const recovered=autosave.combineCollections([base,deleted]);
  assert.equal(autosave.getWorkspace(recovered,'project_alpha'),null);
  assert.equal(recovered.removed[0].id,'project_alpha');
  assert.deepEqual(autosave.withWorkspace(recovered,'project_alpha',draft('Recreated',700,'alpha'),701)
    .removed||[],[]);
});

test('crash recovery forks different unsent edits of one workspace from two tabs',()=>{
  const storage=memoryStorage(),base=makeTwo();
  autosave.writeSessionLocal(storage,
    autosave.withWorkspace(base,'project_alpha',draft('Tab one unsent',500,'alpha'),501),
    'tab_aaaaaaaa');
  autosave.writeSessionLocal(storage,
    autosave.withWorkspace(base,'project_alpha',draft('Tab two unsent',510,'alpha'),511),
    'tab_bbbbbbbb');
  const sources=autosave.readSessionLocals(storage);
  const first=autosave.combineCollections(sources);
  const second=autosave.combineCollections(sources);
  assert.deepEqual(first,second,'recovery IDs must be stable across reloads');
  assert.equal(autosave.getWorkspace(first,'project_alpha').draft.name,'Tab two unsent');
  const found=first.workspaces.find(e=>e.id.startsWith('draft_recovered_'));
  assert.ok(found,'losing tab is recovered into a separate draft');
  assert.equal(found.checkpoint.draft.name,'Tab one unsent');
  assert.equal(found.checkpoint.libraryId,null);
});

test('playhead-only overlapping checkpoints do not multiply recovery forks',async()=>{
  const db=memoryIndexedDB(),crypto=clock(),base=makeTwo();
  await autosave.writeCollection(db,base);
  const playheadA=autosave.withWorkspace(base,'project_alpha',
    {...draft('A first',400,'alpha'),positionMs:100},401);
  const playheadB=autosave.withWorkspace(base,'project_alpha',
    {...draft('A first',500,'alpha'),positionMs:200},501);
  await autosave.writeCollectionMerged(db,playheadA,base,crypto);
  const result=await autosave.writeCollectionMerged(db,playheadB,base,crypto);
  assert.equal(result.conflicts.length,0);
  assert.equal(autosave.getWorkspace(result.collection,'project_alpha').positionMs,200);
});

test('failed transaction leaves independent synchronous crash backups intact',async()=>{
  const storage=memoryStorage(),current=makeTwo();
  autosave.writeSessionLocal(storage,current,'tab_deadbeef');
  await assert.rejects(autosave.writeCollectionMerged({open(){throw Error('denied');}},
    current,null,clock()),/denied/);
  const local=autosave.readSessionLocals(storage);
  assert.equal(local.length,1);
  assert.deepEqual(autosave.getWorkspace(local[0],'project_alpha'),
    autosave.getWorkspace(current,'project_alpha'));
});

test('Animation Studio redirects a conflicting opened project into an independent recoverable draft',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  const start=source.indexOf('  function persistStudioWorkspace(){');
  const end=source.indexOf('  function writeStudioDraftIndexedDB()',start);
  assert.ok(start>0&&end>start);
  const db=memoryIndexedDB(),crypto=clock(),base=makeTwo(),local=memoryStorage();
  await autosave.writeCollection(db,base);
  const fromOtherTab=autosave.withWorkspace(base,'project_alpha',
    draft('Remote saved',300,'alpha'),301);
  await autosave.writeCollectionMerged(db,fromOtherTab,base,crypto);
  const inEditor=autosave.withWorkspace(base,'project_alpha',
    draft('Editor work',310,'alpha'),311);
  const notices=[];
  const ctx={Promise,Date,Math,Object,studioDraftAutosave:autosave,
    studioWorkspaces:inEditor,studioIndexedBaseline:base,studioDraftGeneration:1,
    studioWorkspaceId:'project_alpha',studioLibraryActive:{id:'alpha'},
    studioLibraryPending:null,studioLibraryMessage:'',studioLibraryError:false,
    studioDraftWriteQueue:Promise.resolve(),studioDraftSaveTimer:null,
    studioWorkspaceLocalSaved:true,studioWorkspaceSessionId:'tab_aaaaaaaa',
    preferencesStorage:()=>local,studioDraftStatus:(message,isError)=>notices.push([message,isError]),
    renderStudioLibrary(){notices.push(['render']);},
    absorbLateStudioWorkspaces(){throw Error('unexpected concurrent editor modification');},
    root:{indexedDB:db,crypto},clearTimeout(){}};
  vm.runInNewContext(source.slice(start,end),ctx);
  assert.equal(await ctx.persistStudioWorkspace(),false,'a conflicting project switch must stop');
  assert.match(ctx.studioWorkspaceId,/^draft_/);
  assert.equal(ctx.studioLibraryActive,null);
  assert.ok(ctx.studioLibraryError);
  assert.equal(autosave.getWorkspace(ctx.studioWorkspaces,ctx.studioWorkspaceId).draft.name,
    'Editor work');
  const persisted=await autosave.readCollection(db);
  assert.equal(autosave.getWorkspace(persisted,'project_alpha').draft.name,'Remote saved');
  assert.equal(autosave.getWorkspace(persisted,ctx.studioWorkspaceId).draft.name,'Editor work');
  assert.equal(autosave.readSessionLocals(local).length,1);
  assert.ok(notices.some(x=>/separate draft/.test(x[0])));
});

test('completed older tab backups can be pruned without touching active or unsent backups',()=>{
  const storage=memoryStorage(),base=makeTwo(),modified=autosave.withWorkspace(base,
    'project_alpha',draft('Unsent tab changes',700,'alpha'),701);
  autosave.writeSessionLocal(storage,base,'tab_completed');
  autosave.writeSessionLocal(storage,modified,'tab_unsent');
  autosave.writeSessionLocal(storage,base,'tab_current');
  assert.equal(autosave.pruneSessionLocals(storage,base,'tab_current'),1);
  assert.equal(autosave.readSessionLocals(storage).length,2);
  assert.equal(autosave.pruneSessionLocals(storage,modified,'tab_current'),1);
  assert.equal(autosave.readSessionLocals(storage).length,1);
  assert.equal(autosave.readSessionLocals(storage)[0].sessionId,'tab_current');
});

test('an open but untouched editor is forked if another tab deleted or replaced its underlying project',async()=>{
  const crypto=clock(),base=autosave.normalizeCollection({
    ...makeTwo(),activeId:'project_alpha'});
  for(const remoteMutation of [
    autosave.withoutWorkspace(base,'project_alpha','project_beta',900),
    autosave.withWorkspace(base,'project_alpha',draft('Remote changed',950,'alpha'),951),
  ]){
    const db=memoryIndexedDB();await autosave.writeCollection(db,base);
    await autosave.writeCollectionMerged(db,remoteMutation,base,crypto);
    const result=await autosave.writeCollectionMerged(db,base,base,crypto);
    assert.equal(result.conflicts.length,1);
    assert.equal(result.conflicts[0].id,'project_alpha');
    assert.match(result.collection.activeId,/^draft_/);
    assert.equal(autosave.getWorkspace(result.collection,result.collection.activeId)
      .draft.name,'A first');
  }
});

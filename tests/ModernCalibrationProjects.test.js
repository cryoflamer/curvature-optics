'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const model=require('../src/ui/modern/ModernCalibrationProject');
const store=require('../src/ui/modern/ModernCalibrationProjectStore');
const A='calibration-project-v1-'+'a'.repeat(32);
const B='calibration-project-v1-'+'b'.repeat(32);
const C='calibration-project-v1-'+'c'.repeat(32);
const result='calibration-result-v1-'+'a'.repeat(64);
const photo={identity:{version:1,sha256:'f'.repeat(64),width:1176,height:791},
  aliasId:'original-soundly',source:{kind:'demo',key:'soundly'}};
const copy=x=>structuredClone(x);
const project=(id=A,title='Soundly',now=100)=>model.fresh({id,title,now});
const details=(p,extras={})=>({title:p.title,photo:p.photo,checkpoint:p.checkpoint,
  overview:p.overview,resultIds:p.resultIds,...extras});

// A compact async IndexedDB test double: transactions have their own cloned
// records, writes serialize across DB connections and commit together; abort
// discards both project and list changes. Legacy V1 bytes are preinstalled.
function memoryIndexedDB(legacy={version:2,record:{original:{dataUrl:'data:image/png;base64,AA'}}}){
  let version=1,busy=false,fail=null;
  const tables=new Map([['draft',new Map([['active',copy(legacy)]])]]);
  const waiting=[];
  function cloneTables(from){
    return new Map([...from].map(([k,v])=>[k,new Map([...v].map(([id,row])=>[id,copy(row)]))]));
  }
  function notify(req,event){if(typeof req[event]==='function')req[event]();}
  function drain(){
    if(busy||!waiting.length)return;
    busy=true;
    const tx=waiting.shift();
    tx.start(()=>{
      busy=false;queueMicrotask(drain);
    });
  }
  return {tables,databases:async()=>[{name:store.DATABASE,version}],
    failMutation(storeName,method='add'){fail={storeName,method};},
    get version(){return version;},
    open(name,want){
      assert.equal(name,store.DATABASE);
      const req={result:null,error:null,transaction:null,onupgradeneeded:null,onsuccess:null,onerror:null};
      queueMicrotask(()=>{
        if(want<version){req.error=Error('VersionError');notify(req,'onerror');return;}
        const db={objectStoreNames:{contains:key=>tables.has(key)},
          createObjectStore(key,options){
            if(tables.has(key))throw Error('Store exists');
            if(options)assert.equal(options.keyPath,'id');
            tables.set(key,new Map());
          },close(){},
          transaction(names,mode){
            if(typeof names==='string')names=[names];
            names.forEach(n=>{if(!tables.has(n))throw Error('Missing store '+n);});
            const tx={oncomplete:null,onerror:null,onabort:null,error:null,
              requests:[],done:false,started:false,active:null,
              abort(){
                if(tx.done)return;
                tx.done=true;
                queueMicrotask(()=>{notify(tx,'onabort');if(tx.unlock)tx.unlock();});
              },
              objectStore(n){
                if(!names.includes(n))throw Error('Store not in transaction');
                function request(method,arg,key){
                  if(tx.done)throw Error('TransactionInactiveError');
                  const item={result:undefined,error:null,onsuccess:null,onerror:null};
                  tx.requests.push({n,method,arg,key,item});
                  if(tx.started)queueMicrotask(tx.work);
                  return item;
                }
                return {get:key=>request('get',key),getAll:()=>request('all'),
                  // Honor out-of-line keys: project-control has no keyPath.
                  add:(val,key)=>request('add',val,key),
                  put:(val,key)=>request('put',val,key),
                  delete:key=>request('delete',key)};
              },
              start(unlock){
                tx.started=true;tx.unlock=unlock;tx.active=cloneTables(tables);
                tx.work=()=>{
                  if(tx.done)return;
                  const task=tx.requests.shift();
                  if(!task){
                    queueMicrotask(()=>{
                      if(tx.done||tx.requests.length){if(tx.requests.length)tx.work();return;}
                      tx.done=true;
                      if(mode==='readwrite')for(const n of names)tables.set(n,tx.active.get(n));
                      notify(tx,'oncomplete');unlock();
                    });
                    return;
                  }
                  const {n,method,arg,key,item}=task,t=tx.active.get(n);
                  try{
                    if(fail&&fail.storeName===n&&fail.method===method){
                      fail=null;throw Error('Injected transaction failure');
                    }
                    if(method==='get')item.result=copy(t.get(arg));
                    if(method==='all')item.result=copy([...t.values()]);
                    if(['add','put'].includes(method)){
                      if(mode!=='readwrite')throw Error('ReadOnlyError');
                      const id=arg.id??key;
                      if(id===undefined)throw Error('Missing key');
                      if(method==='add'&&t.has(id))throw Error('ConstraintError');
                      t.set(id,copy(arg));
                    }
                    if(method==='delete'){
                      if(mode!=='readwrite')throw Error('ReadOnlyError');
                      t.delete(arg);
                    }
                    notify(item,'onsuccess');
                  }catch(error){
                    item.error=error;tx.error=error;notify(item,'onerror');
                    tx.abort();return;
                  }
                  queueMicrotask(tx.work);
                };
                queueMicrotask(tx.work);
              }};
            // Only one transaction runs at a time in this double. Real
            // IndexedDB permits concurrent non-overlapping reads too.
            waiting.push(tx);queueMicrotask(drain);return tx;
          }};
        req.result=db;
        if(want>version){
          req.transaction={abort(){req.error=Error('Upgrade aborted');}};
          try{notify(req,'onupgradeneeded');if(req.error){notify(req,'onerror');return;}}
          catch(error){req.error=error;notify(req,'onerror');return;}
          version=want;
        }
        notify(req,'onsuccess');
      });
      return req;
    }
  };
}

test('IndexedDB mock preserves explicitly keyed control records',async()=>{
  const db=memoryIndexedDB();
  await store.list(db); // Installs v2 out-of-line project-control store.
  await new Promise((resolve,reject)=>{
    const opening=db.open(store.DATABASE,store.VERSION);
    opening.onerror=()=>reject(opening.error);
    opening.onsuccess=()=>{
      const tx=opening.result.transaction(store.CONTROL,'readwrite');
      tx.objectStore(store.CONTROL).add({version:1},'migration-marker');
      tx.oncomplete=resolve;
      tx.onabort=tx.onerror=()=>reject(tx.error);
    };
  });
  assert.deepEqual(db.tables.get(store.CONTROL).get('migration-marker'),{version:1});
});

test('project envelope protects identities, typed fields, checkpoint, photo bytes and deep input copies',()=>{
  const raw=model.fresh({id:A,now:100,photo,checkpoint:{version:1,
    payload:{rows:[{pixel:[15,20],included:true}],inline:{initial:null}}},
    resultIds:[result]});
  const normalized=model.normalize(raw);
  raw.checkpoint.payload.rows[0].pixel[0]=999;
  assert.equal(normalized.checkpoint.payload.rows[0].pixel[0],15);
  assert.equal(normalized.photo.identity.width,1176);
  assert.equal(model.summary(normalized).resultCount,1);
  assert.match(model.createId(webcrypto),/^calibration-project-v1-[0-9a-f]{32}$/);
  assert.equal(model.createId({randomUUID:()=> '12345678-1234-1234-1234-123456789abc'}),
    'calibration-project-v1-12345678123412341234123456789abc');
  assert.equal(model.createId({getRandomValues:array=>array.fill(1)}),
    'calibration-project-v1-'+'01'.repeat(16));
  assert.throws(()=>model.createId({}),/Secure project identity/);
  assert.throws(()=>model.normalize({...normalized,id:'x'}),/ID/);
  assert.throws(()=>model.normalize({...normalized,title:''}),/title/);
  assert.throws(()=>model.normalize({...normalized,revision:0}),/revision/);
  assert.throws(()=>model.normalize({...normalized,version:2}),/version/);
  assert.throws(()=>model.normalize({...normalized,resultIds:[result,result]}),/result links/);
  assert.throws(()=>model.normalize({...normalized,photo:{...photo,identity:{...photo.identity,width:0}}}),/photo width/);
  assert.throws(()=>model.normalize({...normalized,checkpoint:{version:1,payload:{dataUrl:'data:image/png;base64,AA'}}}),/embedded-photo/);
  assert.throws(()=>model.normalize({...normalized,checkpoint:{version:1,payload:{url:'data:image/png;base64,AA'}}}),/data URLs/);
  assert.throws(()=>model.normalize({...normalized,checkpoint:{version:1,payload:{rows:[NaN]}}}),/Non-finite/);
  assert.throws(()=>model.normalize({...normalized,checkpoint:{version:1,payload:JSON.parse('{"__proto__":4}')}}),/Unsafe/);
  assert.throws(()=>model.normalize({...normalized,checkpoint:{version:1,payload:{date:new Date()}}}),/JSON value/);
  assert.throws(()=>model.normalize({...normalized,checkpoint:{version:1,payload:{blob:'x'.repeat(model.MAX_CHECKPOINT_CHARS)}}}),/checkpoint limit/);
  assert.throws(()=>model.fork(normalized,{title:'Incomplete'},B,200),/complete project candidate/);
});
test('V1 draft/active survives the V2 upgrade unchanged; no project appears on upgrade',async()=>{
  const legacy={version:2,rows:[{pixel:[5,7]}],record:{original:{dataUrl:'data:image/png;base64,AA'}}};
  const db=memoryIndexedDB(legacy);
  assert.equal((await store.list(db)).length,0);
  assert.equal(db.version,2);
  assert.deepEqual(await store.legacy(db),legacy);
  assert.deepEqual([...db.tables.keys()].sort(),
    ['draft','project-control','project-summaries','projects'].sort());
  assert.deepEqual(db.tables.get('draft').get('active'),legacy);
});
test('create/get/list use only compact summaries; edits advance CAS and preserve input',async()=>{
  const db=memoryIndexedDB(),initial=model.fresh({id:A,title:'Soundly',now:100,photo,
    checkpoint:{version:1,payload:{rows:[{pixel:[1,2]}]}}});
  const original=copy(initial);
  assert.deepEqual(await store.create(db,initial),original);
  initial.checkpoint.payload.rows[0].pixel[0]=555;
  assert.deepEqual(await store.get(db,A),original);
  const summary=(await store.list(db))[0];
  assert.equal(summary.checkpoint,undefined);
  assert.equal(JSON.stringify(summary).includes('data:image'),false);
  assert.equal(summary.title,'Soundly');
  assert.equal(summary.photo.width,1176);
  assert.equal(summary.chars,JSON.stringify(original).length);
  const updated=await store.update(db,A,1,{checkpoint:{version:1,payload:{rows:[3,4]}}},120);
  assert.equal(updated.revision,2);assert.equal(updated.updatedAt,120);
  assert.equal((await store.get(db,A)).checkpoint.payload.rows[0],3);
  const renamed=await store.rename(db,A,2,'Renamed',121);
  assert.equal(renamed.revision,3);assert.equal((await store.list(db))[0].title,'Renamed');
  assert.deepEqual(await store.get(db,B),null);
  await assert.rejects(store.create(db,project(A)),/already exists/);
  await assert.rejects(store.update(db,A,1,{title:'Stale'},130),/changed in another tab/);
  assert.equal((await store.get(db,A)).title,'Renamed');
});
test('two tabs serialize updates on the same revision; independent projects do not interfere',async()=>{
  const db=memoryIndexedDB();await store.create(db,project(A));await store.create(db,project(B));
  const attempts=await Promise.allSettled([
    store.update(db,A,1,{title:'Editor one'},200),
    store.update(db,A,1,{title:'Editor two'},201)
  ]);
  assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(attempts.filter(x=>x.status==='rejected').length,1);
  assert.match(attempts.find(x=>x.status==='rejected').reason.message,/changed in another tab/);
  assert.equal((await store.get(db,A)).revision,2);
  const b=await store.update(db,B,1,{title:'Independent'},202);
  assert.equal(b.title,'Independent');assert.equal((await store.get(db,A)).revision,2);
});
test('stale full candidate forks atomically; original project remains untouched',async()=>{
  const db=memoryIndexedDB();const initial=project(A);
  await store.create(db,initial);
  await store.update(db,A,1,{title:'Remote'},200);
  const captured=details(initial,{title:'Local',checkpoint:{version:1,payload:{pairs:[1,2,3]}},
    resultIds:[result]});
  const saved=await store.saveOrFork(db,A,1,captured,B,201);
  assert.equal(saved.status,'forked');assert.equal(saved.project.id,B);
  assert.equal(saved.project.forkOf,A);assert.equal(saved.project.revision,1);
  assert.equal(saved.project.checkpoint.payload.pairs.length,3);
  assert.equal((await store.get(db,A)).title,'Remote');
  assert.equal((await store.get(db,A)).revision,2);
  assert.equal((await store.list(db)).length,2);
  await assert.rejects(store.saveOrFork(db,A,1,{title:'Only title'},C,202),/complete project candidate/);
  await assert.rejects(store.saveOrFork(db,A,1,captured,B,203),/already exists/);
  assert.equal((await store.list(db)).length,2);
  const newer=await store.saveOrFork(db,A,2,{title:'Updated'},C,204);
  assert.equal(newer.status,'updated');assert.equal(newer.project.id,A);
  assert.equal(await store.get(db,C),null);
  // When the parent was concurrently deleted, a complete local candidate
  // must still survive as a fork instead of recreating the deleted ID.
  await store.remove(db,A,3);
  const rescued=await store.saveOrFork(db,A,3,captured,C,205);
  assert.equal(rescued.status,'forked');
  assert.equal(rescued.project.id,C);
  assert.equal(rescued.project.forkOf,A);
  assert.deepEqual(rescued.project.checkpoint,captured.checkpoint);
  assert.equal(await store.get(db,A),null);
});
test('stale delete fails, deletion cannot cascade into preserved results or legacy draft',async()=>{
  const db=memoryIndexedDB();await store.create(db,model.fresh({id:A,now:100,resultIds:[result]}));
  await store.rename(db,A,1,'Changed',110);
  await assert.rejects(store.remove(db,A,1),/changed in another tab/);
  assert.equal((await store.get(db,A)).title,'Changed');
  assert.equal((await store.remove(db,A,2)).resultIds[0],result);
  assert.equal(await store.get(db,A),null);
  assert.equal((await store.list(db)).length,0);
  assert.notEqual(await store.legacy(db),null);
  await assert.rejects(store.remove(db,A,2),/missing/);
});
test('failed second-store write aborts both project and metadata atomically',async()=>{
  const db=memoryIndexedDB();
  db.failMutation(store.SUMMARIES,'add');
  await assert.rejects(store.create(db,project(A)),/Injected transaction failure/);
  assert.equal(await store.get(db,A),null);
  assert.deepEqual(await store.list(db),[]);
  await store.create(db,project(A));
  db.failMutation(store.SUMMARIES,'put');
  await assert.rejects(store.update(db,A,1,{title:'Lost update'},101),/Injected transaction failure/);
  assert.equal((await store.get(db,A)).title,'Soundly');
  assert.equal((await store.get(db,A)).revision,1);
});
test('bounded quota rejects oversized writes, protects all older rows',async()=>{
  const db=memoryIndexedDB();
  await store.create(db,project(A));
  await assert.rejects(store.update(db,A,1,{checkpoint:{version:1,
    payload:{huge:'x'.repeat(model.MAX_CHECKPOINT_CHARS)}}},150),/checkpoint limit/);
  assert.equal((await store.get(db,A)).revision,1);
  assert.throws(()=>store.quota([],model.fresh({id:A,now:100,
    checkpoint:{version:1,payload:{huge:'x'.repeat(model.MAX_CHECKPOINT_CHARS)}}})),/checkpoint limit/);
  for(let i=1;i<store.MAX_PROJECTS;i++){
    const id='calibration-project-v1-'+i.toString(16).padStart(32,'0');
    await store.create(db,project(id));
  }
  assert.equal((await store.list(db)).length,store.MAX_PROJECTS);
  await assert.rejects(store.create(db,project(B)),/storage limit/);
  assert.equal((await store.list(db)).length,store.MAX_PROJECTS);
});
test('storage errors and mismatching metadata fail closed without guessing a project',async()=>{
  await assert.rejects(store.list(undefined),/IndexedDB unavailable/);
  await assert.rejects(store.list({open(){throw Error('open denied');}}),/open denied/);
  const db=memoryIndexedDB();
  await store.create(db,project(A));
  db.tables.get(store.SUMMARIES).get(A).revision=99;
  await assert.rejects(store.get(db,A),/metadata does not match/);
  await assert.rejects(store.update(db,A,1,{title:'Unsafe'},110),/metadata does not match/);
  assert.equal(db.tables.get(store.PROJECTS).get(A).revision,1);
  await assert.rejects(store.remove(db,A,1),/metadata does not match/);
});


// 8F.7p.3: one-time adoption, recovery, and competing-tab safety.
const migration=require('../src/ui/modern/ModernCalibrationProjectMigration');
const importer=require('../src/ui/modern/ModernReferenceImageImport');
const sample=require('./fixtures/soundly-mixed-calibration.json');
function legacyRecord(){
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOo6TsAAANUAcuEDSEIAAAAAElFTkSuQmCC','base64');
  bytes.writeUInt32BE(1176,16);bytes.writeUInt32BE(791,20);
  return {version:1,id:'soundly',title:'Source Soundly',
    original:{dataUrl:'data:image/png;base64,'+bytes.toString('base64'),width:1176,height:791}};
}
function legacyDraft(version=2){
  const rows=copy(sample.observations);
  if(version===1)for(const row of rows)delete row.included;
  const d={version,scene:{model:copy(sample.model),
      physics:{atmosphere:'vacuum',temperatureProfile:copy(sample.options.temperatureProfile)}},
    record:legacyRecord(),activeSource:{source:'demo',demoId:'soundly',
      key:'demo_soundly',links:['Original'],imported:false},
    rows,pending:[330,151],pendingModel:copy(rows[0].landmark),
    activePair:rows[0].landmark.id,editing:rows[0].landmark.id,
    explicitAdd:false,view:{scale:.8,x:8,y:14},
    physicalSessionId:'physical-session-1',undoStack:[],redoStack:[],
    selectedOwner:{bank:0,objectType:8},weight:'2',
    freeParameters:sample.options.freeParameters.slice(),
    fitBest:null,fitStatus:'Stopped; best valid fit retained if available',
    viewBest:false,stage:'calibration',resultCamera:'initial',
    resultViews:{initial:{scale:1,x:10,y:20},best:null},residualMode:'off'};
  if(version===1){
    delete d.selectedOwner;delete d.residualMode;delete d.resultViews;
    delete d.physicalSessionId;d.magnifierSessionId='physical-session-1';
  }
  return d;
}
function migrationEnv(db,inline=null){
  return {indexedDB:db,crypto:webcrypto,
    localStorage:{getItem:key=>key===migration.INLINE_KEY?inline:null},
    Image:class{constructor(){this.naturalWidth=1176;this.naturalHeight=791;}async decode(){}}};
}
function originalCatalog(env){
  const originals=new Map();
  return {originals,
    async ensureOriginal(_db,record,_crypto,verify){
      await verify(record);
      const identity=await importer.identify(record,env);
      if(!originals.has(identity.sha256))originals.set(identity.sha256,copy(record));
      return {identity,row:{record:copy(originals.get(identity.sha256))},reused:false};
    },
    async findOriginal(_db,identity,_crypto,verify){
      const saved=originals.get(identity.sha256);
      if(!saved)return null;
      await verify(saved);
      return {id:saved.id,record:copy(saved)};
    }};
}
const inlineState=d=>({id:d.physicalSessionId||d.magnifierSessionId,
  photo:d.record.id,sessions:{initial:{source:JSON.stringify({bank:0}),
    session:{zoom:1.2,pivot:[1,2,3]}}}});

test('migration adopts a verified V2 original and matching inline exactly once, without changing raw draft',async()=>{
  const raw=legacyDraft(),before=copy(raw),inline=inlineState(raw);
  const db=memoryIndexedDB(raw),env=migrationEnv(db,JSON.stringify(inline)),adapter=originalCatalog(env);
  const first=await migration.migrate(env,{adapter,decoder:importer,now:200});
  assert.equal(first.status,'migrated');
  assert.equal(first.project.revision,1);
  assert.equal(first.project.overview.rowCount,14);
  assert.equal(first.project.checkpoint.payload.draft.record,null);
  assert.equal(JSON.stringify(first.project).includes('data:image'),false);
  assert.equal(first.project.checkpoint.payload.inline.id,raw.physicalSessionId);
  assert.equal(first.project.checkpoint.payload.draft.pending[0],330);
  assert.deepEqual(await store.legacy(db),before);
  assert.equal((await store.list(db)).length,1);
  assert.equal((await store.migrationMarker(db)).projectId,first.project.id);
  assert.equal(JSON.parse(await migration.rawRecovery(db)).record.original.dataUrl,
    raw.record.original.dataUrl);
  const again=await migration.migrate(env,{adapter,decoder:importer,now:300});
  assert.equal(again.status,'already');
  assert.equal(again.project.id,first.project.id);
  assert.equal((await store.list(db)).length,1);
});

test('migration accepts validated no-photo checkpoints without an original or image rows',async()=>{
  const raw=legacyDraft();
  raw.record=null;raw.activeSource=null;raw.rows=[];
  raw.pending=null;raw.pendingModel=null;raw.activePair=null;raw.editing=null;
  raw.selectedOwner=null;
  const db=memoryIndexedDB(raw),env=migrationEnv(db);
  const saved=await migration.migrate(env,{now:350});
  assert.equal(saved.status,'migrated');
  assert.equal(saved.project.photo,null);
  assert.equal(saved.project.overview.rowCount,0);
  assert.equal(saved.project.checkpoint.payload.draft.record,null);
  assert.deepEqual(await store.legacy(db),raw);
});

test('legacy V1 fit-role upgrade is explicit and retains original raw bytes',async()=>{
  const raw=legacyDraft(1),db=memoryIndexedDB(raw),env=migrationEnv(db),adapter=originalCatalog(env);
  const upgraded=migration.normalizeLegacy(raw);
  assert.equal(upgraded.version,2);
  assert.equal(upgraded.physicalSessionId,'physical-session-1');
  assert.ok(upgraded.rows.every(row=>row.included===true));
  assert.equal(upgraded.residualMode,'off');
  assert.deepEqual(raw.rows[0].included,undefined);
  const adopted=await migration.migrate(env,{adapter,decoder:importer,now:400});
  assert.equal(adopted.status,'migrated');
  assert.equal(adopted.project.checkpoint.payload.draft.rows.length,14);
  assert.deepEqual(await store.legacy(db),raw);
});

test('migration does not lose unresolved Flat, corrupt V1 or unrelated inline',async()=>{
  const flat=legacyDraft();flat.scene.model.showModel=2;
  const db=memoryIndexedDB(flat),env=migrationEnv(db),adapter=originalCatalog(env);
  await assert.rejects(migration.migrate(env,{adapter,decoder:importer}),/Flat/);
  assert.equal(await store.migrationMarker(db),null);
  assert.deepEqual(await store.legacy(db),flat);
  const unknown=legacyDraft(1);unknown.unreviewedParameter=4;
  assert.throws(()=>migration.normalizeLegacy(unknown),/Unknown legacy V1/);
  const wrong=legacyDraft(),other={...inlineState(wrong),id:'different'};
  assert.equal(migration.matchingInline(migrationEnv(db,JSON.stringify(other)).localStorage,wrong),null);
  assert.deepEqual(await store.list(db),[]);
});

test('atomic marker/project write prevents duplicate migration in concurrent tabs',async()=>{
  const raw=legacyDraft(),db=memoryIndexedDB(raw),env=migrationEnv(db),adapter=originalCatalog(env);
  const results=await Promise.all([
    migration.migrate(env,{adapter,decoder:importer,now:500}),
    migration.migrate(env,{adapter,decoder:importer,now:501})
  ]);
  assert.deepEqual(results.map(x=>x.status).sort(),['already','migrated']);
  assert.equal(results[0].project.id,results[1].project.id);
  assert.equal((await store.list(db)).length,1);
  assert.deepEqual(await store.legacy(db),raw);
});

test('failed marker transaction aborts both rows, preserves source, and allows retry',async()=>{
  const raw=legacyDraft(),db=memoryIndexedDB(raw),env=migrationEnv(db),adapter=originalCatalog(env);
  db.failMutation(store.CONTROL,'add');
  await assert.rejects(migration.migrate(env,{adapter,decoder:importer,now:600}),
    /Injected transaction failure/);
  assert.equal(await store.migrationMarker(db),null);
  assert.deepEqual(await store.list(db),[]);
  assert.deepEqual(await store.legacy(db),raw);
  const repaired=await migration.migrate(env,{adapter,decoder:importer,now:601});
  assert.equal(repaired.status,'migrated');
});

test('concurrent change to legacy source rejects adoption and leaves raw export available',async()=>{
  const raw=legacyDraft(),db=memoryIndexedDB(raw),env=migrationEnv(db),adapter=originalCatalog(env);
  const earlier=adapter.ensureOriginal;
  adapter.ensureOriginal=async(...args)=>{
    const saved=await earlier(...args);
    db.tables.get('draft').set('active',{...copy(raw),fitStatus:'Newer editor draft'});
    return saved;
  };
  await assert.rejects(migration.migrate(env,{adapter,decoder:importer,now:700}),
    /Legacy calibration changed/);
  assert.equal(await store.migrationMarker(db),null);
  assert.equal((await store.list(db)).length,0);
  assert.match(await migration.rawRecovery(db),/Newer editor draft/);
});

test('migration quota failure leaves legacy untouched and no marker',async()=>{
  const raw=legacyDraft(),db=memoryIndexedDB(raw),env=migrationEnv(db),adapter=originalCatalog(env);
  for(let i=1;i<=store.MAX_PROJECTS;i++){
    await store.create(db,project('calibration-project-v1-'+i.toString(16).padStart(32,'0')));
  }
  await assert.rejects(migration.migrate(env,{adapter,decoder:importer,now:800}),
    /storage limit/);
  assert.equal(await store.migrationMarker(db),null);
  assert.deepEqual(await store.legacy(db),raw);
  assert.equal((await store.list(db)).length,store.MAX_PROJECTS);
});

test('already-migrated marker survives project deletion and never resurrects legacy draft',async()=>{
  const raw=legacyDraft(),db=memoryIndexedDB(raw),env=migrationEnv(db),adapter=originalCatalog(env);
  const adopted=await migration.migrate(env,{adapter,decoder:importer,now:900});
  await store.remove(db,adopted.project.id,1);
  const again=await migration.migrate(env,{adapter,decoder:importer,now:901});
  assert.equal(again.status,'already-removed');
  assert.equal(again.project,null);
  assert.equal((await store.list(db)).length,0);
  assert.deepEqual(await store.legacy(db),raw);
});


test('orphaned project summary after migration is not mistaken for deliberate deletion',async()=>{
  const raw=legacyDraft(),db=memoryIndexedDB(raw),env=migrationEnv(db),adapter=originalCatalog(env);
  const adopted=await migration.migrate(env,{adapter,decoder:importer,now:950});
  await store.remove(db,adopted.project.id,1);
  db.tables.get(store.SUMMARIES).set(adopted.project.id,model.summary(adopted.project));
  await assert.rejects(migration.migrate(env,{adapter,decoder:importer,now:951}),
    /Orphan calibration project metadata/);
  assert.deepEqual(await store.legacy(db),raw);
  assert.equal((await store.migrationMarker(db)).projectId,adopted.project.id);
});

const coordinator=require('../src/ui/modern/ModernCalibrationProjectPersistence');
function persistenceSession(db,adapter=null){
  const env=migrationEnv(db);
  const images=adapter||originalCatalog(env);
  return {session:coordinator.create(env,{adapter:images,decoder:importer,
    clock:()=>1200}),env,adapter:images};
}

test('project persistence captures snapshot immediately and acknowledges only after durable commit',async()=>{
  const db=memoryIndexedDB(),start=project(A);
  await store.create(db,start);
  const {session,adapter}=persistenceSession(db);
  session.bind(start);
  const draft=legacyDraft(),inline=inlineState(draft);
  session.mark(draft,inline,{title:'Captured Soundly'});
  assert.equal(session.state().unsaved,true);
  const pending=session.save();
  assert.equal(session.state().pending,1);
  assert.throws(()=>session.bind(project(B)),/Unsaved or pending/);
  draft.view.x=999;inline.sessions.initial.session.zoom=99;
  assert.equal(session.state().revision,1);
  const saved=await pending;
  assert.equal(saved.status,'updated');
  assert.equal(saved.project.id,A);
  assert.equal(saved.project.revision,2);
  assert.equal(session.state().unsaved,false);
  assert.equal(session.state().pending,0);
  assert.equal(session.state().lastAck.revision,2);
  const row=await store.get(db,A);
  assert.equal(row.title,'Captured Soundly');
  assert.equal(row.checkpoint.payload.draft.view.x,8);
  assert.equal(row.checkpoint.payload.inline.sessions.initial.session.zoom,1.2);
  assert.equal(row.checkpoint.payload.draft.record,null);
  assert.equal(JSON.stringify(row).includes('data:image'),false);
  assert.equal(adapter.originals.size,1);
  assert.equal(session.recovery(),null);
});

test('project coordinator serializes writes, deduplicates the same save and keeps newest view',async()=>{
  const db=memoryIndexedDB(),start=project(A);
  await store.create(db,start);
  const {session}=persistenceSession(db);
  session.bind(start);
  const first=legacyDraft(),second=legacyDraft();
  first.view.x=15;first.resultViews.initial.x=25;
  second.view.x=35;second.resultViews.initial.x=45;
  session.mark(first);
  const pending=session.save();
  assert.strictEqual(session.save(),pending);
  session.mark(second);
  const latest=session.save();
  assert.equal(session.state().pending,2);
  const [a,b]=await Promise.all([pending,latest]);
  assert.equal(a.project.revision,2);
  assert.equal(b.project.revision,3);
  assert.equal(a.project.id,A);
  assert.equal(b.project.id,A);
  assert.equal((await store.get(db,A)).checkpoint.payload.draft.view.x,35);
  assert.equal((await store.get(db,A)).checkpoint.payload.draft.resultViews.initial.x,45);
  assert.equal(session.state().revision,3);
  assert.equal(session.state().unsaved,false);
});

test('two calibration tabs preserve both complete candidates by atomic conflict fork',async()=>{
  const db=memoryIndexedDB(),start=project(A);
  await store.create(db,start);
  const env=migrationEnv(db),adapter=originalCatalog(env);
  const first=coordinator.create(env,{adapter,decoder:importer,clock:()=>1300});
  const second=coordinator.create(env,{adapter,decoder:importer,clock:()=>1301});
  first.bind(start);second.bind(start);
  const a=legacyDraft(),b=legacyDraft();
  a.view.x=17;b.view.x=77;
  first.mark(a);
  second.mark(b);
  const result=await Promise.all([first.save(),second.save()]);
  assert.deepEqual(result.map(x=>x.status).sort(),['forked','updated']);
  const main=await store.get(db,A);
  const fork=result.find(x=>x.status==='forked').project;
  assert.equal(main.revision,2);
  assert.equal(fork.revision,1);
  assert.equal(fork.forkOf,A);
  assert.notEqual(fork.id,A);
  assert.notEqual(main.checkpoint.payload.draft.view.x,fork.checkpoint.payload.draft.view.x);
  assert.equal((await store.list(db)).length,2);
  assert.equal([first.state().projectId,second.state().projectId].includes(fork.id),true);
  assert.equal(adapter.originals.size,1);
});

test('separate projects stay isolated; binding with unsaved work is refused',async()=>{
  const db=memoryIndexedDB(),a=project(A),b=project(B);
  await store.create(db,a);await store.create(db,b);
  const {session}=persistenceSession(db);
  const epochA=session.bind(a).generation;
  const source=legacyDraft();source.view.x=14;
  session.mark(source);
  assert.throws(()=>session.bind(b),/Unsaved or pending/);
  await session.save();
  const epochB=session.bind(b).generation;
  assert.ok(epochB>epochA);
  const other=legacyDraft();other.view.x=91;
  session.mark(other);await session.save();
  assert.equal(session.state().projectId,B);
  assert.equal((await store.get(db,A)).checkpoint.payload.draft.view.x,14);
  assert.equal((await store.get(db,B)).checkpoint.payload.draft.view.x,91);
  assert.equal((await store.get(db,A)).revision,2);
  assert.equal((await store.get(db,B)).revision,2);
});

test('failed project write exposes explicit unsaved recovery and retries exact snapshot',async()=>{
  const db=memoryIndexedDB(),start=project(A);
  await store.create(db,start);
  const {session,adapter}=persistenceSession(db);
  session.bind(start);
  const draft=legacyDraft();draft.view.x=83;
  session.mark(draft,inlineState(draft));
  db.failMutation(store.SUMMARIES,'put');
  await assert.rejects(session.save(),/Injected transaction failure/);
  assert.equal(session.state().unsaved,true);
  assert.equal(session.state().pending,0);
  assert.match(session.state().error,/Injected transaction failure/);
  const recovered=JSON.parse(session.recovery());
  assert.equal(recovered.projectId,A);
  assert.equal(recovered.draft.view.x,83);
  assert.match(recovered.draft.record.original.dataUrl,/^data:image\/png;base64,/);
  assert.equal((await store.get(db,A)).revision,1);
  assert.equal(adapter.originals.size,1);
  const repaired=await session.retry();
  assert.equal(repaired.status,'updated');
  assert.equal(session.state().unsaved,false);
  assert.equal(session.recovery(),null);
  assert.equal((await store.get(db,A)).checkpoint.payload.draft.view.x,83);
});

test('a concurrent delete forks current work, never recreating the deleted project ID',async()=>{
  const db=memoryIndexedDB(),start=project(A);
  await store.create(db,start);
  const {session}=persistenceSession(db);
  session.bind(start);
  const draft=legacyDraft();draft.view.x=26;
  session.mark(draft);
  await store.remove(db,A,1);
  const response=await session.save();
  assert.equal(response.status,'forked');
  assert.notEqual(response.project.id,A);
  assert.equal(response.project.forkOf,A);
  assert.equal((await store.get(db,A)),null);
  assert.equal((await store.get(db,response.project.id)).checkpoint.payload.draft.view.x,26);
  assert.equal(session.state().projectId,response.project.id);
});

test('no-photo coordinator saves valid full scene without writing legacy draft',async()=>{
  const raw=legacyDraft(),db=memoryIndexedDB(raw),start=project(A);
  await store.create(db,start);
  const {session,adapter}=persistenceSession(db);
  session.bind(start);
  const draft=legacyDraft();
  draft.record=null;draft.activeSource=null;draft.rows=[];
  draft.pending=null;draft.pendingModel=null;draft.activePair=null;draft.editing=null;
  draft.selectedOwner=null;
  session.mark(draft);
  await session.save();
  const saved=await store.get(db,A);
  assert.equal(saved.photo,null);
  assert.equal(saved.checkpoint.payload.draft.record,null);
  assert.equal(saved.overview.rowCount,0);
  assert.equal(adapter.originals.size,0);
  assert.deepEqual(await store.legacy(db),raw);
});

test('discard is explicit and never allowed during a pending calibration write',async()=>{
  const db=memoryIndexedDB(),start=project(A);
  await store.create(db,start);
  const {session}=persistenceSession(db);
  session.bind(start);
  session.mark(legacyDraft());
  assert.equal(session.state().unsaved,true);
  const pending=session.save();
  assert.throws(()=>session.discard(),/pending save/);
  await pending;
  session.mark(legacyDraft());
  assert.equal(session.discard().unsaved,false);
  assert.equal(session.recovery(),null);
  assert.equal(session.state().revision,2);
});

test('startup inspection is read-only and classifies legacy, missing and unsupported work',async()=>{
  const raw=legacyDraft(),db=memoryIndexedDB(raw),env=migrationEnv(db);
  assert.deepEqual(await migration.inspect(env),{status:'legacy-pending',sourceVersion:2});
  assert.equal(await store.migrationMarker(db),null);
  assert.deepEqual(await store.legacy(db),raw);
  const invalid=legacyDraft();invalid.scene.model.showModel=2;
  const broken=memoryIndexedDB(invalid),result=await migration.inspect(migrationEnv(broken));
  assert.equal(result.status,'recovery-required');
  assert.match(result.reason,/Flat/);
  assert.deepEqual(await store.legacy(broken),invalid);
  assert.equal(await store.migrationMarker(broken),null);
  const empty=memoryIndexedDB(null);
  empty.tables.get('draft').delete('active');
  assert.deepEqual(await migration.inspect(migrationEnv(empty)),{status:'empty'});
});
test('startup inspection never resurrects an intentionally deleted migrated project',async()=>{
  const raw=legacyDraft(),db=memoryIndexedDB(raw),env=migrationEnv(db),adapter=originalCatalog(env);
  const adopted=await migration.migrate(env,{adapter,decoder:importer});
  assert.deepEqual(await migration.inspect(env),{status:'adopted',
    projectId:adopted.project.id,sourceVersion:2});
  await store.remove(db,adopted.project.id,1);
  assert.deepEqual(await migration.inspect(env),{status:'adopted-deleted',
    projectId:adopted.project.id,sourceVersion:2});
  assert.deepEqual(await store.legacy(db),raw);
});
test('project activation preflight hydrates a complete no-photo checkpoint without binding it',async()=>{
  const db=memoryIndexedDB(),env=migrationEnv(db);
  const current=project(A),draft=legacyDraft();
  draft.record=null;draft.activeSource=null;draft.rows=[];draft.pending=null;
  draft.pendingModel=null;draft.activePair=null;draft.editing=null;draft.selectedOwner=null;
  const parts=await require('../src/ui/modern/ModernCalibrationProjectCheckpoint')
    .captureVerified(draft,null,env);
  const target=model.fresh({id:B,now:100,title:'Ready',...parts});
  await store.create(db,current);await store.create(db,target);
  const session=coordinator.create(env);
  session.bind(current);
  const ready=await session.prepareOpen(B);
  assert.equal(ready.project.id,B);
  assert.deepEqual(ready.draft,draft);
  assert.equal(ready.inline,null);
  assert.equal(session.state().projectId,A);
  assert.equal(session.state().revision,1);
  assert.equal((await store.get(db,B)).revision,1);
});
test('project activation preflight rejects unsaved and stale editor generations',async()=>{
  const db=memoryIndexedDB(),env=migrationEnv(db),a=project(A),b=project(B);
  await store.create(db,a);await store.create(db,b);
  let allowed=true;
  const wrapper={...store,get:async(...args)=>{
    const read=await store.get(...args);allowed=false;return read;
  }};
  const session=coordinator.create(env,{storage:wrapper});
  session.bind(a);
  await assert.rejects(session.prepareOpen(B,()=>allowed),/Stale or unsaved/);
  assert.equal(session.state().projectId,A);
  session.mark(legacyDraft());
  await assert.rejects(session.prepareOpen(B),/Stale or unsaved/);
  assert.equal(session.state().unsaved,true);
  assert.deepEqual((await store.list(db)).map(x=>x.id).sort(),[A,B].sort());
});
test('project activation preflight rejects a newer remote revision before any editor mutation',async()=>{
  const db=memoryIndexedDB(),env=migrationEnv(db),a=project(A),b=project(B);
  await store.create(db,a);await store.create(db,b);
  let count=0;
  const wrapper={...store,get:async(...args)=>{
    const read=await store.get(...args);
    if(++count===1)await store.rename(db,B,1,'Changed elsewhere',200);
    return read;
  }};
  const session=coordinator.create(env,{storage:wrapper});
  session.bind(a);
  await assert.rejects(session.prepareOpen(B),/changed during activation/);
  assert.equal(session.state().projectId,A);
  assert.equal((await store.get(db,B)).revision,2);
  assert.equal(session.recovery(),null);
});

test('editor guards explicit switches and clean same-tab reload restoration',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const source=fs.readFileSync(path.resolve(__dirname,
    '../src/ui/modern/ModernPhotoCalibrationEditor.js'),'utf8');
  const app=fs.readFileSync(path.resolve(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  assert.match(source,/async function openCalibrationProject\(id,\{cleanReload=false\}=\{\}\)/);
  assert.match(source,/if\(projectSwitchBusy\|\|restoring\|\|fitWorker\|\|applyBusy\|\|pendingPhotoLoads/);
  assert.match(source,/workspace\.inert=true/);
  assert.match(source,/const ack=persist\(true\);/);
  assert.match(source,/if\(ack\)await ack;/);
  assert.match(source,/await migration\.migrate\(env\)/);
  assert.match(source,/const prepared=await session\.prepareOpen\(id,guard\)/);
  assert.match(source,/const incoming=await prepareVisualProject\(prepared\)/);
  assert.match(source,/activateVisualProject\(oldView\)/);
  assert.match(source,/session\.bind\(prepared\.project\)/);
  assert.match(source,/openCalibrationProject,resumeCleanProjectAfterReload,adoptLegacyCalibrationDraft,\s*refreshProjectList,projectPersistenceStatus:/);
  assert.match(source,/if\(projectSession\?\.project\(\)\)\{\s*if\(!fromPersist\)\{/);
  assert.match(source,/if\(!session\.project\(\)&&!cleanReload\)/);
  assert.match(source,/openCalibrationProject\(id,\{cleanReload:true\}\)/);
  assert.match(source,/sessionStorage\?\.setItem\(RELOAD_PROJECT_KEY,state\.projectId\)/);
  assert.match(app,/\.resumeCleanProjectAfterReload\(\)/);
  assert.doesNotMatch(app,/\.openCalibrationProject\(/);
});
test('an incoming project keeps both independent photo and model views plus inline state',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const source=fs.readFileSync(path.resolve(__dirname,
    '../src/ui/modern/ModernPhotoCalibrationEditor.js'),'utf8');
  const from=source.indexOf('function activateVisualProject(target)');
  const until=source.indexOf('function populate(select,options)',from);
  const functionSource=source.slice(from,until);
  for(const marker of ['d.view','d.resultViews','d.undoStack','d.redoStack',
    'd.pending','d.pendingModel','d.fitStatus','d.freeParameters',
    'd.physicalSessionId','d.selectedOwner','target.inline?.sessions']){
    assert.ok(functionSource.includes(marker),'Missing project activation state: '+marker);
  }
  assert.match(functionSource,/restoring=true/);
  assert.match(functionSource,/finally\{restoring=false;\}/);
});

test('project editor captures bound autosave before a queued task and persists inline-only gestures',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const src=fs.readFileSync(path.resolve(__dirname,
    '../src/ui/modern/ModernPhotoCalibrationEditor.js'),'utf8');
  const start=src.indexOf('function persist(forSwitch=false,changes=null)'),end=src.indexOf('async function restoreDraft()',start);
  const persistence=src.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(persistence,/session\.mark\(data,inline\);\s*\}\s*saved=session\.save\(\)/);
  assert.match(persistence,/if\(changes\)session\.mark\(data,inline,changes\)/);
  assert.doesNotMatch(persistence,/writeQueue\.catch\(\(\)=>\{\}\)\.then\(async\(\)=>\{\s*if\(session\)/);
  const inline=src.slice(src.indexOf('function saveInline(fromPersist=false)'),
    src.indexOf('function readInline()'));
  assert.match(inline,/if\(projectSession\?\.project\(\)\)\{\s*if\(!fromPersist\)\{/);
  assert.match(inline,/const saved=persist\(\)/);
  assert.match(persistence,/saveInline\(true\)/);
  assert.match(src,/if\(oldView\)activateVisualProject\(oldView\)/);
  assert.match(src,/else\{\s*\/\/ The first explicit open can start from an empty editor/);
});

test('Calibration Projects library reads only compact summaries and opens through the guarded editor API',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const root=path.resolve(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const source=fs.readFileSync(path.join(root,'src/ui/modern/ModernPhotoCalibrationEditor.js'),'utf8');
  for(const id of ['ModernCalibrationProjectsToggle','ModernCalibrationProjectsDisclosure',
    'ModernCalibrationProjectsPanel','ModernCalibrationProjectsRefresh','ModernCalibrationProjectsStatus',
    'ModernCalibrationProjectsList','ModernCalibrationProjectsAdopt','ModernCalibrationProjectsLegacy'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(source,/storage\.list\(env\.indexedDB\)/);
  assert.match(source,/migration\.inspect\(env\)/);
  assert.match(source,/async function openFromProjects\(id\)/);
  assert.match(source,/await openCalibrationProject\(id\)/);
  assert.match(source,/async function adoptLegacyCalibrationDraft\(\)/);
  assert.match(source,/await migration\.migrate\(env\)/);
  assert.match(source,/env\.sessionStorage\?\.setItem\(LAST_PROJECT_KEY,outcome\.project\.id\)/);
  assert.doesNotMatch(source.slice(source.indexOf('function projectRow(entry)'),
    source.indexOf('function renderProjects()')),/record\.original|dataUrl|createObjectURL/);
  assert.match(source,/closest\?\.\('#ModernCalibrationProjectsDisclosure, #ModernCalibrationProjectsPanel, #ModernCalibrationProjectsToggle, #ModernCalibrationApplyScene'\)/);
  assert.match(source,/path\.includes\(projectsDisclosure\)\|\|path\.includes\(projectsPanel\)/);
});

test('CRUD actions isolate new scene, duplicate checkpoint and import without editor mutation',async()=>{
  const actions=require('../src/ui/modern/ModernCalibrationProjectActions');
  const checkpoint=require('../src/ui/modern/ModernCalibrationProjectCheckpoint');
  const snapshot={model:{showModel:1,rEarth:6371000,rFEarth:6371000,
    CameraEast:0,CameraNorth:0,Height:2,Pan:0,Nick:0,Roll:0,FocalLengthField:50},
    physics:{atmosphere:'vacuum'}};
  const fresh=actions.emptyDraft(snapshot,'scene-session');
  assert.deepEqual(fresh.rows,[]);
  assert.equal(fresh.record,null);
  assert.equal(fresh.stage,'correspondences');
  assert.equal(fresh.pending,null);
  assert.equal(fresh.fitBest,null);
  checkpoint.validateDraft(fresh,null);
  const env={crypto:webcrypto,indexedDB:{}};
  const records=new Map(),touch=[];
  const storage={
    async create(db,row){assert.equal(db,env.indexedDB);
      if(records.has(row.id))throw Error('Duplicate ID');
      records.set(row.id,copy(row));touch.push('create');return copy(row);
    },
    async get(db,id){return copy(records.get(id)||null);}
  };
  const fakeFiles={
    validateDraft:checkpoint.validateDraft,
    async captureVerified(d){touch.push('capture');return checkpoint.extract(d,null,null);},
    async prepare(p){touch.push('prepare');return {draft:checkpoint.payloadOf(p).draft,inline:null};},
    extract:checkpoint.extract
  };
  const created=await actions.createNew(env,snapshot,{storage,files:fakeFiles,now:123});
  assert.equal(created.title,'Untitled calibration');
  assert.equal(created.revision,1);
  assert.equal(created.overview.rowCount,0);
  assert.equal(created.photo,null);
  assert.notEqual(created.checkpoint.payload.draft.physicalSessionId,'scene-session');
  const duplicate=await actions.duplicate(env,created.id,1,{storage,files:fakeFiles,now:124});
  assert.notEqual(duplicate.id,created.id);
  assert.notEqual(duplicate.checkpoint.payload.draft.physicalSessionId,
    created.checkpoint.payload.draft.physicalSessionId);
  assert.equal(duplicate.title,'Untitled calibration (copy)');
  assert.equal((await storage.get(null,created.id)).title,'Untitled calibration');
  await assert.rejects(actions.duplicate(env,created.id,2,{storage,files:fakeFiles}),
    /another tab/);
  const data={scene:legacyDraft().scene,referenceImage:legacyRecord(),
    referenceSource:null,observations:[],fit:{freeParameters:[],result:null,
    status:'Unfitted',running:false}};
  const imported=actions.importedDraft(data,'import-session');
  assert.equal(imported.record.id,'soundly');
  assert.equal(imported.activeSource.imported,true);
  const importerFiles={...fakeFiles,
    async captureVerified(d){touch.push('capture-photo');assert.equal(d.record.id,'soundly');
      return {photo:null,checkpoint:null,overview:{stage:'correspondences',
        rowCount:0,fitStatus:null,fitRmsPx:null}};}};
  const newImport=await actions.importAsNew(env,data,{storage,files:importerFiles,now:125});
  assert.equal(newImport.title,'Imported calibration');
  assert.notEqual(newImport.id,created.id);
  assert.deepEqual([...records.keys()].length,3);
  assert.deepEqual(touch,['capture','create','prepare','create','capture-photo','create']);
});

test('archived result links are generation-bound, idempotent and isolated across Calibration Projects',async()=>{
  const db=memoryIndexedDB(),a=project(A),b=project(B);
  await store.create(db,a);await store.create(db,b);
  const {session}=persistenceSession(db);
  session.bind(a);
  const first={projectId:A,generation:session.state().generation};
  const draft=legacyDraft(),inline=inlineState(draft);
  assert.throws(()=>session.linkResult(result,draft,inline,{projectId:B,
    generation:first.generation}),/changed or has unsaved/);
  assert.throws(()=>session.linkResult('invalid-result',draft,inline,first),
    /result links/);
  const linked=await session.linkResult(result,draft,inline,first);
  assert.equal(linked.status,'updated');
  assert.deepEqual(linked.project.resultIds,[result]);
  assert.equal(linked.project.checkpoint.payload.draft.pending[0],330);
  assert.equal((await store.get(db,B)).resultIds.length,0);
  const again=await session.linkResult(result,draft,inline,first);
  assert.equal(again.status,'already-linked');
  assert.equal((await store.get(db,A)).revision,2);
  const other=session.bind(b);
  assert.throws(()=>session.linkResult(result,draft,inline,first),
    /changed or has unsaved/);
  await session.linkResult(result,draft,inline,{projectId:B,generation:other.generation});
  assert.deepEqual((await store.get(db,A)).resultIds,[result]);
  assert.deepEqual((await store.get(db,B)).resultIds,[result]);
  assert.equal((await store.get(db,A)).revision,2);
  assert.equal((await store.get(db,B)).revision,2);
});

test('archive link failed CAS retains complete retryable draft and cannot redirect a competing generation',async()=>{
  const db=memoryIndexedDB(),a=project(A),b=project(B);
  await store.create(db,a);await store.create(db,b);
  const {session}=persistenceSession(db);
  session.bind(a);
  const expected={projectId:A,generation:session.state().generation};
  const draft=legacyDraft(),inline=inlineState(draft);
  db.failMutation(store.SUMMARIES,'put');
  await assert.rejects(session.linkResult(result,draft,inline,expected),
    /Injected transaction failure/);
  assert.deepEqual((await store.get(db,A)).resultIds,[]);
  assert.equal(session.state().unsaved,true);
  assert.deepEqual(JSON.parse(session.recovery()).resultIds,[result]);
  assert.throws(()=>session.bind(b),/Unsaved or pending/);
  const repaired=await session.retry();
  assert.deepEqual(repaired.project.resultIds,[result]);
  assert.equal((await store.get(db,A)).revision,2);
  session.bind(b);
  assert.deepEqual((await store.get(db,B)).resultIds,[]);
});

test('simultaneous result links from stale tabs fork rather than overwrite another project result',async()=>{
  const db=memoryIndexedDB(),start=project(A);
  await store.create(db,start);
  const {env,adapter}=persistenceSession(db);
  const first=coordinator.create(env,{adapter,decoder:importer,clock:()=>1450});
  const second=coordinator.create(env,{adapter,decoder:importer,clock:()=>1451});
  first.bind(start);second.bind(start);
  const binding=session=>({projectId:A,generation:session.state().generation});
  const one=await first.linkResult(result,legacyDraft(),null,binding(first));
  const alternate='calibration-result-v1-'+'b'.repeat(64);
  const two=await second.linkResult(alternate,legacyDraft(),null,binding(second));
  assert.equal(one.status,'updated');
  assert.equal(two.status,'forked');
  assert.deepEqual((await store.get(db,A)).resultIds,[result]);
  assert.deepEqual((await store.get(db,two.project.id)).resultIds,[alternate]);
  assert.equal(two.project.forkOf,A);
});

test('Apply caller forwards its guarded project identity and result linker to ModernApp',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const editor=fs.readFileSync(path.join(__dirname,
    '../src/ui/modern/ModernPhotoCalibrationEditor.js'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,
    '../src/ui/modern/ModernApp.js'),'utf8');
  assert.match(editor,/applyCalibrationToTarget\(\{[\s\S]*?saveDraft:\(\)=>persist\(!!sharedSelection\),\s*projectBinding,linkArchivedResult\s*\},info\.target\)/);
  assert.match(app,/archivedProjectBinding=editor\.projectBinding\?\.\(\)\|\|null/);
  assert.match(app,/await editor\.linkArchivedResult\(saved\.row\.id,archivedProjectBinding\)/);
});

test('Apply click never schedules a racing workspace autosave beside the awaited explicit checkpoint',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const editor=fs.readFileSync(path.resolve(__dirname,
    '../src/ui/modern/ModernPhotoCalibrationEditor.js'),'utf8');
  const listener=editor.slice(editor.indexOf("for(const event of ['click','change','input','pointerup','pointercancel','wheel'])"),
    editor.indexOf('syncFitControls();syncPairToolbar();',editor.indexOf("for(const event of ['click','change','input','pointerup','pointercancel','wheel'])")));
  assert.match(listener,/path\.includes\(applyButton\)/);
  assert.match(listener,/ModernCalibrationApplyScene/);
  assert.match(editor,/revision:\(\)=>applyRevision\+':'\+loadToken,saveDraft:\(\)=>persist\(!!sharedSelection\)/);
});

test('Project card photographs resolve lazily by SHA-256 without saving raster bytes into project records',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const source=fs.readFileSync(path.resolve(__dirname,
    '../src/ui/modern/ModernPhotoCalibrationEditor.js'),'utf8');
  const app=fs.readFileSync(path.resolve(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  assert.match(source,/library\.findOriginal\(env\.indexedDB,identity,env\.crypto/);
  assert.match(source,/projectPreviews\.set\(key,preview\)/);
  assert.match(source,/card\.append\(projectPreview\(entry\.photo\)\)/);
  assert.match(source,/env\.CurvatureModernApp\?\.rememberCalibrationView\?\.\(open\?'projects':'editor'\)/);
  assert.match(source,/showProjectList\(env\.CurvatureModernApp\?\.getCalibrationView\?\.\(\)==='projects'\)/);
  assert.match(app,/function rememberCalibrationView\(view\)/);
});

test('Calibration Project library cards remain compact and fit diagnostics are summarized',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const css=fs.readFileSync(path.resolve(__dirname,'../src/ui/modern/ModernApp.css'),'utf8');
  const editor=fs.readFileSync(path.resolve(__dirname,'../src/ui/modern/ModernPhotoCalibrationEditor.js'),'utf8');
  assert.match(css,/\.modern-calibration-project-card\{[^}]*flex:0 0 226px/);
  assert.match(css,/\.modern-calibration-projects-list\{[^}]*overflow-x:auto/);
  assert.match(css,/\.modern-calibration-project-preview\{[^}]*height:115px/);
  assert.match(editor,/modern-animation-library-card-status/);
  assert.match(editor,/modern-animation-library-card-actions/);
  assert.match(editor,/modern-card-delete/);
});

test('Calibration Projects renders as a non-exclusive disclosure using existing workspace preference',()=>{
  const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const source=fs.readFileSync(path.join(root,'src/ui/modern/ModernPhotoCalibrationEditor.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.css'),'utf8');
  const x=html.indexOf('<details id="ModernCalibrationProjectsDisclosure"'),
    y=html.indexOf('<nav class="modern-calibration-stages"',x);
  assert.ok(x>0&&y>x);
  assert.match(html.slice(x,y),/<summary id="ModernCalibrationProjectsToggle"/);
  assert.match(html.slice(x,y),/id="ModernCalibrationProjectsPanel"/);
  assert.match(html.slice(x,y),/<\/details>/);
  assert.doesNotMatch(html,/id="ModernCalibrationProjectsBack"/);
  assert.doesNotMatch(css,/#ModernPhotoCalibration\[data-projects-list=open\] >/);
  assert.match(source,/projectsDisclosure\.addEventListener\('toggle',\(\)=>showProjectList\(projectsDisclosure\.open\)\)/);
  assert.match(source,/rememberCalibrationView\?\.\(open\?'projects':'editor'\)/);
});

test('Calibration Project library interaction matches Animation Library selection/open/delete contract',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const source=fs.readFileSync(path.resolve(__dirname,
    '../src/ui/modern/ModernPhotoCalibrationEditor.js'),'utf8');
  const css=fs.readFileSync(path.resolve(__dirname,'../src/ui/modern/ModernApp.css'),'utf8');
  const studio=fs.readFileSync(path.resolve(__dirname,
    '../src/ui/modern/ModernAnimationStudioUI.js'),'utf8');
  assert.match(source,/let projectSelectedId=null/);
  assert.match(source,/card\.addEventListener\('click',event=>/);
  assert.match(source,/card\.addEventListener\('dblclick',event=>/);
  assert.match(source,/event\.key==='Enter'/);
  assert.match(source,/event\.key===' '\|\|event\.key==='Spacebar'/);
  assert.match(source,/if\(!projectCardControl\(event,card\)\)selectProjectCard\(entry\.id\)/);
  assert.match(source,/modern-animation-library-card modern-calibration-project-card/);
  assert.match(source,/modern-animation-library-status-editing/);
  assert.match(source,/deletion\.disabled=projectListBusy;/);
  assert.match(source,/if\(active\)\{projectSwitchBusy=true;switchInterference=false;workspace\.inert=true;\}/);
  assert.match(source,/env\.location\.reload\(\)/);
  assert.match(source,/event\.stopPropagation\(\);void deleteFromProjects\(entry\)/);
  assert.match(css,/\.modern-calibration-projects-list\{display:flex/);
  assert.match(studio,/modern-animation-library-card.is-selected|is-selected/);
});


test('Calibration project info uses the shared read-only per-card inspector without opening a project',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const source=fs.readFileSync(path.resolve(__dirname,
    '../src/ui/modern/ModernPhotoCalibrationEditor.js'),'utf8');
  const studio=fs.readFileSync(path.resolve(__dirname,
    '../src/ui/modern/ModernAnimationStudioUI.js'),'utf8');
  assert.match(studio,/inspector\.infoButton\(card,libraryPreviewEntry\(entry\),card,p\.name\)/);
  assert.match(source,/CurvatureModernThumbnailPreview\?\.create\(\s*doc,projectsList,projectInspectorMarkup,/);
  assert.match(source,/projectInspector\.infoButton\(card,entry,card,entry\.title\)/);
  assert.match(source,/row\('Correspondences',entry\.rowCount\)/);
  assert.match(source,/row\('Fit status',entry\.fitStatus/);
  assert.match(source,/row\('Fit RMS',entry\.fitRmsPx/);
  assert.match(source,/row\('Linked archived results',entry\.resultCount\)/);
  assert.match(source,/inner\.append\(projectPreview\(entry\.photo\)\)/);
  assert.match(source,/projectInspector\?\.hide\(\)/);
  const inspector=fs.readFileSync(path.resolve(__dirname,
    '../src/ui/modern/ModernThumbnailPreview.js'),'utf8');
  assert.match(inspector,/event\.stopPropagation\(\)/);
  assert.doesNotMatch(source.slice(source.indexOf('function projectInspectorMarkup('),
    source.indexOf('const projectInspector=') ),/openFromProjects\(|projectSession\.bind\(/);
});

test('Calibration card and inspector layout stays compact and scoped to Calibration',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const css=fs.readFileSync(path.resolve(__dirname,'../src/ui/modern/ModernApp.css'),'utf8');
  const editor=fs.readFileSync(path.resolve(__dirname,
    '../src/ui/modern/ModernPhotoCalibrationEditor.js'),'utf8');
  const preview=fs.readFileSync(path.resolve(__dirname,
    '../src/ui/modern/ModernThumbnailPreview.js'),'utf8');
  assert.match(preview,/function create\(doc,host,render,options\)/);
  assert.match(preview,/if\(options&&options\.className\)node\.classList\.add\(options\.className\)/);
  assert.match(editor,/className:'modern-calibration-project-inspector'/);
  assert.match(css,/\.modern-calibration-project-card \.modern-card-info-button\{/);
  assert.match(css,/\.modern-calibration-project-card\{flex:0 0 258px\}/);
  assert.match(css,/\.modern-history-inspector\.modern-calibration-project-inspector\{\s*width:min\(460px/);
  assert.match(css,/\.modern-calibration-project-inspector \.modern-calibration-project-preview\{\s*height:92px/);
  assert.match(css,/\.modern-calibration-project-inspector \.modern-history-inspector-row strong\{/);
  assert.match(editor,/if\(entry\.resultCount>0\)detail\(/);
});

test('Calibration Projects exposes generation-safe Save now / Retry save without discarding the editor',()=>{
  const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const source=fs.readFileSync(path.join(root,'src/ui/modern/ModernPhotoCalibrationEditor.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.css'),'utf8');
  const persistence=require('../src/ui/modern/ModernCalibrationProjectPersistence');
  assert.match(html,/id="ModernCalibrationProjectsSave" hidden disabled/);
  assert.match(source,/projectsSave=\$\('ModernCalibrationProjectsSave'\)/);
  assert.match(source,/projectsSave\.disabled=projectListBusy\|\|!save\?\.unsaved\|\|save\.pending>0/);
  assert.match(source,/projectsSave\.textContent=save\?\.pending>0\?'Saving…':save\?\.error\?'Retry save':'Save now'/);
  assert.match(source,/projectsSave\.onclick=\(\)=>void saveActiveFromProjects\(\)/);
  assert.match(source,/const outcome=await session\.retry\(\)/);
  assert.match(source,/await refreshProjectList\(\)/);
  assert.match(source,/Save failed: /);
  assert.match(source,/Calibration Project saved in this browser/);
  assert.match(css,/#ModernCalibrationProjectsSave\[hidden\]/);
  assert.equal(typeof persistence.create,'function');
});

test('Explicit retry of a failed project save keeps work and clears warning after acknowledgement',async()=>{
  const db=memoryIndexedDB(),start=project(A);
  await store.create(db,start);
  const {session}=persistenceSession(db);
  session.bind(start);
  const draft=legacyDraft();draft.view.x=137;
  session.mark(draft,inlineState(draft));
  db.failMutation(store.SUMMARIES,'put');
  await assert.rejects(session.save(),/Injected transaction failure/);
  assert.equal(session.state().pending,0);
  assert.equal(session.state().unsaved,true);
  assert.ok(session.state().error);
  const result=await session.retry();
  assert.equal(result.status,'updated');
  assert.equal(session.state().error,null);
  assert.equal(session.state().unsaved,false);
  assert.equal(session.state().pending,0);
  assert.equal((await store.get(db,A)).checkpoint.payload.draft.view.x,137);
});

test('shared Calibration preflight verifies project, original, exact revision and retained legacy evidence',async()=>{
  const raw=legacyDraft(),db=memoryIndexedDB(raw),env=migrationEnv(db),adapter=originalCatalog(env);
  const {project:saved}=await migration.migrate(env,{adapter,decoder:importer,now:200});
  const ref=coordinator.projectReference(saved),opts={adapter,decoder:importer};
  const reader=coordinator.sharedDocumentReader(env,opts);
  assert.deepEqual(ref,{id:saved.id,revision:'rev:1',recovery:null});
  assert.deepEqual(await reader('calibration',saved.id),{kind:'calibration',id:saved.id,revision:'rev:1'});
  const before=await store.get(db,saved.id);
  const prepared=await coordinator.prepareSharedSelection(env,ref,opts);
  assert.deepEqual(prepared.project,before);
  assert.equal(prepared.photo.original.dataUrl,raw.record.original.dataUrl);
  assert.deepEqual(prepared.draft.rows,raw.rows);
  assert.deepEqual(await store.legacy(db),raw);
  assert.deepEqual(await store.get(db,saved.id),before);
  await assert.rejects(reader('animation',saved.id),/Unsupported auxiliary/);
  await assert.rejects(coordinator.prepareSharedSelection(env,{...ref,revision:'rev:2'},opts),/revision changed/);
  await assert.rejects(coordinator.prepareSharedSelection(env,{...ref,recovery:{id:'unknown'}},opts),/Unsupported Calibration selection/);
  adapter.originals.clear();
  await assert.rejects(reader('calibration',saved.id),/original photograph unavailable/);
  assert.deepEqual(await store.get(db,saved.id),before);
});
test('shared Calibration preflight rejects missing, empty, changed and stale projects without binding',async()=>{
  const db=memoryIndexedDB(),env=migrationEnv(db),a=project(A);
  const reader=coordinator.sharedDocumentReader(env);
  await assert.rejects(reader('calibration',A),/project missing/);
  await store.create(db,a);
  await assert.rejects(reader('calibration',A),/no verified editor checkpoint/);
  const raw=legacyDraft();raw.record=null;raw.activeSource=null;raw.rows=[];
  raw.pending=null;raw.pendingModel=null;raw.activePair=null;raw.editing=null;raw.selectedOwner=null;
  const parts=await require('../src/ui/modern/ModernCalibrationProjectCheckpoint').captureVerified(raw,null,env);
  const target=model.fresh({id:B,now:100,...parts});await store.create(db,target);
  let allowed=true;
  const wrapper={...store,get:async(...args)=>{const row=await store.get(...args);allowed=false;return row;}};
  await assert.rejects(coordinator.prepareSharedSelection(env,coordinator.projectReference(target),{
    storage:wrapper,guard:()=>allowed}),/Stale or unsaved/);
  let count=0;
  const changed={...store,get:async(...args)=>{
    const row=await store.get(...args);
    if(++count===1)await store.rename(db,B,1,'Changed elsewhere',200);
    return row;
  }};
  await assert.rejects(coordinator.sharedDocumentReader(env,{storage:changed})('calibration',B),/changed during activation/);
  assert.equal((await store.get(db,B)).revision,2);
  assert.equal((await store.list(db)).length,2);
});

function sharedCalibrationLease(){
  let live=true;
  const tracked=new Set();
  return {sessionId:'shared',check(){if(!live)throw Error('Shared page suspended');},
    track(tx){this.check();tracked.add(tx);return ()=>tracked.delete(tx);},
    suspend(){live=false;for(const tx of tracked)tx.abort();},
    tracked};
}
test('shared Calibration keeps the exact durable receipt when selection acknowledgement fails',async()=>{
  const db=memoryIndexedDB(),env=migrationEnv(db),adapter=originalCatalog(env),start=project(A);
  await store.create(db,start);
  const lease=sharedCalibrationLease(),receipts=[];
  let fail=true;
  const session=coordinator.create(env,{adapter,decoder:importer,clock:()=>1300,
    sharedSelection:{lease,async acknowledge(receipt){
      receipts.push(receipt);
      assert.equal((await store.get(db,receipt.current.id)).revision,Number(receipt.current.revision.slice(4)));
      if(fail)throw Error('Session CAS conflict');
    }}});
  session.bind(start);
  const draft=legacyDraft();draft.view.x=137;
  session.mark(draft,inlineState(draft));
  await assert.rejects(session.save(),/Session CAS conflict/);
  const saved=await store.get(db,A),pending=session.state().selectionPending;
  assert.equal(saved.revision,2);
  assert.equal(session.state().unsaved,true);
  assert.equal(session.state().lastAck,null);
  assert.deepEqual(pending,{previous:{id:A,revision:'rev:1',recovery:null},
    current:{id:A,revision:'rev:2',recovery:null},status:'updated'});
  assert.deepEqual(JSON.parse(session.recovery()).selectionPending,pending);
  assert.throws(()=>session.discard(),/selection acknowledgement/);
  await assert.rejects(session.save(),/explicit retry required/);
  assert.deepEqual(await store.get(db,A),saved);
  fail=false;
  const retried=await session.retry();
  assert.equal(retried.project.revision,2);
  assert.deepEqual(receipts[1],receipts[0]);
  assert.deepEqual(await store.get(db,A),saved,'retry must not write another domain revision');
  assert.equal(session.state().selectionPending,null);
  assert.equal(session.state().unsaved,false);
  assert.equal(session.state().lastAck.revision,2);
  assert.equal(lease.tracked.size,0);
});
test('shared Calibration preserves later input while a previous selection receipt is unresolved',async()=>{
  const db=memoryIndexedDB(),env=migrationEnv(db),adapter=originalCatalog(env),start=project(A);
  await store.create(db,start);
  const lease=sharedCalibrationLease(),receipts=[];
  let release;
  const paused=new Promise(resolve=>{release=resolve;});
  const session=coordinator.create(env,{adapter,decoder:importer,clock:()=>1300,
    sharedSelection:{lease,async acknowledge(receipt){
      receipts.push(receipt);
      if(receipts.length===1){await paused;throw Error('Lost session acknowledgement');}
    }}});
  session.bind(start);
  const first=legacyDraft();first.view.x=13;
  session.mark(first,null,{title:'Renamed while saving'});const saving=session.save();
  const failed=assert.rejects(saving,/Lost session acknowledgement/);
  while(!session.state().selectionPending)await new Promise(resolve=>setTimeout(resolve,0));
  const later=legacyDraft();later.view.x=99;
  session.mark(later);const queued=session.save();
  const skipped=assert.rejects(queued,/explicit retry required/);
  release();await failed;await skipped;
  assert.equal((await store.get(db,A)).revision,2);
  assert.equal(JSON.parse(session.recovery()).draft.view.x,99);
  assert.equal(JSON.parse(session.recovery()).title,'Renamed while saving');
  const result=await session.retry();
  assert.equal(result.project.revision,3);
  assert.equal(result.project.checkpoint.payload.draft.view.x,99);
  assert.equal(result.project.title,'Renamed while saving');
  assert.deepEqual(receipts[1],receipts[0]);
  assert.equal(receipts[2].previous.revision,'rev:2');
  assert.equal(receipts[2].current.revision,'rev:3');
  assert.equal(session.state().unsaved,false);
});
test('suspended shared Calibration lifetime prevents late domain writes and acknowledgement',async()=>{
  const db=memoryIndexedDB(),env=migrationEnv(db),adapter=originalCatalog(env),start=project(A);
  await store.create(db,start);
  const lease=sharedCalibrationLease();let acknowledgements=0;
  const original=adapter.ensureOriginal;
  adapter.ensureOriginal=async(...args)=>{const result=await original(...args);lease.suspend();return result;};
  const session=coordinator.create(env,{adapter,decoder:importer,clock:()=>1300,
    sharedSelection:{lease,async acknowledge(){acknowledgements++;}}});
  session.bind(start);session.mark(legacyDraft());
  await assert.rejects(session.save(),/Shared page suspended/);
  assert.equal(acknowledgements,0);
  assert.equal((await store.get(db,A)).revision,1);
  assert.equal(session.state().unsaved,true);
  assert.equal(session.state().selectionPending,null);
  assert.equal(lease.tracked.size,0);
  assert.throws(()=>session.mark(legacyDraft()),/Shared page suspended/);
});
test('Calibration store tracks shared write transactions and aborts before a stale mutation',async()=>{
  const db=memoryIndexedDB(),start=project(A);await store.create(db,start);
  const lease=sharedCalibrationLease(),check=lease.check;
  let checks=0;
  lease.check=function(){if(this.tracked.size&&++checks===2)this.suspend();return check.call(this);};
  await assert.rejects(store.saveOrFork(db,A,1,details(start,{title:'No late mutation'}),B,200,lease),
    /aborted|suspended/i);
  assert.deepEqual(await store.get(db,A),start);
  assert.equal(await store.get(db,B),null);
  assert.equal(lease.tracked.size,0);
});

test('shared editor activation uses the exact selected revision and preserves the outgoing editor',async()=>{
  const raw=legacyDraft(),db=memoryIndexedDB(raw),env=migrationEnv(db),adapter=originalCatalog(env);
  const {project:target}=await migration.migrate(env,{adapter,decoder:importer,now:200});
  const start=project(A);await store.create(db,start);
  const lease=sharedCalibrationLease(),ref=coordinator.projectReference(target);
  const session=coordinator.create(env,{adapter,decoder:importer,
    sharedSelection:{lease,async acknowledge(){throw Error('preflight must not write');}}});
  session.bind(start);
  const prepared=await session.prepareSelected(ref);
  assert.deepEqual(prepared.project,target);
  assert.deepEqual(prepared.draft.rows,raw.rows);
  assert.equal(session.state().projectId,A);
  await assert.rejects(session.prepareSelected({...ref,revision:'rev:2'}),/revision changed/);
  session.mark(raw);
  await assert.rejects(session.prepareSelected(ref),/Stale or unsaved/);
  assert.equal(session.state().unsaved,true);
  session.discard();lease.suspend();
  await assert.rejects(session.prepareSelected(ref),/Shared page suspended/);
  assert.deepEqual(await store.get(db,target.id),target);
  assert.deepEqual(await store.legacy(db),raw);
  await assert.rejects(coordinator.create(env).prepareSelected(ref),/coordinator required/);
});

test('shared Calibration receipt commits atomically with project and summary, without schema upgrade',async()=>{
  const raw=legacyDraft(),db=memoryIndexedDB(raw),start=project(A);await store.create(db,start);
  const lease=sharedCalibrationLease(),base={revision:9,digest:'sha256:'+'a'.repeat(64)};
  db.failMutation(store.CONTROL,'add');
  await assert.rejects(store.saveOrForkWithSelectionReceipt(db,A,1,details(start,{title:'New'}),B,200,base,lease),/Injected/);
  assert.deepEqual(await store.get(db,A),start);
  assert.equal(await store.readSharedSelectionReceipt(db),null);
  const saved=await store.saveOrForkWithSelectionReceipt(db,A,1,details(start,{title:'New'}),B,200,base,lease);
  const expected={version:1,base,previous:{id:A,revision:'rev:1',recovery:null},
    current:{id:A,revision:'rev:2',recovery:null},status:'updated'};
  assert.deepEqual(saved.selectionReceipt,expected);
  assert.deepEqual(await store.readSharedSelectionReceipt(db),expected);
  assert.deepEqual(await store.get(db,A),saved.project);
  assert.equal(db.version,2);assert.deepEqual(await store.legacy(db),raw);
  await assert.rejects(store.saveOrForkWithSelectionReceipt(db,A,2,details(saved.project),B,300,base,lease),/receipt unresolved/);
  assert.deepEqual(await store.get(db,A),saved.project);
  await assert.rejects(store.retireSharedSelectionReceipt(db,{...expected,base:{...base,revision:10}},lease),/receipt changed/);
  assert.deepEqual(await store.readSharedSelectionReceipt(db),expected);
  await store.retireSharedSelectionReceipt(db,expected,lease);
  assert.equal(await store.readSharedSelectionReceipt(db),null);
  assert.deepEqual(await store.get(db,A),saved.project);
  assert.equal(lease.tracked.size,0);
});
test('shared Calibration receipt records a conflict fork and preserves evidence after a remote change',async()=>{
  const db=memoryIndexedDB(),start=project(A);await store.create(db,start);
  const remote=await store.rename(db,A,1,'Remote',200);
  const lease=sharedCalibrationLease(),base={revision:2,digest:'sha256:'+'b'.repeat(64)};
  const saved=await store.saveOrForkWithSelectionReceipt(db,A,1,details(start,{title:'Local'}),B,300,base,lease);
  assert.equal(saved.status,'forked');
  assert.deepEqual(saved.selectionReceipt.previous,{id:A,revision:'rev:1',recovery:null});
  assert.deepEqual(saved.selectionReceipt.current,{id:B,revision:'rev:1',recovery:null});
  assert.deepEqual(await store.get(db,A),remote);
  const changed=await store.rename(db,B,1,'Changed',400);
  await assert.rejects(store.retireSharedSelectionReceipt(db,saved.selectionReceipt,lease),/Receipt project changed/);
  assert.deepEqual(await store.readSharedSelectionReceipt(db),saved.selectionReceipt);
  assert.deepEqual(await store.get(db,B),changed);
});
test('shared Calibration receipt rejects invalid base and suspended lifetime before mutation',async()=>{
  const db=memoryIndexedDB(),start=project(A);await store.create(db,start);
  const lease=sharedCalibrationLease(),base={revision:2,digest:'sha256:'+'c'.repeat(64)};
  assert.throws(()=>store.saveOrForkWithSelectionReceipt(db,A,1,details(start),B,200,{...base,digest:'invalid'},lease),/receipt base/);
  assert.throws(()=>store.saveOrForkWithSelectionReceipt(db,A,1,details(start),B,200,base,null),/shared lifetime/);
  lease.suspend();
  assert.throws(()=>store.saveOrForkWithSelectionReceipt(db,A,1,details(start),B,200,base,lease),/Shared page suspended/);
  assert.equal(await store.readSharedSelectionReceipt(db),null);
  assert.deepEqual(await store.get(db,A),start);
});

test('durable Calibration coordinator retries retirement without repeating domain or session writes',async()=>{
  const db=memoryIndexedDB(),env=migrationEnv(db),adapter=originalCatalog(env),start=project(A);
  await store.create(db,start);
  const lease=sharedCalibrationLease(),base={revision:9,digest:'sha256:'+'a'.repeat(64)};
  let acknowledgements=0,captures=0;
  const session=coordinator.create(env,{adapter,decoder:importer,clock:()=>1300,
    sharedSelection:{lease,async captureBase(ref){
      captures++;assert.deepEqual(ref,coordinator.projectReference(start));return base;
    },async acknowledge(receipt){
      acknowledgements++;assert.deepEqual(receipt.base,base);
      assert.deepEqual((await store.readSharedSelectionReceipt(db)).current,receipt.current);
      db.failMutation(store.CONTROL,'delete');
    }}});
  session.bind(start);session.mark(legacyDraft());
  await assert.rejects(session.save(),/Injected/);
  const saved=await store.get(db,A),receipt=await store.readSharedSelectionReceipt(db);
  assert.equal(saved.revision,2);
  assert.equal(session.state().selectionPending.acknowledged,true);
  assert.deepEqual(session.state().selectionPending.receipt,receipt);
  await session.retry();
  assert.equal(acknowledgements,1);assert.equal(captures,1);
  assert.equal(await store.readSharedSelectionReceipt(db),null);
  assert.deepEqual(await store.get(db,A),saved);
  assert.equal(session.state().unsaved,false);
});

test('shared receipt startup inventory does not open or upgrade a missing or legacy database',async()=>{
  const lease=sharedCalibrationLease();let opens=0;
  const db={databases:async()=>[],open(){opens++;throw Error('Unexpected database open');}};
  assert.equal(await store.readExistingSharedSelectionReceipt(db,lease),null);
  db.databases=async()=>[{name:store.DATABASE,version:1}];
  assert.equal(await store.readExistingSharedSelectionReceipt(db,lease),null);
  db.databases=async()=>[{name:store.DATABASE,version:3}];
  await assert.rejects(store.readExistingSharedSelectionReceipt(db,lease),/Unsupported Calibration database version/);
  assert.equal(opens,0);
});

test('shared Calibration removal refuses unresolved receipts and stale revisions',async()=>{
  const db=memoryIndexedDB(),lease=sharedCalibrationLease(),start=project(A);
  await store.create(db,start);
  const base={revision:9,digest:'sha256:'+'a'.repeat(64)};
  const saved=await store.saveOrForkWithSelectionReceipt(db,A,1,{title:'Renamed'},B,1200,base,lease);
  await assert.rejects(store.removeShared(db,A,2,lease),/receipt unresolved/);
  assert.deepEqual(await store.get(db,A),saved.project);
  await store.retireSharedSelectionReceipt(db,saved.selectionReceipt,lease);
  await assert.rejects(store.removeShared(db,A,1,lease),/changed in another tab/);
  assert.deepEqual(await store.get(db,A),saved.project);
  await store.removeShared(db,A,2,lease);
  assert.equal(await store.get(db,A),null);
  assert.equal((await store.list(db)).length,0);
});

test('unselected shared Calibration rename is atomic, no-fork and refuses pending receipts',async()=>{
  const db=memoryIndexedDB(),lease=sharedCalibrationLease(),start=project(A),spare=project(B);
  await store.create(db,start);await store.create(db,spare);
  const base={revision:9,digest:'sha256:'+'a'.repeat(64)};
  const saved=await store.saveOrForkWithSelectionReceipt(db,A,1,{title:'Active'},B,1200,base,lease);
  await assert.rejects(store.renameSharedUnselected(db,B,1,'New title',lease,1300),/receipt unresolved/);
  assert.deepEqual(await store.get(db,B),spare);
  await store.retireSharedSelectionReceipt(db,saved.selectionReceipt,lease);
  const renamed=await store.renameSharedUnselected(db,B,1,'New title',lease,1300);
  assert.deepEqual(renamed,{...spare,title:'New title',revision:2,updatedAt:1300});
  await assert.rejects(store.renameSharedUnselected(db,B,1,'Stale',lease,1400),/changed in another tab/);
  assert.deepEqual(await store.get(db,B),renamed);
  assert.deepEqual(await store.get(db,A),saved.project);
  assert.equal(await store.readSharedSelectionReceipt(db),null);
  assert.equal((await store.list(db)).length,2);
});

test('shared legacy adoption preserves raw draft and inline and refuses unresolved receipt or changed inline',async()=>{
  const raw=legacyDraft(),inline=JSON.stringify(inlineState(raw)),db=memoryIndexedDB(raw);
  const env=migrationEnv(db,inline),adapter=originalCatalog(env),lease=sharedCalibrationLease();
  let checks=0;const verifyBase=async()=>{checks++;};
  await store.create(db,project(A));
  const receipt=await store.saveOrForkWithSelectionReceipt(db,A,1,{title:'Active'},B,1200,
    {revision:9,digest:'sha256:'+'a'.repeat(64)},lease);
  await assert.rejects(migration.migrate(env,{adapter,decoder:importer,lease,verifyBase}),/receipt unresolved/);
  assert.equal(await store.migrationMarker(db),null);
  await store.retireSharedSelectionReceipt(db,receipt.selectionReceipt,lease);
  const ensure=adapter.ensureOriginal;let inlineText=inline;
  env.localStorage.getItem=()=>inlineText;
  adapter.ensureOriginal=async(...args)=>{const result=await ensure(...args);inlineText='changed';return result;};
  await assert.rejects(migration.migrate(env,{adapter,decoder:importer,lease,verifyBase}),/inline session changed/);
  assert.equal(await store.migrationMarker(db),null);
  assert.deepEqual(await store.legacy(db),raw);
  adapter.ensureOriginal=ensure;inlineText=inline;
  const saved=await migration.migrate(env,{adapter,decoder:importer,lease,verifyBase,now:1300});
  assert.equal(saved.status,'migrated');assert.equal(saved.project.revision,1);
  assert.deepEqual(saved.project.checkpoint.payload.inline,JSON.parse(inline));
  assert.deepEqual(await store.legacy(db),raw);
  assert.equal(inlineText,inline);assert.ok(checks>=5);
  assert.equal((await migration.migrate(env,{adapter,decoder:importer,lease,verifyBase})).project.id,saved.project.id);
  assert.equal((await store.list(db)).length,2);
});

test('Calibration usage inspection preserves V1 standalone evidence without upgrading it',async()=>{
  const raw={version:2,record:{id:'original'},rows:[]},db=memoryIndexedDB(raw);
  assert.deepEqual(await store.inspectUsage(db),{projects:[],legacy:raw});
  assert.equal(db.version,1);
  assert.deepEqual([...db.tables.keys()],['draft']);
  const created=await store.create(db,project(A));
  const before=copy(db.tables.get(store.LEGACY).get('active'));
  assert.deepEqual(await store.inspectUsage(db),{projects:[model.summary(created)],legacy:raw});
  assert.deepEqual(db.tables.get(store.LEGACY).get('active'),before);
  const missing={databases:async()=>[],open(){throw Error('Unexpected open');}};
  assert.deepEqual(await store.inspectUsage(missing),{projects:[],legacy:null});
});

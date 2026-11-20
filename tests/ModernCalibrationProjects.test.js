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
  return {tables,
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
                  add:val=>request('add',val),put:val=>request('put',val),
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

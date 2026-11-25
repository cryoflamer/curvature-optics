'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const autosave=require('../src/ui/modern/ModernSessionAutosave');
const codec=require('../src/ui/modern/ModernExperimentState');

// Minimal IndexedDB transaction contract: request success is followed by
// transaction completion, and values persist across independently opened DBs.
function memoryIndexedDB(){
  const databases=new Map();
  return {open(name,version){
    const request={result:null,error:null};
    queueMicrotask(()=>{
      let db=databases.get(name),upgrade=false;
      if(!db){
        upgrade=true;
        const values=new Map();
        db={objectStoreNames:{contains(key){return key===autosave.STORE&&db.created;}},
          created:false,createObjectStore(key){assert.equal(key,autosave.STORE);db.created=true;},
          close(){},transaction(key,mode){
            assert.equal(key,autosave.STORE);
            const tx={error:null,oncomplete:null,onerror:null,onabort:null};
            function done(){queueMicrotask(()=>{if(tx.oncomplete)tx.oncomplete();});}
            tx.objectStore=()=>({
              get(key){const op={result:undefined};queueMicrotask(()=>{op.result=values.get(key);done();});return op;},
              put(value,key){assert.equal(mode,'readwrite');values.set(key,structuredClone(value));done();},
              delete(key){assert.equal(mode,'readwrite');values.delete(key);done();}
            });
            return tx;
          }};
        databases.set(name,db);
      }
      request.result=db;
      if(upgrade&&request.onupgradeneeded)request.onupgradeneeded();
      if(request.onsuccess)request.onsuccess();
    });
    return request;
  }};
}

test('working session uses one durable IDB checkpoint and can restore and clear it',async()=>{
  const db=memoryIndexedDB(),experiment={version:1,dummy:'scene'};
  assert.equal(await autosave.read(db),null);
  await autosave.write(db,experiment,100);
  assert.deepEqual(await autosave.read(db),{version:1,savedAt:100,experiment});
  await autosave.write(db,{version:1,dummy:'compare'},200);
  const current=autosave.normalize(await autosave.read(db),value=>value);
  assert.equal(current.savedAt,200);
  assert.equal(current.experiment.dummy,'compare');
  await autosave.clear(db);
  assert.equal(await autosave.read(db),null);
});

test('checkpoint validation and freshest-copy selection protect older local edits',()=>{
  const local={savedAt:101,experiment:'local'},remote={savedAt:102,experiment:'remote'};
  assert.equal(autosave.newer(local,remote),remote);
  assert.equal(autosave.newer(remote,local),remote);
  assert.equal(autosave.newer({...local,savedAt:null},remote).experiment,'local',
    'pre-IDB legacy local edits remain authoritative without comparable metadata');
  assert.equal(autosave.newer(null,remote),remote);
  assert.equal(autosave.newer(null,null),null);
  assert.throws(()=>autosave.normalize({version:2,savedAt:42,experiment:{}},codec.validate));
  assert.throws(()=>autosave.normalize({version:1,savedAt:42,experiment:{}},codec.validate),
    'corrupt experiments must be rejected before applying to the model');
  assert.throws(()=>autosave.write(null,{},0),/timestamp/);
  assert.equal(autosave.META_KEY,'curvature-modern-working-session-timestamp-v1');
});

test('blocked IndexedDB falls back gracefully without inventing a checkpoint',async()=>{
  assert.equal(await autosave.read(null),null);
  assert.equal(await autosave.write(null,{},100),null);
  assert.equal(await autosave.clear(null),null);
  const blocked={open(){throw Error('blocked');}};
  await assert.rejects(autosave.read(blocked),/blocked/);
  await assert.rejects(autosave.write(blocked,{},100),/blocked/);
  await assert.rejects(autosave.clear(blocked),/blocked/);
});


test('working-session write and clear use a shared Web Lock until IDB transaction completion',async()=>{
  const requests=[],lockManager={request(name,options,action){
    requests.push({name,mode:options.mode});
    return action({name,mode:options.mode});
  }};
  const db=memoryIndexedDB(),coordinated=autosave.makeAdapter(lockManager);
  assert.equal(coordinated.coordination,'participating-writer');
  await coordinated.write(db,{version:1,dummy:'coordinated'},900);
  assert.equal((await coordinated.read(db)).savedAt,900);
  await coordinated.clear(db);
  assert.equal(await coordinated.read(db),null);
  assert.deepEqual(requests.map(x=>x.mode),['shared','shared']);
  assert.equal(requests[0].name,requests[1].name);
  assert.equal(autosave.makeAdapter(null).coordination,'uncoordinated');
  assert.throws(()=>autosave.makeAdapter({}),/Web Locks manager is invalid/);
});

test('working-session lock is held until the explicit IDB completion acknowledgement',async()=>{
  const requests=[],gates=[];
  const lockManager={request(name,options,action){
    requests.push(options.mode);
    return action({name,mode:options.mode});
  }};
  // The transaction intentionally does not complete when store.put returns.
  const db={open(){
    const req={result:null};
    queueMicrotask(()=>{
      const connection={
        objectStoreNames:{contains(){return true;}},
        close(){},
        transaction(){
          const tx={};
          tx.objectStore=()=>({put(){gates.push(tx);}});
          return tx;
        }
      };
      req.result=connection;
      req.onsuccess();
    });
    return req;
  }};
  const adapter=autosave.makeAdapter(lockManager);
  let settled=false;
  const pending=adapter.write(db,{version:1,dummy:'waiting'},1200).then(()=>{settled=true;});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests.length,1);
  assert.equal(gates.length,1);
  assert.equal(settled,false,'request success is not a durable completion');
  gates[0].oncomplete();
  await pending;
  assert.equal(settled,true);
});

test('failed working-session transactions release shared locks and report failure',async()=>{
  const requests=[];
  const lockManager={request(name,options,action){
    requests.push(options.mode);
    return action({name,mode:options.mode});
  }};
  const blocked={open(){throw Error('IndexedDB blocked');}};
  const adapter=autosave.makeAdapter(lockManager);
  await assert.rejects(adapter.write(blocked,{version:1},123),/IndexedDB blocked/);
  await assert.rejects(adapter.clear(blocked),/IndexedDB blocked/);
  assert.deepEqual(requests,['shared','shared']);
});

test('retired implicit migration is absent and local-only selection is explicit',async()=>{
  const db=recoveryMemoryDB(),adapter=autosave.makeAdapter({request(name,options,action){
    return action({name,mode:options.mode});
  }});
  assert.equal(adapter.prepareWorkingCopy,undefined);
  assert.equal(autosave.prepareWorkingCopy,undefined);
  const crypto=require('node:crypto').webcrypto,lease={sessionId:'shared',check(){},track(){return ()=>{};}};
  const codec={STORAGE_KEY:'fixture',validate(v){assert.equal(v.display.mode,'scene');return v;}};
  assert.equal(autosave.makeAdapter(null).openWorkingCopy(db,{lease,codec,crypto}).write,undefined);
  const working=adapter.openWorkingCopy(db,{lease,codec,crypto});
  const empty={getItem:()=>null};
  assert.deepEqual(await working.inspectMigration(empty),{candidates:[],issues:[]});
  const experiment={display:{mode:'scene'},height:3};
  const storage={getItem:key=>key==='fixture'?JSON.stringify(experiment):null};
  const inventory=await working.inspectMigration(storage);
  assert.equal(inventory.candidates.length,1);
  assert.equal(inventory.candidates[0].selection.source,'local');
  assert.equal(db.rows.size,0);
  assert.equal(working.prepareSelectedMigration,undefined);
  const contract=require('../src/storage/ModernDocumentSession');
  const checkpoint=adapter.openSharedCheckpoint(db,{lease,codec,crypto,contract});
  const opts={sessions:{read:async()=>({revision:0,envelope:null})},storage,coordinate:f=>f(),isCurrent:()=>true};
  const selected=(await checkpoint.inspectSources(opts)).candidates[0].selection;
  await assert.rejects(checkpoint.migrateSource(selected,{...opts,isCurrent:()=>false}),/stale migration generation/);
  await assert.rejects(checkpoint.migrateSource(selected,{...opts,storage:empty}),/evidence changed/);
  assert.equal(db.rows.size,0);
  assert.deepEqual((await checkpoint.migrateSource(selected,opts)).experiment,experiment);
  assert.deepEqual([...db.rows.keys()],['shared-checkpoint']);
  assert.equal(await autosave.read(db),null);
});

// Transaction-level fake for the recovery contract. Requests run in order,
// readwrite data becomes visible only at oncomplete, abort discards changes.
// Real IndexedDB, Web Crypto and F5 are covered by targeted Chromium.
function recoveryMemoryDB(){
  const rows=new Map();
  return {rows,open(){
    const req={};
    queueMicrotask(()=>{
      req.result={objectStoreNames:{contains:()=>true},close(){},
        transaction(key,mode){
          assert.equal(key,autosave.STORE);
          const values=new Map(rows);
          let pending=0,finished=false;
          const tx={error:null,abort(){
            if(finished)throw Error('transaction inactive');
            finished=true;queueMicrotask(()=>tx.onabort?.());
          }};
          function complete(){
            if(finished||pending)return;
            finished=true;
            if(mode==='readwrite'){rows.clear();for(const [k,v] of values)rows.set(k,v);}
            tx.oncomplete?.();
          }
          function request(action){
            const op={};pending++;
            queueMicrotask(()=>{
              if(finished)return;
              try{op.result=action();op.onsuccess?.();}
              catch(error){tx.error=error;tx.abort();}
              finally{pending--;queueMicrotask(complete);}
            });
            return op;
          }
          const store={transaction:tx,get:k=>request(()=>values.has(k)?structuredClone(values.get(k)):undefined),
            getAllKeys:()=>request(()=>[...values.keys()]),
            add(v,k){return request(()=>{assert.equal(mode,'readwrite');assert(!values.has(k));values.set(k,structuredClone(v));});},
            put(v,k){return request(()=>{assert.equal(mode,'readwrite');values.set(k,structuredClone(v));});},
            delete(k){return request(()=>{assert.equal(mode,'readwrite');values.delete(k);});}};
          tx.objectStore=()=>store;queueMicrotask(complete);return tx;
        }};
      req.onsuccess();
    });
    return req;
  }};
}
// Test-only historical row constructor; never run a retired import writer.
async function seedHistoricalImport(db,crypto,candidate){
  const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?
    Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
  const id='shared-experiment',experiment=structuredClone(candidate.experiment);
  const revision='sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(canonical(experiment)))),x=>x.toString(16).padStart(2,'0')).join('');
  db.rows.set('working-copy:'+id,{format:'curvature-modern-working-import',version:1,id,
    revision,experiment,origin:candidate.selection});
  return {id,revision,recovery:null};
}
// Historical fixtures construct on-disk bytes, not a production writer.
async function historicalDigest(crypto,value){
  const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?
    Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
  return 'sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(canonical(value)))),x=>x.toString(16).padStart(2,'0')).join('');
}
async function seedHistoricalRevision(db,crypto,experiment,previousRevision){
  const id='shared-experiment',n=previousRevision.startsWith('rev:')?Number(previousRevision.split(':')[1])+1:2;
  const revision='rev:'+n+':'+await historicalDigest(crypto,experiment);
  db.rows.set('working-revision:'+id+':'+revision,{format:'curvature-modern-working-revision',
    version:1,id,revision,previousRevision,experiment:structuredClone(experiment)});
  db.rows.set('working-head:'+id,{format:'curvature-modern-working-head',version:1,id,revision});
  return {kind:'experiment',id,revision};
}
async function seedHistoricalRecovery(db,crypto,experiment,baseRevision){
  const documentId='shared-experiment',id='shared-experiment-recovery',revision=crypto.randomUUID();
  const data={format:'curvature-modern-working-recovery',version:1,id,documentId,revision,baseRevision,
    experiment:structuredClone(experiment)};
  db.rows.set('working-recovery:'+documentId,{...data,digest:await historicalDigest(crypto,data)});
  return {kind:'experiment',id,documentId,revision,baseRevision,experiment};
}
async function recoveryFixture(){
  const crypto=require('node:crypto').webcrypto,db=recoveryMemoryDB();
  const adapter=autosave.makeAdapter({request(name,options,action){return action({name,mode:options.mode});}});
  const base={display:{mode:'scene'},height:1};
  const codec={STORAGE_KEY:'fixture',validate(v){
    assert(['scene','compare'].includes(v.display.mode));assert(Number.isFinite(v.height));return v;
  }};
  let active=true;
  const lease={sessionId:'shared',check(){if(!active)throw Error('lease lost');},track(){return ()=>{};}};
  const open=()=>adapter.openWorkingCopy(db,{lease,codec,crypto});
  await adapter.write(db,base,100);
  const a=open(),storage={getItem:()=>null};
  const inventory=await a.inspectMigration(storage);
  await seedHistoricalImport(db,crypto,inventory.candidates[0]);
  const initial=await a.read();
  return {db,crypto,open,a,initial,base,lease,lose(){active=false;}};
}
test('working recovery survives reopening and historical fork remains readable',async()=>{
  const f=await recoveryFixture(),edit={...f.base,height:2};
  assert.equal(await f.a.readRecovery(),null);
  const staged=await seedHistoricalRecovery(f.db,f.crypto,edit,f.initial.revision);
  assert.equal(staged.baseRevision,f.initial.revision);
  assert.deepEqual((await f.open().readRecovery()),staged);
  assert.deepEqual(await f.a.read(),f.initial);
  const childLease={tabId:'child-tab',check(){},track(){return ()=>{};}};
  const adapter=autosave.makeAdapter({request(name,options,action){return action({name,mode:options.mode});}});
  assert.throws(()=>adapter.openWorkingCopy(f.db,{lease:childLease}),/shared document lifetime required/);
  assert.equal(adapter.prepareWorkingCopy,undefined);
  // Historical on-disk fixture; production no longer creates fork records.
  const id='working-child-tab';
  f.db.rows.set('working-copy:'+id,{format:'curvature-modern-working-fork',version:1,
    id,revision:f.initial.revision,experiment:f.base,
    origin:{id:f.initial.id,revision:f.initial.revision,sessionRevision:1}});
  assert.deepEqual((await adapter.readWorkingCopy(f.db,id,{validate:v=>v},require('node:crypto').webcrypto)).experiment,f.base);
  assert.deepEqual(await f.a.readRecovery(),staged);
  const shared=autosave.makeAdapter({request(name,options,action){return action({name,mode:options.mode});}})
    .openWorkingCopy(f.db,{lease:{sessionId:'shared',check(){},track(){return ()=>{};}},
      codec:{STORAGE_KEY:'fixture',validate:v=>v},crypto:require('node:crypto').webcrypto});
  const inventory=await shared.inspectMigration({getItem:()=>null});
  assert.deepEqual(inventory.candidates.find(x=>x.selection.key==='working-copy:'+id).experiment,f.base);
});
test('historical revisions and recovery are read-only and preserve divergent evidence',async()=>{
  const f=await recoveryFixture(),one={...f.base,height:2},two={...f.base,height:3};
  const receipt=await seedHistoricalRevision(f.db,f.crypto,one,f.initial.revision);
  const draft=await seedHistoricalRecovery(f.db,f.crypto,two,receipt.revision);
  const before=structuredClone([...f.db.rows.entries()]);
  assert.equal(f.a.write,undefined);
  assert.equal(f.a.stageRecovery,undefined);
  assert.equal(f.a.retireRecovery,undefined);
  assert.deepEqual(await f.a.readRecovery(),draft);
  assert.deepEqual((await f.a.read()).experiment,one);
  assert.deepEqual((await f.a.readRevision(f.initial.revision)).experiment,f.base);
  assert.deepEqual([...f.db.rows.entries()],before);
});
test('working recovery refuses corrupt evidence, invalid base and lost lease',async()=>{
  const f=await recoveryFixture(),edit={...f.base,height:2};
  await seedHistoricalRecovery(f.db,f.crypto,edit,'sha256:'+'0'.repeat(64));
  await assert.rejects(f.a.readRecovery(),/identity mismatch|missing or incompatible/);
  const staged=await seedHistoricalRecovery(f.db,f.crypto,edit,f.initial.revision);
  const key='working-recovery:'+f.initial.id,original=f.db.rows.get(key);
  f.db.rows.set(key,{...original,experiment:{...edit,height:99}});
  const corrupt=structuredClone(f.db.rows.get(key));
  await assert.rejects(f.a.readRecovery(),/digest mismatch/);
  await assert.rejects(f.open().readRecovery(),/digest mismatch/);
  assert.deepEqual(f.db.rows.get(key),corrupt);
  f.db.rows.set(key,original);f.lose();
  await assert.rejects(f.a.readRecovery(),/lease lost/);
  assert.deepEqual(f.db.rows.get(key),original);
});

test('historical shared revision and malformed record retain original checkpoint',async()=>{
  const f=await recoveryFixture(),edit={...f.base,height:2};
  f.db.rows.set('working-recovery:working-old',{legacy:true});
  const receipt=await seedHistoricalRevision(f.db,f.crypto,edit,f.initial.revision);
  const draft=await seedHistoricalRecovery(f.db,f.crypto,edit,f.initial.revision);
  const before=structuredClone([...f.db.rows.entries()]);
  const evidence=await f.a.readMigrationEvidence(f.initial.revision);
  assert.equal(evidence.head.revision,receipt.revision);
  assert.deepEqual(evidence.bound,f.initial);
  assert.deepEqual(evidence.draft,draft);
  assert.deepEqual(await autosave.read(f.db),{version:1,savedAt:100,experiment:f.base});
  assert.deepEqual([...f.db.rows.entries()],before);
  assert.equal((await f.a.inspectMigration({getItem:()=>null})).issues[0].key,'working-recovery:working-old');
});

test('explicit shared migration selects a verified old draft and retains every source',async()=>{
  const crypto=require('node:crypto').webcrypto,db=recoveryMemoryDB();
  const base={display:{mode:'scene'},height:1},experiment={...base,height:4},id='working-recovery-tab';
  const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?
    Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
  const digest=async v=>'sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(canonical(v)))),x=>x.toString(16).padStart(2,'0')).join('');
  const source={version:1,savedAt:100,experiment:base},revision=await digest(base);
  const copy={format:'curvature-modern-working-copy',version:1,id,revision,source};
  const data={format:'curvature-modern-working-recovery',version:1,id:'recovery-recovery-tab',
    documentId:id,revision:crypto.randomUUID(),baseRevision:revision,experiment};
  const draft={...data,digest:await digest(data)};
  db.rows.set('current',source);db.rows.set('working-copy:'+id,copy);
  db.rows.set('working-recovery:'+id,draft);
  const adapter=autosave.makeAdapter({request(name,options,action){return action({name,mode:options.mode});}});
  const codec={STORAGE_KEY:'fixture',validate:v=>v};
  const lease={sessionId:'shared',check(){},track(){return ()=>{};}};
  const shared=adapter.openWorkingCopy(db,{lease,codec,crypto});
  const storage={getItem:key=>key==='fixture'?JSON.stringify({...base,height:7}):null};
  db.rows.set('bad-row',{version:99});
  const inventory=await shared.inspectMigration(storage);
  assert.equal(inventory.candidates.length,4);
  assert.equal(inventory.issues[0].key,'bad-row');
  const choice=inventory.candidates.find(x=>x.selection.key==='working-recovery:'+id);
  assert.deepEqual(choice.experiment,draft.experiment);
  const contract=require('../src/storage/ModernDocumentSession');
  const checkpoint=adapter.openSharedCheckpoint(db,{lease,codec,crypto,contract});
  const opts={storage,isCurrent:()=>true,coordinate:f=>f(),sessions:{read:async()=>({revision:0,envelope:null})}};
  const view=await checkpoint.inspectSources(opts);
  const selected=view.candidates.find(x=>x.selection.key==='working-recovery:'+id).selection;
  await assert.rejects(checkpoint.migrateSource({...selected,digest:'wrong'},opts),/evidence changed/);
  const saved=await checkpoint.migrateSource(selected,opts);
  assert.deepEqual(saved.experiment,draft.experiment);
  assert.deepEqual(await checkpoint.read(),saved);
  await assert.rejects(checkpoint.migrateSource(view.candidates.find(x=>x.selection.source==='local').selection,opts),
    /already initialized/);
  assert.deepEqual(db.rows.get('working-recovery:'+id),draft);
  assert.deepEqual(db.rows.get('working-copy:'+id),copy);
  assert.deepEqual(db.rows.get('bad-row'),{version:99});
  assert.equal(db.rows.has('working-copy:shared-experiment'),false);
});

function atomicFixture(){
  const db=recoveryMemoryDB(),crypto=require('node:crypto').webcrypto;
  const contract=require('../src/storage/ModernDocumentSession');
  const adapter=autosave.makeAdapter({request(name,options,action){return action({name,mode:options.mode});}});
  const codec={STORAGE_KEY:'fixture',validate(v){assert(['scene','compare'].includes(v.display.mode));assert(Number.isFinite(v.height));return v;}};
  const lease={sessionId:'shared',check(){},track(){return ()=>{};}};
  const open=()=>adapter.openSharedCheckpoint(db,{lease,codec,crypto,contract});
  return {db,adapter,contract,open,lease,codec,crypto,base:{display:{mode:'scene'},height:1}};
}
test('atomic shared checkpoint keeps only one current row and promotes the exact draft',async()=>{
  const f=atomicFixture(),a=f.open();
  await f.adapter.write(f.db,f.base,100);
  const old=structuredClone(f.db.rows.get('current'));
  const other={id:'animation-project',revision:'4',recovery:null};
  const envelope=f.contract.select(f.contract.select(f.contract.emptyShared(),'animation',other),'scene');
  assert.equal(await a.read(),null);
  const initial=await a.initialize(f.base,envelope);
  assert.equal(initial.revision,1);
  assert.equal(initial.envelope.documents.experiment.revision,'checkpoint:1');
  assert.deepEqual(initial.envelope.documents.animation,other);
  let current=initial;
  for(let i=0;i<10;i++){
    const edit={display:{mode:'compare'},height:i+2};
    const staged=await a.stage(edit,current.revision);
    assert.deepEqual(staged.experiment,current.experiment);
    assert.deepEqual(staged.draft,edit);
    assert.deepEqual(staged.envelope,current.envelope);
    current=await a.promote(staged.revision);
    assert.deepEqual(current.experiment,edit);
    assert.equal(current.draft,null);
    assert.equal(current.envelope.workspace,'compare');
    assert.equal(current.envelope.documents.experiment.revision,'checkpoint:'+current.revision);
    assert.deepEqual(current.envelope.documents.animation,other);
  }
  assert.equal(current.revision,21);
  const staged=await a.stage(current.experiment,current.revision);
  const same=await a.promote(staged.revision);
  assert.equal(same.revision,23);
  assert.deepEqual(same.envelope,current.envelope);
  assert.deepEqual(await f.open().read(),same);
  assert.deepEqual([...f.db.rows.keys()],['current','shared-checkpoint']);
  assert.deepEqual(f.db.rows.get('current'),old);
});
test('atomic checkpoint rejects stale initialization, stage and promotion without losing evidence',async()=>{
  const f=atomicFixture(),a=f.open(),b=f.open();
  await assert.rejects(a.initialize(f.base),/read current shared checkpoint/);
  await a.read();await b.read();
  const one=await a.initialize(f.base);
  await assert.rejects(b.initialize(f.base),/CAS conflict/);
  await b.read();
  const edit={...f.base,height:2},two=await a.stage(edit,one.revision);
  await assert.rejects(b.stage({...edit,height:3},one.revision),/CAS conflict/);
  await b.read();
  const three=await a.stage({...edit,height:4},two.revision);
  await assert.rejects(b.promote(two.revision),/CAS conflict/);
  assert.deepEqual(await f.open().read(),three);
  const committed=await a.promote(three.revision);
  assert.equal(committed.experiment.height,4);
  assert.equal(committed.draft,null);
});
test('atomic checkpoint fails closed on corrupt bytes and invalid binding',async()=>{
  const f=atomicFixture(),a=f.open();
  await a.read();const initial=await a.initialize(f.base);
  const row=f.db.rows.get('shared-checkpoint');
  f.db.rows.set('shared-checkpoint',{...row,experiment:{...f.base,height:100}});
  const corrupt=structuredClone(f.db.rows.get('shared-checkpoint'));
  await assert.rejects(a.read(),/digest mismatch/);
  await assert.rejects(a.stage(f.base,initial.revision),/read current shared checkpoint/);
  assert.deepEqual(f.db.rows.get('shared-checkpoint'),corrupt);
  f.db.rows.set('shared-checkpoint',null);
  await assert.rejects(a.read(),/invalid shared checkpoint/);
  assert.equal(f.db.rows.get('shared-checkpoint'),null);
});

async function legacyAtomicFixture(){
  const f=atomicFixture(),{db,adapter,contract,lease,codec,crypto,base}=f;
  const working=adapter.openWorkingCopy(db,{lease,codec,crypto}),storage={getItem:()=>null};
  await adapter.write(db,base,100);
  const inventory=await working.inspectMigration(storage);
  const document=await seedHistoricalImport(db,crypto,inventory.candidates[0]);
  const initial=await working.read();
  const other={id:'animation-project',revision:'4',recovery:null};
  const envelope=contract.select(contract.select(contract.emptyShared(),'animation',other),'scene',document);
  let row={revision:1,envelope};
  const sessions={async read(){return structuredClone(row);}};
  const opts={sessions,coordinate:action=>action(),isCurrent:()=>true};
  return {...f,working,initial,opts,changeSession(){row={...row,revision:row.revision+1};}};
}
test('atomic migration preserves the acknowledged experiment, compatible draft and old records',async()=>{
  const f=await legacyAtomicFixture(),a=f.open();
  const edit={...f.base,display:{mode:'compare'},height:2};
  await seedHistoricalRecovery(f.db,f.crypto,edit,f.initial.revision);
  const view=await a.inspectLegacy(f.opts);
  assert.equal(view.bound.revision,view.head.revision);
  assert.deepEqual(view.choices,[{revision:f.initial.revision,draftModes:['keep','archive']}]);
  const before=[...f.db.rows.entries()];
  const selection={digest:view.digest,revision:view.bound.revision,draft:'keep'};
  const saved=await a.migrateLegacy(selection,f.opts);
  assert.equal(saved.revision,1);
  assert.deepEqual(saved.experiment,f.base);
  assert.deepEqual(saved.draft,edit);
  assert.equal(saved.envelope.workspace,'scene');
  assert.equal(saved.envelope.documents.animation.id,'animation-project');
  assert.deepEqual([...f.db.rows.entries()].filter(([key])=>key!=='shared-checkpoint'),before);
  const promoted=await a.promote(saved.revision);
  assert.deepEqual(promoted.experiment,edit);
  assert.equal(promoted.envelope.workspace,'compare');
  assert.equal(promoted.draft,null);
  await assert.rejects(a.migrateLegacy(selection,f.opts),/already initialized/);
});
test('atomic migration explicitly resolves divergent HEAD and incompatible recovery',async()=>{
  const f=await legacyAtomicFixture(),a=f.open();
  const edit={...f.base,height:2},later={...f.base,height:3};
  await seedHistoricalRecovery(f.db,f.crypto,edit,f.initial.revision);
  const receipt=await seedHistoricalRevision(f.db,f.crypto,later,f.initial.revision);
  const view=await a.inspectLegacy(f.opts);
  assert.equal(view.head.revision,receipt.revision);
  assert.deepEqual(view.choices,[{revision:f.initial.revision,draftModes:['keep','archive']},
    {revision:receipt.revision,draftModes:['archive']}]);
  const selection={digest:view.digest,revision:receipt.revision,draft:'keep'};
  await assert.rejects(a.migrateLegacy(selection,f.opts),/compatible legacy revision and draft choice required/);
  assert.equal(await a.read(),null);
  f.changeSession();
  await assert.rejects(a.migrateLegacy({...selection,draft:'archive'},f.opts),/evidence changed/);
  const fresh=await a.inspectLegacy(f.opts);
  const before=[...f.db.rows.entries()];
  const saved=await a.migrateLegacy({...selection,digest:fresh.digest,draft:'archive'},f.opts);
  assert.deepEqual(saved.experiment,later);
  assert.equal(saved.draft,null);
  assert.deepEqual([...f.db.rows.entries()].filter(([key])=>key!=='shared-checkpoint'),before);
});
test('atomic migration compares the old raw evidence inside the destination transaction',async()=>{
  const f=await legacyAtomicFixture();
  const view=await f.open().inspectLegacy(f.opts);
  const selection={digest:view.digest,revision:view.bound.revision,draft:'none'};
  let injected=false;
  const crypto={subtle:{async digest(name,bytes){
    const result=await f.crypto.subtle.digest(name,bytes);
    if(!injected&&String.fromCharCode(...bytes).includes('"format":"curvature-modern-shared-checkpoint"')){
      injected=true;
      await seedHistoricalRevision(f.db,f.crypto,{...f.base,height:9},f.initial.revision);
    }
    return result;
  }}};
  const a=f.adapter.openSharedCheckpoint(f.db,{lease:f.lease,codec:f.codec,crypto,contract:f.contract});
  await assert.rejects(a.migrateLegacy(selection,f.opts),/legacy checkpoint evidence changed during migration/);
  assert.equal(injected,true);
  assert.equal(f.db.rows.has('shared-checkpoint'),false);
  assert.equal((await f.working.read()).experiment.height,9);
});

test('atomic migration rejects a stale generation after asynchronous hashing',async()=>{
  const f=await legacyAtomicFixture();
  const view=await f.open().inspectLegacy(f.opts);
  let current=true;
  const crypto={subtle:{async digest(name,bytes){
    const result=await f.crypto.subtle.digest(name,bytes);
    if(String.fromCharCode(...bytes).includes('"format":"curvature-modern-shared-checkpoint"'))
      current=false;
    return result;
  }}};
  const a=f.adapter.openSharedCheckpoint(f.db,{lease:f.lease,codec:f.codec,crypto,contract:f.contract});
  await assert.rejects(a.migrateLegacy({digest:view.digest,revision:view.bound.revision,draft:'none'},
    {...f.opts,isCurrent:()=>current}),/stale migration generation/);
  assert.equal(current,false);
  assert.equal(f.db.rows.has('shared-checkpoint'),false);
});

function unboundAtomicFixture(){
  const f=atomicFixture(),local=new Map();
  let row={revision:0,envelope:null};
  const storage={getItem:key=>local.has(key)?local.get(key):null};
  const opts={sessions:{async read(){return structuredClone(row);},async inspectLegacyDocuments(){return [];}},storage,
    coordinate:action=>action(),isCurrent:()=>true};
  return {...f,local,opts,setSession(value){row=value;}};
}
test('atomic source migration selects ordinary local or IDB without writing intermediate rows',async()=>{
  for(const source of ['local','idb']){
    const f=unboundAtomicFixture(),a=f.open();
    const local={...f.base,height:2};
    f.local.set(f.codec.STORAGE_KEY,JSON.stringify(local));
    await f.adapter.write(f.db,f.base,100);
    f.db.rows.set('malformed-old-row',{version:999});
    const view=await a.inspectSources(f.opts);
    assert.equal(view.candidates.length,2);
    assert.equal(view.issues.length,1);
    const selected=view.candidates.find(item=>item.selection.source===source);
    const before=[...f.db.rows.entries()],beforeLocal=[...f.local.entries()];
    const saved=await a.migrateSource(selected.selection,f.opts);
    assert.deepEqual(saved.experiment,source==='local'?local:f.base);
    assert.equal(saved.draft,null);
    assert.deepEqual([...f.db.rows.entries()].filter(([key])=>key!=='shared-checkpoint'),before);
    assert.deepEqual([...f.local.entries()],beforeLocal);
    assert.deepEqual(await f.open().read(),saved);
    await assert.rejects(a.migrateSource(selected.selection,f.opts),/already initialized/);
  }
});
test('atomic source migration preserves orphaned shared evidence and refuses a newly bound session',async()=>{
  const f=unboundAtomicFixture(),a=f.open();
  await f.adapter.write(f.db,f.base,100);
  const working=f.adapter.openWorkingCopy(f.db,{lease:f.lease,codec:f.codec,crypto:f.crypto});
  const sources=await working.inspectMigration(f.opts.storage);
  const document=await seedHistoricalImport(f.db,f.crypto,sources.candidates[0]);
  const bound=await working.read(),edit={...f.base,height:3};
  await seedHistoricalRecovery(f.db,f.crypto,edit,bound.revision);
  const view=await a.inspectSources(f.opts);
  const selected=view.candidates.find(item=>item.selection.key==='working-recovery:shared-experiment');
  assert.equal(view.candidates.length,3);
  assert.deepEqual(selected.experiment,edit);
  f.setSession({revision:1,envelope:f.contract.select(f.contract.emptyShared(),'scene',document)});
  await assert.rejects(a.migrateSource(selected.selection,f.opts),/use bound migration/);
  assert.equal(await a.read(),null);
  const other={id:'animation-project',revision:'4',recovery:null};
  const envelope=f.contract.select(f.contract.select(f.contract.emptyShared(),'animation',other),'scene');
  f.setSession({revision:2,envelope});
  await assert.rejects(a.migrateSource(selected.selection,f.opts),/evidence changed/);
  const fresh=await a.inspectSources(f.opts);
  const before=[...f.db.rows.entries()];
  const saved=await a.migrateSource(fresh.candidates.find(item=>item.selection.key===selected.selection.key).selection,f.opts);
  assert.deepEqual(saved.experiment,edit);
  assert.deepEqual(saved.envelope.documents.animation,other);
  assert.deepEqual([...f.db.rows.entries()].filter(([key])=>key!=='shared-checkpoint'),before);
});
test('atomic source migration detects local or IDB source changes during destination hashing',async()=>{
  for(const source of ['local','idb']){
    const f=unboundAtomicFixture();
    f.local.set(f.codec.STORAGE_KEY,JSON.stringify(f.base));
    await f.adapter.write(f.db,f.base,100);
    const view=await f.open().inspectSources(f.opts);
    let injected=false;
    const crypto={subtle:{async digest(name,bytes){
      const result=await f.crypto.subtle.digest(name,bytes);
      if(!injected&&String.fromCharCode(...bytes).includes('"format":"curvature-modern-shared-checkpoint"')){
        injected=true;
        const edit={...f.base,height:8};
        if(source==='local')f.local.set(f.codec.STORAGE_KEY,JSON.stringify(edit));
        else await f.adapter.write(f.db,edit,101);
      }
      return result;
    }}};
    const a=f.adapter.openSharedCheckpoint(f.db,{lease:f.lease,codec:f.codec,crypto,contract:f.contract});
    await assert.rejects(a.migrateSource(view.candidates.find(item=>item.selection.source===source).selection,f.opts),
      /evidence changed/);
    assert.equal(injected,true);
    assert.equal(f.db.rows.has('shared-checkpoint'),false);
  }
});

test('empty shared checkpoint initializes default exactly once without legacy writes',async()=>{
  const f=unboundAtomicFixture(),a=f.open();
  const saved=await a.initializeEmpty(f.base,f.opts);
  assert.equal(saved.revision,1);
  assert.equal(saved.draft,null);
  assert.deepEqual(saved.experiment,f.base);
  assert.deepEqual([...f.db.rows.keys()],['shared-checkpoint']);
  assert.equal(f.local.size,0);
  assert.deepEqual(await f.open().read(),saved);
  await assert.rejects(f.open().initializeEmpty({...f.base,height:5},f.opts),/already initialized/);
  assert.deepEqual(await f.open().read(),saved);
});
test('empty shared initialization refuses historical and malformed evidence',async()=>{
  for(const kind of ['local','stamp','idb','corrupt','metadata','session']){
    const f=unboundAtomicFixture();
    if(kind==='local')f.local.set(f.codec.STORAGE_KEY,JSON.stringify(f.base));
    if(kind==='stamp')f.local.set(autosave.META_KEY,'100');
    if(kind==='idb')await f.adapter.write(f.db,f.base,100);
    if(kind==='corrupt')f.db.rows.set('unknown',{version:99});
    if(kind==='metadata')f.opts.sessions.inspectLegacyDocuments=async()=>[{status:'invalid'}];
    if(kind==='session')f.setSession({revision:1,envelope:f.contract.emptyShared()});
    const before=structuredClone([...f.db.rows.entries()]);
    await assert.rejects(f.open().initializeEmpty(f.base,f.opts),/historical/);
    assert.deepEqual([...f.db.rows.entries()],before);
  }
});
test('empty shared initialization refuses new evidence during hashing and stale generation',async()=>{
  for(const kind of ['idb','local','generation']){
    const f=unboundAtomicFixture();
    let injected=false,live=true;
    const crypto={subtle:{async digest(name,bytes){
      const result=await f.crypto.subtle.digest(name,bytes);
      if(!injected&&String.fromCharCode(...bytes).includes('"format":"curvature-modern-shared-checkpoint"')){
        injected=true;
        if(kind==='idb')await f.adapter.write(f.db,{...f.base,height:9},100);
        if(kind==='local')f.local.set(f.codec.STORAGE_KEY,JSON.stringify(f.base));
        if(kind==='generation')live=false;
      }
      return result;
    }}};
    const a=f.adapter.openSharedCheckpoint(f.db,{lease:f.lease,codec:f.codec,crypto,contract:f.contract});
    await assert.rejects(a.initializeEmpty(f.base,{...f.opts,isCurrent:()=>live}),/historical|stale initialization/);
    assert.equal(injected,true);
    assert.equal(f.db.rows.has('shared-checkpoint'),false);
  }
});

test('atomic auxiliary selection verifies exact domain revision and keeps the physical checkpoint intact',async()=>{
  const f=atomicFixture(),a=f.open(),b=f.open();
  await a.read();const first=await a.initialize(f.base);await b.read();
  const binding={id:'calibration-project',revision:'rev:7',recovery:null};
  let reads=0;
  const opts={isCurrent:()=>true,readDocument:async(kind,id)=>{
    reads++;return {kind,id,revision:'rev:7'};
  }};
  const selected=await a.selectWorkspace('calibration',binding,first.revision,opts);
  assert.equal(reads,2,'verify before CAS and after readback');
  assert.equal(selected.envelope.workspace,'calibration');
  assert.deepEqual(selected.envelope.documents.calibration,binding);
  assert.deepEqual(selected.envelope.documents.experiment,first.envelope.documents.experiment);
  assert.deepEqual(selected.experiment,first.experiment);
  assert.equal(selected.draft,null);
  await assert.rejects(b.stage({...f.base,height:9},first.revision),/CAS conflict/);
  await assert.rejects(a.stage(f.base,selected.revision),/physical workspace/);
  assert.deepEqual(await a.read(),selected);
  const back=await a.selectWorkspace('scene',undefined,selected.revision,opts);
  assert.equal(back.envelope.workspace,'scene');
  assert.deepEqual(back.envelope.documents.calibration,binding);
  assert.deepEqual(back.envelope.documents.experiment,first.envelope.documents.experiment);
  assert.deepEqual(back.experiment,first.experiment);
});
test('auxiliary selection rejects missing references, dirty drafts and stale generations',async()=>{
  const f=atomicFixture(),a=f.open();await a.read();const first=await a.initialize(f.base);
  const binding={id:'calibration-project',revision:'rev:7',recovery:null};
  const opts={isCurrent:()=>true,readDocument:async()=>null};
  await assert.rejects(a.selectWorkspace('calibration',binding,first.revision,opts),/missing or revision changed/);
  assert.deepEqual(await a.read(),first);
  let current=true;
  await assert.rejects(a.selectWorkspace('calibration',binding,first.revision,{
    isCurrent:()=>current,readDocument:async(kind,id)=>{current=false;return {kind,id,revision:'rev:7'};}
  }),/stale restore generation|stale selection generation/);
  assert.deepEqual(await a.read(),first);
  const draft=await a.stage({...f.base,height:2},first.revision);
  await assert.rejects(a.selectWorkspace('calibration',binding,draft.revision,opts),/resolve physical draft/);
  assert.deepEqual(await a.read(),draft);
});
test('auxiliary postflight failure retains the selected pointer but rejects acknowledgement',async()=>{
  const f=atomicFixture(),a=f.open();await a.read();const first=await a.initialize(f.base);
  const binding={id:'calibration-project',revision:'rev:7',recovery:null};
  let reads=0;
  await assert.rejects(a.selectWorkspace('calibration',binding,first.revision,{
    isCurrent:()=>true,readDocument:async(kind,id)=>({kind,id,revision:++reads===1?'rev:7':'rev:8'})
  }),/missing or revision changed/);
  assert.equal(reads,2);
  const saved=await f.open().read();
  assert.equal(saved.revision,first.revision+1);
  assert.deepEqual(saved.envelope.documents.calibration,binding);
  assert.deepEqual(saved.experiment,first.experiment);
  assert.equal(saved.draft,null);
});

test('atomic Calibration Apply replaces physical payload and workspace without intermediate departure',async()=>{
  const f=atomicFixture(),a=f.open();
  const animation={id:'animation-project',revision:'rev:3',recovery:null};
  const envelope=f.contract.select(f.contract.select(f.contract.emptyShared(),'animation',animation),'scene');
  await a.read();const first=await a.initialize(f.base,envelope);
  const reference={id:'calibration-project',revision:'rev:7',recovery:null};
  let reads=0;
  const readDocument=async(kind,id)=>{reads++;return {kind,id,revision:'rev:7'};};
  const selected=await a.selectWorkspace('calibration',reference,first.revision,{readDocument,isCurrent:()=>true});
  const controller=f.contract.createAtomicExperimentController({lease:f.lease,checkpoint:f.open(),
    prepare:()=>{throw Error('Unexpected initialization');},isCurrent:()=>true,readDocument});
  await controller.open();reads=0;
  const next={display:{mode:'compare'},height:4};
  const committed=await controller.replaceFromCalibration(reference,f.base,next,()=>true);
  assert.equal(reads,2,'verify the exact domain reference before and after CAS');
  assert.equal(committed.status,'committed');
  const durable=await f.open().read();
  assert.equal(durable.revision,selected.revision+1);
  assert.equal(durable.envelope.workspace,'compare');
  assert.deepEqual(durable.envelope.documents.calibration,reference);
  assert.deepEqual(durable.envelope.documents.animation,animation);
  assert.equal(durable.envelope.documents.experiment.revision,'checkpoint:'+durable.revision);
  assert.deepEqual(durable.experiment,next);assert.equal(durable.draft,null);
  assert.deepEqual(committed.bound.experiment,next);
  await assert.rejects(controller.replaceFromCalibration(reference,f.base,next,()=>true),/active clean Calibration/);
});
test('atomic Calibration Apply fails closed on stale data, competing revisions and lost acknowledgement',async()=>{
  for(const fault of ['outgoing','reference','generation','stale','postflight']){
    const f=atomicFixture(),a=f.open();await a.read();const first=await a.initialize(f.base);
    const reference={id:'calibration-project',revision:'rev:7',recovery:null};
    const readDocument=async(kind,id)=>({kind,id,revision:'rev:7'});
    const selected=await a.selectWorkspace('calibration',reference,first.revision,{readDocument,isCurrent:()=>true});
    const b=f.open();await b.read();
    let expected=f.base,current=true,reads=0;
    const next={display:{mode:'compare'},height:9};
    const opts={isCurrent:()=>current,readDocument:async(kind,id)=>{
      reads++;
      if(fault==='generation')current=false;
      return {kind,id,revision:fault==='reference'||fault==='postflight'&&reads>1?'rev:8':'rev:7'};
    }};
    if(fault==='outgoing')expected={...f.base,height:8};
    let before=selected;
    if(fault==='stale')before=await b.selectWorkspace('scene',undefined,selected.revision,{isCurrent:()=>true});
    await assert.rejects(a.replaceFromCalibration(reference,expected,next,selected.revision,opts),
      /outgoing physical experiment changed|missing or revision changed|stale restore generation|stale Calibration Apply generation|CAS conflict/);
    const durable=await f.open().read();
    if(fault==='postflight'){
      assert.equal(durable.revision,selected.revision+1);
      assert.equal(durable.envelope.workspace,'compare');
      assert.deepEqual(durable.experiment,next);
      assert.deepEqual(durable.envelope.documents.calibration,reference);
    }else assert.deepEqual(durable,before,fault);
  }
});

test('atomic History restore preserves auxiliary selections and rejects stale physical replacement',async()=>{
  const f=atomicFixture(),a=f.open(),b=f.open();
  const animation={id:'animation-project',revision:'rev:3',recovery:null};
  const calibration={id:'calibration-project',revision:'rev:7',recovery:null};
  const envelope=f.contract.select(f.contract.select(f.contract.select(
    f.contract.emptyShared(),'animation',animation),'calibration',calibration),'scene');
  await a.read();const first=await a.initialize(f.base,envelope);await b.read();
  const controller=f.contract.createAtomicExperimentController({lease:f.lease,checkpoint:f.open(),
    prepare:()=>{throw Error('Unexpected initialization');},isCurrent:()=>true});
  await controller.open();
  const next={display:{mode:'compare'},height:9};
  const committed=await controller.replaceFromHistory(f.base,next,()=>true);
  const durable=await f.open().read();
  assert.equal(committed.status,'committed');
  assert.equal(durable.revision,first.revision+1);
  assert.equal(durable.envelope.workspace,'compare');
  assert.equal(durable.envelope.documents.experiment.revision,'checkpoint:'+durable.revision);
  assert.deepEqual(durable.envelope.documents.calibration,calibration);
  assert.deepEqual(durable.envelope.documents.animation,animation);
  assert.deepEqual(durable.experiment,next);
  assert.equal(durable.draft,null);
  await assert.rejects(b.replaceFromHistory(f.base,{...f.base,height:4},first.revision,
    {isCurrent:()=>true}),/CAS conflict/);
  assert.deepEqual(await f.open().read(),durable);
});

test('atomic History restore refuses drafts, auxiliary workspace and lost generation',async()=>{
  for(const fault of ['draft','auxiliary','generation','outgoing']){
    const f=atomicFixture(),a=f.open();await a.read();
    let before=await a.initialize(f.base);
    if(fault==='draft')before=await a.stage({...f.base,height:5},before.revision);
    if(fault==='auxiliary')before=await a.selectWorkspace('animation',
      {id:'anim',revision:'rev:1',recovery:null},before.revision,
      {readDocument:async(kind,id)=>({kind,id,revision:'rev:1'}),isCurrent:()=>true});
    await assert.rejects(a.replaceFromHistory(fault==='outgoing'?{...f.base,height:6}:f.base,
      {display:{mode:'compare'},height:7},before.revision,{isCurrent:()=>fault!=='generation'}),
      /active clean physical workspace|stale History restore generation|outgoing physical experiment changed/);
    assert.deepEqual(await f.open().read(),before);
  }
});

test('Physical provenance inventory retains committed, draft and historical sources without writes',async()=>{
  const db=recoveryMemoryDB(),crypto=require('node:crypto').webcrypto;
  db.databases=async()=>[{name:autosave.DATABASE,version:1}];
  const adapter=autosave.makeAdapter({request(name,options,action){return action({name,mode:options.mode});}});
  const contract=require('../src/storage/ModernDocumentSession');
  const codec={STORAGE_KEY:'fixture',validate(v){assert(['scene','compare'].includes(v.display.mode));return v;}};
  const lease={sessionId:'shared',check(){},track(){return ()=>{};}};
  const photo={version:1,sha256:'a'.repeat(64),width:2,height:2};
  const experiment={display:{mode:'scene'},calibrationOrigin:{photo}};
  const local=JSON.stringify(experiment),storage={getItem:key=>key==='fixture'?local:null};
  await adapter.write(db,experiment,100);
  const checkpoint=adapter.openSharedCheckpoint(db,{lease,codec,crypto,contract});
  assert.equal(await checkpoint.read(),null);
  const initial=await checkpoint.initialize(experiment);
  await checkpoint.stage({...experiment,extra:'draft'},initial.revision);
  db.rows.set('unknown',{version:999});
  const before=structuredClone([...db.rows]);
  const report=await adapter.inspectProvenance(db,{storage,codec,crypto,contract});
  assert.deepEqual(report.entries.map(entry=>entry.key).sort(),
    ['idb:current','local:fixture','shared:committed','shared:draft']);
  assert.match(report.issues.join('; '),/unknown/);
  assert.deepEqual([...db.rows],before);
  const observer=adapter.openSharedCheckpoint(db,{lease,codec,crypto,contract,existingOnly:true});
  await observer.read();
  await assert.rejects(observer.stage(experiment,initial.revision+1),/observational checkpoint reader cannot mutate/);
  const absent={databases:async()=>[],open(){throw Error('Must not create');}};
  const empty=await adapter.inspectProvenance(absent,{storage,codec,crypto,contract});
  assert.deepEqual(empty.entries.map(entry=>entry.key),['local:fixture']);
  assert.deepEqual(empty.issues,[]);
});

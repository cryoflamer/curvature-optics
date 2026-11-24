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

test('working-copy preparation gives explicit external intent priority without reading storage',async()=>{
  const adapter=autosave.makeAdapter(null);
  const external=await adapter.prepareWorkingCopy(null,{
    explicitIntent:true,isCurrent:()=>true});
  assert.deepEqual(external,{status:'external'});
  await assert.rejects(adapter.prepareWorkingCopy(null,{
    explicitIntent:false,isCurrent:()=>true}),/coordinated working-session writer required/);
  await assert.rejects(adapter.prepareWorkingCopy(null,{
    explicitIntent:true,isCurrent:()=>false}),/stale migration generation/);
  await assert.rejects(adapter.prepareWorkingCopy(null,{}),/generation guard required/);
});
test('working-copy preparation refuses local-only evidence instead of guessing a source',async()=>{
  const db=recoveryMemoryDB(),adapter=autosave.makeAdapter({request(name,options,action){
    return action({name,mode:options.mode});
  }});
  const lease={sessionId:'shared',check(){},track(){return ()=>{};}};
  const storage={getItem(key){return key===codec.STORAGE_KEY?'{"old":"draft"}':null;}};
  await assert.rejects(adapter.prepareWorkingCopy(db,{
    lease,storage,codec,explicitIntent:false,isCurrent:()=>true
  }),/local-only or incomplete checkpoint/);
  assert.equal(await autosave.read(db),null);
  const result=await adapter.prepareWorkingCopy(db,{
    lease,storage:{getItem(){return null;}},codec,
    explicitIntent:false,isCurrent:()=>true
  });
  assert.deepEqual(result,{status:'empty'});
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
  await adapter.prepareWorkingCopy(db,{lease,storage:{getItem:()=>null},
    codec,crypto,explicitIntent:false,isCurrent:()=>true});
  const a=open(),initial=await a.read();
  return {db,open,a,initial,base,lease,lose(){active=false;}};
}
test('working recovery survives reopening and historical fork remains readable',async()=>{
  const f=await recoveryFixture(),edit={...f.base,height:2};
  assert.equal(await f.a.readRecovery(),null);
  const staged=await f.a.stageRecovery(edit,f.initial.revision,null);
  assert.equal(staged.baseRevision,f.initial.revision);
  assert.deepEqual((await f.open().readRecovery()),staged);
  assert.deepEqual(await f.a.read(),f.initial);
  const childLease={tabId:'child-tab',check(){},track(){return ()=>{};}};
  const adapter=autosave.makeAdapter({request(name,options,action){return action({name,mode:options.mode});}});
  assert.throws(()=>adapter.openWorkingCopy(f.db,{lease:childLease}),/shared document lifetime required/);
  await assert.rejects(adapter.prepareWorkingCopy(f.db,{tabId:'child-tab',lease:childLease,
    explicitIntent:false,isCurrent:()=>true}),/shared migration lifetime required/);
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
test('working recovery CAS never erases a later edit or acknowledges a different payload',async()=>{
  const f=await recoveryFixture(),one={...f.base,height:2},two={...f.base,height:3};
  const first=await f.a.stageRecovery(one,f.initial.revision,null);
  const receipt=await f.a.write(one,f.initial.revision);
  const second=await f.a.stageRecovery(two,receipt.revision,first.revision);
  await assert.rejects(f.open().stageRecovery(one,f.initial.revision,first.revision),/revision conflict/);
  await assert.rejects(f.a.retireRecovery(first.revision,receipt.revision),/revision conflict/);
  await assert.rejects(f.a.retireRecovery(second.revision,receipt.revision),/differs/);
  await assert.rejects(f.a.stageRecovery(one,f.initial.revision,second.revision),/backwards/);
  assert.deepEqual(await f.a.readRecovery(),second);
  const saved=await f.a.write(two,receipt.revision);
  assert.equal(await f.a.retireRecovery(second.revision,saved.revision),true);
  assert.equal(await f.open().readRecovery(),null);
  assert.deepEqual((await f.a.readRevision(f.initial.revision)).experiment,f.base);
});
test('working recovery refuses corrupt evidence, invalid base and lost lease',async()=>{
  const f=await recoveryFixture(),edit={...f.base,height:2};
  await assert.rejects(f.a.stageRecovery(edit,'sha256:'+'0'.repeat(64),null),/identity mismatch/);
  const staged=await f.a.stageRecovery(edit,f.initial.revision,null);
  const key='working-recovery:'+f.initial.id,original=f.db.rows.get(key);
  f.db.rows.set(key,{...original,experiment:{...edit,height:99}});
  const corrupt=structuredClone(f.db.rows.get(key));
  await assert.rejects(f.a.readRecovery(),/digest mismatch/);
  await assert.rejects(f.a.stageRecovery(edit,f.initial.revision,staged.revision),/digest mismatch/);
  await assert.rejects(f.a.retireRecovery(staged.revision,f.initial.revision),/digest mismatch/);
  assert.deepEqual(f.db.rows.get(key),corrupt);
  f.db.rows.set(key,original);f.lose();
  await assert.rejects(f.a.readRecovery(),/lease lost/);
  assert.deepEqual(f.db.rows.get(key),original);
});

test('shared experiment migration, stale writers and recovery retain the original checkpoint',async()=>{
  const crypto=require('node:crypto').webcrypto,db=recoveryMemoryDB();
  const adapter=autosave.makeAdapter({request(name,options,action){return action({name,mode:options.mode});}});
  const codec={STORAGE_KEY:'fixture',validate:v=>v};
  const lease={sessionId:'shared',check(){},track(){return ()=>{};}};
  const base={display:{mode:'compare'},height:1,compare:{A:'vacuum',B:'standard'}};
  const opts={lease,storage:{getItem:()=>null},codec,crypto,explicitIntent:false,isCurrent:()=>true};
  await adapter.write(db,base,100);
  db.rows.set('working-recovery:working-old',{legacy:true});
  await assert.rejects(adapter.prepareWorkingCopy(db,opts),/explicit migration selection/);
  assert.deepEqual(db.rows.get('working-recovery:working-old'),{legacy:true});
  db.rows.delete('working-recovery:working-old'); // test fixture only
  const candidate=await adapter.prepareWorkingCopy(db,opts);
  assert.equal(candidate.document.id,'shared-experiment');
  assert.deepEqual(await adapter.prepareWorkingCopy(db,opts),candidate);
  const a=adapter.openWorkingCopy(db,{lease,codec,crypto}),b=adapter.openWorkingCopy(db,{lease,codec,crypto});
  assert.equal(a.prepareFork,undefined);
  const initial=await a.read();await b.read();
  const edit={...base,height:2},stale={...base,height:3};
  const draft=await a.stageRecovery(edit,initial.revision,null);
  const saved=await a.write(edit,initial.revision);
  await assert.rejects(b.write(stale,initial.revision),/revision or envelope conflict/);
  await a.retireRecovery(draft.revision,saved.revision);
  await assert.rejects(b.stageRecovery(stale,initial.revision,null),/base is no longer current/);
  assert.equal(await a.readRecovery(),null);
  assert.deepEqual((await a.read()).experiment,edit);
  assert.deepEqual((await a.readRevision(initial.revision)).experiment,base);
  assert.deepEqual(await adapter.read(db),{version:1,savedAt:100,experiment:base});
  await assert.rejects(adapter.prepareWorkingCopy(db,opts),/explicit migration selection/);
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
  const opts={storage,isCurrent:()=>true};
  await assert.rejects(shared.prepareSelectedMigration({...choice.selection,digest:'wrong'},opts),
    /evidence changed/);
  const saved=await shared.prepareSelectedMigration(choice.selection,opts);
  assert.equal(saved.document.id,'shared-experiment');
  assert.deepEqual((await shared.read()).experiment,draft.experiment);
  assert.deepEqual(await shared.prepareSelectedMigration(choice.selection,opts),saved);
  const local=inventory.candidates.find(x=>x.selection.source==='local');
  await assert.rejects(shared.prepareSelectedMigration(local.selection,opts),/existing shared migration differs/);
  assert.deepEqual(db.rows.get('working-recovery:'+id),draft);
  assert.deepEqual(db.rows.get('working-copy:'+id),copy);
  assert.deepEqual(db.rows.get('bad-row'),{version:99});
  await shared.read();
  await shared.write({...base,height:8},saved.document.revision);
  await assert.rejects(shared.prepareSelectedMigration(choice.selection,opts),/shared HEAD already exists/);
});

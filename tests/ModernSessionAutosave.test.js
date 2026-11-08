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

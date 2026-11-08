'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const state=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const history=require('../src/ui/modern/ModernExperimentHistory');
const legacy=require('../src/ui/modern/ModernExperimentLibrary');
function experiment(mode='scene'){
  const m={Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,CameraEast:0,CameraNorth:0,
    viewcenterHorizon:3,deviceRatio:1.5,showModel:1,rEarth:6371000,showGrid:1,
    DemoText:'Study',Description:'',ObjType:[3,3],NObjects:[85,2],ObjDist:[50,20000],
    ObjDeltaDist:[297.55,300],ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],
    ObjSizeType:[0,0],ObjSize:[23,64],ObjSizeVar:[0,0]};
  return state.capture(m,{atmosphere:'standard',occlusionRadius:6371000,preset:'pontchartrain',
    resetPreset:'pontchartrain'},compare.preset('globe-flat-vacuum'),
  {mode,eyeLevel:false,horizon:true,selected:'A'});
}
function storage(){const map=new Map();return {map,getItem:k=>map.has(k)?map.get(k):null,
  setItem(k,v){map.set(k,v);},removeItem(k){map.delete(k);}};}
// Same minimal asynchronous IndexedDB semantics used by the History tests,
// including a failed transaction when a write cannot be committed.
function indexedDB(){
  const records=new Map(),api={failAdd:false,nextId:1};
  const db={objectStoreNames:{contains:name=>name==='snapshots'},
    createObjectStore(){return {createIndex(){}};},close(){},
    transaction(_name,mode){let pending=0,done=false;
      const tx={error:null,oncomplete:null,onerror:null,onabort:null,
        abort(){if(done)return;done=true;tx.error=Error('transaction aborted');
          setImmediate(()=>tx.onabort&&tx.onabort());},
        objectStore(){const copy=x=>x===undefined?x:JSON.parse(JSON.stringify(x));
          const request=action=>{const r={result:null,error:null,onsuccess:null,onerror:null};pending++;
            setImmediate(()=>{if(done)return;
              try{r.result=action();r.onsuccess&&r.onsuccess();}
              catch(error){r.error=error;tx.error=error;done=true;tx.onabort&&tx.onabort();return;}
              pending--;if(!pending)setImmediate(()=>{if(!done&&!pending){done=true;tx.oncomplete&&tx.oncomplete();}});
            });return r;};
          return {getAll(){return request(()=>[...records.values()].map(copy));},
            get(id){return request(()=>copy(records.get(id)));},
            add(v){return request(()=>{if(mode!=='readwrite'||api.failAdd)throw Error('Quota exceeded');
              const id=api.nextId++;records.set(id,copy({...v,id}));return id;});},
            put(v){return request(()=>{if(mode!=='readwrite')throw Error('Read-only');
              records.set(v.id,copy(v));return v.id;});},
            delete(id){return request(()=>{if(mode!=='readwrite')throw Error('Read-only');records.delete(id);});}};
        }};return tx;
    }};
  api.open=()=>{const r={result:db,onupgradeneeded:null,onsuccess:null,onerror:null};
    setImmediate(()=>{r.onupgradeneeded&&r.onupgradeneeded();r.onsuccess&&r.onsuccess();});return r;};
  api.records=records;return api;
}
const picture={dataUrl:'data:image/webp;base64,YQ==',width:480,height:300,mode:'scene'};

test('Portable History archive round-trips names, notes, pins, timestamps and previews without altering physics',async()=>{
  const a=history.create({indexedDB:indexedDB(),now:()=>777});
  const saved=await a.record(experiment(),'manual',picture);
  await a.updateMetadata(saved.entry.id,'Lake inversion','Comparing atmospheric profiles');
  const record=await a.get(saved.entry.id);
  const json=history.exportPortable([record]);
  const decoded=history.parsePortable(json);
  assert.equal(decoded.length,1);
  assert.equal(decoded[0].name,'Lake inversion');
  assert.equal(decoded[0].description,'Comparing atmospheric profiles');
  assert.equal(decoded[0].pinned,true);
  assert.deepEqual(decoded[0].thumbnail,picture);
  assert.equal(decoded[0].createdAt,777);
  const b=history.create({indexedDB:indexedDB()});
  assert.deepEqual(await b.importEntries(decoded),{created:1,reused:0});
  const imported=(await b.list())[0];
  assert.equal(imported.source,'manual');
  assert.equal(imported.createdAt,777);
  assert.deepEqual(imported.experiment,record.experiment);
  assert.deepEqual(imported.thumbnail,picture);
  assert.deepEqual(await b.importEntries(decoded),{created:0,reused:1});
  assert.equal((await b.list()).length,1);
});

test('Bulk import preserves distinct legacy names for identical experiments and is idempotent',async()=>{
  const old=storage(),e=experiment();legacy.save(old,'Study A',e);legacy.save(old,'Study B',e);
  const original=old.getItem(legacy.KEY);
  const db=indexedDB(),h=history.create({indexedDB:db});
  assert.deepEqual(await legacy.migrate(old,h),{created:2,reused:0});
  assert.equal(old.getItem(legacy.MIGRATION_KEY),'done');
  assert.equal(old.getItem(legacy.KEY),original,'original browser library remains for rollback');
  assert.deepEqual(new Set((await h.list()).map(r=>r.name)),new Set(['Study A','Study B']));
  assert.ok((await h.list()).every(r=>r.source==='manual'&&!r.pinned));
  assert.deepEqual(await legacy.migrate(old,h),{skipped:true});
  assert.equal((await h.list()).length,2);
  // Simulate a crash after the IDB commit but before the migration marker.
  old.removeItem(legacy.MIGRATION_KEY);
  assert.deepEqual(await legacy.migrate(old,h),{created:0,reused:2});
  assert.equal((await h.list()).length,2);
});

test('Migration failure keeps legacy data and remains retryable',async()=>{
  const old=storage(),db=indexedDB(),h=history.create({indexedDB:db});
  legacy.save(old,'Important',experiment());db.failAdd=true;
  await assert.rejects(legacy.migrate(old,h),/Quota exceeded/);
  assert.equal(old.getItem(legacy.MIGRATION_KEY),null);
  assert.equal(legacy.read(old)[0].name,'Important');
  db.failAdd=false;
  assert.deepEqual(await legacy.migrate(old,h),{created:1,reused:0});
});

test('Compatible plain v1 experiment JSON imports without overwriting the live session',async()=>{
  const e=experiment('compare');
  const items=history.parsePortable(legacy.exportJson(e));
  assert.equal(items.length,1);assert.equal(items[0].name,'');
  const db=indexedDB(),h=history.create({indexedDB:db});
  const result=await h.importEntries(items);
  assert.equal(result.created,1);assert.equal((await h.list())[0].source,'manual');
  assert.deepEqual((await h.list())[0].experiment,e);
});

test('Invalid JSON, forged metadata or thumbnail rejects before any History mutation',async()=>{
  const h=history.create({indexedDB:indexedDB()});
  assert.throws(()=>history.parsePortable('{'),SyntaxError);
  assert.throws(()=>history.parsePortable('x'.repeat(history.MAX_PORTABLE_LENGTH+1)),/too large/);
  assert.throws(()=>history.parsePortable('{}'),/Unsupported History JSON format/);
  const item={experiment:experiment(),name:'Safe',description:'',pinned:false};
  const valid=history.parsePortable(history.exportPortable([item]));
  assert.equal(valid.length,1);
  const malformed={...item,pinned:'true'};
  assert.throws(()=>history.exportPortable([malformed]),/Invalid portable pin/);
  assert.throws(()=>history.exportPortable([{...item,name:'x'.repeat(121)}]),/exceeds/);
  assert.throws(()=>history.exportPortable([{...item,thumbnail:{...picture,dataUrl:'javascript:alert(1)'}}]),/thumbnail/);
  assert.throws(()=>h.importEntries([valid[0],malformed]),/Invalid portable pin/);
  assert.equal((await h.list()).length,0,'whole batch rejected before writes');
});

test('History is the sole Modern archive panel and retains four portable actions',()=>{
  const root=path.resolve(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  for(const id of ['ModernHistoryExportSelected','ModernHistoryExportAll','ModernHistoryExportCurrent',
    'ModernHistoryImport','ModernHistoryImportFile'])assert.ok(html.includes('id="'+id+'"'),id);
  for(const id of ['ModernLibraryToggle','ModernExperimentLibraryPanel','ModernLibrarySave'])
    assert.ok(!html.includes('id="'+id+'"'),id);
  assert.doesNotMatch(app,/function bindLibrary\(/);
  assert.match(app,/oldLibrary\.migrate\(root\.localStorage,experimentHistory\)/);
  assert.match(app,/historyFactory\.parsePortable\(contents\)/);
  assert.match(app,/experimentHistory\.importEntries\(entries\)/);
});

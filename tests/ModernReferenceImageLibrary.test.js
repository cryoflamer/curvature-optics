'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const library=require('../src/animation/ModernReferenceImageLibrary');
const importer=require('../src/ui/modern/ModernReferenceImageImport');
const ui=require('../src/ui/modern/ModernReferenceImageLibraryUI');
const fs=require('node:fs');
const path=require('node:path');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOo6TsAAANUAcuEDSEIAAAAAElFTkSuQmCC';
const raster={dataUrl:png,width:1,height:1};
const record=(id='one')=>({version:1,id,title:'Observation '+id,original:{...raster},thumbnail:{...raster}});
function memoryIndexedDB(){
  const records=new Map(),annotations=new Map(),known=new Set();
  let version=0;
  const stores={observations:records,annotations:annotations};
  return {records,annotations,get version(){return version;},open(name,requested){
    assert.equal(name,library.DATABASE);
    const target=requested===undefined?Math.max(1,version):requested;
    const request={result:null,error:null};
    queueMicrotask(()=>{
      const db={version:target,close(){},
        objectStoreNames:{contains:n=>known.has(n)},
        createObjectStore(name,opts){
          assert.equal(opts.keyPath,'id');assert.ok(name in stores);known.add(name);
          return {name};
        },
        transaction(names,mode){
          const included=Array.isArray(names)?names:[names];
          included.forEach(n=>assert.ok(known.has(n),'Missing store '+n));
          let pending=0,finished=false;
          const copies=Object.fromEntries(included.map(n=>[n,
            new Map([...stores[n]].map(([k,v])=>[k,structuredClone(v)]))]));
          // Browser IndexedDB also completes a transaction with no requests.
          // This happens when querying schema status without scanning rows.
          queueMicrotask(()=>{if(pending===0&&!finished){finished=true;tx.oncomplete&&tx.oncomplete();}});
          const tx={oncomplete:null,onabort:null,onerror:null,error:null,
            abort(){if(finished)return;finished=true;queueMicrotask(()=>tx.onabort&&tx.onabort());},
            objectStore(name){
              assert.ok(included.includes(name));const data=copies[name];
              function operation(method,key,value){
                const r={result:undefined,error:null,onsuccess:null};pending++;
                queueMicrotask(()=>{
                  if(finished)return;
                  if(method==='get')r.result=data.has(key)?structuredClone(data.get(key)):undefined;
                  if(method==='all')r.result=[...data.values()].map(v=>structuredClone(v));
                  if(method==='put'||method==='add'){
                    assert.equal(mode,'readwrite');
                    const id=value.id;
                    if(method==='add'&&data.has(id)){
                      finished=true;tx.error=Error('Constraint');tx.onerror&&tx.onerror();return;
                    }
                    data.set(id,structuredClone(value));
                  }
                  if(method==='delete'){assert.equal(mode,'readwrite');data.delete(key);}
                  r.onsuccess&&r.onsuccess();pending--;
                  if(pending===0&&!finished){
                    finished=true;
                    if(mode==='readwrite')included.forEach(n=>{
                      stores[n].clear();for(const [k,v]of copies[n])stores[n].set(k,v);
                    });
                    queueMicrotask(()=>tx.oncomplete&&tx.oncomplete());
                  }
                });return r;
              }
              return {get:k=>operation('get',k),getAll:()=>operation('all'),
                put:v=>operation('put',null,v),add:v=>operation('add',null,v),
                delete:k=>operation('delete',k)};
            }};
          return tx;
        }};
      request.result=db;
      if(target>version){
        request.oldVersion=version;
        if(request.onupgradeneeded)request.onupgradeneeded();
        version=target;
      }else if(target<version){
        request.error=Error('VersionError');if(request.onerror)request.onerror();return;
      }
      if(request.onsuccess)request.onsuccess();
    });
    return request;
  }};
}

test('create, list, reload, and protected deletion preserve independent identity and original bytes',async()=>{
  const db=memoryIndexedDB(),input=record();
  const created=await library.create(db,input);input.original.width=90;
  assert.equal(created.revision,1);
  assert.deepEqual((await library.get(db,'one')).record,record());
  const list=await library.list(db);assert.equal(list.length,1);assert.equal(list[0].original,undefined);
  assert.deepEqual(list[0].thumbnail,raster);
  await library.create(db,record('two'));
  await assert.rejects(library.remove(db,'one',1),/deletion is disabled/);
  assert.deepEqual((await library.get(db,'one')).record,record());assert.equal((await library.list(db)).length,2);
});
test('metadata edit retains original and thumbnail; revision rejects stale writers; deletion fails closed',async()=>{
  const db=memoryIndexedDB();await library.create(db,record());
  const row=await library.update(db,'one',1,{title:'New title',cameraMetadata:{pitchDeg:{status:'measured',value:0}}});
  assert.equal(row.revision,2);assert.equal(row.record.title,'New title');assert.deepEqual(row.record.original,raster);
  assert.deepEqual(row.record.thumbnail,raster);assert.equal(row.record.cameraMetadata.pitchDeg.value,0);
  await assert.rejects(library.update(db,'one',1,{title:'Old tab'}),/changed/);
  await assert.rejects(library.remove(db,'one',1),/deletion is disabled/);
  assert.equal((await library.get(db,'one')).record.title,'New title');
  await assert.rejects(library.remove(db,'one',2),/deletion is disabled/);
  assert.equal((await library.get(db,'one')).revision,2);
});
test('collision and invalid edit never replace observation bytes',async()=>{
  const db=memoryIndexedDB();await library.create(db,record());
  await assert.rejects(library.create(db,{...record(),title:'Collision'}),/exists/);
  await assert.rejects(library.update(db,'one',1,{original:raster}),/metadata/);
  await assert.rejects(library.update(db,'one',1,{sourceUrl:'javascript:alert(1)'}),/URL/);
  assert.deepEqual((await library.get(db,'one')).record,record());
});
test('limit rejects without evicting any observations',async()=>{
  const db=memoryIndexedDB();for(let i=0;i<library.MAX_ITEMS;i++)await library.create(db,record('item_'+i));
  await assert.rejects(library.create(db,record('extra')),/limit/);assert.equal((await library.list(db)).length,library.MAX_ITEMS);
  assert.throws(()=>library.quota([{data:'x'.repeat(library.MAX_CHARS)}]),/limit/);
});
test('missing storage and failed open reject explicitly',async()=>{
  await assert.rejects(library.list(undefined));
  await assert.rejects(library.list({open(){throw Error('Quota denied');}}),/Quota denied/);
});
test('secure random ID has fallback for non-secure browser context',()=>{
  assert.equal(library.makeId({randomUUID:()=> '1234-abcd'}),'reference_1234-abcd');
  assert.equal(library.makeId({getRandomValues:u=>u.fill(1)}),'reference_'+'01'.repeat(16));
});
const bytes=()=>Uint8Array.from(Buffer.from(png.split(',')[1],'base64'));
test('PNG header, MIME from bytes and base64 exact retention',()=>{
  assert.deepEqual(importer.inspect(bytes()),{type:'png',width:1,height:1});
  assert.equal(importer.dataUrl(bytes(),'png'),png);
});
test('JPEG SOF and WebP headers are parsed without decode',()=>{
  const jpg=Uint8Array.from([255,216,255,192,0,8,8,0,2,0,3,1]);
  assert.deepEqual(importer.inspect(jpg),{type:'jpeg',width:3,height:2});
  const webp=new Uint8Array(30);webp.set(Buffer.from('RIFF'),0);webp.set(Buffer.from('WEBPVP8X'),8);webp[24]=5;webp[27]=7;
  assert.deepEqual(importer.inspect(webp),{type:'webp',width:6,height:8});
  webp.set(Buffer.from('VP8 '),12);webp.set([0x9d,1,0x2a,3,0,4,0],23);
  assert.deepEqual(importer.inspect(webp),{type:'webp',width:3,height:4});
  webp.set(Buffer.from('VP8L'),12);webp[20]=47;new DataView(webp.buffer).setUint32(21,2|(3<<14),true);
  assert.deepEqual(importer.inspect(webp),{type:'webp',width:3,height:4});
});
test('oversized and unsupported/truncated headers are rejected prior to decode',()=>{
  const data=bytes();new DataView(data.buffer).setUint32(16,40000);
  assert.throws(()=>importer.inspect(data),/dimensions/);
  assert.throws(()=>importer.inspect(bytes().slice(0,20)),/dimensions/);
  assert.throws(()=>importer.inspect(Uint8Array.from(Buffer.from('<svg/>'))),/dimensions/);
});
function fakeEnv(width=1,height=1,fail=false){
  const canvas={width:0,height:0,getContext(){return {drawImage(){}};},toDataURL(){return png;}};
  return {Image:class{constructor(){this.naturalWidth=width;this.naturalHeight=height;}async decode(){if(fail)throw Error('Decode failed');}},document:{createElement:()=>canvas}};
}
function file(){const buffer=bytes();return {size:buffer.length,name:'photo.png',arrayBuffer:async()=>buffer.buffer};}
test('ingest retains original bytes and verifies decoded dimensions',async()=>{
  const imported=await importer.ingest(file(),'imported',fakeEnv());
  assert.deepEqual(imported.original,raster);assert.deepEqual(imported.thumbnail,raster);assert.equal(imported.title,'photo.png');
  await assert.rejects(importer.ingest(file(),'bad',fakeEnv(2,1)),/dimensions/);
  await assert.rejects(importer.ingest(file(),'bad',fakeEnv(1,1,true)),/Decode failed/);
  await assert.rejects(importer.ingest({size:21*1024*1024},'big',fakeEnv()),/20 MiB/);
});
test('metadata editor differentiates missing / unknown / known numeric zero and text',()=>{
  assert.equal(ui.metadataFact('','','','',true),null);
  assert.deepEqual(ui.metadataFact('unknown','5','1','Not surveyed',true),{status:'unknown',notes:'Not surveyed'});
  assert.deepEqual(ui.metadataFact('measured','0','0.2','',true),{status:'measured',value:0,uncertainty:.2});
  assert.deepEqual(ui.metadataFact('reported','Marriott','','',false),{status:'reported',value:'Marriott'});
  assert.throws(()=>ui.metadataFact('estimated','','','',true),/value/);
});
test('library scripts and standalone tab are isolated to Modern and outside Animation Studio',()=>{
  const root=path.resolve(__dirname,'..'),modern=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  for(const file of ['ModernReferenceImageLibrary.js','ModernReferenceImageImport.js','ModernReferenceImageLibraryUI.js']){
    assert.ok(modern.includes(file));for(const legacy of ['CurvatureApp.html','CurvatureDemosHost.html']){
      assert.ok(!fs.readFileSync(path.join(root,legacy),'utf8').includes(file));
    }
  }
  assert.match(modern,/<button[^>]*id="ModernImageLibraryTab"[^>]*>Image Library<\/button>/);
  assert.match(modern,/<section id="ModernImageLibraryWorkspace"[^>]*hidden>/);
  assert.match(modern,/<section id="ModernReferenceImageLibrary"[^>]*><\/section>/);
  assert.equal((modern.match(/id="ModernReferenceImageLibrary"/g)||[]).length,1);
  assert.ok(modern.indexOf('id="ModernReferenceImageLibrary"')<modern.indexOf('id="ModernAnimationWorkspace"'),
    'Image Library must be mounted separately from Animation Studio');
});

test('portable observations are imported atomically, conflicts remapped and repeated imports reused',async()=>{
  const db=memoryIndexedDB();await library.create(db,record('one'));
  let n=0;const crypto={randomUUID:()=>String(++n)};
  const assets=[{...record('one'),title:'Different provenance'},record('two')];
  const first=await library.importAssets(db,assets,crypto);
  assert.notEqual(first.get('one'),'one');assert.equal(first.get('two'),'two');
  assert.deepEqual((await library.get(db,'one')).record,record('one'));
  assert.equal((await library.get(db,first.get('one'))).record.title,'Different provenance');
  assert.deepEqual(await library.importAssets(db,assets,crypto),first);
  assert.equal((await library.list(db)).length,3);
  await assert.rejects(library.importAssets(db,Array.from({length:100},(_,i)=>record('new_'+i)),crypto),/limit/);
  assert.equal((await library.list(db)).length,3);
});

test('portable raster verification checks headers, actual decode and original dimensions without re-encoding',async()=>{
  assert.deepEqual(await importer.verify(record(),fakeEnv()),record());
  await assert.rejects(importer.verify({...record(),original:{...raster,width:2}},fakeEnv()),/header dimensions/);
  await assert.rejects(importer.verify(record(),fakeEnv(2,1)),/decoded dimensions/);
  await assert.rejects(importer.verify(record(),fakeEnv(1,1,true)),/Decode failed/);
});

const identityApi=require('../src/animation/ModernReferenceImage');
const {webcrypto,createHash}=require('node:crypto');
const identityEnv=()=>({...fakeEnv(),crypto:webcrypto});
const verifyOriginal=r=>importer.verifyOriginal(r,identityEnv());
test('canonical photo identity hashes original bytes, ignores aliases, title and thumbnail',async()=>{
  const a=await importer.identify(record(),identityEnv());
  assert.deepEqual(a,{version:1,sha256:createHash('sha256').update(bytes()).digest('hex'),width:1,height:1});
  assert.ok(Object.isFrozen(a));
  const renamed={...record('alias'),title:'Another title',author:'Source author'};delete renamed.thumbnail;
  assert.deepEqual(await importer.identify(renamed,identityEnv()),a);
  assert.deepEqual(identityApi.validateIdentity(JSON.parse(JSON.stringify(a))),a);
  assert.throws(()=>identityApi.validateIdentity({...a,sha256:'x'.repeat(64)}),/identity/);
  assert.throws(()=>identityApi.validateIdentity({...a,width:0}),/dimensions/);
  await assert.rejects(importer.identify(record(),{...identityEnv(),crypto:undefined}),/secure context/);
  await assert.rejects(importer.identify(record(),{...fakeEnv(1,1,true),crypto:webcrypto}),/Decode failed/);
  await assert.rejects(importer.identify({...record(),original:{...raster,width:2}},identityEnv()),/header dimensions/);
});
test('calibration ingestion reuses existing bytes across aliases with provenance intact',async()=>{
  const db=memoryIndexedDB();await library.create(db,{...record('original'),author:'Original author'});
  const source={...record('demo_alias'),author:'Different attribution'};
  const out=await library.ensureOriginal(db,source,webcrypto,verifyOriginal);
  assert.equal(out.reused,true);assert.equal(out.row.id,'original');
  assert.equal(out.row.record.author,'Original author');assert.equal(out.source.author,'Different attribution');
  assert.equal((await library.findOriginal(db,out.identity,webcrypto,verifyOriginal)).id,'original');
  await library.update(db,'original',1,{title:'Renamed'});
  assert.deepEqual((await library.ensureOriginal(db,source,webcrypto,verifyOriginal)).identity,out.identity);
  assert.equal((await library.list(db)).length,1);
});
test('calibration ingestion allocates conflicting aliases and retains different encoded bytes',async()=>{
  const db=memoryIndexedDB();await library.create(db,record());
  const other={...record(),original:{...raster,dataUrl:'data:image/png;base64,'+
    Buffer.concat([Buffer.from(bytes()),Buffer.from([1])]).toString('base64')}};
  const out=await library.ensureOriginal(db,other,webcrypto,verifyOriginal);
  assert.equal(out.reused,false);assert.notEqual(out.row.id,'one');
  assert.deepEqual(out.row.record.original,other.original);
  assert.deepEqual((await library.get(db,'one')).record,record());
  assert.equal((await library.ensureOriginal(db,other,webcrypto,verifyOriginal)).row.id,out.row.id);
  assert.equal(await library.findOriginal(db,{...out.identity,sha256:'0'.repeat(64)},webcrypto,verifyOriginal),null);
});
test('identity collision, inconsistent dimensions and decoder failure leave library untouched',async()=>{
  const db=memoryIndexedDB(),source=record();
  const fakeCrypto={subtle:{digest:async()=>new Uint8Array(32).buffer}};
  await library.create(db,{...record('bad'),original:{...raster,dataUrl:'data:image/png;base64,'+
    Buffer.concat([Buffer.from(bytes()),Buffer.from([1])]).toString('base64')}});
  await assert.rejects(library.ensureOriginal(db,source,fakeCrypto,verifyOriginal),/collision/);
  await assert.rejects(library.ensureOriginal(db,source,webcrypto,async()=>{throw Error('Decode failed');}),/Decode failed/);
  await assert.rejects(library.findOriginal(db,{...(await importer.identify(record('bad'),identityEnv())),
    sha256:'0'.repeat(64),width:2},fakeCrypto,verifyOriginal),/inconsistent raster/);
  assert.equal((await library.list(db)).length,1);
});
test('calibration ingestion rechecks changed originals and retries without duplicate insertion',async()=>{
  const db=memoryIndexedDB(),source=record('new');
  let inserted=false;
  const crypto={subtle:{digest:async(...args)=>{
    if(!inserted){inserted=true;await library.create(db,record('concurrent'));}
    return webcrypto.subtle.digest(...args);
  }}};
  // Introduce the other row after a snapshot has been taken, while hashing a
  // pre-existing unrelated original. The initial source hash must not insert it.
  const different={...record('different'),original:{...raster,dataUrl:'data:image/png;base64,'+
    Buffer.concat([Buffer.from(bytes()),Buffer.from([1])]).toString('base64')}};
  await library.create(db,different);
  let calls=0;inserted=false;
  crypto.subtle.digest=async(...args)=>{
    if(++calls===2){inserted=true;await library.create(db,record('concurrent'));}
    return webcrypto.subtle.digest(...args);
  };
  const out=await library.ensureOriginal(db,source,crypto,verifyOriginal);
  assert.ok(inserted);assert.equal(out.reused,true);assert.equal(out.row.id,'concurrent');
  assert.equal((await library.list(db)).length,2);
});

test('legacy v1 rows remain byte-identical through explicit opt-in annotation upgrade',async()=>{
  const db=memoryIndexedDB();
  await library.create(db,{...record('legacy'),author:'Attribution'});
  assert.equal(db.version,1);
  const backup=await library.exportBackup(db);
  assert.equal(backup.version,1);assert.equal(backup.format,'curvature-image-library-backup');
  assert.deepEqual(backup.observations[0].record,{...record('legacy'),author:'Attribution'});
  assert.deepEqual(backup.annotations,[]);
  assert.equal((await library.annotationStatus(db)).enabled,false);
  assert.equal((await library.list(db))[0].kind,'unclassified');
  assert.equal(db.version,1,'ordinary browsing must not upgrade the database');
  await assert.rejects(library.setAnnotation(db,'legacy',0,
    {kind:'photograph',tags:['bridge']}),/Enable/);
  await library.enableAnnotations(db);
  assert.equal(db.version,2);
  assert.equal((await library.annotationStatus(db)).enabled,true);
  assert.deepEqual((await library.get(db,'legacy')).record,backup.observations[0].record);
  assert.deepEqual((await library.list(db))[0].tags,[]);
  const annotation=await library.setAnnotation(db,'legacy',0,
    {kind:'photograph',tags:['bridge','Soundly'],collections:['Research']});
  assert.equal(annotation.annotationRevision,1);
  assert.equal((await library.get(db,'legacy')).kind,'photograph');
  const prior=await library.get(db,'legacy');
  await library.update(db,'legacy',prior.revision,{title:'Renamed legacy'});
  const changed=await library.get(db,'legacy');
  assert.equal(changed.kind,'photograph');
  assert.equal(changed.annotationRevision,1);
  assert.equal(changed.record.title,'Renamed legacy');
  assert.deepEqual(changed.record.original,record('legacy').original);
  const afterBackup=await library.exportBackup(db);
  assert.deepEqual(afterBackup.annotations[0].tags,['bridge','Soundly']);
  assert.equal(afterBackup.observations[0].record.original.dataUrl,backup.observations[0].record.original.dataUrl);
});
test('annotation metadata validates bounds, optimistic revisions and missing originals',async()=>{
  const db=memoryIndexedDB();await library.create(db,record());
  await library.enableAnnotations(db);
  assert.throws(()=>library.annotation({kind:'unverified-photo',tags:[]}),/kind/);
  assert.throws(()=>library.annotation({kind:'map',tags:['Bridge','bridge']}),/Duplicate/);
  assert.throws(()=>library.annotation({kind:'graph',tags:['a'.repeat(65)]}),/tags/);
  assert.throws(()=>library.annotation({kind:'map',tags:['x'.repeat(2)],original:record().original}),/classification/);
  const saved=await library.setAnnotation(db,'one',0,
    {kind:'graph',tags:['Atmosphere'],collections:['Study']});
  assert.equal(saved.annotationRevision,1);
  await assert.rejects(library.setAnnotation(db,'one',0,
    {kind:'map',tags:[]}),/another tab/);
  await assert.rejects(library.setAnnotation(db,'missing',0,
    {kind:'map',tags:[]}),/Original image/);
  const next=await library.get(db,'one');
  assert.equal(next.kind,'graph');
  assert.deepEqual(next.tags,['Atmosphere']);
  assert.equal(next.annotationRevision,1);
});
test('annotations never alter imported originals, IDs, attribution or legacy transport',async()=>{
  const db=memoryIndexedDB();await library.create(db,record('original'));
  await library.enableAnnotations(db);
  await library.setAnnotation(db,'original',0,{kind:'diagram',tags:['optics']});
  const mapping=await library.importAssets(db,[{...record('original'),title:'Imported alias'}],
    {randomUUID:()=> 'fresh'});
  assert.equal(mapping.get('original'),'reference_fresh');
  assert.equal((await library.get(db,'reference_fresh')).kind,'unclassified');
  assert.equal((await library.get(db,'original')).kind,'diagram');
  assert.equal((await library.get(db,'original')).record.title,'Observation original');
  assert.equal((await library.get(db,'reference_fresh')).record.title,'Imported alias');
  assert.equal((await library.get(db,'original')).record.original.dataUrl,png);
  await assert.rejects(library.remove(db,'original',1),/disabled/);
});

test('details + classification save commits atomically under both optimistic revisions',async()=>{
  const db=memoryIndexedDB();await library.create(db,record('atomic'));
  await library.enableAnnotations(db);
  const first=await library.updateDetails(db,'atomic',1,0,
    {title:'New caption',author:'Scientific source'},{kind:'map',tags:['horizon'],collections:['Project']});
  assert.equal(first.revision,2);assert.equal(first.annotationRevision,1);
  assert.deepEqual((await library.get(db,'atomic')).record.original,raster);
  const unchanged=await library.updateDetails(db,'atomic',2,1,
    {title:'Renamed map'}, {kind:'map',tags:['horizon'],collections:['Project']});
  assert.equal(unchanged.annotationRevision,1,'unchanged labels must not advance classification revision');
  assert.equal(unchanged.record.title,'Renamed map');
  await assert.rejects(library.updateDetails(db,'atomic',2,1,{title:'Lost update'},
    {kind:'diagram',tags:['new'],collections:[]}),/changed/);
  await assert.rejects(library.updateDetails(db,'atomic',3,0,{title:'Lost classification'},
    {kind:'diagram',tags:['new'],collections:[]}),/another tab/);
  const final=await library.get(db,'atomic');
  assert.equal(final.revision,3);
  assert.equal(final.annotationRevision,1);
  assert.equal(final.record.title,'Renamed map');
  assert.deepEqual(final.tags,['horizon']);
  assert.deepEqual(final.record.original,raster);
});
test('invalid or corrupted classification fails closed without changing originals',async()=>{
  const db=memoryIndexedDB();await library.create(db,record('photo'));
  await library.enableAnnotations(db);
  const before=structuredClone(db.records.get('photo'));
  assert.throws(()=>library.setAnnotation(db,'photo',0,
    {kind:'graph',tags:Array.from({length:21},(_,i)=>'tag'+i)}),/tags/);
  assert.equal(db.annotations.size,0);
  db.annotations.set('photo',{id:'photo',revision:1,kind:'invalid-kind',tags:[],collections:[]});
  await assert.rejects(library.get(db,'photo'),/image kind/);
  db.annotations.clear();
  const restored=await library.get(db,'photo');
  assert.equal(restored.kind,'unclassified');
  assert.deepEqual(db.records.get('photo'),before);
});

test('complete backup restores verified originals and tags without clobbering conflicting local aliases',async()=>{
  const source=memoryIndexedDB(),target=memoryIndexedDB();
  await library.create(source,{...record('shared'),author:'Source credit'});
  await library.enableAnnotations(source);
  await library.setAnnotation(source,'shared',0,{kind:'map',tags:['Soundly'],collections:['Research']});
  const backup=await library.exportBackup(source);
  await library.create(target,{...record('shared'),author:'Existing credit'});
  await library.enableAnnotations(target);
  const out=await library.restoreBackup(target,backup,{randomUUID:()=> 'restore_test'},verifyOriginal);
  assert.equal(out.created,1);
  assert.equal(out.annotationsAdded,1);
  assert.equal(out.mapping.get('shared'),'reference_restore_test');
  const old=await library.get(target,'shared'),fresh=await library.get(target,'reference_restore_test');
  assert.equal(old.record.author,'Existing credit');
  assert.equal(old.kind,'unclassified');
  assert.equal(fresh.record.author,'Source credit');
  assert.equal(fresh.kind,'map');
  assert.deepEqual(fresh.tags,['Soundly']);
  assert.deepEqual(fresh.record.original,record().original);
  const second=await library.restoreBackup(target,backup,{randomUUID:()=> 'restore_test_2'},verifyOriginal);
  assert.equal(second.created,0);
  assert.equal(second.annotationsAdded,0);
  assert.deepEqual((await library.get(target,'reference_restore_test')).record.original,record().original);
});
test('malformed backup and missing v2 classification store fail before mutation',async()=>{
  const source=memoryIndexedDB(),target=memoryIndexedDB();
  await library.create(source,record('origin'));
  await library.enableAnnotations(source);
  await library.setAnnotation(source,'origin',0,{kind:'photograph',tags:['bridge']});
  const backup=await library.exportBackup(source);
  const sourceBefore=structuredClone(backup.observations[0].record);
  await library.create(target,record('untouched'));
  await assert.rejects(library.restoreBackup(target,backup,{randomUUID:()=> 'new'},verifyOriginal),/Enable image classification/);
  assert.equal((await library.list(target)).length,1);
  const invalid=structuredClone(backup);invalid.annotations[0].id='nonexistent';
  await assert.rejects(library.restoreBackup(target,invalid,{randomUUID:()=> 'new'},verifyOriginal),/orphaned/);
  await library.enableAnnotations(target);
  const corruption=structuredClone(backup);corruption.observations[0].record.original.dataUrl='data:image/png;base64,AAAA';
  await assert.rejects(library.restoreBackup(target,corruption,{randomUUID:()=> 'new'},verifyOriginal),/MIME|signature/);
  await assert.rejects(library.restoreBackup(target,backup,{randomUUID:()=> 'new'},
    async()=>{throw Error('Corrupted image decoder');}),/Corrupted image decoder/);
  assert.deepEqual(backup.observations[0].record,sourceBefore);
  assert.equal((await library.list(target)).length,1);
  assert.equal(target.annotations.size,0);
});


const usageGraph=require('../src/ui/modern/ModernImageUsageGraph');
test('Where used resolves exact animation frames, saved Calibration identity and independent drafts',()=>{
  const image='original_1',identity={version:1,sha256:'a'.repeat(64),width:1176,height:791};
  const saved=[
    {id:'a1',updatedAt:1,project:{name:'Bridge A',keyframes:[
      {key:'one',name:'First view',referenceImageIds:[image]},
      {key:'two',name:'Second view',referenceImageIds:[image]}]}},
    {id:'a2',updatedAt:2,project:{name:'Bridge B',keyframes:[
      {key:'three',name:'Comparison',referenceImageIds:[image,'other']}]}}
  ];
  const drafts=[{id:'draft_local',checkpoint:{savedAt:4,draft:{
    name:'Unpublished',frames:[{key:'four',name:'Draft frame',referenceImageIds:[image]}]}}}];
  const calibrations=[
    {id:'cal1',title:'Calibration 1',photo:identity,revision:4},
    {id:'cal2',title:'Different dimensions',photo:{...identity,height:792},revision:1}
  ];
  const result=usageGraph.report(image,identity,{animations:saved,drafts,calibrations});
  assert.equal(result.count,5);
  assert.deepEqual(result.uses.filter(x=>x.type==='animation').map(x=>x.frameName),
    ['First view','Second view','Comparison']);
  assert.deepEqual(result.uses.filter(x=>x.type==='calibration').map(x=>x.ownerId),['cal1']);
  assert.deepEqual(result.uses.filter(x=>x.type==='draft').map(x=>x.ownerId),['draft_local']);
  assert.match(result.note,/never authorize deletion/);
});
test('Where used reports failed stores as incomplete and never joins different namespaced identities',()=>{
  const id='same-id',identity={version:1,sha256:'f'.repeat(64),width:1,height:1};
  assert.equal(usageGraph.identityKey({...identity,sha256:'z'.repeat(64)}),null);
  const result=usageGraph.report(id,identity,{animations:[],calibrations:[
    {id:'different',title:'Demo ID collision',photo:{...identity,sha256:'e'.repeat(64)}}]},
    ['Animation Library unavailable']);
  assert.equal(result.count,0);
  assert.equal(result.complete,false);
  assert.deepEqual(result.unavailable,['Animation Library unavailable']);
});

test('Where used keeps separate saved keyframes without Studio-only frame keys',()=>{
  const image='original_1',identity={version:1,sha256:'a'.repeat(64),width:1176,height:791};
  const result=usageGraph.report(image,identity,{animations:[{
    id:'stored',updatedAt:42,project:{name:'Two positions',keyframes:[
      {name:'First',referenceImageIds:[image,image]},
      {name:'Middle',referenceImageIds:['other']},
      {name:'Last',referenceImageIds:[image]}
    ]}
  }]});
  assert.equal(result.count,2);
  assert.deepEqual(result.uses.map(x=>[x.ownerId,x.frameKey,x.frameIndex,x.frameName]),
    [['stored',null,1,'First'],['stored',null,3,'Last']]);
});
test('Where used distinguishes recoverable revisions for the same keyframe',()=>{
  const frame={key:'frame_a',name:'Draft frame',referenceImageIds:['original_1']};
  const snapshots=[11,12].map(savedAt=>({
    id:'workspace',source:'recoverable',checkpoint:{savedAt,draft:{
      name:'Unsaved frames',frames:[frame]
    }}
  }));
  const result=usageGraph.report('original_1',null,{drafts:snapshots});
  assert.equal(result.count,2);
  assert.deepEqual(result.uses.map(x=>x.revision),[11,12]);
});

test('Where used uses the real active Storyboard workspace identity',()=>{
  const image='local_photo',frame={key:'kf_live',name:'Unpublished',
    referenceImageIds:[image]};
  const current={draft:{name:'Live project',frames:[frame]},savedAt:71};
  const result=usageGraph.report(image,null,{
    currentStudio:current,currentStudioWorkspaceId:'draft_real_workspace'
  });
  assert.equal(result.count,1);
  assert.deepEqual(result.uses.map(u=>[u.ownerId,u.frameKey,u.revision,u.source]),
    [['draft_real_workspace','kf_live',71,'current']]);
  const missing=usageGraph.report(image,null,{currentStudio:current});
  assert.equal(missing.count,0,'a placeholder current ID must never become a navigation link');
});

test('Where used includes immutable archived calibration results without misidentifying project copies',()=>{
  const selected='photo_alias',identity={version:1,sha256:'c'.repeat(64),width:1176,height:791};
  const archives=[
    {id:'calibration-result-v1-'+ '1'.repeat(64),photo:identity,createdAt:50},
    {id:'calibration-result-v1-'+ '2'.repeat(64),photo:identity,createdAt:51},
    {id:'calibration-result-v1-'+ '3'.repeat(64),photo:{...identity,width:1175},createdAt:52},
    {id:'calibration-result-v1-'+ '4'.repeat(64),photo:{...identity,sha256:'d'.repeat(64)},createdAt:53}
  ];
  const found=usageGraph.report(selected,identity,{archives,calibrations:[
    {id:'project_a',title:'Original calibration',photo:identity,revision:4}
  ]});
  assert.equal(found.count,3);
  assert.deepEqual(found.uses.filter(use=>use.type==='archive').map(use=>use.ownerId),
    archives.slice(0,2).map(use=>use.id));
  assert.equal(found.uses.filter(use=>use.type==='calibration').length,1);
  assert.equal(usageGraph.report(selected,null,{archives}).count,0);
});
test('Where used reports an unreadable calibration archive rather than asserting zero results',async()=>{
  const identity={version:1,sha256:'e'.repeat(64),width:16,height:9};
  const env={
    indexedDB:{},localStorage:{},
    CurvatureModernAnimationLibrary:{list:async()=>[]},
    CurvatureModernCalibrationProjectStore:{list:async()=>[],async inspectUsage(){return {projects:await this.list(),legacy:null};}},
    CurvatureModernCalibrationResultArchive:{list:async()=>{
      throw Error('Result store blocked in another tab');
    }},
    CurvatureModernAnimationDraftAutosave:{
      inspectSharedCollection:async()=>null,inspectLegacySources:async()=>({sources:[],issues:[]})
    },
    CurvatureModernReferenceImageImport:{identify:async()=>identity}
  };
  const result=await usageGraph.discover(env,{id:'local',record:{}});
  assert.equal(result.count,0);
  assert.equal(result.complete,false);
  assert.match(result.unavailable.join('; '),/Calibration result archive.*blocked in another tab/);
});

test('Shipped demo uses are namespaced separately from local aliases with identical IDs',()=>{
  const id='same-id',project={name:'Shipped view',keyframes:[
    {name:'First',referenceImageIds:[id]},
    {name:'Second',referenceImageIds:['different']},
    {name:'Third',referenceImageIds:[id]}
  ]};
  const demo={id:'soundly',project,referenceImages:[{id}]};
  const uses=usageGraph.demoReferences(demo,id);
  assert.deepEqual(uses.map(x=>[x.type,x.ownerId,x.frameIndex,x.source]),
    [['demo','demo_soundly',1,'shipped'],['demo','demo_soundly',3,'shipped']]);
  const local=usageGraph.report(id,null,{animations:[],calibrations:[]});
  assert.equal(local.count,0,'shipped IDs must not count as local references');
  assert.deepEqual(usageGraph.demoReferences(demo,'different'),[],
    'a frame ID without a shipped original is not a resolved demo asset');
});

test('Where used retains both local photo owners after a separate Storyboard fork',()=>{
  const photo='same_original';
  const frame={key:'same_frame',name:'Linked frame',referenceImageIds:[photo]};
  const drafts=[
    {id:'project_owned',source:'recoverable',checkpoint:{savedAt:150,
      draft:{name:'Tab B photo edits',frames:[frame]}}},
    {id:'draft_forked',source:'recoverable',checkpoint:{savedAt:170,
      draft:{name:'Tab A recovered photo edits',frames:[frame]}}}
  ];
  const result=usageGraph.report(photo,null,{drafts});
  assert.equal(result.complete,true);
  assert.equal(result.count,2);
  assert.deepEqual(result.uses.map(u=>u.ownerId),['draft_forked','project_owned']);
  assert.equal(new Set(result.uses.map(u=>u.frameKey)).size,1,
    'equal frame keys do not collapse independent recovery owners');
});

test('Where used retains same-ID and same-timestamp divergent recovery snapshots',()=>{
  const image='original_local',frame={key:'key1',name:'Photo view',
    referenceImageIds:[image]};
  const rows=['Revision from A','Revision from B'].map(name=>({
    id:'project_named',source:'recoverable',checkpoint:{savedAt:77,draft:{
      name,frames:[frame]
    }}
  }));
  const report=usageGraph.report(image,null,{drafts:rows});
  assert.equal(report.count,2);
  assert.deepEqual(report.uses.map(use=>use.title),['Revision from A','Revision from B']);
  assert.equal(new Set(report.uses.map(use=>use.draftContent)).size,2);
  assert.deepEqual(report.uses.map(use=>JSON.parse(use.draftContent).frames[0].key),
    ['key1','key1']);
});

test('Library is the sole manual reference-acquisition UI; project JSON and cover uploads stay distinct',()=>{
  const from=path.join(__dirname,'..');
  const read=file=>fs.readFileSync(path.join(from,file),'utf8');
  const libraryUI=read('src/ui/modern/ModernReferenceImageLibraryUI.js');
  const studioUI=read('src/ui/modern/ModernAnimationStudioUI.js');
  const calibration=read('src/ui/modern/ModernPhotoCalibrationEditor.js');
  const picker=read('src/ui/modern/ModernImagePicker.js');
  const html=read('CurvatureModern.html');
  assert.match(libraryUI,/var file=field\(toolbar,'Import image','input'\)/);
  assert.match(libraryUI,/button\('Import URL'/);
  assert.match(libraryUI,/button\('Paste image'/);
  assert.match(studioUI,/button\(doc,'Open Image Library'/);
  assert.match(html,/id="ModernCalibrationOpenImageLibrary"/);
  assert.doesNotMatch(picker,/input\.type=['"]file['"]|clipboard\.read|Import photo/);
  assert.doesNotMatch(calibration,/accept=['"]image\/|\.accept=['"]image\/|Import photo/);
  const covers=[...studioUI.matchAll(/input\.accept='image\/png,image\/jpeg,image\/webp'/g)];
  assert.equal(covers.length,1,'the only separate image chooser is a project cover, not a reference original');
  assert.match(studioUI.slice(covers[0].index-100,covers[0].index+370),/actions\.uploadCover/);
  const fileInputs=[...html.matchAll(/<input\b[^>]*type="file"[^>]*>/g)].map(x=>x[0]);
  assert.ok(fileInputs.length>0);
  assert.ok(fileInputs.every(x=>/accept="\.json,application\/json"/.test(x)),
    'Calibration/History file inputs in HTML must be JSON project transport, not image import');
});
test('Where used explicitly describes reachable archived summaries and unreachable external backups',()=>{
  const report=usageGraph.report('photo',null,{archives:[]});
  assert.match(report.note,/local archived Calibration results/);
  assert.match(report.note,/external exports/);
  assert.match(report.note,/never authorize deletion/);
});

test('Where used flags corrupt or inaccessible local recovery backups as incomplete',async()=>{
  const imgId='local',identity={version:1,sha256:'f'.repeat(64),width:8,height:9};
  const keys=new Map([
    ['curvature-modern-animation-workspaces-v2','{invalid json'],
    ['curvature-modern-animation-workspaces-v2-session-tab_broken','{also invalid']
  ]);
  const storage={get length(){return keys.size;},
    key:index=>[...keys.keys()][index]||null,
    getItem:key=>keys.has(key)?keys.get(key):null};
  const env={indexedDB:{},localStorage:storage,
    CurvatureModernAnimationLibrary:{list:async()=>[]},
    CurvatureModernCalibrationProjectStore:{list:async()=>[],async inspectUsage(){return {projects:await this.list(),legacy:null};}},
    CurvatureModernCalibrationResultArchive:{list:async()=>[]},
    CurvatureModernAnimationDraftAutosave:{
      inspectSharedCollection:async()=>null,inspectLegacySources:async env=>{
        const A=require('../src/animation/ModernAnimationDraftAutosave');
        const local=Array.from({length:env.localStorage.length},(_,i)=>env.localStorage.key(i))
          .filter(Boolean).map(key=>({key,raw:env.localStorage.getItem(key)}));
        // Force access even if enumeration is unavailable.
        env.localStorage.getItem(A.COLLECTION_KEY);
        return A.planLegacySources({current:null,workspaces:null},local);
      }
    },
    CurvatureModernReferenceImageImport:{identify:async()=>identity}};
  const found=await usageGraph.discover(env,{id:imgId,record:{}});
  assert.equal(found.count,0);
  assert.equal(found.complete,false);
  assert.match(found.unavailable.join('; '),/Legacy Animation local:curvature-modern-animation-workspaces-v2:/);
  assert.match(found.unavailable.join('; '),/Legacy Animation local:curvature-modern-animation-workspaces-v2-session-tab_broken:/);
  const inaccessible={...env,localStorage:{
    getItem(){throw Error('Storage access denied');},key(){return null;},length:1
  }};
  const denied=await usageGraph.discover(inaccessible,{id:imgId,record:{}});
  assert.equal(denied.complete,false);
  assert.match(denied.unavailable.join('; '),/Storage access denied/);
});

test('Stage 5 deletion review fails closed with zero local uses and preserves bytes',async()=>{
  const db=memoryIndexedDB(),asset=record('lifecycle_photo');
  await library.create(db,asset);
  let reads=0;
  const env={indexedDB:db,localStorage:{length:0,key:()=>null,getItem:()=>null},
    CurvatureModernReferenceImageLibrary:{get:async (idb,id)=>{reads++;return library.get(idb,id);}},
    CurvatureModernAnimationLibrary:{list:async()=>[]},
    CurvatureModernCalibrationProjectStore:{list:async()=>[],async inspectUsage(){return {projects:await this.list(),legacy:null};}},
    CurvatureModernCalibrationResultArchive:{list:async()=>[]},
    CurvatureModernAnimationDraftAutosave:{
      COLLECTION_KEY:'unused',SESSION_LOCAL_PREFIX:'session-',
      inspectSharedCollection:async()=>null,inspectLegacySources:async()=>({sources:[],issues:[]})
    },
    CurvatureModernReferenceImageImport:{identify:async()=>({
      version:1,sha256:'a'.repeat(64),width:1,height:1})}
  };
  const original=await library.get(db,asset.id);
  const empty=await usageGraph.deletionReview(env,original);
  assert.equal(empty.safe,false);
  assert.equal(empty.knownUses,0);
  assert.equal(empty.localScanComplete,true,'accessible local stores may be scanned without granting deletion');
  assert.equal(reads,2,'must recheck original after scanning other stores');
  assert.match(empty.reasons.join('; '),/cannot be atomically excluded/);
  await assert.rejects(library.remove(db,asset.id,1),/deletion is disabled/);
  assert.deepEqual((await library.get(db,asset.id)).record.original,original.record.original);
  env.CurvatureModernAnimationLibrary.list=async()=>[{
    id:'saved',updatedAt:1,project:{name:'Linked',
      keyframes:[{name:'First',referenceImageIds:[asset.id]}]}
  }];
  const used=await usageGraph.deletionReview(env,original);
  assert.equal(used.safe,false);
  assert.equal(used.knownUses,1);
  assert.equal(used.localScanComplete,true,'a linked asset can still have complete local scan coverage');
  assert.match(used.reasons.join('; '),/1 known linked use/);
  env.CurvatureModernCalibrationProjectStore.list=async()=>{throw Error('Store inaccessible');};
  const missing=await usageGraph.deletionReview(env,original);
  assert.equal(missing.safe,false);
  assert.equal(missing.localScanComplete,false);
  assert.match(missing.reasons.join('; '),/Store inaccessible/);
  assert.equal((await library.list(db)).length,1);
});
test('Stage 5 stale original revision rejects review even when no local owner is found',async()=>{
  const db=memoryIndexedDB();await library.create(db,record('other'));
  const current=await library.get(db,'other'),updated=await library.update(db,'other',1,{title:'Tab B'});
  const env={indexedDB:db,localStorage:{length:0,key:()=>null,getItem:()=>null},
    CurvatureModernReferenceImageLibrary:library,
    CurvatureModernAnimationLibrary:{list:async()=>[]},
    CurvatureModernCalibrationProjectStore:{list:async()=>[],async inspectUsage(){return {projects:await this.list(),legacy:null};}},
    CurvatureModernCalibrationResultArchive:{list:async()=>[]},
    CurvatureModernAnimationDraftAutosave:{
      COLLECTION_KEY:'unused',SESSION_LOCAL_PREFIX:'session-',
      inspectSharedCollection:async()=>null,inspectLegacySources:async()=>({sources:[],issues:[]})
    },
    CurvatureModernReferenceImageImport:{identify:async()=>({
      version:1,sha256:'a'.repeat(64),width:1,height:1})}
  };
  assert.equal(updated.revision,2);
  const review=await usageGraph.deletionReview(env,current);
  assert.equal(review.safe,false);
  assert.equal(review.localScanComplete,false);
  assert.match(review.reasons.join('; '),/Original changed during inspection/);
  assert.equal((await library.get(db,'other')).record.title,'Tab B');
});

test('Stage 5 concurrent metadata edit during ownership scan cannot authorize deletion',async()=>{
  const db=memoryIndexedDB();await library.create(db,record('concurrent_image'));
  const selected=await library.get(db,'concurrent_image'),preserved=selected.record.original;
  let changed=false;
  const env={indexedDB:db,localStorage:{length:0,key:()=>null,getItem:()=>null},
    CurvatureModernReferenceImageLibrary:library,
    CurvatureModernAnimationLibrary:{list:async()=>{
      if(!changed){
        changed=true;
        await library.update(db,'concurrent_image',1,{title:'New title from second tab'});
      }
      return [];
    }},
    CurvatureModernCalibrationProjectStore:{list:async()=>[],async inspectUsage(){return {projects:await this.list(),legacy:null};}},
    CurvatureModernCalibrationResultArchive:{list:async()=>[]},
    CurvatureModernAnimationDraftAutosave:{
      COLLECTION_KEY:'unused',SESSION_LOCAL_PREFIX:'session-',
      inspectSharedCollection:async()=>null,inspectLegacySources:async()=>({sources:[],issues:[]})
    },
    CurvatureModernReferenceImageImport:{identify:async()=>({
      version:1,sha256:'b'.repeat(64),width:1,height:1})}
  };
  const result=await usageGraph.deletionReview(env,selected);
  assert.equal(result.safe,false);
  assert.equal(result.localScanComplete,false);
  assert.match(result.reasons.join('; '),/Original changed during inspection/);
  const after=await library.get(db,'concurrent_image');
  assert.equal(after.revision,2);
  assert.equal(after.record.title,'New title from second tab');
  assert.deepEqual(after.record.original,preserved);
  await assert.rejects(library.remove(db,'concurrent_image',2),/deletion is disabled/);
});

test('Where used includes verified shared workspace revisions and both pending named save versions',async()=>{
  const id='photo',draft={name:'Shared draft',frames:[{key:'kf',referenceImageIds:[id]}]};
  const named=updatedAt=>({id:'named',updatedAt,project:{name:'Saved',keyframes:[{referenceImageIds:[id]}]}});
  const shared={collection:{workspaces:[{id:'workspace',checkpoint:{savedAt:44,draft}}]},
    revisions:[{id:'workspace',revision:9}],namedSave:{plan:{before:named(10),after:named(11)}}};
  const env={indexedDB:{},localStorage:{length:0,key:()=>null,getItem:()=>null},
    CurvatureModernAnimationLibrary:{list:async()=>[]},
    CurvatureModernCalibrationProjectStore:{list:async()=>[],async inspectUsage(){return {projects:await this.list(),legacy:null};}},
    CurvatureModernCalibrationResultArchive:{list:async()=>[]},
    CurvatureModernAnimationDraftAutosave:{
      COLLECTION_KEY:'unused',SESSION_LOCAL_PREFIX:'session-',
      inspectSharedCollection:async()=>shared,inspectLegacySources:async()=>({sources:[],issues:[]})},
    CurvatureModernReferenceImageImport:{identify:async()=>({
      version:1,sha256:'a'.repeat(64),width:1,height:1})}
  };
  const found=await usageGraph.discover(env,{id,record:{}});
  assert.equal(found.complete,true);
  assert.equal(found.count,3);
  assert.deepEqual(found.uses.filter(u=>u.type==='draft').map(u=>[u.ownerId,u.revision,u.source,u.frameKey]),
    [['workspace','rev:9','shared checkpoint','kf']]);
  assert.deepEqual(found.uses.filter(u=>u.type==='animation-intent').map(u=>[u.revision,u.source]),
    [[10,'pending Save Changes · before'],[11,'pending Save Changes · after']]);
  env.CurvatureModernAnimationDraftAutosave.inspectSharedCollection=async()=>{throw Error('digest mismatch');};
  const failed=await usageGraph.discover(env,{id,record:{}});
  assert.equal(failed.complete,false);
  assert.match(failed.unavailable.join('; '),/Shared Animation recovery.*digest mismatch/);
});

test('Shared draft image use requires the exact revision, draft and referenced frame',()=>{
  const photo='photo',draft={name:'Draft',frames:[{key:'first',referenceImageIds:[photo]}]};
  const row={collection:{workspaces:[{id:'working',checkpoint:{draft}}]},
    revisions:[{id:'working',revision:4}],receipt:null};
  const use={type:'draft',source:'shared checkpoint',ownerId:'working',revision:'rev:4',
    frameKey:'first',frameIndex:1,draftContent:JSON.stringify(draft)};
  assert.deepEqual(usageGraph.resolveSharedDraft(row,use,photo),{
    reference:{id:'working',revision:'rev:4',recovery:null},frameKey:'first'});
  for(const altered of [{revision:'rev:3'},{draftContent:'{}'},{frameKey:'other'},{frameIndex:2}])
    assert.throws(()=>usageGraph.resolveSharedDraft(row,{...use,...altered},photo),/changed/);
  assert.throws(()=>usageGraph.resolveSharedDraft(row,use,'other'),/changed/);
  assert.throws(()=>usageGraph.resolveSharedDraft({...row,keyframeEdit:{}},use,photo),/recovery/);
});

test('Where used inventories old standalone sources independently and matches calibration by original identity',async()=>{
  const id='photo',identity={version:1,sha256:'a'.repeat(64),width:1,height:1};
  const cp={savedAt:2,draft:{name:'Single recovery',frames:[{key:'kf',referenceImageIds:[id]}]}};
  const raw={version:2,physicalSessionId:'legacy',record:{id:'different_alias',title:'Old calibration'}};
  const env={indexedDB:{},localStorage:{getItem:()=>null},
    CurvatureModernAnimationLibrary:{list:async()=>[]},
    CurvatureModernCalibrationProjectStore:{inspectUsage:async()=>({projects:[],legacy:raw})},
    CurvatureModernCalibrationProjectMigration:{normalizeLegacy:v=>v,matchingInline:()=>null},
    CurvatureModernCalibrationResultArchive:{list:async()=>[]},
    CurvatureModernAnimationDraftAutosave:{inspectSharedCollection:async()=>null,
      inspectLegacySources:async()=>({issues:[],sources:[
        {kind:'checkpoint',source:'idb:current',value:cp},
        {kind:'checkpoint',source:'local:old',value:{...cp,draft:{...cp.draft,name:'Other recovery'}}}
      ]})},
    CurvatureModernReferenceImageImport:{identify:async()=>identity}};
  const result=await usageGraph.discover(env,{id,record:{}});
  assert.equal(result.complete,true);
  assert.deepEqual(result.uses.filter(u=>u.type==='draft').map(u=>u.source),['legacy single draft','legacy single draft']);
  assert.equal(result.uses.filter(u=>u.type==='calibration-recovery').length,1);
  env.CurvatureModernCalibrationProjectMigration.normalizeLegacy=()=>{throw Error('unsupported draft');};
  const incomplete=await usageGraph.discover(env,{id,record:{}});
  assert.equal(incomplete.count,3);
  assert.equal(incomplete.complete,false);
  assert.match(incomplete.unavailable.join('; '),/unsupported draft/);
});

test('Where used distinguishes historical calibration provenance from attached aliases',()=>{
  const photo={version:1,sha256:'a'.repeat(64),width:20,height:10};
  const experiment={calibrationOrigin:{photo}};
  const other={calibrationOrigin:{photo:{...photo,width:21}}};
  const frame={key:'kf',name:'Observed',experiment,referenceImageIds:['alias']};
  const draft={name:'Draft',frames:[frame,{...frame,key:'other',experiment:other,referenceImageIds:[]}]};
  const project={name:'Saved',mode:'experimental',baseExperiment:experiment,
    keyframes:[{name:'Observed',value:experiment},{name:'Different',value:other}]};
  const row={id:'named',updatedAt:1,project};
  const shared={collection:{workspaces:[{id:'shared',checkpoint:{draft}}]},
    revisions:[{id:'shared',revision:2}],
    namedSave:{plan:{before:row,after:{...row,updatedAt:3}}}};
  const editing={...shared,namedSave:undefined,keyframeEdit:{reference:{revision:'rev:2'},session:{projectId:'shared',frameKey:'kf',
      original:experiment,workspace:other,candidate:other,past:[experiment],future:[other]},
      history:{experiment}}};
  const sources={animations:[row],drafts:[{id:'legacy',checkpoint:{savedAt:4,draft}}],
    sharedAnimation:shared,currentStudio:{savedAt:5,draft},currentStudioWorkspaceId:'live'};
  const report=usageGraph.report('alias',photo,sources);
  const editReport=usageGraph.report('alias',photo,{sharedAnimation:editing});
  const uses=report.uses.filter(use=>use.type==='experiment-provenance');
  assert.equal(uses.length,9);
  assert.equal(uses.filter(use=>use.source.includes('base experiment')).length,3);
  assert.equal(editReport.uses.filter(use=>use.type==='experiment-provenance'&&use.source.startsWith('temporary edit')).length,3);
  assert.equal(uses.filter(use=>use.ownerId==='legacy').length,1);
  assert.equal(report.uses.filter(use=>use.type==='draft').length,3);
  assert.equal(usageGraph.report('alias',{...photo,sha256:'b'.repeat(64)},sources)
    .uses.filter(use=>use.type==='experiment-provenance').length,0);
  assert.equal(usageGraph.report('different-alias',photo,sources)
    .uses.filter(use=>use.type==='experiment-provenance').length,9);
});

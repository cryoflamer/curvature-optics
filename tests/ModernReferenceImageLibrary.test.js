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
  const records=new Map();let exists=false;
  return {records,open(name,version){
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
test('library scripts and collapsed panel are isolated to Modern, before Studio playback',()=>{
  const root=path.resolve(__dirname,'..'),modern=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  for(const file of ['ModernReferenceImageLibrary.js','ModernReferenceImageImport.js','ModernReferenceImageLibraryUI.js']){
    assert.ok(modern.includes(file));for(const legacy of ['CurvatureApp.html','CurvatureDemosHost.html']){
      assert.ok(!fs.readFileSync(path.join(root,legacy),'utf8').includes(file));
    }
  }
  assert.match(modern,/<details id="ModernReferenceImageLibrary"[^>]*><summary>Reference Image Library/);
  assert.ok(modern.indexOf('id="ModernReferenceImageLibrary"')<modern.indexOf('id="ModernAnimationPlaybackStage"'));
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

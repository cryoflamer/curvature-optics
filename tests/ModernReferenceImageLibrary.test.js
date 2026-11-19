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

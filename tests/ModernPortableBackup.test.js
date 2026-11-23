const test=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const backup=require('../src/storage/ModernPortableBackup.js');

function inventory(){
  return {databases:backup.KNOWN_DATABASES.map(name=>({
    name,status:'absent',version:null,stores:[]
  })),webStorage:{local:[],session:[],excluded:{local:0,session:0}}};
}
function withProject(){
  const source=inventory();
  const db=source.databases.find(x=>x.name==='curvature-photo-calibration');
  db.status='present';db.version=2;
  db.stores=[{name:'projects',keyPath:'id',autoIncrement:false,indexes:[],
    records:[{key:'calibration_A',value:{
      id:'calibration_A',revision:5,title:'First project',
      image:{dataUrl:'data:image/png;base64,iVBORw0KGgo=',width:3,height:5},
      savedAt:new Date('2026-11-23T00:00:00.000Z')
    }}]}];
  source.webStorage.local.push({key:'curvature-modern-experiment-v1',value:'{"version":1}'});
  source.webStorage.session.push({key:'curvature-modern-animation-workspaces-v2-tab-id',
    value:'session_exact'});
  return source;
}
function storage(items){
  const keys=Object.keys(items);
  return {get length(){return keys.length;},key(i){return keys[i]??null;},
    getItem(k){return items[k]??null;}};
}

test('portable snapshot retains complete project records, per-store hashes and Web Storage keys',async()=>{
  const archive=await backup.pack(withProject(),webcrypto);
  const verified=await backup.inspect(archive,webcrypto);
  assert.equal(verified.eligibleForMigration,false);
  assert.equal(verified.consistency,'two-pass-observation-only');
  const db=verified.manifest.databases.find(x=>x.name==='curvature-photo-calibration');
  assert.equal(db.version,2);
  assert.equal(db.stores[0].count,1);
  assert.match(db.stores[0].sha256,/^[0-9a-f]{64}$/);
  assert.equal(verified.manifest.localStorageCount,1);
  assert.equal(verified.manifest.sessionStorageCount,1);
  const row=JSON.parse(archive.payload).content.databases
    .find(x=>x.name==='curvature-photo-calibration').stores[0].records[0];
  const decoded=backup.decode(row.value);
  assert.equal(decoded.revision,5);
  assert.equal(decoded.image.dataUrl,'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(decoded.savedAt.toISOString(),'2026-11-23T00:00:00.000Z');
});

test('binary, typed, date, bigint, Blob and prototype-like property round-trip without JSON loss',async()=>{
  const payload=Object.create(null);
  payload.__proto__='user data';
  payload.date=new Date('2020-05-03T01:02:03.000Z');
  payload.blob=new Blob([Uint8Array.from([0,42,255])],{type:'image/png'});
  payload.buffer=Uint8Array.from([0,17,255]).buffer;
  payload.view=new Uint16Array([258,4000]);
  payload.big=12345678901234567890n;
  const data=backup.decode(await backup.encode(payload));
  assert.equal(Object.getPrototypeOf(data),null);
  assert.equal(data.__proto__,'user data');
  assert.equal(data.date.getTime(),payload.date.getTime());
  assert.deepEqual(Array.from(new Uint8Array(data.buffer)),[0,17,255]);
  assert.deepEqual(Array.from(data.view),[258,4000]);
  assert.equal(data.big,payload.big);
  assert.deepEqual(Array.from(new Uint8Array(await data.blob.arrayBuffer())),[0,42,255]);
});

test('corrupt archives and manipulated manifests are rejected before any restore',async()=>{
  const archive=await backup.pack(withProject(),webcrypto);
  const damaged={...archive,payload:archive.payload.replace('calibration_A','calibration_B')};
  await assert.rejects(()=>backup.inspect(damaged,webcrypto),/checksum mismatch/);
  const body=JSON.parse(archive.payload);
  body.manifest.databases.find(x=>x.name==='curvature-photo-calibration').stores[0].count=100;
  const payload=JSON.stringify(body);
  const bytes=new TextEncoder().encode(payload);
  const digest=Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex');
  await assert.rejects(()=>backup.inspect({...archive,payload,sha256:digest},webcrypto),
    /manifest mismatch/);
});

test('missing inventory, duplicate databases, duplicate primary keys and unsupported records fail closed',async()=>{
  const missing=inventory();missing.databases.pop();
  await assert.rejects(()=>backup.pack(missing,webcrypto),/required database missing/);
  const duplicate=inventory();duplicate.databases.push(duplicate.databases[0]);
  await assert.rejects(()=>backup.pack(duplicate,webcrypto),/invalid database/);
  const rows=withProject();
  const list=rows.databases.find(x=>x.name==='curvature-photo-calibration').stores[0].records;
  list.push({...list[0]});
  await assert.rejects(()=>backup.pack(rows,webcrypto),/duplicate primary key/);
  await assert.rejects(()=>backup.encode(new Map([['a',1]])),/unsupported stored object/);
  await assert.rejects(()=>backup.encode({number:NaN}),/nonfinite number/);
});

test('capture inventories absent databases without opening or creating them',async()=>{
  let opens=0,calls=0;
  const env={indexedDB:{async databases(){calls++;return [];},open(){opens++;throw Error('unsafe');}},
    localStorage:storage({'curvature-modern-test':'v1','unrelated-setting':'private'}),
    sessionStorage:storage({'curvature-tab-id':'tab-1'}),crypto:webcrypto};
  const archive=await backup.capture(env);
  const checked=await backup.inspect(archive,webcrypto);
  assert.equal(calls,2);assert.equal(opens,0);
  assert.equal(checked.manifest.databases.length,backup.KNOWN_DATABASES.length);
  assert.ok(checked.manifest.databases.every(x=>x.status==='absent'));
  assert.equal(checked.manifest.excludedWebStorageKeys.local,1);
  assert.equal(checked.eligibleForMigration,false);
  assert.equal(checked.manifest.localStorageCount,1);
});

test('read-only capture fails on concurrent Web Storage edits and IndexedDB access errors',async()=>{
  let reads=0;
  const changing={get length(){return 1;},key(){return 'curvature-modern-test';},
    getItem(){return reads++===0?'old':'new';}};
  const basic={indexedDB:{async databases(){return [];},open(){throw Error('unexpected open');}},
    localStorage:changing,sessionStorage:storage({}),crypto:webcrypto};
  await assert.rejects(()=>backup.capture(basic),/data changed between read-only passes/);
  const blocked={...basic,indexedDB:{
    async databases(){return [{name:'curvature-modern-working-session',version:1}];},
    open(){throw Error('blocked IndexedDB');}}};
  await assert.rejects(()=>backup.capture(blocked),/blocked IndexedDB/);
});

test('large encoded original bytes remain exact, with no implicit truncation',async()=>{
  const source=withProject();
  const photo='data:image/jpeg;base64,'+'a'.repeat(256*1024);
  source.databases.find(x=>x.name==='curvature-photo-calibration')
    .stores[0].records[0].value.image.dataUrl=photo;
  const archive=await backup.pack(source,webcrypto);
  const inspected=await backup.inspect(archive,webcrypto);
  assert.equal(inspected.manifest.databases.find(x=>x.name==='curvature-photo-calibration')
    .stores[0].count,1);
  const rec=JSON.parse(archive.payload).content.databases
    .find(x=>x.name==='curvature-photo-calibration').stores[0].records[0];
  assert.equal(backup.decode(rec.value).image.dataUrl,photo);
});
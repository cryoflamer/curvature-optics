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

function evidenceFixture(){
  const {createHash}=require('node:crypto');
  const projects=require('../src/ui/modern/ModernCalibrationProject.js');
  const input=inventory();
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPgFlP8DwABtAFCmNjeNAAAAABJRU5ErkJggg==';
  const sha256=createHash('sha256').update(Buffer.from(png,'base64')).digest('hex');
  const id='calibration-project-v1-'+'a'.repeat(32);
  const photo={identity:{version:1,sha256,width:1,height:1},
    aliasId:'original_calibration_alias',source:{kind:'local',key:null}};
  const project=projects.fresh({id,now:123,photo});
  const database=input.databases.find(x=>x.name==='curvature-modern-reference-images');
  database.status='present';database.version=1;
  database.stores=[{name:'observations',keyPath:'id',autoIncrement:false,indexes:[],
    records:[{key:'library_original_id',value:{id:'library_original_id',revision:1,
      record:{id:'library_original_id',version:1,title:'Original photo',
        original:{dataUrl:'data:image/png;base64,'+png,width:1,height:1}}}}]}];
  const cal=input.databases.find(x=>x.name==='curvature-photo-calibration');
  cal.status='present';cal.version=2;
  cal.stores=[
    {name:'projects',keyPath:'id',autoIncrement:false,indexes:[],
      records:[{key:id,value:project}]},
    {name:'project-summaries',keyPath:'id',autoIncrement:false,indexes:[],
      records:[{key:id,value:projects.summary(project)}]}
  ];
  return {input,id,photo,png,original:database.stores[0].records[0].value,
    project,cal};
}
function evidenceEnv(verifyOriginal=async()=>{}){
  return {crypto:webcrypto,verifyOriginal};
}

test('evidence qualification verifies original digest and calibration identity independent of local alias',async()=>{
  const f=evidenceFixture();let verified=0;
  const archive=await backup.pack(f.input,webcrypto);
  const result=await backup.qualifyEvidence(archive,evidenceEnv(async record=>{
    assert.equal(record.id,'library_original_id');verified++;
  }));
  assert.equal(verified,1);
  assert.equal(result.originalsVerified,1);
  assert.equal(result.projectsChecked,1);
  assert.equal(result.decoderVerified,true);
  assert.equal(result.eligibleForMigration,false);
  assert.equal(result.archivesChecked,0);
});

test('qualifyEvidence rejects missing originals, hash mismatches and absent decoder',async()=>{
  const f=evidenceFixture();
  f.input.databases.find(d=>d.name==='curvature-modern-reference-images')
    .stores[0].records.length=0;
  const firstArchive=await backup.pack(f.input,webcrypto);
  await assert.rejects(()=>backup.qualifyEvidence(firstArchive,evidenceEnv()),
    /Calibration Project original missing/);
  const second=evidenceFixture();
  const changed=Buffer.from(second.png,'base64');changed[changed.length-1]^=1;
  const corrupted=changed.toString('base64');
  second.original.record.original.dataUrl='data:image/png;base64,'+corrupted;
  const secondArchive=await backup.pack(second.input,webcrypto);
  await assert.rejects(()=>backup.qualifyEvidence(secondArchive,evidenceEnv()),
    /Calibration Project original missing/);
  const third=evidenceFixture();
  const thirdArchive=await backup.pack(third.input,webcrypto);
  await assert.rejects(()=>backup.qualifyEvidence(thirdArchive,{crypto:webcrypto}),
    /decoder is required/);
  await assert.rejects(()=>backup.qualifyEvidence(thirdArchive,
    evidenceEnv(async()=>{throw Error('Browser could not decode photo');})),
    /Browser could not decode photo/);
});

test('qualifyEvidence rejects inconsistent project summaries, annotations and missing archived results',async()=>{
  const a=evidenceFixture();
  a.cal.stores.find(s=>s.name==='project-summaries').records[0].value.revision=9;
  const archiveA=await backup.pack(a.input,webcrypto);
  await assert.rejects(()=>backup.qualifyEvidence(archiveA,evidenceEnv()),
    /summary\/record mismatch/);
  const b=evidenceFixture();
  b.input.databases.find(d=>d.name==='curvature-modern-reference-images').stores.push({
    name:'annotations',keyPath:'id',autoIncrement:false,indexes:[],
    records:[{key:'missing_photo',value:{id:'missing_photo',revision:1}}]
  });
  const archiveB=await backup.pack(b.input,webcrypto);
  await assert.rejects(()=>backup.qualifyEvidence(archiveB,evidenceEnv()),
    /orphan reference image annotation/);
  const c=evidenceFixture();
  c.project.resultIds.push('calibration-result-v1-'+'b'.repeat(64));
  c.cal.stores.find(s=>s.name==='project-summaries').records[0].value.resultCount=1;
  const archiveC=await backup.pack(c.input,webcrypto);
  await assert.rejects(()=>backup.qualifyEvidence(archiveC,evidenceEnv()),
    /archived result missing/);
});

test('qualifyEvidence detects missing saved Storyboard references without modifying its archive',async()=>{
  const f=evidenceFixture();
  const db=f.input.databases.find(d=>d.name==='curvature-modern-animation-library');
  db.status='present';db.version=1;
  db.stores=[{name:'projects',keyPath:'id',autoIncrement:false,indexes:[],
    records:[{key:'my_animation',value:{id:'my_animation',project:{keyframes:[
      {referenceImageIds:['library_original_id']} ]}}}]}];
  const good=await backup.pack(f.input,webcrypto);
  const passed=await backup.qualifyEvidence(good,evidenceEnv());
  assert.equal(passed.storyboardLinksChecked,1);
  db.stores[0].records[0].value.project.keyframes[0].referenceImageIds=['deleted_original'];
  const bad=await backup.pack(f.input,webcrypto);
  await assert.rejects(()=>backup.qualifyEvidence(bad,evidenceEnv()),
    /Storyboard original missing/);
});


test('portable JSON file transport roundtrips verified archival bytes without migration approval',async()=>{
  const source=evidenceFixture();
  const archived=await backup.pack(source.input,webcrypto);
  const output=await backup.fileBlob(archived,webcrypto);
  assert.equal(output.blob.type,'application/json');
  assert.ok(output.filename.startsWith('curvature-optics-unqualified-backup-'));
  assert.equal(output.eligibleForMigration,false);
  assert.equal(output.bytes,output.blob.size);
  const imported=await backup.readFile(output.blob,webcrypto);
  assert.deepEqual(imported,archived);
  const review=await backup.qualifyEvidence(imported,evidenceEnv());
  assert.equal(review.originalsVerified,1);
  assert.equal(review.projectsChecked,1);
});

test('file import rejects truncated, corrupted and oversized archives before restore',async()=>{
  const archived=await backup.pack(evidenceFixture().input,webcrypto);
  await assert.rejects(()=>backup.readFile(new Blob(['{']),webcrypto),
    /invalid archive file JSON/);
  await assert.rejects(()=>backup.readFile(new Blob([
    JSON.stringify({...archived,payload:archived.payload+' '})]),webcrypto),
  /archive checksum mismatch/);
  await assert.rejects(()=>backup.readFile({
    size:512*1024*1024+1,async text(){throw Error('oversized file was read');}
  },webcrypto),/oversized portable backup file/);
  await assert.rejects(()=>backup.fileBlob({...archived,sha256:'0'.repeat(64)},webcrypto),
    /archive checksum mismatch/);
  const unsafe=JSON.parse(archived.payload);unsafe.capturedAt='2026/11/23 01:00 UTC';
  const payload=JSON.stringify(unsafe);
  const hash=Buffer.from(await webcrypto.subtle.digest('SHA-256',
    new TextEncoder().encode(payload))).toString('hex');
  await assert.rejects(()=>backup.fileBlob({...archived,payload,sha256:hash},webcrypto),
    /capture timestamp invalid/);
});

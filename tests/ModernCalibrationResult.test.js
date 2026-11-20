'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto,createHash}=require('node:crypto');
const archive=require('../src/ui/modern/ModernCalibrationResult');
const editor=require('../src/ui/modern/ModernPhotoCalibrationEditor');
const fixture=require('./fixtures/soundly-mixed-calibration.json');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOo6TsAAANUAcuEDSEIAAAAAElFTkSuQmCC';
const copy=x=>JSON.parse(JSON.stringify(x));
const env=(w=1176,h=791)=>({crypto:webcrypto,Image:class{
  constructor(){this.naturalWidth=w;this.naturalHeight=h;}
  async decode(){}
}});
// Synthetic raster header and evaluation, real Soundly mixed authored topology.
// This fixture is NOT evidence of a real image decoder or fresh physical fit.
function input(){
  const m=copy(fixture.model),observations=copy(fixture.observations);
  observations[1].included=false;
  const bytes=Buffer.from(png.split(',')[1],'base64');bytes.writeUInt32BE(1176,16);bytes.writeUInt32BE(791,20);
  const referenceImage={version:1,id:'soundly',title:'Soundly',author:'Source author',
    original:{dataUrl:'data:image/png;base64,'+bytes.toString('base64'),width:1176,height:791}};
  const freeParameters=fixture.options.freeParameters.slice();
  const physics={atmosphere:'vacuum',temperatureProfile:copy(fixture.options.temperatureProfile)};
  const points=observations.filter(r=>r.included).map(r=>({id:r.landmark.id,status:'visible',observed:r.pixel.slice(),
    predicted:[r.pixel[0]+3,r.pixel[1]+4],weight:r.weight}));
  const result={status:'stalled',reason:'Step tolerance',pose:{...m,Height:42.8},method:'canvas-direct',atmosphere:'vacuum',
    initialRmsPx:300,evaluations:20,acceptedSteps:4,iterations:5,freeParameters,
    evaluation:{valid:true,rmsPx:5,weightedRmsPx:5,cost:points.reduce((n,p)=>n+25*p.weight/2,0),points},
    materialBinding:editor.fitBinding(observations,freeParameters,m,physics,1176,791)};
  return {format:'curvature-photo-calibration',version:3,scene:{model:m,physics},referenceImage,
    referenceSource:{source:'demo',demoId:'soundly',links:['Original']},observations,
    fit:{method:'canvas-direct',maxIterations:80,freeParameters,result,status:'stalled',running:false}};
}
test('immutable content archive preserves Soundly mixed anchors, original pixels, source and historical Fit/Validation roles',async()=>{
  const raw=input(),before=JSON.stringify(raw),a=await archive.create(raw,env(),{projectId:'draft_1'});
  assert.equal(JSON.stringify(raw),before);
  assert.equal(a.payload.observations.length,14);
  assert.deepEqual(a.payload.observations,raw.observations);
  assert.equal(a.payload.scene.model.Height,raw.scene.model.Height);
  assert.equal(a.payload.fit.result.pose.Height,42.8);
  assert.equal(a.payload.fit.result.status,'stalled');
  assert.equal(a.payload.fit.result.evaluation.rmsPx,5);
  assert.equal(a.provenance.attribution.author,'Source author');
  assert.equal(a.provenance.projectId,'draft_1');
  assert.equal(JSON.stringify(a).includes('data:image/'),false);
  assert.ok(Object.isFrozen(a.payload.observations[0].landmark.anchor.weights));
  assert.ok(Object.isFrozen(a.payload.fit.result.pose));
  assert.equal(a.digest,createHash('sha256').update(archive.canonicalContent(a.payload),'ascii').digest('hex'));
  assert.deepEqual(archive.validate(copy(a)),a);
  const summary=archive.summary(a);
  assert.equal(summary.fitCount,13);assert.equal(summary.validationCount,1);
  assert.equal(summary.status,'stalled');assert.equal(summary.rmsPx,5);
  raw.observations[0].pixel[0]=1;raw.scene.model.Height=1;
  assert.notEqual(a.payload.observations[0].pixel[0],1);
  assert.notEqual(a.payload.scene.model.Height,1);
});
test('metadata, aliases, project parent and key ordering do not alter scientific identity',async()=>{
  const raw=input(),a=await archive.create(raw,env());
  raw.referenceImage.id='alias';raw.referenceImage.title='Renamed';raw.referenceImage.author='Other attribution';
  raw.referenceSource.links=['Other caption'];raw.scene.model=Object.fromEntries(Object.entries(raw.scene.model).reverse());
  const b=await archive.create(raw,env(),{projectId:'project_2'});
  assert.equal(a.id,b.id);assert.ok(archive.sameContent(a,b));
  assert.notDeepEqual(a.provenance,b.provenance);
  assert.notEqual((await archive.create({...raw,referenceImage:{...raw.referenceImage,
    original:{...raw.referenceImage.original,dataUrl:
    'data:image/png;base64,'+Buffer.concat([Buffer.from(raw.referenceImage.original.dataUrl.split(',')[1],'base64'),Buffer.from([1])]).toString('base64')}}},env())).id,a.id);
});
test('changed candidate, hypothesis or observations cannot redirect an existing result',async()=>{
  const raw=input(),a=await archive.create(raw,env());
  let x=copy(a);x.payload.fit.result.pose.Height+=1;
  assert.throws(()=>archive.validate(x),/digest mismatch/);
  x=copy(a);x.payload.fit.result.evaluation.rmsPx=2;
  assert.throws(()=>archive.validate(x),/metrics mismatch/);
  x=copy(a);x.payload.observations[0].pixel[0]+=1;
  assert.throws(()=>archive.validate(x),/does not match/);
  x=copy(a);x.payload.scene.physics.atmosphere='standard';
  assert.throws(()=>archive.validate(x),/does not match|configuration/);
  x=copy(a);x.payload.extra='unexpected';
  assert.throws(()=>archive.validate(x),/fields/);
  raw.fit.result.pose.Height+=1;
  assert.notEqual((await archive.create(raw,env())).id,a.id);
});
test('invalid, stale, running and missing results fail before archive; unconfirmed candidates remain explicit',async()=>{
  let x=input();x.fit.running=true;await assert.rejects(archive.create(x,env()),/Stop/);
  x=input();x.fit.result=null;await assert.rejects(archive.create(x,env()),/valid candidate/);
  x=input();x.fit.result.materialBinding='stale';await assert.rejects(archive.create(x,env()),/match/);
  x=input();x.fit.result.evaluation.cost=0;await assert.rejects(archive.create(x,env()),/metrics/);
  x=input();delete x.fit.result.status;delete x.fit.result.reason;x.fit.status='Stopped · best valid camera retained';
  const stopped=await archive.create(x,env());assert.equal(stopped.payload.fit.result.status,'stopped');
  assert.equal(archive.validate(copy(stopped)).payload.fit.result.status,'stopped');
  x.fit.status='Imported interrupted fit · best saved candidate only';
  assert.equal((await archive.create(x,env())).payload.fit.result.status,'interrupted');
  x.fit.status='Imported fit';assert.equal((await archive.create(x,env())).payload.fit.result.status,'candidate');
});
test('legacy vertex-only v1/v2 imports normalize without inventing result binding or convergence',async()=>{
  const x=input();x.observations=x.observations.filter(r=>!r.landmark.anchor);
  const ids=new Set(x.observations.map(r=>r.landmark.id));
  x.fit.result.evaluation.points=x.fit.result.evaluation.points.filter(p=>ids.has(p.id));
  x.fit.result.evaluation.cost=x.fit.result.evaluation.points.reduce((n,p)=>n+25*p.weight/2,0);
  delete x.fit.result.materialBinding;delete x.fit.result.status;delete x.fit.result.reason;x.fit.status='Imported fit';
  x.version=1;for(const row of x.observations)delete row.included;
  const a=await archive.create(x,env());assert.ok(a.payload.observations.every(r=>r.included));
  assert.equal(a.payload.fit.result.materialBinding,undefined);
  assert.equal(a.payload.fit.result.status,'candidate');
  x.version=2;assert.ok(archive.sameContent(a,await archive.create(x,env())));
  x.observations[0].landmark.primitive=999999;x.observations[0].landmark.id='b0:p999999:v4';
  x.fit.result.evaluation.points[0].id=x.observations[0].landmark.id;
  await assert.rejects(archive.create(x,env()),/topology mismatch/);
});
test('snapshot is isolated across asynchronous decode/hash and malformed provenance is rejected',async()=>{
  const raw=input();let release;
  const e=env();e.Image=class{constructor(){this.naturalWidth=1176;this.naturalHeight=791;}decode(){return new Promise(r=>release=r);}};
  const pending=archive.create(raw,e);raw.scene.model.Height=1;raw.referenceImage.title='Later';raw.observations[0].pixel[0]=1;
  release();const a=await pending;
  assert.notEqual(a.payload.scene.model.Height,1);assert.equal(a.provenance.attribution.title,'Soundly');
  assert.notEqual(a.payload.observations[0].pixel[0],1);
  const x=copy(a);x.provenance.attribution.sourceUrl='javascript:alert(1)';assert.throws(()=>archive.validate(x),/URL/);
});

const storage=require('../src/ui/modern/ModernCalibrationResultArchive');
const library=require('../src/animation/ModernReferenceImageLibrary');
// A two-database transactional double with staged writes, request success
// followed by commit/abort, and a fault injected at the commit boundary.
// Real transaction serialization is qualified separately in Chromium.
function memoryStorage(){
  const databases=new Map(),faults={abortNextArchive:false,failOpen:false,failImage:false};
  return {databases,faults,open(name,version){
    if(faults.failOpen)throw Error('Storage denied');
    assert.equal(version,1);
    const request={result:null,error:null};
    queueMicrotask(()=>{
      const fresh=!databases.has(name);
      if(fresh)databases.set(name,new Map());
      const records=databases.get(name);
      request.result={close(){},createObjectStore(store,opts){
        assert.equal(store,name===storage.DATABASE?storage.STORE:library.STORE);
        assert.equal(opts.keyPath,'id');
      },transaction(store,mode){
        const staged=new Map();let pending=0,done=false;
        const tx={error:null,abort(){
          if(done)return;done=true;queueMicrotask(()=>tx.onabort?.());
        },objectStore(){
          function op(fn){
            const req={};pending++;
            queueMicrotask(()=>{
              if(done)return;
              try{req.result=fn();req.onsuccess?.();}
              catch(error){tx.error=error;tx.abort();return;}
              if(--pending===0&&!done)queueMicrotask(()=>{
                if(done||pending)return;
                if(mode==='readwrite'&&name===storage.DATABASE&&faults.abortNextArchive){
                  faults.abortNextArchive=false;tx.error=Error('Injected archive quota failure');tx.abort();return;
                }
                if(mode==='readwrite'&&name===library.DATABASE&&faults.failImage){
                  tx.error=Error('Injected image failure');tx.abort();return;
                }
                for(const [id,row] of staged)records.set(id,row);
                done=true;tx.oncomplete?.();
              });
            });
            return req;
          }
          return {get:id=>op(()=>records.has(id)?copy(records.get(id)):undefined),
            getAll:()=>op(()=>[...records.values()].map(copy)),
            add:row=>op(()=>{assert.equal(mode,'readwrite');
              if(records.has(row.id)||staged.has(row.id))throw Error('Constraint');
              staged.set(row.id,copy(row));
            })};
        }};
        return tx;
      }};
      if(fresh)request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  }};
}
test('durable archival commits original then result, reuses exact scientific content and preserves first provenance',async()=>{
  const db=memoryStorage(),raw=input();
  const first=await storage.archiveExperiment(db,raw,env(),{projectId:'first'});
  assert.equal(first.reused,false);assert.equal(first.photoReused,false);
  assert.equal(first.row.record.provenance.projectId,'first');
  assert.equal((await library.get(db,first.photoId)).record.original.dataUrl,raw.referenceImage.original.dataUrl);
  assert.equal(JSON.stringify(first.row).includes('data:image/'),false);
  raw.referenceImage.title='Renamed';raw.referenceImage.id='alias';
  const second=await storage.archiveExperiment(db,raw,env(),{projectId:'second'});
  assert.equal(second.reused,true);assert.equal(second.photoReused,true);
  assert.deepEqual(second.row,first.row);assert.equal(second.photoId,first.photoId);
  assert.deepEqual(await storage.get(db,first.row.id),first.row);
  assert.ok(Object.isFrozen((await storage.get(db,first.row.id)).record.payload));
  const list=await storage.list(db);
  assert.equal(list.length,1);assert.equal(list[0].id,first.row.id);
  assert.equal(list[0].fitCount,13);assert.equal(list[0].payload,undefined);
  assert.equal(list[0].createdAt,first.row.createdAt);
  assert.equal((await library.list(db)).length,1);
  raw.fit.result.pose.Height+=1;
  const changed=await storage.archiveExperiment(db,raw,env());
  assert.notEqual(changed.row.id,first.row.id);assert.equal((await storage.list(db)).length,2);
  assert.equal((await library.list(db)).length,1);
});
test('portable result requires verified original; historical lookup is independent of missing photo',async()=>{
  const db=memoryStorage(),raw=input(),result=await archive.create(raw,env());
  assert.equal(await storage.get(db,result.id),null);
  await assert.rejects(storage.save(db,result,env()),/original photo is unavailable/);
  assert.deepEqual(await storage.list(db),[]);
  await library.create(db,raw.referenceImage);
  const saved=await storage.save(db,result,env());assert.equal(saved.reused,false);
  db.databases.get(library.DATABASE).clear(); // external site-data removal
  assert.deepEqual(await storage.get(db,result.id),saved.row);
  assert.equal((await storage.list(db)).length,1);
  await assert.rejects(storage.save(db,result,env()),/original photo is unavailable/);
  await assert.rejects(storage.get(db,'invalid'),/Invalid calibration result ID/);
});
test('aborted archive commit never reports success; original retained and retry is idempotent',async()=>{
  const db=memoryStorage(),raw=input();
  db.faults.abortNextArchive=true;
  await assert.rejects(storage.archiveExperiment(db,raw,env()),/Injected archive quota failure/);
  assert.equal((await library.list(db)).length,1);assert.deepEqual(await storage.list(db),[]);
  const recovered=await storage.archiveExperiment(db,raw,env());
  assert.equal(recovered.reused,false);assert.equal(recovered.photoReused,true);
  assert.equal((await storage.archiveExperiment(db,raw,env())).reused,true);
  assert.equal((await storage.list(db)).length,1);
});
test('invalid fit, image failure, corrupt stored rows and denied storage fail closed',async()=>{
  const db=memoryStorage(),raw=input(),invalid=copy(raw);invalid.fit.running=true;
  await assert.rejects(storage.archiveExperiment(db,invalid,env()),/Stop/);
  assert.equal((await library.list(db)).length,0);
  db.faults.failImage=true;
  await assert.rejects(storage.archiveExperiment(db,raw,env()),/Injected image failure/);
  db.faults.failImage=false;
  assert.deepEqual(await storage.list(db),[]);assert.equal((await library.list(db)).length,0);
  const saved=await storage.archiveExperiment(db,raw,env());
  const corrupt=db.databases.get(storage.DATABASE).get(saved.row.id);corrupt.record.payload.fit.result.pose.Height+=1;
  await assert.rejects(storage.get(db,saved.row.id),/digest mismatch/);
  await assert.rejects(storage.archiveExperiment(db,raw,env()),/digest mismatch/);
  assert.equal(corrupt.record.payload.fit.result.pose.Height,saved.row.record.payload.fit.result.pose.Height+1);
  db.faults.failOpen=true;
  await assert.rejects(storage.get(db,saved.row.id),/Storage denied/);
  await assert.rejects(storage.list(undefined));
});
test('archive bounds reject overflow without eviction; input snapshot survives asynchronous decode',async()=>{
  assert.throws(()=>storage.quota(Array(storage.MAX_ITEMS+1).fill({})),/limit/);
  assert.throws(()=>storage.quota([{data:'x'.repeat(storage.MAX_CHARS)}]),/size limit/);
  const db=memoryStorage(),raw=input(),e=env();let release,first=true;
  e.Image=class{constructor(){this.naturalWidth=1176;this.naturalHeight=791;}
    decode(){if(first){first=false;return new Promise(r=>release=r);}return Promise.resolve();}
  };
  const pending=storage.archiveExperiment(db,raw,e);
  raw.referenceImage.title='Later';raw.referenceImage.id='later';raw.fit.result.pose.Height=99;release();
  const result=await pending;
  assert.equal(result.row.record.payload.fit.result.pose.Height,42.8);
  assert.equal(result.row.record.provenance.attribution.title,'Soundly');
  assert.equal(result.photoId,'soundly');
});

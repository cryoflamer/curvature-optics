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

test('origin is created from archived fit and contains no mutable alias, provenance or observation rows',async()=>{
  const record=await archive.create(input(),env());
  for(const target of ['Scene','A','B']){
    const origin=archive.origin(record,target);
    assert.equal(origin.target,target);assert.equal(origin.resultId,record.id);
    assert.equal(origin.resultDigest,record.digest);assert.deepEqual(origin.photo,record.payload.photo);
    assert.equal(origin.baselineCamera.Height,42.8);assert.equal(origin.baselineCamera.viewcenterHorizon,3);
    assert.equal(origin.historicalFit.status,'stalled');assert.equal(origin.historicalFit.fitCount,13);
    assert.equal(origin.historicalFit.validationCount,1);
    assert.ok(Object.isFrozen(origin.baselineCamera));
    assert.equal(origin.provenance,undefined);assert.equal(origin.observations,undefined);
  }
  assert.throws(()=>archive.origin(record,'C'),/target/);
});

const transfer=require('../src/ui/modern/ModernCalibrationTransfer');
const codec=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const compareModel=require('../src/ui/modern/ModernCompareModel');
function destination(){
  const m={...copy(fixture.model),deviceRatio:16/9,Height:17,showGrid:1,DemoText:'Unrelated scene',
    Description:'Unrelated description',NObjects:[2,3],viewcenterHorizon:0};
  return codec.capture(m,{atmosphere:'inverse-temperature',occlusionRadius:987654,
    visibility:{enabled:true,rangeKm:140},temperatureProfile:{temperatureC:30,pressureHpa:900,gradientKPerKm:10},
    preset:'custom',resetPreset:'chicago'},compare.preset('flat-inverse'),
    {mode:'scene',eyeLevel:false,horizon:true,selected:'B'});
}
function rebind(raw){
  const {model,physics}=raw.scene;
  raw.fit.result.materialBinding=editor.fitBinding(raw.observations,raw.fit.freeParameters,model,physics,1176,791);
}
test('pure Scene transfer uses exact best camera and captured object banks, initializes fresh Compare',async()=>{
  const raw=input(),record=await archive.create(raw,env()),current=destination(),before=copy(current);
  current.cameraPositions=[{id:'old',name:'Old',camera:copy(current.scene.camera)}];
  const saved=copy(current),next=transfer.transfer(record,current,'Scene');
  assert.deepEqual(current,saved);
  assert.deepEqual(next.scene.camera,{...record.payload.fit.result.pose,viewcenterHorizon:3,deviceRatio:16/9});
  for(const k of codec.OBJECT)assert.deepEqual(next.scene.objects[k],raw.scene.model[k]);
  assert.deepEqual(next.scene.surface,{showModel:1,rEarth:6371000});
  assert.equal(next.scene.atmosphere,'vacuum');
  assert.deepEqual(next.scene.temperatureProfile,raw.scene.physics.temperatureProfile);
  assert.deepEqual(next.scene.visibility,{enabled:false,rangeKm:60});
  assert.equal(next.scene.occlusionRadius,6371000);
  assert.equal(next.scene.showGrid,false);assert.equal(next.scene.preset,'custom');
  assert.equal(next.scene.resetPreset,'pontchartrain');
  assert.equal(next.cameraPositions,undefined);assert.equal(next.cameraSequence,undefined);
  assert.equal(next.compare.A.surface,'globe');assert.equal(next.compare.B.surface,'flat');
  assert.equal(next.compare.A.atmosphere,'vacuum');assert.equal(next.compare.B.atmosphere,'vacuum');
  assert.equal(next.display.mode,'scene');assert.equal(next.calibrationOrigin.target,'Scene');
  assert.equal(next.calibrationOrigin.photo.width,1176);assert.equal(next.calibrationOrigin.photo.height,791);
  assert.deepEqual(codec.decode(codec.encode(next)),next);
  next.scene.objects.NObjects[0]=1;assert.equal(record.payload.scene.model.NObjects[0],128);
  assert.equal(before.scene.camera.Height,17);
});
test('Compare A and B transfer share exact camera/layout and change selected physics only, except shared haze',async()=>{
  const raw=input();raw.scene.physics.atmosphere='temperature-lapse';
  raw.scene.physics.temperatureProfile={temperatureC:19,pressureHpa:1000,gradientKPerKm:-10};
  raw.fit.result.atmosphere='temperature-lapse';rebind(raw);
  const record=await archive.create(raw,env());
  for(const target of ['A','B']){
    const current=destination(),other=target==='A'?'B':'A';
    current.compare.A.visibility={enabled:true,rangeKm:20};current.compare.B.visibility={enabled:true,rangeKm:20};
    const before=copy(current),next=transfer.transfer(record,current,target);
    assert.deepEqual(current,before);assert.equal(next.display.mode,'compare');
    assert.equal(next.compare.selected,target);assert.equal(next.compare.preset,'custom');
    assert.equal(next.calibrationOrigin.target,target);
    assert.equal(next.compare[target].surface,'globe');assert.equal(next.compare[target].radiusKm,6371);
    assert.equal(next.compare[target].atmosphere,'temperature-lapse');
    assert.deepEqual(next.compare[target].temperatureProfile,raw.scene.physics.temperatureProfile);
    assert.deepEqual(next.compare[other],{...before.compare[other],visibility:{enabled:false,rangeKm:60}});
    for(const k of ['surface','atmosphere','occlusionRadius','visibility','temperatureProfile','transitionProfile','inverseProfile'])
      assert.deepEqual(next.scene[k],before.scene[k]);
    const model={...next.scene.camera,...next.scene.objects,showGrid:0,metricGridExtentKm:0,
      Update(){this.camViewAngle=2*Math.atan(43.2/(2*this.FocalLengthField));}};
    const pair=compare.pair(model,next.compare,compareModel);
    assert.ok(compareModel.invariant(pair));
    for(const side of ['A','B'])for(const k of Object.keys(record.payload.fit.result.pose))
      assert.equal(pair[side][k],record.payload.fit.result.pose[k]);
    assert.deepEqual(codec.decode(codec.encode(next)),next);
  }
});
test('supported captured aspect wins; unsupported original aspect stays separate; missing legacy controls have deterministic defaults',async()=>{
  for(const [capture,expected] of [[1.5,1.5],[2/3,2/3],[9/16,9/16],[16/9,16/9],[1176/791,16/9],[undefined,16/9]]){
    const raw=input();if(capture!==undefined)raw.scene.model.deviceRatio=capture;
    delete raw.scene.physics.temperatureProfile;rebind(raw);
    const record=await archive.create(raw,env()),next=transfer.transfer(record,destination(),'Scene');
    assert.equal(next.scene.camera.deviceRatio,expected);
    assert.equal(next.scene.camera.FocalLengthField,record.payload.fit.result.pose.FocalLengthField);
    assert.deepEqual(next.scene.temperatureProfile,{temperatureC:15,pressureHpa:1013.25,gradientKPerKm:-6.5});
    assert.equal(next.calibrationOrigin.photo.width/next.calibrationOrigin.photo.height,1176/791);
  }
});
test('pure transfer rejects unsupported target, unrepresentable object domain and flat reference constants without mutation',async()=>{
  const current=destination(),before=copy(current),raw=input(),record=await archive.create(raw,env());
  assert.throws(()=>transfer.transfer(record,current,'C'),/target/);
  let altered=input();altered.scene.model.rFEarth=12345678;rebind(altered);
  const unsupported=await archive.create(altered,env());
  assert.throws(()=>transfer.transfer(unsupported,current,'Scene'),/flat reference radius/);
  altered=input();altered.scene.model.NObjects[1]=201;rebind(altered);
  const tooMany=await archive.create(altered,env());
  assert.throws(()=>transfer.transfer(tooMany,current,'B'),/outside supported range/);
  const corrupt=copy(record);corrupt.payload.fit.result.pose.Height+=1;
  assert.throws(()=>transfer.transfer(corrupt,current,'Scene'),/digest mismatch/);
  assert.deepEqual(current,before);
});

test('calibrated status follows archived input equivalence, not display or historical RMS as live score',async()=>{
  const record=await archive.create(input(),env()),base=transfer.transfer(record,destination(),'Scene');
  const inspect=e=>transfer.applicability(e,record);
  const first=inspect(base);
  assert.equal(first.resultStatus,'verified');assert.equal(first.views.Scene.status,'calibrated');
  assert.deepEqual(first.activeViews,['Scene']);assert.equal(first.historicalFit.verified,true);
  assert.equal(first.historicalFit.method,'canvas-direct');assert.equal(first.historicalFit.rmsPx,5);
  assert.equal(first.liveRmsPx,undefined);
  assert.ok(Object.isFrozen(first.views.Scene.differences));
  for(const k of ['Height','FocalLengthField','Pan','Nick','Roll','CameraEast','CameraNorth']){
    const e=copy(base);e.scene.camera[k]+=.01;
    const a=inspect(e);assert.equal(a.views.Scene.status,'derived');
    assert.ok(a.views.Scene.differences.includes('camera.'+k));
    e.scene.camera[k]=base.scene.camera[k];assert.equal(inspect(e).views.Scene.status,'calibrated');
  }
  const e=copy(base);e.scene.camera.Height+=1e-10;
  e.scene.camera.deviceRatio=9/16;e.scene.showGrid=true;e.scene.gridExtentKm=123;
  e.display.eyeLevel=!e.display.eyeLevel;e.display.horizon=!e.display.horizon;
  e.scene.visibility={enabled:true,rangeKm:25};e.scene.title='Renamed';
  e.scene.temperatureProfile.gradientKPerKm=10;e.scene.occlusionRadius+=100;
  e.scene.objects.ObjDist[1]+=10; // dormant bank
  assert.equal(inspect(e).views.Scene.status,'calibrated');
  e.scene.camera.viewcenterHorizon=0;assert.deepEqual(inspect(e).views.Scene.differences,['camera.viewcenterHorizon']);
  e.scene.camera.viewcenterHorizon=3;e.scene.objects.ObjDist[0]+=1;
  assert.deepEqual(inspect(e).views.Scene.differences,['objects.ObjDist.0']);
  assert.deepEqual(inspect(codec.decode(codec.encode(e))),inspect(e));
});
test('active physical inputs invalidate fit; inactive profiles, guides and alternate side do not',async()=>{
  const raw=input();raw.scene.physics.atmosphere='temperature-lapse';raw.fit.result.atmosphere='temperature-lapse';
  rebind(raw);const record=await archive.create(raw,env());
  for(const target of ['Scene','A','B']){
    const base=transfer.transfer(record,destination(),target),e=copy(base);
    const live=target==='Scene'?e.scene:e.compare[target];
    live.temperatureProfile.gradientKPerKm+=1;
    assert.deepEqual(transfer.applicability(e,record).views[target].differences,['physics.temperatureProfile.gradientKPerKm']);
    live.temperatureProfile.gradientKPerKm-=1;
    live.inverseProfile.weight=.5;live.transitionProfile.weight=.8;live.occlusionRadius+=100;
    assert.equal(transfer.applicability(e,record).views[target].status,'calibrated');
    if(target==='Scene')live.surface.rEarth+=1;else live.radiusKm+=.001;
    assert.deepEqual(transfer.applicability(e,record).views[target].differences,['physics.radiusKm']);
    if(target==='Scene')live.surface.rEarth-=1;else live.radiusKm-=.001;
    live.atmosphere='vacuum';
    assert.deepEqual(transfer.applicability(e,record).views[target].differences,['physics.atmosphere']);
  }
});
test('Compare separates association from numerical equivalence; shared camera affects both',async()=>{
  const record=await archive.create(input(),env());
  for(const target of ['A','B']){
    const other=target==='A'?'B':'A',e=transfer.transfer(record,destination(),target);
    e.compare[other]=copy(e.compare[target]);e.compare.selected=other;
    let a=transfer.applicability(e,record);
    assert.deepEqual(a.activeViews,['A','B']);assert.equal(a.views[target].status,'calibrated');
    assert.equal(a.views[other].status,'derived');assert.equal(a.views[other].associated,false);
    assert.equal(a.views[other].matchesFit,true);
    e.scene.camera.viewcenterHorizon=0; // Compare clones always use Eye-Lvl.
    assert.equal(transfer.applicability(e,record).views[target].status,'calibrated');
    e.scene.camera.Height+=1;a=transfer.applicability(e,record);
    for(const side of ['A','B']){
      assert.equal(a.views[side].status,'derived');assert.deepEqual(a.views[side].differences,['camera.Height']);
    }
    e.scene.camera.Height-=1;e.compare[other].surface='flat';
    a=transfer.applicability(e,record);assert.equal(a.views[target].status,'calibrated');
    assert.deepEqual(a.views[other].differences,['physics.surface']);
    e.display.mode='scene';a=transfer.applicability(e,record);
    assert.deepEqual(a.activeViews,['Scene']);assert.equal(a.views.Scene.associated,false);
    assert.equal(a.views.Scene.status,'derived');
  }
});
test('missing, mismatched and invalid archive never certify an origin; ordinary stays ordinary',async()=>{
  const record=await archive.create(input(),env()),e=transfer.transfer(record,destination(),'Scene');
  const missing=transfer.applicability(e,null);
  assert.equal(missing.resultStatus,'missing');assert.equal(missing.views.Scene.status,'unresolved');
  assert.equal(missing.views.Scene.matchesFit,null);assert.equal(missing.historicalFit.verified,false);
  const fake=copy(e);fake.calibrationOrigin.historicalFit.rmsPx+=1;
  assert.equal(transfer.applicability(fake,record).resultStatus,'mismatch');
  const wrong=copy(record);wrong.payload.fit.result.pose.Height+=1;
  assert.equal(transfer.applicability(e,wrong).resultStatus,'invalid');
  const changed=input();changed.fit.result.pose.Height+=1;
  const different=await archive.create(changed,env());
  assert.equal(transfer.applicability(e,different).resultStatus,'mismatch');
  const ordinary=copy(e);delete ordinary.calibrationOrigin;
  const result=transfer.applicability(ordinary,record);
  assert.equal(result.resultStatus,'unlinked');assert.equal(result.historicalFit,null);
  assert.equal(result.views.Scene.status,'ordinary');
  assert.equal(transfer.applicability(e,record).views.Scene.status,'calibrated');
});

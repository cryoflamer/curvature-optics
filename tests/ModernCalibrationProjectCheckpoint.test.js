'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const checkpoint=require('../src/ui/modern/ModernCalibrationProjectCheckpoint');
const model=require('../src/ui/modern/ModernCalibrationProject');
const editor=require('../src/ui/modern/ModernPhotoCalibrationEditor');
const importer=require('../src/ui/modern/ModernReferenceImageImport');
const images=require('../src/animation/ModernReferenceImage');
const fixture=require('./fixtures/soundly-mixed-calibration.json');
const copy=x=>structuredClone(x);
const id='calibration-project-v1-'+'b'.repeat(32);
const base64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOo6TsAAANUAcuEDSEIAAAAAElFTkSuQmCC';
function reference(){
  const bytes=Buffer.from(base64,'base64');
  bytes.writeUInt32BE(1176,16);bytes.writeUInt32BE(791,20);
  return {version:1,id:'soundly',title:'Source Soundly',author:'Photographer',
    original:{dataUrl:'data:image/png;base64,'+bytes.toString('base64'),width:1176,height:791}};
}
function draft(){
  const rows=copy(fixture.observations),m=copy(fixture.model);
  return {version:2,scene:{model:m,
      physics:{atmosphere:'vacuum',temperatureProfile:copy(fixture.options.temperatureProfile)}},
    record:reference(),activeSource:{source:'demo',demoId:'soundly',
      key:'demo_soundly',links:['Original'],imported:false},
    rows,pending:[330,151],pendingModel:copy(rows[0].landmark),
    activePair:rows[0].landmark.id,editing:rows[0].landmark.id,explicitAdd:false,
    view:{scale:.8,x:8,y:14},physicalSessionId:'physical-session-1',
    undoStack:[{rows:copy(rows.slice(0,4)),activePair:rows[0].landmark.id}],
    redoStack:[{rows:copy(rows),activePair:rows[0].landmark.id}],
    selectedOwner:{bank:0,objectType:8},weight:'2',freeParameters:fixture.options.freeParameters.slice(),
    fitBest:null,fitStatus:'Not yet fitted',viewBest:false,stage:'correspondences',
    resultCamera:'initial',resultViews:{initial:{scale:1,x:10,y:20},best:null},
    residualMode:'off'};
}
function inline(d){
  return {id:d.physicalSessionId,photo:d.record?.id||null,
    sessions:{initial:{source:JSON.stringify({bank:0}),session:{zoom:1.2,pivot:[1,2,3]}}}};
}
function env(){
  return {crypto:webcrypto,indexedDB:{},Image:class {
    constructor(){this.naturalWidth=1176;this.naturalHeight=791;}
    async decode(){}
  }};
}
function catalog(environment){
  const originals=new Map();
  return {originals,
    async ensureOriginal(_db,record,crypto,verifyOriginal){
      await verifyOriginal(record);
      const identity=await importer.identify(record,environment);
      if(!originals.has(identity.sha256))originals.set(identity.sha256,copy(record));
      return {identity,row:{record:copy(originals.get(identity.sha256))},reused:originals.size===1};
    },
    async findOriginal(_db,identity,crypto,verifyOriginal){
      const stored=originals.get(identity.sha256);
      if(!stored)return null;
      await verifyOriginal(stored);
      const confirmed=await importer.identify(stored,environment);
      assert.deepEqual(confirmed,identity);
      return {id:stored.id,record:copy(stored)};
    }};
}
async function capture(d,session=inline(d)){
  const environment=env(),library=catalog(environment);
  const parts=await checkpoint.captureVerified(d,session,environment,library,importer);
  const project=model.fresh({id,title:'Soundly fit',now:100,...parts});
  return {project,environment,library,parts};
}
function resultFor(d){
  const points=d.rows.filter(r=>r.included!==false).map(row=>({id:row.landmark.id,
    status:'visible',observed:row.pixel.slice(),predicted:[row.pixel[0]+3,row.pixel[1]+4],
    weight:row.weight}));
  return {status:'stalled',reason:'Step tolerance',pose:{...d.scene.model,Height:42.8},
    method:'canvas-direct',atmosphere:d.scene.physics.atmosphere,initialRmsPx:300,
    evaluations:20,acceptedSteps:4,iterations:5,freeParameters:d.freeParameters.slice(),
    evaluation:{valid:true,rmsPx:5,weightedRmsPx:5,
      cost:points.reduce((sum,p)=>sum+25*p.weight/2,0),points},
    materialBinding:editor.fitBinding(d.rows,d.freeParameters,d.scene.model,d.scene.physics,1176,791)};
}
test('exact pending pairs, material banks, edit history, inline view and source survive verified extraction/hydration',async()=>{
  const before=draft(),input=copy(before),session=inline(before),originalSession=copy(session);
  const {project,environment,library}=await capture(before,session);
  assert.deepEqual(before,input);assert.deepEqual(session,originalSession);
  assert.equal(project.photo.identity.width,1176);assert.equal(project.photo.identity.height,791);
  assert.equal(project.photo.aliasId,'soundly');
  assert.equal(project.checkpoint.payload.draft.record,null);
  assert.equal(project.checkpoint.payload.recordMetadata.author,'Photographer');
  assert.equal(JSON.stringify(project).includes('data:image'),false);
  assert.equal(project.overview.rowCount,14);
  assert.equal(project.overview.fitRmsPx,null);
  assert.deepEqual(project.checkpoint.payload.draft.rows,input.rows);
  assert.deepEqual(project.checkpoint.payload.draft.pendingModel,input.pendingModel);
  assert.deepEqual(project.checkpoint.payload.draft.undoStack,input.undoStack);
  assert.deepEqual(project.checkpoint.payload.draft.redoStack,input.redoStack);
  assert.deepEqual(project.checkpoint.payload.draft.resultViews,input.resultViews);
  assert.deepEqual(project.checkpoint.payload.inline,session);
  const prepared=await checkpoint.prepare(project,environment,library,importer);
  assert.deepEqual(prepared.draft,input);assert.deepEqual(prepared.inline,session);
  assert.deepEqual(prepared.photo,input.record);
  assert.equal(prepared.project.id,id);
  assert.deepEqual(prepared.draft.scene.model.NObjects,input.scene.model.NObjects);
});
test('completed seven-field Soundly candidate preserves Fit/Validation source metrics and material binding',async()=>{
  const d=draft();d.fitBest=resultFor(d);d.fitStatus='Stalled · step tolerance';
  d.stage='result';d.viewBest=true;d.resultCamera='best';
  const {project,environment,library}=await capture(d);
  assert.equal(project.overview.fitRmsPx,5);
  const round=await checkpoint.prepare(project,environment,library,importer);
  assert.deepEqual(round.draft.fitBest,d.fitBest);
  assert.deepEqual(round.draft.freeParameters,d.freeParameters);
  assert.equal(round.draft.rows.length,14);
  assert.equal(round.draft.fitBest.materialBinding,d.fitBest.materialBinding);
});
test('independent no-photo working state survives without touching Reference Image Library',async()=>{
  const d=draft();
  d.record=null;d.activeSource=null;d.rows=[];d.pending=null;d.pendingModel=null;
  d.activePair=null;d.editing=null;d.undoStack=[];d.redoStack=[];
  const environment=env(),library=catalog(environment);
  const parts=await checkpoint.captureVerified(d,null,environment,library,importer);
  assert.equal(parts.photo,null);
  assert.equal(library.originals.size,0);
  const p=model.fresh({id,now:100,...parts});
  const prepared=await checkpoint.prepare(p,environment,library,importer);
  assert.deepEqual(prepared.draft,d);
  assert.equal(prepared.photo,null);
  assert.equal(prepared.inline,null);
  assert.deepEqual(await checkpoint.prepare(model.fresh({id,now:100}),environment,library,importer),
    {project:model.fresh({id,now:100}),draft:null,inline:null,photo:null});
});
test('missing original, different digest, invalid decode and damaged source abort before activation',async()=>{
  const d=draft(),{project,environment,library}=await capture(d);
  const missing=catalog(environment);
  await assert.rejects(checkpoint.prepare(project,environment,missing,importer),/original photograph unavailable/);
  const faulty={...library,findOriginal:async()=>({record:{...d.record,
    original:{...d.record.original,width:5}}})};
  await assert.rejects(checkpoint.prepare(project,environment,faulty,importer),
    /dimensions|header/);
  const broken={...environment,Image:class{async decode(){throw Error('Decoder rejected');}}};
  await assert.rejects(checkpoint.prepare(project,broken,library,importer),/Decoder rejected/);
  const mutated=copy(project);mutated.checkpoint.payload.recordMetadata.title='Changed';
  const hydrated=await checkpoint.prepare(mutated,environment,library,importer);
  assert.equal(hydrated.photo.title,'Changed');
  const wrong=copy(project);wrong.photo.aliasId='other';
  wrong.checkpoint.payload.inline.photo='other'; // isolate attribution guard from inline guard
  await assert.rejects(checkpoint.prepare(wrong,environment,library,importer),/metadata|attribution/);
});
test('malformed checkpoint, stale fit, pending out of bounds and unrelated inline session fail closed',async()=>{
  const d=draft(),environment=env(),library=catalog(environment);
  await assert.rejects(checkpoint.captureVerified({...d,version:1},inline(d),environment,library,importer),
    /draft version/);
  await assert.rejects(checkpoint.captureVerified({...d,pending:[1176,4]},inline(d),environment,library,importer),
    /Pending photo pixel/);
  await assert.rejects(checkpoint.captureVerified({...d,freeParameters:['Height','Height']},inline(d),environment,library,importer),
    /history collection/);
  await assert.rejects(checkpoint.captureVerified({...d,fitBest:{evaluation:{valid:true}}},inline(d),environment,library,importer),
    /fit result|Stored fit/);
  await assert.rejects(checkpoint.captureVerified(d,{...inline(d),id:'unrelated'},environment,library,importer),
    /inline session/);
  const {project,environment:verifiedEnvironment,library:verifiedLibrary}=await capture(d);
  const corrupted=copy(project);
  corrupted.checkpoint.payload.draft.record={original:{dataUrl:'data:image/png;base64,AAAA'}};
  await assert.rejects(checkpoint.prepare(corrupted,environment,library,importer),
    /embedded-photo/);
  const other=copy(project);other.overview.rowCount=7;
  // Use the verified photo catalog from capture, so the overview guard is reached.
  await assert.rejects(checkpoint.prepare(other,verifiedEnvironment,verifiedLibrary,importer),
    /overview disagree/);
});
test('photo identity is verified and reused; no false link to a new title or alias is introduced',async()=>{
  const d=draft(),environment=env(),library=catalog(environment);
  const a=await checkpoint.captureVerified(d,inline(d),environment,library,importer);
  const b=await checkpoint.captureVerified({...d,record:{...d.record,title:'Another title'}},
    inline(d),environment,library,importer);
  assert.deepEqual(a.photo.identity,b.photo.identity);
  assert.equal(library.originals.size,1);
  assert.equal(a.checkpoint.payload.recordMetadata.title,'Source Soundly');
  assert.equal(b.checkpoint.payload.recordMetadata.title,'Another title');
  assert.throws(()=>checkpoint.extract(d,inline(d),
    {...a.photo.identity,width:10}),/identity dimensions/);
  assert.throws(()=>checkpoint.extract({...d,record:null,rows:[]},null,a.photo.identity),
    /No-photo|cannot contain/);
});
test('picker thumbnail is stripped from retryable project checkpoint without losing provenance',async()=>{
  const d=draft(),image=copy(d);
  d.activeSource={...d.activeSource,thumbnail:{
    dataUrl:'data:image/png;base64,'+base64,width:1,height:1},
    tags:['causeway'],links:['Original']};
  const input=copy(d);
  const {project,environment,library}=await capture(d);
  assert.deepEqual(d,input); // the live and retryable source snapshot is not mutated
  assert.equal(project.checkpoint.payload.draft.activeSource.thumbnail,undefined);
  assert.equal(JSON.stringify(project).includes('data:image'),false);
  assert.equal(project.checkpoint.payload.draft.activeSource.key,d.activeSource.key);
  assert.deepEqual(project.checkpoint.payload.draft.activeSource.links,d.activeSource.links);
  assert.deepEqual(project.checkpoint.payload.draft.rows,d.rows);
  const restored=await checkpoint.prepare(project,environment,library,importer);
  assert.equal(restored.draft.activeSource.thumbnail,undefined);
  assert.deepEqual(restored.draft.activeSource.tags,['causeway']);
  assert.equal(restored.photo.original.dataUrl,d.record.original.dataUrl);
  const unsafe=copy(d);
  unsafe.activeSource.unrelated={dataUrl:'data:image/png;base64,'+base64};
  assert.throws(()=>checkpoint.extract(unsafe,inline(unsafe),project.photo.identity),
    /Unsafe or embedded-photo calibration checkpoint field/);
});

test('editor source retains legacy persist and portable export while exposing staged project APIs',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../src/ui/modern/ModernPhotoCalibrationEditor.js'),'utf8');
  const html=fs.readFileSync(path.resolve(__dirname,'../CurvatureModern.html'),'utf8');
  assert.match(source,/function captureDraftState\(/);
  assert.match(source,/async function captureProjectCheckpoint\(/);
  assert.match(source,/async function prepareProjectCheckpoint\(/);
  assert.match(source,/const data=captureDraftState\(\)/);
  assert.match(source,/draft\/active|transaction\('draft','readwrite'\)/);
  assert.match(source,/function exportExperiment\(\)/);
  for(const name of ['ModernCalibrationProject.js','ModernCalibrationProjectStore.js',
    'ModernCalibrationProjectCheckpoint.js'])
    assert.ok(html.includes('src/ui/modern/'+name));
});

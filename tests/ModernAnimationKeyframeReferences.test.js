'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const project=require('../src/animation/ModernAnimationProject');
const studio=require('../src/animation/ModernAnimationStudio');
const autosave=require('../src/animation/ModernAnimationDraftAutosave');
const library=require('../src/animation/ModernAnimationLibrary');
const catalog=require('../src/animation/ModernDemoCatalog');
const contracts=require('../src/animation/ModernAnimationContract');
const atmosphere=require('../src/animation/ModernAnimationAtmosphereVariant');
const shipped=catalog.load().find(d=>d.id==='soundly').project;
function create(version=2){
  const a=structuredClone(shipped.baseExperiment), b=structuredClone(a);
  b.scene.camera.Height+=10;
  const options={id:'observations',name:'Observations',mode:'camera'};
  const frames=[{experiment:a,referenceImageIds:['photo_A','photo_B']},{experiment:b,referenceImageIds:['photo_A']}];
  return version===2?project.createV2(contracts.create(a,{mode:'camera'}),frames,options):project.create(frames,options);
}
for(const version of [1,2])test(`v${version}: ordered shared reference identities survive draft and project roundtrip`,()=>{
  const p=create(version),d=studio.fromProject(p);
  assert.deepEqual(p.keyframes.map(f=>f.referenceImageIds),[['photo_A','photo_B'],['photo_A']]);
  assert.ok(Object.isFrozen(p.keyframes[0].referenceImageIds));
  const rebuilt=studio.buildSaved(d,p.id);
  assert.deepEqual(rebuilt.keyframes,p.keyframes);
  assert.deepEqual(project.timeline(p).map(f=>f.referenceImageIds),[['photo_A','photo_B'],['photo_A']]);
  const variant=atmosphere.derive(p,atmosphere.inspect(p).authoredMode==='vacuum'?'standard':'vacuum');
  assert.deepEqual(variant.keyframes,p.keyframes);
  const bare=structuredClone(p);bare.keyframes.forEach(f=>delete f.referenceImageIds);
  assert.deepEqual(project.frameExperiments(bare),project.frameExperiments(p));
  assert.deepEqual(project.sampleAt(bare,2500),project.sampleAt(p,2500));
  assert.ok(!('referenceImageIds' in project.validate(bare).keyframes[0]));
  assert.notEqual(library.fingerprint(bare),library.fingerprint(p));
  const changed=structuredClone(p);changed.keyframes[0].referenceImageIds.reverse();
  assert.notEqual(library.fingerprint(changed),library.fingerprint(p));
  assert.equal(library.sameFirstFrame(bare,p),true);
});
test('rejects malformed, duplicate, sparse or excessive links, normalizes empty links',()=>{
  for(const value of [null,'photo_A',[123],['bad id'],['a','a'],Array(1),Array.from({length:101},(_,i)=>'x'+i)]){
    assert.throws(()=>project.validateReferenceIds(value),/reference/i);
    const p=structuredClone(create());p.keyframes[0].referenceImageIds=value;
    assert.throws(()=>project.validate(p),/reference/i);
  }
  const p=structuredClone(create());p.keyframes[0].referenceImageIds=[];
  assert.ok(!('referenceImageIds' in project.validate(p).keyframes[0]));
});
test('editing attaches, reorders and detaches via immutable Undo/Redo and retains links on frame reorder',()=>{
  const d=studio.fromProject(create()),key=d.frames[0].key;
  const refs=['photo_B','photo_A','unknown'];
  const edited=studio.editFrame(d,key,'referenceImageIds',refs);refs.push('unowned');
  assert.deepEqual(edited.frames[0].referenceImageIds,['photo_B','photo_A','unknown']);
  const history=studio.createEditHistory();
  assert.equal(studio.recordEdit(history,d,edited,key),true);
  assert.equal(studio.recordEdit(history,edited,studio.editFrame(edited,key,'referenceImageIds',['photo_B','photo_A','unknown']),key),false);
  assert.deepEqual(studio.stepEditHistory(history,edited,key,'undo').draft,d);
  assert.deepEqual(studio.stepEditHistory(history,d,key,'redo').draft,edited);
  const moved=studio.move(edited,key,1);assert.deepEqual(moved.frames[1].referenceImageIds,edited.frames[0].referenceImageIds);
  const detached=studio.editFrame(edited,key,'referenceImageIds',[]);
  assert.equal(detached.frames[0].referenceImageIds,undefined);
  assert.deepEqual(detached.frames[1].referenceImageIds,['photo_A']);
  const removed=studio.remove(edited,key);assert.deepEqual(removed.frames[0].referenceImageIds,['photo_A']);
});
test('unfinished/experimental checkpoints retain unresolved IDs without requiring local photo storage',()=>{
  const a=structuredClone(shipped.baseExperiment);
  for(const mode of ['camera','experimental']){
    const p=project.createV2(contracts.create(a,{mode}),[{experiment:a,referenceImageIds:['missing_photo']}],{id:'unfinished'});
    const d=studio.fromProject(p);
    const cp=autosave.checkpoint({draft:d,selectedKey:d.frames[0].key,quality:'auto',prepared:false,positionMs:0},1000);
    const restored=autosave.normalize(JSON.parse(JSON.stringify(cp)));
    assert.deepEqual(studio.buildSaved(restored.draft,p.id).keyframes[0].referenceImageIds,['missing_photo']);
    const invalid=structuredClone(cp);invalid.draft.frames[0].referenceImageIds=['a','a'];
    assert.throws(()=>autosave.normalize(invalid),/reference/i);
  }
});
test('portable JSON roundtrip preserves IDs only, including unknown IDs, without photo payloads',()=>{
  const p=create();const record=library.record(p,'auto',p.id,1000,1000,null);
  const json=library.exportPortable([record]);
  const parsed=library.parsePortable(json)[0];
  assert.deepEqual(parsed.project,p);
  assert.ok(!json.includes('data:image/'));
  assert.deepEqual(library.parsePortable(JSON.stringify(p))[0].project,p);
});

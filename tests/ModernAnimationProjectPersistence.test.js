'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const codec=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const contracts=require('../src/animation/ModernAnimationContract');
const projects=require('../src/animation/ModernAnimationProject');
const library=require('../src/animation/ModernAnimationLibrary');
const studio=require('../src/animation/ModernAnimationStudio');
const autosave=require('../src/animation/ModernAnimationDraftAutosave');
function scene(mode='scene'){
  const model={Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Baseline',Description:'',
    ObjType:[3,3],NObjects:[2,0],ObjDist:[50,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[10,10],ObjSizeVar:[0,0]};
  return codec.capture(model,{atmosphere:'temperature-lapse',occlusionRadius:6371000,
    preset:'custom',resetPreset:'single'},compare.preset('globe-flat-vacuum'),
    {mode,eyeLevel:true,horizon:true,selected:'A'});
}
const copy=structuredClone;
const opts=id=>({id,name:'Named project',description:'Maintained reference'});
function checkpoint(draft){return autosave.checkpoint({draft,selectedKey:null,
  quality:'accurate',prepared:false,positionMs:0},1000);}

test('V1 project fields, exports and interpolation remain unchanged',()=>{
  const a=scene(),b=copy(a);b.scene.camera.Height=75;
  const old=projects.create([a,b],opts('legacy_camera'));
  assert.equal(old.version,1);assert.equal(projects.VERSION,1);
  assert.equal(Object.hasOwn(old,'contract'),false);
  assert.deepEqual(projects.validate(copy(old)),old);
  assert.equal(projects.ready(old),true);
  assert.equal(projects.sampleAt(old,2500).scene.camera.Height,45);
  assert.equal(studio.buildSaved(studio.fromProject(old),old.id).version,1);
});

test('Incomplete V2 camera contracts survive JSON, Studio and autosave without preview',()=>{
  const a=scene(),contract=contracts.create(a,{mode:'camera'});
  for(const frames of [[],[a]]){
    const project=projects.createV2(contract,frames,opts('unfinished_camera'));
    assert.equal(project.version,2);assert.equal(project.keyframes.length,frames.length);
    assert.deepEqual(projects.validate(copy(project)),project);
    assert.equal(projects.ready(project),false);
    assert.throws(()=>projects.sampleAt(project,0),/not preview-ready/);
    assert.throws(()=>projects.totalMs(project),/not preview-ready/);
    assert.throws(()=>projects.timeline(project),/not preview-ready/);
    assert.throws(()=>projects.splineProof(project),/not preview-ready/);
    const edit=studio.fromProject(project);
    assert.equal(edit.frames.length,frames.length);
    assert.deepEqual(edit.contract,contract);
    assert.equal(studio.inspect(edit).compatible,false);
    assert.equal(studio.buildSaved(edit,project.id).version,2);
    const checkpointValue=checkpoint(edit),reloaded=autosave.normalize(JSON.parse(JSON.stringify(checkpointValue)));
    assert.deepEqual(reloaded.draft.contract,contract);
    assert.equal(studio.buildSaved(reloaded.draft,project.id).keyframes.length,frames.length);
    assert.throws(()=>studio.edit(edit,'mode','physical'),/locks/);
    assert.throws(()=>studio.edit(edit,'target','scene\|surface.curvature'),/locks/);
  }
});

test('Ready V2 camera contract plays like V1 and preserves snapshot-independent frames',()=>{
  const a=scene(),b=copy(a);b.scene.camera.Height=55;b.scene.camera.Pan=25;
  const contract=contracts.create(a,{mode:'camera'});
  const p=projects.createV2(contract,[{id:17,experiment:a,name:'Start'},
    {id:29,experiment:b,name:'Finish',travelMs:4000}],opts('ready_camera'));
  assert.equal(projects.ready(p),true);
  assert.equal(projects.totalMs(p),4000);
  assert.equal(projects.sampleAt(p,2000).scene.camera.Height,35);
  assert.equal(projects.frameExperiment(p,1).scene.camera.Height,55);
  assert.equal(projects.frameExperiment(p,0).scene.camera.Height,15);
  const restored=studio.fromProject(p);
  assert.deepEqual(restored.frames.map(f=>f.sourceSnapshotId),[17,29]);
  assert.equal(studio.buildSaved(restored,p.id).version,2);
  assert.equal(studio.inspect(restored).compatible,true);
  const wrong=copy(b);wrong.scene.objects.ObjDist[0]+=50;
  assert.throws(()=>projects.createV2(contract,[a,wrong],opts('bad_camera')),/Incompatible/);
});

test('V2 physical project stays locked to one active channel, including Compare',()=>{
  const a=scene('compare');const b=copy(a);b.compare.A.surface='flat';
  const target={scope:'A',parameter:'surface.curvature'};
  const contract=contracts.create(a,{mode:'physical',target});
  const v2=projects.createV2(contract,[a,b],opts('curvature_compare'));
  assert.deepEqual(v2.target,target);
  assert.equal(projects.ready(v2),true);
  assert.equal(projects.sampleAt(v2,5000).compare.A.surface,'flat');
  assert.equal(studio.fromProject(v2).target,'A|surface.curvature');
  const mismatch=copy(v2);mismatch.contract.referenceExperiment.compare.A.surface='flat';
  assert.throws(()=>projects.validate(mismatch),/disagrees/);
  const modeMismatch=copy(v2);modeMismatch.mode='camera';
  assert.throws(()=>projects.validate(modeMismatch));
  const other=copy(b);other.compare.B.surface='globe';
  assert.throws(()=>projects.createV2(contract,[a,other],opts('bad_compare')),/Incompatible/);
});

test('Experimental V2 stores complete mixed snapshots but cannot be played or exported as video',()=>{
  const a=scene(),b=copy(a),c=scene('compare');
  b.scene.objects.ObjDist[0]+=100;
  const reference=contracts.create(a,{mode:'experimental'});
  const p=projects.createV2(reference,[{id:11,experiment:a,name:'A'},
    {id:12,experiment:b,name:'B'},{id:13,experiment:c,name:'Compare'}],opts('experimental'));
  assert.equal(p.mode,'experimental');assert.equal(p.keyframes.length,3);
  assert.deepEqual(p.keyframes[2].value,c);
  assert.equal(projects.frameExperiment(p,2).display.mode,'compare');
  assert.equal(projects.ready(p),false);
  assert.throws(()=>projects.sampleAt(p,1000),/not preview-ready/);
  assert.deepEqual(projects.validate(copy(p)),p);
  const edit=studio.fromProject(p);
  assert.equal(edit.frames.length,3);assert.equal(edit.mode,'experimental');
  assert.equal(studio.inspect(edit).compatible,false);
  assert.deepEqual(studio.buildSaved(edit,p.id).keyframes.map(f=>f.value),[a,b,c]);
  assert.equal(autosave.normalize(checkpoint(edit)).draft.frames[2].experiment.display.mode,'compare');
  assert.throws(()=>projects.validate({...p,extra:1}),/fields/);
  assert.throws(()=>projects.validate({...p,version:3}),/fields|version/);
  assert.throws(()=>projects.frameExperiment(p,100),/Unknown/);
});

test('Portable single projects and bundles preserve V2 contracts without changing envelope version',()=>{
  const a=scene(),c=contracts.create(a,{mode:'experimental'});
  const p=projects.createV2(c,[{id:77,experiment:a,name:'Scene'}],opts('portable'));
  const record=library.record(p,'fast',p.id,100,110);
  assert.equal(record.version,1,'browser record schema is independent of project version');
  const wire=library.exportPortable([record]);
  const parsed=library.parsePortable(wire);
  assert.equal(parsed[0].project.version,2);
  assert.equal(parsed[0].project.contract.mode,'experimental');
  assert.equal(library.PORTABLE_VERSION,1);
  assert.deepEqual(library.parsePortable(JSON.stringify(p))[0].project,p);
  assert.equal(library.fingerprint(p),library.fingerprint({...p,id:'another',name:'Another'}));
  const revised=copy(p);revised.keyframes[0].value.scene.objects.ObjDist[0]+=1;
  assert.notEqual(library.fingerprint(p),library.fingerprint(revised));
  const corrupted=copy(parsed[0].project);corrupted.contract.mode='camera';
  assert.throws(()=>library.record(corrupted,'fast',p.id,100,110),/disagrees/);
});

test('Existing playback, PNG and video planners gate V2 readiness consistently',()=>{
  const playback=require('../src/animation/ModernAnimationPlayback');
  const png=require('../src/animation/ModernAnimationFrameExport');
  const video=require('../src/animation/ModernAnimationVideoPipeline');
  const a=scene(),b=copy(a);b.scene.camera.Height=50;
  const contract=contracts.create(a,{mode:'camera'});
  const ready=projects.createV2(contract,[a,b],opts('movie'));
  assert.equal(playback.create(ready).status().durationMs,5000);
  assert.equal(png.plan(ready,{fps:5,width:320,height:180}).durationMs,5000);
  assert.equal(video.plan(ready,{fps:5,width:320,height:180}).durationMs,5000);
  const incomplete=projects.createV2(contract,[a],opts('one_frame'));
  const experimental=projects.createV2(contracts.create(a,{mode:'experimental'}),[a,b],opts('mixed'));
  for(const project of [incomplete,experimental]){
    assert.throws(()=>playback.create(project),/not preview-ready/);
    assert.throws(()=>png.plan(project,{fps:5,width:320,height:180}),/not preview-ready/);
    assert.throws(()=>video.plan(project,{fps:5,width:320,height:180}),/not preview-ready/);
  }
});

test('Animation Library renders an Experimental project without assuming a physical target',()=>{
  const ui=require('../src/ui/modern/ModernAnimationStudioUI');
  const a=scene(),p=projects.createV2(contracts.create(a,{mode:'experimental'}),[],opts('render_experimental'));
  const entry=library.record(p,'auto',p.id,10,20);
  const doc={createElement(tag){return {tagName:tag,children:[],textContent:'',className:'',
    classList:{toggle(){},add(){}},setAttribute(){},addEventListener(){},
    appendChild(n){this.children.push(n);return n;}};}};
  const host=doc.createElement('section');
  ui.renderLibrary(doc,host,[entry],{expanded:true},{});
  function text(node){return [String(node.textContent||''),...(node.children||[]).map(text)].join(' ');}
  assert.match(text(host),/Experimental · no playback · 0 frames/);
});

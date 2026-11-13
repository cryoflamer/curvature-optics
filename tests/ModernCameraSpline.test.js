'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const camera=require('../src/camera/ModernCameraInterpolator');
const experiments=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const projects=require('../src/animation/ModernAnimationProject');
const studio=require('../src/animation/ModernAnimationStudio');
const autosave=require('../src/animation/ModernAnimationDraftAutosave');

const near=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`);
function pose(change={}){
  return {Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,...change};
}
function frame(value,travelMs=2000,holdMs=0){return {value:pose(value),travelMs,holdMs};}
function experiment(cam){
  const m={...cam,showModel:1,rEarth:6371000,showGrid:1,DemoText:'Test',Description:'',
    ObjType:[3,3],NObjects:[2,0],ObjDist:[1000,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  return experiments.capture(m,{atmosphere:'standard',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},compare.preset('globe-flat-vacuum'),
    {mode:'scene',eyeLevel:false,horizon:true,selected:'A'});
}
function project(values,options={}){
  return projects.create(values.map((v,i)=>({name:'Key '+i,experiment:experiment(pose(v)),
    travelMs:i===0?0:(v.travelMs||2000),holdMs:v.holdMs||0,
    easing:i%2?'linear':'smoothstep'})),
  {id:'spline_test',name:'Spline camera',mode:'camera',interpolation:'spline',...options});
}

test('two keyframes use a smooth Hermite path, preserving camera bounds and log FOV',()=>{
  const frames=[frame({Height:1,FocalLengthField:1000},0),
    frame({Height:101,FocalLengthField:4000},3000)];
  near(camera.interpolateSpline(frames,1,.5).Height,51);
  near(camera.interpolateSpline(frames,1,.5).FocalLengthField,2000);
  near(camera.interpolateSpline(frames,1,.25).Height,1+100*(.25*.25*(3-2*.25)));
  assert.deepEqual(camera.interpolateSpline(frames,1,0),frames[0].value);
  assert.deepEqual(camera.interpolateSpline(frames,1,1),frames[1].value);
  assert.equal(Object.isFrozen(camera.interpolateSpline(frames,1,.2)),true);
});

test('nonuniform travel times keep matching first derivatives across an unheld middle keyframe',()=>{
  const frames=[frame({CameraEast:0,CameraNorth:0,Height:15},0),
    frame({CameraEast:15,CameraNorth:15,Height:45},1500),
    frame({CameraEast:120,CameraNorth:50,Height:105},6500),
    frame({CameraEast:130,CameraNorth:70,Height:125},4000)];
  const delta=.01;
  const left=camera.interpolateSpline(frames,1,1-delta/1500);
  const at=camera.interpolateSpline(frames,1,1);
  const right=camera.interpolateSpline(frames,2,delta/6500);
  for(const key of ['CameraEast','CameraNorth','Height']){
    near((at[key]-left[key])/delta,(right[key]-at[key])/delta,1e-6);
  }
  assert.deepEqual(at,frames[1].value);
  for(let index=1;index<frames.length;index++){
    for(let u=0;u<=1;u+=.025){
      const p=camera.interpolateSpline(frames,index,u);
      for(const key of ['CameraEast','CameraNorth','Height']){
        const a=frames[index-1].value[key],b=frames[index].value[key];
        assert.ok(p[key]>=Math.min(a,b)-1e-8&&p[key]<=Math.max(a,b)+1e-8,key);
      }
    }
  }
});

test('turning points and holds do not overshoot; a held keyframe has zero arrival/departure velocity',()=>{
  const frames=[frame({Height:10,Nick:-89},0),
    frame({Height:100,Nick:88},1000,750),
    frame({Height:12,Nick:-85},3000)];
  for(let i=1;i<=2;i++)for(let u=0;u<=1;u+=.01){
    const p=camera.interpolateSpline(frames,i,u);
    assert.ok(p.Height>=10&&p.Height<=100);
    assert.ok(p.Nick>=-90&&p.Nick<=90);
  }
  const before=camera.interpolateSpline(frames,1,1-.001);
  const after=camera.interpolateSpline(frames,2,.001);
  near(before.Height,100,1e-3);
  near(after.Height,100,1e-3);
});

test('Pan and Roll follow the shortest angular path even across the wrapping boundary',()=>{
  const frames=[frame({Pan:170,Roll:170},0),
    frame({Pan:-170,Roll:-170},2000),
    frame({Pan:-145,Roll:-140},2000)];
  const p=camera.interpolateSpline(frames,1,.5);
  assert.ok(Math.abs(p.Roll)>170&&Math.abs(p.Roll)<180);
  assert.ok(p.Pan>170&&p.Pan<200,'Pan is allowed to pass +180');
  for(let i=1;i<frames.length;i++)for(let u=0;u<1;u+=.02){
    const sampled=camera.interpolateSpline(frames,i,u);
    assert.ok(sampled.Roll>=-180&&sampled.Roll<=180);
    assert.ok(sampled.Pan>=-360&&sampled.Pan<=360);
  }
  assert.deepEqual(camera.interpolateSpline(frames,1,1),frames[1].value);
  assert.throws(()=>camera.interpolateSpline(frames,0,.5),/segment/);
  assert.throws(()=>camera.interpolateSpline(frames,1,-.1),/segment/);
});

test('project schema defaults to unchanged Linear for old JSON and rejects invalid spline modes',()=>{
  const linear=project([{Height:10},{Height:80}],{interpolation:'linear'});
  const old=structuredClone(linear);delete old.interpolation;
  assert.equal(projects.validate(old).interpolation,undefined);
  near(projects.sampleAt(old,500).scene.camera.Height,
    projects.sampleAt(linear,500).scene.camera.Height);
  const smooth=project([{Height:10},{Height:80}]);
  assert.equal(smooth.interpolation,'spline');
  assert.ok(projects.sampleAt(smooth,500).scene.camera.Height<
    projects.sampleAt(linear,500).scene.camera.Height);
  assert.deepEqual(projects.validate(structuredClone(smooth)),smooth);
  assert.throws(()=>projects.validate({...smooth,interpolation:'cubic'}),/interpolation/);
  assert.throws(()=>projects.validate({...smooth,mode:'physical',target:{scope:'scene',
    parameter:'surface.curvature'}}),/Spline interpolation requires camera/);
});

test('sampling preserves keyframe arrivals and holds with a continuous spline',()=>{
  const p=project([{CameraEast:0,Height:10,holdMs:500},
    {CameraEast:10,Height:40,travelMs:2000,holdMs:200},
    {CameraEast:80,Height:90,travelMs:6000}]);
  const arrivals=projects.timeline(p);
  assert.deepEqual(arrivals.map(v=>v.arrivalMs),[0,2500,8700]);
  for(let i=0;i<3;i++)assert.deepEqual(
    projects.sampleAt(p,arrivals[i].arrivalMs).scene.camera,p.keyframes[i].value);
  near(projects.sampleAt(p,100).scene.camera.Height,10);
  near(projects.sampleAt(p,2600).scene.camera.Height,40);
  const original=structuredClone(p);
  projects.sampleAt(p,4000);
  assert.deepEqual(p,original,'spline must not mutate the project');
});

test('studio build/open and autosave carry the setting without altering keyframes',()=>{
  const a=experiment(pose({Height:15}));
  const b=experiment(pose({Height:55}));
  let draft=studio.history([1,2],[{id:1,name:'Start',experiment:a},
    {id:2,name:'End',experiment:b}]);
  assert.equal(draft.interpolation,'linear');
  draft=studio.edit(draft,'interpolation','spline');
  assert.equal(studio.inspect(draft).compatible,true);
  const built=studio.build(draft,'studio_spline');
  assert.equal(built.interpolation,'spline');
  const loaded=studio.fromProject(built);
  assert.equal(loaded.interpolation,'spline');
  assert.deepEqual(loaded.frames.map(f=>f.travelMs),draft.frames.map(f=>f.travelMs));
  const saved=autosave.checkpoint({draft,selectedKey:'history-1',quality:'auto',prepared:false,
    libraryId:null,libraryRevision:null,positionMs:0},Date.now());
  assert.equal(saved.draft.interpolation,'spline');
  const migrated=structuredClone(saved);delete migrated.draft.interpolation;
  assert.equal(autosave.normalize(migrated).draft.interpolation,'linear');
  assert.throws(()=>studio.edit(draft,'interpolation','invalid'),/interpolation/);
  assert.throws(()=>autosave.normalize({...saved,draft:{...draft,interpolation:'invalid'}}),/interpolation/);
  const physicalA=structuredClone(a),physicalB=structuredClone(b);
  physicalB.scene.camera=structuredClone(physicalA.scene.camera);
  physicalB.scene.temperatureProfile.gradientKPerKm=9;
  const physicalDraft=studio.edit(studio.history([1,2],
    [{id:1,experiment:physicalA},{id:2,experiment:physicalB}]),'interpolation','spline');
  assert.equal(studio.inspect(physicalDraft).compatible,false);
  assert.ok(studio.inspect(physicalDraft).issues.some(issue=>issue.path==='interpolation'));
});

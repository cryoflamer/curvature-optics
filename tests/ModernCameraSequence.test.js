'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const sequence=require('../src/camera/ModernCameraSequence');
const codec=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const pose={CameraEast:0,CameraNorth:0,Height:15,Pan:359,Nick:0,Roll:0,
  FocalLengthField:50,viewcenterHorizon:3,deviceRatio:1.5};
const frames=[
  {name:'Start',camera:{...pose},travelMs:0,holdMs:1000,easing:'smoothstep'},
  {name:'Bridge',camera:{...pose,CameraEast:200,Pan:1,FocalLengthField:200},
    travelMs:4000,holdMs:2000,easing:'linear'},
  {name:'Final',camera:{...pose,CameraEast:400,Pan:15,FocalLengthField:400},
    travelMs:3000,holdMs:500,easing:'smoothstep'}
];
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('sequence timeline includes arrivals and holds; endpoints are exact',()=>{
  assert.deepEqual(sequence.timeline(frames).map(x=>[x.arrivalMs,x.departureMs]),
    [[0,1000],[5000,7000],[10000,10500]]);
  assert.equal(sequence.totalMs(frames),10500);
  for(const t of [-100,0,999,1000])assert.deepEqual(sequence.cameraAt(frames,t),pose);
  assert.deepEqual(sequence.cameraAt(frames,5000),frames[1].camera);
  assert.deepEqual(sequence.cameraAt(frames,6999),frames[1].camera);
  assert.deepEqual(sequence.cameraAt(frames,10000),frames[2].camera);
  assert.deepEqual(sequence.cameraAt(frames,999999),frames[2].camera);
});
test('absolute timestamp interpolation crosses angular wrap and supports logarithmic zoom',()=>{
  const mid=sequence.cameraAt(frames,3000); // 1s hold + half 4s travel
  approx(mid.CameraEast,100);approx(mid.Pan,360);approx(mid.FocalLengthField,100);
  const sample=sequence.cameraAt(frames,8500); // next segment mid
  approx(sample.CameraEast,300);
  sequence.cameraAt(frames,10000);
  assert.deepEqual(sequence.cameraAt(frames,8500),sample);
  assert.equal(frames[0].camera.CameraEast,0);
});
test('snapshots are cloned; malformed timelines and mid-transition mode changes are rejected',()=>{
  const normalized=sequence.validate(frames);
  normalized[0].camera.CameraNorth=999;
  assert.equal(frames[0].camera.CameraNorth,0);
  assert.throws(()=>sequence.cameraAt([],1),RangeError);
  assert.throws(()=>sequence.cameraAt(frames,NaN),RangeError);
  for(const invalid of [
    [{...frames[0],travelMs:1},frames[1]],
    [frames[0],{...frames[1],travelMs:0}],
    [frames[0],{...frames[1],holdMs:-2}],
    [frames[0],{...frames[1],easing:'bezier'}],
    [frames[0],{...frames[1],camera:{...frames[1].camera,Nick:91}}],
    [frames[0],{...frames[1],camera:{...frames[1].camera,deviceRatio:2/3}}],
    [frames[0],{...frames[1],camera:{...frames[1].camera,junk:1}}],
    [frames[0],{...frames[1],junk:true}],
    Array.from({length:21},(_,i)=>({...frames[0],travelMs:i?1000:0}))
  ])assert.throws(()=>sequence.validate(invalid));
});
function experiment(keyframes){
  const model={...pose,showModel:1,rEarth:6371000,showGrid:1,DemoText:'Sequence',Description:'',
    NObjects:[1,0],ObjType:[3,3],ObjDist:[1000,2000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[20,20],ObjSizeVar:[0,0]};
  return codec.capture(model,{atmosphere:'standard',occlusionRadius:6371000,
    preset:'custom',resetPreset:'pontchartrain'},compare.preset('standard-vacuum'),
    {mode:'scene',eyeLevel:true,horizon:true,selected:'A',cameraSequence:keyframes});
}
test('sequence persists through experiment JSON, share URL and legacy payloads',()=>{
  const stored=experiment(frames);
  assert.equal(stored.cameraSequence.keyframes.length,3);
  assert.deepEqual(codec.decode(codec.encode(stored)),stored);
  assert.deepEqual(codec.readUrl(new URL(codec.urlWithExperiment('https://example.org/CurvatureModern.html',stored)).search),stored);
  const old=experiment([]);
  assert.equal('cameraSequence' in old,false);
  assert.equal('cameraSequence' in codec.validate(old),false);
  assert.equal(codec.validate({...old,cameraSequence:{keyframes:[]}}).cameraSequence,undefined);
  assert.throws(()=>codec.validate({...old,cameraSequence:{keyframes:[frames[0],{...frames[1],holdMs:1e9}]}}));
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const telemetry=require('../src/camera/ModernCameraTelemetry');
const physicalCamera=require('../src/app/CurvaturePhysicalCamera');
const compare=require('../src/ui/modern/ModernCompareModel');
const interpolator=require('../src/camera/ModernCameraInterpolator');

const base=()=>({showModel:1,rEarth:6371000,rFEarth:10007543,
  Height:100,CameraEast:3000,CameraNorth:4000,
  Pan:32.5,Nick:2,Roll:-6,camViewAngle:Math.PI/3,
  viewcenterHorizon:3,deviceRatio:16/9});
function near(a,b,eps=1e-10){assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);}

test('read-only full camera sample gives local height, signed offsets, arc range and angles',()=>{
  const m=base(),snapshot=structuredClone(m),p=telemetry.measure(m);
  assert.equal(Object.isFrozen(p),true);
  assert.equal(p.geometry,'globe');
  assert.equal(p.heightMeters,100);
  assert.equal(p.eastMeters,3000);
  assert.equal(p.northMeters,4000);
  assert.equal(p.distanceFromOriginMeters,5000);
  assert.equal(p.headingDegrees,32.5);
  assert.equal(p.nickDegrees,2);
  assert.equal(p.pitchDegrees,2);
  assert.equal(p.aimDipDegrees,0);
  assert.equal(p.rollDegrees,-6);
  near(p.fovDegrees,60);
  assert.deepEqual(m,snapshot,'telemetry must not alter the rendered model');
});

test('Globe geometric horizon aim subtracts the physical dip from Nick',()=>{
  const m={...base(),viewcenterHorizon:0};
  const p=telemetry.measure(m);
  const t=m.Height/m.rEarth;
  const dip=Math.atan(Math.sqrt(t)*Math.sqrt(2+t))*180/Math.PI;
  near(p.aimDipDegrees,dip);
  near(p.pitchDegrees,m.Nick-dip);
  assert.notEqual(p.pitchDegrees,p.nickDegrees);
  near(p.aimDipDegrees,physicalCamera.create(m).aimDip*180/Math.PI);
});

test('All four aim modes match physical camera on both Globe and Flat',()=>{
  const globe=base(),fe=Math.atan(globe.Height/globe.rFEarth)*180/Math.PI;
  const dip=telemetry.measure({...globe,viewcenterHorizon:0}).aimDipDegrees;
  const expectedGlobe=[dip,fe,(dip+fe)/2,0];
  const expectedFlat=[0,fe,fe/2,0];
  for(const showModel of [1,2])for(let aim=0;aim<=3;aim++){
    const m={...globe,showModel,viewcenterHorizon:aim};
    const p=telemetry.measure(m);
    near(p.aimDipDegrees,(showModel===1?expectedGlobe:expectedFlat)[aim]);
    near(p.pitchDegrees,m.Nick-p.aimDipDegrees);
    assert.equal(p.geometry,showModel===1?'globe':'flat');
  }
});

test('Distance is ground-arc from origin, not chord, line of sight, or object range',()=>{
  const R=6371000,m={...base(),CameraEast:300000,CameraNorth:400000,Height:1200};
  const p=telemetry.measure(m);
  assert.equal(p.distanceFromOriginMeters,500000);
  assert.notEqual(2*R*Math.sin(500000/(2*R)),p.distanceFromOriginMeters);
  assert.equal(telemetry.measure({...m,showModel:2}).distanceFromOriginMeters,500000);
  assert.equal(telemetry.measure({...m,CameraEast:0,CameraNorth:0}).distanceFromOriginMeters,0);
});

test('Rotation changes heading, pitch and roll but leaves position and height unchanged',()=>{
  const m=base(),start=telemetry.measure(m),rotated=telemetry.measure({...m,Pan:-170,Nick:-4,Roll:90});
  assert.equal(start.distanceFromOriginMeters,rotated.distanceFromOriginMeters);
  assert.equal(start.heightMeters,rotated.heightMeters);
  assert.equal(rotated.headingDegrees,-170,'signed Pan matches the sidebar, no surprise wrap');
  assert.equal(rotated.pitchDegrees,-4);
  assert.equal(rotated.rollDegrees,90);
});

test('Vertical motion changes Height only; horizontal motion keeps Height',()=>{
  const m=base(),a=telemetry.measure(m),up=telemetry.measure({...m,Height:200});
  const east=telemetry.measure({...m,CameraEast:6000});
  assert.equal(up.distanceFromOriginMeters,a.distanceFromOriginMeters);
  assert.equal(up.heightMeters,200);
  assert.equal(east.heightMeters,a.heightMeters);
  assert.equal(east.distanceFromOriginMeters,Math.hypot(6000,4000));
});

test('Eye-level camera telemetry is geometry independent with the same shared pose',()=>{
  const m=base(),g=telemetry.measure(m),f=telemetry.measure({...m,showModel:2,rEarth:100000});
  for(const key of ['heightMeters','eastMeters','northMeters','distanceFromOriginMeters',
    'headingDegrees','nickDegrees','pitchDegrees','aimDipDegrees','rollDegrees','fovDegrees'])
    near(g[key],f[key]);
});

test('Compare clones have matching eye-level telemetry with independent surface types',()=>{
  const m={...base(),viewcenterHorizon:0,Update(){}};
  const pair=compare.pair(m);
  const a=telemetry.measure(pair.A),b=telemetry.measure(pair.B);
  assert.equal(a.geometry,'globe');assert.equal(b.geometry,'flat');
  assert.equal(pair.A.viewcenterHorizon,3);
  assert.equal(pair.B.viewcenterHorizon,3);
  assert.equal(a.pitchDegrees,b.pitchDegrees);
  assert.equal(a.distanceFromOriginMeters,b.distanceFromOriginMeters);
  assert.equal(a.fovDegrees,b.fovDegrees);
});

test('Animation sample after model update has exact time-dependent telemetry',()=>{
  const start={Height:10,CameraEast:0,CameraNorth:0,Pan:0,Nick:0,Roll:0,
    FocalLengthField:100,viewcenterHorizon:3,deviceRatio:1.5};
  const end={...start,Height:110,CameraEast:3000,CameraNorth:4000,
    Pan:90,Nick:-8,Roll:10,FocalLengthField:200};
  const pose=interpolator.cameraAt(start,end,2500,5000,'linear');
  // An AnimationPreview build applies the pose then calls model.Update().
  const model={...base(),...pose,camViewAngle:2*Math.atan(43.2/(2*pose.FocalLengthField))};
  const p=telemetry.measure(model);
  assert.equal(p.heightMeters,60);
  assert.equal(p.distanceFromOriginMeters,2500);
  assert.equal(p.headingDegrees,45);
  assert.equal(p.pitchDegrees,-4);
  near(p.fovDegrees,2*Math.atan(43.2/(2*pose.FocalLengthField))*180/Math.PI);
});

test('FOV reads the updated optical camera value, not a stale focal-length field',()=>{
  const m={...base(),FocalLengthField:500,camViewAngle:Math.PI/6};
  near(telemetry.measure(m).fovDegrees,30);
});

test('Formatting is deterministic and shared between DOM/Canvas consumers',()=>{
  const p=telemetry.measure({...base(),Height:128.4,CameraEast:0,CameraNorth:4820,
    Pan:0.0464,Nick:-4.2,Roll:0,camViewAngle:Math.PI/4});
  const f=telemetry.format(p);
  assert.equal(f.geometry,'globe');
  assert.equal(f.height,'128.4 m');
  assert.equal(f.distance,'4.82 km');
  assert.equal(f.heading,'0.0464°');
  assert.equal(f.pitch,'-4.2°');
  assert.equal(f.fov,'45.0°');
  assert.equal(f.east,'0.00 m');
  assert.equal(Object.isFrozen(f),true);
  assert.deepEqual(telemetry.format(p),f);
});

test('Format preserves signed small offsets, close distances and removes negative zero',()=>{
  assert.equal(telemetry.formatLength(-1234.5),'-1.23 km');
  assert.equal(telemetry.formatLength(-3.14159),'-3.14 m');
  assert.equal(telemetry.formatLength(10),'10.0 m');
  assert.equal(telemetry.formatLength(1000),'1.00 km');
  assert.equal(telemetry.formatLength(-0.000001),'0.00 m');
  assert.equal(telemetry.formatAngle(-0.0121),'-0.0121°');
  assert.equal(telemetry.formatAngle(-0.000001),'0.0000°');
  assert.equal(telemetry.formatAngle(0),'0.0°');
  assert.equal(telemetry.formatAngle(360),'360.0°');
});

test('Invalid or incomplete model is rejected without coercing numerical strings',()=>{
  assert.throws(()=>telemetry.measure(null),TypeError);
  for(const [key,value] of [['showModel',3],['showModel',undefined],['Height',-1],
    ['Height',NaN],['CameraEast',Infinity],['CameraNorth','100'],['Pan',NaN],
    ['Nick',undefined],['Roll',-Infinity],['camViewAngle',0],['camViewAngle',Math.PI]])
    assert.throws(()=>telemetry.measure({...base(),[key]:value}),RangeError,key);
  assert.throws(()=>telemetry.measure({...base(),rEarth:0}),RangeError);
  assert.throws(()=>telemetry.measure({...base(),rFEarth:NaN}),RangeError);
  assert.throws(()=>telemetry.format(null),TypeError);
  assert.throws(()=>telemetry.formatLength(Infinity),RangeError);
  assert.throws(()=>telemetry.formatAngle(NaN),RangeError);
});

test('UMD browser build uses the physical camera global and Modern HTML loads it early',()=>{
  const root={CurvaturePhysicalCamera:physicalCamera};
  const source=fs.readFileSync(path.join(__dirname,'../src/camera/ModernCameraTelemetry.js'),'utf8');
  vm.runInNewContext(source,{globalThis:root});
  const result=root.CurvatureModernCameraTelemetry.measure(base());
  assert.equal(result.distanceFromOriginMeters,5000);
  assert.equal(result.pitchDegrees,2);
  const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
  const code='src/camera/ModernCameraTelemetry.js';
  assert.equal(html.split(code).length,2,'script should be included exactly once');
  assert.ok(html.indexOf('src/app/CurvaturePhysicalCamera.js')<html.indexOf(code));
  assert.ok(html.indexOf(code)<html.indexOf('src/ui/modern/ModernApp.js'));
});

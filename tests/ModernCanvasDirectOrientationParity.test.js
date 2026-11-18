'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const direct=require('../src/renderers/CurvatureCanvasDirectPreview');
const geometry=require('../src/geometry/CurvatureGeometryEngine');
const physicalCamera=require('../src/app/CurvaturePhysicalCamera');
const perspective=require('../src/renderers/CurvaturePerspectivePreview');
const effective=require('../src/optics/OpticalEffectiveRadiusPreview');

function model(){
  const context=vm.createContext({JsgVect3:{
    Norm:a=>a.map(v=>v/Math.hypot(...a)),
    Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    Scale:(a,n)=>a.map(x=>x*n),
    Add:(a,b)=>a.map((v,i)=>v+b[i]),
    ScalarProd:(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0)}});
  vm.runInContext(fs.readFileSync('src/app/CurvatureModel.js','utf8'),context);
  const m=vm.runInContext('new CurveAppClass()',context);
  m.showModel=2;m.Height=12;m.Pan=0;m.Nick=0;m.Roll=0;m.viewcenterHorizon=3;
  m.camViewAngle=10;m.showGrid=0;m.showTangent=0;m.showData=0;
  m.CameraEast=0;m.CameraNorth=0;
  m.ObjType=[3,3];m.NObjects=[1,0];m.ObjDist=[1700,0];m.ObjSidePos=[6,0];
  m.Update();return m;
}
function canvas(){
  const strokes=[];let points=[];
  const ctx={save(){},restore(){},setTransform(){},clearRect(){},fillRect(){},
    beginPath(){points=[];},moveTo(x,y){points.push([x,y]);},
    lineTo(x,y){points.push([x,y]);},closePath(){},fill(){},
    stroke(){strokes.push(points.slice());}};
  return {width:1200,height:900,getContext(){return ctx;},strokes};
}
function closePoint(actual,expected,label){
  assert.ok(actual&&expected,`${label}: missing visible endpoint`);
  for(let i=0;i<2;i++)assert.ok(Math.abs(actual[i]-expected[i])<1e-6,
    `${label}: axis ${i}: Canvas Direct ${actual[i]} vs physically authored ${expected[i]}`);
}
// The physical optics painter uses a continuous east/north frame for Flat,
// unlike Legacy's mirrored Flat drawing convention. Check actual painted
// pixels, rather than only asserting a geometry-option flag.
const poses=[
  {Pan:0,Nick:0,Roll:0,CameraEast:0,CameraNorth:0},
  {Pan:1.2,Nick:-0.4,Roll:3,CameraEast:20,CameraNorth:90},
  {Pan:-1.1,Nick:0.2,Roll:-2.5,CameraEast:-12,CameraNorth:25}
];
for(const kind of ['vacuum','standard','inverse-temperature']){
  test(`Flat Canvas Direct matches physical object handedness during Pan/Nick (${kind})`,()=>{
    for(const pose of poses){
    const m=model();Object.assign(m,pose);m.Update();
    const options={atmosphere:kind,occlusionRadius:6371000,
      inverseProfile:{source:'standard',weight:1},canvasDirectOptions:{thinOutlines:true}};
    const p=effective.canvasDirectParameters(m,options),c=canvas();
    const camera={...physicalCamera.create(m),screenSize:2,objectZExtend:0,zoom:1,near:.001};
    const result=direct.create().paint(c,camera,m,options);
    assert.equal(result.sourceObjects,1);
    assert.ok(c.strokes.length>0,'a real object outline is visible');
    const source={...m,Height:0};
    const physical=geometry.createObjectSequenceScene(source,0,false,
      {opticsNeutral:true,physicalSurface:true,curvature:0});
    const first=physical.primitives[0];
    const vertices=first.points.map(v=>direct.flatRefractionPoint(v[0]-m.CameraEast,v[1]-m.CameraNorth,v[2],m.Height,
      p.effectiveCurvature));
    const expected=perspective.project({primitives:[{...first,points:vertices}]},camera,c.width,c.height);
    assert.ok(expected.segments.length>0,'physical geometry is in viewport');
    closePoint(c.strokes[0][0],expected.segments[0].points[0],'first vertex');
    closePoint(c.strokes[0][1],expected.segments[0].points[1],'second vertex');
    }
  });
}

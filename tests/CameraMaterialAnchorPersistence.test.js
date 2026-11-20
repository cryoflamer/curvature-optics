'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const editor=require('../src/ui/modern/ModernPhotoCalibrationEditor');
const resolver=require('../src/calibration/CameraMaterialAnchorResolver');
const engine=require('../src/geometry/CurvatureGeometryEngine');
const ear=require('../src/geometry/CurvatureEarClip');
const m={showModel:1,rEarth:6371000,rFEarth:10007543,geometryRadius:6371000,
  viewcenterHorizon:3,Height:12,CameraEast:0,CameraNorth:0,Pan:0,Nick:0,Roll:0,FocalLengthField:70,
  ObjType:[6,3],NObjects:[4,0],ObjDist:[1000,0],ObjDeltaDist:[200,100],ObjSize:[30,10],ObjSizeVar:[0,0],
  ObjSideType:[0,0],ObjSidePos:[30,0],ObjSideVar:[0,0],ObjSizeType:[0,0]};
const physics={atmosphere:'vacuum'},W=100,H=80,free=['Pan'],copy=x=>JSON.parse(JSON.stringify(x));
function fixture(){
  const r=resolver.create(m),ps=engine.createObjectSequenceScene({...m,Height:0},0,true,
    {opticsNeutral:true,physicalSurface:true,curvature:1/m.rEarth}).primitives;
  const i=ps.findIndex(p=>p.metadata.landmarkOwner.kind==='span'&&ear.indexedTriangles(p).triangles.length),p=ps[i];
  const tri=ear.indexedTriangles(p).triangles[0];
  const l=(kind,indices,weights)=>({id:'pair-'+kind,anchor:{kind,owner:p.metadata.landmarkOwner,primitive:p.metadata.landmarkPrimitive,signature:r.signature(0),indices,weights}});
  const rows=[editor.pair({id:'b0:p'+i+':v0',bank:0,objectType:6,primitive:i,vertex:0},[12,13],W,H),
    editor.pair(l('vertex',[1],[1]),[20,30],W,H),
    editor.pair(l('edge',[0,1],[.4,.6]),[40,50],W,H,2),
    editor.pair(l('surface',tri,[.2,.3,.5]),[60,70],W,H,3,false)];
  const input={format:'curvature-photo-calibration',version:3,scene:{model:m,physics},
    referenceImage:{original:{width:W,height:H}},observations:rows,
    fit:{method:'canvas-direct',maxIterations:80,freeParameters:free,result:null}};
  return {input,rows};
}
const validate=x=>editor.validateExperiment(x,r=>r);
test('v3 mixed material experiment canonical round trip retains identities, roles, pixels and weights',()=>{
  const {input,rows}=fixture(),before=JSON.stringify(input);
  const out=validate(copy(input));assert.equal(out.version,3);assert.deepEqual(out.observations,rows);
  assert.deepEqual(validate(copy(out)),out);assert.equal(JSON.stringify(input),before);
  assert.equal(validate({...input,version:2,observations:[rows[0]]}).version,2);
  assert.throws(()=>validate({...input,version:2}),/version 3/);
  const reversed=copy(input);const a=reversed.observations[2].landmark.anchor;a.indices.reverse();a.weights.reverse();
  assert.deepEqual(validate(reversed).observations,rows);
  assert.notEqual(out.observations[2].landmark.anchor,rows[2].landmark.anchor);
});
test('draft row normalization shares topology and version gate',()=>{
  const {rows}=fixture();
  assert.deepEqual(editor.observationRows(copy(rows),W,H,true,m),rows);
  assert.throws(()=>editor.observationRows(rows,W,H,false,m),/version 3/);
  assert.throws(()=>editor.observationRows(rows,W,H,true,{...m,ObjDist:[1001,0]}),/Stale/);
  assert.throws(()=>editor.observationRows(rows,W,H,true,{...m,showModel:2}),/Globe/);
});
test('invalid material topology and duplicate identity are rejected before import',()=>{
  const {input,rows}=fixture();
  for(const mutate of [x=>x.observations[2].landmark.anchor.indices=[0,2],
    x=>x.observations[3].landmark.anchor.signature='bank-v1:sha256:'+'0'.repeat(64),
    x=>x.observations[2].kind='surface',x=>x.observations[3].landmark.id=rows[2].landmark.id,
    x=>x.observations.push({...rows[2],landmark:{...rows[2].landmark,id:'duplicate'}})]){
    const x=copy(input);mutate(x);assert.throws(()=>validate(x));
  }
  assert.throws(()=>editor.upsert(rows,{...rows[2],landmark:{...rows[2].landmark,id:'duplicate'}}),/already paired/);
});
test('material result binding rejects same-ID edits, held-out changes and scene changes',()=>{
  const {input,rows}=fixture(),train=editor.fitRows(rows);
  const result={pose:{...m},initialRmsPx:0,evaluations:1,acceptedSteps:0,
    materialBinding:editor.fitBinding(rows,free,m,physics,W,H),
    evaluation:{valid:true,rmsPx:0,weightedRmsPx:0,cost:0,
      points:train.map(r=>({id:r.landmark.id,weight:r.weight,observed:r.pixel.slice(),predicted:r.pixel.slice()}))}};
  input.fit.result=result;assert.deepEqual(validate(copy(input)).fit.result,result);
  for(const mutate of [x=>x.observations[2].landmark.anchor.weights=[.5,.5],
    x=>x.observations[3].pixel[0]++,x=>x.scene.physics.atmosphere='standard',
    x=>x.scene.model.Pan+=.1,x=>delete x.fit.result.materialBinding]){
    const x=copy(input);mutate(x);assert.throws(()=>validate(x),/Stored fit result/);
  }
});

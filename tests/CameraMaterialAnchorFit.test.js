'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fit=require('../src/calibration/CameraPhysicalFit');
const bridge=require('../src/calibration/CameraPhysicalPose');
const projection=require('../src/calibration/CameraLandmarkProjection');
const resolver=require('../src/calibration/CameraMaterialAnchorResolver');
const engine=require('../src/geometry/CurvatureGeometryEngine');
const ear=require('../src/geometry/CurvatureEarClip');
const translation=require('../src/geometry/CurvatureCameraTranslation');
const editor=require('../src/ui/modern/ModernPhotoCalibrationEditor');
const width=1176,height=791;
const m={showModel:1,rEarth:6371000,rFEarth:10007543,geometryRadius:6371000,
  viewcenterHorizon:3,Height:12,CameraEast:0,CameraNorth:0,Pan:0,Nick:0,Roll:0,FocalLengthField:70,
  ObjType:[6,3],NObjects:[4,0],ObjDist:[1000,0],ObjDeltaDist:[200,100],ObjSize:[30,10],ObjSizeVar:[0,0],
  ObjSideType:[0,0],ObjSidePos:[30,0],ObjSideVar:[0,0],ObjSizeType:[0,0]};
const options={width,height,method:'canvas-direct',atmosphere:'standard'};
function fixture(model=m,opts=options){
  const r=resolver.create(model),ps=engine.createObjectSequenceScene({...model,Height:0},0,true,
    {opticsNeutral:true,physicalSurface:true,curvature:1/model.rEarth}).primitives;
  const s=projection.create(model,bridge.photoCamera(model,width,height),width,height,opts);
  const obs=[];
  for(const [i,p] of ps.entries()){
    if(p.metadata.landmarkOwner.kind!=='span')continue;
    const tri=ear.indexedTriangles(p).triangles[0];assert.ok(tri);
    const legacy={id:'old-'+i,bank:0,objectType:6,primitive:i,vertex:0};
    const v=r.upgradeLegacy({...legacy,id:'vertex-'+i});
    const a=(kind,indices,weights)=>({id:kind+'-'+i,anchor:{kind,owner:p.metadata.landmarkOwner,
      primitive:p.metadata.landmarkPrimitive,signature:r.signature(0),indices,weights}});
    for(const [kind,landmark] of [['vertex',legacy],['vertex',v],['edge',a('edge',[1,2],[.3,.7])],
      ['surface',a('surface',tri,[.2,.3,.5])]]){
      const q=s[kind](landmark);assert.equal(q.status,'visible',JSON.stringify(q));
      obs.push({kind,landmark,pixel:q.pixel,weight:1+obs.length%3,included:true});
    }
  }
  assert.ok(obs.length>=12);return {obs,r};
}
test('mixed legacy and material observations refine a known camera using unchanged weighted objective',()=>{
  const {obs}=fixture(),before=JSON.stringify(obs);
  const initial={...m,CameraNorth:35,Height:15,Pan:.35,Nick:.2};
  const freeParameters=['CameraNorth','Height','Pan','Nick'];
  const r=fit.fit(m,initial,obs,{...options,freeParameters});
  assert.ok(r.evaluation.valid,r.reason);assert.ok(r.evaluation.rmsPx<1e-5,JSON.stringify({rms:r.evaluation.rmsPx,status:r.status,pose:r.pose}));
  for(const k of freeParameters)assert.ok(Math.abs(r.pose[k]-m[k])<1e-3,k+': '+r.pose[k]);
  assert.deepEqual(r.evaluation.points.map(p=>p.id),obs.map(o=>o.landmark.id));
  assert.equal(JSON.stringify(obs),before);
  const d=fit.diagnose(m,m,obs,{...options,freeParameters});
  assert.equal(d.rank,freeParameters.length);
});
test('material horizontal ranges use resolved physical geometry and feed the median scale',()=>{
  const {obs,r}=fixture(),rows=obs.filter(o=>o.landmark.anchor),basis=translation.frame(m.CameraEast,m.CameraNorth,m.Height,1/m.rEarth);
  const expected=rows.map(o=>{const w=r.resolve(o.landmark.anchor).point;
    const q=translation.pointAt([w[0],w[1],w[2]-m.Height],basis);return Math.hypot(q[0],q[1]);});
  const context=projection.createMaterialContext(m);
  assert.deepEqual(projection.authoredMaterialRanges(m,m,rows,context),expected);
  const sorted=expected.slice().sort((a,b)=>a-b);
  const d=fit.diagnose(m,m,rows,{...options,freeParameters:['CameraNorth']});
  assert.equal(d.parameters[0].scale,Math.max(1,sorted[Math.floor(sorted.length/2)]*.1));
  const override=fit.diagnose(m,m,rows,{...options,freeParameters:['CameraNorth'],scales:{CameraNorth:23}});
  assert.equal(override.parameters[0].scale,23);
});
test('material fit context matches pose-specific uncached projections without stale target geometry',()=>{
  const {obs}=fixture(),rows=obs.filter(o=>o.landmark.anchor),context=projection.createMaterialContext(m);
  for(const method of ['canvas-direct','accurate'])for(const Height of [12,16,12]){
    const p={...m,Height,Pan:.2,CameraNorth:20},o={...options,method},cam=bridge.photoCamera(p,width,height);
    const a=projection.create(p,cam,width,height,o),b=projection.create(p,cam,width,height,{...o,materialContext:context});
    for(const row of rows)assert.deepEqual(b[row.kind](row.landmark),a[row.kind](row.landmark));
  }
  const changed={...m,ObjDist:[1100,0]};
  assert.throws(()=>projection.create(changed,bridge.photoCamera(changed,width,height),width,height,
    {...options,materialContext:context}),/context/);
});
test('stale material topology invalidates the objective even when horizontal scaling is enabled',()=>{
  const {obs}=fixture(),row=obs.find(o=>o.kind==='surface');
  const bad={...row,landmark:{...row.landmark,anchor:{...row.landmark.anchor,signature:'bank-v1:sha256:'+'0'.repeat(64)}}};
  const input=[obs[0],bad],e=fit.evaluate(m,m,input,options);
  assert.equal(e.valid,false);assert.equal(e.points[1].status,'invalid_anchor');assert.equal(e.residuals,null);
  const r=fit.fit(m,m,input,{...options,freeParameters:['CameraNorth']});
  assert.equal(r.status,'invalid_initial');assert.equal(r.evaluation.points[1].status,'invalid_anchor');
  const d=fit.diagnose(m,m,input,{...options,freeParameters:['CameraNorth']});
  assert.equal(d.status,'invalid_pose');
  const invalid={...row,landmark:{...row.landmark,anchor:{...row.landmark.anchor,weights:[1,1,1]}}};
  assert.throws(()=>fit.evaluate(m,m,[invalid],options),/weights/);
  assert.throws(()=>fit.evaluate(m,m,[row,row],options),/duplicate/);
});
test('existing Fit/Validation boundary and residual diagnostics support mixed material kinds',()=>{
  const {obs}=fixture(),rows=obs.map((o,i)=>({...o,included:i%3!==0}));
  const held=rows.filter(o=>!o.included),train=editor.fitRows(rows);
  held.forEach(o=>{o.pixel=[o.pixel[0]+3,o.pixel[1]+4]});
  const r=fit.fit(m,m,train,{...options,freeParameters:[]});
  assert.equal(r.status,'fixed');assert.ok(r.evaluation.rmsPx<1e-8);
  const all=fit.evaluate(m,m,rows,options);
  const diagnostics=editor.residualRows(rows,all.points,all.points);
  const stats=editor.residualStatistics(diagnostics);
  assert.equal(stats.fit.count,train.length);assert.equal(stats.validation.count,held.length);
  assert.ok(stats.fit.rms<1e-8);assert.ok(Math.abs(stats.validation.rms-5)<1e-8);
});

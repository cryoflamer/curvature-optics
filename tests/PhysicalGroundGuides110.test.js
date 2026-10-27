'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ground=require('../src/optics/CurvaturePhysicalGroundGuides');
const sceneOptics=require('../src/optics/CurvaturePhysicalSceneOptics');
const contract=require('../src/scene/CurvatureSceneContract');
const R=6371000,eye=15;
const base={rEarth:R,Height:eye,GlobeGridCol:'blue',FEGridCol:'blue'};
function create(geometry,atmosphere){return ground.create({model:base,geometry,atmosphere,occlusionRadius:R,step:2000,maxDistance:30000});}
const normal=(v)=>Math.hypot(...v);
test('110: vacuum Globe horizon is geometric, Standard horizon is farther and optically lower',()=>{
  const vac=create('globe','vacuum'),std=create('globe','standard');
  const expected=R*Math.acos(R/(R+eye));
  assert.ok(Math.abs(vac.horizonDistance-expected)<.01);
  assert.ok(std.horizonDistance>vac.horizonDistance+1000);
  assert.ok(std.horizonDistance<vac.horizonDistance+5000);
  const h=std.transform([]);
  assert.equal(h.length,128);
  assert.ok(h.every(p=>p.metadata.kind==='physical-horizon'));
  assert.ok(h.every(p=>p.points.every(q=>Math.abs(normal(q)-1000)<1e-8)));
  const avg=v=>v.reduce((a,p)=>a+p.points[0][2],0)/v.length;
  assert.ok(Math.abs(avg(std.transform([]))-avg(vac.transform([])))>0.01);
});
test('110: inverse-spherical Flat surface horizon matches spherical vacuum distance',()=>{
  const inverse=create('flat','inverse-spherical');
  assert.ok(Math.abs(inverse.horizonDistance-R*Math.acos(R/(R+eye)))<.1);
  assert.ok(inverse.transform([]).some(p=>p.metadata.kind==='physical-horizon'));
  assert.equal(create('flat','vacuum').horizonDistance,null);
  assert.equal(create('flat','standard').horizonDistance,null);
});
test('110: ground guide positions obey optical horizon and do not reuse geometric horizon',()=>{
  const gd=create('globe','standard'),h=gd.horizonDistance;
  function groundAt(d){return [0,R*Math.sin(d/R),R*Math.cos(d/R)-R-eye];}
  const primitives=[{type:'line',points:[groundAt(100),groundAt(3000)],style:{stroke:'green'},metadata:{kind:'grid-ray'}},
    {type:'line',points:[groundAt(h+3000),groundAt(h+6000)],style:{stroke:'red'},metadata:{kind:'grid-ray'}},
    {type:'polygon',points:[[0,100,-eye],[1,100,-eye],[0,101,-eye]],style:{stroke:'blue'},metadata:{kind:'globe-horizon'}}];
  const out=gd.transform(primitives);
  assert.ok(out.some(p=>p.metadata.kind==='grid-ray'));
  assert.ok(!out.some(p=>p.style.stroke==='red'));
  assert.ok(!out.some(p=>p.metadata.kind==='globe-horizon'));
  assert.ok(out.some(p=>p.metadata.kind==='physical-horizon'));
});
test('110: scene adapter passes physical guides into shared renderer and caches them',()=>{
  const m={...base,showModel:1,geometryRadius:R,ObjType:[3,3],NObjects:[0,0],ObjDist:[500,2500],ObjDeltaDist:[300,300],ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSideType:[0,0],ObjSize:[20,20],ObjSizeVar:[0,0],ObjSizeType:[0,0]};
  const guides=contract.createScene('legacy',[{type:'line',points:[[0,100,R*Math.cos(100/R)-R-eye],[0,1000,R*Math.cos(1000/R)-R-eye]],style:{stroke:'blue'},metadata:{kind:'grid-ray'}}]);
  const input={scene:contract.createScene('legacy',guides.primitives,{composition:'optics-neutral-main'}),ranges:[{name:'surface-guides',role:'visual-aid',start:0,end:1,count:1}]};
  const session=sceneOptics.create();
  const first=session.transform(input,m,{atmosphere:'standard'});
  assert.ok(first.stats.guideSegments>128);
  assert.ok(first.stats.groundHorizon>14000);
  assert.equal(first.composition.scene.metadata.composition,'physical-projected-main');
  assert.ok(first.composition.scene.primitives.some(p=>p.metadata.kind==='physical-horizon'));
  assert.ok(first.composition.scene.primitives.some(p=>p.metadata.kind==='grid-ray'));
  assert.ok(first.composition.scene.primitives.every(p=>p.metadata.physicalGround));
  const again=session.transform(input,m,{atmosphere:'standard'});
  assert.equal(again.reused,true);
  assert.equal(again.stats.guideSegments,first.stats.guideSegments);
  const changed=session.transform(input,{...m,showGrid:2},{atmosphere:'standard'});
  assert.equal(changed.reused,false,'showGrid must invalidate physical guide geometry');
});
test('110: legacy Latin-1 page cannot display raw UTF-8 middle dot',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../CurvatureApp.html'),'utf8');
  const runtime=fs.readFileSync(path.resolve(__dirname,'../src/app/CurvatureAppRuntime.js'),'utf8');
  assert.match(html,/charset="iso-8859-1"/);
  assert.match(html,/Physical optics &middot; shared scene/);
  assert.doesNotMatch(runtime,/pieces\.join\(' · '\)/);
  assert.match(runtime,/Physical ground grid\/horizon/);
});

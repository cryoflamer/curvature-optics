'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tower=require('../src/optics/OpticalTowerSilhouette');
const shared=require('../src/optics/OpticalSharedRayField');
const engine=require('../src/geometry/CurvatureGeometryEngine');
const R=6371000, OBS=15;
function sphere(d,h,R0=R) {
  return [(R0+h)*Math.sin(d/R0),0,(R0+h)*Math.cos(d/R0)-R0-OBS];
}
function horizontal(d,h){return [0,d,h-OBS];}
function line(a,b){return [{type:'line',points:[a,b]}];}
function field(geometry,atmosphere='vacuum') {
  return shared.create({geometry,atmosphere,observerHeight:OBS,radius:R,
    ...(atmosphere==='inverse-spherical'?{profileOptions:{occlusionRadius:R}}:{}),
    distances:[1000,15000,35000,50000],heights:[0,10,30,80],step:500,
    angleTolerance:2e-5});
}
function project(points,geometry='globe',atmosphere='vacuum',options={}) {
  return tower.projectPrimitives({primitives:points,field:field(geometry,atmosphere),
    geometry,radius:R,observerHeight:OBS,angularTolerance:1e-5,...options});
}
function globeHorizon(h){return R*Math.acos(R/(R+h));}
function flatHorizon(h){return R*Math.acos(R/(R+h));}
function independentVisibility(p){
  const observer=[0,0,0],centre=[0,0,-R-OBS];
  const v=p.map(x=>x),w=observer.map((x,i)=>x-centre[i]);
  const t=Math.max(0,Math.min(1,-w.reduce((s,x,i)=>s+x*v[i],0)/v.reduce((s,x)=>s+x*x,0)));
  const distance=Math.hypot(...w.map((x,i)=>x+t*v[i]));
  return distance>=R-1e-4;
}
function model(){return {geometryRadius:R,Height:OBS,ObjType:[3,3],NObjects:[1,1],
  ObjDist:[5000,6000],ObjDeltaDist:[100,100],ObjSidePos:[0,0],ObjSideVar:[0,0],
  ObjSideType:[0,0],ObjSize:[35,35],ObjSizeVar:[0,0],ObjSizeType:[0,0]};}

test('106: world coordinates map to consistent flat range/height and Globe arc/altitude',()=>{
  const point=horizontal(5000,23);
  const flat=tower.coordinate(point,'flat',R,OBS);
  assert.ok(Math.abs(flat.distance-5000)<1e-8);
  assert.equal(flat.height,23);
  const globe=tower.coordinate(sphere(25000,40),'globe',R,OBS);
  assert.ok(Math.abs(globe.distance-25000)<1e-6);
  assert.ok(Math.abs(globe.height-40)<1e-6);
  assert.ok(Math.abs(globe.azimuth-Math.PI/2)<1e-14);
});

test('106: fully visible tower line is projected to angular coordinates without an occlusion mask',()=>{
  const a=horizontal(5000,10),b=horizontal(5000,30);
  const original=line(a,b);
  const result=project(original,'flat');
  assert.ok(result.segments.length>=1);
  assert.equal(result.unresolved.length,0);
  assert.equal(result.stats.hiddenLeaves,0);
  for(const piece of result.segments){
    assert.equal(piece.visibility,'visible');
    assert.ok(piece.points.every(p=>p.length===2&&p.every(Number.isFinite)));
    assert.ok(piece.points.every(p=>Math.abs(p[0])<1e-13));
    for(let i=0;i<2;i++) {
      const originalPoint=piece.world[i];
      assert.ok(Math.abs(piece.points[i][1]-Math.atan2(originalPoint[2],5000))<1e-10);
    }
  }
  assert.deepEqual(original,line(a,b));
});

test('106: Globe lower segment is clipped near independently calculated geometric visibility threshold',()=>{
  const d=25000;
  const result=project(line(sphere(d,0),sphere(d,40)));
  assert.ok(result.stats.visiblePieces>0);
  assert.ok(result.stats.hiddenLeaves>0);
  // The narrow tangent boundary can remain intentionally unresolved.
  assert.ok(result.unresolved.length<=2);
  const heights=result.segments.flatMap(piece=>piece.world.map(p=>tower.coordinate(p,'globe',R,OBS).height));
  assert.ok(heights.every(h=>h>=0 && Number.isFinite(h)));
  assert.ok(result.segments.every(piece=>piece.world.every(independentVisibility)));
  const threshold=(function(){let lo=0,hi=40;for(let i=0;i<45;i++){
    const mid=(lo+hi)/2;if(globeHorizon(OBS)+globeHorizon(mid)>=d)hi=mid;else lo=mid;
  }return hi;})();
  assert.ok(Math.min(...heights)>threshold-0.25);
  assert.ok(Math.min(...heights)<threshold+0.25);
});

test('106: Globe object wholly below the horizon produces no visible outline pieces',()=>{
  const result=project(line(sphere(40000,0),sphere(40000,20)));
  assert.equal(result.segments.length,0);
  assert.ok(result.stats.hiddenLeaves>0);
});

test('106: inverse-spherical Flat profile clips the same grazing-distance law',()=>{
  const d=30000;
  const result=project(line(horizontal(d,0),horizontal(d,45)),'flat','inverse-spherical');
  assert.ok(result.segments.length>0);
  assert.ok(result.stats.hiddenLeaves>0);
  const heights=result.segments.flatMap(s=>s.world.map(p=>p[2]+OBS));
  let lo=0,hi=45;
  for(let i=0;i<45;i++){
    const h=(lo+hi)/2;
    if(flatHorizon(OBS)+flatHorizon(h)>=d)hi=h;else lo=h;
  }
  assert.ok(Math.min(...heights)>hi-0.25 && Math.min(...heights)<hi+0.25,
    `${Math.min(...heights)} vs ${hi}`);
});

test('106: solver_failed and indeterminate do not generate falsely visible segments',()=>{
  for(const status of ['solver_failed','indeterminate']){
    const result=tower.projectPrimitives({geometry:'flat',radius:R,observerHeight:OBS,
      field:{sample:()=>({status})},primitives:line(horizontal(5000,0),horizontal(5000,10))});
    assert.equal(result.segments.length,0);
    assert.ok(result.stats.unresolvedLeaves>0);
    assert.ok(result.unresolved.length>0);
  }
});

test('106: points below opaque ground never request a ray solve',()=>{
  let solves=0;
  const result=tower.projectPrimitives({geometry:'flat',radius:R,observerHeight:OBS,
    field:{sample:()=>{solves++;return {status:'visible',angle:0};}},
    primitives:line(horizontal(2000,-8),horizontal(2000,-2))});
  assert.equal(solves,0);
  assert.equal(result.segments.length,0);
});

test('106: each engine tower variant yields real projected edge segments for both banks',()=>{
  const m=model();
  const f=shared.create({geometry:'flat',observerHeight:OBS,atmosphere:'vacuum',
    distances:[4000,7000],heights:[0,40],step:300,angleTolerance:2e-5});
  const result=tower.projectTowerScene({model:m,field:f,geometry:'flat'});
  assert.equal(result.towers,2);
  assert.equal(result.primitives,engine.localTowerType1().length+engine.localTowerType2().length);
  assert.ok(result.segments.length>30);
  assert.deepEqual(new Set(result.segments.map(s=>s.source.tower.bank)),new Set([0,1]));
  assert.ok(result.segments.every(s=>s.source.tower.sequenceIndex===0));
  assert.equal(result.unresolved.length,0);
});

test('106: no implicit model radius or observer-height mismatches are allowed',()=>{
  const m=model(),f={sample:()=>({status:'visible',angle:0})};
  assert.throws(()=>tower.projectTowerScene({model:m,geometry:'flat',field:f,radius:R/2}),/radius must match/);
  assert.throws(()=>tower.projectTowerScene({model:m,geometry:'flat',field:f,observerHeight:42}),/height must match/);
  assert.throws(()=>tower.projectTowerScene({model:m,geometry:'flat',field:f,banks:[0,0]}),/distinct tower banks/);
  assert.throws(()=>tower.projectPrimitives({geometry:'flat',radius:R,observerHeight:OBS,
    primitives:line([0,0,NaN],[0,1,0]),field:f}),/3D line\/polygon/);
});

test('106: projected polygon edges are closed once and filled foundations are only outlines',()=>{
  const m=model(),entry=engine.towerSequence(m,1,false)[0];
  const foundation=entry.scene.primitives.find(p=>p.mode===3);
  const result=project([foundation],'flat');
  assert.ok(result.stats.edges>=4);
  assert.ok(result.segments.length>0);
  assert.ok(result.scope.includes('no polygon fills'));
  assert.ok(result.segments.every(s=>s.source.mode===3));
});

test('106: a hidden midpoint cannot be bridged by two visible endpoints',()=>{
  const physical={sample:(_d,h)=>({status:h>12&&h<18?'blocked':'visible',
    angle:Math.atan2(h-OBS,5000),method:'exact'})};
  const result=tower.projectPrimitives({geometry:'flat',radius:R,observerHeight:OBS,
    field:physical,primitives:line(horizontal(5000,5),horizontal(5000,25)),
    minimumDepth:2,boundaryTolerance:0.025});
  assert.ok(result.segments.length>0);
  assert.ok(result.stats.hiddenLeaves>0);
  assert.ok(result.segments.every(seg=>seg.world.every(p=>p[2]+OBS<=12||p[2]+OBS>=18)));
  assert.ok(result.segments.every(seg=>Math.abs(seg.world[1][2]-seg.world[0][2])<10));
});

test('106: visible island is found even when both edge endpoints are blocked',()=>{
  const artificial={sample:(_d,h)=>({status:h>=12&&h<=18?'visible':'blocked',
    angle:Math.atan2(h-OBS,5000),method:'exact'})};
  const result=tower.projectPrimitives({geometry:'flat',radius:R,observerHeight:OBS,
    field:artificial,primitives:line(horizontal(5000,5),horizontal(5000,25)),minimumDepth:2});
  assert.ok(result.segments.length>0);
  assert.ok(result.segments.every(seg=>seg.world.every(p=>p[2]+OBS>=12&&p[2]+OBS<=18)));
});

test('106: exhausted subdivision depth does not silently accept excessive angular error',()=>{
  const nonlinear={sample:(_d,h)=>({status:'visible',angle:0.01*h*h,method:'exact'})};
  const result=tower.projectPrimitives({geometry:'flat',radius:R,observerHeight:OBS,
    field:nonlinear,primitives:line(horizontal(5000,0),horizontal(5000,20)),
    angularTolerance:1e-10,minimumDepth:0,maximumDepth:2});
  assert.equal(result.segments.length,0);
  assert.ok(result.stats.depthLimitedLeaves>0);
  assert.ok(result.unresolved.length>0);
});

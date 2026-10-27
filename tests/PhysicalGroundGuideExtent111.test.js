'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const ground=require('../src/optics/CurvaturePhysicalGroundGuides');
const geometry=require('../src/geometry/CurvatureGeometryEngine');
const compose=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const R=6371000,eye=15;
const m={rEarth:R,rFEarth:10007543,Height:eye,showGrid:1,
  FEGridCol:'gray',FEEqCol:'blue',GlobeGridCol:'blue'};
function flat(kind='standard',maxDistance=100000){return ground.create({model:m,geometry:'flat',
  atmosphere:kind,occlusionRadius:R,step:2000,maxDistance});}
const line=(a,b)=>({type:'line',points:[a,b],style:{stroke:'blue'},metadata:{kind:'grid-ray'}});
test('111: Flat standard distant lines and circles are culled before exact ray shooting',()=>{
  const g=flat(),source=geometry.flatSurfaceGuides(m).primitives;
  const before=g.solves(),out=g.transform(source);
  const used=g.solves()-before;
  assert.equal(g.horizonDistance,null,'presentation culling is not a physical horizon');
  assert.ok(g.cullingStats().skippedEdges>0,'far rings are removed');
  assert.ok(g.cullingStats().clippedEdges>0,'radial spokes are clipped');
  assert.ok(used<100,'must not integrate thousands of points past the field');
  assert.ok(out.length>0,'near guides survive');
  assert.ok(out.every(p=>p.points.every(q=>q.every(Number.isFinite))));
});
test('111: a chord intersecting the drawing disk survives even when both endpoints are outside',()=>{
  const g=flat('vacuum',1000);
  const out=g.transform([line([-2000,200,-eye],[2000,200,-eye])]);
  assert.ok(out.length>0);
  assert.ok(g.cullingStats().clippedEdges>0);
  assert.equal(g.horizonDistance,null);
  assert.ok(out.every(p=>p.metadata.physicalGround));
});
test('111: out-of-range lines are omitted without inventing a Flat Standard horizon',()=>{
  const g=flat('standard',2000),before=g.solves();
  assert.deepEqual(g.transform([line([5000,5000,-eye],[9000,9000,-eye])]),[]);
  assert.equal(g.solves(),before);
  assert.equal(g.horizonDistance,null);
});
test('111: Flat vacuum and engineered finite horizon remain physically distinct',()=>{
  const vac=flat('vacuum',40000),inv=flat('inverse-spherical',40000);
  assert.equal(vac.horizonDistance,null);
  assert.ok(Math.abs(inv.horizonDistance-R*Math.acos(R/(R+eye)))<.2);
  assert.ok(inv.transform([]).some(p=>p.metadata.kind==='physical-horizon'));
  assert.ok(!vac.transform([]).some(p=>p.metadata.kind==='physical-horizon'));
});
test('111: complete Flat Standard scene does not lose object groups when guide rendering is bounded',()=>{
  const full={...m,showModel:2,geometryRadius:R,ObjType:[3,3],NObjects:[2,1],
    ObjDist:[50,2500],ObjDeltaDist:[300,300],ObjSidePos:[0,0],ObjSideVar:[0,0],
    ObjSideType:[0,0],ObjSize:[23,64],ObjSizeVar:[0,0],ObjSizeType:[0,0],
    hDisk:R/2,aDip:.065,aDelta:.025};
  const input=compose.composeOpticalMain(full,false);
  const result=optics.create().transform(input,full,{atmosphere:'standard'});
  assert.ok(result.stats.perGroup.length===2);
  assert.ok(result.stats.perGroup.every(x=>x.visibleSegments>0));
  assert.equal(result.stats.groundHorizon,null);
  assert.ok(result.stats.guideSolves<200);
});

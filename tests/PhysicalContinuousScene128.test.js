'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {model}=require('../tools/benchmark-adaptive-prism-112');
const world=require('../src/geometry/CurvaturePhysicalWorldGeometry');
const surface=require('../src/geometry/CurvatureSurfaceGeometry');
const engine=require('../src/geometry/CurvatureGeometryEngine');
const compose=require('../src/scene/CurvatureIndependentComposition');
const ground=require('../src/optics/CurvaturePhysicalGroundGuides');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const targets=require('../src/optics/OpticalTargetProjection');
const camera=require('../src/app/CurvaturePhysicalCamera');
const ctrl=require('../src/app/CurvaturePhysicalCurvature');
const nearly=(a,b,tol,message)=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tol,
  `${message||'mismatch'}: ${a} vs ${b}, tolerance ${tol}`);
function state(radius=6371000,flat=false,n=85){
 const m=model(n,flat?'flat':'globe');m.rEarth=radius;m.geometryRadius=radius;
 m.GlobeGridCol='blue';m.FEGridCol='gray';m.viewcenterHorizon=3;
 m.camViewAngle=1.05408*Math.PI/180;m.deviceRatio=1.5;m.Pan=0.0464;m.Nick=0.0121;m.Roll=0;
 return m;
}
const physical=m=>compose.composeOpticalMain(m,m.showModel===1,{physicalWorld:true});
const objects=c=>c.ranges.filter(r=>r.role==='objects').flatMap(r=>c.scene.primitives.slice(r.start,r.end));
const guides=c=>c.scene.primitives.slice(0,c.ranges[0].end);
function checkObjectCoordinateConvergence(a,b,tol){
 const left=objects(a),right=objects(b);
 assert.equal(left.length,right.length);
 let maximum=0;
 for(let i=0;i<left.length;i++){
  assert.equal(left[i].type,right[i].type);
  assert.equal(left[i].mode,right[i].mode);
  assert.equal(left[i].points.length,right[i].points.length);
  assert.equal(left[i].metadata.objectBank,right[i].metadata.objectBank);
  assert.equal(left[i].metadata.placedObjectIndex,right[i].metadata.placedObjectIndex);
  for(let j=0;j<left[i].points.length;j++)for(let d=0;d<3;d++){
   const diff=Math.abs(left[i].points[j][d]-right[i].points[j][d]);
   assert.ok(Number.isFinite(diff));maximum=Math.max(maximum,diff);
  }
 }
 assert.ok(maximum<=tol,`world-space geometry failed flat-limit convergence: ${maximum} > ${tol}`);
 return maximum;
}

test('128: physical FlatEarth preserves positive east/north object axes and metre offsets',()=>{
 const r=6371000,eye=15;
 const p=world.placement({geometryRadius:r,height:eye,objectSize:23,
  latitude:32/r,longitude:25000/r,globe:true,curvature:0,
  horizontalScale:1,verticalScale:1});
 assert.deepEqual(p.origin,[32,25000,-15]);
 assert.deepEqual(p.xAxis,[23,0,0]);
 assert.deepEqual(p.yAxis,[0,0,23]);
 const oldFlat=world.placement({geometryRadius:r,height:eye,objectSize:23,
  latitude:32/r,longitude:25000/r,globe:false,horizontalScale:1,verticalScale:1});
 assert.ok(oldFlat.origin[0]<0);
 assert.ok(oldFlat.xAxis[0]<0);
});

test('128: all 87 physical towers, fills and stroke vertices converge without east-west mirroring',()=>{
 const flat=physical(state(6371000,true));
 const far=physical(state(1e16,false));
 const mid=physical(state(6000370000,false));
 const earth=physical(state(6371000,false));
 const near=checkObjectCoordinateConvergence(far,flat,1e-6);
 const intermediate=checkObjectCoordinateConvergence(mid,flat,0.5);
 assert.ok(near<intermediate/1000);
 // Earth has an actually different shape and cannot be claimed to equal Flat.
 assert.throws(()=>checkObjectCoordinateConvergence(earth,flat,1e-4),/flat-limit convergence/);
 const pts=objects(flat).flatMap(p=>p.points);
 assert.ok(pts.some(p=>p[0]>0));
 assert.ok(pts.every(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])&&Number.isFinite(p[2])));
 assert.ok(pts.every(p=>p[0]>-500),'no formerly mirrored tower bank');
 assert.equal(objects(earth).length,objects(flat).length);
});

test('128: the exact-flat physical scene is independent of the stored finite Earth radius',()=>{
 const atEarth=physical(state(6371000,true)),atHuge=physical(state(1e16,true));
 checkObjectCoordinateConvergence(atEarth,atHuge,1e-8);
 assert.deepEqual(guides(atEarth),guides(atHuge));
});

test('128: all metric grid geometry and styles converge at the flat endpoint',()=>{
 const flat=physical(state(6371000,true));
 for(const radius of [6371000,6000370000,1e16]){
  const m=state(radius,radius===6371000);
  const guide=guides(physical(m));
  assert.equal(guide.length,guides(flat).length);
  assert.deepEqual(guide.map(p=>p.metadata.kind),guides(flat).map(p=>p.metadata.kind));
  assert.ok(guide.every(p=>p.style.stroke==='blue'));
  assert.deepEqual(guide.filter(p=>p.metadata.kind==='metric-ring').map(p=>p.metadata.radius),
   world.RINGS);
 }
});

test('128: slider endpoint changes curvature without perturbing authored metrics or camera',()=>{
 const m=state(6371000,false);
 const reference=physical(m),eye=camera.create(m);
 ctrl.applyStep(m,999);m.geometryRadius=m.rEarth;
 const almost=physical(m);
 ctrl.applyStep(m,1000);
 const exactly=physical(m);
 assert.equal(m.showModel,2);
 assert.deepEqual(camera.create(m),eye);
 checkObjectCoordinateConvergence(almost,exactly,1e-6);
 assert.equal(objects(reference).length,objects(exactly).length);
 assert.deepEqual(guides(almost).map(x=>x.metadata.radius),guides(exactly).map(x=>x.metadata.radius));
});

test('128: Legacy FlatEarth retains the original negative horizontal orientation',()=>{
 const m=state(6371000,true,2);
 const physicalSequence=engine.objectSequence(m,0,false,{physicalSurface:true,curvature:0});
 const legacySequence=engine.objectSequence(m,0,false);
 assert.equal(physicalSequence.length,legacySequence.length);
 assert.ok(physicalSequence[0].scene.primitives[0].points[0][0]>0);
 assert.ok(legacySequence[0].scene.primitives[0].points[0][0]<0);
});

test('128: flat vacuum target angles match the independent straight-line oracle',()=>{
 const eye=15;
 for(const d of [50,500,2500,15000,50000])for(const h of [0,25,65]){
  const a=targets.solve({geometry:'flat',radius:6371000,observerHeight:eye,
   target:[d,h],atmosphere:'vacuum'});
  assert.equal(a.status,'visible');
  nearly(a.angle,Math.atan2(h-eye,d),1e-14,'flat analytic ray angle');
 }
});

test('128: sphere vacuum uses analytic target and finite geometrical horizon',()=>{
 const R=6371000,s=surface.createFromRadius(R),eye=15;
 const horizon=s.geometricHorizon(eye).arcDistance;
 for(const d of [horizon-150,horizon-10,horizon+10,horizon+150]){
  const p=s.surfacePoint2(d,0),a=targets.solve({geometry:'globe',radius:R,
   observerHeight:eye,target:p,atmosphere:'vacuum',step:200});
  assert.equal(a.status,d<horizon?'visible':'blocked');
  nearly(a.angle,Math.atan2(p[1]-eye,p[0]),1e-13,'globe analytic launch');
 }
});

test('128: standard atmosphere is independent of the surface curvature and approaches flat',()=>{
 const eye=15,h=65,d=5000;
 const output=[];
 for(const k of [1/6371000,1/6000370000,1/1e16,0]){
  const p=surface.createFromCurvature(k).surfacePoint2(d,h);
  const s=targets.solve({curvature:k,geometry:k===0?'flat':'globe',
   radius:k===0?6371000:1/k,observerHeight:eye,
   target:p,atmosphere:'standard',step:200,shootingPredictor:true});
  const v=targets.solve({curvature:k,geometry:k===0?'flat':'globe',
   radius:k===0?6371000:1/k,observerHeight:eye,target:p,atmosphere:'vacuum'});
  assert.equal(s.status,'visible');assert.equal(v.status,'visible');
  assert.ok(s.angle>v.angle,'upward apparent refraction remains physically distinct from vacuum');
  output.push(s.angle);
 }
 nearly(output[2],output[3],1e-8,'near-flat refracted-ray convergence');
 assert.ok(Math.abs(output[0]-output[3])>1e-5,'finite sphere is physically different');
});

test('128: shooting failure cannot be promoted to a physical optical horizon',()=>{
 const R=1e16,eye=15,failed='solver_failed';
 const g=ground.create({geometry:'globe',model:{rEarth:R,Height:eye},
  atmosphere:'standard',metricGrid:true,
  sampleGround(d){return d<=100000?{status:'visible',angle:-.0001}:{status:failed};}});
 assert.equal(g.horizonDistance,null);
 const transformed=g.transform(world.metricGuides({curvature:1/R,observerHeight:eye,showGrid:1}).primitives);
 assert.ok(transformed.length>0);
 assert.ok(!transformed.some(p=>p.metadata.kind==='physical-horizon'));
});

test('128: a certified visible/blocked bracket still resolves a finite optical horizon',()=>{
 const g=ground.create({geometry:'globe',model:{rEarth:6371000,Height:15},
  atmosphere:'standard',metricGrid:true,
  sampleGround(d){return Math.abs(d-16000)<.5?{status:'indeterminate'}:
   {status:d<16000?'visible':'blocked',angle:-.02};}});
 assert.ok(g.horizonDistance!==null);
 nearly(g.horizonDistance,16000,2,'bracketed horizon');
});

test('128: near-flat ground guide sampling does not jump at the exact endpoint',()=>{
 const observerHeight=15,grid=world.metricGuides({curvature:0,observerHeight,showGrid:1});
 const flat=ground.create({geometry:'flat',model:{rEarth:6371000,Height:observerHeight},
  atmosphere:'vacuum',metricGrid:true});
 const almost=ground.create({geometry:'globe',model:{rEarth:1e16,Height:observerHeight},
  atmosphere:'vacuum',metricGrid:true});
 const getGrid=g=>g.transform(grid.primitives).filter(p=>p.metadata.kind!=='physical-horizon');
 const a=getGrid(flat),b=getGrid(almost);
 assert.equal(a.length,b.length);
 assert.deepEqual(a.map(p=>p.metadata.kind),b.map(p=>p.metadata.kind));
 for(let i=0;i<a.length;i++)for(let j=0;j<2;j++)for(let k=0;k<3;k++)
  nearly(a[i].points[j][k],b[i].points[j][k],1e-6,'ground arrival continuous');
});

test('128: complete 85+2 tower atmospheric scenes converge, with no unresolved outlines or fills',()=>{
 const options={atmosphere:'standard'};
 const almost=state(1e16,false),flat=state(6371000,true);
 const results=[almost,flat].map(m=>optics.create().transform(physical(m),m,options));
 for(const x of results){
  assert.equal(x.stats.unresolved,0);assert.equal(x.stats.fillUnresolved,0);
  assert.equal(x.stats.budgetExceeded,false);
  assert.ok(x.stats.visibleSegments>3000);
  assert.ok(x.stats.fillTriangles>800);
 }
 assert.equal(results[0].stats.visibleSegments,results[1].stats.visibleSegments);
 assert.equal(results[0].stats.fillTriangles,results[1].stats.fillTriangles);
 const a=objects(results[0].composition),b=objects(results[1].composition);
 assert.equal(a.length,b.length);
 let max=0;
 for(let i=0;i<a.length;i++)for(let j=0;j<a[i].points.length;j++)for(let k=0;k<3;k++)
  max=Math.max(max,Math.abs(a[i].points[j][k]-b[i].points[j][k]));
 assert.ok(max<0.001,`near-flat optical projected object mismatch: ${max} m at reference 1000 m`);
 assert.equal(results[0].stats.groundHorizon,null,'failed long-distance shooting cannot invent a horizon');
 assert.equal(results[1].stats.groundHorizon,null);
});

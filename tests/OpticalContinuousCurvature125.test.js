'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const surface=require('../src/geometry/CurvatureSurfaceGeometry');
const tracer=require('../src/optics/OpticalRayTracer');
const projection=require('../src/optics/OpticalTargetProjection');
const field=require('../src/optics/OpticalSharedRayField');
const R=6371000;
function near(a,b,tol,message){
 assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tol,
  `${message}: ${a} != ${b} (±${tol})`);
}
function point(k,d,h){return surface.createFromCurvature(k).surfacePoint2(d,h);}

// The new solver is a common continuous-curvature equation, not a hidden
// replacement of globe by a finite-radius flat approximation.
test('125: ordinary globe and flat options resolve to the same explicit curvature',()=>{
 const globe=tracer.resolveGeometry({geometry:'globe',radius:R});
 const plane=tracer.resolveGeometry({geometry:'flat',radius:R});
 assert.equal(globe.curvature,1/R);
 assert.equal(plane.curvature,0);
 assert.equal(plane.surface.flat,true);
 for(const [k,legacy] of [[0,'flat'],[1/R,'globe']]){
  const g=tracer.resolveGeometry({curvature:k});
  assert.equal(g.geometry,legacy);
  for(const [x,z] of [[0,15],[100,2],[10000,-5],[20000,150]]){
   near(g.surface.height2(x,z),surface.createFromCurvature(k).height2(x,z),0,'same altitude');
   const metric=g.surface.metric2(x,z),normal=g.surface.normal2(x,z);
   near(metric[0],g.surface.height2(x,z),1e-12,'joint height');
   near(metric[1],normal[0],1e-15,'joint normal x');
   near(metric[2],normal[1],1e-15,'joint normal z');
  }
 }
 assert.throws(()=>tracer.resolveGeometry({curvature:-1}),/curvature/);
 assert.throws(()=>tracer.resolveGeometry({curvature:Infinity}),/curvature/);
 assert.throws(()=>tracer.resolveGeometry({curvature:0,geometry:'globe'}),/contradicts/);
 assert.throws(()=>tracer.resolveGeometry({curvature:1/R,geometry:'flat'}),/contradicts/);
 assert.throws(()=>tracer.resolveGeometry({surfaceArithmetic:'invented'}),/arithmetic/);
});

test('125: exact plane is preserved through RK4 and finite-ray contacts',()=>{
 const eye=15,angle=-0.002,length=25000;
 const options={curvature:0,observerHeight:eye,angle,length,step:2000,atmosphere:'vacuum'};
 const endpoint=tracer.trace({...options,stopAtGround:false});
 near(endpoint.x,length*Math.cos(angle),1e-8,'plane x');
 near(endpoint.z,eye+length*Math.sin(angle),1e-8,'plane z');
 near(endpoint.height,endpoint.z,0,'plane altitude');
 const hit=tracer.trace(options);
 assert.equal(hit.hitGround,true);
 assert.equal(hit.event.contact,'crossing');
 near(hit.travelled,-eye/Math.sin(angle),1e-6,'plane contact distance');
 const sky=tracer.trace({...options,angle:0.003});
 assert.equal(sky.hitGround,false);
 const target=[30000,120];
 const result=projection.solve({curvature:0,target,observerHeight:eye,
   atmosphere:'vacuum',step:400});
 assert.equal(result.status,'visible');
 near(result.angle,Math.atan2(120-eye,30000),1e-14,'plane vacuum angle');
 assert.throws(()=>projection.solve({curvature:0,target:[10000,-0.01],
   observerHeight:eye,atmosphere:'vacuum'}),/opaque boundary/);
});

test('125: vacuum targets converge to a plane for a million-fold radius increase',()=>{
 const d=25000,h=23,eye=15;
 const values=[1/R,1/(10*R),1/(1000*R),1/(1e6*R),0];
 const flatAngle=Math.atan2(h-eye,d);
 let lastDeviation=Infinity;
 for(const k of values){
  const target=point(k,d,h);
  const result=projection.solve({curvature:k,target,observerHeight:eye,
   atmosphere:'vacuum',step:250});
  assert.equal(result.status,'visible',`vacuum k=${k}`);
  const exactAngle=Math.atan2(target[1]-eye,target[0]);
  near(result.angle,exactAngle,1e-14,`vacuum analytic k=${k}`);
  const deviation=Math.abs(result.angle-flatAngle);
  assert.ok(deviation<=lastDeviation+1e-14,`monotone vacuum convergence k=${k}`);
  lastDeviation=deviation;
 }
 near(lastDeviation,0,1e-14,'exact flat limit');
});

test('125: standard atmosphere keeps refraction on the exact plane',()=>{
 const eye=15,d=20000,h=100;
 const flat=projection.solve({curvature:0,target:[d,h],observerHeight:eye,
   atmosphere:'standard',step:250,shootingPredictor:true});
 assert.equal(flat.status,'visible');
 assert.ok(Math.abs(flat.residual)<=1e-6);
 assert.ok(flat.angle>Math.atan2(h-eye,d),'refraction remains enabled');
 const oldFlat=projection.solve({geometry:'flat',radius:R,target:[d,h],observerHeight:eye,
   atmosphere:'standard',step:250,shootingPredictor:true});
 assert.equal(oldFlat.status,flat.status);
 near(oldFlat.angle,flat.angle,1e-14,'explicit zero equals flat');
 for(const k of [1/(1000*R),1/(1e6*R),1e-19]){
  const result=projection.solve({curvature:k,target:point(k,d,h),observerHeight:eye,
   atmosphere:'standard',step:250,shootingPredictor:true});
  assert.equal(result.status,'visible',`standard k=${k}: ${result.reason}`);
  assert.ok(Math.abs(result.residual)<=1e-6);
  near(result.angle,flat.angle,1e-5,`standard near-flat k=${k}`);
 }
});

test('125: vacuum spherical tangent and a blocked target retain physical classification',()=>{
 const eye=15,geo=surface.createFromRadius(R),horizon=geo.geometricHorizon(eye);
 const tangent=tracer.trace({curvature:1/R,observerHeight:eye,
  angle:-horizon.dipAngle,length:horizon.straightDistance,
  step:horizon.straightDistance,atmosphere:'vacuum'});
 assert.equal(tangent.event.contact,'grazing');
 near(tangent.travelled,horizon.straightDistance,1e-6,'tangent contact');
 const behind=projection.solve({curvature:1/R,target:geo.surfacePoint2(50000,0),
   observerHeight:eye,atmosphere:'vacuum',step:1000});
 assert.equal(behind.status,'blocked');
 const planar=projection.solve({curvature:0,target:[50000,0],observerHeight:eye,
   atmosphere:'vacuum',step:1000});
 assert.equal(planar.status,'visible');
});

test('125: shared field uses the same stable surface-point chart as the direct solver',()=>{
 for(const k of [0,1/R,1/(R*1e8)]){
  const geometry=k===0?'flat':'globe',d=8500,h=50;
  const shared=field.create({curvature:k,geometry,atmosphere:'standard',
   observerHeight:15,step:500,distances:[1000,10000],heights:[0,100],
   shootingOptimization:false});
  const fromField=shared.exact(d,h);
  const direct=projection.solve({curvature:k,target:point(k,d,h),
   observerHeight:15,atmosphere:'standard',step:500});
  assert.equal(fromField.status,direct.status);
  near(fromField.angle,direct.angle,1e-13,'field/direct shooting agreement');
  assert.equal(shared.stats().solves,1);
  assert.equal(shared.exact(d,h),fromField,'field-local target cache');
  assert.equal(shared.stats().hits,1);
 }
});

test('125: legacy arithmetic remains explicit, not the default, and keeps #123 solver evaluations',()=>{
 const common={geometry:'globe',radius:R,target:point(1/R,10000,70),
   atmosphere:'standard',observerHeight:15,step:500};
 const stable=projection.solve(common);
 const legacy=projection.solve({...common,surfaceArithmetic:'legacy'});
 assert.equal(stable.status,'visible');
 assert.equal(legacy.status,stable.status);
 near(stable.angle,legacy.angle,3e-9,'stable vs legacy arrival angle');
 assert.equal(stable.evaluations,legacy.evaluations);
 assert.equal(stable.shootRK4Calls,legacy.shootRK4Calls);
 assert.throws(()=>projection.solve({...common,curvature:1/(2*R),
   surfaceArithmetic:'legacy'}),/matching finite radius/);
});

test('125: browser loads stable geometry before physical ray solver',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../CurvatureApp.html'),'utf8');
 const kernel=html.indexOf('src/geometry/CurvatureSurfaceGeometry.js');
 const tracerPos=html.indexOf('src/optics/OpticalRayTracer.js');
 const projectionPos=html.indexOf('src/optics/OpticalTargetProjection.js');
 assert.ok(kernel>=0&&kernel<tracerPos&&tracerPos<projectionPos);
});

test('125: full 85+2 tower scenes preserve topology and shooting work vs prior arithmetic',()=>{
 const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
 const compose=require('../src/scene/CurvatureIndependentComposition');
 const {model}=require('../tools/benchmark-adaptive-prism-112');
 const {atHeight}=require('../tools/benchmark-height-change-120');
 for(const observerHeight of [15,15.3]){
  const m=atHeight(model(85,'globe'),observerHeight);
  const authored=compose.composeOpticalMain(m,true);
  function render(surfaceArithmetic){return optics.create().transform(authored,m,{atmosphere:'standard',
    settings:{surfaceArithmetic}});}
  const original=render('legacy'),stable=render('stable');
  const a=original.composition.scene.primitives,b=stable.composition.scene.primitives;
  assert.equal(a.length,b.length);
  assert.equal(stable.stats.unresolved,0);
  for(const key of ['visibleSegments','unresolved','fillTriangles','fillUnresolved'])
   assert.equal(stable.stats[key],original.stats[key],key);
  for(const key of ['solves','shootRK4Calls','shootEvaluations'])
   assert.equal(stable.stats.fieldStats[key],original.stats.fieldStats[key],key);
  let maxCoordinateDelta=0;
  for(let i=0;i<a.length;i++){
   assert.equal(a[i].type,b[i].type,`type ${i}`);
   assert.equal(a[i].mode,b[i].mode,`mode ${i}`);
   assert.equal(a[i].points.length,b[i].points.length,`point count ${i}`);
   for(let j=0;j<a[i].points.length;j++)for(let axis=0;axis<3;axis++){
    const delta=Math.abs(a[i].points[j][axis]-b[i].points[j][axis]);
    assert.ok(Number.isFinite(delta),`non-finite primitive ${i}`);
    maxCoordinateDelta=Math.max(maxCoordinateDelta,delta);
   }
  }
  assert.ok(maxCoordinateDelta<0.12,
    `surface arithmetic changed projected coordinates by ${maxCoordinateDelta} m on R=1000m display sphere`);
  assert.ok(Math.abs(stable.stats.groundHorizon-original.stats.groundHorizon)<2,
   'near-grazing numerical horizon must remain within two metres');
 }
});

test('125: arbitrarily small positive curvature cannot produce an infinite endpoint envelope',()=>{
 const d=10000,eye=15;
 for(const k of [0,1e-20,1e-150,1e-310]){
  const target=point(k,d,0);
  const result=projection.solve({curvature:k,target,observerHeight:eye,
   atmosphere:'vacuum',step:250});
  assert.equal(result.status,'visible',`vacuum ground k=${k}: ${result.reason}`);
  assert.ok(Number.isFinite(result.angle));
 }
});

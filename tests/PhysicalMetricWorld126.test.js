'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const world=require('../src/geometry/CurvaturePhysicalWorldGeometry');
const surface=require('../src/geometry/CurvatureSurfaceGeometry');
const engine=require('../src/geometry/CurvatureGeometryEngine');
const compose=require('../src/scene/CurvatureIndependentComposition');
const ground=require('../src/optics/CurvaturePhysicalGroundGuides');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const {model}=require('../tools/benchmark-adaptive-prism-112');
const R=6371000;
const nearly=(a,b,tol,msg)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tol,
  `${msg}: ${a} vs ${b} (tolerance ${tol})`);
function authored(k,h=15,showGrid=1){return world.metricGuides({curvature:k,observerHeight:h,showGrid,stroke:'blue'});}
const rings=x=>x.primitives.filter(p=>p.metadata.kind==='metric-ring');
const spokes=x=>x.primitives.filter(p=>p.metadata.kind==='metric-spoke');

test('126: every grid ring retains the same metric spacing at all radii and heights',()=>{
 const reference=world.RINGS.slice();
 for(const k of [0,1/R,1/(10*R),1/(6000370000),1/1e16])for(const eye of [1,7.03526,15,200]){
  const g=authored(k,eye),s=surface.createFromCurvature(k);
  assert.deepEqual(g.metadata.gridRadiiMetres,reference);
  assert.equal(rings(g).length,reference.length);
  for(const ring of rings(g)){
   assert.equal(ring.points.length,64);
   const d=ring.metadata.radius;
   for(const p of ring.points){
    const z=p[2]+eye;
    nearly(s.height3(p[0],p[1],z),0,5e-8,'point lies on shared surface');
    const lateral=Math.hypot(p[0],p[1]);
    const distance=k?Math.atan2(k*lateral,1+k*z)/k:lateral;
    nearly(distance,d,2e-8,'fixed geodesic grid radius');
   }
  }
  for(const line of spokes(g)){
   assert.equal(line.points.length,2);
   assert.ok(line.metadata.toMetres>line.metadata.fromMetres);
   assert.ok(line.metadata.toMetres<=100000);
  }
  assert.equal(g.primitives.length,17+24*17);
 }
});

test('126: the grid is a bounded presentation device and never defines physical visibility',()=>{
 assert.equal(authored(0,15,0).primitives.length,0);
 assert.equal(authored(1/R,15,2).primitives.length,0);
 const tiny=world.metricGuides({curvature:0,observerHeight:15,showGrid:1,maxDistance:50});
 assert.deepEqual(tiny.metadata.gridRadiiMetres,[50]);
 assert.ok(tiny.primitives.every(p=>p.metadata.metricSurface===true));
 assert.throws(()=>world.metricGuides({curvature:-1,observerHeight:15,showGrid:1}),/curvature/);
 assert.throws(()=>world.metricGuides({curvature:0,observerHeight:15,showGrid:1,maxDistance:Infinity}),/extent/);
});

test('126: physical tower bases and normals use the same continuous-curvature surface',()=>{
 for(const r of [R,6000370000,1e13])for(const globe of [true,false]){
  const d=24500,side=33.5,eye=7.03526,os=23;
  const p={geometryRadius:r,height:eye,objectSize:os,
    latitude:side/r,longitude:d/r,globe,horizontalScale:1.2,verticalScale:0.8};
  const placed=world.placement(p),s=surface.createFromCurvature(globe?1/r:0);
  const origin=placed.origin,n=s.normal3(origin[0],origin[1],origin[2]+eye);
  nearly(s.height3(origin[0],origin[1],origin[2]+eye),0,1e-8,'foundation on surface');
  nearly(placed.xAxis.reduce((v,x,i)=>v+x*n[i],0),0,1e-11,'horizontal tangent');
  for(let i=0;i<3;i++)nearly(placed.yAxis[i],os*.8*n[i],2e-12,'vertical tangent');
  if(r===R){
   const legacy=engine.towerPlacement(p);
   for(const key of ['origin','xAxis','yAxis'])for(let i=0;i<3;i++)
    nearly(placed[key][i],legacy[key][i],1e-8,'legacy Earth placement');
  }
 }
});

test('126: physical scene authoring uses metric guides and stable object placement, legacy opt-in is unchanged',()=>{
 for(const geo of ['globe','flat']){
  const m=model(2,geo),globe=geo==='globe';
  const legacy=compose.composeOpticalMain(m,globe),physical=compose.composeOpticalMain(m,globe,{physicalWorld:true});
  assert.equal(legacy.scene.metadata.physicalMetricWorld,false);
  assert.equal(physical.scene.metadata.physicalMetricWorld,true);
  assert.equal(physical.ranges[0].name,'surface-guides');
  assert.equal(physical.ranges[0].count,17+24*17);
  assert.ok(physical.scene.primitives.slice(0,physical.ranges[0].end)
    .every(p=>p.metadata.metricSurface===true));
  assert.ok(legacy.scene.primitives.slice(0,legacy.ranges[0].end)
    .every(p=>!p.metadata.metricSurface));
  assert.equal(physical.ranges.filter(x=>x.role==='objects').length,2);
  const zero=world.metricGuides({curvature:0,observerHeight:15,showGrid:1});
  for(const p of zero.primitives.flatMap(p=>p.points))nearly(p[2],-15,0,'exact plane');
 }
});

test('126: metric ring and spoke samples follow real surface arc distances in optical projection',()=>{
 for(const geometry of ['flat','globe']){
  const m={rEarth:R,Height:15,GlobeGridCol:'blue',FEGridCol:'blue'};
  const globe=geometry==='globe',guides=authored(globe?1/R:0,15);
  const g=ground.create({model:m,geometry,atmosphere:'vacuum',metricGrid:true,maxDistance:100000});
  const result=g.transform(guides.primitives);
  const onCircle=result.filter(p=>p.metadata.kind==='metric-ring'&&p.metadata.radius===1000);
  assert.equal(onCircle.length,64,'metric ring samples use one curvature-independent subdivision rule');
  for(const p of onCircle){
   const a=p.points[0],distance=1000;
   const surfaceZ=globe?surface.createFromRadius(R).surfacePoint2(distance,0)[1]:0;
   const expected=Math.atan2(surfaceZ-15,globe?R*Math.sin(distance/R):distance);
   nearly(Math.atan2(a[2],Math.hypot(a[0],a[1])),expected,1e-9,'optical elevation on metric ring');
  }
  assert.equal(g.horizonDistance===null,!globe);
  assert.ok(g.cullingStats().skippedEdges>=0);
 }
});

test('126: 85+2 tower optical silhouettes and fills are preserved by physical world placement',()=>{
 const m=model(85,'globe'),oldScene=compose.composeOpticalMain(m,true),
   newScene=compose.composeOpticalMain(m,true,{physicalWorld:true});
 const old=optics.create().transform(oldScene,m,{atmosphere:'standard'}),
   next=optics.create().transform(newScene,m,{atmosphere:'standard'});
 assert.equal(old.stats.unresolved,0);assert.equal(next.stats.unresolved,0);
 nearly(next.stats.groundHorizon,old.stats.groundHorizon,1,
  'verified physical horizon agrees with historical reference within a metre');
 assert.deepEqual(old.stats.perGroup.map(g=>g.visibleSegments),next.stats.perGroup.map(g=>g.visibleSegments));
 const objects=frame=>frame.composition.ranges.filter(r=>r.role==='objects').flatMap(r=>
   frame.composition.scene.primitives.slice(r.start,r.end));
 const a=objects(old),b=objects(next);
 assert.equal(a.length,b.length);
 let biggest=0;
 for(let i=0;i<a.length;i++){
  assert.equal(a[i].type,b[i].type);
  assert.equal(a[i].points.length,b[i].points.length);
  for(let j=0;j<a[i].points.length;j++)for(let k=0;k<3;k++)
   biggest=Math.max(biggest,Math.abs(a[i].points[j][k]-b[i].points[j][k]));
 }
 assert.ok(biggest<1e-6,`projected tower difference ${biggest}`);
 assert.ok(next.stats.guideSegments>0);
});

test('126: browser script dependencies load before physical composition and renderer',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../CurvatureApp.html'),'utf8');
 const script=name=>html.indexOf('src="src/'+name+'"');
 assert.ok(script('geometry/CurvatureSurfaceGeometry.js')>=0);
 assert.ok(script('geometry/CurvaturePhysicalWorldGeometry.js')>script('geometry/CurvatureSurfaceGeometry.js'));
 assert.ok(script('geometry/CurvatureGeometryEngine.js')>script('geometry/CurvaturePhysicalWorldGeometry.js'));
 assert.ok(script('scene/CurvatureIndependentComposition.js')>script('geometry/CurvatureGeometryEngine.js'));
 assert.ok(script('optics/OpticalRayTracer.js')>script('geometry/CurvatureSurfaceGeometry.js'));
 const render=fs.readFileSync(path.join(__dirname,'../src/app/CurvatureMainCanvasRenderer.js'),'utf8');
 assert.match(render,/composeOpticalMain\(physicalModel,globe,\{physicalWorld:true\}\)/);
});

test('126: extremely large globe radius retains curvature in authored ground coordinates',()=>{
 const big=6000370000,eye=7.03526;
 const g=authored(1/big,eye),plane=authored(0,eye);
 const ring=g.primitives.find(p=>p.metadata.kind==='metric-ring'&&p.metadata.radius===100000),
   flat=plane.primitives.find(p=>p.metadata.kind==='metric-ring'&&p.metadata.radius===100000);
 assert.ok(ring&&flat);
 const expected=-eye-100000*100000/(2*big);
 nearly(ring.points[0][2],expected,1e-9,'stable large-radius sagitta');
 nearly(flat.points[0][2],-eye,0,'plane is exact');
 assert.ok(Math.abs(ring.points[0][2]-flat.points[0][2])>.5);
 const m=model(2,'globe');m.rEarth=m.geometryRadius=big;m.Height=eye;
 const neutral=compose.composeOpticalMain(m,true,{physicalWorld:true});
 const rendered=optics.create().transform(neutral,m,{atmosphere:'standard'});
 assert.equal(rendered.stats.unresolved,0);
 assert.ok(rendered.stats.guideSegments>1000);
 assert.ok(rendered.stats.groundHorizon===null||rendered.stats.groundHorizon>100000,
   'a finite physical horizon must be verified and is never the 100km grid limit');
 assert.equal(rendered.stats.guideRenderExtent,100000);
});

test('126: near-eye metric guides use verified ground angles instead of coarse table interpolation',()=>{
 const d=1000,eye=15;
 for(const geometry of ['globe','flat']){
  const globe=geometry==='globe',g=ground.create({model:{rEarth:R,Height:eye},
    geometry,atmosphere:'vacuum',metricGrid:true});
  const result=g.transform(authored(globe?1/R:0,eye).primitives),
    ring=result.filter(p=>p.metadata.kind==='metric-ring'&&p.metadata.radius===d);
  const target=surface.createFromCurvature(globe?1/R:0).surfacePoint2(d,0);
  const expected=Math.atan2(target[1]-eye,target[0]);
  for(const item of ring)for(const p of item.points)
    nearly(Math.atan2(p[2],Math.hypot(p[0],p[1])),expected,1e-9,'verified elevation');
  assert.ok(g.metricExactDistances()<120,'same radial ground problem must be shared across azimuths');
 }
});

test('126: near-flat physical tower vertices retain metre-scale altitude lost by R subtraction',()=>{
 const silhouette=require('../src/optics/OpticalTowerSilhouette');
 const huge=1e16,eye=7.03526,h=1.25,d=80000;
 const s=surface.createFromRadius(huge),p=s.surfacePoint3(0,d,h);
 const cameraPoint=[p[0],p[1],p[2]-eye];
 const stable=silhouette.coordinate(cameraPoint,'globe',huge,eye,s);
 const legacy=silhouette.coordinate(cameraPoint,'globe',huge,eye);
 nearly(stable.distance,d,1e-8,'surface arc metres');
 nearly(stable.height,h,2e-14,'height retained without cancellation');
 assert.ok(Math.abs(legacy.height-h)>.25,'old R subtraction must expose loss of altitude');
 const m=model(2,'globe');m.rEarth=m.geometryRadius=huge;m.Height=eye;
 const neutral=compose.composeOpticalMain(m,true,{physicalWorld:true});
 const result=optics.create().transform(neutral,m,{atmosphere:'vacuum'});
 assert.equal(result.stats.unresolved,0);
 assert.ok(result.stats.guideSegments>0);
 assert.ok(result.stats.physicalMetricWorld);
});

test('126: legacy horizon-derived grid controls cannot rescale the metric physical scene',()=>{
 const m=model(2,'globe'),first=compose.composeOpticalMain(m,true,{physicalWorld:true});
 const altered={...m,aDip:1e-12,aDelta:7.5,hDisk:1,rDisk:999999,
   zDisk:55555,nLines:199,rFEarth:42000000};
 const second=compose.composeOpticalMain(altered,true,{physicalWorld:true});
 assert.deepEqual(second.scene.primitives,first.scene.primitives,
  'physical ring metres and authored tower coordinates cannot depend on legacy horizon sliders');
 const legacy=compose.composeOpticalMain(m,true);
 assert.notDeepEqual(legacy.scene.primitives.slice(0,legacy.ranges[0].end),
  compose.composeOpticalMain(altered,true).scene.primitives.slice(0,legacy.ranges[0].end),
  'the legacy visual guides remain separately controlled');
});

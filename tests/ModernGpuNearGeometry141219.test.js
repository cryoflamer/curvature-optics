'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const src=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const compare=require('../src/ui/modern/ModernCompareModel');
const composition=require('../src/scene/CurvatureIndependentComposition');
const silhouette=require('../src/optics/OpticalTowerSilhouette');
const surfaces=require('../src/geometry/CurvatureSurfaceGeometry');
const physical=require('../src/optics/CurvaturePhysicalSceneOptics');
function model(){
  const vec={Norm:a=>a.map(x=>x/Math.hypot(...a)),
    Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2]],
    Scale:(a,t)=>a.map(x=>x*t),Add:(a,b)=>a.map((x,i)=>x+b[i]),
    ScalarProd:(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0)};
  const c=vm.createContext({JsgVect3:vec});
  vm.runInContext(src('src/app/CurvatureModel.js'),c);
  const m=vm.runInContext('new CurveAppClass()',c);
  Object.assign(m,{Height:15,FocalLengthField:2000,Nick:0.0121,Pan:0.0464,
    Roll:0,showModel:1,showGrid:1,viewcenterHorizon:3,
    ObjType:[3],NObjects:[85],ObjDist:[1200],ObjDeltaDist:[280],
    ObjSidePos:[35],ObjSize:[64]});
  m.Update();return m;
}
const deps={composition,silhouette,surfaces,branch:'first-forward-x'};
const near=(field,m,cutoff)=>compare.nearGeometricField(field,m,surfaces,
  physical.vacuumSample,cutoff);
function stub(m){
  const geometry=m.showModel===2?'flat':'globe',radius=m.rEarth,eye=m.Height;
  const surface=surfaces.createFromCurvature(geometry==='globe'?1/radius:0);
  const calls=[];
  function sample(d,h){calls.push([d,h]);const p=surface.surfacePoint2(d,h);
    return {status:'visible',angle:Math.atan2(p[1]-eye,p[0])+0.0001};}
  return {fullCoverageGrid:true,sample,exact:sample,calls,
    stats:()=>({solves:0,hits:calls.length,experimentalGpu:{kind:'gpu-first-grid',
      gpuSeedNodes:4096,cpuFallbackRequests:0}})};
}
test('140.12.19: direct near angles and geometric globe horizon match existing physical vacuum adapter',()=>{
  const m=model(),base=stub(m),field=near(base,m,3000);
  for(const [d,h] of [[100,0],[900,0],[1200,1],[2950,20]]){
    const expected=physical.vacuumSample('globe',m.rEarth,m.Height,d,h,true);
    assert.deepEqual(field.sample(d,h),expected);
    assert.deepEqual(field.exact(d,h),expected);
  }
  const justOut=field.sample(3000.001,1),original=base.sample(3000.001,1);
  assert.deepEqual(justOut,original,'the far field delegates to GPU without alteration');
  assert.ok(field.nearAudit().anglesCompared>0);
  assert.equal(field.nearAudit().statusDisagreements,0);
  assert.equal(field.stats().experimentalGpu.cpuFallbackRequests,0);
});
test('140.12.19: horizon blocked status uses curved Earth, not flat ray or always-visible assumption',()=>{
  const m=model(),base=stub(m),field=near(base,m,6000);
  const observerAtGround=Object.assign({},m,{Height:0}),groundField=near(stub(observerAtGround),observerAtGround,6000);
  assert.equal(groundField.sample(3000,0).status,'blocked');
  assert.equal(groundField.sample(3000,30).status,'visible');
  assert.equal(field.sample(3000,0).status,'visible');
});
test('140.12.19: scope is solely near; GPU near discrepancy is separately counted for ground and towers',()=>{
  const m=model(),base=stub(m),field=near(base,m,1500);
  field.sample(1200,5);field.sample(1200,5);field.exact(1200,5);
  field.exact(1200,0);field.sample(1500,20);field.sample(1500.1,20);
  const audit=field.nearAudit();
  assert.equal(audit.nearQueries,5);
  assert.equal(audit.nearExactQueries,2);
  assert.equal(audit.uniqueNearTargets,3);
  assert.equal(audit.groundTargets,1);
  assert.equal(audit.objectHeightTargets,2);
  assert.ok(audit.meanAbsoluteAngleDeltaArcsec>0);
  assert.ok(audit.maxAbsoluteAngleDeltaArcsec>audit.meanAbsoluteAngleDeltaArcsec*0.9);
  assert.equal(field.stats().experimentalGpu.nearGeometricLimitMetres,1500);
  assert.equal(field.stats().experimentalGpu.nearGeometryAudit.uniqueNearTargets,3);
  assert.equal(field.stats().experimentalGpu.productionAuthorized,false);
  assert.equal(base.calls.length,6,'both near and far use GPU data for paired audit/delegation');
});
test('140.12.19: flat geometry is truly exact and independent of refracted GPU interpolation',()=>{
  const m=model();m.showModel=2;m.Update();
  const field=near(stub(m),m,6000);
  const r=field.sample(3000,50);
  assert.equal(r.status,'visible');
  assert.equal(r.angle,Math.atan2(50-m.Height,3000));
});
test('140.12.19: invalid boundary/field inputs fail closed',()=>{
  const m=model(),base=stub(m);
  for(const bad of [0,-100,1700,100000,NaN])
    assert.throws(()=>near(base,m,bad),/Invalid near-geometric/);
  assert.throws(()=>near({},m,3000),/Invalid near-geometric/);
});
test('140.12.19: production code keeps paired GPU+CPU physics, exports diagnostic and does not promote geometry to default',()=>{
  const html=src('CurvatureModern.html'),app=src('src/ui/modern/ModernApp.js');
  assert.match(html,/id="ModernGpuNearGeometryRun"/);
  assert.match(html,/ModernApp\.js\?v=140\.12\.26/);
  assert.match(html,/ModernCompareModel\.js\?v=140\.12\.26/);
  assert.match(app,/addEventListener\('click',runCompareNearGeometry141219\)/);
  assert.match(app,/curvature-compare-140\.12\.19-near-geometric-projection\.json/);
  const block=app.slice(app.indexOf('async function runCompareNearGeometry141219()'),
    app.indexOf('function bindCompareGpuProbe()'));
  assert.match(block,/physical\.vacuumSample/);
  assert.match(block,/\[1500,3000,6000\]/);
  assert.match(block,/layout:'distance-focused'/);
  assert.match(block,/gpuFirstRayField\(grid,sharedResponse,deps\.surfaces\)/);
  assert.match(block,/compareFramePixels\(\s*cpuCanvas,snapshots\[key\],roi\)/);
  assert.ok(block.indexOf('state.compareGraphs.A.Redraw()')>block.indexOf('paint(key,fields[key])'),
    'CPU frame must not guide GPU variant selection');
  assert.match(block,/cpuOracleDiscovery:false,cpuShootingFallback:false/);
  assert.match(block,/productionAuthorized:false/);
});

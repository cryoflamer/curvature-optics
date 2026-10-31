'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const quad=require('../src/diagnostics/CurvatureCpuQuadratureFeasibility141242');
const projection=require('../src/optics/OpticalTargetProjection');
const R=6371000;
function target(geometry,x,h){
  if(geometry==='flat')return [x,h];
  const u=R+h,z=h-x*x/(Math.sqrt(u*u-x*x)+u);
  return [x,z];
}
function opts(geometry,atmosphere='standard'){
  return {geometry,radius:R,observerHeight:10,atmosphere,
    step:500,targetTolerance:1e-6,eventSubsteps:8,contactTolerance:1e-6};
}
for(const geom of ['flat','globe']){
  test(geom+': monotone quadrature shooting angle agrees with native f64 RK4',()=>{
    for(const [x,h] of [[1500,3],[8000,2],[8000,20],[8000,40],[12000,50]]){
      const t=target(geom,x,h),q=quad.candidate(opts(geom),t,{nodes:64}),
        reference=projection.solve({...opts(geom),target:t});
      if(q.status==='unsupported')continue;
      assert.equal(q.status,'candidate');
      assert.ok(reference.angle!==null);
      assert.ok(Math.abs(q.angle-reference.angle)<1e-7,
        `${geom} ${x} ${h}: ${q.angle} versus ${reference.angle}`);
      assert.ok(q.counts.integrals>0&&q.counts.samples>0);
    }
  });
  test(geom+': full benchmark retains the original RK4 oracle and ground-event contract',()=>{
    const targets=[target(geom,8000,2),target(geom,8000,20),target(geom,8000,40)];
    const report=quad.experiment({geometry:geom,radius:R,observerHeight:10,
      atmosphere:'standard',targets:targets,controls:{step:500,targetTolerance:1e-6}},
    {nodes:64,repeats:2});
    assert.equal(report.summary.targets,3);
    assert.equal(report.rounds.length,2);
    assert.ok(report.mediansMs.rk4Ms>=0&&report.mediansMs.quadratureMs>=0);
    assert.ok(report.mediansMs.predictorOnlyMs>=0&&report.mediansMs.hybridTotalMs>=0);
    assert.equal(report.summary.hybridStatusMismatches,0);
    assert.equal(report.summary.hybridGroundHitMismatches,0);
    assert.equal(report.summary.hybridAngleMismatches,0);
    assert.ok(report.rows.every(r=>r.acceptedWithoutRK4===false));
    assert.equal(report.summary.productionEligible,false);
  });
  test(geom+': near-ground and equal-height probes are explicitly supported or fail closed',()=>{
    const t=target(geom,9000,10);
    const same=quad.candidate(opts(geom),t);
    assert.equal(same.status,'unsupported');
    const near=quad.candidate(opts(geom),target(geom,9000,0));
    assert.ok(['unsupported','candidate'].includes(near.status));
    if(near.status==='candidate')assert.ok(Number.isFinite(near.angle));
  });
}
test('non-radial/non-vertical profile is explicitly unsupported',()=>{
  const result=quad.candidate(opts('globe','inverse-spherical'),target('globe',5000,20));
  assert.equal(result.status,'unsupported');
});
test('no Gaussian integral can invent a ground-contact verdict',()=>{
  const result=quad.candidate(opts('flat'),target('flat',5000,20));
  assert.ok(result.status==='candidate'||result.status==='unsupported');
  assert.equal(result.ground,undefined);
});

test('vacuum invariant quadrature follows analytic straight rays in both geometries',()=>{
  for(const geometry of ['flat','globe'])for(const h of [2,20,40]){
    const t=target(geometry,8000,h),a=quad.candidate(opts(geometry,'vacuum'),t,{nodes:64});
    assert.equal(a.status,'candidate');
    assert.ok(Math.abs(a.angle-Math.atan2(t[1]-10,t[0]))<1e-8);
  }
});
test('Modern Compare benchmark is wired to its versioned script and ZIP export',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  assert.match(html,/CurvatureCpuQuadratureFeasibility141242\.js\?v=140\.12\.42/);
  assert.match(html,/id="ModernCpuQuadratureRun"/);
  assert.match(html,/cpuQuadrature=140\.12\.42/);
  assert.match(app,/runCpuQuadratureBenchmark141242/);
  assert.match(app,/curvature-compare-140\.12\.42-cpu-f64-quadrature-feasibility\.zip/);
  assert.match(app,/stress-globe\.csv/);
});

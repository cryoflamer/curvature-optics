'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const projection=require('../src/optics/OpticalTargetProjection');
const diagnostic=require('../tools/diagnose-short-range-shooting-1406');
const qualification=require('../tools/qualify-engineered-shooting-1405');
const R=6371000;

function solve(atmosphere,geometry,d,step=2000,scale=R/2){
 const target=geometry==='flat'?[d,0]:[
  R*Math.sin(d/R),R*Math.cos(d/R)-R];
 return projection.solve({atmosphere,geometry,observerHeight:15,radius:R,
  profileOptions:{occlusionRadius:scale},target,step});
}

test('140.7: the 16 former forward-x bracket overshoots now have certified local outcomes',()=>{
 const report=diagnostic.run();
 assert.equal(report.caseCount,56);
 assert.equal(report.formerBracketOvershootRisks,16);
 assert.equal(report.repairedHistoricalOvershoots,16);
 assert.equal(report.baselineFailures,0);
 assert.equal(report.unexplainedBaselineFailures,0);
 assert.equal(report.issues.length,0,JSON.stringify(report.issues));
 for(const r of report.rows.filter(row=>row.formerBracketOvershootRisk)){
  assert.equal(r.originalStatus,'visible');
  assert.equal(r.repairedHistoricalOvershoot,true);
  assert.ok(Math.abs(r.angles.original-r.angles.ultra)<2e-8);
  if(r.independentFlatOracle)
   assert.ok(Math.abs(r.angles.original-r.angles.independentFlat)<2e-8);
 }
 assert.equal(report.globalBranchCertified,false);
 assert.equal(report.defaultPromotionAllowed,false);
});

test('140.7: near-vertical angular-domain boundary is respected on both surfaces',()=>{
 for(const atmosphere of ['exponential-occlusion','inverse-spherical'])
  for(const geometry of ['flat','globe']){
   assert.equal(solve(atmosphere,geometry,0.001).status,'solver_failed',
    'a direction outside the documented forward-x contract cannot be promoted');
   for(const d of [0.016,0.02,0.05,0.1,0.3,0.5]){
    const result=solve(atmosphere,geometry,d);
    assert.equal(result.status,'visible',`${atmosphere}/${geometry}/${d}: ${result.reason}`);
    assert.ok(Math.abs(result.angle)<Math.PI/2-0.001);
    assert.ok(Math.abs(result.residual)<1e-9);
    assert.ok(Number.isFinite(result.ray.travelled));
   }
  }
});

test('140.7: previously successful bracket-first launch angles are numerically unchanged',()=>{
 const cases=[
  [{geometry:'flat',atmosphere:'standard',observerHeight:15,target:[5000,0],step:500},-0.002900496849109698],
  [{geometry:'globe',atmosphere:'standard',observerHeight:15,target:[5000,-5000*5000/(2*R)],step:500},-0.003292891401500136],
  [{geometry:'flat',atmosphere:'exponential-occlusion',profileOptions:{occlusionRadius:R},observerHeight:15,target:[1000,0],step:500},-0.015077355736336307],
  [{geometry:'flat',atmosphere:'inverse-spherical',profileOptions:{occlusionRadius:R},observerHeight:15,target:[1000,0],step:500},-0.015077356105403929]
 ];
 for(const [settings,angle] of cases){
  const actual=projection.solve(settings);
  assert.equal(actual.status,'visible');
  assert.ok(Math.abs(actual.angle-angle)<1e-11,`${settings.atmosphere}/${settings.geometry}`);
  assert.equal(actual.predictorAttempts,0);
 }
});

test('140.7: nonmetric legacy ground guides agree with the opt-in solver after bracket repair',()=>{
 const benchmark=require('../tools/benchmark-engineered-shooting-1404');
 const cfg={atmosphere:'exponential-occlusion',geometry:'flat',radius:R/2,towers:2,repeats:1};
 const legacy=benchmark.run({...cfg,physicalWorld:false});
 assert.equal(legacy.qualifiedInSample,true,JSON.stringify(legacy.rows[0].comparison.violations));
 assert.ok(legacy.maxCoordinateDeltaMetres<=legacy.rows[0].comparison.toleranceMetres);
});

test('140.7: full gate remains conservative even when sampled rays agree',()=>{
 const q=qualification.checkRayGrid({suite:'smoke'});
 assert.equal(q.unqualified,0,JSON.stringify(q.issues));
 assert.equal(q.byKind['near-observer'].count,56);
 assert.equal(q.byKind['near-observer'].unqualified,0);
});

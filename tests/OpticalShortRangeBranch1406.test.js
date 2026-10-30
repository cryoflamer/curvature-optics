'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const projection=require('../src/optics/OpticalTargetProjection');
const tracer=require('../src/optics/OpticalRayTracer');
const diag=require('../tools/diagnose-short-range-shooting-1406');
const R=6371000;

test('140.6: short-range baseline failure is a bracket-domain overshoot, not an absent ray',()=>{
 const c={atmosphere:'exponential-occlusion',geometry:'flat',radius:R/2,
  eye:15,distance:0.1,height:0};
 const v=diag.solveCase(c);
 assert.equal(v.originalStatus,'solver_failed');
 assert.match(v.originalReason,/bracket left the forward-x integration domain/);
 assert.equal(v.cause,'initial bracket probe crosses forward-x angle bound');
 assert.equal(v.boundedStatus,'visible');
 assert.equal(v.experimentalStatus,'visible');
 assert.equal(v.fineStatus,'visible');
 assert.equal(v.ultraStatus,'visible');
 assert.equal(v.recoveredOriginalFailure,true);
 assert.ok(v.boundedInitialSpanRadians<v.angularMarginRadians);
 assert.ok(v.locallyQualified,JSON.stringify(v.violations));
 assert.ok(Math.abs(v.angles.bounded-v.angles.independentFlat)<2e-8);
 // No change to the default solver even after running the diagnostic.
 const production=projection.solve({geometry:'flat',observerHeight:15,
  atmosphere:'exponential-occlusion',profileOptions:{occlusionRadius:R/2},
  target:[0.1,0],step:2000});
 assert.equal(production.status,'solver_failed');
});

test('140.6: Snell invariant supplies an independent monotone flat branch for both profiles',()=>{
 for(const atmosphere of ['exponential-occlusion','inverse-spherical']){
  for(const distance of [0.1,0.3,1,10,100]){
   const c={atmosphere,geometry:'flat',radius:R/2,eye:15,distance,height:0};
   const v=diag.solveCase(c);
   assert.equal(v.independentFlatOracle.status,'monotone-downward');
   assert.ok(Math.abs(v.angles.bounded-v.angles.independentFlat)<2e-8,
    `${atmosphere}/${distance} difference: ${v.angles.bounded-v.angles.independentFlat}`);
   assert.ok(v.locallyQualified,JSON.stringify(v.violations));
  }
 }
 // Closed-form exponential horizontal integral and independent Simpson
 // quadrature for the same n(h) must agree in their shared regular domain.
 const profile=tracer.atmosphere('exponential-occlusion',{occlusionRadius:R/2});
 const p=0.3;
 const numeric=diag.flatHorizontalRange(profile,15,0,p,512);
 profile._analyticExponentialRadius=R/2;
 const exact=diag.flatHorizontalRange(profile,15,0,p,512);
 assert.ok(Math.abs(numeric-exact)<1e-6,`${numeric} vs ${exact}`);
});

test('140.6: all 16 reference near-eye misses are recovered without production promotion',()=>{
 const report=diag.run();
 assert.equal(report.caseCount,56);
 assert.equal(report.baselineFailures,16);
 assert.equal(report.recoveredBaselineFailures,16);
 assert.equal(report.unexplainedBaselineFailures,0);
 assert.equal(report.independentFlatOracleChecks,28);
 assert.equal(report.issues.length,0,JSON.stringify(report.issues));
 assert.equal(report.locallyQualified,true);
 assert.equal(report.globalBranchCertified,false);
 assert.equal(report.defaultPromotionAllowed,false);
 assert.equal(report.rows.filter(r=>r.locallyQualified).length,56);
});

test('140.6: unsupported close-to-vertical rays fail closed instead of being certified',()=>{
 const c={atmosphere:'exponential-occlusion',geometry:'flat',radius:R,
  eye:15,distance:0.001,height:0};
 const v=diag.solveCase(c);
 assert.equal(v.originalStatus,'solver_failed');
 assert.equal(v.locallyQualified,false);
 assert.match(v.violations.join(' '),/outside forward-x domain/);
});

test('140.6: invalid solver refinement and oracle domains are rejected',()=>{
 assert.throws(()=>diag.run({step:100,fineStep:100,ultraStep:10}),/ultraStep/);
 assert.throws(()=>diag.run({step:100,fineStep:20,ultraStep:20}),/ultraStep/);
 assert.throws(()=>diag.independentFlatOracle({atmosphere:'vacuum',radius:R,
  eye:15,distance:1,height:0}),/Unsupported/);
 assert.throws(()=>diag.flatHorizontalRange(tracer.atmosphere('standard'),15,0,0.1,33),/quadrature/);
});

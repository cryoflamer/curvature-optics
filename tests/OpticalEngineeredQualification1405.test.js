'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const projection=require('../src/optics/OpticalTargetProjection');
const rt=require('../src/optics/OpticalRayTracer');
const qualification=require('../tools/qualify-engineered-shooting-1405');
const benchmark=require('../tools/benchmark-engineered-shooting-1404');
const R=6371000;
function fake(status='visible',angle=0,contact=null){
 return {status,angle,residual:0,pathLength:10,ray:{travelled:10,
  hitGround:contact!==null,event:contact===null?null:{contact}}};
}

test('140.5: ray gate rejects false successes, branch differences and ground event changes',()=>{
 assert.equal(qualification.compareRays(fake(),fake()).qualified,true);
 assert.equal(qualification.compareRays(fake(),fake('blocked')).qualified,false);
 assert.equal(qualification.compareRays(fake(),fake('visible',3e-8)).qualified,false);
 assert.equal(qualification.compareRays(fake('solver_failed',null),
  fake('solver_failed',null)).qualified,false);
 assert.equal(qualification.compareRays(fake('visible',0,'crossing'),
  fake('visible',0,'grazing')).qualified,false);
 assert.equal(qualification.compareRays(fake('blocked',0,'crossing'),
  fake('blocked',0,null)).qualified,false);
 const badlyIntegrated=fake();badlyIntegrated.residual=0.1;
 assert.equal(qualification.compareRays(fake(),badlyIntegrated).qualified,false);
});

test('140.7: near-eye reference is recovered and still checked against predictor',()=>{
 const o={geometry:'flat',radius:R,observerHeight:15,
  atmosphere:'exponential-occlusion',profileOptions:{occlusionRadius:R/2},
  target:[0.3,0],step:1000};
 const a=projection.solve(o),b=projection.solve({...o,shootingPredictor:true});
 assert.equal(a.status,'visible');
 assert.equal(b.status,'visible');
 assert.equal(qualification.compareRays(a,b).qualified,true);
 assert.ok(Math.abs(a.residual)<1e-10);
 assert.ok(b.angle!==null&&Math.abs(b.residual)<1e-10);
});

test('140.7: physical metric and legacy guide scenes now agree on the fixed bracket',()=>{
 const cfg={atmosphere:'exponential-occlusion',geometry:'flat',radius:R/2,
  towers:2,repeats:1};
 const modern=benchmark.run({...cfg,physicalWorld:true});
 const older=benchmark.run({...cfg,physicalWorld:false});
 assert.equal(modern.physicalWorld,true);
 assert.equal(modern.qualifiedInSample,true,JSON.stringify(modern.rows[0].comparison));
 assert.equal(older.physicalWorld,false);
 assert.equal(older.qualifiedInSample,true);
 assert.ok(older.maxCoordinateDeltaMetres<=older.rows[0].comparison.toleranceMetres);
});

test('140.7: repaired short rays pass the smoke qualification without default promotion',()=>{
 const r=qualification.run({suite:'smoke'});
 assert.equal(r.grid.byKind['horizon-scale'].count,128);
 assert.equal(r.grid.byKind['horizon-scale'].unqualified,0);
 assert.equal(r.grid.byKind['near-observer'].unqualified,0);
 assert.equal(r.warmStarts.unqualified,0);
 assert.ok(r.warmStarts.attempts>0);
 assert.ok(r.warmStarts.accepted>0);
 assert.equal(r.scenes.count,8);
 assert.equal(r.scenes.unqualified,0);
 assert.equal(r.qualifiedInSample,true);
 assert.equal(r.defaultPromotionAllowed,false);
});

test('140.5: the production engineered solver and custom profiles keep the original path',()=>{
 const base={geometry:'flat',radius:R,observerHeight:15,
  atmosphere:'exponential-occlusion',profileOptions:{occlusionRadius:R},
  target:[10000,10],step:2000};
 const def=projection.solve(base),enabled=projection.solve({...base,shootingPredictor:true});
 assert.equal(def.predictorAttempts,0);
 assert.equal(enabled.predictorAccepted,1);
 const {create}=require('../src/optics/OpticalSharedRayField');
 const settings={geometry:'flat',observerHeight:15,distances:[5000,30000],
  heights:[0,65],step:2000,atmosphere:'exponential-occlusion',
  profileOptions:{occlusionRadius:R}};
 const defaultField=create(settings);defaultField.exact(10000,10);
 assert.equal(defaultField.stats().predictorAttempts,0);
 const optField=create({...settings,shootingOptimization:'engineered-experimental'});
 optField.exact(10000,10);
 assert.ok(optField.stats().predictorAttempts>0);
 const custom=create({...settings,atmosphere:undefined,profileOptions:undefined,
  profile:rt.atmosphere('standard'),shootingOptimization:'engineered-experimental'});
 custom.exact(10000,10);
 assert.equal(custom.stats().predictorAttempts,0);
});

test('140.5: invalid suite and invalid refinement steps are rejected',()=>{
 assert.throws(()=>qualification.casesFor('unknown'),/suite/);
 assert.throws(()=>qualification.run({suite:'invalid'}),/suite/);
 assert.throws(()=>qualification.run({step:500,fineStep:500}),/fineStep/);
});

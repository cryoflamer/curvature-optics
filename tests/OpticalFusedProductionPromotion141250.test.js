'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const rt=require('../src/optics/OpticalRayTracer');
const projection=require('../src/optics/OpticalTargetProjection');
const fields=require('../src/optics/OpticalSharedRayField');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const composition=require('../src/scene/CurvatureIndependentComposition');
const {model}=require('../tools/benchmark-adaptive-prism-112');
const R=6371000;
function target(distance,h){return [(R+h)*Math.sin(distance/R),(R+h)*Math.cos(distance/R)-R];}
function options(){return {geometry:'globe',radius:R,observerHeight:15,
  target:target(1500,30),atmosphere:'standard',shootingPredictor:true,
  profileOptions:{refractivity:0.000293,scaleHeight:7350}};}
function samePhysical(a,b){
  for(const key of ['status','angle','residual','pathLength','evaluations','shootRK4Calls',
    'predictorAttempts','predictorAccepted','predictorFallbacks',
    'warmStartAttempts','warmStartAccepted','warmStartMisses'])
    assert.deepEqual(a[key],b[key],key);
  assert.deepEqual(a.ray,b.ray);
}

test('140.12.50: prepared built-in standard uses fused gradient by default, explicit legacy forces original n/dn',()=>{
  const request=options();
  const original={...request.profileOptions};
  const ordinary=projection.preparedOptions(request);
  const fused=projection.preparedOptions({...request,traceOptimization:'fused-gradient'});
  const legacy=projection.preparedOptions({...request,traceOptimization:'legacy',
    profileOptions:{...request.profileOptions,experimentalFusedGradient:true,
      experimentalScalarRK4:true}});
  assert.equal(typeof ordinary.profile.fusedGradient,'function');
  assert.equal(typeof fused.profile.fusedGradient,'function');
  assert.equal(legacy.profile.fusedGradient,undefined);
  assert.equal(legacy.profile.scalarRK4,undefined);
  assert.equal(rt.atmosphere('standard').fusedGradient,undefined,
    'raw RK4 diagnostic reference must stay unchanged');
  assert.deepEqual(request.profileOptions,original,'do not mutate caller options');
  const baseline=projection.solve(legacy),promoted=projection.solve(ordinary),explicit=projection.solve(fused);
  samePhysical(promoted,baseline);
  samePhysical(promoted,explicit);
});

test('140.12.50: all supported standard constants preserve exact trace and shooting parity',()=>{
  for(const profileOptions of [{},{refractivity:0,scaleHeight:7350},
      {refractivity:0.0001,scaleHeight:10000},{refractivity:0.0005,scaleHeight:4000}]){
    const request={...options(),profileOptions};
    for(const eye of [0,2,15,100])for(const [distance,h] of [[60,0],[1000,10],[9000,0]]){
      const opts={...request,observerHeight:eye,target:target(distance,h),step:400};
      const defaultResult=projection.solve(projection.preparedOptions(opts));
      const legacyResult=projection.solve(projection.preparedOptions({...opts,traceOptimization:'legacy'}));
      samePhysical(defaultResult,legacyResult);
    }
  }
});

test('140.12.50: shared ray-field defaults to fused and legacy rollback uses independent cache and identical optical physics',()=>{
  const cfg={geometry:'globe',radius:R,observerHeight:15,atmosphere:'standard',
    distances:[50,1000,9000],heights:[0,10,100],step:500};
  const standard=fields.create(cfg);
  const fused=fields.create({...cfg,traceOptimization:'fused-gradient'});
  const legacy=fields.create({...cfg,traceOptimization:'legacy'});
  for(const d of [50,1000,9000])for(const h of [0,10,100]){
    assert.deepEqual(standard.exact(d,h),fused.exact(d,h));
    assert.deepEqual(standard.exact(d,h),legacy.exact(d,h));
  }
  assert.equal(standard.stats().traceOptimizationApplied,'fused-gradient');
  assert.equal(fused.stats().traceOptimizationApplied,'fused-gradient');
  assert.equal(legacy.stats().traceOptimizationApplied,'legacy');
  assert.equal(legacy.stats().preflightGroundSteps,0);
  assert.equal(standard.stats().preflightGroundSteps,0);
  const preflight=fields.create({...cfg,traceOptimization:'fused-preflight'});
  preflight.exact(1000,0);
  assert.ok(preflight.stats().preflightGroundSteps>0);
  assert.equal(preflight.stats().traceOptimizationApplied,'fused-preflight');
  assert.throws(()=>fields.create({...cfg,traceOptimization:'not-a-mode'}),
    /Unknown standard trace optimization/);
});

test('140.12.50: non-standard and explicit custom profiles never inherit promoted kernel',()=>{
  const base=options();
  for(const atmosphere of ['vacuum','inverse-spherical','exponential-occlusion']){
    const profileOptions=atmosphere==='vacuum'?undefined:{occlusionRadius:R};
    const a=projection.preparedOptions({...base,atmosphere,profileOptions});
    const b=projection.preparedOptions({...base,atmosphere,profileOptions,traceOptimization:'legacy'});
    const c=projection.preparedOptions({...base,atmosphere,profileOptions,traceOptimization:'fused-gradient'});
    for(const p of [a,b,c])assert.equal(p.profile.fusedGradient,undefined);
    samePhysical(projection.solve(a),projection.solve(b));
    samePhysical(projection.solve(a),projection.solve(c));
  }
  const profile=rt.atmosphere('custom',{n:()=>1.0001,dn:()=>0});
  for(const mode of [undefined,'legacy','fused-gradient','scalar-rk4']){
    const opts={...base,profile,traceOptimization:mode};
    delete opts.atmosphere;delete opts.profileOptions;
    const prepared=projection.preparedOptions(opts);
    assert.equal(prepared.profile,profile);
    assert.equal(prepared.profile.fusedGradient,undefined);
    samePhysical(projection.solve(prepared),projection.solve({...opts,traceOptimization:undefined}));
  }
});

test('140.12.50: four complete physical compositions match legacy after production promotion',()=>{
  const configs=[{eye:15,dist:[50,25550]},{eye:2,dist:[50,3500]},
    {eye:15,dist:[9000,22000]},{eye:100,dist:[25000,65000]}];
  for(const c of configs){
    const m=model(2,'globe');m.Height=c.eye;m.ObjDist=c.dist;
    const input=composition.composeOpticalMain(m,true);
    const render=mode=>optics.create().transform(input,m,{atmosphere:'standard',
      settings:mode?{traceOptimization:mode}:{}});
    const current=render(null),legacy=render('legacy');
    assert.deepEqual(current.composition.scene.primitives,legacy.composition.scene.primitives);
    for(const key of ['visibleSegments','unresolved','hiddenLeaves','boundaryClipped',
      'fillTriangles','fillUnresolved','fillHidden','guideSolves','towerSolves'])
      assert.deepEqual(current.stats[key],legacy.stats[key],c.eye+' '+key);
    assert.equal(current.stats.fieldStats.shootRK4Calls,legacy.stats.fieldStats.shootRK4Calls);
  }
});

test('140.12.74: Modern runs the promoted default CPU RK4 without experimental frame controls',()=>{
  const ui=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
  assert.doesNotMatch(ui,/conformalCompareB|conformal-experimental|runFusedProductionGate141249/);
  assert.doesNotMatch(html,/ModernCpuResearch|ModernConformalProductionToggle/);
  assert.match(ui,/CurvatureMainCanvasRenderer\.renderPhysical\(g,m,options\)/);
});

test('140.12.50: physical-scene optical cache separates default fused and explicit legacy settings',()=>{
  const m=model(2,'globe');m.Height=15;m.ObjDist=[50,3500];
  const input=composition.composeOpticalMain(m,true);
  const session=optics.create();
  const def=session.transform(input,m,{atmosphere:'standard'});
  assert.equal(def.reused,false);
  assert.equal(def.stats.fieldStats.traceOptimizationApplied,'fused-gradient');
  const again=session.transform(input,m,{atmosphere:'standard'});
  assert.equal(again.reused,true);
  const legacy=session.transform(input,m,{atmosphere:'standard',
    settings:{traceOptimization:'legacy'}});
  assert.equal(legacy.reused,false);
  assert.equal(legacy.stats.fieldStats.traceOptimizationApplied,'legacy');
  const explicit=session.transform(input,m,{atmosphere:'standard',
    settings:{traceOptimization:'fused-gradient'}});
  assert.equal(explicit.reused,false);
  assert.equal(explicit.stats.fieldStats.traceOptimizationApplied,'fused-gradient');
});

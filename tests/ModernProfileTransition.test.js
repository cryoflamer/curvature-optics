'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const tracer=require('../src/optics/OpticalRayTracer');
const compare=require('../src/ui/modern/ModernCompareState');
const experiments=require('../src/ui/modern/ModernExperimentState');
const composed=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const bench=require('../tools/benchmark-adaptive-prism-112');
const temp={temperatureC:15,pressureHpa:1013.25,gradientKPerKm:-6.5};
const R=6371000;
const profile=(source,weight,temperatureProfile=temp)=>tracer.atmosphere('profile-transition',{
  occlusionRadius:R,transitionProfile:{source,weight},temperatureProfile});
function near(a,b,tol=1e-13){assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);}

test('New transition exactly reproduces preexisting endpoints without altering either',()=>{
  const standard=tracer.atmosphere('standard');
  const engineered=tracer.atmosphere('exponential-occlusion',{occlusionRadius:R});
  const hydro=tracer.atmosphere('temperature-lapse',temp);
  for(const h of [-2,0,100,1000,2000,8000,25000]){
    const a=profile('standard',0),b=profile('temperature-lapse',0),c=profile('standard',1);
    near(a.n(h),standard.n(h));near(a.dn(h),standard.dn(h));
    near(b.n(h),hydro.n(h));near(b.dn(h),hydro.dn(h));
    near(c.n(h),engineered.n(h));near(c.dn(h),engineered.dn(h));
  }
  // The two 'exponentials' have opposite gradients in Curvature.
  assert.ok(standard.dn(0)<0&&engineered.dn(0)>0);
});

test('Intermediate interpolation is analytic and gradient affects only the hydrostatic component',()=>{
  const w=.35,h=500,eps=.05;
  const base=profile('temperature-lapse',w,temp);
  const other=profile('temperature-lapse',w,{...temp,gradientKPerKm:18});
  near(base.dn(h),(base.n(h+eps)-base.n(h-eps))/(2*eps),1e-12);
  assert.ok(Math.abs(base.dn(h)-other.dn(h))>1e-9);
  const noEffect=profile('temperature-lapse',1,{...temp,gradientKPerKm:18});
  near(noEffect.n(h),profile('temperature-lapse',1,temp).n(h));
  // At zero surface gradient the preexisting dry hydrostatic model is exactly
  // an isothermal atmosphere, but H is NOT the fixed Standard H=7350m.
  const iso=tracer.atmosphere('temperature-lapse',{...temp,gradientKPerKm:0});
  const H=287.05*(273.15+temp.temperatureC)/9.80665;
  near(iso.n(h),1+0.000293*Math.exp(-h/H));
  assert.ok(Math.abs(H-7350)>1000);
});

test('Intermediate transition changes forward traced paths continuously',()=>{
  const trace=weight=>tracer.trace({geometry:'flat',profile:profile('standard',weight),
    observerHeight:150,angle:0,length:18000,step:200});
  const points=[0,.1,.5,1].map(trace);
  points.forEach(p=>{assert.equal(p.hitGround,false);assert.ok(Number.isFinite(p.z));});
  // Stronger increasing refractive index bends horizontal rays upward, not downward.
  assert.ok(points[0].z<points[1].z&&points[1].z<points[2].z&&points[2].z<points[3].z);
});

test('Compare and saved experiments accept independent transition parameters, reject invalid profiles',()=>{
  const pair=compare.initial({showModel:1,rEarth:R},'standard',R,temp);
  const a=compare.update(compare.update(pair,'A','atmosphere','profile-transition'),
    'A','transitionProfile',{source:'standard',weight:.2});
  const b=compare.update(compare.update(a,'B','atmosphere','profile-transition'),
    'B','transitionProfile',{source:'temperature-lapse',weight:.85});
  assert.equal(b.A.transitionProfile.weight,.2);
  assert.equal(b.B.transitionProfile.source,'temperature-lapse');
  assert.equal(pair.A.transitionProfile.weight,0);
  assert.throws(()=>compare.transitionProfile({source:'temperature-lapse',weight:1.1}));
  assert.throws(()=>compare.transitionProfile({source:'bogus',weight:0}));
  assert.throws(()=>profile('standard',-1));
  assert.throws(()=>profile('bogus',.5));
  assert.throws(()=>tracer.atmosphere('profile-transition',{transitionProfile:{source:'standard',weight:.5}}));

  const m={Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    viewcenterHorizon:3,deviceRatio:1.5,showModel:1,rEarth:R,showGrid:1,
    DemoText:'',Description:'',NObjects:[2,0],ObjType:[3,3],ObjDist:[1000,2000],
    ObjDeltaDist:[300,300],ObjSideType:[0,0],ObjSidePos:[0,0],ObjSideVar:[0,0],
    ObjSizeType:[0,0],ObjSize:[20,20],ObjSizeVar:[0,0]};
  const save=experiments.capture(m,{atmosphere:'profile-transition',occlusionRadius:R,
    temperatureProfile:temp,transitionProfile:{source:'temperature-lapse',weight:.5},
    preset:'custom',resetPreset:'pontchartrain'},b,
  {mode:'compare',eyeLevel:false,horizon:true,selected:'B'});
  assert.deepEqual(experiments.readUrl(new URL(experiments.urlWithExperiment(
    'https://example.org/CurvatureModern.html',save)).search),save);
  assert.equal(save.scene.transitionProfile.weight,.5);
  assert.equal(save.compare.B.transitionProfile.weight,.85);
  const old=JSON.parse(JSON.stringify(save));
  delete old.scene.transitionProfile;delete old.compare.A.transitionProfile;
  delete old.compare.B.transitionProfile;
  const migrated=experiments.validate(old);
  assert.deepEqual(migrated.scene.transitionProfile,{source:'standard',weight:0});
  assert.deepEqual(migrated.compare.A.transitionProfile,{source:'standard',weight:0});
  assert.deepEqual(migrated.compare.B.transitionProfile,{source:'standard',weight:0});
});

test('Physical ray-field cache includes transition source, weight and active temperature parameters',()=>{
  const m=bench.model(2,'globe');m.NObjects=[1,0];m.ObjDist=[1500,10000];
  const source=composed.composeOpticalMain(m,true,{physicalWorld:true});
  const session=optics.create();
  const base={atmosphere:'profile-transition',occlusionRadius:R,temperatureProfile:temp,
    transitionProfile:{source:'standard',weight:0},
    settings:{step:300,fieldAdaptiveDepth:1,maxSamples:2000}};
  const a=session.transform(source,m,base);
  assert.equal(a.reused,false);
  assert.equal(session.transform(source,m,base).reused,true);
  const c={...base,transitionProfile:{source:'standard',weight:.1}};
  assert.equal(session.transform(source,m,c).reused,false);
  assert.equal(session.transform(source,m,c).reused,true);
  const d={...c,transitionProfile:{source:'temperature-lapse',weight:.1}};
  assert.equal(session.transform(source,m,d).reused,false);
  const e={...d,temperatureProfile:{...temp,gradientKPerKm:10}};
  assert.equal(session.transform(source,m,e).reused,false);
  assert.equal(session.transform(source,m,e).reused,true);
});

test('Modern Scene and Compare expose explicit, separated physical and mathematical controls',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  for(const id of ['ModernTransitionSceneSource','ModernTransitionSceneWeight',
    'ModernTransitionCompareSource','ModernTransitionCompareWeight',
    'ModernTransitionSceneFields','ModernTransitionCompareFields'])
    assert.ok(html.includes(`id="${id}"`),id);
  assert.match(app,/traceKind==='profile-transition'/);
  assert.match(app,/transitionProfile:spec\?spec\.transitionProfile/);
  assert.match(html,/Mathematical interpolation of n\(h\), NOT an atmospheric temperature law/);
});

test('Exact transition endpoints produce byte-identical optical compositions to existing solvers',()=>{
  const m=bench.model(2,'globe');m.NObjects=[1,0];m.ObjDist=[1500,10000];
  const source=composed.composeOpticalMain(m,true,{physicalWorld:true});
  const opt={occlusionRadius:R,temperatureProfile:temp,
    settings:{step:300,fieldAdaptiveDepth:1,maxSamples:2000}};
  for(const [start,weight,original] of [
    ['standard',0,'standard'],
    ['temperature-lapse',0,'temperature-lapse'],
    ['standard',1,'exponential-occlusion']
  ]){
    const old=optics.create().transform(source,m,{...opt,atmosphere:original});
    const cur=optics.create().transform(source,m,{...opt,atmosphere:'profile-transition',
      transitionProfile:{source:start,weight}});
    assert.deepEqual(cur.composition,old.composition,`${start} / ${weight}`);
  }
});

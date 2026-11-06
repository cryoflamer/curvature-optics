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
const R=6371000,a=9.80665/287.05;
const temp={temperatureC:15,pressureHpa:1013.25,gradientKPerKm:-6.5};
const inverse=(weight,source='temperature-lapse',t=temp,r=R)=>tracer.atmosphere('inverse-temperature',{
  occlusionRadius:r,temperatureProfile:t,inverseProfile:{source,weight}});
const near=(x,y,tolerance=1e-10)=>assert.ok(Math.abs(x-y)<=tolerance,`${x} versus ${y}, tolerance ${tolerance}`);

test('Surface refractivity is positive and matches p/T for every inverse blend',()=>{
  for(const source of ['standard','temperature-lapse'])for(const w of [0,.01,.5,1]){
    const p=inverse(w,source);
    near(p.n(0),1.000293,1e-12);
    near(p.temperatureCAt(0),15,1e-9);
    assert.ok(p.surfaceRefractivity>0);
  }
});

test('0% reproduces the hydrostatic model and the default Standard baseline exactly',()=>{
  const hydro=tracer.atmosphere('temperature-lapse',temp);
  const standard=tracer.atmosphere('standard');
  for(const h of [0,5,100,1500,9000,25000])for(const [source,p] of [
    ['temperature-lapse',hydro],['standard',standard]]){
    const computed=inverse(0,source);
    near(computed.n(h),p.n(h),2e-15);
    near(computed.dn(h),p.dn(h),1e-17);
    if(source==='temperature-lapse')near(computed.temperatureCAt(h),p.temperatureCAt(h),1e-6);
  }
  near(inverse(0).surfaceGradientKPerKm,-6.5,1e-7);
  near(inverse(0,'standard').surfaceGradientKPerKm,1000*(-a+288.15/7350),1e-9);
  assert.equal(inverse(0).validUntilMetres,Infinity);
  assert.equal(inverse(0,'standard').validUntilMetres,Infinity);
});

test('100% produces the same ray-index logarithmic gradient as engineered exp(h/R)',()=>{
  const direct=tracer.atmosphere('exponential-occlusion',{occlusionRadius:R});
  const p=inverse(1),p2=inverse(1,'standard');
  for(const h of [0,100,1000,2000,3500,20000,100000]){
    near(p.dn(h)/p.n(h),direct.dn(h)/direct.n(h),1e-18);
    near(p.n(h)/direct.n(h),1.000293,2e-15);
    near(p2.n(h),p.n(h),1e-15);
    near(p2.dn(h),p.dn(h),1e-17);
  }
  const args={geometry:'flat',observerHeight:150,angle:0,length:25000,step:100};
  const aRay=tracer.trace({...args,profile:direct}),bRay=tracer.trace({...args,profile:p});
  near(aRay.z,bRay.z,2e-7);
  assert.equal(aRay.hitGround,bRay.hitGround);
  near(p.surfaceGradientKPerKm,-188.5719,0.001);
});

test('Inverse solution obeys exact hydrostatic differential identity and its analytic derivative',()=>{
  for(const w of [.05,.25,.6,1]){
    const p=inverse(w);
    for(const h of [0,20,200,800,1500,2200]){
      const T=p.temperatureCAt(h)+273.15,N=p.n(h)-1,dN=p.dn(h);
      const dT=p.gradientKPerKmAt(h)/1000;
      near(dT*N+T*dN,-a*N,1e-12);
      const delta=.02;
      const slope=(p.temperatureCAt(h+delta)-p.temperatureCAt(h-delta))/(2*delta);
      near(slope,dT,5e-8);
      const indexSlope=(p.n(h+delta)-p.n(h-delta))/(2*delta);
      near(indexSlope,dN,5e-12);
    }
  }
});

test('Surface-gradient input can parameterize the whole family uniquely',()=>{
  for(const source of ['temperature-lapse','standard']){
    const start=inverse(0,source).surfaceGradientKPerKm;
    const goal=inverse(1,source).surfaceGradientKPerKm;
    for(const w of [0,.01,.2,.69,1]){
      const profile=inverse(w,source);
      near(profile.surfaceGradientKPerKm,start+w*(goal-start),1e-8);
      near((profile.surfaceGradientKPerKm-start)/(goal-start),w,1e-10);
    }
  }
});

test('Finite 0 Kelvin altitude is a physical cutoff; optical n(h) is still a formal continuation',()=>{
  const p=inverse(1);
  assert.ok(p.validUntilMetres>4000&&p.validUntilMetres<4100,p.validUntilMetres);
  assert.ok(Number.isFinite(p.temperatureCAt(3000)));
  assert.equal(Number.isNaN(p.temperatureCAt(p.validUntilMetres)),true);
  assert.equal(Number.isNaN(p.temperatureCAt(5000)),true);
  assert.equal(Number.isNaN(p.gradientKPerKmAt(5000)),true);
  assert.ok(p.n(5000)>1&&Number.isFinite(p.dn(5000)));
  for(const w of [.01,.25,.5,1])assert.ok(Number.isFinite(inverse(w).validUntilMetres));
  const cold={...temp,temperatureC:-30};
  const s=inverse(0,'standard',cold);
  assert.ok(Number.isFinite(s.validUntilMetres)&&s.validUntilMetres>0);
});

test('Wrong inverse configurations cannot slip into physically labeled renderer',()=>{
  for(const weight of [-.2,1.1,NaN,Infinity,'0.5'])
    assert.throws(()=>tracer.atmosphere('inverse-temperature',{inverseProfile:{source:'standard',weight},
      occlusionRadius:R,temperatureProfile:temp}));
  assert.throws(()=>inverse(.5,'bogus'));
  assert.throws(()=>inverse(.5,'standard',temp,0));
  assert.throws(()=>inverse(.5,'temperature-lapse',{...temp,pressureHpa:0}));
});

test('Scene experiment, A/B independent inverse settings and URL round-trip',()=>{
  const scene={showModel:1,rEarth:R};
  const initial=compare.initial(scene,'standard',R,temp);
  const A=compare.update(compare.update(initial,'A','atmosphere','inverse-temperature'),'A','inverseProfile',{source:'standard',weight:.22});
  const B=compare.update(compare.update(A,'B','atmosphere','inverse-temperature'),'B','inverseProfile',{source:'temperature-lapse',weight:.77});
  assert.equal(B.A.inverseProfile.weight,.22);
  assert.equal(B.B.inverseProfile.weight,.77);
  assert.equal(B.A.inverseProfile.source,'standard');
  assert.equal(initial.B.inverseProfile.weight,0);
  const m={Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    viewcenterHorizon:3,deviceRatio:1.5,showModel:1,rEarth:R,showGrid:1,
    DemoText:'',Description:'',NObjects:[2,0],ObjType:[3,3],ObjDist:[1000,2000],
    ObjDeltaDist:[300,300],ObjSideType:[0,0],ObjSidePos:[0,0],ObjSideVar:[0,0],
    ObjSizeType:[0,0],ObjSize:[20,20],ObjSizeVar:[0,0]};
  const current=experiments.capture(m,{atmosphere:'inverse-temperature',occlusionRadius:R,
    temperatureProfile:temp,inverseProfile:{source:'temperature-lapse',weight:.4},
    preset:'custom',resetPreset:'pontchartrain'},B,{mode:'compare',eyeLevel:false,horizon:true,
      selected:'B',showTemperatureProfile:true,temperaturePlacement:'outside-left'});
  assert.deepEqual(experiments.decode(experiments.encode(current)),current);
  assert.deepEqual(experiments.readUrl(new URL(experiments.urlWithExperiment('https://example.org/CurvatureModern.html',current)).search),current);
  const old=structuredClone(current);
  delete old.scene.inverseProfile;delete old.compare.A.inverseProfile;delete old.compare.B.inverseProfile;
  const migrated=experiments.validate(old);
  assert.deepEqual(migrated.scene.inverseProfile,{source:'temperature-lapse',weight:0});
  assert.deepEqual(migrated.compare.A.inverseProfile,{source:'temperature-lapse',weight:0});
  assert.deepEqual(migrated.compare.B.inverseProfile,{source:'temperature-lapse',weight:0});
  const bad=structuredClone(current);bad.compare.A.inverseProfile.weight=-2;
  assert.throws(()=>experiments.validate(bad));
});

test('Physical optics field is sensitive to inverse target and temperature; cached when unchanged',()=>{
  const m=bench.model(2,'globe');m.NObjects=[1,0];m.ObjDist=[1500,10000];
  const source=composed.composeOpticalMain(m,true,{physicalWorld:true});
  const session=optics.create();
  const opts={atmosphere:'inverse-temperature',occlusionRadius:R,temperatureProfile:temp,
    inverseProfile:{source:'temperature-lapse',weight:.2},
    settings:{step:300,fieldAdaptiveDepth:1,maxSamples:2000}};
  assert.equal(session.transform(source,m,opts).reused,false);
  assert.equal(session.transform(source,m,opts).reused,true);
  const changed={...opts,inverseProfile:{source:'temperature-lapse',weight:.8}};
  assert.equal(session.transform(source,m,changed).reused,false);
  assert.equal(session.transform(source,m,changed).reused,true);
  const changedTemp={...changed,temperatureProfile:{...temp,pressureHpa:900}};
  assert.equal(session.transform(source,m,changedTemp).reused,false);
  const changedSource={...changedTemp,inverseProfile:{source:'standard',weight:.8}};
  assert.equal(session.transform(source,m,changedSource).reused,false);
});

test('Scene and Compare HTML expose new controls, temperature column, and no additional HTML entrypoints',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.resolve(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  for(const side of ['Scene','Compare'])for(const suffix of ['Fields','Source','Weight','Gradient','Status'])
    assert.ok(html.includes(`id="ModernInverse${side}${suffix}"`),side+suffix);
  assert.match(html,/Inverse atmosphere · required temperature/);
  assert.match(app,/kind==='inverse-temperature'/);
  assert.match(app,/inverseProfile:spec\?spec\.inverseProfile:state\.inverseProfile/);
  assert.match(app,/validUntilMetres/);
});

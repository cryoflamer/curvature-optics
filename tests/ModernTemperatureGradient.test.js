'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const tracer=require('../src/optics/OpticalRayTracer');
const compare=require('../src/ui/modern/ModernCompareState');
const experiment=require('../src/ui/modern/ModernExperimentState');
const composed=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const bench=require('../tools/benchmark-adaptive-prism-112');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const base={temperatureC:15,pressureHpa:1013.25,gradientKPerKm:-6.5};

test('Temperature model implements dry hydrostatic refractivity and local surface lapse',()=>{
  const p=tracer.atmosphere('temperature-lapse',base);
  assert.ok(Math.abs(p.n(0)-1.000293)<1e-12);
  assert.ok(Math.abs(p.temperatureCAt(0)-15)<1e-10);
  // dT/dh at 0 is L and relaxes at heights; n(h) derivative is analytic.
  const delta=0.01;
  assert.ok(Math.abs((p.temperatureCAt(delta)-p.temperatureCAt(-delta))/(2*delta)+0.0065)<3e-8);
  for(const h of [0,3,100,800,2000,8000]){
    const fd=(p.n(h+delta)-p.n(h-delta))/(2*delta);
    assert.ok(Math.abs(fd-p.dn(h))<2e-12,`n'(h) disagrees at ${h} m`);
    assert.ok(p.n(h)>=1&&p.n(h)<1.001);
    assert.ok(Number.isFinite(p.dn(h)));
  }
  assert.ok(p.temperatureCAt(2000)<p.temperatureCAt(0));
  assert.ok(p.temperatureCAt(12000)>-273.15);
  // Legacy's coefficient calculation and the fixed Standard refractivity are unchanged.
  const standard=tracer.atmosphere('standard');
  assert.equal(standard.n(0),1.000293);
  assert.ok(Math.abs(standard.n(1000)-(1+0.000293*Math.exp(-1000/7350)))<1e-14);
});

test('Temperature gradient and pressure affect optical ray curvature, not just a label',()=>{
  const pLow=tracer.atmosphere('temperature-lapse',{...base,gradientKPerKm:-20});
  const pHigh=tracer.atmosphere('temperature-lapse',{...base,gradientKPerKm:20});
  assert.ok(pHigh.dn(0)<pLow.dn(0),'a positive inversion gives a stronger downward n gradient');
  const shoot=p=>tracer.trace({geometry:'flat',profile:p,observerHeight:200,
    angle:0,length:10000,step:100});
  const a=shoot(pLow),b=shoot(pHigh);
  assert.equal(a.hitGround,false);assert.equal(b.hitGround,false);
  assert.ok(b.z<a.z-0.5,`trajectory should bend more: ${a.z}, ${b.z}`);
  const dense=tracer.atmosphere('temperature-lapse',{...base,pressureHpa:1100});
  const thin=tracer.atmosphere('temperature-lapse',{...base,pressureHpa:800});
  assert.ok(Math.abs(dense.dn(0))>Math.abs(thin.dn(0)));
  for(const invalid of [
    {...base,temperatureC:-100},{...base,gradientKPerKm:50},
    {...base,gradientKPerKm:NaN},{...base,pressureHpa:0}])
    assert.throws(()=>tracer.atmosphere('temperature-lapse',invalid));
});

test('Compare keeps independent temperature profiles and shared A/B haze',()=>{
  const scene={showModel:1,rEarth:6371000};
  const initial=compare.initial(scene,'temperature-lapse',6371000,{...base,temperatureC:28});
  assert.equal(initial.A.temperatureProfile.temperatureC,28);
  assert.equal(initial.B.temperatureProfile.temperatureC,28);
  assert.notStrictEqual(initial.A.temperatureProfile,initial.B.temperatureProfile);
  const adjusted=compare.update(initial,'B','temperatureProfile',{...base,gradientKPerKm:12});
  assert.equal(adjusted.A.temperatureProfile.gradientKPerKm,-6.5);
  assert.equal(adjusted.B.temperatureProfile.gradientKPerKm,12);
  assert.equal(initial.B.temperatureProfile.gradientKPerKm,-6.5);
  assert.deepEqual(adjusted.A.visibility,adjusted.B.visibility);
  assert.throws(()=>compare.update(initial,'A','temperatureProfile',{...base,pressureHpa:100}));
});

test('Temperature parameters, A/B, and column toggle survive old/new experiments',()=>{
  const m={Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    viewcenterHorizon:3,deviceRatio:1.5,showModel:1,rEarth:6371000,
    showGrid:1,DemoText:'',Description:'',
    NObjects:[2,0],ObjType:[3,3],ObjDist:[1000,2000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[20,20],ObjSizeVar:[0,0]};
  const config=compare.preset('standard-vacuum');
  const A=compare.update(config,'A','atmosphere','temperature-lapse');
  const B=compare.update(A,'A','temperatureProfile',{...base,gradientKPerKm:14});
  const C=compare.update(B,'B','temperatureProfile',{...base,temperatureC:-8});
  const save=experiment.capture(m,{atmosphere:'temperature-lapse',occlusionRadius:6371000,
    temperatureProfile:{...base,pressureHpa:950},preset:'custom',resetPreset:'pontchartrain'},C,
  {mode:'compare',eyeLevel:false,horizon:true,selected:'A',showTemperatureProfile:true});
  assert.deepEqual(experiment.decode(experiment.encode(save)),save);
  assert.equal(save.scene.temperatureProfile.pressureHpa,950);
  assert.equal(save.compare.A.temperatureProfile.gradientKPerKm,14);
  assert.equal(save.compare.B.temperatureProfile.temperatureC,-8);
  assert.equal(save.display.showTemperatureProfile,true);
  const old=JSON.parse(JSON.stringify(save));
  delete old.scene.temperatureProfile;
  delete old.compare.A.temperatureProfile;
  delete old.compare.B.temperatureProfile;
  delete old.display.showTemperatureProfile;
  const migrated=experiment.validate(old);
  assert.deepEqual(migrated.scene.temperatureProfile,base);
  assert.deepEqual(migrated.compare.A.temperatureProfile,base);
  assert.deepEqual(migrated.compare.B.temperatureProfile,base);
  assert.equal(migrated.display.showTemperatureProfile,false);
  const invalid=JSON.parse(JSON.stringify(save));invalid.scene.temperatureProfile.gradientKPerKm=100;
  assert.throws(()=>experiment.validate(invalid));
});

test('Physical optics cache is invalidated by temperature changes, not by chart visibility',()=>{
  const m=bench.model(2,'globe');m.NObjects=[1,0];m.ObjDist=[1500,10000];
  const source=composed.composeOpticalMain(m,true,{physicalWorld:true});
  const session=optics.create();
  const options={atmosphere:'temperature-lapse',temperatureProfile:base,
    settings:{step:300,fieldAdaptiveDepth:1,maxSamples:2000}};
  const a=session.transform(source,m,options);
  assert.equal(a.reused,false);
  const b=session.transform(source,m,options);
  assert.equal(b.reused,true);
  const c=session.transform(source,m,{...options,temperatureProfile:{...base,gradientKPerKm:12}});
  assert.equal(c.reused,false);
  assert.notStrictEqual(c.composition,b.composition);
  const d=session.transform(source,m,{...options,temperatureProfile:{...base,gradientKPerKm:12}});
  assert.equal(d.reused,true);
});

test('Modern UI exposes separate temperature controls and non-Canvas chart columns',()=>{
  const html=read('CurvatureModern.html'),app=read('src/ui/modern/ModernApp.js');
  for(const id of ['ModernTemperatureSceneC','ModernTemperatureCompareC',
    'ModernTemperatureSceneGradient','ModernTemperatureCompareGradient',
    'ModernTemperatureScenePressure','ModernTemperatureComparePressure',
    'ModernShowTemperatureProfile','ModernTemperatureScene','ModernTemperatureA','ModernTemperatureB'])
    assert.ok(html.includes('id="'+id+'"'),`Missing ${id}`);
  assert.match(app,/syncTemperatureColumn\('A'/);
  assert.match(app,/syncTemperatureColumn\('B'/);
  assert.match(app,/root\.CurvatureRayTracer/);
  assert.match(app,/scheduleExperimentSave\(\)/);
  assert.match(read('src/ui/modern/ModernApp.css'),/\.modern-temperature-column/);
});

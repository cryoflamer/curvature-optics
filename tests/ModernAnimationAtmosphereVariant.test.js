'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const projects=require('../src/animation/ModernAnimationProject');
const contracts=require('../src/animation/ModernAnimationContract');
const compatibility=require('../src/animation/ModernAnimationCompatibility');
const variants=require('../src/animation/ModernAnimationAtmosphereVariant');
const catalog=require('../src/animation/ModernDemoCatalog');
const clone=structuredClone;
const soundly=catalog.load().find(d=>d.id==='soundly').project;
function cameraProject(edit=()=>{},version=2){
  const a=clone(soundly.baseExperiment);edit(a);
  const b=clone(a);b.scene.camera.Height+=10;
  const options={id:'variant-test',name:'Atmosphere test',mode:'camera'};
  return version===2?projects.createV2(contracts.create(a,{mode:'camera'}),[a,b],options):
    projects.create([a,b],options);
}
function physicalProject(scope,parameter,atmosphere){
  const a=clone(soundly.baseExperiment);
  if(scope==='scene')a.display.mode='scene';
  a.compare.A.atmosphere=a.compare.B.atmosphere=a.scene.atmosphere=atmosphere;
  const b=clone(a),p=scope==='scene'?b.scene:b.compare[scope];
  if(parameter==='surface.curvature'){
    if(scope==='scene')p.surface.showModel=p.surface.showModel===1?2:1;
    else p.surface=p.surface==='globe'?'flat':'globe';
  }else p.temperatureProfile.gradientKPerKm=4;
  const target={scope,parameter};
  return projects.createV2(contracts.create(a,{mode:'physical',target}),[a,b],{id:'physical-test'});
}
for(const version of [1,2])for(const display of ['scene','compare'])for(const atmosphere of ['vacuum','standard']){
  test(`v${version} ${display} ${atmosphere}: derives only active atmosphere without mutation`,()=>{
    const p=cameraProject(a=>{
      a.display.mode=display;a.scene.atmosphere=display==='scene'?atmosphere:'temperature-lapse';
      a.compare.A.atmosphere=a.compare.B.atmosphere=display==='compare'?atmosphere:'inverse-spherical';
      a.compare.B.temperatureProfile.gradientKPerKm=5;
    },version);
    const before=clone(p),other=atmosphere==='vacuum'?'standard':'vacuum';
    assert.deepEqual(variants.inspect(p),{eligible:true,reason:null,authoredMode:atmosphere,modes:['vacuum','standard']});
    const derived=variants.derive(p,other),expected=clone(p.baseExperiment);
    if(display==='scene'){expected.scene.atmosphere=other;expected.scene.preset='custom';}
    else{expected.compare.A.atmosphere=expected.compare.B.atmosphere=other;expected.compare.preset='custom';}
    assert.deepEqual(derived.baseExperiment,expected);
    assert.deepEqual(derived.keyframes,p.keyframes);
    if(version===2)assert.deepEqual(derived.contract.referenceExperiment,expected);
    assert.deepEqual(projects.validate(derived),derived);
    assert.deepEqual(variants.derive(p,atmosphere),p);
    assert.deepEqual(projects.timeline(derived),projects.timeline(p));
    for(const t of [0,1500,5000])assert.deepEqual(projects.sampleAt(derived,t).scene.camera,projects.sampleAt(p,t).scene.camera);
    assert.deepEqual(p,before);assert.ok(Object.isFrozen(derived.baseExperiment));
  });
}
for(const [a,b,reason] of [['vacuum','standard','different-refraction'],['standard','vacuum','different-refraction'],['temperature-lapse','temperature-lapse','unsupported-atmosphere'],['inverse-spherical','inverse-spherical','unsupported-atmosphere'],['profile-transition','profile-transition','unsupported-atmosphere'],['inverse-temperature','inverse-temperature','unsupported-atmosphere'],['exponential-occlusion','exponential-occlusion','unsupported-atmosphere']]){
  test(`rejects Compare ${a} / ${b}`,()=>{
    const p=cameraProject(e=>{e.compare.A.atmosphere=a;e.compare.B.atmosphere=b;});
    assert.equal(variants.inspect(p).reason,reason);
    assert.throws(()=>variants.derive(p,'vacuum'),/Ineligible/);
  });
}
test('same atmosphere kind but different active gradient is not interchangeable',()=>{
  const p=cameraProject(e=>{e.compare.A.atmosphere=e.compare.B.atmosphere='temperature-lapse';e.compare.B.temperatureProfile.gradientKPerKm=3;});
  assert.equal(variants.inspect(p).reason,'different-refraction');
});
for(const scope of ['scene','A','B'])for(const atmosphere of ['vacuum','standard']){
  test(`curvature channel ${scope} with ${atmosphere} retains physical values`,()=>{
    const p=physicalProject(scope,'surface.curvature',atmosphere);
    const v=variants.derive(p,atmosphere==='vacuum'?'standard':'vacuum');
    assert.deepEqual(v.target,p.target);assert.deepEqual(v.keyframes,p.keyframes);
    assert.ok(contracts.inspectFrames(v.contract,projects.frameExperiments(v)).previewCompatible);
    for(const t of [0,2500,5000]){
      const a=compatibility.effective(projects.sampleAt(p,t)),b=compatibility.effective(projects.sampleAt(v,t));
      assert.deepEqual(scope==='scene'?a.scene.surface:a.compare[scope].surface,scope==='scene'?b.scene.surface:b.compare[scope].surface);
    }
  });
}
for(const scope of ['scene','A','B'])test(`rejects temperature animation ${scope}`,()=>{
  const p=physicalProject(scope,'temperatureProfile.gradientKPerKm','temperature-lapse');
  assert.equal(variants.inspect(p).reason,'atmosphere-channel');
  assert.throws(()=>variants.derive(p,'standard'),/atmosphere-channel/);
});
test('rejects experimental, incomplete and invalid projects and unknown modes',()=>{
  const a=soundly.baseExperiment;
  for(const mode of ['experimental','camera']){
    const p=projects.createV2(contracts.create(a,{mode}),[],{id:'draft'});
    assert.equal(variants.inspect(p).reason,mode==='experimental'?'experimental':'not-preview-ready');
    assert.deepEqual(variants.inspect(p).modes,[]);
  }
  assert.throws(()=>variants.inspect({}),/Invalid/);
  assert.throws(()=>variants.derive(soundly,'other'),/Unknown/);
  const bad=clone(soundly);bad.contract.referenceExperiment.compare.A.atmosphere='standard';
  assert.throws(()=>variants.inspect(bad),/disagrees/);
});
test('shape-valid but incompatible camera framing is not eligible',()=>{
  const p=clone(cameraProject());
  p.keyframes.forEach(frame=>{frame.value.deviceRatio=16/9;});
  assert.equal(projects.ready(p),true);
  assert.equal(variants.inspect(p).reason,'incompatible-frames');
  assert.throws(()=>variants.derive(p,'vacuum'),/incompatible-frames/);
});
test('real Soundly variant keeps all nine frames, timeline, spline trajectory and original intact',()=>{
  const original=JSON.stringify(soundly),standard=variants.derive(soundly,'standard');
  assert.equal(standard.keyframes.length,9);assert.equal(projects.totalMs(standard),59100);
  assert.deepEqual(projects.timeline(standard),projects.timeline(soundly));
  for(let t=0;t<=59100;t+=100){
    const a=projects.sampleAt(soundly,t),b=projects.sampleAt(standard,t);
    assert.deepEqual(b.scene.camera,a.scene.camera);
    assert.equal(b.compare.A.atmosphere,'standard');assert.equal(b.compare.B.atmosphere,'standard');
  }
  assert.equal(JSON.stringify(soundly),original);
  assert.deepEqual(variants.derive(soundly,'vacuum'),soundly);
});
test('classic browser script exposes the same pure engine after its dependencies',()=>{
  const root=path.resolve(__dirname,'..');
  const file='src/animation/ModernAnimationAtmosphereVariant.js';
  const ctx=vm.createContext({CurvatureModernExperimentState:require('../src/ui/modern/ModernExperimentState'),CurvatureModernExperimentFingerprint:require('../src/ui/modern/ModernExperimentFingerprint'),CurvatureModernAnimationProject:projects,CurvatureModernAnimationCompatibility:compatibility,CurvatureModernAnimationContract:contracts});
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
  assert.equal(ctx.CurvatureModernAnimationAtmosphereVariant.derive(soundly,'standard').baseExperiment.compare.A.atmosphere,'standard');
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  assert.equal(html.split(file).length,2);
  for(const dep of ['ModernExperimentState','ModernExperimentFingerprint','ModernAnimationProject','ModernAnimationCompatibility','ModernAnimationContract'])assert.ok(html.indexOf(dep+'.js')<html.indexOf(file));
});

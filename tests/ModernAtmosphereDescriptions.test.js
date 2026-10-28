'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const get=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const ray=require('../src/optics/OpticalRayTracer');
const compare=require('../src/ui/modern/ModernCompareState');
const state=require('../src/ui/modern/ModernExperimentState');

test('134.3: Modern panels show physics descriptions and hide obsolete choices by default',()=>{
  const html=get('CurvatureModern.html'),app=get('src/ui/modern/ModernApp.js');
  for(const id of ['ModernAtmosphereInfo','ModernModelAtmosphereInfo'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.equal((html.match(/value="inverse-spherical" hidden disabled/g)||[]).length,2);
  for(const id of ['flat-inverse','standard-inverse'])
    assert.match(html,new RegExp('value="'+id+'" hidden disabled'));
  assert.match(html,/Exponential refractive profile/);
  assert.match(app,/showLegacyOption\('ModernAtmosphere',state.atmosphere\)/);
  assert.match(app,/showLegacyOption\('ModernModelAtmosphere',spec.atmosphere\)/);
  assert.match(app,/showLegacyOption\('ModernPairPreset',state.compareConfig.preset\)/);
});
test('134.3: documentation constants and engineered profiles agree with the integrator',()=>{
  const app=get('src/ui/modern/ModernApp.js');
  assert.match(app,/0\.000293 × exp\(−h \/ 7350 m\)/);
  assert.match(app,/n₀ × exp\(h \/ R\)/);
  assert.match(app,/n₀ × √\(1 \+ \(1\+h\/R\)⁴ − \(1\+h\/R\)²\)/);
  for(const h of [0,500,2000]){
    const standard=ray.atmosphere('standard');
    assert.ok(Math.abs(standard.n(h)-(1+0.000293*Math.exp(-h/7350)))<1e-14);
    const exp=ray.atmosphere('exponential-occlusion',{occlusionRadius:6371000});
    assert.ok(Math.abs(exp.n(h)-Math.exp(h/6371000))<1e-14);
  }
});
test('134.3: historical inverse profile remains valid in Compare and experiment formats',()=>{
  assert.equal(compare.validate({surface:'flat',radiusKm:6371,atmosphere:'inverse-spherical',occlusionRadius:6371000}).atmosphere,'inverse-spherical');
  assert.equal(compare.preset('flat-inverse').B.atmosphere,'inverse-spherical');
  assert.match(get('src/ui/modern/ModernExperimentState.js'),/inverse-spherical/);
  assert.equal(typeof ray.atmosphere('inverse-spherical',{occlusionRadius:6371000}).n,'function');
});

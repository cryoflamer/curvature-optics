'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const fast=require('../src/optics/OpticalFastRayField');
const animation=require('../src/animation/ModernAnimationPreview');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const names=['vacuum','standard','temperature-lapse','profile-transition',
  'inverse-temperature','exponential-occlusion','inverse-spherical'];

function options(geometry,atmosphere){
  return {geometry,radius:6371000,observerHeight:15,atmosphere,
    profileOptions:atmosphere==='temperature-lapse'?{gradientKPerKm:-6.5}:
      atmosphere==='profile-transition'?{transitionProfile:{source:'standard',weight:0.5},occlusionRadius:6371000}:
        atmosphere==='inverse-temperature'?{inverseProfile:{source:'standard',weight:0.5},occlusionRadius:6371000}:
          {occlusionRadius:6371000}};
}

test('Fast atmospheric eligibility comes exclusively from the production field',()=>{
  for(const atmosphere of names){
    assert.equal(fast.supportsAtmosphere(atmosphere),true,atmosphere);
    assert.equal(animation.fastEligible({atmosphere}),true,atmosphere);
    for(const geometry of ['flat','globe']){
      const query=options(geometry,atmosphere),decision=fast.inspectPreview(query);
      assert.equal(decision.supported,true,atmosphere+'/'+geometry);
      assert.equal(decision.reason,null);
      assert.equal(fast.createPreview(query).mode,
        (decision.method==='legacy'?fast.create(query):fast.createAdaptive(query)).mode);
    }
  }
  assert.equal(fast.supportsAtmosphere('not-a-profile'),false);
  assert.equal(fast.inspectPreview(options('globe','not-a-profile')).supported,false);
  assert.equal(animation.fastEligible({atmosphere:'not-a-profile'}),false);
  assert.equal(animation.fastEligible(null),false);
});

test('Exact/legacy endpoints and adaptive methods retain the production selection',()=>{
  assert.equal(fast.previewMethod(options('globe','standard')),'legacy');
  assert.equal(fast.previewMethod(options('flat','exponential-occlusion')),'legacy');
  assert.equal(fast.previewMethod(options('globe','exponential-occlusion')),'adaptive');
  assert.equal(fast.previewMethod(options('flat','inverse-temperature')),'adaptive');
  const inverse=options('flat','inverse-temperature');
  inverse.profileOptions={inverseProfile:{source:'standard',weight:1},occlusionRadius:6371000};
  assert.equal(fast.previewMethod(inverse),'legacy');
  assert.equal(fast.createPreview(inverse).mode,'analytic');
  assert.equal(fast.createPreview(options('globe','temperature-lapse')).mode,
    'adaptive-conformal-curvature');
});

test('Unsupported near-flat Standard Globe returns an explicit reason without adaptive substitution',()=>{
  const ordinary=options('globe','standard'),nearFlat={...ordinary,radius:40000000};
  assert.equal(fast.inspectPreview(ordinary).supported,true);
  const verdict=fast.inspectPreview(nearFlat);
  assert.equal(verdict.supported,false);
  assert.equal(verdict.method,'legacy');
  assert.match(verdict.reason,/curvature/);
  assert.equal(fast.createPreview(nearFlat).mode,'unsupported');
  assert.equal(fast.inspectPreview(ordinary).supported,true,
    'one rejected radius must not disable an unrelated frame');
  assert.equal(fast.inspectPreview({...ordinary,geometry:'unknown'}).supported,false);
  assert.equal(fast.inspectPreview({...ordinary,observerHeight:-1}).supported,false);
});

test('Scene/Compare/Animation and production adapter share Fast authority',()=>{
  const app=read('src/ui/modern/ModernApp.js');
  const preview=read('src/animation/ModernAnimationPreview.js');
  const physics=read('src/optics/CurvaturePhysicalSceneOptics.js');
  assert.match(app,/fastCapabilities\.supportsAtmosphere\(atmosphere\)/);
  assert.match(preview,/fastField\.supportsAtmosphere\(spec\.atmosphere\)/);
  assert.match(preview,/fastQualifier\.inspectPreview\(/);
  assert.match(physics,/fastFields\.createPreview\(/);
  assert.doesNotMatch(app,/\['vacuum','standard','temperature-lapse'/);
  assert.doesNotMatch(preview,/FAST_ATMOSPHERES\s*=/);
  assert.doesNotMatch(physics,/var legacyFast=/);
  const html=read('CurvatureModern.html');
  assert.ok(html.indexOf('OpticalFastRayField.js')<html.indexOf('ModernAnimationPreview.js'));
  assert.ok(html.indexOf('OpticalFastRayField.js')<html.indexOf('ModernApp.js'));
});

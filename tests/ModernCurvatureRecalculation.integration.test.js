'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const compare=require('../src/ui/modern/ModernCompareState');
const clone=require('../src/ui/modern/ModernCompareModel');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const composition=require('../src/scene/CurvatureIndependentComposition');
const benchmark=require('../tools/benchmark-adaptive-prism-112');
const R=6371000;

test('135.4: real physical A/B ray cache invalidates on B curvature change, and painted geometry changes',()=>{
  // Two real authored tower meshes exercise the real optical adapter and
  // metric ground grid, without making the test depend on browser Canvas.
  const source=benchmark.model(2,'flat');
  source.Update=function(){this.geometryRadius=this.rEarth;};
  let config=compare.preset('globe-flat-vacuum');
  const sessions={A:optics.create(),B:optics.create()};
  function render(side){
    const models=compare.pair(source,config,clone);
    const m=models[side];
    const authored=composition.composeOpticalMain(m,m.showModel===1);
    return sessions[side].transform(authored,m,{atmosphere:config[side].atmosphere,
      occlusionRadius:config[side].occlusionRadius});
  }
  const flat=render('B');
  assert.equal(flat.reused,false);
  assert.equal(render('B').reused,true,'an unchanged model may reuse its rays');
  const originalA=render('A');
  assert.equal(originalA.reused,false);
  config=compare.update(config,'B','surface','globe');
  const earth=render('B');
  assert.equal(earth.reused,false,'geometry change must invalidate B optical cache');
  assert.notEqual(earth.stats.visibleSegments,flat.stats.visibleSegments,
    'Earth-radius geometry must change actual optical visibility, not only the label');
  assert.ok(earth.stats.groundHorizon>0,'spherical ground has a finite geometric horizon');
  assert.equal(render('A').reused,true,'unmodified A must retain its own cached optics');
  assert.equal(config.A.radiusKm,R/1000);
  config=compare.update(config,'B','radiusKm',R*10/1000);
  const shallower=render('B');
  assert.equal(shallower.reused,false,'radius change must invalidate B optical cache');
  assert.ok(shallower.stats.groundHorizon>earth.stats.groundHorizon,
    'tenfold larger Earth radius must move the ground horizon farther away');
  assert.equal(render('B').reused,true);
});

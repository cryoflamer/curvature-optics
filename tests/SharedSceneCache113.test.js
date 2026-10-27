'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const composition=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const ground=require('../src/optics/CurvaturePhysicalGroundGuides');
const fields=require('../src/optics/OpticalSharedRayField');
const benchmark=require('../tools/benchmark-adaptive-prism-112');
const R=6371000;
const scene=(m)=>composition.composeOpticalMain(m,m.showModel===1);

test('113: ground rays share the same exact-point oracle and cache as the tower prism',()=>{
  const field=fields.create({geometry:'flat',atmosphere:'standard',observerHeight:15,
    radius:R,distances:[100,30000],heights:[0,70],step:2000});
  const model={rEarth:R,Height:15,GlobeGridCol:'blue',FEGridCol:'blue'};
  const options={model,geometry:'flat',atmosphere:'standard',step:2000,maxDistance:30000,
    sampleGround:d=>field.exact(d,0)};
  const a=ground.create(options);
  const initial=field.stats();
  assert.equal(initial.solves,a.solves());
  assert.ok(initial.solves>0);
  // A second ground table on the same optical field does not shoot again.
  const b=ground.create(options);
  assert.equal(b.solves(),a.solves());
  assert.equal(field.stats().solves,initial.solves);
  assert.equal(field.stats().hits,initial.hits+b.solves());
  // Ordinary ground sampling (height=0) is literally the shared exact record.
  const first=a.radialSamples;
  assert.ok(first>0);
  const overlap=field.exact(3000,0);
  assert.equal(overlap.method,'exact');
  assert.equal(field.sample(3000,0).status,overlap.status);
});

test('113: normal scene reports ground and tower exact solves without double counting',()=>{
  const m=benchmark.model(10,'flat');
  const r=optics.create().transform(scene(m),m,{atmosphere:'standard'});
  assert.equal(r.stats.guideSolves,33);
  assert.equal(r.stats.sharedGroundSolves,33);
  assert.equal(r.stats.sharedGroundCacheHits,0);
  assert.equal(r.stats.fieldStats.solves,r.stats.towerSolves+r.stats.sharedGroundSolves);
  assert.ok(r.stats.towerSolves>0);
  assert.equal(r.stats.unresolved,0);
  assert.equal(r.stats.visibleSegments>0,true);
});

test('113: camera-only redraw reuses the same optical composition object',()=>{
  const m=benchmark.model(10,'flat'),session=optics.create(),c=scene(m);
  const first=session.transform(c,m,{atmosphere:'vacuum'});
  const pan={...m,PanRad:0.33,camPos:[8,9,10],camViewCenter:[2,4,6]};
  const same=session.transform(scene(pan),pan,{atmosphere:'vacuum'});
  assert.equal(same.reused,true);
  assert.strictEqual(same.composition,first.composition,
    'physical composition itself must not be reassembled on a camera-only redraw');
  assert.strictEqual(same.stats,first.stats);
  session.clearCache();
  assert.equal(session.transform(c,m,{atmosphere:'vacuum'}).reused,false);
});

test('113: changed authored tower geometry invalidates cache even if legacy model key is identical',()=>{
  const m=benchmark.model(2,'flat'),session=optics.create(),original=scene(m);
  const first=session.transform(original,m,{atmosphere:'vacuum'});
  const changed=scene(m),p=changed.scene.primitives.find(p=>p.style?.stroke==='black');
  assert.ok(p,'a source tower primitive must exist');
  p.points[0][2]+=4;
  const updated=session.transform(changed,m,{atmosphere:'vacuum'});
  assert.equal(updated.reused,false);
  assert.notStrictEqual(updated.composition,first.composition);
  assert.equal(session.transform(changed,m,{atmosphere:'vacuum'}).reused,true);
});

test('113: changed authored guide style invalidates cache, preserving the updated painter appearance',()=>{
  const m=benchmark.model(2,'flat'),session=optics.create(),original=scene(m);
  session.transform(original,m,{atmosphere:'vacuum'});
  const changed=scene(m);
  const guide=changed.scene.primitives.find(p=>p.metadata?.kind==='grid-ray' && p.style?.stroke);
  assert.ok(guide,'source ground guide must exist');
  guide.style.stroke='#f03030';
  const updated=session.transform(changed,m,{atmosphere:'vacuum'});
  assert.equal(updated.reused,false);
  assert.ok(updated.composition.scene.primitives.some(p=>p.metadata?.kind==='grid-ray'&&p.style.stroke==='#f03030'));
});

test('113: atmosphere, observer height and adaptive settings rebuild the physical composition',()=>{
  const m=benchmark.model(2,'flat'),c=scene(m),session=optics.create();
  session.transform(c,m,{atmosphere:'vacuum'});
  assert.equal(session.transform(c,m,{atmosphere:'vacuum',settings:{fieldAdaptiveDepth:2}}).reused,false);
  assert.equal(session.transform(c,m,{atmosphere:'vacuum',settings:{fieldAdaptiveDepth:2}}).reused,true);
  const taller={...m,Height:16};
  assert.equal(session.transform(scene(taller),taller,{atmosphere:'vacuum',settings:{fieldAdaptiveDepth:2}}).reused,false);
  assert.equal(session.transform(scene(taller),taller,{atmosphere:'standard',settings:{fieldAdaptiveDepth:2}}).reused,false);
});

test('113: 200+2 tower scene reuses optics with full silhouettes and bounded adaptive solving',()=>{
  const m=benchmark.model(200,'flat'),session=optics.create(),c=scene(m);
  const first=session.transform(c,m,{atmosphere:'standard'});
  const second=session.transform(c,m,{atmosphere:'standard'});
  assert.equal(first.stats.unresolved,0);
  assert.equal(first.stats.perGroup.length,2);
  assert.ok(first.stats.perGroup.every(g=>g.visibleSegments>0));
  assert.ok(first.stats.visibleSegments>7000);
  assert.ok(first.stats.fieldStats.interpolations>0);
  assert.ok(first.stats.fieldStats.solves<3500,
    'adaptive field should prevent per-vertex exact shooting even at 200 towers');
  assert.equal(second.reused,true);
  assert.strictEqual(second.composition,first.composition);
});

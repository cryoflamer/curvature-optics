'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const world=require('../src/geometry/CurvaturePhysicalWorldGeometry');
const ground=require('../src/optics/CurvaturePhysicalGroundGuides');
const adapter=require('../src/ui/modern/ModernSceneState');
const experiments=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareModel');
const compareState=require('../src/ui/modern/ModernCompareState');
const {model}=require('../tools/benchmark-adaptive-prism-112');
const R=6371000;
function scene(){const m=model(2,'flat');adapter.applyPreset(m,'canigou-low');
  m.showModel=2;m.metricGridExtentKm=1000;m.geometryRadius=R;return m;}
test('manual 750 and 1000 km are display extents rather than physical horizon distances',()=>{
  const m=scene();
  assert.equal(world.guideExtent(m),1000000);
  m.metricGridExtentKm=750;
  assert.equal(world.guideExtent(m),750000);
  m.metricGridExtentKm=1000;
  assert.ok(world.RINGS.includes(1000000));
  const source=world.metricGuides({curvature:0,observerHeight:244,
    showGrid:1,maxDistance:world.guideExtent(m)});
  assert.ok(source.primitives.some(p=>p.metadata.kind==='metric-ring'&&p.metadata.radius===1000000));
  const camera=compare.pair({...m,Update(){}});
  assert.equal(camera.A.metricGridExtentKm,1000);
  assert.equal(camera.B.metricGridExtentKm,1000);
  m.deviceRatio=1.5;m.viewcenterHorizon=3;
  const saved=experiments.capture(m,{atmosphere:'vacuum',occlusionRadius:R,
    preset:'custom',resetPreset:'canigou-low'},compareState.initial(m,'vacuum',R),
    {mode:'scene',selected:'A',eyeLevel:false,horizon:true});
  assert.equal(saved.scene.gridExtentKm,1000);
  assert.deepEqual(experiments.decode(experiments.encode(saved)),saved);
  assert.throws(()=>world.guideExtent({...m,metricGridExtentKm:1001}),/1000/);
  assert.throws(()=>world.metricGuides({curvature:0,observerHeight:244,showGrid:1,
    maxDistance:1000001}),/extent/);
});
test('1,000-km Flat guide endpoint is finite, never a fabricated finite horizon',()=>{
  const source=world.metricGuides({curvature:0,observerHeight:244,showGrid:1,maxDistance:1000000});
  const g=ground.create({model:{Height:244,rEarth:R,GlobeGridCol:'blue'},
    geometry:'flat',atmosphere:'vacuum',metricGrid:true,maxDistance:1000000});
  const output=g.transform(source.primitives);
  assert.equal(g.horizonDistance,null);
  assert.equal(g.renderExtent,1000000);
  assert.ok(output.some(p=>p.metadata.kind==='metric-ring'&&p.metadata.radius===1000000));
  assert.ok(g.metricExactDistances()<260,'far ring sampling remains bounded');
});

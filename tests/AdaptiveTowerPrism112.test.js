'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fields=require('../src/optics/OpticalSharedRayField');
const benchmark=require('../tools/benchmark-adaptive-prism-112');
const R=6371000;
const pixelScale=1920/(2*Math.tan(Math.PI/6));
function field(geometry,atmosphere,depth=3){
  return fields.create({geometry,atmosphere,observerHeight:15,radius:R,
    profileOptions:atmosphere==='inverse-spherical'?{occlusionRadius:R}:undefined,
    distances:[1000,3000,7000,14000,22000,30000],
    heights:[0,15,35,70],angleTolerance:1e-5,
    adaptiveDepth:depth,step:2000});
}
function deterministicPoints(n=120){
  // Non-grid-aligned probes; deliberately not the cell-qualification points.
  return Array.from({length:n},(_,i)=>({
    d:1200+27800*((i*0.6180339887498948)%1),
    h:1+68*((i*0.7548776662466927)%1)
  }));
}
test('112: adaptive field refines rejected cells and reuses physical RK4 angles',()=>{
  const f=field('flat','standard',4);
  let used=0,maxPx=0;
  for(const q of deterministicPoints(160)){
    const approx=f.sample(q.d,q.h),truth=f.exact(q.d,q.h);
    assert.equal(approx.status,truth.status);
    if(approx.method==='interpolated'){
      used++;
      const error=Math.abs(approx.angle-truth.angle)*pixelScale;
      maxPx=Math.max(maxPx,error);
      assert.ok(error<0.5,`independent sample ${q.d},${q.h}: ${error} px`);
    }
  }
  assert.ok(used>60,'most smooth prism samples should interpolate');
  assert.ok(f.stats().refinements>0);
  assert.ok(f.stats().acceptedCells>0);
  assert.ok(f.stats().maxDepthUsed>0);
  assert.ok(maxPx>=0);
});
test('112: refracted Globe and engineered Flat probes agree with exact shooting',()=>{
  for(const [geometry,atmosphere] of [['globe','standard'],['flat','inverse-spherical']]){
    const f=field(geometry,atmosphere,4);
    let interpolated=0;
    for(const q of deterministicPoints(90)){
      const approx=f.sample(q.d,q.h),truth=f.exact(q.d,q.h);
      assert.equal(approx.status,truth.status,`${geometry}/${atmosphere}: ${q.d},${q.h}`);
      if(approx.method==='interpolated'){
        interpolated++;
        assert.ok(Math.abs(approx.angle-truth.angle)*pixelScale<0.5);
      }
    }
    assert.ok(interpolated>0,`${atmosphere} should interpolate smooth visible cells`);
  }
});
test('112: blocked and near-horizon engineered points are never turned into visible rays',()=>{
  const f=fields.create({geometry:'flat',atmosphere:'inverse-spherical',
    observerHeight:15,radius:R,profileOptions:{occlusionRadius:R},
    distances:[9000,18000,27000,36000],heights:[0,2,8,30],
    angleTolerance:1e-5,adaptiveDepth:4,step:2000});
  for(const [d,h] of [[16000,0],[19000,0],[22000,1],[30000,1],[17000,8],[25000,8]]){
    const result=f.sample(d,h),truth=f.exact(d,h);
    assert.equal(result.status,truth.status,`${d},${h}`);
    if(truth.status!=='visible')assert.equal(result.method,'exact');
  }
  assert.equal(f.sample(40000,10).method,'exact','outside the prism is never extrapolated');
});
test('112: adaptive-node budget fails closed to exact sampling',()=>{
  const f=fields.create({geometry:'flat',atmosphere:'standard',observerHeight:15,
    distances:[1000,30000],heights:[0,70],angleTolerance:1e-10,
    adaptiveDepth:7,maxAdaptiveCells:1,step:2000});
  const sample=f.sample(10000,25),truth=f.exact(10000,25);
  assert.equal(sample.method,'exact');
  assert.equal(sample.status,truth.status);
  assert.equal(sample.angle,truth.angle);
  assert.equal(f.stats().refinements,0);
  assert.ok(f.stats().adaptiveLimits>0);
  assert.throws(()=>fields.create({distances:[1000,2000],heights:[0,10],adaptiveDepth:9}));
  assert.throws(()=>fields.create({distances:[1000,2000],heights:[0,10],maxAdaptiveCells:0}));
});
test('112: repeated prism samples reuse the qualified tree without more shooting',()=>{
  const f=field('flat','standard',4),points=deterministicPoints(85);
  points.forEach(p=>f.sample(p.d,p.h));
  const stats=f.stats();
  points.forEach(p=>f.sample(p.d,p.h));
  assert.equal(f.stats().solves,stats.solves);
  assert.equal(f.stats().refinements,stats.refinements);
  assert.ok(f.stats().interpolations>stats.interpolations);
});
test('112: real Flat 85+2 tower mesh retains both banks with fewer exact solves',()=>{
  const rows=benchmark.run({counts:[85],geometry:'flat',atmosphere:'standard'});
  const [before,after]=rows;
  assert.equal(before.towers,87);
  assert.equal(after.towers,87);
  assert.equal(after.lines,before.lines);
  assert.equal(after.unresolved,before.unresolved);
  assert.equal(after.cacheReused,true);
  assert.ok(after.field.solves<before.field.solves*0.6,
    `${after.field.solves} versus ${before.field.solves}`);
  assert.ok(after.field.interpolations>0);
  assert.ok(after.field.fallbacks>0);
  assert.equal(after.guideSolves,before.guideSolves,
    'adaptive tower prism must not change independently optimized surface grid');
});
test('112: world-to-camera angular scene output matches exact for both tower groups',()=>{
  const compose=require('../src/scene/CurvatureIndependentComposition');
  const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
  for(const [geometry,atmosphere] of [['flat','standard'],['globe','standard'],['flat','inverse-spherical']]){
    const m=benchmark.model(10,geometry);
    const original=compose.composeOpticalMain(m,geometry==='globe');
    const direct=optics.create().transform(original,m,{atmosphere,settings:{fieldAdaptiveDepth:0}});
    const adaptive=optics.create().transform(original,m,{atmosphere,settings:{fieldAdaptiveDepth:3}});
    const strokes=x=>x.composition.scene.primitives.filter(p=>p.metadata?.kind==='physical-object-stroke');
    const a=strokes(direct),b=strokes(adaptive);
    assert.equal(b.length,a.length,`${geometry}/${atmosphere}: same visible scene edges`);
    assert.equal(adaptive.stats.unresolved,direct.stats.unresolved);
    assert.equal(adaptive.stats.fieldPrism.maxHeight>=m.ObjSize[1],true);
    for(let i=0;i<a.length;i++){
      assert.equal(a[i].metadata.opticalSourceIndex,b[i].metadata.opticalSourceIndex);
      for(let j=0;j<2;j++){
        // Painter-ready arrival point has fixed 1000m radial length; angular
        // displacement / 1000 is the small-angle angular difference.
        const error=Math.hypot(...a[i].points[j].map((v,k)=>v-b[i].points[j][k]));
        assert.ok(error/1000*pixelScale<0.5,`real mesh ${geometry}/${atmosphere}: ${error/1000*pixelScale} px`);
      }
    }
  }
});

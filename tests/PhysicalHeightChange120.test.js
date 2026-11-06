'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const rt=require('../src/optics/OpticalRayTracer');
const projection=require('../src/optics/OpticalTargetProjection');
const height=require('../src/app/CurvatureHeightChangeScheduler');
const profile=require('../src/diagnostics/CurvaturePerformanceProfile');
const composition=require('../src/scene/CurvatureIndependentComposition');
const optical=require('../src/optics/CurvaturePhysicalSceneOptics');
const {model}=require('../tools/benchmark-adaptive-prism-112');
const R=6371000;

// Strip ONLY the optically classified paint palette for historical #119/#121
// hashes. The frozen oracle still certifies every projected coordinate, fill,
// layer and metadata byte; newly required colors are tested independently.
function withoutPhysicalFootingPalette(projected,source){
  return projected.map(function(p){
    const kind=p.metadata?.kind;
    if(kind!=='physical-object-fill'&&kind!=='physical-object-stroke')return p;
    const original=source[p.metadata.opticalSourceIndex];
    const style={...p.style};
    if(kind==='physical-object-fill'&&style.fill==='#dcc493')
      style.fill=original.style.fill;
    if(kind==='physical-object-stroke'&&style.stroke==='#666')
      style.stroke=original.style?.stroke||original.style?.fill||'black';
    return {...p,style};
  });
}

test('120: prepared RK4 uses the same integration recurrence in both geometries',()=>{
  for(const geometry of ['globe','flat'])for(const atmosphere of ['vacuum','standard','inverse-spherical']){
    const setup={geometry,radius:R,profile:rt.atmosphere(atmosphere,
      atmosphere==='inverse-spherical'?{occlusionRadius:850000}:undefined)};
    const safe=rt.prepareStepper(setup),trusted=rt.prepareStepper(setup,true);
    for(const angle of [-0.05,-0.01,0,0.02,0.1]){
      let ref=[0,25,Math.cos(angle),Math.sin(angle)],fast=ref.slice();
      for(let i=0;i<20;i++){
        const ds=[10,50,200,-10][i%4];
        ref=rt.advanceState(ref,ds,setup);
        fast=trusted(fast,ds);
        assert.deepEqual(fast,ref,'trusted step must match previous RK4 bit-for-bit');
        assert.deepEqual(safe(ref,0),rt.advanceState(ref,0,setup));
      }
    }
    assert.throws(()=>safe([0,0,5,0],10),/Invalid ray state/);
  }
});

test('120: point projection retains previously sampled physical oracle results',()=>{
  const oracle=require('./fixtures/height-change-oracle-120.json');
  for(const entry of oracle){
    const actual=projection.solve(entry.options);
    assert.equal(actual.status,entry.status,JSON.stringify(entry.options));
    if(Number.isFinite(entry.angle))
      assert.ok(Math.abs(actual.angle-entry.angle)<1e-12,
        `optical arrival changed at observer height ${entry.options.observerHeight}`);
    assert.ok(Number.isInteger(actual.shootRK4Calls)&&actual.shootRK4Calls>=0);
  }
});

test('120: height debounce only draws once for latest requested height',()=>{
  let id=0,draws=0;const timers=new Map(),cancelled=[];
  const api=height.create((cb,delay)=>{assert.equal(delay,150);timers.set(++id,cb);return id;},
    n=>{cancelled.push(n);timers.delete(n);},()=>{draws++;});
  for(let i=0;i<20;i++)api.schedule();
  assert.deepEqual(api.stats(),{pending:true,requests:20,replaced:19,draws:0,delayMs:150});
  assert.equal(timers.size,1);
  timers.get(id)();
  assert.equal(draws,1);
  api.schedule();api.cancel();
  assert.equal(draws,1);
  assert.equal(api.stats().pending,false);
  assert.throws(()=>height.create(null,()=>{},()=>{}),/requires/);
});

test('120: detached height model runs Update without touching original user arrays/barometer',()=>{
  let barometerCalls=0;
  const original={Height:15,HeightSlider:0.4,HeightSliderLast:0.4,
    camViewCenter:[0,1,0],BaroModel:{Update(){barometerCalls++;}},
    Update(){this.camViewCenter[1]=this.Height*2;
      if(this.BaroModel)this.BaroModel.Update();}};
  const clone=height.cloneUpdated(original,15.5);
  assert.equal(clone.Height,15.5);
  assert.equal(clone.camViewCenter[1],31);
  assert.deepEqual(original.camViewCenter,[0,1,0]);
  assert.equal(original.Height,15);
  assert.equal(barometerCalls,0);
  assert.equal(clone.BaroModel,null);
});

test('120: profiler captures three actual height-dependent cold renders',async()=>{
  const original={Height:15,showGrid:1,camViewCenter:[0,1,0]};
  let calls=0;
  const got=await profile.run({model:original,pause:()=>Promise.resolve(),reset(){},
    modelAtHeight(h){return {...original,Height:h};},
    render(m){calls++;return {cacheReused:false,unresolved:0,primitiveCount:5,
      timings:{composeMs:1,opticsMs:2,frameMs:3,paintMs:4,validationMs:1,
        projectionMs:1,canvasMs:2,decorationsMs:0,strokeCalls:5},
      opticalStages:{groundGuidesMs:1,outlinesMs:2,fillsMs:3,exactSolveMs:4},
      fieldStats:{solves:1,shootRK4Calls:50,shootEvaluations:3}};}});
  const changes=got.samples.filter(x=>x.scenario==='height-change-cold');
  assert.equal(changes.length,3);
  assert.deepEqual(changes.map(x=>x.observerHeight),[14.7,15.3,15]);
  assert.equal(got.profile.scenarios['height-change-cold'].optics.count,3);
  assert.equal(got.profile.scenarios['height-change-cold'].exactSolver.count,3);
  assert.equal(changes[0].shootRK4Calls,50);
  assert.equal(calls,18);
  assert.deepEqual(original,{Height:15,showGrid:1,camViewCenter:[0,1,0]});
});

test('120: optical coordinates retain #119 hashes at both eye heights after stripping new palette',()=>{
  const crypto=require('node:crypto');
  const {atHeight}=require('../tools/benchmark-height-change-120');
  const oracle=require('./fixtures/physical-globe-height-oracle-120.json');
  for(const expected of oracle){
    const m=atHeight(model(85,'globe'),expected.height);
    const composed=composition.composeOpticalMain(m,true);
    const result=optical.create().transform(composed,m,{atmosphere:'standard',
      settings:{shootingOptimization:false,surfaceArithmetic:'legacy'}});
    const stats=result.stats;
    const hash=crypto.createHash('sha256').update(
      JSON.stringify(withoutPhysicalFootingPalette(result.composition.scene.primitives,
        composed.scene.primitives))).digest('hex');
    assert.equal(hash,expected.primitiveHash,'physical painter primitives changed');
    assert.equal(stats.visibleSegments,expected.visibleSegments);
    assert.equal(stats.unresolved,expected.unresolved);
    assert.equal(stats.fillTriangles,expected.fillTriangles);
    assert.equal(stats.fillUnresolved,expected.fillUnresolved);
    assert.equal(stats.groundHorizon,expected.groundHorizon);
    // One extra qualified ray probe per authored tower footing can add field
    // work, but must not modify the previous geometry/projection oracle.
    const footings=m.NObjects[0]+m.NObjects[1];
    assert.ok(stats.fieldStats.solves>=expected.solves&&
      stats.fieldStats.solves<=expected.solves+footings);
    assert.ok(stats.fieldStats.interpolations>=expected.interpolations&&
      stats.fieldStats.interpolations<=expected.interpolations+footings);
    assert.ok(stats.fieldStats.fallbacks>=expected.fallbacks&&
      stats.fieldStats.fallbacks<=expected.fallbacks+footings);
    assert.equal(result.composition.scene.primitives.length,expected.primitives);
  }
});

test('120: height invalidates cached Physical rays, pan does not',()=>{
  const m=model(2,'globe');m.showGrid=0;
  const scene=composition.composeOpticalMain(m,true),session=optical.create();
  const before=session.transform(scene,m,{atmosphere:'standard'});
  const again=session.transform(scene,m,{atmosphere:'standard'});
  assert.equal(again.reused,true);
  const changed={...m,Height:m.Height+.3};
  const otherScene=composition.composeOpticalMain(changed,true);
  const after=session.transform(otherScene,changed,{atmosphere:'standard'});
  assert.equal(after.reused,false);
  assert.ok(after.stats.fieldStats.solves>0);
  assert.ok(after.stats.opticalStages.exactSolveMs>0);
  assert.ok(after.stats.fieldStats.shootRK4Calls>0);
  assert.notEqual(after.stats.groundHorizon,before.stats.groundHorizon);
});

test('120: HTML still loads height scheduler before classic application runtime',()=>{
  const root=path.join(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'CurvatureApp.html'),'utf8');
  const runtime=fs.readFileSync(path.join(root,'src/app/CurvatureAppRuntime.js'),'utf8');
  assert.ok(html.indexOf('CurvatureHeightChangeScheduler.js')<html.indexOf('CurvatureAppRuntime.js'));
  assert.match(runtime,/HEIGHT CHANGING: exact Physical optics pending/);
  assert.match(runtime,/physicalCanvasFrameScheduler\.cancel\(\)/);
});

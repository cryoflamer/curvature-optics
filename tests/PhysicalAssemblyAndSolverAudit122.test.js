'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const contract=require('../src/scene/CurvatureSceneContract');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const compose=require('../src/scene/CurvatureIndependentComposition');
const profile=require('../src/diagnostics/CurvaturePerformanceProfile118');
const {model}=require('../tools/benchmark-adaptive-prism-112');
const {atHeight}=require('../tools/benchmark-height-change-120');
const oracles=require('./fixtures/physical-scene-assembly-oracle-122.json');

test('122: public createScene still deep-copies every nested property and validates it',()=>{
 const primitives=[{type:'line',mode:1,points:[[1,2,3],[4,5,6]],
   style:{stroke:'green',extensions:{layers:['a']}},
   metadata:{debug:{tags:['ground']}},extension:[{nested:[2]}]}];
 const metadata={layers:[{label:'original'}]};
 const scene=contract.createScene('legacy',primitives,metadata,true);
 assert.notStrictEqual(scene.primitives[0],primitives[0],
   'even an unrecognized fourth argument must not disable defensive copying');
 primitives[0].points[0][0]=9;
 primitives[0].style.extensions.layers[0]='changed';
 primitives[0].metadata.debug.tags[0]='changed';
 primitives[0].extension[0].nested[0]=99;
 metadata.layers[0].label='changed';
 assert.deepEqual(scene.primitives[0].points[0],[1,2,3]);
 assert.equal(scene.primitives[0].style.extensions.layers[0],'a');
 assert.equal(scene.primitives[0].metadata.debug.tags[0],'ground');
 assert.equal(scene.primitives[0].extension[0].nested[0],2);
 assert.equal(scene.metadata.layers[0].label,'original');
 for(const method of [contract.createScene,contract.adoptScene]){
   assert.throws(()=>method('legacy',[{type:'line',points:[[0,0,0],[0,1,Infinity]]}]),/Invalid 3D/);
   assert.throws(()=>method('legacy',[{type:'line',points:[[0,0,0]]}]),/Invalid 3D/);
   assert.throws(()=>method('legacy',[{type:'circle',points:[[0,0,0],[0,1,1]]}]),/Unknown primitive/);
 }
});

test('122: exclusive ownership adoption validates but does not deep-clone projected points',()=>{
 const owned=[{type:'line',mode:1,points:[[1,2,3],[4,5,6]],
   style:{stroke:'blue'},metadata:{physicalGround:true}}];
 const s=contract.adoptScene('legacy',owned,{origin:'physical-adapter'});
 assert.equal(s.primitives,owned);
 assert.equal(s.primitives[0],owned[0]);
 assert.equal(s.primitives[0].points[0],owned[0].points[0]);
 assert.equal(s.metadata.origin,'physical-adapter');
});

test('122: all projected physical primitive bytes equal the #121 oracle for four full scenes',()=>{
 for(const expected of oracles){
  const m=atHeight(model(expected.towers,expected.geometry),expected.height);
  const source=compose.composeOpticalMain(m,expected.geometry==='globe');
  const sourceOriginal=JSON.stringify(source.scene.primitives);
  const adapter=optics.create();
  const r=adapter.transform(source,m,{atmosphere:expected.atmosphere,
    settings:{shootingWarmStart:false,surfaceArithmetic:'legacy'}});
  const p=r.composition;
  assert.equal(source.scene.primitives.length,expected.sourceCount);
  assert.equal(p.scene.primitives.length,expected.projectedCount);
  assert.equal(r.stats.visibleSegments,expected.visible);
  assert.equal(r.stats.unresolved,expected.unresolved);
  const hash=crypto.createHash('sha256').update(JSON.stringify({
    primitives:p.scene.primitives,ranges:p.ranges,metadata:p.scene.metadata})).digest('hex');
  assert.equal(hash,expected.hash,JSON.stringify(expected));
  assert.equal(JSON.stringify(source.scene.primitives),sourceOriginal,
    'the adopted physical scene must not modify any authored geometry');
  assert.ok(p.scene.primitives.every((piece,i)=>piece.commandIndex===i));
  assert.strictEqual(adapter.transform(source,m,{atmosphere:expected.atmosphere,
    settings:{shootingWarmStart:false,surfaceArithmetic:'legacy'}}).composition,p);
 }
});

test('122: per-phase exact targets, cache hits, and shooting evaluations partition cold work',()=>{
 const m=atHeight(model(2,'globe'),15);
 const c=compose.composeOpticalMain(m,true);
 const result=optics.create().transform(c,m,{atmosphere:'standard'});
 const f=result.stats.fieldStats,w=result.stats.opticalWork,st=result.stats.opticalStages;
 assert.ok(f.solves>0 && w.ground.solves>0 && w.outlines.solves>0);
 assert.ok(w.fills.solves>=0);
 assert.ok(w.fills.hits>=0);
 for(const key of ['solves','hits','interpolations','fallbacks','shootEvaluations',
  'shootRK4Calls','predictorAttempts','predictorAccepted','predictorFallbacks',
  'warmStartAttempts','warmStartAccepted','warmStartMisses',
  'clearGroundSteps','fullGroundEventSteps']){
  const total=w.ground[key]+w.outlines[key]+w.fills[key];
  assert.equal(total,f[key],key+' should be counted in one phase only');
 }
 assert.ok(Math.abs(w.ground.exactSolveMs+w.outlines.exactSolveMs+
   w.fills.exactSolveMs-f.exactSolveMs)<1e-6);
 assert.ok(st.sceneAdoptionMs>=0 && st.sceneAdoptionMs<=st.assemblyMs);
 assert.ok(st.assemblyMs>0);
});

test('122: browser ZIP profiler retains per-phase work and separate assembly/adoption medians',async()=>{
 const base={Height:15,showGrid:1,camViewCenter:[0,1,0]};
 const work={ground:{solves:3,hits:1,interpolations:0,fallbacks:0,shootEvaluations:9,
  shootRK4Calls:90,exactSolveMs:0.8},outlines:{solves:6,hits:2,interpolations:8,
  fallbacks:3,shootEvaluations:18,shootRK4Calls:180,exactSolveMs:1.5},
  fills:{solves:2,hits:5,interpolations:1,fallbacks:1,shootEvaluations:6,
   shootRK4Calls:60,exactSolveMs:0.7}};
 const x=await profile.run({model:base,pause:()=>Promise.resolve(),
  modelAtHeight(h){return {...base,Height:h};},
  render(){return {cacheReused:false,primitiveCount:1000,unresolved:0,
   timings:{composeMs:1,opticsMs:40,frameMs:2,paintMs:2,canvasMs:1},
   fieldStats:{solves:11,shootEvaluations:33},
   opticalStages:{assemblyMs:12,sceneAdoptionMs:5,exactSolveMs:3},opticalWork:work};}});
 const sample=x.samples.find(r=>r.scenario==='height-change-cold');
 assert.deepEqual(sample.opticalWork,work);
 const h=x.profile.scenarios['height-change-cold'];
 assert.equal(h.assembly.medianMs,12);
 assert.equal(h.sceneAdoption.medianMs,5);
 assert.equal(h.opticalWorkByPhase.ground.solves.median,3);
 assert.equal(h.opticalWorkByPhase.outlines.shootEvaluations.median,18);
 assert.equal(h.opticalWorkByPhase.fills.hits.median,5);
 assert.equal(x.samples.length,18);
});

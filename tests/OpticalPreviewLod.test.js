'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const lod=require('../src/optics/OpticalPreviewLod');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const composer=require('../src/scene/CurvatureIndependentComposition');
const projection=require('../src/optics/OpticalTargetProjection');
const {model}=require('../tools/benchmark-adaptive-prism-112');

function input(n,geometry){
  const m=model(n,geometry);m.showGrid=0;
  return {m,c:composer.composeOpticalMain(m,geometry==='globe',{physicalWorld:true})};
}
test('LOD keeps complete tower batches in painter order, nearest four and far endpoint',()=>{
  const placed=[];
  for(let i=0;i<40;i++)placed.push({id:i,name:'objects-0',distance:100+i*20,
    primitives:[{metadata:{placedObjectIndex:i,objectBank:0}}]});
  placed.reverse(); // existing far-to-near painter ordering
  placed.push({id:0,name:'objects-1',distance:50000,primitives:[{metadata:{placedObjectIndex:0,objectBank:1}}]});
  placed.push({id:'unknown',name:'other',distance:60000,primitives:[{}]});
  const before=placed.map(x=>x.id);
  const result=lod.thin(placed,{ObjType:[3,3]},8);
  assert.equal(result.original,42);
  assert.ok(result.selected<result.original/2);
  assert.deepEqual(result.objects.map(x=>x.id),placed.filter(x=>result.objects.includes(x)).map(x=>x.id));
  for(const id of [0,1,2,3,4,12,20,28,36,39])assert.ok(result.objects.some(x=>x.name==='objects-0'&&x.id===id));
  assert.ok(result.objects.some(x=>x.name==='objects-1'));
  assert.ok(result.objects.some(x=>x.name==='other'));
  assert.deepEqual(placed.map(x=>x.id),before,'input order is untouched');
  assert.equal(lod.thin(placed,{ObjType:[3,3]},1).selected,42);
  assert.equal(lod.thin(placed,{ObjType:[1,3]},8).selected,42-0,'non-tower source objects must not be thinned');
  assert.throws(()=>lod.thin(placed,{ObjType:[3,3]},3),/Invalid Fast Preview/);
});
test('auto frame-budget controller decreases density quickly but restores it with hysteresis',()=>{
  const c=lod.createController(50);
  assert.equal(c.stride(),1);
  assert.equal(c.observe(150),2);
  assert.equal(c.observe(120),4);
  assert.equal(c.observe(NaN),4);
  for(let i=0;i<2;i++)assert.equal(c.observe(4),4);
  assert.equal(c.observe(4),2);
  assert.equal(c.observe(4),2);
  c.reset(8);assert.equal(c.stride(),8,'Auto navigation can seed a cheap first frame');
  assert.throws(()=>c.reset(3),/Invalid Fast Preview/);
  c.reset();assert.equal(c.stride(),1);
  assert.throws(()=>lod.createController(0),/budget/);
});
test('motion frame pacing adapts to complete scene cost without oscillating or exceeding bounds',()=>{
  const p=lod.createFramePacer();
  assert.equal(p.intervalMs(),100);
  assert.equal(p.observe(NaN),100);
  assert.equal(p.observe(-1),100);
  const quick=[];
  for(let i=0;i<8;i++)quick.push(p.observe(25));
  assert.ok(quick.every((x,i)=>i===0||x<=quick[i-1]));
  assert.ok(quick.at(-1)<=70,'cheap scenes should approach roughly 15 fps');
  assert.ok(p.observe(300)>=160,'slow frames back off immediately');
  for(let i=0;i<6;i++)assert.ok(p.observe(1000)<=180,'heavy scenes must be capped');
  const recovery=p.observe(10);
  assert.ok(recovery<=180,'recovery must remain bounded');
  p.reset();
  assert.equal(p.intervalMs(),100,'each new gesture starts with a neutral cadence');
});
test('Fast Preview LOD projects fewer complete towers with zero RK4; Accurate ignores it',()=>{
  for(const geometry of ['globe','flat']){
    const {m,c}=input(85,geometry),session=optics.create();
    const original=projection.solve;
    let full,small;
    try{
      projection.solve=()=>{throw Error('Fast preview called RK4');};
      full=session.transform(c,m,{atmosphere:'standard',opticalQuality:'fast',previewLod:{stride:1}});
      small=session.transform(c,m,{atmosphere:'standard',opticalQuality:'fast',previewLod:{stride:8}});
    }finally{projection.solve=original;}
    assert.equal(full.stats.previewLod.original,87);
    assert.equal(full.stats.previewLod.selected,87);
    assert.ok(small.stats.previewLod.selected<full.stats.previewLod.selected/2);
    assert.ok(small.stats.visibleSegments<full.stats.visibleSegments);
    assert.ok(small.stats.fillTriangles<=full.stats.fillTriangles);
    assert.equal(small.stats.fieldStats.shootRK4Calls,0);
    assert.equal(small.reused,false);
    assert.equal(session.transform(c,m,{atmosphere:'standard',opticalQuality:'fast',previewLod:{stride:8}}).reused,true);
    assert.equal(session.transform(c,m,{atmosphere:'standard',opticalQuality:'fast',previewLod:{stride:1}}).reused,false);
    // Accurate sees all authored objects regardless of a supplied LOD.
    const a=session.transform(c,m,{atmosphere:'vacuum',opticalQuality:'accurate',previewLod:{stride:8}});
    assert.equal(a.stats.previewLod,null);
    assert.equal(a.stats.perObject.length,87);
    assert.equal(session.transform(c,m,{atmosphere:'vacuum',opticalQuality:'accurate',previewLod:{stride:1}}).reused,true);
  }
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const bench=require('../tools/benchmark-adaptive-prism-112');
const compose=require('../src/scene/CurvatureIndependentComposition');
const physical=require('../src/optics/CurvaturePhysicalSceneOptics');
const frames=require('../src/scene/CurvatureRenderFrame');
const painter=require('../src/renderers/CurvatureFrameRenderer');

function sourceTower(scene,index){
  const p=scene.primitives[index];
  return p&&p.metadata&&p.metadata.placedObjectIndex!==undefined?
    `${p.metadata.objectBank}:${p.metadata.placedObjectIndex}`:null;
}
function frameWith(n,atmosphere='vacuum'){
  const model=bench.model(n,'flat');
  const source=compose.composeOpticalMain(model,false);
  const api=physical.create();
  const output=api.transform(source,model,{atmosphere});
  return {model,source,api,output};
}

test('114.1: every authored primitive retains its individual placed tower identity',()=>{
  const {source}=frameWith(2);
  for(const range of source.ranges.filter(r=>r.role==='objects')){
    const records=source.scene.primitives.slice(range.start,range.end);
    assert.ok(records.length>0);
    const towers=new Map();
    records.forEach(p=>{
      assert.ok(Number.isInteger(p.metadata?.placedObjectIndex));
      const key=sourceTower(source.scene,p.commandIndex);
      towers.set(key,(towers.get(key)||0)+1);
    });
    assert.equal(towers.size,2);
    assert.ok([...towers.values()].every(count=>count>=3));
  }
});

test('114.1: individually placed towers render far-to-near, each fill before its own strokes',()=>{
  const {source,output}=frameWith(2);
  const list=output.composition.scene.primitives;
  const relevant=list.filter(p=>p.metadata?.opticalSourceIndex!==undefined);
  assert.ok(relevant.length>100);
  const sourceOrder=new Map();
  const firstFill=new Map(),lastStroke=new Map();
  relevant.forEach((p,index)=>{
    const tower=sourceTower(source.scene,p.metadata.opticalSourceIndex);
    assert.ok(tower,'every optical object retains an original placed object');
    if(!sourceOrder.has(tower))sourceOrder.set(tower,[]);
    sourceOrder.get(tower).push(index);
    if(p.metadata.kind==='physical-object-fill'&&!firstFill.has(tower))firstFill.set(tower,index);
    if(p.metadata.kind==='physical-object-stroke')lastStroke.set(tower,index);
  });
  assert.equal(sourceOrder.size,4);
  const ordered=output.stats.perObject;
  assert.equal(ordered.length,4);
  for(let i=1;i<ordered.length;i++)assert.ok(ordered[i-1].distance>=ordered[i].distance);
  for(const indices of sourceOrder.values()){
    assert.equal(indices.at(-1)-indices[0]+1,indices.length,
      'each tower is contiguous; strokes from distant towers cannot overpaint nearer fills');
  }
  for(const tower of sourceOrder.keys()){
    assert.ok(firstFill.has(tower)&&lastStroke.has(tower));
    assert.ok(firstFill.get(tower)<lastStroke.get(tower));
  }
});

test('114.1: geometry projection cache remains camera-independent',()=>{
  const {model,source,api,output}=frameWith(2);
  model.Pan=0.4;model.Nick=0.1;
  const again=api.transform(source,model,{atmosphere:'vacuum'});
  assert.equal(again.reused,true);
  assert.strictEqual(again.composition,output.composition);
});

test('114.1: shared painter accepts grouped scene and paints foundation fills',()=>{
  const {output}=frameWith(2);
  const camera={pos:[0,0,0],center:[0,1000,0],up:[0,0,1],sceneSize:2,
    screenSize:2,objectZExtend:0,zoom:1,near:1e-5};
  const f=frames.fromComposition(output.composition,camera,480,320);
  let fillCount=0,strokeCount=0;
  const ctx={clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},
    fill(){fillCount++;},stroke(){strokeCount++;}};
  const canvas={width:480,height:320,getContext(){return ctx;}};
  const rendered=painter.render(canvas,f,{mode:'painter'});
  assert.equal(rendered.mode,'painter');
  assert.ok(fillCount>0&&strokeCount>0);
});

test('114.1: Flat Standard 85-tower sequence is sorted and retains full physical geometry',()=>{
  const {output}=frameWith(85,'standard');
  assert.equal(output.stats.unresolved,0);
  assert.equal(output.stats.fillUnresolved,0);
  assert.ok(output.stats.visibleSegments>3000);
  assert.ok(output.stats.fillTriangles>0);
  const distances=output.stats.perObject.map(x=>x.distance);
  assert.ok(distances.every((d,i)=>i===0||distances[i-1]>=d));
});

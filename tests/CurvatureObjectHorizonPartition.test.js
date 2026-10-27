'use strict';
const assert=require('node:assert/strict');
const engine=require('../src/geometry/CurvatureGeometryEngine');
const composition=require('../src/scene/CurvatureIndependentComposition');
function model(type){return {geometryRadius:6371000,Height:7,ObjType:[type,3],NObjects:[5,0],
 ObjDist:[100,0],ObjDeltaDist:[500,0],ObjSidePos:[0,0],ObjSideVar:[0,0],
 ObjSideType:[0,0],ObjSize:[12,0],ObjSizeVar:[0,0],ObjSizeType:[0,0],
 rDisk:1100,hDip:1,zDisk:6,rFEarth:5000};}
for(const type of [0,1,2,3])for(const globe of [true,false]){
 const m=model(type),entries=engine.objectSequence(m,0,globe);
 const partition=engine.objectHorizonPartition(m,0,globe);
 assert.equal(partition.total,entries.length);
 assert.equal(partition.behind.length+partition.before.length,entries.length);
 assert.deepEqual(partition.behind.concat(partition.before).map(e=>e.params.longitude).sort(),
   entries.map(e=>e.params.longitude).sort());
 assert.equal(partition.requiresHorizonMask,globe&&partition.behind.length>0);
 if(!globe)assert.equal(partition.behind.length,0);
 const scenes=engine.createHorizonPartitionedObjectScenes(m,0,globe);
 for(const layer of ['behind','before']){
  assert.equal(scenes[layer].metadata.objectType,type);
  assert.equal(scenes[layer].metadata.objectCount,partition[layer].length);
  assert.equal(scenes[layer].primitives.length,
    partition[layer].reduce((n,e)=>n+e.scene.primitives.length,0));
 }
 const combined=engine.createObjectHorizonComposition(m,0,globe,{objectsOnly:true,segments:32});
 assert.equal(combined.layers.length,4);
 assert.equal(combined.outline.primitives.length,0);
 assert.equal(combined.mask.primitives.length,globe?1:0);
 const composed=composition.compose(m,0,globe,{objectsOnly:true,segments:32});
 assert.equal(composition.audit(composed).rendererReady,true);
}
assert.throws(()=>engine.towerHorizonPartition(model(1),0,true),/Only transmission towers/);
assert.throws(()=>engine.createTowerHorizonComposition(model(1),0,true),/Only transmission towers/);
const m=model(0);m.rDisk=-1;
assert.throws(()=>engine.objectHorizonPartition(m,0,true),/Nonnegative/);
console.log('CurvatureObjectHorizonPartition: passed');

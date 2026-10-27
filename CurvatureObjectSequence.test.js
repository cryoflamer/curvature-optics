'use strict';
const assert=require('node:assert/strict');
const engine=require('./CurvatureGeometryEngine');
function model(type){return {geometryRadius:6371000,Height:7,ObjType:[type,3],NObjects:[3,0],
 ObjDist:[100,0],ObjDeltaDist:[250,0],ObjSidePos:[0,0],ObjSideVar:[0,0],
 ObjSideType:[0,0],ObjSize:[12,0],ObjSizeVar:[0,0],ObjSizeType:[0,0],
 rDisk:2000,hDip:1};}
for(const type of [0,1,2,3])for(const globe of [true,false]){
 const m=model(type),entries=engine.objectSequence(m,0,globe);
 assert.equal(entries.length,3);
 assert.ok(entries.every(e=>e.scene.primitives.length>0));
 assert.ok(entries[0].params.longitude>entries[1].params.longitude);
 const scene=engine.createObjectSequenceScene(m,0,globe);
 assert.equal(scene.metadata.objectType,type);
 assert.equal(scene.metadata.objectCount,3);
 assert.equal(scene.primitives.length,entries.reduce((n,e)=>n+e.scene.primitives.length,0));
 if(type===0){
  assert.equal(entries[0].scene.metadata.drawn,0);
  assert.equal(entries[2].scene.metadata.drawn,2);
  assert.ok(entries[2].scene.primitives.length>10,'final Bedford scope');
 }
 if(type===2){
  assert.equal(entries[0].params.horizontalScale,1);
  assert.equal(entries[0].params.verticalScale,1);
 }
}
const m=model(1);m.ObjSizeVar[0]=.6;
const ship=model(2);ship.ObjSizeVar[0]=.6;
const rod=engine.objectSequence(m,0,false),boats=engine.objectSequence(ship,0,false);
assert.ok(rod.some((e,i)=>Math.abs(e.params.verticalScale-boats[i].params.verticalScale)>1e-8));
assert.ok(boats.some(e=>Math.abs(e.params.verticalScale-e.params.horizontalScale)>1e-8));
assert.throws(()=>engine.objectSequence(model(9),0,false),/not been independently ported/);
assert.throws(()=>engine.towerSequence(model(1),0,false),/Only transmission towers/);
console.log('CurvatureObjectSequence: passed');

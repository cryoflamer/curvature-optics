'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const bridge=require('./CurvatureIndependentComposition');
const painter=require('./CurvatureLegacyOrderPreview');
const engine=require('./CurvatureGeometryEngine');
const model={geometryRadius:6371000,Height:7,ObjType:[3,3],NObjects:[8,0],
  ObjDist:[100,0],ObjDeltaDist:[400,0],ObjSidePos:[0,0],ObjSideVar:[0,0],
  ObjSideType:[0,0],ObjSize:[12,0],ObjSizeVar:[0,0],ObjSizeType:[0,0],
  rDisk:400,zDisk:3,hDip:1,rFEarth:1000};
const camera={pos:[0,0,10],center:[0,0,0],up:[0,1,0],sceneSize:10,screenSize:10,objectZExtend:0,zoom:1};
for(const globe of [true,false])for(const segments of [8,64]){
  test(`independent composition is renderer-ready globe=${globe} segments=${segments}`,()=>{
    const original=engine.createTowerHorizonComposition(model,0,globe,{segments});
    const composed=bridge.compose(model,0,globe,{segments});
    const report=bridge.audit(composed);
    assert.equal(report.rendererReady,true);
    assert.deepEqual(report.layerCounts.map(x=>x.count),original.layers.map(x=>x.primitives.length));
    assert.deepEqual(composed.scene.primitives.map(p=>p.commandIndex),Array.from({length:report.primitiveCount},(_,i)=>i));
    assert.deepEqual(composed.scene.primitives.map(({commandIndex,...rest})=>rest),original.layers.flatMap(x=>x.primitives));
    const built=painter.build(composed.scene,camera,64,64,[]);
    assert.equal(built.commands.length,report.primitiveCount);
    assert.deepEqual(built.commands.map(x=>x.commandIndex),composed.scene.primitives.map(x=>x.commandIndex));
    assert.equal(composed.ranges[1].count,globe?1:0);
    assert.equal(composed.ranges[2].count,globe?1:2);
    if(globe){const mask=composed.scene.primitives[composed.ranges[1].start];assert.equal(mask.style.fill,'white');assert.equal(mask.mode,2);}
  });
}
test('audit detects duplicate command IDs',()=>{
  const c=bridge.compose(model,0,true);
  c.scene.primitives[1].commandIndex=0;
  assert.equal(bridge.audit(c).rendererReady,false);
});

'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const engine=require('./CurvatureGeometryEngine');
const html=fs.readFileSync(__dirname+'/CurvatureApp.html','utf8');
const begin=html.indexOf('function DrawShapeVariants(');
const end=html.indexOf('\nfunction DrawShape(',begin);
assert.ok(begin>=0&&end>begin);
const cases=[
  {sideType:0,sizeType:0},{sideType:1,sizeType:1},
  {sideType:2,sizeType:2},{sideType:3,sizeType:3},{sideType:4,sizeType:4}
];
for(const globe of [true,false])for(const {sideType,sizeType} of cases){
  const m={geometryRadius:6371000,Height:7,ObjType:[3,3],NObjects:[5,0],
    ObjDist:[100,0],ObjDeltaDist:[250,0],ObjSidePos:[30,0],ObjSideVar:[70,0],
    ObjSideType:[sideType,0],ObjSize:[12,0],ObjSizeVar:[0.4,0],ObjSizeType:[sizeType,0]};
  const expected=[];
  let transform=null,plane=null;
  const graph={SetPlane:(o,x,y)=>{plane={o,x,y};}};
  const context={Math,SetTrans:(ix,g,mm,lng,lat)=>{transform={lng,lat};},
    DrawShape:()=>expected.push({transform:{...transform},plane:JSON.parse(JSON.stringify(plane))})};
  vm.runInNewContext(html.slice(begin,end)+'\nthis.draw=DrawShapeVariants;',context);
  m.MaxNObjectsToDraw=[5,0];
  m.aObjCurr=[(m.ObjDist[0]+4*m.ObjDeltaDist[0])/m.geometryRadius,0];
  for(let i=0;i<5;i++){
    m.NObjectsDrawn=[i,0];
    context.draw(0,graph,m,globe);
    m.aObjCurr[0]-=m.ObjDeltaDist[0]/m.geometryRadius;
  }
  const actual=engine.towerSequence(m,0,globe);
  assert.equal(actual.length,expected.length);
  actual.forEach((entry,i)=>{
    const p=entry.params,e=expected[i];
    assert.ok(Math.abs(p.longitude-e.transform.lng)<1e-12);
    assert.ok(Math.abs(p.latitude-e.transform.lat)<1e-12);
    assert.ok(Math.abs(p.horizontalScale-e.plane.x[0])<1e-12);
    assert.ok(Math.abs(p.verticalScale-e.plane.y[2])<1e-12);
    assert.ok(Math.abs(p.planeOffset-e.plane.o[0])<1e-12);
    assert.equal(entry.scene.primitives.length,4);
  });
  const scene=engine.createTowerSequenceScene(m,0,globe);
  assert.equal(scene.primitives.length,actual.length*4);
  assert.equal(scene.metadata.horizonPartitioned,false);
  assert.deepEqual(scene.primitives[0].points,actual[0].scene.primitives[0].points);
}
const base={geometryRadius:6371000,Height:5,ObjType:[3,3],NObjects:[0,0],
  ObjDist:[0,0],ObjDeltaDist:[100,100],ObjSidePos:[0,0],ObjSideVar:[0,0],
  ObjSideType:[0,0],ObjSize:[10,10],ObjSizeVar:[0,0],ObjSizeType:[0,0]};
assert.equal(engine.towerSequence(base,0,true).length,0);
base.NObjects[0]=3;
assert.equal(engine.towerSequence(base,0,true).length,3);
assert.throws(()=>engine.towerSequence({...base,ObjType:[4,3]},0,true),/Only transmission towers/);
assert.throws(()=>engine.towerSequence({...base,ObjDeltaDist:[0,100]},0,true),/Positive spacing/);
assert.throws(()=>engine.towerSequence({...base,NObjects:[501,0]},0,true),/Invalid tower count/);
console.log('CurvatureTowerSequence: passed');

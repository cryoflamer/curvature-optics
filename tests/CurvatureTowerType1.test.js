'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const engine=require('../src/geometry/CurvatureGeometryEngine');
const html=require('./helpers/readCurvatureSources')();
const start=html.indexOf('function DrawShape( objIx, g, m ) {');
const end=html.indexOf('\nfunction ',start+10);
assert.ok(start>=0&&end>start);
const context={document:{getElementById:()=>({checked:true})},window:{}};
vm.runInNewContext(html.slice(start,end)+'\nthis.drawShape=DrawShape;',context);
function reference(objIx,hidden=false){
 const actual=[],fills=[];
 const g={PolygonOnPlane:(xs,ys,mode=1)=>actual.push({type:'polygon',points:xs.map((x,i)=>[x,ys[i]]),mode}),
  LineOnPlane:(x1,y1,x2,y2)=>actual.push({type:'line',points:[[x1,y1],[x2,y2]]}),
  SetBgColor:(color)=>fills.push(color)};
 context.drawShape(objIx,g,{ObjType:[3,3],isHiddenObj:[hidden,hidden]});
 return {primitives:JSON.parse(JSON.stringify(actual)),foundationFill:fills.at(-1)};
}
for(const objIx of [0,1]){
 for(const hidden of [false,true]){
  const expected=reference(objIx,hidden);
  const generated=engine.localTower(objIx,hidden);
  const actual=generated.map(({type,points,mode})=>({type,points,...(mode===undefined?{}:{mode})}));
  assert.deepEqual(actual,expected.primitives);
  assert.equal(generated.length,objIx===0?4:11);
  assert.equal(generated.at(-1).style.fill,expected.foundationFill,
    'tower foundation matches the actual Legacy SetBgColor decision');
  assert.equal(expected.foundationFill,hidden?'#dcc493':'#a38d60');
 }
 assert.equal(engine.localTower(objIx).at(-1).style.fill,'#a38d60');
}
assert.throws(()=>engine.localTower(2),/bank/);
const p={geometryRadius:6371000,height:2,objectSize:64,longitude:.02,latitude:0,verticalScale:1,horizontalScale:1,globe:true};
const placed=engine.createPlacedTowerScene(p,0);
assert.equal(placed.primitives.length,4);
assert.equal(placed.metadata.towerVariant,1);
const m={geometryRadius:6371000,Height:2,NObjects:[2,2],ObjDist:[100,100],ObjDeltaDist:[100,100],ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSideType:[0,0],ObjSize:[64,64],ObjSizeVar:[0,0],ObjSizeType:[0,0],ObjType:[3,3]};
assert.equal(engine.createTowerSequenceScene(m,0,false).primitives.length,8);
assert.equal(engine.createTowerSequenceScene(m,1,false).primitives.length,22);
console.log('CurvatureTowerType1: passed');

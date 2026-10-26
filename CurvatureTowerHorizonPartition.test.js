'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const engine=require('./CurvatureGeometryEngine');
const html=fs.readFileSync(__dirname+'/CurvatureApp.html','utf8');
const start=html.indexOf('function DrawObjectsBehindHorizon(');
const end=html.indexOf('\nfunction SetTrans(',start);
assert.ok(start>=0&&end>start);
const source=html.slice(start,end);
for(const globe of [true,false])for(const side of [0,100,10000])for(const disk of [0,400,5000]){
  const model={geometryRadius:6371000,Height:7,ObjType:[3,3],NObjects:[8,0],
    ObjDist:[100,0],ObjDeltaDist:[400,0],ObjSidePos:[side,0],ObjSideVar:[0,0],
    ObjSideType:[0,0],ObjSize:[12,0],ObjSizeVar:[0,0],ObjSizeType:[0,0],
    rDisk:disk,hDip:1,aObjDelta:[0,0],aObjFirst:[0,0],aObjLast:[0,0],
    aObjCurr:[0,0],MaxNObjectsToDraw:[0,0],NObjectsDrawn:[0,0],isHiddenObj:[false,false]};
  const drawn={behind:[],before:[]};let layer='behind';
  const graph={SetAlpha(){},SetAreaAttr(){},SaveTrans3D(){},RestoreTrans3D(){},
    SetPlane(){},SetBgColor(){},CircleOnPlane(){}};
  const context={Math,CurveApp:model,DrawShapeVariants:()=>drawn[layer].push(model.aObjCurr[0])};
  vm.runInNewContext(source+'\nthis.behind=DrawObjectsBehindHorizon;this.before=DrawObjectsBeforeHorizon;',context);
  if(globe)context.behind(0,graph);
  layer='before';context.before(0,graph,globe);
  const result=engine.towerHorizonPartition(model,0,globe);
  assert.equal(result.behind.length,drawn.behind.length,`behind globe=${globe} side=${side} disk=${disk}`);
  assert.equal(result.before.length,drawn.before.length,`before globe=${globe} side=${side} disk=${disk}`);
  for(const kind of ['behind','before'])result[kind].forEach((entry,i)=>{
    assert.ok(Math.abs(entry.params.longitude-drawn[kind][i])<1e-12,`${kind} ${i}`);
  });
  assert.equal(result.requiresHorizonMask,globe&&drawn.behind.length>0);
  const scenes=engine.createHorizonPartitionedTowerScenes(model,0,globe);
  for(const kind of ['behind','before']){
    assert.equal(scenes[kind].primitives.length,result[kind].length*4);
    assert.equal(scenes[kind].metadata.horizonPartitioned,true);
  }
}
console.log('CurvatureTowerHorizonPartition: passed');

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const bridge=require('./CurvatureIndependentComposition');
const model={geometryRadius:6371000,Height:7,ObjType:[3,3],NObjects:[3,0],
  ObjDist:[100,0],ObjDeltaDist:[400,0],ObjSidePos:[0,0],ObjSideVar:[0,0],
  ObjSideType:[0,0],ObjSize:[12,0],ObjSizeVar:[0,0],ObjSizeType:[0,0],
  rDisk:400,zDisk:3,hDip:1,rFEarth:1000,showGrid:3,
  hDisk:100,aDip:0.05,aDelta:0.02,sceneWidth:500,PanRad:0,
  showTangent:true,showData:false,FEEqCol:'blue',FEGridCol:'gray',
  GlobeGridCol:'green',GlobeFGridCol:'yellow',TangentCol:'red'};
for(const globe of [false,true])test(`full independent composition globe=${globe}`,()=>{
  const result=bridge.composeFull(model,0,globe,{segments:24});
  const audit=bridge.auditFull(result);
  assert.equal(audit.rendererReady,true);
  assert.ok(result.ranges.find(r=>r.name==='surface-guides').count>0);
  assert.equal(result.ranges.find(r=>r.name==='mask').count,globe?1:0);
  assert.ok(result.ranges.filter(r=>r.role==='visual-aid').every(r=>
    result.scene.primitives.slice(r.start,r.end).every(p=>(!p.style||p.style.fill!=='white'))));
  assert.equal(result.scene.metadata.composition,'full-independent-guides');
  if(globe)assert.ok(result.ranges.find(r=>r.name==='horizon-guides').count>0);
});
test('full audit rejects duplicate indices',()=>{
  const result=bridge.composeFull(model,0,false,{segments:24});
  result.scene.primitives[1].commandIndex=0;
  assert.equal(bridge.auditFull(result).rendererReady,false);
});

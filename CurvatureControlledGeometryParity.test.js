'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const parity=require('./CurvatureControlledGeometryParity');
const engine=require('./CurvatureGeometryEngine');
const composer=require('./CurvatureIndependentComposition');
const fs=require('node:fs');
const model={geometryRadius:6371000,Height:7,ObjType:[3,3],NObjects:[0,3],
 ObjDist:[0,1000],ObjDeltaDist:[0,2500],ObjSidePos:[0,0],ObjSideVar:[0,0],
 ObjSideType:[0,0],ObjSize:[1,12],ObjSizeVar:[0,0],ObjSizeType:[0,0],
 rDisk:400,zDisk:3,hDip:1,rFEarth:10007543};
test('isolated pipeline includes only Type 2 tower primitives, flat mode has no visible equator rings',()=>{
 for(const globe of [true,false]){
  const c=composer.compose(model,1,globe,{towersOnly:true});
  assert.equal(c.ranges.find(r=>r.name==='outline').count,0);
  assert.equal(c.ranges.find(r=>r.name==='mask').count,globe?1:0);
  assert.equal(composer.audit(c).rendererReady,true);
  assert.equal(c.ranges.find(r=>r.name==='behind').count+c.ranges.find(r=>r.name==='before').count,33);
 }
});
test('world comparison verifies matching vertices and excludes legacy horizon circles',()=>{
 const c=composer.compose(model,1,false,{towersOnly:true});
 const towers=c.scene.primitives.filter(p=>p.type==='line'||p.type==='polygon');
 const old={primitives:towers.map(p=>({...p,points:p.points.map(q=>q.slice())})).concat([
  {type:'polygon',sourceMethod:'CircleOnPlane',points:[[100,0,-7]]}])};
 const ok=parity.compare(old,c.scene,c.ranges);
 assert.equal(ok.passed,true);
 assert.equal(ok.legacyTowerPrimitives,33);
 assert.ok(ok.comparedVertices>0);
 assert.equal(ok.maxAbsoluteErrorMeters,0);
 old.primitives[0].points[0][2]+=0.01;
 const wrong=parity.compare(old,c.scene,c.ranges);
 assert.equal(wrong.passed,false);
 assert.equal(wrong.firstMismatch.reason,'world coordinate mismatch');
 assert.equal(wrong.firstMismatch.axis,'z');
});
test('primitive and mode disagreements are reported without false passes',()=>{
 const c=composer.compose(model,1,false,{towersOnly:true});
 assert.equal(parity.compare({primitives:[]},c.scene,c.ranges).passed,false);
 assert.throws(()=>parity.compare(null,c.scene,c.ranges),/Valid scenes/);
});
test('controlled export runs legacy command tracing and reports world and pixel checks',()=>{
 const html=fs.readFileSync(__dirname+'/CurvatureApp.html','latin1');
 assert.match(html,/LegacySceneAdapter\.record\(g,function\(graph\)/);
 assert.match(html,/LegacyGeometryExtractor\.extract\(towerFrame\)/);
 assert.match(html,/CurvatureControlledGeometryParity\.compare\(/);
 assert.match(html,/CurvatureCameraVerification\.verifyPixels\(/);
 assert.match(html,/worldGeometryVerification/);
 assert.match(html,/towerOnlyReferenceAvailable=true/);
});

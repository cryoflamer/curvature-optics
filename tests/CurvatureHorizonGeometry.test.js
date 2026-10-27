'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const engine=require('../src/geometry/CurvatureGeometryEngine');
const html=fs.readFileSync(__dirname+'/../CurvatureApp.html','utf8');
const start=html.indexOf('function DrawModel(');
const end=html.indexOf('\nfunction ',start+10);
assert.ok(start>=0&&end>start);
const source=html.slice(start,end);
// Verify the actual legacy disk and horizon calls, not a reimplemented formula.
assert.match(html,/SetBgColor\(\s*'white'\s*\)/);
assert.match(html,/CircleOnPlane\(\s*0,\s*0,\s*m\.rDisk,\s*2\s*\)/);
assert.match(source,/SetPlane\(\s*\[\s*0,\s*0,\s*-m\.zDisk\s*\]/);
assert.match(source,/CircleOnPlane\(\s*0,\s*0,\s*m\.rDisk,\s*1\s*\)/);
for(const globe of [true,false])for(const radius of [0,100,5000])for(const segments of [8,64,128]){
  const model={rDisk:radius,rFEarth:200,zDisk:12,Height:20};
  const result=engine.createHorizonScenes(model,{globe,segments});
  const z=globe?-12:-20;
  assert.deepEqual(result.circle.center,[0,0,z]);
  assert.equal(result.circle.points.length,segments);
  assert.equal(result.circle.radius,globe?radius:200);
  assert.equal(result.outline.primitives.length,globe?1:2);
  assert.equal(result.mask.primitives.length,globe?1:0);
  for(const [x,y,zp] of result.circle.points){
    assert.ok(Math.abs(Math.hypot(x,y)-(globe?radius:200))<1e-8);
    assert.equal(zp,z);
  }
  if(!globe){assert.equal(Math.hypot(...result.outline.primitives[1].points[0].slice(0,2)),400);}
  if(globe){
    assert.equal(result.mask.primitives[0].style.fill,'white');
    assert.equal(result.mask.primitives[0].mode,2);
  }
}
assert.throws(()=>engine.horizonCircle({rDisk:-1,zDisk:0,Height:1}),/Nonnegative/);
assert.throws(()=>engine.horizonCircle({rDisk:1,zDisk:0,Height:1},{segments:2}),/segments/);
const model={geometryRadius:6371000,Height:7,ObjType:[3,3],NObjects:[8,0],
  ObjDist:[100,0],ObjDeltaDist:[400,0],ObjSidePos:[0,0],ObjSideVar:[0,0],
  ObjSideType:[0,0],ObjSize:[12,0],ObjSizeVar:[0,0],ObjSizeType:[0,0],
  rDisk:400,zDisk:3,hDip:1,rFEarth:1000};
const composed=engine.createTowerHorizonComposition(model,0,true,{segments:32});
assert.equal(composed.layers.length,4);
assert.equal(composed.layers[0],composed.behind);
assert.equal(composed.layers[1],composed.mask);
assert.equal(composed.layers[2],composed.outline);
assert.equal(composed.layers[3],composed.before);
assert.equal(composed.mask.primitives.length,1);
assert.equal(engine.createTowerHorizonComposition(model,0,false).mask.primitives.length,0);
console.log('CurvatureHorizonGeometry: passed');

'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const engine=require('./CurvatureGeometryEngine');
// Reference uses the actual GraphX3DX matrix operators, only in this test.
const source=fs.readFileSync(__dirname+'/GraphX3DX.js','utf8');
const start=source.indexOf('var JsgMat3=');
const end=source.indexOf('function JsgCamera',start);
assert.ok(start>0&&end>start);
const ref=vm.runInNewContext(source.slice(start,end)+'\nJsgMat3;',{});
function legacyPoint(p,u,v){
  const R=p.geometryRadius,S=p.objectSize;
  let m=ref.Scaling(p.globe?S:-S,S,S);
  m=ref.Moving(0,0,R+(p.altitude||0),m);
  if(p.globe){m=ref.RotatingY(p.latitude,m);m=ref.RotatingX(-p.longitude,m);}
  m=ref.Moving(p.globe?0:-p.latitude*R,p.globe?0:p.longitude*R,-R-p.height,m);
  return Array.from(ref.TransXYZTo(m,(p.planeOffset||0)+u*p.horizontalScale,0,v*p.verticalScale,[0,0,0]));
}
function close(a,b){assert.equal(a.length,b.length);a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<1e-8,`${i}: ${x} vs ${b[i]}`));}
let samples=0;
for(const globe of [false,true])for(const longitude of [-.45,0,.35])for(const latitude of [-.14,0,.18])for(const offset of [0,.07]){
  const p={globe,geometryRadius:6371,height:.025,objectSize:.11,longitude,latitude,verticalScale:1.23,horizontalScale:.8,planeOffset:offset};
  const plane=engine.towerPlacement(p);
  const scene=engine.createPlacedTowerType2Scene(p);
  assert.equal(scene.primitives.length,11);
  const local=engine.localTowerType2();
  scene.primitives.forEach((primitive,i)=>primitive.points.forEach((point,j)=>{
    const [u,v]=local[i].points[j];
    close(point,legacyPoint(p,u,v));samples++;
  }));
  close(plane.origin,legacyPoint(p,0,0));
}
assert.throws(()=>engine.towerPlacement({geometryRadius:0}),/Finite/);
assert.throws(()=>engine.towerPlacement({geometryRadius:0,height:0,objectSize:1,longitude:0,latitude:0,verticalScale:1,horizontalScale:1}),/Positive/);
console.log('CurvatureTowerPlacement: '+samples+' vertex comparisons passed');

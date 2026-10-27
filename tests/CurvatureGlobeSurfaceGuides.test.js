'use strict';
const assert=require('node:assert/strict');
const engine=require('../src/geometry/CurvatureGeometryEngine');
const m={Height:1000,geometryRadius:6371000,hDisk:6300000,aDip:.15,aDelta:.05,showGrid:3,GlobeGridCol:'blue',GlobeFGridCol:'red'};
const scene=engine.globeSurfaceGuides(m);
assert(scene.primitives.length>0);
assert(scene.primitives.some(p=>p.metadata.kind==='latitude'));
assert(scene.primitives.some(p=>p.metadata.kind==='longitude'));
const globe=scene.primitives.filter(p=>p.metadata.projection==='globe');
const flat=scene.primitives.filter(p=>p.metadata.projection==='plane');
assert.equal(globe.length,flat.length);
for(let i=0;i<globe.length;i++){
 assert.equal(globe[i].points.length,flat[i].points.length);
 for(let j=0;j<globe[i].points.length;j++){
  const a=globe[i].points[j],b=flat[i].points[j];
  assert.equal(a[0],b[0]);assert.equal(a[1],b[1]);assert.equal(b[2],-m.Height);
  const lat=globe[i].metadata.kind==='latitude'?globe[i].metadata.angle:null;
  if(lat!==null){const r=m.geometryRadius;const lon=Math.asin(a[0]/r);
   assert(Math.abs(a[2]-(r*Math.cos(lon)*Math.cos(lat)-(r+m.Height)))<1e-6);}
 }
}
assert.equal(engine.globeSurfaceGuides({...m,showGrid:0}).primitives.length,0);
assert.equal(engine.globeSurfaceGuides({...m,showGrid:1}).primitives.length,globe.length);
assert.equal(engine.globeSurfaceGuides({...m,showGrid:2}).primitives.length,flat.length);
assert.throws(()=>engine.globeSurfaceGuides({...m,aDelta:0}),/Valid finite/);
console.log('Globe and projected surface guides passed');

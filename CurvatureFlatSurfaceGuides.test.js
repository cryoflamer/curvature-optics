'use strict';
const assert=require('node:assert/strict');
const engine=require('./CurvatureGeometryEngine');
const base={Height:1000,rFEarth:12000,showGrid:1,FEEqCol:'blue',FEGridCol:'gray'};
const plain=engine.flatSurfaceGuides({...base,showGrid:0},{segments:24});
assert.equal(plain.primitives.length,2);
assert.deepEqual(plain.metadata.equatorRadii,[12000,24000]);
assert.equal(plain.primitives[0].points.length,24);
assert(plain.primitives[0].points.every(p=>p[2]===-1000));
for(const height of [1000000,500000,20000,2000,200,10]){
 const scene=engine.flatSurfaceGuides({...base,Height:height},{segments:32});
 const rings=scene.primitives.filter(p=>p.metadata.kind==='grid-circle');
 const rays=scene.primitives.filter(p=>p.metadata.kind==='grid-ray');
 assert.equal(rays.length,24);
 assert.equal(rings.length,scene.metadata.gridRadii.length);
 assert(rings.every(p=>p.points.length===32));
 assert(rays.every(p=>p.points.every(q=>q[2]===-height)));
}
assert.throws(()=>engine.flatSurfaceGuides({...base,Height:0}),/Positive finite/);
assert.throws(()=>engine.flatSurfaceGuides(base,{segments:5}),/segments/);
console.log('Flat surface guide geometry passed');

const assert=require('node:assert/strict');
const {test}=require('node:test');
const z=require('../src/renderers/CurvatureZBufferPreview');
const filled=require('../src/renderers/CurvatureFilledPreview');
const ear=require('../src/geometry/CurvatureEarClip');
const camera={pos:[0,0,0],center:[0,10,0],up:[0,0,1],sceneSize:10,screenSize:2,objectZExtend:0,zoom:1};
const square=[[-1,10,-1],[1,10,-1],[1,10,1],[-1,10,1]];
const scene={primitives:[1,2,3,0].map((mode,i)=>({type:'polygon',mode,commandIndex:i+1,points:square}))};
test('fill renderers exclude stroke-only and no-draw contours',()=>{
 const r=z.build(scene,camera,100,100);
 assert.equal(r.statistics.inputPolygons,4);
 assert.equal(r.statistics.strokeOnlyPolygons,1);
 assert.equal(r.statistics.fillOnlyPolygons,1);
 assert.equal(r.statistics.fillAndStrokePolygons,1);
 assert.equal(r.statistics.neitherFillNorStrokePolygons,1);
 assert.equal(r.statistics.eligibleFillPolygons,2);
 assert.equal(r.statistics.skippedNonFillPolygons,2);
 assert.equal(r.statistics.triangles,4);
 assert.deepEqual([...new Set(r.triangles.map(t=>t.commandIndex))],[2,3]);
 const f=filled.build(scene,camera,100,100);
 assert.equal(f.statistics.skippedNonFillPolygons,2);
 assert.equal(f.statistics.filledPolygons,2);
});
test('ear clipping runs only for fill-enabled contours',()=>{
 const r=z.build(scene,camera,100,100,ear.triangulate);
 assert.equal(r.statistics.successfulTriangulations,2);
 assert.equal(r.statistics.failedTriangulations||0,0);
 assert.equal(r.statistics.triangulation,'ear clipping (simple fill contours only)');
});
test('missing mode retains GraphX3DX stroke-only default',()=>{
 const r=z.build({primitives:[{type:'polygon',commandIndex:1,points:square}]},camera,100,100);
 assert.equal(r.statistics.strokeOnlyPolygons,1);
 assert.equal(r.statistics.triangles,0);
});

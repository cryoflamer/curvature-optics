const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const preview=require('../src/renderers/CurvatureFilledPreview');
const camera={pos:[0,0,0],center:[0,10,0],up:[0,0,1],sceneSize:10,screenSize:2,objectZExtend:0,zoom:1};
function polygon(index,points){return {type:'polygon',mode:2,commandIndex:index,points};}
test('front polygon is projected into viewport and filled',()=>{
 const r=preview.build({primitives:[polygon(1,[[-1,10,-1],[1,10,-1],[0,10,1]])]},camera,100,100);
 assert.equal(r.statistics.filledPolygons,1);
 assert.ok(r.polygons[0].points.every(p=>p.every(Number.isFinite)));
});
test('near-plane rejection and viewport rejection are counted',()=>{
 const r=preview.build({primitives:[polygon(1,[[-1,-10,0],[1,-10,0],[0,-10,1]]),polygon(2,[[100,10,0],[101,10,0],[100,10,1]])]},camera,100,100);
 assert.equal(r.statistics.rejectedNearPlane,1);assert.equal(r.statistics.rejectedViewport,1);
});
test('near-plane intersections are retained and clipped',()=>{
 const r=preview.build({primitives:[polygon(1,[[-1,10,0],[1,10,0],[0,-1,1]])]},camera,100,100);
 assert.equal(r.statistics.clippedNearPlane,1);
 assert.equal(r.statistics.filledPolygons,1);
});
test('farther polygons precede nearer polygons',()=>{
 const r=preview.build({primitives:[polygon(1,[[-1,5,0],[1,5,0],[0,5,1]]),polygon(2,[[-1,10,0],[1,10,0],[0,10,1]])]},camera,100,100);
 assert.deepEqual(r.polygons.map(p=>p.commandIndex),[2,1]);
});
test('ZIP export includes filled PNG and its diagnostic counters',()=>{
 const html=require('./helpers/readCurvatureSources')();
 assert.match(html,/CurvatureFilledPreview\.js/);assert.match(html,/camera-filled\.png/);assert.match(html,/cameraFilled:filledResult\.statistics/);
});

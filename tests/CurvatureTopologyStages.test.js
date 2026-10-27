const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {inspect}=require('../src/geometry/CurvatureEarClip');
const z=require('../src/renderers/CurvatureZBufferPreview');
test('inspector reports intersecting non-adjacent edge pairs',()=>{
 const r=inspect([[0,0,5],[4,4,5],[0,4,5],[4,0,5]]);
 assert.equal(r.selfIntersection,true);assert.deepEqual(r.intersectionPairs,[[0,2]]);
 assert.equal(inspect([[0,0,5],[4,0,5],[4,4,5],[0,4,5]]).selfIntersection,false);
});
test('build exposes pre- and post-near-clipping stages without altering geometry',()=>{
 const camera={pos:[0,0,0],center:[0,10,0],up:[0,0,1],sceneSize:10,screenSize:2,objectZExtend:0,zoom:1};
 const scene={primitives:[{type:'polygon',mode:2,commandIndex:17,points:[[-1,10,-1],[1,10,-1],[1,10,1],[-1,10,1]]}]};
 const entries=[];const before=z.build(scene,camera,100,100);const after=z.build(scene,camera,100,100,null,x=>entries.push(x));
 assert.equal(entries.length,1);assert.equal(entries[0].commandIndex,17);assert.equal(entries[0].preCamera.length,4);assert.equal(entries[0].postProjected.length,4);assert.deepEqual(after.triangles,before.triangles);
});
test('diagnostic export includes topology stages',()=>{
 const html=require('./helpers/readCurvatureSources')();assert.match(html,/topologyStages/);assert.match(html,/screenAfterCleanup/);
});

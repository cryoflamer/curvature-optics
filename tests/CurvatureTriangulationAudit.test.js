const assert=require('node:assert/strict');
const {test}=require('node:test');
const z=require('../src/renderers/CurvatureZBufferPreview');
const p=(x,y)=>[x,y,10];
test('convex quad has no topology warnings',()=>{
 const a=z.auditPolygon([p(0,0),p(2,0),p(2,2),p(0,2)],4);
 assert.equal(a.concave,false);assert.equal(a.fanDegenerate,0);assert.equal(a.duplicateEdges,0);
});
test('concave polygon is identified',()=>{
 const a=z.auditPolygon([p(0,0),p(4,0),p(2,1),p(4,4),p(0,4)],12);
 assert.equal(a.concave,true);assert.equal(a.commandIndex,12);
});
test('duplicate and collinear edges are counted',()=>{
 const a=z.auditPolygon([p(0,0),p(1,0),p(1,0),p(2,0),p(2,2),p(0,2)],8);
 assert.ok(a.duplicateEdges>0);assert.ok(a.collinearVertices>0);
});
test('fan degenerate triangles are reported',()=>{
 const a=z.auditPolygon([p(0,0),p(1,0),p(2,0),p(2,2),p(0,2)],5);
 assert.ok(a.fanDegenerate>0);
});
test('build includes bounded real-scene audit with command indices',()=>{
 const camera={pos:[0,0,0],center:[0,10,0],up:[0,0,1],sceneSize:10,screenSize:2,objectZExtend:0,zoom:1};
 const points=[[-1,10,-1],[1,10,-1],[1,10,1],[-1,10,1]];
 const r=z.build({primitives:[{type:'polygon',mode:2,commandIndex:22,points}]},camera,100,100);
 assert.equal(r.statistics.triangulationAudit.analyzedPolygons,1);
 assert.equal(r.statistics.triangulationAudit.concavePolygons,0);
});

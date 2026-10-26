const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const {triangulate}=require('./CurvatureEarClip');
const z=require('./CurvatureZBufferPreview');
const p=(x,y,d=5)=>[x,y,d];
function area(t){return Math.abs((t[1][0]-t[0][0])*(t[2][1]-t[0][1])-(t[1][1]-t[0][1])*(t[2][0]-t[0][0]))/2;}
test('concave polygon is triangulated without adding area',()=>{const r=triangulate([p(0,0),p(4,0),p(4,4),p(2,2),p(0,4)]);assert.equal(r.reason,null);assert.equal(r.triangles.length,3);assert.ok(Math.abs(r.triangles.reduce((s,t)=>s+area(t),0)-12)<1e-8);});
test('duplicate and collinear vertices are removed while depths remain',()=>{const r=triangulate([p(0,0,2),p(2,0,3),p(4,0,4),p(4,0,4),p(4,4,5),p(0,4,6)]);assert.equal(r.reason,null);assert.ok(r.removed>=2);assert.ok(r.triangles.flat().some(v=>v[2]===6));});
test('self-intersecting polygon is rejected, never silently fanned',()=>{const r=triangulate([p(0,0),p(4,4),p(0,4),p(4,0)]);assert.equal(r.reason,'self-intersection');assert.equal(r.triangles.length,0);});
test('clockwise polygons are supported',()=>{const r=triangulate([p(0,4),p(4,4),p(4,0),p(0,0)]);assert.equal(r.reason,null);assert.equal(r.triangles.length,2);});
test('build reports failed triangulations and preserves legacy fan mode',()=>{const camera={pos:[0,0,0],center:[0,10,0],up:[0,0,1],sceneSize:10,screenSize:2,objectZExtend:0,zoom:1};const scene={primitives:[{type:'polygon',mode:2,commandIndex:17,points:[[-1,10,-1],[1,10,-1],[1,10,1],[-1,10,1]]}]};const old=z.build(scene,camera,100,100),next=z.build(scene,camera,100,100,triangulate);assert.equal(old.triangles.length,2);assert.equal(next.triangles.length,2);assert.equal(next.statistics.successfulTriangulations,1);});
test('diagnostic export includes earclip PNG and statistics',()=>{const html=fs.readFileSync(__dirname+'/CurvatureApp.html','utf8');assert.match(html,/CurvatureEarClip\.js/);assert.match(html,/camera-earclip\.png/);assert.match(html,/cameraEarClip:earResult\.statistics/);});

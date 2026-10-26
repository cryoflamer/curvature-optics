const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const z=require('./CurvatureZBufferPreview');
const camera={pos:[0,0,0],center:[0,10,0],up:[0,0,1],sceneSize:10,screenSize:2,objectZExtend:0,zoom:1};
function polygon(commandIndex,points){return {type:'polygon',mode:2,commandIndex,points};}
test('z-buffer picks nearer surface regardless of submission order',()=>{
 const far={commandIndex:1,points:[[1,1,10],[9,1,10],[1,9,10]]},near={commandIndex:2,points:[[1,1,5],[9,1,5],[1,9,5]]};
 for(const ts of [[far,near],[near,far]]){const r=z.rasterize(ts,12,12);assert.equal(ts[r.owner[3*12+3]].commandIndex,2);}
});
test('perspective-correct inverse depth interpolates near vertex',()=>{
 const flat={points:[[0,0,5],[10,0,5],[0,10,5]]},variable={points:[[0,0,2],[10,0,20],[0,10,20]]};
 const r=z.rasterize([flat,variable],12,12);
 assert.equal(r.owner[1*12+1],1);assert.equal(r.owner[4*12+4],0);
});
test('offscreen triangles are safe and do not draw',()=>{const r=z.rasterize([{points:[[100,100,2],[110,100,2],[100,110,2]]}],12,12);assert.equal(r.depthWrites,0);});
test('camera build triangulates a visible polygon and clips near plane',()=>{
 const r=z.build({primitives:[polygon(1,[[-1,10,-1],[1,10,-1],[1,10,1],[-1,10,1]]),polygon(2,[[-1,-10,0],[1,-10,0],[0,-10,1]])]},camera,100,100);
 assert.equal(r.statistics.triangles,2);assert.equal(r.statistics.rejectedNearPlane,1);
});
test('diagnostic export includes z-buffer PNG and statistics',()=>{const html=fs.readFileSync(__dirname+'/CurvatureApp.html','utf8');assert.match(html,/CurvatureZBufferPreview\.js/);assert.match(html,/camera-zbuffer\.png/);assert.match(html,/cameraZBuffer:zResult\.statistics/);});

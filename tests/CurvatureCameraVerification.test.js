const assert=require('node:assert/strict');
const {test}=require('node:test');
const preview=require('../src/renderers/CurvaturePerspectivePreview');
const verifier=require('../src/diagnostics/CurvatureCameraVerification');
const cam={CamPos:[0,0,0],CamViewCenter:[0,10,0],CamUp:[0,0,1],SceneSize:10,ScreenSize:2,ObjectZExtend:0,Zoom:1};
cam.Trans=function(v){return [v[0]*2/v[1],v[2]*2/v[1],v[1]];};
test('compares independent camera projection with legacy transform',()=>{
 const scene={primitives:[{commandIndex:4,type:'line',points:[[1,10,2],[-2,20,4],[0,-1,0]]}]};
 const r=verifier.verify(scene,cam,preview);
 assert.equal(r.passed,true);assert.equal(r.comparedPoints,2);assert.equal(r.skippedBehindCamera,1);
});
test('reports the first camera discrepancy',()=>{
 const bad={...cam,Trans:()=>[999,0,10]};
 const r=verifier.verify({primitives:[{commandIndex:7,points:[[1,10,2]]}]},bad,preview);
 assert.equal(r.passed,false);assert.equal(r.firstMismatch.commandIndex,7);
});

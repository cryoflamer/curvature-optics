const assert=require('node:assert/strict');
const {test}=require('node:test');
const ref=require('./CurvatureNearPlaneReference');
const preview=require('./CurvaturePerspectivePreview');
const cam={CamPos:[0,0,0],CamViewCenter:[0,10,0],CamUp:[0,0,1],SceneSize:10,ScreenSize:2,ObjectZExtend:0,Zoom:1};
test('reference handles rejected, retained and crossing camera segments',()=>{
 const p=(z)=>({x:0,y:0,z});
 assert.equal(ref.clip(p(-1),p(0),1e-6),null);
 assert.deepEqual(ref.clip(p(2),p(3),1e-6),[p(2),p(3)]);
 const crossing=ref.clip(p(-2),p(2),1e-6);
 assert.ok(Math.abs(crossing[0].z-1e-6)<1e-12);
 assert.equal(crossing[1].z,2);
});
test('real preview compares near clipping for all segment categories',()=>{
 globalThis.CurvatureNearPlaneReference=ref;
 try{
 const scene={primitives:[
  {type:'line',commandIndex:1,points:[[0,-1,0],[0,10,0]]},
  {type:'line',commandIndex:2,points:[[0,10,0],[0,20,0]]},
  {type:'line',commandIndex:3,points:[[0,-2,0],[0,-1,0]]}
 ]};
 const r=preview.project(scene,cam,100,100);
 assert.equal(r.nearPlaneVerification.comparedSegments,3);
 assert.equal(r.nearPlaneVerification.mismatches,0);
 assert.equal(r.nearPlaneVerification.firstMismatch,null);
 }finally{delete globalThis.CurvatureNearPlaneReference;}
});

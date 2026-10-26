const assert=require('node:assert/strict');
const {test}=require('node:test');
const preview=require('./CurvaturePerspectivePreview');
const cam={CamPos:[0,0,0],CamViewCenter:[0,10,0],CamUp:[0,0,1],SceneSize:10,ScreenSize:2,ObjectZExtend:0,Zoom:1};
function project(points){return preview.project({primitives:[{type:'line',commandIndex:5,points}]},cam,100,100);}
test('viewport clip retains visible part of a crossing segment',()=>{
 const result=preview.clipViewport([-20,50],[120,50],100,100);
 assert.deepEqual(result,[[0,50],[100,50]]);
});
test('viewport clip rejects fully outside segment',()=>{
 assert.equal(preview.clipViewport([-20,10],[-10,90],100,100),null);
});
test('viewport clip preserves fully visible segment',()=>{
 assert.deepEqual(preview.clipViewport([10,20],[30,40],100,100),[[10,20],[30,40]]);
});
test('project clips near plane and viewport while preserving command index',()=>{
 const r=project([[0,-10,0],[0,10,0]]);
 assert.equal(r.clippedAtNearPlane,1);
 assert.equal(r.segments.length,1);
 assert.equal(r.segments[0].commandIndex,5);
 assert.equal(r.clippingMode,'independent-near-and-viewport');
});
test('project excludes offscreen segments',()=>{
 const r=project([[100,10,0],[101,10,0]]);
 assert.equal(r.segments.length,0);
 assert.equal(r.clippedOutsideViewport,1);
});

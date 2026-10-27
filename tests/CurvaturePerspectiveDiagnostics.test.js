const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const {summarize}=require('../src/diagnostics/CurvaturePerspectiveDiagnostics');
const preview=require('../src/renderers/CurvaturePerspectivePreview');
const camera={CamPos:[0,0,0],CamViewCenter:[0,10,0],CamUp:[0,0,1],SceneSize:10,ScreenSize:2,ObjectZExtend:0,Zoom:1};
test('ZIP camera diagnostics carry actual projection clipping counters',()=>{
 const scene={primitives:[
  {type:'line',commandIndex:1,points:[[0,-10,0],[0,10,0]]},
  {type:'line',commandIndex:2,points:[[100,10,0],[101,10,0]]},
  {type:'line',commandIndex:3,points:[[-100,10,0],[100,10,0]]}
 ]};
 const result=preview.project(scene,camera,100,100);
 const snapshot=preview.snapshot(camera);
 const report=summarize(result,snapshot);
 for(const key of ['skippedBehindCamera','clippedOutsideViewport','clippedToViewport','clippedAtNearPlane'])assert.equal(report[key],result[key]);
 assert.equal(report.segments,result.segments.length);
 assert.equal(report.clippingMode,'independent-near-and-viewport');
 assert.ok(report.clippedOutsideViewport>0);
 assert.ok(report.clippedToViewport>0);
 assert.ok(report.clippedAtNearPlane>0);
 assert.ok(report.limitations.every(x=>!x.includes('No viewport clipping')));
});
test('HTML ZIP exporter serializes the summary of the same drawn perspective result',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../CurvatureApp.html'),'utf8');
 assert.match(html,/<script src="src\/diagnostics\/CurvaturePerspectiveDiagnostics\.js"><\/script>/);
 assert.match(html,/cameraPerspective:window\.CurvaturePerspectiveDiagnostics\.summarize\(perspectiveResult,cameraSnapshot\)/);
});
test('malformed projection counters cannot silently be exported',()=>{
 assert.throws(()=>summarize({segments:[],clippingMode:'independent-near-and-viewport'},{}),/counter/);
});

const assert=require('node:assert/strict');
const {test}=require('node:test');
const ref=require('../src/renderers/CurvatureViewportReference');
const preview=require('../src/renderers/CurvaturePerspectivePreview');
const {summarize}=require('../src/diagnostics/CurvaturePerspectiveDiagnostics');
const camera={CamPos:[0,0,0],CamViewCenter:[0,10,0],CamUp:[0,0,1],SceneSize:10,ScreenSize:2,ObjectZExtend:0,Zoom:1};
test('independent reference agrees on inside, outside and boundary crossing cases',()=>{
 const samples=[[[10,10],[90,90]], [[-20,30],[120,70]], [[50,-10],[50,110]], [[-20,-20],[-1,-1]], [[0,0],[100,100]], [[120,50],[-20,50]]];
 for(const [a,b] of samples){const actual=preview.clipViewport(a,b,100,100),expected=ref.clip(a,b,100,100);assert.ok(ref.compare(actual,expected,1e-9)<Infinity,JSON.stringify({a,b,actual,expected}));}
});
test('independent reference agrees on deterministic randomized segments',()=>{
 let seed=73;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
 for(let i=0;i<2000;i++){const a=[rand()*400-150,rand()*400-150],b=[rand()*400-150,rand()*400-150];const actual=preview.clipViewport(a,b,100,100),expected=ref.clip(a,b,100,100);assert.ok(ref.compare(actual,expected,1e-7)<Infinity,JSON.stringify({i,a,b,actual,expected}));}
});
test('real projection publishes numerical viewport cross-check when reference loaded',()=>{
 const old=globalThis.CurvatureViewportReference;
 try{globalThis.CurvatureViewportReference=ref;
 const scene={primitives:[{type:'line',commandIndex:7,points:[[-100,10,0],[100,10,0]]},{type:'line',commandIndex:8,points:[[0,-10,0],[0,10,0]]}]};
 const result=preview.project(scene,camera,100,100);
 assert.ok(result.viewportVerification.comparedSegments>0);
 assert.equal(result.viewportVerification.mismatches,0);
 assert.equal(result.viewportVerification.firstMismatch,null);
 const report=summarize(result,preview.snapshot(camera));assert.equal(report.viewportVerification.passed,true);
 }finally{if(old===undefined)delete globalThis.CurvatureViewportReference;else globalThis.CurvatureViewportReference=old;}
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const checker=require('./CurvatureControlledCamera');
const comparison=require('./CurvatureCompositionComparison');
const fs=require('node:fs');
const vm=require('node:vm');
const model={camPos:[0,0,0],camViewCenter:[0,100,-4],camUp:[0,0.04,0.999],camSceneSize:70};
const actual={pos:[0,0,0],center:[0,100,-4],up:[0,0.04,0.999],sceneSize:70,
  screenSize:100,objectZExtend:1,zoom:1,near:0.001,
  pixelTransform:{width:200,height:100,scaleX:2,scaleY:-2,offsetX:100,offsetY:50,
   stroke:{autoScale:true,pixelScale:1.5}}};
test('controlled camera is derived from updated model and checked against real graph',()=>{
 const result=checker.verify(actual,model,200,100);
 assert.equal(result.matched,true);
 const candidate=checker.candidate(actual,model,200,100);
 assert.deepEqual(candidate,actual);
 assert.notStrictEqual(candidate,actual);
 assert.notStrictEqual(candidate.pixelTransform,actual.pixelTransform);
 assert.notStrictEqual(candidate.pos,actual.pos);
 assert.throws(()=>checker.verify({...actual,pos:[1,0,0]},model,200,100),/camPos/);
 assert.throws(()=>checker.verify({...actual,zoom:2},model,200,100),/scale\/zoom/);
 assert.throws(()=>checker.verify(actual,model,201,100),/viewport/);
});
test('camera comparison verifies nested viewport properties instead of discarding them',()=>{
 const rgba=new Uint8ClampedArray(4*2*2);
 const ref={width:2,height:2,camera:actual,rgba};
 const candidate={...ref,camera:{...actual,pixelTransform:{...actual.pixelTransform,scaleX:5}}};
 assert.throws(()=>comparison.compare(ref,candidate),/Camera mismatch/);
});
test('actual legacy DrawModel has a separate controlled towers-only path',()=>{
 const html=fs.readFileSync(__dirname+'/CurvatureApp.html','latin1');
 const start=html.indexOf('function DrawModel( g ) {');
 const end=html.indexOf('\nfunction ',start+10);
 assert.ok(start>=0&&end>start);
 const calls=[];
 const m={showModel:1,camSceneSize:80,camPos:[0,0,0],camUp:[0,0,1],camViewCenter:[0,10,0]};
 const context={window:{},CurveApp:m,
   DrawObjectsBehindHorizon:(idx)=>calls.push(['behind',idx]),
   DrawObjectsBeforeHorizon:(idx,graph,globe)=>calls.push(['before',idx,globe])};
 vm.runInNewContext(html.slice(start,end)+'\nthis.draw=DrawModel;',context);
 const graph={SetAngleMeasure(){},SetViewport(){},SetGraphClipping(){},SetCameraClipping(){},
  SetWindowToCameraScreen(){},SetCamera(){},SetCameraZoom(){}};
 context.draw(graph,{towerOnlyIndex:1});
 assert.deepEqual(calls,[['behind',1],['before',1,true]]);
 calls.length=0;m.showModel=2;
 context.draw(graph,{towerOnlyIndex:1});
 assert.deepEqual(calls,[['before',1,false]]);
 assert.throws(()=>context.draw(graph,{towerOnlyIndex:0}),/Objects 2/);
});
test('controlled export validates independently sampled cameras and isolated comparisons',()=>{
 const html=fs.readFileSync(__dirname+'/CurvatureApp.html','latin1');
 assert.match(html,/controlledModel\.Update\(\);[\s\S]*CurvatureControlledLegacyCapture\.capture/);
 assert.match(html,/legacyFullCamera=cameraFromGraph\(\)/);
 assert.match(html,/legacyTowerCamera=cameraFromGraph\(\)/);
 assert.match(html,/CurvatureControlledCamera\.verify\(referenceFrames\.fullCamera/);
 assert.match(html,/CurvatureControlledCamera\.verify\(referenceFrames\.towerCamera/);
 assert.match(html,/renderCandidate\(\{towersOnly:true\},towerCamera\)/);
 assert.match(html,/entry\.towerOnlyReferenceAvailable=true/);
 assert.match(html,/m\.diagnosticAlwaysShowLegacyTowers === true/);
});

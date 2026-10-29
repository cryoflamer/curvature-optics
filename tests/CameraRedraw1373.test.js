'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const frame=require('../src/scene/CurvatureRenderFrame');
const renderer=require('../src/renderers/CurvatureFrameRenderer');
const contract=require('../src/scene/CurvatureSceneContract');
const camera={pos:[0,-20,10],center:[0,0,0],up:[0,0,1],sceneSize:40,
  screenSize:40,objectZExtend:0,zoom:1};
const input=[
 {type:'line',points:[[0,0,0],[1,0,0]],commandIndex:0,style:{stroke:'red',lineWidth:2}},
 {type:'polygon',points:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],commandIndex:1,
  mode:3,style:{fill:'blue',stroke:'green'}},
 {type:'line',points:[[0,0,1],[1,0,1]],commandIndex:2,style:{stroke:'red'}}
];
function composition(){
 const ranges=[{name:'guide',role:'visual-aid',start:0,end:1,count:1},
   {name:'towers',role:'objects',start:1,end:3,count:2}];
 return {scene:contract.createScene('legacy',input,{layerRanges:ranges}),ranges};
}
function canvas(){
 const operations=[];
 const ctx={globalAlpha:1,clearRect(){operations.push(['clear']);},
   beginPath(){operations.push(['begin']);},moveTo(...p){operations.push(['move',...p]);},
   lineTo(...p){operations.push(['line',...p]);},closePath(){operations.push(['close']);},
   fill(){operations.push(['fill']);},stroke(){operations.push(['stroke']);}};
 return {width:128,height:96,getContext(){return ctx;},operations};
}
test('137.3: atomic physical painter yields the same ordered Canvas commands and statistics',()=>{
 const composed=composition(),before=JSON.stringify(composed),view=structuredClone(camera);
 const a=canvas(),b=canvas();
 const old=renderer.render(a,frame.fromComposition(composed,view,128,96),{mode:'painter'});
 const fast=renderer.renderComposition(b,composed,view,128,96,{mode:'painter'});
 assert.deepEqual(b.operations,a.operations);
 assert.deepEqual(fast.statistics,old.statistics);
 assert.deepEqual(fast.geometryStatistics,old.geometryStatistics);
 assert.deepEqual(fast.layerCounts,old.layerCounts);
 assert.equal(JSON.stringify(composed),before,'caller must keep ownership of scene');
 assert.deepEqual(view,camera,'camera must not change');
 assert.ok(Number.isFinite(fast.timings.snapshotMs)&&fast.timings.snapshotMs>=0);
});
test('137.3: public frame rendering still rejects mutation and invalid snapshots',()=>{
 const composed=composition(),f=frame.fromComposition(composed,camera,128,96);
 f.scene.primitives[1].commandIndex=5;
 assert.throws(()=>renderer.render(canvas(),f),/indices/);
 assert.throws(()=>renderer.renderComposition(canvas(),composed,camera,127,96),/viewport/);
 assert.throws(()=>renderer.renderComposition(canvas(),composed,camera,128,96,{mode:'invalid'}),/mode/);
 const broken=composition();broken.scene.primitives[1].points[0][0]=Infinity;
 assert.throws(()=>renderer.renderComposition(canvas(),broken,camera,128,96),/Non-serializable|Invalid 3D/);
 assert.deepEqual(composed.scene.primitives[1].points[0],[0,0,0]);
});
test('137.3: sequential A and B compositions cannot contaminate one another',()=>{
 const a=composition(),b=composition(),bOriginal=JSON.stringify(b);
 a.scene.primitives[0].style.stroke='pink';
 const outputA=canvas(),outputB=canvas();
 renderer.renderComposition(outputA,a,camera,128,96,{mode:'painter'});
 renderer.renderComposition(outputB,b,camera,128,96,{mode:'painter'});
 const reference=canvas();
 renderer.render(reference,frame.fromComposition(b,camera,128,96),{mode:'painter'});
 assert.deepEqual(outputB.operations,reference.operations);
 assert.equal(JSON.stringify(b),bOriginal);
});
test('137.3: adopted frame snapshots remain isolated from original primitives',()=>{
 const scene=composition(),f=frame.fromComposition(scene,camera,128,96);
 const oldStyle=f.scene.primitives[0].style.stroke;
 scene.scene.primitives[0].style.stroke='orange';
 scene.scene.primitives[0].points[0][0]=900;
 assert.equal(f.scene.primitives[0].style.stroke,oldStyle);
 assert.equal(f.scene.primitives[0].points[0][0],0);
});

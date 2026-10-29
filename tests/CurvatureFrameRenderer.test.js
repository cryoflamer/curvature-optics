'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const contract=require('../src/scene/CurvatureSceneContract');
const frames=require('../src/scene/CurvatureRenderFrame');
const renderer=require('../src/renderers/CurvatureFrameRenderer');
const camera={pos:[0,-20,10],center:[0,0,0],up:[0,0,1],sceneSize:40,screenSize:40,objectZExtend:0,zoom:1};
const scene=contract.createScene('legacy',[
 {type:'line',points:[[0,0,0],[1,0,0]],commandIndex:0,style:{stroke:'red',lineWidth:2}},
 {type:'polygon',points:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],commandIndex:1,
  mode:3,style:{fill:'blue',stroke:'green'}}]);
function fakeCanvas(width,height){
 const pixels=new Uint8ClampedArray(width*height*4);
 const ctx={globalAlpha:1,clearRect(){pixels.fill(0)},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},
  createImageData(){return {data:new Uint8ClampedArray(width*height*4)}},
  putImageData(img){pixels.set(img.data)},getImageData(){return {data:pixels}}};
 return {width,height,getContext(){return ctx}};
}

test('painter and zbuffer consume the same world frame through one API',()=>{
 const frame=frames.fromScene(scene,camera,64,48);
 const original=JSON.stringify(frame);
 const painter=renderer.render(fakeCanvas(64,48),frame);
 const depth=renderer.render(fakeCanvas(64,48),frame,{mode:'zbuffer'});
 assert.equal(painter.mode,'painter');assert.equal(depth.mode,'zbuffer');
 assert.equal(painter.statistics.inputLines,1);assert.equal(depth.statistics.inputPolygons,1);
 assert.equal(painter.layerCounts[0].count,2);
 assert.equal(depth.layerCounts[0].name,'geometry');
 assert.equal(JSON.stringify(frame),original);
 assert.deepEqual(renderer.MODES,['painter','zbuffer','gpu-painter']);
});

test('invalid mode, viewport, or modified frame fails before rendering',()=>{
 const frame=frames.fromScene(scene,camera,64,48);
 assert.throws(()=>renderer.render(fakeCanvas(64,48),frame,{mode:'unknown'}),/mode/);
 assert.throws(()=>renderer.render(fakeCanvas(65,48),frame),/viewport/);
 const altered=structuredClone(frame);altered.scene.primitives[1].commandIndex=0;
 assert.throws(()=>renderer.render(fakeCanvas(64,48),altered),/indices/);
});

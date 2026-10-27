'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const contract=require('../src/scene/CurvatureSceneContract');
const frameApi=require('../src/scene/CurvatureRenderFrame');
const commandFrames=require('../src/scene/SceneFrame');
const camera={pos:[0,-50,10],center:[0,0,0],up:[0,0,1],sceneSize:100,screenSize:90,
 objectZExtend:0,zoom:1,pixelTransform:{width:120,height:90,scaleX:1,scaleY:-1,
 offsetX:60,offsetY:45,stroke:{pixelScale:1,minWidth:1,autoScale:false,
 scaleInt:false,devicePixelRatio:1,contextScale:1}}};
const scene=contract.createScene('legacy',[
 {type:'line',points:[[0,0,0],[1,0,0]],commandIndex:0,style:{stroke:'#123',lineWidth:2}},
 {type:'polygon',points:[[0,0,0],[1,0,0],[0,1,0]],commandIndex:1,mode:3,
  style:{fill:'white',stroke:undefined}}],
 {layerRanges:[{name:'objects',role:'objects',start:0,end:1,count:1},
  {name:'mask',role:'occlusion',start:1,end:2,count:1}]});

test('world frame serializes camera, viewport, styles, ordered occlusion layers',()=>{
 const frame=frameApi.fromScene(scene,camera,120,90);
 assert.equal(frame.kind,'world-scene-frame');
 assert.equal(frame.version,1);
 assert.deepEqual(frame.layers.map(x=>x.role),['objects','occlusion']);
 assert.deepEqual(frame.viewport,{width:120,height:90});
 assert.equal(frame.scene.primitives[0].style.stroke,'#123');
 assert.equal('stroke' in frame.scene.primitives[1].style,false);
 assert.deepEqual(frameApi.validate(JSON.parse(JSON.stringify(frame))),frame);
 assert.equal(commandFrames.KIND,undefined); // transitional legacy format remains distinct
});

test('mutating the model, camera or serialized result does not mutate frame snapshot',()=>{
 const original=frameApi.fromScene(scene,camera,120,90);
 const copied=frameApi.validate(original);
 copied.camera.pos[0]=100;copied.scene.primitives[0].points[0][0]=55;
 assert.equal(original.camera.pos[0],0);
 assert.equal(original.scene.primitives[0].points[0][0],0);
 const inCamera=structuredClone(camera),inScene=structuredClone(scene);
 const f=frameApi.fromScene(inScene,inCamera,120,90);
 inCamera.pos[0]=789;inScene.primitives[0].style.stroke='pink';
 assert.equal(f.camera.pos[0],0);assert.equal(f.scene.primitives[0].style.stroke,'#123');
});

test('invalid camera, viewport, primitives and layer ordering are rejected',()=>{
 assert.throws(()=>frameApi.fromScene(scene,{...camera,up:[0,0,0]},120,90),/camera basis/);
 assert.throws(()=>frameApi.fromScene(scene,{...camera,zoom:0},120,90),/camera snapshot/);
 assert.throws(()=>frameApi.fromScene(scene,camera,120,0),/viewport/);
 assert.throws(()=>frameApi.fromScene(scene,{...camera,pixelTransform:{...camera.pixelTransform,width:100}},120,90),/pixel transform/);
 assert.throws(()=>frameApi.fromScene(scene,camera,120,90,[{name:'x',start:0,end:1}]),/Layers/);
 assert.throws(()=>frameApi.fromScene(scene,camera,120,90,[{name:'x',start:0,end:2},{name:'x',start:2,end:2}]),/layer/);
 assert.throws(()=>frameApi.fromScene(scene,camera,120,90,[{name:'x',start:1,end:2}]),/layer/);
 const duplicate=structuredClone(scene);duplicate.primitives[1].commandIndex=0;
 assert.throws(()=>frameApi.fromScene(duplicate,camera,120,90),/command indices/);
 const corrupt=frameApi.fromScene(scene,camera,120,90);corrupt.layers[1].start=0;
 assert.throws(()=>frameApi.validate(corrupt),/layer/);
 const unsafe=structuredClone(scene);unsafe.primitives[0].style.fn=()=>{};
 assert.throws(()=>frameApi.fromScene(unsafe,camera,120,90),/Non-serializable/);
});

test('frame generated from independent composition preserves layer roles',()=>{
 const composed={scene,ranges:scene.metadata.layerRanges};
 assert.equal(frameApi.fromComposition(composed,camera,120,90).layers[1].role,'occlusion');
});

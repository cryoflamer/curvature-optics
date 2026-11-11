'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const studio=require('../src/animation/ModernAnimationStudio');
const projectApi=require('../src/animation/ModernAnimationProject');
const png=require('../src/animation/ModernAnimationFrameExport');
const video=require('../src/animation/ModernAnimationVideoPipeline');
const state=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');

const APPEARANCE={opacity:25,position:'bottom-right',size:125};
const OTHER={opacity:90,position:'top-left',size:75};
function makeProject(){
  const model={Height:15,FocalLengthField:1000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:0,DemoText:'Test',Description:'',
    ObjType:[3,3],NObjects:[1,0],ObjDist:[1000,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  const a=state.capture(model,{atmosphere:'vacuum',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},
    compare.preset('globe-flat-vacuum'),
    {mode:'compare',eyeLevel:false,horizon:false,selected:'A'});
  const b=structuredClone(a);b.scene.camera.Height=20;
  return projectApi.create([{experiment:a,holdMs:0},
    {experiment:b,travelMs:1000}],{id:'hud_consistency',name:'HUD consistency'});
}
function fakeCanvas(width,height){
  const operations=[];
  const ctx={globalCompositeOperation:'source-over',globalAlpha:1,fillStyle:'',
    save(){operations.push(['save']);},restore(){operations.push(['restore']);},
    setTransform(){operations.push(['transform']);},
    fillRect(...a){operations.push(['rectangle',this.globalCompositeOperation,this.fillStyle,...a]);},
    strokeText(...a){operations.push(['stroke',this.strokeStyle,...a]);},
    fillText(...a){operations.push(['text',this.fillStyle,...a]);},
    measureText(s){return {width:s.length*7}}};
  return {width,height,operations,getContext(){return ctx;},toBlob(cb){
    cb(new Blob([Uint8Array.from([137,80,78,71,13,10,26,10]),
      Buffer.from(JSON.stringify(operations))],{type:'image/png'}));
  }};
}
function renderer(store){return async(_sample,side,{width,height})=>{
  const canvas=fakeCanvas(width,height);store[side]=canvas;
  return {quality:'accurate',canvas,metrics:{opticalQuality:'accurate'},
    cameraModel:{showModel:side==='A'?1:2,rEarth:6371000,rFEarth:10007543,
      Height:15,CameraEast:0,CameraNorth:0,Pan:0,Nick:0,Roll:0,
      camViewAngle:Math.PI/3,viewcenterHorizon:3,deviceRatio:1.5}};
};}

test('older project without an appearance stays compatible across Studio, PNG and video',()=>{
  const old=makeProject();
  assert.equal(Object.hasOwn(old,'cameraHudAppearance'),false);
  assert.equal(studio.fromProject(old).cameraHudAppearance,null);
  assert.equal(Object.hasOwn(projectApi.validate(old),'cameraHudAppearance'),false);
  assert.deepEqual(png.plan(old,{fps:5,cameraHud:true}).cameraHudAppearance,
    {opacity:90,position:'top-left',size:100});
  assert.deepEqual(video.plan(old,{fps:5,cameraHud:true,
    cameraHudAppearance:APPEARANCE}).cameraHudAppearance,APPEARANCE);
  const named=studio.build(studio.edit(studio.fromProject(old),'cameraHudAppearance',APPEARANCE),old.id);
  assert.deepEqual(png.plan(named,{fps:5,cameraHud:true}).cameraHudAppearance,APPEARANCE);
  assert.deepEqual(video.plan(named,{fps:5,cameraHud:true}).cameraHudAppearance,APPEARANCE);
});

test('disabled camera HUD produces identical PNG and A/B video render input across appearance settings',async()=>{
  const project=makeProject();
  const noHudPng=async appearance=>{
    const canvases={};
    const p=png.plan(project,{fps:5,width:640,height:360,cameraHud:false,
      cameraHudAppearance:appearance});
    const frame=await png.renderTimestamp(p,0,renderer(canvases));
    assert.equal(canvases.A.operations.some(row=>row[0]==='text'),false);
    assert.equal(canvases.B.operations.some(row=>row[0]==='text'),false);
    return {bytes:frame.entries.map(e=>Buffer.from(e.data).toString('hex')),
      manifestPlan:p};
  };
  const p1=await noHudPng(APPEARANCE),p2=await noHudPng(OTHER);
  assert.deepEqual(p1.bytes,p2.bytes);
  const noHudVideo=async appearance=>{
    const p=video.plan(project,{fps:5,width:640,height:360,cameraHud:false,
      cameraHudAppearance:appearance});
    const source={},frameInfo={};
    class Frame{constructor(c){this.canvas=c;this.closed=false;}close(){this.closed=true;}}
    const result=await video.renderTimestamp(p,0,renderer(source),Frame,null,(images)=>{
      frameInfo.A=images.A.canvas.operations;
      frameInfo.B=images.B.canvas.operations;
      return {width:p.outputWidth,height:p.outputHeight};
    });
    assert.equal(Object.keys(result.frames).join(','),'COMBINED');
    assert.equal(result.frames.COMBINED.closed,false);
    video.closeFrames(result);
    assert.equal(result.frames.COMBINED.closed,true);
    for(const side of ['A','B'])assert.equal(frameInfo[side].some(op=>op[0]==='text'),false);
    return frameInfo;
  };
  assert.deepEqual(await noHudVideo(APPEARANCE),await noHudVideo(OTHER));
});

test('one-worker PNG compatibility entrypoint forwards HUD settings on its second export plan',async()=>{
  // Evaluate the actual worker entrypoint, replacing only the expensive physical
  // setup and PNG encoder. Unlike a static source check, this executes onmessage.
  const source=fs.readFileSync(path.join(__dirname,'../src/animation/ModernAnimationFrameWorker.js'),'utf8');
  const posted=[],plans=[],scope={};
  const self={postMessage(value){posted.push(value);},
    CurvatureModernAnimationFrameExport:{async run(args){plans.push(args);
      return {cancelled:false,blob:new Blob(['PNG']),manifest:{cameraHudIncluded:args.cameraHud,
        cameraHudAppearance:args.cameraHudAppearance}};
    }}};
  Object.assign(scope,{self,importScripts(){},performance:{now:()=>0},setTimeout,Promise});
  vm.createContext(scope);
  vm.runInContext(source,scope,{filename:'ModernAnimationFrameWorker.js'});
  scope.setup=data=>({plan:{project:{},fps:5,width:640,height:360,timesMs:[0],sides:['A'],
    cameraHud:data.cameraHud===true,cameraHudAppearance:data.cameraHudAppearance},
    render:async()=>null});
  await self.onmessage({data:{type:'start',cameraHud:true,cameraHudAppearance:APPEARANCE}});
  assert.equal(posted.at(-1).type,'complete');
  assert.equal(plans[0].cameraHud,true);
  assert.deepEqual(plans[0].cameraHudAppearance,APPEARANCE);
  assert.equal(posted.at(-1).manifest.cameraHudIncluded,true);
  await self.onmessage({data:{type:'start',cameraHud:false,cameraHudAppearance:OTHER}});
  assert.equal(plans[1].cameraHud,false);
  assert.deepEqual(plans[1].cameraHudAppearance,OTHER);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const telemetry=require('../src/camera/ModernCameraTelemetry');
const hud=require('../src/animation/ModernAnimationCanvasHud');
const png=require('../src/animation/ModernAnimationFrameExport');
const video=require('../src/animation/ModernAnimationVideoPipeline');
const projects=require('../src/animation/ModernAnimationProject');
const state=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');

function camera(showModel=1,change=0){return {showModel,rEarth:6371000,rFEarth:10007543,
  Height:100+change,CameraEast:3000+change,CameraNorth:4000,
  Pan:45+change,Nick:2,Roll:0,camViewAngle:Math.PI/3,
  viewcenterHorizon:3,deviceRatio:1.5};}
function mockCanvas(width=960,height=540){
  const actions=[],ctx={globalCompositeOperation:'source-over',globalAlpha:1,
    fillStyle:'',font:'',save(){actions.push(['save']);},
    restore(){actions.push(['restore']);},
    setTransform(...args){actions.push(['transform',...args]);},
    fillRect(...args){actions.push(['rect',this.globalCompositeOperation,this.fillStyle,...args]);},
    fillText(...args){actions.push(['text',this.globalCompositeOperation,this.fillStyle,...args]);},
    measureText(text){return {width:text.length*7};}};
  return {width,height,actions,ctx,getContext(type){assert.equal(type,'2d');return ctx;},
    toBlob(cb,type){
      assert.equal(type,'image/png');
      // Test data includes exactly the drawn telemetry text, but is not an
      // actual PNG raster (no browser/offscreen canvas available in Node).
      const printed=actions.filter(x=>x[0]==='text').map(x=>x[3]).join('|');
      const data=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
        Buffer.from(printed)]);
      cb(new Blob([data],{type:'image/png'}));
    }};
}
function makeProject(mode='scene'){
  const m={Height:15,FocalLengthField:1000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:0,DemoText:'Animation',Description:'',
    ObjType:[3,3],NObjects:[1,0],ObjDist:[1000,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  const a=state.capture(m,{atmosphere:'vacuum',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},
    compare.preset('globe-flat-vacuum'),
    {mode,eyeLevel:false,horizon:false,selected:'A'});
  const b=structuredClone(a);
  if(mode==='scene')b.scene.surface.showModel=2;
  else b.compare.A.surface='flat';
  return projects.create([{experiment:a,holdMs:0},
    {experiment:b,travelMs:1000}],{id:'camera_hud',name:'Camera HUD'});
}
function renderFor(sides,store){return async(_sample,side,opts)=>{
  const canvas=mockCanvas(opts.width,opts.height);
  store[side]=canvas;
  return {quality:'accurate',canvas,cameraModel:camera(side==='B'?2:1,opts.timeMs/100),
    metrics:{opticalQuality:'accurate'}};
};}

test('HUD uses shared physical telemetry strings for Globe and Flat without mutating camera',()=>{
  for(const geometry of [1,2]){
    const m=camera(geometry),original=structuredClone(m),canvas=mockCanvas();
    const output=hud.paint(canvas,m),strings=canvas.actions.filter(x=>x[0]==='text').map(x=>x[3]);
    assert.equal(output,canvas);
    assert.deepEqual(m,original);
    assert.equal(strings[0],'CAMERA · '+(geometry===1?'GLOBE':'FLAT'));
    const expected=telemetry.format(telemetry.measure(m));
    assert.match(strings[1],new RegExp(expected.height.replace('.','\\.')));
    assert.ok(strings[2].includes(expected.east));
    assert.ok(strings[3].includes(expected.pitch));
    assert.ok(strings[4].includes(expected.fov));
    assert.ok(canvas.actions.some(x=>x[0]==='rect'&&x[1]==='source-over'));
    assert.deepEqual(canvas.actions.at(-1),['restore']);
  }
});
test('HUD validates input before painting and scales with fixed output resolution',()=>{
  const small=mockCanvas(640,360),large=mockCanvas(1280,720);
  hud.paint(small,camera());hud.paint(large,camera());
  const sw=small.actions.find(x=>x[0]==='rect')[4];
  const lw=large.actions.find(x=>x[0]==='rect')[4];
  assert.ok(sw<lw,'HUD layout grows with physical export resolution');
  const invalid=mockCanvas();
  assert.throws(()=>hud.paint(invalid,{...camera(),Height:-1}),/camera telemetry|Invalid/i);
  assert.equal(invalid.actions.length,0,'do not paint a misleading or partial HUD');
});
test('legacy opt-out PNG path remains unchanged; opt-in draws after white compositing',async()=>{
  const project=makeProject(),defaultPlan=png.plan(project,{fps:5,width:640,height:360});
  assert.equal(defaultPlan.cameraHud,false);
  const off={},a=await png.renderTimestamp(defaultPlan,0,renderFor(defaultPlan.sides,off));
  assert.equal(off.A.actions.filter(x=>x[0]==='text').length,0);
  assert.equal(off.A.actions.find(x=>x[0]==='rect')[1],'destination-over');
  const p=png.plan(project,{fps:5,width:640,height:360,cameraHud:true});
  const on={},b=await png.renderTimestamp(p,0,renderFor(p.sides,on));
  assert.equal(p.cameraHud,true);
  assert.equal(on.A.actions.filter(x=>x[0]==='text').length,5);
  assert.equal(on.A.actions.find(x=>x[0]==='rect')[1],'destination-over');
  assert.equal(on.A.actions.filter(x=>x[0]==='rect')[1][1],'source-over');
  assert.notDeepEqual(a.entries[0].data,b.entries[0].data);
  const result=png.assemble(p,[b,...await Promise.all(p.timesMs.slice(1).map((_,j)=>
    png.renderTimestamp(p,j+1,renderFor(p.sides,{}))))]);
  assert.equal(result.manifest.cameraHudIncluded,true);
  assert.equal(png.assemble(defaultPlan,[a,...await Promise.all(defaultPlan.timesMs.slice(1).map((_,j)=>
    png.renderTimestamp(defaultPlan,j+1,renderFor(defaultPlan.sides,{}))))]).manifest.cameraHudIncluded,undefined);
});
test('VideoFrame sees the same HUD as PNG without PNG encoding or timeline changes',async()=>{
  const project=makeProject('compare');
  const p=video.plan(project,{fps:5,width:640,height:360,cameraHud:true,compareLayout:'separate'});
  assert.deepEqual(Array.from(p.sides),['A','B']);
  let constructed=0;
  class Frame{
    constructor(canvas,options){
      constructed++;
      assert.equal(options.timestamp,p.frames[4].timestampUs);
      assert.equal(options.duration,p.frames[4].durationUs);
      assert.equal(canvas.actions.filter(x=>x[0]==='text').length,5);
      this.closed=false;
    }
    close(){this.closed=true;}
  }
  const canvases={},result=await video.renderTimestamp(p,4,renderFor(p.sides,canvases),Frame);
  assert.equal(constructed,2);
  assert.equal(canvases.A.actions.filter(x=>x[0]==='text')[0][3],'CAMERA · GLOBE');
  assert.equal(canvases.B.actions.filter(x=>x[0]==='text')[0][3],'CAMERA · FLAT');
  assert.equal(result.timestampUs,p.frames[4].timestampUs);
  assert.equal(result.durationUs,p.frames[4].durationUs);
  video.closeFrames(result);
  assert.equal(result.frames.A.closed,true);
  assert.equal(result.frames.B.closed,true);
  assert.equal(video.plan(project).cameraHud,false);
});
test('explicit HUD input rejects non-booleans and HUD requires the painted camera model',()=>{
  const project=makeProject();
  assert.throws(()=>png.plan(project,{cameraHud:'true'}),/Invalid camera HUD/);
  assert.throws(()=>video.plan(project,{cameraHud:1}),/Invalid camera HUD/);
  const fake=mockCanvas();
  assert.throws(()=>png.prepareCanvas({quality:'accurate',canvas:fake},960,540,true),
    /Updated physical camera model/);
});
test('worker import order, UI toggles, and source are isolated from Legacy',()=>{
  const root=path.join(__dirname,'..');
  const worker=fs.readFileSync(path.join(root,'src/animation/ModernAnimationFrameWorker.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  assert.ok(worker.indexOf("'../camera/ModernCameraTelemetry.js'")<
    worker.indexOf("'ModernAnimationCanvasHud.js'"));
  for(const id of ['ModernAnimationPlaybackCameraHud','ModernAnimationFrameExportCameraHud',
    'ModernAnimationVideoExportCameraHud'])assert.ok(html.includes('id="'+id+'"'));
  assert.match(app,/syncStudioCameraHud\(a,b,graphs,isCompare\)/);
  assert.match(app,/cameraHud:!!\(newUiEl\('ModernAnimationVideoExportCameraHud'\)/);
  assert.match(app,/cameraHud:!!\(newUiEl\('ModernAnimationFrameExportCameraHud'\)/);
  assert.doesNotMatch(fs.readFileSync(path.join(root,'CurvatureApp.html'),'utf8'),
    /ModernAnimationCanvasHud|ModernAnimationPlaybackCameraHud/);
  const source=fs.readFileSync(path.join(root,'src/animation/ModernAnimationCanvasHud.js'),'utf8');
  const browser={CurvatureModernCameraTelemetry:telemetry,
    CurvatureModernCameraHud:require('../src/ui/modern/ModernCameraHud')};
  vm.runInNewContext(source,{globalThis:browser});
  assert.equal(typeof browser.CurvatureModernAnimationCanvasHud.paint,'function');
});

test('project-owned HUD appearance survives Studio and draft autosave without changing older projects',()=>{
  const studio=require('../src/animation/ModernAnimationStudio');
  const autosave=require('../src/animation/ModernAnimationDraftAutosave');
  const legacy=makeProject('compare');
  assert.equal(Object.hasOwn(legacy,'cameraHudAppearance'),false);
  assert.equal(studio.fromProject(legacy).cameraHudAppearance,null);
  const appearance={opacity:0,position:'bottom-right',size:125};
  const next=studio.edit(studio.fromProject(legacy),'cameraHudAppearance',appearance);
  const saved=studio.build(next,'hud_animation');
  assert.deepEqual(saved.cameraHudAppearance,appearance);
  assert.ok(Object.isFrozen(saved.cameraHudAppearance));
  assert.deepEqual(studio.fromProject(saved).cameraHudAppearance,appearance);
  const record=autosave.checkpoint({draft:next,selectedKey:next.frames[0].key,
    quality:'auto',prepared:false,positionMs:0},123456);
  assert.deepEqual(autosave.normalize(record).draft.cameraHudAppearance,appearance);
  const oldRecord=structuredClone(record);
  delete oldRecord.draft.cameraHudAppearance;
  assert.equal(autosave.normalize(oldRecord).draft.cameraHudAppearance,null);
  const malformed=structuredClone(saved);
  malformed.cameraHudAppearance={opacity:200,position:'top-left',size:100};
  assert.throws(()=>projects.validate(malformed),/Invalid camera HUD appearance/);
  assert.throws(()=>studio.edit(next,'cameraHudAppearance',{
    opacity:90,position:'center',size:100}),/Invalid camera HUD appearance/);
});

test('Canvas HUD uses four anchored corners, scales dimensions, and fades only the background',()=>{
  const variants=['top-left','top-right','bottom-left','bottom-right'];
  const readings={};
  for(const position of variants){
    const canvas=mockCanvas(960,540);
    hud.paint(canvas,camera(1),{opacity:0,position,size:100});
    const background=canvas.actions.find(x=>x[0]==='rect'&&x[1]==='source-over');
    assert.equal(background[2],'rgba(17,41,59,0)');
    assert.equal(canvas.actions.filter(x=>x[0]==='text').length,5);
    readings[position]=background.slice(3);
  }
  const [lx,ly,w,h]=readings['top-left'];
  assert.equal(readings['top-right'][0]+readings['top-right'][2],960-lx);
  assert.equal(readings['bottom-left'][1]+readings['bottom-left'][3],540-ly);
  assert.deepEqual(readings['bottom-right'].slice(0,2),readings['top-right'].slice(0,1)
    .concat(readings['bottom-left'][1]));
  for(const size of [75,125]){
    const canvas=mockCanvas();hud.paint(canvas,camera(),{opacity:100,position:'top-left',size});
    const rect=canvas.actions.find(x=>x[0]==='rect'&&x[1]==='source-over');
    assert.equal(rect[2],'rgba(17,41,59,1)');
    assert.ok(size===75?rect[6]<h:rect[6]>h);
  }
  assert.throws(()=>hud.paint(mockCanvas(),camera(),{
    opacity:-1,position:'top-left',size:100}),/Invalid camera HUD appearance/);
});

test('PNG and video export use the same captured appearance and preserve no-HUD pixels',async()=>{
  const project=makeProject('compare');
  const a={opacity:45,position:'bottom-left',size:75};
  const b={opacity:80,position:'top-right',size:125};
  const withAppearance=projects.validate({...project,cameraHudAppearance:a});
  const pp=png.plan(withAppearance,{fps:5,width:640,height:360,cameraHud:true});
  assert.deepEqual(pp.cameraHudAppearance,a);
  const frame=await png.renderTimestamp(pp,0,renderFor(pp.sides,{}));
  assert.deepEqual(png.assemble(pp,[frame,...await Promise.all(pp.timesMs.slice(1).map((_,i)=>
    png.renderTimestamp(pp,i+1,renderFor(pp.sides,{}))))]).manifest.cameraHudAppearance,a);
  const vp=video.plan(withAppearance,{fps:5,width:640,height:360,cameraHud:true,
    cameraHudAppearance:b});
  assert.deepEqual(vp.cameraHudAppearance,b);
  assert.equal(vp.outputSides.length,1);
  // The video encoder's source canvases get the supplied appearance before A/B composition.
  const rendered={},composition=()=>({width:vp.outputWidth,height:vp.outputHeight});
  class Frame{constructor(canvas){this.canvas=canvas;}close(){}}
  const result=await video.renderTimestamp(vp,0,renderFor(vp.sides,rendered),Frame,null,composition);
  assert.equal(Object.keys(result.frames).length,1);
  for(const side of ['A','B']){
    const rect=rendered[side].actions.find(x=>x[0]==='rect'&&x[1]==='source-over');
    assert.equal(rect[2],'rgba(17,41,59,0.8)');
    assert.ok(rect[3]>320,'top-right HUD must be on the right of its own 640px view');
  }
  video.closeFrames(result);
  const disabled=png.plan(withAppearance,{fps:5,width:640,height:360,cameraHud:false,
    cameraHudAppearance:b});
  const canvases={};await png.renderTimestamp(disabled,0,renderFor(disabled.sides,canvases));
  assert.equal(canvases.A.actions.filter(x=>x[0]==='text').length,0);
  assert.equal(canvases.A.actions.filter(x=>x[0]==='rect'&&x[1]==='source-over').length,0);
});

test('long video planning is independent of PNG export frame cap',()=>{
  const old=structuredClone(makeProject());
  old.keyframes[1].travelMs=60000;
  const longProject=projects.validate(old);
  const p=video.plan(longProject,{fps:25,cameraHud:true,
    cameraHudAppearance:{opacity:65,position:'bottom-right',size:125}});
  assert.equal(p.frameCount,1500);
  assert.deepEqual(p.cameraHudAppearance,{opacity:65,position:'bottom-right',size:125});
  assert.throws(()=>png.plan(longProject,{fps:25}),/Too many frames/);
});

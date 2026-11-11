'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('CurvatureModern.html');
const scripts=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(x=>({
  path:x[1].split('?')[0],url:x[1],index:x.index
}));
const index=file=>scripts.find(s=>s.path===file)?.index;
const hud=require('../src/ui/modern/ModernCameraHud');
const telemetry=require('../src/camera/ModernCameraTelemetry');
const project=require('../src/animation/ModernAnimationProject');
const state=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const compat=require('../src/animation/ModernAnimationCompatibility');
const sequence=require('../src/camera/ModernCameraSequence');

function example(){
  const m={Height:15,FocalLengthField:1000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:0,DemoText:'Test',Description:'',
    ObjType:[3,3],NObjects:[1,0],ObjDist:[1000,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  const a=state.capture(m,{atmosphere:'vacuum',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},
    compare.preset('globe-flat-vacuum'),{mode:'compare',eyeLevel:false,horizon:false,selected:'A'});
  const b=structuredClone(a);b.scene.camera.Height=30;
  return project.create([{experiment:a,holdMs:0},
    {experiment:b,travelMs:1000}],{id:'hud_browser',name:'HUD browser'});
}

test('browser entrypoint loads Canvas HUD before PNG/video planning and has refreshed Studio editor',()=>{
  const canvas='src/animation/ModernAnimationCanvasHud.js';
  const png='src/animation/ModernAnimationFrameExport.js';
  const video='src/animation/ModernAnimationVideoPipeline.js';
  const studio='src/animation/ModernAnimationStudio.js';
  const app='src/ui/modern/ModernApp.js';
  for(const file of [canvas,png,video,studio,app])
    assert.equal(scripts.filter(x=>x.path===file).length,1,'one browser load: '+file);
  assert.ok(index('src/ui/modern/ModernCameraHud.js')<index(canvas));
  assert.ok(index('src/camera/ModernCameraTelemetry.js')<index(canvas));
  assert.ok(index(canvas)<index(png));
  assert.ok(index(png)<index(video));
  assert.ok(index(studio)<index(app));
  for(const file of [canvas,png,video,studio,app])
    assert.match(scripts.find(x=>x.path===file).url,/studio-hud-fix=1/,
      'force browser to fetch the corrected integration: '+file);
});

test('browser-script HUD edit and video plan run without missing appearance dependency',()=>{
  const browser={CurvatureModernCameraTelemetry:telemetry,
    CurvatureModernCameraHud:hud,
    CurvatureModernExperimentState:state,
    CurvatureModernCameraSequence:sequence,
    CurvatureModernAnimationCompatibility:compat,
    CurvatureModernAnimationProject:project};
  const scope=vm.createContext({globalThis:browser});
  const files=['src/animation/ModernAnimationStudio.js',
    'src/animation/ModernAnimationCanvasHud.js',
    'src/animation/ModernAnimationFrameExport.js',
    'src/animation/ModernAnimationVideoPipeline.js'];
  for(const file of files)vm.runInContext(read(file),scope,{filename:file});
  const appearance={opacity:45,position:'bottom-right',size:125};
  const edited=browser.CurvatureModernAnimationStudio.edit(
    browser.CurvatureModernAnimationStudio.blank(),'cameraHudAppearance',appearance);
  assert.equal(edited.cameraHudAppearance.opacity,45);
  assert.equal(edited.cameraHudAppearance.position,'bottom-right');
  const source=example();
  const output=browser.CurvatureModernAnimationVideoPipeline.plan(source,
    {fps:5,width:640,height:360,cameraHud:true,cameraHudAppearance:appearance});
  assert.equal(output.cameraHudAppearance.opacity,45);
  assert.equal(output.frameCount,5);
  assert.equal(typeof browser.CurvatureModernAnimationCanvasHud.paint,'function');
});

test('background workers reload corrected HUD modules after upgrade',()=>{
  for(const file of ['src/animation/ModernAnimationFrameWorker.js',
    'src/animation/ModernAnimationVideoEncoderWorker.js',
    'src/animation/ModernAnimationArchiveWorker.js']){
    const content=read(file);
    assert.match(content,/ModernAnimationCanvasHud\.js\?studio-hud-fix=1/);
    assert.match(content,/ModernAnimationFrameExport\.js\?studio-hud-fix=1/);
    assert.ok(content.indexOf('ModernCameraHud.js')<content.indexOf('ModernAnimationCanvasHud.js'));
  }
});

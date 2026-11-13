'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const codec=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const studio=require('../src/animation/ModernAnimationStudio');
const playback=require('../src/animation/ModernAnimationPlayback');

const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
function snapshot(){
  return codec.capture({Height:10,FocalLengthField:1000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Test',Description:'',
    ObjType:[3,3],NObjects:[2,0],ObjDist:[1000,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]},
  {atmosphere:'standard',occlusionRadius:6371000,preset:'pontchartrain',resetPreset:'pontchartrain'},
  compare.preset('globe-flat-vacuum'),
  {mode:'scene',eyeLevel:false,horizon:true,selected:'A'});
}
function makeDraft(mode='camera'){
  const a=snapshot(),b=structuredClone(a),c=structuredClone(a);
  if(mode==='camera'){
    b.scene.camera.Height=70;c.scene.camera.Height=30;
  }else{
    b.scene.atmosphere='temperature-lapse';a.scene.atmosphere='temperature-lapse';
    c.scene.atmosphere='temperature-lapse';
    b.scene.temperatureProfile.gradientKPerKm=5;
    c.scene.temperatureProfile.gradientKPerKm=10;
  }
  return studio.history([1,2,3],[a,b,c].map((experiment,i)=>({id:i+1,name:'Frame '+(i+1),experiment})));
}
function harness(mode='camera'){
  let now=0,saveCount=0,rendered=[];
  const draft=makeDraft(mode),prepared=studio.build(draft,'preview_test');
  const originalFrames=structuredClone(draft.frames);
  const handlers={},elements={},queue=new Map();
  for(const id of ['ModernAnimationPlaybackStage','ModernAnimationPlaybackInterpolationLabel',
    'ModernAnimationPlaybackInterpolation','ModernAnimationPlaybackStatus',
    'ModernAnimationPlaybackSeek','ModernAnimationPlaybackTime',
    'ModernAnimationPlaybackPlay','ModernAnimationPlaybackPause']){
    elements[id]={hidden:true,disabled:false,value:'',textContent:'',
      addEventListener:(type,fn)=>{handlers[id+':'+type]=fn;}};
  }
  const context=vm.createContext({
    newUiEl:id=>elements[id]||null,
    studioDraft:draft,studioPrepared:prepared,studioPlayback:playback.create(prepared),
    studioPlaybackFrame:null,studioPlaybackLastPaint:0,studioPlaybackRenderedAt:null,
    studioApi:studio,studioPlaybackApi:playback,studioRestorePreviewPending:false,
    studioPlaybackQuality:'auto',animationWorkspaceOpen:true,
    profileNow:()=>now,document:{hidden:false,addEventListener(){}},
    root:{},
    requestAnimationFrame(fn){const id=queue.size+1;queue.set(id,fn);return id;},
    cancelAnimationFrame(id){queue.delete(id);},
    cancelStudioInitialPaint(){},syncStudioHudAppearance(){},
    syncStudioFrameExportControls(){},
    saveStudioDraft(){saveCount++;},renderStudioLibrary(){},
    renderStudioPlaybackSample(force){
      assert.equal(force,true);
      rendered.push({time:context.studioPlayback.status().positionMs,
        height:context.studioPlayback.sample().scene.camera.Height});
    },
    studioPlaybackTick(){},
    bindStudioQualityAudit(){},bindStudioCameraHud(){},bindStudioTargetIndicator(){},
    bindStudioFrameExport(){},bindStudioVideoExport(){},observeStudioPreviewSize(){},
    stopStudioPlayback(){},scheduleStudioInitialPaint(){},
    studioPreviewRenderer:null
  });
  const syncFrom=app.indexOf('  function syncStudioPlaybackControls(){');
  const syncTo=app.indexOf('  function previewGraphsReady(){',syncFrom);
  const from=app.indexOf('  function setStudioPreviewInterpolation(value){');
  const to=app.indexOf('  function animationPickerEntries(',from);
  assert.ok(syncFrom>0&&syncTo>syncFrom&&from>syncTo&&to>from);
  vm.runInContext(app.slice(syncFrom,syncTo)+app.slice(from,to)+
    '\nthis.sync=syncStudioPlaybackControls;this.bind=bindStudioPlayback;',
    context,{filename:'ModernApp.js:spline-preview'});
  context.bind();context.sync();
  return {context,elements,handlers,queue,originalFrames,rendered:()=>rendered,
    count:()=>saveCount,now(value){now=value;},
    change(value){elements.ModernAnimationPlaybackInterpolation.value=value;
      handlers['ModernAnimationPlaybackInterpolation:change']();}};
}

test('Spline control is visible only for prepared camera projects and starts as Linear',()=>{
  assert.match(html,/<label id="ModernAnimationPlaybackInterpolationLabel"[^>]*>Camera interpolation<\/label>/);
  assert.match(html,/<select id="ModernAnimationPlaybackInterpolation"[^>]*>/);
  assert.match(html,/<option value="spline">Smooth · Spline<\/option>/);
  assert.match(html,/ModernApp\.js\?[^"\n]*spline-preview=1/);
  const a=harness(),b=harness('physical');
  assert.equal(a.elements.ModernAnimationPlaybackInterpolation.hidden,false);
  assert.equal(a.elements.ModernAnimationPlaybackInterpolation.value,'linear');
  assert.equal(b.elements.ModernAnimationPlaybackInterpolation.hidden,true);
  assert.equal(b.elements.ModernAnimationPlaybackInterpolation.disabled,true);
  assert.equal(b.elements.ModernAnimationPlaybackInterpolationLabel.hidden,true);
});

test('paused Preview changes its spline sample at the same playhead, without changing keyframes',()=>{
  const h=harness(),player=h.context.studioPlayback;
  player.seek(1500,0);
  const previousHeight=player.sample().scene.camera.Height;
  h.now(5000);h.change('spline');
  assert.equal(h.context.studioDraft.interpolation,'spline');
  assert.equal(h.context.studioPrepared.interpolation,'spline');
  assert.equal(h.context.studioPlayback.status().positionMs,1500);
  assert.equal(h.context.studioPlayback.status().playing,false);
  assert.notEqual(h.context.studioPlayback.sample().scene.camera.Height,previousHeight);
  assert.deepEqual(h.context.studioDraft.frames,h.originalFrames);
  assert.equal(h.rendered().at(-1).time,1500);
  assert.equal(h.count(),1,'change autosaves working draft');
  assert.equal(h.queue.size,0,'paused Preview does not begin playing');
  h.change('linear');
  assert.equal(h.context.studioPlayback.sample().scene.camera.Height,previousHeight);
  assert.equal(h.context.studioPlayback.status().positionMs,1500);
  assert.equal(h.count(),2);
});

test('running Preview keeps exact current clock and continues after switching interpolation',()=>{
  const h=harness(),old=h.context.studioPlayback;
  old.start(2000);old.tick(4000);
  h.now(4500);h.change('spline');
  const current=h.context.studioPlayback;
  assert.equal(old.status().playing,false);
  assert.equal(current.status().positionMs,2500,'old player was advanced to switch time');
  assert.equal(current.status().playing,true);
  assert.equal(h.queue.size,1,'exactly one animation tick is scheduled');
  assert.equal(h.rendered().at(-1).time,2500);
  current.tick(5000);
  assert.equal(current.status().positionMs,3000,'new clock advances without restarting');
  assert.deepEqual(h.context.studioDraft.frames,h.originalFrames);
});

test('physical mode and invalid values cannot change a prepared project',()=>{
  const h=harness('physical'),before=h.context.studioPrepared;
  h.change('spline');
  assert.equal(h.context.studioPrepared,before);
  assert.equal(h.context.studioDraft.interpolation,'linear');
  assert.equal(h.elements.ModernAnimationPlaybackInterpolation.value,'linear');
  assert.match(h.elements.ModernAnimationPlaybackStatus.textContent,/Prepare a camera animation/);
  assert.equal(h.count(),0);
  const camera=harness(),original=camera.context.studioPrepared;
  camera.change('unknown');
  assert.equal(camera.context.studioPrepared,original);
  assert.equal(camera.elements.ModernAnimationPlaybackInterpolation.value,'linear');
  assert.match(camera.elements.ModernAnimationPlaybackStatus.textContent,/Invalid camera interpolation/);
});

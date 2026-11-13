'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const experiments=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const naming=require('../src/ui/modern/ModernSemanticNaming');
const projects=require('../src/animation/ModernAnimationProject');
const video=require('../src/animation/ModernAnimationVideoPipeline');
const background=require('../src/animation/ModernAnimationBackgroundVideoExport');
const pngBackground=require('../src/animation/ModernAnimationBackgroundExport');
const hud=require('../src/animation/ModernAnimationCanvasHud');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
function project(mode){
  const model={Height:1.85,FocalLengthField:1500,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:0,
    DemoText:'Lake Pontchartrain Transmission Line',Description:'',
    ObjType:[3,3],NObjects:[85,0],ObjDist:[50,1000],ObjDeltaDist:[297.55,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  const a=experiments.capture(model,{atmosphere:'standard',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},
  compare.preset('globe-flat-vacuum'),{mode,eyeLevel:false,horizon:false,selected:'A'});
  const b=structuredClone(a);
  b.scene.camera.Height=15;
  return projects.create([{experiment:a},{experiment:b,travelMs:1000}],
    {id:'unsaved_studio_video_export',name:'Pontchartrain · Camera height 1.85 → 15 m'});
}
function harness(mode='compare',returnedFilename=null){
  const p=project(mode),handlers={},downloads=[],elements={};
  for(const id of ['ModernAnimationVideoExportStart','ModernAnimationVideoExportCancel',
    'ModernAnimationVideoExportCompareLayout','ModernAnimationVideoExportSize',
    'ModernAnimationVideoExportFormat','ModernAnimationVideoExportFps',
    'ModernAnimationVideoExportWorkers','ModernAnimationVideoExportQuality',
    'ModernAnimationVideoExportFilename','ModernAnimationVideoExportLayoutInfo',
    'ModernAnimationVideoExportCompareLayoutControl',
    'ModernAnimationVideoExportProgress','ModernAnimationVideoExportStatus']){
    elements[id]={value:'',textContent:'',disabled:false,hidden:false,
      addEventListener:(event,handler)=>{handlers[id+':'+event]=handler;}};
  }
  Object.assign(elements.ModernAnimationVideoExportCompareLayout,{value:'side-by-side'});
  Object.assign(elements.ModernAnimationVideoExportSize,{value:'640x360'});
  Object.assign(elements.ModernAnimationVideoExportFormat,{value:'webm'});
  Object.assign(elements.ModernAnimationVideoExportFps,{value:'25'});
  Object.assign(elements.ModernAnimationVideoExportWorkers,{value:'1'});
  Object.assign(elements.ModernAnimationVideoExportQuality,{value:'standard'});
  const studioDraft={frames:[{experiment:p.baseExperiment},{experiment:p.baseExperiment}]};
  let receivedOptions=null;
  const context=vm.createContext({
    newUiEl:id=>elements[id],studioDraft,studioPrepared:null,
    studioApi:{build:()=>p},semanticNaming:naming,
    studioVideoExportPlan:video,studioBackgroundExportApi:pngBackground,
    studioVideoExportApi:{...background,create:()=>({
      cancel(){},async start(options){
        receivedOptions=options;
        const plan=video.plan(options.project,options);
        const filename=naming.exportNames(plan.project,{format:options.format,
          fps:plan.fps,width:plan.outputWidth,height:plan.outputHeight,
          compareLayout:plan.compareLayout}).filename;
        return {cancelled:false,filename:returnedFilename||filename,blob:new Blob(['test']),
          manifest:{frameCount:plan.frameCount,sides:plan.sides,
            outputStreams:plan.outputSides.length,width:plan.outputWidth,
            height:plan.outputHeight,durationUs:plan.durationUs,frameWindow:1},
          workers:1,peakInflightFrames:1};
      }
    })},
    studioVideoExportTask:null,studioFrameExportTask:null,
    studioHudAppearance:()=>hud.normalizeAppearance(),targetIndicatorSelection:'scene',
    profileNow:()=>0,
    root:{navigator:{hardwareConcurrency:2},URL:{createObjectURL:()=> 'blob:preview-test',revokeObjectURL(){}},Worker:class{}},
    document:{body:{appendChild(){}},createElement:tag=>{
      assert.equal(tag,'a');
      return {download:'',href:'',click(){downloads.push(this.download);},remove(){}};
    }},
    setTimeout(){}
  });
  const start=source.indexOf('  function studioVideoExportSelection(){');
  const stop=source.indexOf('  function syncStudioTargetIndicator(){',start);
  const bindStart=source.indexOf('  function bindStudioVideoExport(){',stop);
  const bindEnd=source.indexOf('  function bindStudioFrameExport(){',bindStart);
  assert.ok(start>=0&&stop>start&&bindStart>stop&&bindEnd>bindStart);
  const script=source.slice(start,stop)+source.slice(bindStart,bindEnd)+
    '\nthis.sync=syncStudioVideoExportLayout;this.bind=bindStudioVideoExport;';
  context.syncStudioFrameExportControls=()=>{};
  vm.runInContext(script,context,{filename:'ModernApp.js:video-ui'});
  context.bind();
  return {elements,handlers,downloads,sync:context.sync,received:()=>receivedOptions};
}

test('the visible unsaved draft filename updates for FPS, size, format and Compare ZIP entries',()=>{
  const h=harness(),e=h.elements;
  const filename=e.ModernAnimationVideoExportFilename;
  assert.match(filename.textContent,/pontchartrain-camera-height-1-85-15-m_1280x720_25fps_compare\.webm/);
  e.ModernAnimationVideoExportFps.value='30';
  h.handlers['ModernAnimationVideoExportFps:change']();
  assert.match(filename.textContent,/_1280x720_30fps_compare\.webm/);
  e.ModernAnimationVideoExportCompareLayout.value='separate';
  h.handlers['ModernAnimationVideoExportCompareLayout:change']();
  assert.match(filename.textContent,/_640x360_30fps_compare-separate\.zip/);
  assert.match(filename.textContent,/ZIP entries: A: .*_A\.webm · B: .*_B\.webm/);
  e.ModernAnimationVideoExportSize.value='960x540';
  e.ModernAnimationVideoExportFormat.value='mp4';
  h.handlers['ModernAnimationVideoExportFormat:change']();
  assert.match(filename.textContent,/_960x540_30fps_compare-separate\.zip/);
  assert.match(filename.textContent,/_A\.mp4 · B: .*_B\.mp4/);
});

test('the real export click downloads the same filename as the preview, without saving a project',async()=>{
  const h=harness('scene'),e=h.elements;
  const preview=e.ModernAnimationVideoExportFilename.textContent;
  assert.match(preview,/\.webm$/);
  await h.handlers['ModernAnimationVideoExportStart:click']();
  assert.equal(h.downloads.length,1,e.ModernAnimationVideoExportStatus.textContent);
  assert.equal(preview,'Export filename: '+h.downloads[0]);
  assert.equal(h.received().expectedFilename,h.downloads[0]);
  assert.match(e.ModernAnimationVideoExportStatus.textContent,/saved as/);
});

test('mismatched worker output is blocked before an anchor download',async()=>{
  const h=harness('compare','curvature-animation-compare.webm');
  await h.handlers['ModernAnimationVideoExportStart:click']();
  assert.deepEqual(h.downloads,[]);
  assert.match(h.elements.ModernAnimationVideoExportStatus.textContent,
    /Encoder filename differs from the preview/);
});

test('stale encoder ready-message name is rejected before any frame renders',async()=>{
  const p=project('compare');
  const plan=video.plan(p,{fps:5,width:640,height:360});
  const expected=naming.exportNames(plan.project,{format:'webm',fps:5,
    width:plan.outputWidth,height:plan.outputHeight,
    compareLayout:plan.compareLayout}).filename;
  const created=[];
  class FakeWorker{
    constructor(url){this.url=url;this.terminated=false;this.renderRequests=0;
      created.push(this);}
    terminate(){this.terminated=true;}
    postMessage(message){
      if(message.type==='video-render'){this.renderRequests++;return;}
      if(message.type!=='init')return;
      queueMicrotask(()=>this.onmessage&&this.onmessage({data:{
        type:'ready',total:plan.frameCount,sides:plan.sides.length,
        workers:1,outputStreams:plan.outputSides.length,
        outputWidth:plan.outputWidth,outputHeight:plan.outputHeight,
        filename:'curvature-animation-compare.webm'
      }}));
    }
  }
  const controller=background.create({WorkerCtor:FakeWorker,
    encoderUrl:'encoder-worker.js',rendererUrl:'render-worker.js',hardwareConcurrency:2});
  await assert.rejects(controller.start({project:p,width:640,height:360,fps:5,
    format:'webm',quality:'standard',workerCount:1,
    expectedFilename:expected}),/filename differs from the preview/);
  assert.equal(created.length,2);
  assert.ok(created.every(w=>w.terminated));
  assert.ok(created.every(w=>w.renderRequests===0));
});

test('cache-busted main and imported naming scripts are wired to the actual encoder entrypoint',()=>{
  const worker=fs.readFileSync(path.join(root,'src/animation/ModernAnimationVideoEncoderWorker.js'),'utf8');
  assert.match(html,/ModernSemanticNaming\.js\?semantic-names=2/);
  assert.match(html,/ModernApp\.js\?[^"\n]*video-filename-preview=1/);
  assert.match(source,/ModernAnimationVideoEncoderWorker\.js\?semantic-export=2/);
  assert.match(worker,/ModernSemanticNaming\.js\?semantic-names=2/);
  assert.match(html,/id="ModernAnimationVideoExportFilename"/);
});

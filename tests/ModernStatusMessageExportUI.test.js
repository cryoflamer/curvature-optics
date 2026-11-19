'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const statusMessages=require('../src/ui/modern/ModernStatusMessage');
const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
function harness(picker){
  const handlers={},items={};
  const ids=['ModernAnimationFrameExportStart','ModernAnimationFrameExportCancel',
    'ModernAnimationFrameExportProgress','ModernAnimationFrameExportStatus',
    'ModernAnimationFrameExportFps','ModernAnimationFrameExportSize',
    'ModernAnimationFrameExportWorkers'];
  for(const id of ids)items[id]={value:'25',textContent:'',attrs:{},disabled:false,
    addEventListener(type,fn){handlers[id+':'+type]=fn;},
    setAttribute(name,value){this.attrs[name]=value;},
    removeAttribute(name){delete this.attrs[name];}};
  items.ModernAnimationFrameExportSize.value='640x360';
  items.ModernAnimationFrameExportWorkers.value='1';
  items.ModernAnimationFrameExportDestination={value:'disk',options:[{disabled:false}]};
  const project=require('../src/animation/ModernDemoCatalog').load()[0].project;
  let shouldFail=true,runCount=0,received,download;
  const context=vm.createContext({
    newUiEl:id=>items[id],studioFrameExportTask:null,studioVideoExportTask:null,
    studioDraft:{frames:[{},{},{}]},studioPrepared:null,studioPlayback:null,
    studioApi:{build:()=>project},
    studioFrameExportApi:{checkFrameBudget(){},plan:project=>({project,fps:25,width:640,height:360,timesMs:[0,40],sides:['A']})},
    studioBackgroundExportApi:{create:()=>({cancel(){},async start(options){runCount++;received=options;
      if(shouldFail)throw Error('worker validation failed');
      return {cancelled:false,streamed:!!options.sink,blob:new Blob(['zip']),workers:1,
        manifest:{frameCount:2,sides:['A']}};}})},
    semanticNaming:require('../src/ui/modern/ModernSemanticNaming'),
    studioHudAppearance:()=>({}),targetIndicatorSelection:'scene',
    profileNow:()=>0,syncStudioFrameExportControls(){},
    root:{CurvatureModernStatusMessage:statusMessages,Worker:class{},showSaveFilePicker:picker,
      navigator:{hardwareConcurrency:2},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}}},
    document:{body:{appendChild(){}},createElement:()=>({click(){download=this.download;},remove(){}})},
    setTimeout(){}
  });
  const start=app.indexOf('  function bindStudioFrameExport(){');
  const stop=app.indexOf('  // Preview interpolation is a property',start);
  assert.ok(start>=0&&stop>start);
  const helper=app.slice(app.indexOf('  function studioExportProject(id){'),app.indexOf('  function studioVideoExportSelection(){'));
  vm.runInContext(helper+app.slice(start,stop)+'\nthis.bind=bindStudioFrameExport;',context);
  context.bind();
  return {items,handlers,setFail:v=>{shouldFail=v;},count:()=>runCount,context,project,received:()=>received,download:()=>download};
}
test('PNG Worker failure is visibly an error and successful retry clears it',async()=>{
  const h=harness(),status=h.items.ModernAnimationFrameExportStatus;
  await h.handlers['ModernAnimationFrameExportStart:click']();
  assert.match(status.textContent,/PNG export failed: worker validation failed/);
  assert.equal(status.attrs['data-status-kind'],'error');
  assert.equal(status.attrs.role,'alert');
  h.setFail(false);
  await h.handlers['ModernAnimationFrameExportStart:click']();
  assert.match(status.textContent,/PNG archive ready/);
  assert.equal(status.attrs['data-status-kind'],'success');
  assert.equal(status.attrs.role,'status');
  assert.equal(h.count(),2);
});


test('PNG archive runs the worker on effective physics without editing the authored project',async()=>{
  const h=harness(),variant=require('../src/animation/ModernAnimationAtmosphereVariant').derive(h.project,'standard');
  h.context.studioPrepared=h.project;h.context.studioPlayback={project:variant};h.setFail(false);
  await h.handlers['ModernAnimationFrameExportStart:click']();
  assert.equal(h.received().project,variant);assert.match(h.download(),/-standard_.*_frames\.zip$/);
  assert.equal(h.context.studioPrepared.baseExperiment.compare.A.atmosphere,'vacuum');
});


test('PNG destination falls back only without native picker and forwards a chosen file writer',async()=>{
  const fallback=harness();assert.equal(fallback.items.ModernAnimationFrameExportDestination.value,'memory');
  assert.equal(fallback.items.ModernAnimationFrameExportDestination.options[0].disabled,true);
  const sink={write(){},close(){},abort(){}};let picked;
  const h=harness(async options=>{picked=options;return {async createWritable(){return sink;}};});
  assert.equal(h.items.ModernAnimationFrameExportDestination.value,'disk');
  h.setFail(false);await h.handlers['ModernAnimationFrameExportStart:click']();
  assert.match(picked.suggestedName,/_frames\.zip$/);
  assert.equal(h.received().sink,sink);assert.equal(h.download(),undefined);
  assert.match(h.items.ModernAnimationFrameExportStatus.textContent,/PNG archive ready/);
});

test('cancelled file picker does not start worker pool or memory fallback',async()=>{
  const h=harness(async()=>{const error=new Error('Cancelled');error.name='AbortError';throw error;});
  await h.handlers['ModernAnimationFrameExportStart:click']();
  assert.equal(h.count(),0);assert.equal(h.download(),undefined);
  assert.match(h.items.ModernAnimationFrameExportStatus.textContent,/no file chosen/);
});

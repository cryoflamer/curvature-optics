'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const statusMessages=require('../src/ui/modern/ModernStatusMessage');
const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
function harness(){
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
  const project={name:'Unsaved Camera',keyframes:[{},{},{}]};
  let shouldFail=true,runCount=0;
  const context=vm.createContext({
    newUiEl:id=>items[id],studioFrameExportTask:null,studioVideoExportTask:null,
    studioDraft:{frames:[{},{},{}]},studioPrepared:null,
    studioApi:{build:()=>project},
    studioFrameExportApi:{plan:()=>({project,fps:25,width:640,height:360,timesMs:[0,40],sides:['A']})},
    studioBackgroundExportApi:{create:()=>({cancel(){},async start(){runCount++;
      if(shouldFail)throw Error('worker validation failed');
      return {cancelled:false,blob:new Blob(['zip']),workers:1,
        manifest:{frameCount:2,sides:['A']}};}})},
    semanticNaming:{exportNames:()=>({filename:'camera.zip'})},
    studioHudAppearance:()=>({}),targetIndicatorSelection:'scene',
    profileNow:()=>0,syncStudioFrameExportControls(){},
    root:{CurvatureModernStatusMessage:statusMessages,Worker:class{},
      navigator:{hardwareConcurrency:2},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}}},
    document:{body:{appendChild(){}},createElement:()=>({click(){},remove(){}})},
    setTimeout(){}
  });
  const start=app.indexOf('  function bindStudioFrameExport(){');
  const stop=app.indexOf('  // Preview interpolation is a property',start);
  assert.ok(start>=0&&stop>start);
  vm.runInContext(app.slice(start,stop)+'\nthis.bind=bindStudioFrameExport;',context);
  context.bind();
  return {items,handlers,setFail:v=>{shouldFail=v;},count:()=>runCount};
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

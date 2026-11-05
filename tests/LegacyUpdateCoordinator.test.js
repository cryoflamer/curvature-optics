'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

function factory(){
  // No browser globals: the same coordinator must work in two app contexts.
  const realm=vm.createContext({});
  vm.runInContext(read('src/app/LegacyUpdateCoordinator.js'),realm);
  return realm.CurvatureLegacyUpdateCoordinator.create;
}
function fixture(overrides={}){
  const calls=[];
  const model={Height:10,DemoText:'old',Description:'old',Update(){calls.push('update');}};
  const ports={
    getModel(){return model;},
    resetDemos(){calls.push('reset');},
    showInfo(){calls.push('info');},
    syncOptics(){calls.push('optics');},
    updatePanels(){calls.push('panels');},
    syncCurvature(){calls.push('curvature');},
    isPhysical(){calls.push('physical');return false;},
    queueHeightChange(){calls.push('queue');return false;},
    cancelHeightChange(){calls.push('cancel');},
    scheduleFinalFrame(){calls.push('settle');},
    redraw(){calls.push('redraw');},
    refreshOptics(){calls.push('refresh');},
    ...overrides
  };
  return {model,calls,ports};
}
test('Legacy refresh coordinator requires explicit ports and no browser globals',()=>{
  const create=factory();
  assert.throws(()=>create({}),/explicit refresh ports/);
  const {model,ports}=fixture();
  const coordinator=create(ports);
  assert.equal(coordinator.update(false),true);
  assert.equal(model.DemoText,'old');
});
test('Legacy refresh preserves reset, model, panel, redraw and optics ordering',()=>{
  const create=factory();
  const {model,calls,ports}=fixture();
  const coordinator=create(ports);
  assert.equal(coordinator.update(),true);
  assert.equal(model.DemoText,'');
  assert.equal(model.Description,'');
  assert.deepEqual(calls,['reset','info','update','optics','panels','curvature',
    'cancel','settle','redraw','refresh']);
  calls.length=0;
  model.DemoText='preserved';
  assert.equal(coordinator.update(false),true);
  assert.equal(model.DemoText,'preserved');
  assert.deepEqual(calls,['update','optics','panels','curvature',
    'cancel','settle','redraw','refresh']);
  calls.length=0;
  assert.equal(coordinator.update('non-boolean'),true,'xDefBool defaults to reset');
  assert.equal(calls[0],'reset');
});
test('Physical height queue is instance-local and avoids an early inaccurate redraw',()=>{
  const create=factory();
  const a=fixture(),b=fixture();
  a.ports.isPhysical=()=>true;
  a.ports.queueHeightChange=()=>{a.calls.push('queue');return true;};
  a.model.Height=100;
  const ca=create(a.ports),cb=create(b.ports);
  ca.update(false); cb.update(false);
  a.calls.length=0; b.calls.length=0;
  a.model.Height=500;
  ca.update(false);
  assert.deepEqual(a.calls,['update','optics','panels','curvature','queue','refresh']);
  b.model.Height=900;
  cb.update(false);
  assert.equal(b.calls.includes('queue'),false,'independent instance is not in physical mode');
  assert.equal(b.calls.includes('redraw'),true);
  a.calls.length=0;
  ca.update(false);
  assert.equal(a.calls.includes('queue'),false,'unchanged height must not queue');
  assert.equal(a.calls.includes('redraw'),true);
});
test('Recursive refresh is ignored and the guard recovers from thrown panel errors',()=>{
  const create=factory();
  const {calls,ports}=fixture();
  let coordinator,shouldThrow=true;
  ports.updatePanels=()=>{
    calls.push('panels');
    assert.equal(coordinator.update(false),false,'reentrant update must be skipped');
    if(shouldThrow)throw Error('panel failure');
  };
  coordinator=create(ports);
  assert.throws(()=>coordinator.update(false),/panel failure/);
  shouldThrow=false;
  assert.equal(coordinator.update(false),true);
  assert.equal(calls.filter(item=>item==='update').length,2);
  assert.equal(calls.filter(item=>item==='redraw').length,1);
});
test('Legacy entrypoints load coordinator before runtime without exposing it to Modern',()=>{
  for(const file of ['CurvatureApp.html','CurvatureDemosHost.html']){
    const html=read(file),context=html.indexOf('src/app/LegacyAppContext.js');
    const coordinator=html.indexOf('src/app/LegacyUpdateCoordinator.js');
    const runtime=html.indexOf('src/app/CurvatureAppRuntime.js');
    assert.ok(context>=0&&context<coordinator&&coordinator<runtime,file);
    assert.equal(html.split('src/app/LegacyUpdateCoordinator.js').length-1,1);
  }
  assert.doesNotMatch(read('CurvatureModern.html'),/LegacyUpdateCoordinator\.js/);
  const runtime=read('src/app/CurvatureAppRuntime.js');
  assert.match(runtime,/legacyUpdateCoordinator\.update\(stopAnimation\)/);
  assert.match(runtime,/getModel: function\(\)\{return legacyAppContext\.model;/);
  assert.match(runtime,/DrawFunc: DrawMainCanvasFrame/);
});

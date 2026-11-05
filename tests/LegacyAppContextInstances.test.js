'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'latin1');

function createFactory(){
  // Model/Canvas ownership must not need the browser, DOM, timers or global app.
  const realm={};
  vm.runInNewContext(read('src/app/LegacyAppContext.js'),realm);
  return realm.CurvatureLegacyAppContext.create;
}
function environment(id,create){
  const events=[];
  const context=create({
    createModel(){return {owner:id,AllStatesChanged:false,Height:0};},
    createGraph(options){
      events.push(['mount',options.Id]);
      return {Redraw(){events.push(['draw',id]);}};
    },
    applyState(model,value){
      model.Height=value;
      model.AllStatesChanged=true;
      events.push(['state',id,value]);
      return true;
    }
  });
  return {context,events};
}

test('Legacy model and Canvas owners reject missing ports or invalid objects',()=>{
  const create=createFactory();
  assert.throws(()=>create(),/model, graph and state ports/);
  assert.throws(()=>create({createModel(){return {};}}),/model, graph and state ports/);
  assert.throws(()=>create({createModel(){return null;},createGraph(){},applyState(){}}),/model object/);
  const context=create({createModel(){return {};},createGraph(){return {};},applyState(){}});
  assert.throws(()=>context.mountGraph({}),/expose Redraw/);
  assert.equal(context.getGraph(),null);
});

test('two contexts own distinct models, state changes and redraw targets in one realm',()=>{
  const create=createFactory(),a=environment('A',create),b=environment('B',create);
  assert.notEqual(a.context.model,b.context.model);
  assert.equal(a.context.redraw(),false,'no Canvas is created implicitly');
  assert.equal(b.context.getGraph(),null);
  a.context.applyState(12);
  assert.equal(a.context.model.Height,12);
  assert.equal(b.context.model.Height,0);
  assert.equal(a.context.model.AllStatesChanged,true);
  assert.equal(b.context.model.AllStatesChanged,false);
  a.context.mountGraph({Id:'canvas-A'});
  b.context.mountGraph({Id:'canvas-B'});
  assert.notEqual(a.context.getGraph(),b.context.getGraph());
  assert.equal(a.context.redraw(),true);
  assert.equal(b.context.redraw(),true);
  assert.deepEqual(a.events,[['state','A',12],['mount','canvas-A'],['draw','A']]);
  assert.deepEqual(b.events,[['mount','canvas-B'],['draw','B']]);
  assert.throws(()=>a.context.mountGraph({Id:'another'}),/already mounted/);
});

test('failed Canvas creation leaves the context mountable without changing its model',()=>{
  const create=createFactory(),model={Height:3};let attempts=0;
  const context=create({createModel(){return model;},createGraph(){
    if(++attempts===1)throw new Error('Canvas missing');
    return {Redraw(){}};
  },applyState(target,value){target.Height=value;}});
  assert.throws(()=>context.mountGraph({}),/Canvas missing/);
  assert.equal(context.getGraph(),null);
  context.mountGraph({});
  context.applyState(9);
  assert.equal(model.Height,9);
});

test('Legacy JSON state deserialization accepts an explicit model without changing global CurveApp',()=>{
  const globalModel={Height:1,AllStatesChanged:false};
  const other={Height:2,AllStatesChanged:false};
  const readCalls=[];const meta={};
  const realm={CurveApp:globalModel,CurveAppMetaData:meta,
    DataX:{FromJson(model,metadata,json){readCalls.push([model,metadata,json]);
      model.Height=JSON.parse(json).Height;return true;}},
    document:{querySelectorAll(){return [];}},xOnLoad(){},alert(){throw Error('unexpected alert');}};
  vm.runInNewContext(read('src/app/CurvatureStatePersistence.js'),realm);
  assert.equal(realm.JsonToAppState('CurveApp = {"Height":42}',other),true);
  assert.equal(other.Height,42);
  assert.equal(other.AllStatesChanged,true);
  assert.equal(globalModel.Height,1);
  assert.equal(globalModel.AllStatesChanged,false);
  assert.equal(readCalls[0][0],other);
  assert.equal(readCalls[0][1],meta);
  assert.equal(realm.JsonToAppState('CurveApp = {"Height":7}'),true);
  assert.equal(globalModel.Height,7,'standalone Legacy call retains its original behavior');
});

test('both Legacy entrypoints mount context before runtime; Modern keeps its own app realm',()=>{
  for(const file of ['CurvatureApp.html','CurvatureDemosHost.html']){
    const html=read(file);
    const model=html.indexOf('src/app/CurvatureModel.js');
    const context=html.indexOf('src/app/LegacyAppContext.js');
    const runtime=html.indexOf('src/app/CurvatureAppRuntime.js');
    assert.ok(model>=0&&model<context&&context<runtime,file);
    assert.equal(html.split('src/app/LegacyAppContext.js').length,2);
  }
  assert.doesNotMatch(read('CurvatureModern.html'),/LegacyAppContext\.js/);
  const runtime=read('src/app/CurvatureAppRuntime.js');
  assert.match(runtime,/var CurveApp = legacyAppContext\.model/);
  assert.match(runtime,/var graph = legacyAppContext\.mountGraph/);
  const authored=read('src/animation/CurvatureDemos.js');
  assert.match(authored,/getModel: function\(\)\{return legacyAppContext\.model/);
  assert.match(authored,/applyState: function\(state\)\{return legacyAppContext\.applyState/);
});

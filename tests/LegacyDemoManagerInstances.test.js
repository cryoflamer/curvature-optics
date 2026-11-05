'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const managerFile='src/animation/LegacyDemoManager.js';
const source=fs.readFileSync(path.join(root,managerFile),'utf8');
const context={}; // No DOM, model, Tabs, Demos, timers, or browser globals.
vm.runInNewContext(source,context,{filename:managerFile});
const create=context.CurvatureLegacyDemoManager.create;

function environment(name){
  const model={owner:name}, handlers=new Map(), display=new Map(), applied=[], updates=[], info=[];
  const touched=[],animations=[];
  let initCalls=0;
  const ports={
    isString:value=>typeof value==='string',
    defaultString:(value,fallback)=>typeof value==='string'?value:fallback,
    defaultNumber:(value,fallback)=>typeof value==='number'?value:fallback,
    addButtonClickHandler(tab,id,handler){handlers.set(`${tab}:${id}`,handler);},
    addClass(id,css){touched.push(['add',id,css]);},
    removeClass(id,css){touched.push(['remove',id,css]);},
    setHTML(id,value){display.set(id,value);},
    createAnimation(options){
      const states=[],transitions=[];
      const animation={
        options,states,transitions,CurrState:0,TargetState:0,NStates:0,IsPlaying:false,
        OnSetState(index,callback){states[index]=callback;this.NStates=Math.max(this.NStates,index+1);},
        AnimationToState(index,definition){transitions[index]=definition;},
        SetState(index){
          this.CurrState=this.TargetState=index;
          if(states[index])states[index]();
          options.OnAfterStateChange(this,index);
        },
        Reset(){this.SetState(0);},
        Play(){this.IsPlaying=true;options.OnAfterStateChange(this,this.CurrState);},
        Stop(){this.IsPlaying=false;options.OnStopPlaying(this,this.CurrState);},
      };
      animations.push(animation);
      return animation;
    },
    getModel(){return model;},
    updateAll(value){updates.push(value);},
    applyState(value){applied.push(value);},
    showInfo(value){info.push(value);},
    initCustom(){initCalls++;},
  };
  const manager=create(ports);
  return {manager,ports,model,handlers,display,applied,updates,info,touched,animations,
    get initCalls(){return initCalls;}};
}

function register(h,name,state){
  const anim=h.manager.New(name,'Information for '+name);
  h.manager.AddState(state);
  h.manager.AddState(state+' next');
  h.manager.AddAnimation({TimeSpan:100});
  return anim;
}

test('the manager factory fails closed without all explicitly injected ports',()=>{
  assert.throws(()=>create(),/requires explicit/);
  assert.throws(()=>create({}),/requires explicit/);
  const h=environment('ready');
  assert.equal(h.manager.CurrDemo,null);
  assert.equal(h.manager.DemoList.length,0);
});

test('two managers register and play identically named demos without shared state or observers',()=>{
  const a=environment('A'), b=environment('B');
  const aa=register(a,'TransLine','state-A');
  const bb=register(b,'TransLine','state-B');
  assert.notEqual(aa,bb);
  assert.equal(aa.options.ModelRef,a.model);
  assert.equal(bb.options.ModelRef,b.model);
  a.manager.Init();b.manager.Init();
  assert.equal(a.initCalls,1);assert.equal(b.initCalls,1);
  assert.ok(a.handlers.has('CurveDemosTabs:TransLineButton'));
  assert.ok(b.handlers.has('CurveDemosTabs:TransLineButton'));

  a.manager.SetDemo('TransLine',false,0);
  assert.deepEqual(a.applied,['state-A']);
  assert.deepEqual(b.applied,[]);
  a.manager.Next(false,false);
  assert.deepEqual(a.applied,['state-A','state-A next']);
  assert.equal(b.manager.CurrDemo,null);
  b.manager.SetDemo('TransLine',false,0);
  assert.deepEqual(b.applied,['state-B']);
  assert.equal(a.manager.GetCurrPos(),1);
  assert.equal(b.manager.GetCurrPos(),0);
  assert.equal(a.info.at(-1),'Information for TransLine');
  assert.equal(b.info.at(-1),'Information for TransLine');
  assert.equal(a.display.get('CountButton'),'end');
  assert.equal(b.display.get('CountButton'),'1');
});

test('per-instance button handlers and animation callbacks never target another manager',()=>{
  const a=environment('A'), b=environment('B');
  register(a,'Curve','A');register(b,'Curve','B');
  a.manager.Init();b.manager.Init();
  a.handlers.get('CurveDemosTabs:CurveButton')();
  assert.equal(a.manager.IsPlaying(),true);
  assert.equal(b.manager.IsPlaying(),false);
  assert.equal(b.manager.CurrDemo,null);
  a.manager.Stop();
  b.handlers.get('CurveDemosTabs:CurveButton')();
  assert.equal(a.manager.IsPlaying(),false);
  assert.equal(b.manager.IsPlaying(),true);
  a.animations[0].options.OnModelChange();
  assert.deepEqual(a.updates,[false]);
  assert.deepEqual(b.updates,[]);
  // Active-state guards are bound to the owning manager, not global Demos.
  a.manager.Reset();
  const before=a.applied.length;
  a.animations[0].SetState(0);
  assert.equal(a.applied.length,before);
  assert.equal(b.manager.IsPlaying(),true);
});

test('actual browser entrypoints load the manager factory immediately before authored registrations',()=>{
  for(const file of ['CurvatureApp.html','CurvatureDemosHost.html']){
    const html=fs.readFileSync(path.join(root,file),'utf8');
    const factory=html.indexOf('<script src="src/animation/LegacyDemoManager.js"></script>');
    const authored=html.indexOf('<script src="src/animation/CurvatureDemos.js"></script>');
    assert.ok(factory>=0&&authored>factory,file);
    assert.equal(html.match(/src="src\/animation\/LegacyDemoManager\.js"/g).length,1);
  }
  const authored=fs.readFileSync(path.join(root,'src/animation/CurvatureDemos.js'),'latin1');
  assert.match(authored,/var Demos = CurvatureLegacyDemoManager\.create\(/);
  assert.equal([...authored.matchAll(/Demos\.New\(\s*'([^']+)'/g)].length,9);
});

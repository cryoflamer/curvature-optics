'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const registry=require('../src/storage/ModernStateRegistry.js');

function specs(instance){
  instance.register({
    key:'scene.panel.open',scope:'per-tab-and-workspace',version:1,
    defaultValue:false,validate:v=>typeof v==='boolean'
  });
  instance.register({
    key:'object-explorer.tree.expanded',scope:'per-tab-and-workspace',version:1,
    defaultValue:[],validate:v=>Array.isArray(v)&&v.every(id=>typeof id==='string')
  });
  instance.register({
    key:'application.theme',scope:'global',version:1,defaultValue:'light',
    validate:v=>['light','dark'].includes(v)
  });
  instance.register({
    key:'animation.selected-view',scope:'per-tab',version:2,
    defaultValue:'editor',validate:v=>['editor','preview','library'].includes(v),
    migrate:(old,version)=>version===1&&old==='canvas'?'preview':old
  });
}

test('Object Explorer needs only a declaration; default, set, subscribe, snapshot and scope work',()=>{
  const ui=registry.create();specs(ui);
  const a={tabId:'first-tab',workspace:'object-explorer'};
  const b={tabId:'second-tab',workspace:'object-explorer'};
  const c={tabId:'first-tab',workspace:'scene'};
  assert.deepEqual(ui.get('object-explorer.tree.expanded',a),[]);
  let called=0;
  const off=ui.subscribe('object-explorer.tree.expanded',(now,was)=>{
    assert.deepEqual(now,['tower-a']);assert.deepEqual(was,[]);called++;
  });
  const original=['tower-a'];
  assert.equal(ui.set('object-explorer.tree.expanded',original,a),true);
  original.push('this-must-not-leak');
  assert.deepEqual(ui.get('object-explorer.tree.expanded',a),['tower-a']);
  assert.deepEqual(ui.get('object-explorer.tree.expanded',b),[]);
  assert.deepEqual(ui.get('object-explorer.tree.expanded',c),[]);
  assert.equal(ui.set('object-explorer.tree.expanded',['tower-a'],a),false);
  assert.equal(called,1);
  off();
  assert.equal(ui.reset('object-explorer.tree.expanded',a),true);
  assert.deepEqual(ui.get('object-explorer.tree.expanded',a),[]);
  const s=ui.snapshot('per-tab-and-workspace',a);
  assert.equal(s.values['object-explorer.tree.expanded'].version,1);
  assert.equal(s.values['scene.panel.open'].value,false);
});

test('global preferences are separate; per-tab choice is independent of workspaces',()=>{
  const ui=registry.create();specs(ui);
  const first={tabId:'tab-one',workspace:'scene'};
  const second={tabId:'tab-two',workspace:'scene'};
  assert.equal(ui.set('animation.selected-view','preview',first),true);
  assert.equal(ui.get('animation.selected-view',{tabId:'tab-one',workspace:'animation'}),'preview');
  assert.equal(ui.get('animation.selected-view',second),'editor');
  assert.equal(ui.set('application.theme','dark',first),true);
  assert.equal(ui.get('application.theme',second),'dark');
  assert.equal(ui.snapshot('global').values['application.theme'].value,'dark');
});

test('restore is silent and versioned, rejects unknown/newer/corrupt keys and preserves evidence',()=>{
  const ui=registry.create();specs(ui);
  const ctx={tabId:'tab-a',workspace:'object-explorer'};
  let notifications=0;
  ui.subscribe('object-explorer.tree.expanded',()=>notifications++);
  const snap=ui.snapshot('per-tab-and-workspace',ctx);
  snap.values['object-explorer.tree.expanded']={version:1,value:['tree-42']};
  snap.values['scene.panel.open']={version:50,value:true};
  snap.values['future.explorer.value']={version:1,value:'keep-me'};
  const result=ui.hydrate(snap,ctx);
  assert.deepEqual(result.applied,['object-explorer.tree.expanded']);
  assert.deepEqual(result.rejected,['scene.panel.open','future.explorer.value']);
  assert.deepEqual(ui.get('object-explorer.tree.expanded',ctx),['tree-42']);
  assert.equal(ui.get('scene.panel.open',ctx),false);
  assert.equal(notifications,0,'programmatic restore must not create new writes');
  assert.equal(ui.evidence().length,2);
  assert.equal(ui.evidence()[1].raw.value,'keep-me');
  const next=registry.create();specs(next);
  const old={format:registry.FORMAT,version:registry.VERSION,scope:'per-tab',
    values:{'animation.selected-view':{version:1,value:'canvas'}}};
  assert.deepEqual(next.hydrate(old,{tabId:'tab-a'}).applied,['animation.selected-view']);
  assert.equal(next.get('animation.selected-view',{tabId:'tab-a'}),'preview');
});

test('malformed snapshots and attempts to use invalid or unregistered fields fail safely',()=>{
  const ui=registry.create();specs(ui);
  const ctx={tabId:'tab-one',workspace:'scene'};
  assert.throws(()=>ui.register({
    key:'scene.panel.open',scope:'global',version:1,defaultValue:true,
    validate:v=>typeof v==='boolean'}),/duplicate state owner/);
  assert.throws(()=>ui.set('scene.panel.open','true',ctx),/invalid value/);
  assert.throws(()=>ui.set('unregistered.key',false,ctx),/unregistered state/);
  assert.throws(()=>ui.snapshot('per-tab-and-workspace',{tabId:'tab-one'}),/workspace ID required/);
  assert.throws(()=>ui.hydrate({format:'evil',version:1,scope:'global',values:{}},{}),
    /invalid snapshot/);
  assert.throws(()=>ui.register({key:'camera.data',scope:'global',version:1,
    defaultValue:{},documentData:true,validate:()=>true}),/cannot own document data/);
  assert.throws(()=>ui.register({key:'foo.bar',scope:'global',version:1,
    defaultValue:{x:1},validate:()=>false}),/default rejected/);
});

test('null can represent a deliberate missing selection without losing its type',()=>{
  const ui=registry.create();
  ui.register({key:'object-explorer.selected-object',scope:'per-tab',version:1,
    defaultValue:null,validate:v=>v===null||typeof v==='string'});
  assert.equal(ui.get('object-explorer.selected-object',{tabId:'a'}),null);
  const state=ui.snapshot('per-tab',{tabId:'a'});
  const second=registry.create();
  second.register({key:'object-explorer.selected-object',scope:'per-tab',version:1,
    defaultValue:'a',validate:v=>v===null||typeof v==='string'});
  assert.deepEqual(second.hydrate(state,{tabId:'b'}).applied,['object-explorer.selected-object']);
  assert.equal(second.get('object-explorer.selected-object',{tabId:'b'}),null);
});

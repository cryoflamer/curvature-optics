'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const views=require('../src/ui/modern/ModernAnimationWorkspaceViews');
function fixture(){
  const map=new Map();
  function element(id){
    const attrs={},events={};
    const node={hidden:false,tabIndex:0,focused:false,
      setAttribute(k,v){attrs[k]=v;},getAttribute(k){return attrs[k]??null;},
      addEventListener(k,cb){events[k]=cb;},fire(k,event={}){events[k](event);},
      focus(){this.focused=true;}};
    map.set(id,node);
  }
  for(const name of ['Library','Editor','Preview']){
    element('ModernAnimationView'+name);element('ModernAnimation'+name+'View');
  }
  return {map,doc:{getElementById(id){return map.get(id)||null;}}};
}
test('one active mounted panel with accessible keyboard tabs',()=>{
  const {map,doc}=fixture();let active='library';let controller;
  controller=views.bind(doc,(name,focus)=>{active=name;controller.show(name,focus);});
  assert.equal(controller.show('library'),true);
  assert.equal(map.get('ModernAnimationEditorView').hidden,true);
  assert.equal(map.get('ModernAnimationViewLibrary').getAttribute('aria-selected'),'true');
  const preserved=map.get('ModernAnimationPreviewView');
  map.get('ModernAnimationViewEditor').fire('click');
  assert.equal(active,'editor');
  assert.equal(map.get('ModernAnimationLibraryView').hidden,true);
  let prevented=false;
  map.get('ModernAnimationViewEditor').fire('keydown',{key:'ArrowRight',preventDefault(){prevented=true;}});
  assert.equal(active,'preview');assert.equal(prevented,true);
  assert.equal(map.get('ModernAnimationViewPreview').focused,true);
  assert.equal(map.get('ModernAnimationPreviewView'),preserved);
  map.get('ModernAnimationViewPreview').fire('keydown',{key:'Home',preventDefault(){}});
  assert.equal(active,'library');
  assert.equal(map.get('ModernAnimationViewPreview').tabIndex,-1);
  assert.equal(controller.show('invalid'),false);
});
test('incomplete markup is not bound',()=>{assert.equal(views.bind({getElementById(){return null;}}),null);});

test('Studio view route preserves experiment query and hash',()=>{
  const href='https://example.test/CurvatureModern.html?experiment=abc%2Bdef%3D#camera';
  const updated=views.address(href,'editor'),url=new URL(updated);
  assert.equal(url.searchParams.get('experiment'),'abc+def=');
  assert.equal(url.hash,'#camera');
  assert.equal(views.route(updated),'editor');
  assert.equal(views.route(href),null);
  assert.equal(views.route(updated.replace('studioView=editor','studioView=bogus')),null);
  assert.throws(()=>views.address(href,'invalid'),RangeError);
});
test('View history pushes only changed tabs and preserves external state',()=>{
  const calls=[];
  const root={location:{href:'https://example.test/CurvatureModern.html?experiment=abc'},
    history:{state:{external:true},pushState(state,title,href){
      calls.push({action:'push',state,href});root.location.href=href;
    },replaceState(state,title,href){
      calls.push({action:'replace',state,href});root.location.href=href;
    }}};
  assert.equal(views.navigate(root,'editor',false),true);
  assert.equal(views.navigate(root,'editor',false),true);
  assert.equal(views.navigate(root,'preview',true),true);
  assert.deepEqual(calls.map(x=>x.action),['push','replace']);
  assert.deepEqual(calls[1].state,{external:true});
  assert.equal(views.route(root.location.href),'preview');
});

test('restoring a mounted input returns editor caret focus, but arrows retain tab focus',()=>{
  const {map,doc}=fixture();let controller;
  controller=views.bind(doc,(name,focus)=>controller.show(name,focus));
  const panel=map.get('ModernAnimationEditorView');
  const field={isConnected:true,disabled:false,restores:0,
    focus(){this.restores++;}};
  panel.contains=target=>target===field;
  controller.show('editor',false);
  panel.fire('focusin',{target:field});
  controller.show('preview',false);
  controller.show('editor',false);
  assert.equal(field.restores,1,'clicking back to Editor restores the live field');
  controller.show('preview',false);
  controller.show('editor',true);
  assert.equal(field.restores,1,'keyboard tablist navigation keeps focus on tab');
  assert.equal(map.get('ModernAnimationViewEditor').focused,true);
  field.isConnected=false;
  controller.show('preview',false);
  controller.show('editor',false);
  assert.equal(field.restores,1,'a rerendered/detached field is never refocused');
});

test('view changes leave background export and the active draft untouched',()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  const start=source.indexOf('  function setStudioView(');
  const end=source.indexOf('  function bindStudioViews()',start);
  assert.ok(start>0&&end>start,'actual Studio view routing function');
  let halts=0,cancels=0,backups=0,paints=0,sizes=0;
  const exportTask={cancel(){throw Error('navigation must not cancel video export');}};
  const frameTask={cancel(){throw Error('navigation must not cancel frame export');}};
  const project={id:'retained-project'},history={past:[1]},selectedKey='frame-4';
  const ctx={studioView:'preview',studioVideoExportTask:exportTask,
    studioFrameExportTask:frameTask,studioPrepared:project,studioEditHistory:history,
    studioSelectedKey:selectedKey,studioRouteReady:false,animationWorkspaceOpen:true,
    studioRestorePreviewPending:true,studioPlaybackRenderedAt:null,
    studioPlayback:{status(){return {positionMs:20950,playing:false};}},
    studioPlaybackControls:{halt(){halts++;}},
    studioPreviewLifecycle:{cancel(){cancels++;},checkSize(){sizes++;return true;}},
    syncStudioPlaybackControls(){},saveStudioDraft(){backups++;return true;},
    studioViewController:{show(){}},scheduleStudioInitialPaint(){paints++;},
    workspaceViewEditGeneration:{animation:0,calibration:0},
    workspaceUiRegistryPreview:{status:'disabled',bridge:null}
  };
  vm.runInNewContext(source.slice(start,end)+'\nthis.changeView=setStudioView;',ctx);
  assert.equal(ctx.changeView('editor',false),true);
  assert.equal(cancels,1);assert.equal(halts,1);assert.equal(backups,1);
  assert.equal(ctx.changeView('preview',false),true);
  assert.equal(sizes,1);assert.equal(paints,0,
    'a resize-triggered initial paint must not be scheduled twice');
  assert.strictEqual(ctx.studioVideoExportTask,exportTask);
  assert.strictEqual(ctx.studioFrameExportTask,frameTask);
  assert.strictEqual(ctx.studioPrepared,project);
  assert.strictEqual(ctx.studioEditHistory,history);
  assert.equal(ctx.studioSelectedKey,selectedKey);
  assert.equal(ctx.workspaceViewEditGeneration.animation,2);
  const registryWrites=[];
  ctx.workspaceUiRegistryPreview={status:'ready',bridge:{setView(workspace,view){
    registryWrites.push([workspace,view]);return Promise.resolve();
  }}};
  assert.equal(ctx.changeView('editor',false,null,true),true);
  assert.equal(ctx.workspaceViewEditGeneration.animation,2,
    'silent registry hydration must not be mistaken for a user navigation');
  assert.deepEqual(registryWrites,[], 'hydration never creates a durable view update');
  assert.equal(ctx.changeView('preview',false,'push'),true);
  assert.deepEqual(registryWrites,[['animation','preview']],
    'an intentional view selection uses the existing registry, not a new store');
  assert.equal(ctx.workspaceViewEditGeneration.animation,3);
});

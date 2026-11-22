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

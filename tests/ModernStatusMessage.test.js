'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const messages=require('../src/ui/modern/ModernStatusMessage');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
const css=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.css'),'utf8');
const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
function fakeNode(){
  let text='';const attrs={},classes=new Set(),children=[];
  const node={
    attrs,classes,children,
    classList:{add(k){classes.add(k);},toggle(k,on){if(on)classes.add(k);else classes.delete(k);}},
    setAttribute(k,v){attrs[k]=v;},
    get textContent(){return text+children.map(x=>x.textContent).join('');},
    set textContent(value){text=String(value);children.length=0;},
    appendChild(child){children.push(child);},
    ownerDocument:{defaultView:{navigator:{clipboard:{writeText:async value=>{node.copied=value;}}}},
      createElement(){const handlers={};return {textContent:'',type:'',className:'',
        setAttribute(k,v){this[k]=v;},addEventListener(k,cb){handlers[k]=cb;},
        click(){handlers.click({stopPropagation(){}});}};}}
  };
  return node;
}
test('error is explicitly marked, accessible, copyable, and is not auto-dismissed',async()=>{
  const node=fakeNode(),original='Video export failed: invalid worker project';
  messages.set(node,original,'error');
  assert.equal(node.attrs['data-status-kind'],'error');
  assert.equal(node.attrs.role,'alert');
  assert.equal(node.attrs['aria-live'],'assertive');
  assert.ok(node.classes.has('is-error'));
  assert.equal(node.children.length,1);
  assert.match(node.textContent,/Copy error/);
  node.children[0].click();await new Promise(setImmediate);
  assert.equal(node.copied,original,'copy uses the exact diagnostic, without UI label');
  assert.match(node.textContent,/Copied/);
});
test('progress after failure resets error semantics and removes copy action',()=>{
  const node=fakeNode();
  messages.set(node,'PNG export failed: renderer failed','error');
  messages.set(node,'Rendering 80 / 100 frames','info');
  assert.equal(node.textContent,'Rendering 80 / 100 frames');
  assert.equal(node.children.length,0);
  assert.equal(node.attrs['data-status-kind'],'info');
  assert.equal(node.attrs.role,'status');
  assert.equal(node.attrs['aria-live'],'polite');
  assert.ok(!node.classes.has('is-error'));
  messages.set(node,'PNG archive ready','success');
  assert.equal(node.attrs['data-status-kind'],'success');
  messages.set(node,'PNG export cancelled','warning');
  assert.equal(node.attrs['data-status-kind'],'warning');
  assert.equal(node.textContent,'PNG export cancelled');
});
test('messages remain DOM-safe without clipboard or a full document',()=>{
  const node={textContent:'',classList:{add(){},toggle(){}},setAttribute(){}};
  assert.equal(messages.set(null,'error','error'),null);
  messages.set(node,'<script>alert(1)</script>','error');
  assert.equal(node.textContent,'<script>alert(1)</script>');
  assert.equal(messages.decorate(node,'info'),node);
});
test('component is loaded before app and key Animation statuses are opted in',()=>{
  assert.ok(html.indexOf('ModernStatusMessage.js')<html.indexOf('ModernApp.js'));
  for(const id of ['ModernAnimationPlaybackStatus','ModernAnimationFrameExportStatus',
    'ModernAnimationVideoExportStatus','ModernAnimationStudioMessage','ModernAnimationDraftStatus']){
    assert.match(html,new RegExp('id="'+id+'"[^>]+modern-status-message'));
  }
  assert.match(css,/\.modern-status-message\[data-status-kind="error"\]/);
  assert.match(css,/\.modern-status-message\[data-status-kind="success"\]/);
  assert.match(app,/Video export failed:[^\n]+,'error'/);
  assert.match(app,/PNG export failed:[^\n]+,'error'/);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const status=require('../src/ui/modern/ModernStatusMessage');
const libraryUI=require('../src/ui/modern/ModernAnimationStudioUI');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const app=read('src/ui/modern/ModernApp.js');
const html=read('CurvatureModern.html');
const css=read('src/ui/modern/ModernApp.css');

function dom(){
  const doc={defaultView:{navigator:{clipboard:{writeText:async()=>{}}}},createElement(tag){
    const attrs={},classes=new Set(),listeners={};let contents='';
    const node={tagName:tag,attrs,classes,children:[],listeners,value:'',hidden:false,
      ownerDocument:doc,
      classList:{add(name){classes.add(name);},toggle(name,active){if(active)classes.add(name);else classes.delete(name);}},
      setAttribute(name,value){attrs[name]=value;},
      addEventListener(name,callback){listeners[name]=callback;},
      appendChild(child){this.children.push(child);return child;},
      get textContent(){return contents+this.children.map(child=>child.textContent).join('');},
      set textContent(value){contents=String(value);this.children=[];}
    };return node;
  }};
  const nodes=new Map();
  return {doc,nodes,get(id){if(!nodes.has(id))nodes.set(id,doc.createElement('p'));return nodes.get(id);}};
}
function body(name,next){
  const start=app.indexOf('  function '+name+'('),end=app.indexOf('  '+next,start);
  assert.ok(start>0&&end>start,'ModernApp.js contains '+name);
  return app.slice(start,end);
}
function walk(node){return [node,...node.children.flatMap(walk)];}

test('History and persistence show alert semantics, and a subsequent ordinary status resets the alert',()=>{
  const h=dom();
  const context=vm.createContext({document:{getElementById:id=>h.get(id),querySelector:()=>null},
    root:{CurvatureModernStatusMessage:status}});
  vm.runInContext(body('el','// Older isolated Node harnesses')+
    body('newUiEl','function experimentSnapshot')+
    body('historyStatus','function cancelHistoryAuto')+
    '\nthis.exposed={updateStatus,persistenceStatus,historyStatus};',context);
  context.exposed.historyStatus('Import failed: invalid JSON',true);
  const history=h.get('ModernHistoryStatus');
  assert.equal(history.attrs['data-status-kind'],'error');
  assert.equal(history.attrs.role,'alert');
  assert.equal(history.children.length,1,'Copy error available for History JSON failures');
  context.exposed.historyStatus('Imported 3 snapshots',false);
  assert.equal(history.attrs['data-status-kind'],'info');
  assert.equal(history.attrs.role,'status');
  assert.equal(history.children.length,0);
  context.exposed.persistenceStatus('Working-session storage unavailable',true);
  assert.equal(h.get('ModernPersistenceStatus').attrs['data-status-kind'],'error');
  context.exposed.updateStatus('Physical renderer: failed',true);
  assert.equal(h.get('ModernStatus').attrs['data-status-kind'],'error');
  context.exposed.updateStatus('3 unresolved rays','warning');
  assert.equal(h.get('ModernStatus').attrs['data-status-kind'],'warning',
    'Unresolved physical samples are warnings, not failed renderer exceptions');
});

test('Animation Library JSON failures share the exact same status component',()=>{
  const h=dom(),host=h.doc.createElement('section');
  const actions={};
  libraryUI.renderLibrary(h.doc,host,[],{message:'Animation import failed: invalid JSON',error:true},actions);
  const node=walk(host).find(n=>n.className==='modern-animation-library-message');
  assert.ok(node,'error message is shown in the Library panel');
  assert.equal(node.attrs['data-status-kind'],'error');
  assert.equal(node.attrs.role,'alert');
  assert.equal(node.children.length,1,'History and Library both offer Copy error');
  assert.match(node.textContent,/Animation import failed/);
  host.textContent='';
  libraryUI.renderLibrary(h.doc,host,[],{message:'Saved new animation',error:false},actions);
  const ok=walk(host).find(n=>n.className==='modern-animation-library-message');
  assert.equal(ok.attrs['data-status-kind'],'info');
  assert.equal(ok.attrs.role,'status');
  assert.equal(ok.children.length,0);
});

test('Modern errors are consistently opt-in; dark viewport info remains readable',()=>{
  const ids=['ModernHistoryStatus','ModernPersistenceStatus','ModernSnapshotSaveStatus',
    'ModernSequenceStatus','ModernCameraPositionsStatus','ModernOpticalQualityStatus',
    'ModernGeometryBackendStatus','ModernPreferencesStatus','ModernGpuNote',
    'ModernDemoStatus','ModernStatus','ModernCompareStatusA','ModernCompareStatusB'];
  for(const id of ids){
    const pattern=new RegExp('<[^>]+(?=[^>]*id="'+id+'")(?=[^>]*class="[^"]*modern-status-message)[^>]*>');
    assert.match(html,pattern,id+' shares the common presentation class');
  }
  assert.match(css,/\.modern-viewport-foot \.modern-status-message\[data-status-kind="info"\][\s\S]*?color:#b9cce2/);
  assert.match(app,/modernStatus\(status,'History unavailable: '/);
  assert.match(app,/modernStatus\(status,'Snapshot unavailable: '/);
  assert.match(app,/modernStatus\(el\('ModernCompareStatus'\+side\),'Physical model '/);
  assert.match(app,/updateOpticalQualityStatus\(effectiveOpticalQuality\(\)===\'fast\'\?'Fast Preview: '/);
  assert.match(read('src/ui/modern/ModernDemos.js'),/Unable to connect to Demos host\.','error'/);
  assert.doesNotMatch(read('CurvatureApp.html'),/ModernStatusMessage\.js/);
});


test('CSS-generated History pins, deletion crosses and status icons are encoding-independent',()=>{
  const css=read('src/ui/modern/ModernApp.css');
  assert.match(css,/\.modern-history-pin::after\{content:"\\1F4CC "/);
  assert.match(css,/\.modern-card-delete::after\{content:"\\2715 "/);
  assert.match(css,/\.modern-status-message\.is-error::before\{content:'\\2715  Error \\00B7 '/);
  assert.match(css,/\.modern-status-message\[data-status-kind="warning"\]::before\{content:'\\26A0  Warning \\00B7 '/);
  assert.match(css,/\.modern-status-message\[data-status-kind="success"\]::before\{content:'\\2713  Success \\00B7 '/);
  for(const declaration of css.matchAll(/content\s*:\s*(["'])(.*?)\1/g)){
    assert.match(declaration[2],/^[\x00-\x7F]*$/,'CSS content must not contain raw multibyte glyphs');
  }
});

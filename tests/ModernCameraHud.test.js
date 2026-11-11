'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const hudFactory=require('../src/ui/modern/ModernCameraHud');
const telemetry=require('../src/camera/ModernCameraTelemetry');

function model(geometry=1){return {showModel:geometry,rEarth:6371000,rFEarth:10007543,
  Height:100,CameraEast:3000,CameraNorth:4000,Pan:45,Nick:2,Roll:0,
  camViewAngle:Math.PI/3,viewcenterHorizon:3,deviceRatio:1.5};}
function documentMock(){
  function createElement(tag){return {tagName:tag.toUpperCase(),attributes:{},children:[],
    parentNode:null,hidden:false,textContent:'',className:'',
    setAttribute(k,v){this.attributes[k]=v;},
    appendChild(node){node.parentNode=this;this.children.push(node);return node;},
    removeChild(node){const i=this.children.indexOf(node);if(i<0)throw Error('not child');
      this.children.splice(i,1);node.parentNode=null;return node;}};}
  return {createElement};
}
function setup(){
  const doc=documentMock(),hud=hudFactory.create({document:doc,telemetry});
  function canvas(){const parent=doc.createElement('div');
    const c=doc.createElement('canvas');parent.appendChild(c);return {c,parent};}
  return {hud,canvas};
}

test('Scene overlay uses measured physical camera and creates only DOM text',()=>{
  const {hud,canvas}=setup(),{c,parent}=canvas(),m=model(),original=structuredClone(m);
  assert.equal(hud.update('Scene',c,m),true);
  assert.equal(parent.children.length,2,'one new overlay, no Canvas replacements');
  const node=parent.children[1];
  assert.equal(node.className,'modern-camera-telemetry');
  assert.equal(node.attributes['aria-live'],'off');
  assert.equal(node.children[0].textContent,'CAMERA · GLOBE');
  assert.match(node.children[1].textContent,/Height 100.0 m.*Origin 5.00 km/);
  assert.match(node.children[2].textContent,/East 3.00 km.*North 4.00 km/);
  assert.match(node.children[3].textContent,/Heading 45.0°.*Pitch 2.0°.*FOV 60.0°/);
  assert.equal(hud.update('Scene',c,{...m,CameraEast:6000,Pan:70}),true);
  assert.equal(parent.children.length,2,'existing overlay reused');
  assert.match(node.children[2].textContent,/East 6.00 km/);
  assert.deepEqual(m,original,'rendering telemetry cannot change the physical model');
  hud.hide('Scene');assert.equal(node.hidden,true);
  hud.update('Scene',c,m);assert.equal(node.hidden,false);
});

test('Compare A/B overlays are independent and use each viewport geometry',()=>{
  const {hud,canvas}=setup(),a=canvas(),b=canvas(),m=model();
  assert.equal(hud.update('A',a.c,m),true);
  assert.equal(hud.update('B',b.c,{...m,showModel:2,Height:30}),true);
  assert.equal(a.parent.children[1].children[0].textContent,'CAMERA · GLOBE');
  assert.equal(b.parent.children[1].children[0].textContent,'CAMERA · FLAT');
  assert.match(b.parent.children[1].children[1].textContent,/Height 30.0 m/);
  hud.hide('A');assert.equal(a.parent.children[1].hidden,true);
  assert.equal(b.parent.children[1].hidden,false);
  hud.hideAll();assert.equal(b.parent.children[1].hidden,true);
  assert.equal(hud.update('C',a.c,m),false);
  assert.equal(hud.update('B',null,m),false);
});

test('invalid physical camera data hides rather than keeping stale numbers',()=>{
  const {hud,canvas}=setup(),v=canvas(),m=model();
  assert.equal(hud.update('Scene',v.c,m),true);
  const overlay=v.parent.children[1];
  assert.equal(hud.update('Scene',v.c,{...m,CameraEast:NaN}),false);
  assert.equal(overlay.hidden,true);
  assert.equal(hud.update('Scene',v.c,m),true);
  assert.equal(overlay.hidden,false);
});

test('overlay reattaches when a graph replaces its Canvas clipping container',()=>{
  const {hud,canvas}=setup(),one=canvas(),two=canvas();
  hud.update('A',one.c,model());
  const oldNode=one.parent.children[1];
  hud.update('A',two.c,model());
  assert.equal(oldNode.parentNode,null);
  assert.equal(one.parent.children.length,1);
  assert.equal(two.parent.children.length,2);
  assert.notEqual(two.parent.children[1],oldNode);
});

test('classic browser build publishes HUD module without relying on CommonJS',()=>{
  const root={},source=fs.readFileSync(path.join(__dirname,
    '../src/ui/modern/ModernCameraHud.js'),'utf8');
  vm.runInNewContext(source,{globalThis:root});
  assert.equal(typeof root.CurvatureModernCameraHud.create,'function');
});

test('Modern shell and app connect shared telemetry, independent HUD toggle and live gestures',()=>{
  const root=path.join(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.css'),'utf8');
  assert.match(html,/id="ModernCameraHudToggle"/);
  assert.ok(html.indexOf('src/camera/ModernCameraTelemetry.js')<
    html.indexOf('src/ui/modern/ModernCameraHud.js'));
  assert.ok(html.indexOf('src/ui/modern/ModernCameraHud.js')<
    html.indexOf('src/ui/modern/ModernApp.js'));
  assert.match(app,/function updateCameraHud\(override\)/);
  assert.match(app,/function cameraHudModel\(view,override\)/);
  assert.match(app,/cameraHudVisible=!!toggle.checked;/);
  assert.match(app,/if\(!active.autoLive\)updateCameraHud\(/);
  assert.match(app,/cameraHudVisible:cameraHudVisible/);
  assert.match(css,/\.modern-camera-telemetry\{position:absolute/);
  assert.match(css,/pointer-events:none/);
  assert.doesNotMatch(fs.readFileSync(path.join(root,'CurvatureApp.html'),'utf8'),
    /ModernCameraHud\.js|ModernCameraHudToggle/);
});

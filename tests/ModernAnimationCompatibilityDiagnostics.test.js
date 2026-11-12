'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const codec=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const compatibility=require('../src/animation/ModernAnimationCompatibility');
const studio=require('../src/animation/ModernAnimationStudio');
const ui=require('../src/ui/modern/ModernAnimationStudioUI');
const clone=v=>structuredClone(v);
function snapshot(mode='scene'){
  const model={Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Base',Description:'',
    ObjType:[3,3],NObjects:[85,2],ObjDist:[50,20000],ObjDeltaDist:[297.55,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  return codec.capture(model,{atmosphere:'temperature-lapse',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},compare.preset('globe-flat-vacuum'),
    {mode,eyeLevel:false,horizon:true,selected:'A'});
}
function makeDraft(frames){
  return studio.history(frames.map((_,i)=>i+1),frames.map((experiment,i)=>({
    id:i+1,name:'Frame '+(i+1),experiment})));
}
function dom(){
  const doc={createElement(tag){return {tagName:tag,className:'',textContent:'',children:[],listeners:{},
    value:'',disabled:false,
    appendChild(child){this.children.push(child);return child;},
    setAttribute(key,value){this[key]=value;},
    addEventListener(key,fn){this.listeners[key]=fn;}};}};
  return {doc,host:doc.createElement('div')};
}
function find(node,predicate){return [node,...node.children.flatMap(n=>find(n,predicate))].filter(predicate);}

test('Diagnostics compare every adjacent snapshot, not only every frame against the first',()=>{
  const a=snapshot(),b=clone(a),c=clone(a);
  b.scene.camera.Height=55;
  c.scene.camera.Pan=20;
  const original=clone([a,b,c]);
  const result=compatibility.inspect([a,b,c]);
  assert.equal(result.compatible,true);
  assert.equal(result.transitions.length,2);
  assert.deepEqual(result.transitions[0].changes.map(e=>[e.path,e.from,e.to]),
    [['camera.Height',15,55]]);
  assert.deepEqual(result.transitions[1].changes.map(e=>[e.path,e.from,e.to]),
    [['camera.Height',55,15],['camera.Pan',0,20]]);
  assert.deepEqual([a,b,c],original,'diagnostic inspection is pure');
});

test('Physics and camera in different transitions remain globally incompatible, with localized deltas',()=>{
  const a=snapshot(),b=clone(a);
  b.scene.camera.Height=55;
  const c=clone(b);c.scene.temperatureProfile.gradientKPerKm=11;
  const result=studio.inspect(makeDraft([a,b,c]));
  assert.equal(result.compatible,false);
  assert.deepEqual(result.transitions.map(edge=>edge.changes.map(e=>e.path)),
    [['camera.Height'],['scene.temperatureProfile.gradientKPerKm']]);
  assert.ok(result.issues.some(e=>e.path==='camera.Height'));
  assert.ok(result.issues.some(e=>e.path==='scene.temperatureProfile.gradientKPerKm'));
});

test('Mode switches disclose both ends of their actual values without authorizing discrete playback',()=>{
  const a=snapshot(),b=clone(a);b.display.mode='compare';
  const result=compatibility.inspect([a,b]);
  assert.equal(result.compatible,false);
  const mode=result.transitions[0].changes.find(c=>c.path==='mode');
  assert.deepEqual([mode.from,mode.to],['scene','compare']);
});

test('Compatibility diagnosis shows exact values, a separate transition, and a working highlight action',()=>{
  const a=snapshot(),b=clone(a);
  b.scene.camera.Height=55;
  const c=clone(b);c.scene.temperatureProfile.gradientKPerKm=11;
  const draft=makeDraft([a,b,c]),result=studio.inspect(draft),{doc,host}=dom(),calls=[];
  ui.render(doc,host,draft,result,{prepare(){},edit(){},frame(){},
    focusTransition:index=>calls.push(index)},false,{selectedKey:'history-1',diagnosticTransition:1});
  const diagnostics=find(host,n=>n.className.startsWith('modern-studio-transition')&&!n.className.includes('-header')&&!n.className.includes('-details')&&!n.className.includes('-count')&&!n.className.includes('-table')&&!n.className.includes('-value')&&!n.className.includes('-reason'));
  assert.equal(diagnostics.length,2);
  const text=JSON.stringify(find(host,n=>n.tagName==='td').map(n=>n.textContent));
  assert.match(text,/55/);assert.match(text,/15/);assert.match(text,/11/);
  assert.match(text,/Camera · Camera height/);
  assert.doesNotMatch(text,/mixed-or-unsupported-change/);
  const controls=find(host,n=>n.tagName==='button'&&n.textContent==='Show on timeline');
  assert.equal(controls.length,2);controls[1].listeners.click();
  assert.deepEqual(calls,[1]);
  const frames=find(host,n=>n.tagName==='button'&&n.className.includes('modern-studio-keyframe'));
  assert.match(frames[1].className,/is-transition-from/);
  assert.match(frames[2].className,/is-transition-to/);
  assert.doesNotMatch(frames[0].className,/is-transition-to/);
  assert.equal(find(host,n=>n.tagName==='details'&&n.open===true).length,1);
  assert.equal(find(host,n=>n.tagName==='button'&&n.textContent==='Preview animation')[0].disabled,true);
});

test('Physical curvature Globe–Flat is a supported single channel, not a false generic error',()=>{
  const a=snapshot(),b=clone(a);
  b.scene.surface.showModel=2;
  const result=compatibility.inspect([a,b]);
  assert.equal(result.compatible,true);
  assert.equal(result.mode,'physical');
  assert.equal(result.target.parameter,'surface.curvature');
  assert.equal(result.transitions[0].changes[0].path,'scene.surface.curvature');
});

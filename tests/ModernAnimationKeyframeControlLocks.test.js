'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const locks=require('../src/animation/ModernAnimationKeyframeControlLocks');

test('camera channel maps all seven validated contract fields, no FOV shortcut',()=>{
  const paths=['CameraEast','CameraNorth','Height','Pan','Nick','Roll','FocalLengthField']
    .map(key=>'camera.'+key);
  assert.deepEqual(locks.inputIds(paths,'camera'),[
    'ModernCameraEast','ModernCameraNorth','ModernHeight','ModernPan',
    'ModernNick','ModernRoll','ModernFocal']);
  assert.equal(locks.inputIds(paths,'camera').includes('ModernViewAngle'),false);
});
test('physical target binds only its one active Scene/Compare A/B editor field',()=>{
  assert.deepEqual(locks.inputIds(['scene.surface.curvature'],'scene'),
    ['ModernCurvature','ModernRadiusKm']);
  assert.deepEqual(locks.inputIds(['scene.temperatureProfile.gradientKPerKm'],'scene'),
    ['ModernTemperatureSceneGradient']);
  for(const scope of ['A','B']){
    assert.deepEqual(locks.inputIds(['compare.'+scope+'.surface.curvature'],scope),
      ['ModernModelCurvature','ModernModelRadius']);
    assert.deepEqual(locks.inputIds(['compare.'+scope+'.temperatureProfile.gradientKPerKm'],scope),
      ['ModernTemperatureCompareGradient']);
    assert.throws(()=>locks.inputIds(['compare.'+scope+'.surface.curvature'],
      scope==='A'?'B':'A'),/No safe UI binding/);
  }
});
test('canvas drag is available only for camera Pan and Nick channels',()=>{
  const cameraPaths=['camera.Pan','camera.Nick','camera.Height'];
  assert.equal(locks.cameraDragAllowed(cameraPaths,'camera'),true);
  assert.equal(locks.cameraDragAllowed(['camera.Pan'],'camera'),false);
  assert.equal(locks.cameraDragAllowed(cameraPaths,'scene'),false);
  assert.equal(locks.cameraDragAllowed(['scene.surface.curvature'],'scene'),false);
  assert.equal(locks.cameraDragAllowed(['*'],'camera'),false);
});
test('camera gesture permissions match the mutated fields',()=>{
  const full=['CameraEast','CameraNorth','Height','Pan','Nick','Roll','FocalLengthField']
    .map(k=>'camera.'+k);
  for(const kind of ['rotate','translate','zoom','dolly','keyboard'])
    assert.equal(locks.cameraGestureAllowed(full,'camera',kind),true);
  assert.equal(locks.cameraGestureAllowed(full,'scene','rotate'),false);
  assert.equal(locks.cameraGestureAllowed(['camera.Pan','camera.Nick'],'camera','translate'),false);
  assert.equal(locks.cameraGestureAllowed(['camera.Pan','camera.Nick'],'camera','zoom'),false);
  assert.equal(locks.cameraGestureAllowed(['camera.Pan','camera.Nick'],'camera','keyboard'),false);
  assert.equal(locks.cameraGestureAllowed(full,'camera','unknown'),false);
});
test('unmapped and experimental paths fail closed',()=>{
  assert.throws(()=>locks.inputIds(['*'],'camera'),/explicit/);
  assert.throws(()=>locks.inputIds(['camera.Unknown'],'camera'),/No safe UI/);
  assert.throws(()=>locks.inputIds(['scene.objects.ObjType'],'scene'),/No safe UI/);
  assert.throws(()=>locks.inputIds([],null),/explicit/);
});
function node(id,tag='INPUT'){
  const attrs={},cl=new Set();
  return {id,tagName:tag,disabled:false,title:'normal',classList:{contains:v=>cl.has(v),add:v=>cl.add(v)},
    setAttribute:(k,v)=>{attrs[k]=v;},getAttribute:k=>attrs[k]??null,
    removeAttribute:k=>{delete attrs[k];},closest(selector){
      if(selector.includes('modern-settings-tab')&&cl.has('modern-settings-tab'))return this;
      if(selector.includes('input,select')&&['INPUT','SELECT','TEXTAREA','BUTTON'].includes(tag))return this;
      if(selector==='canvas'&&tag==='CANVAS')return this;
      return null;
    }};
}
test('lock, event capture, refresh, release preserve originally-disabled controls',()=>{
  const height=node('ModernHeight'),other=node('ModernAtmosphere','SELECT'),
    oldDisabled=node('ModernRadiusKm'),tab=node('ModernSettingsCamera','BUTTON'),
    canvas=node('','CANVAS'),listeners=new Map();
  tab.classList.add('modern-settings-tab');oldDisabled.disabled=true;
  const fields=[height,other,oldDisabled,tab];
  const workspace={querySelectorAll:()=>fields,
    addEventListener:(type,fn)=>listeners.set(type,fn),
    removeEventListener:(type)=>listeners.delete(type)};
  const guard=locks.create(workspace,['camera.Height'],'camera');
  assert.deepEqual(guard.allowedInputs,['ModernHeight']);
  assert.equal(height.disabled,false);
  assert.equal(other.disabled,true);
  assert.equal(tab.disabled,false);
  assert.match(other.title,/Locked by/);
  let blocked=0;
  function event(target,type='click'){
    const e={type,target,cancelable:true,preventDefault(){blocked++;},
      stopImmediatePropagation(){blocked++;}};
    listeners.get(type)(e);
  }
  event(other);assert.equal(blocked,2);
  event(canvas,'wheel');assert.equal(blocked,4);
  event(canvas,'pointerdown');assert.equal(blocked,6); // Height alone cannot rotate.
  event(height);assert.equal(blocked,6);
  other.disabled=false;guard.refresh();assert.equal(other.disabled,true);
  guard.release();
  assert.equal(height.disabled,false);
  assert.equal(other.disabled,false);assert.equal(oldDisabled.disabled,true);
  assert.equal(other.title,'normal');assert.equal(listeners.size,0);
});
test('camera canvas pointer events pass the capture lock, other events do not',()=>{
  const canvas=node('','CANVAS'),other=node('ModernAtmosphere','SELECT');
  const listeners=new Map(),workspace={querySelectorAll:()=>[other],
    addEventListener:(type,fn)=>listeners.set(type,fn),
    removeEventListener:type=>listeners.delete(type)};
  const guard=locks.create(workspace,['camera.Pan','camera.Nick'],'camera');
  assert.equal(guard.allowsCameraDrag,true);
  let stopped=0;
  function event(type,target=canvas,modifier={}){
    listeners.get(type)({type,target,...modifier,cancelable:true,
      preventDefault(){stopped++;},stopImmediatePropagation(){stopped++;}});
  }
  event('pointerdown');event('mousedown');
  assert.equal(stopped,0);
  event('wheel');event('keydown');event('pointerdown',other);
  assert.equal(stopped,6);
  event('pointerdown',canvas,{shiftKey:true});assert.equal(stopped,8);
  guard.release();
  const physical=locks.create(workspace,['scene.surface.curvature'],'scene');
  assert.equal(physical.allowsCameraDrag,false);
  event('pointerdown');assert.equal(stopped,10);
  physical.release();
});
test('full camera contract allows translation, wheel zoom/dolly and canvas keys',()=>{
  const canvas=node('','CANVAS'),listeners=new Map();
  const workspace={querySelectorAll:()=>[],
    addEventListener:(type,fn)=>listeners.set(type,fn),
    removeEventListener:type=>listeners.delete(type)};
  const paths=['CameraEast','CameraNorth','Height','Pan','Nick','Roll','FocalLengthField']
    .map(k=>'camera.'+k);
  const lock=locks.create(workspace,paths,'camera');
  let blocked=0;
  function invoke(type,modifier={}){
    listeners.get(type)({type,target:canvas,...modifier,cancelable:true,
      preventDefault(){blocked++;},stopImmediatePropagation(){blocked++;}});
  }
  invoke('pointerdown',{shiftKey:true});
  invoke('wheel',{shiftKey:true});
  invoke('wheel',{altKey:true});
  invoke('keydown');invoke('keyup');
  assert.equal(blocked,0);
  invoke('wheel');
  assert.equal(blocked,2);
  lock.release();
});

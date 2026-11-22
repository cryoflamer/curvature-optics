'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const contract=require('../src/animation/ModernAnimationContract');
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
  event(height);assert.equal(blocked,4);
  other.disabled=false;guard.refresh();assert.equal(other.disabled,true);
  guard.release();
  assert.equal(height.disabled,false);
  assert.equal(other.disabled,false);assert.equal(oldDisabled.disabled,true);
  assert.equal(other.title,'normal');assert.equal(listeners.size,0);
});

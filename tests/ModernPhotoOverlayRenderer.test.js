'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const registration=require('../src/ui/modern/ModernPhotoOverlayRegistration');
const renderer=require('../src/ui/modern/ModernPhotoOverlayRenderer');
const state=require('../src/ui/modern/ModernExperimentState');
const digest='a'.repeat(64);
const origin={version:1,target:'Scene',resultId:'calibration-result-v1-'+digest,resultDigest:digest,
  photo:{version:1,sha256:'b'.repeat(64),width:1176,height:791},
  baselineCamera:{Height:42.8,FocalLengthField:1996,Pan:.61,Nick:-.29,Roll:-.11,
    CameraEast:-50.75,CameraNorth:-9.42,viewcenterHorizon:3},
  historicalFit:{method:'canvas-direct',status:'stalled',fitCount:14,validationCount:0,
    rmsPx:6.82,weightedRmsPx:6.82,initialRmsPx:314.7555}};
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const calls=[],children=[],observers=[],updates=[];
  const host={appendChild(c){children.push(c);c.parentNode=this;},
    removeChild(c){children.splice(children.indexOf(c),1);c.parentNode=null;}};
  const source={width:810,height:1440,offsetWidth:405,offsetHeight:720,
    offsetLeft:7,offsetTop:11,style:{opacity:'',transform:''},parentNode:host};
  const ctx={setTransform(...args){calls.push(['transform',...args]);},
    clearRect(...args){calls.push(['clear',...args]);},drawImage(...args){calls.push(['draw',...args]);}};
  const env={CurvatureModernPhotoOverlayRegistration:registration,CurvatureModernExperimentState:state,
    document:{createElement(tag){assert.equal(tag,'canvas');return {width:300,height:150,style:{},
      setAttribute(){},getContext(type){assert.equal(type,'2d');return ctx;}};}},
    Image:class {async decode(){this.naturalWidth=1176;this.naturalHeight=791;}},
    ResizeObserver:class {constructor(fn){this.fn=fn;observers.push(this);}observe(node){this.node=node;}disconnect(){this.closed=true;}},
    CurvatureModernCalibrationResultArchive:{async get(db,id){calls.push(['archive',id]);return {record:origin};}},
    CurvatureModernCalibrationResult:{origin(record,target){return {...record,target};}},
    CurvatureModernReferenceImageLibrary:{async findOriginal(db,identity,crypto,verify){
      calls.push(['find',identity]);const record={id:'photo',title:'Original',original:{dataUrl:'data:image/png;base64,test',width:1176,height:791}};
      await verify(record);return {id:record.id,record};}},
    CurvatureModernReferenceImageImport:{async verifyOriginal(record){calls.push(['verify',record.id]);}}};
  const presenter=renderer.create(env,{onChange:s=>updates.push(s)});
  function camera(){
    const {width,height}=source;
    return {screenSize:1,sceneSize:99,zoom:5,pixelTransform:{width,height,contextScale:2,
      scaleX:height,scaleY:-height,offsetX:width/2,offsetY:height/2}};
  }
  const capture=(o=origin,c=camera())=>presenter.capture(o,source,c,9/16);
  return {env,source,host,children,observers,calls,updates,presenter,capture,camera};
}
test('verified original is clipped by an independent transparent noninteractive backing canvas',async()=>{
  const f=fixture();f.capture();
  assert.equal(f.presenter.snapshot().status,'loading');
  assert.equal(f.children.length,0);
  await nextTurn();
  const s=f.presenter.snapshot();assert.equal(s.status,'ready');
  assert.equal(s.resultId,origin.resultId);assert.deepEqual(s.reference,{id:'photo',title:'Original'});
  const layer=f.children[0];assert.equal(f.children.length,1);
  assert.equal(layer.width,810);assert.equal(layer.height,1440);
  assert.equal(layer.style.width,'405px');assert.equal(layer.style.height,'720px');
  assert.equal(layer.style.left,'7px');assert.equal(layer.style.top,'11px');
  assert.equal(layer.style.pointerEvents,'none');assert.equal(layer.style.opacity,'0.5');
  assert.equal(layer.style.background,'transparent');assert.deepEqual(f.source.style,{opacity:'',transform:''});
  assert.deepEqual(f.calls.filter(x=>['archive','find','verify'].includes(x[0])).map(x=>x[0]),['archive','find','verify']);
  const draw=f.calls.find(x=>x[0]==='draw');
  assert.equal(draw[1].src,'data:image/png;base64,test');
  const r=s.layout.rect;assert.ok(r.x<0&&r.width>810);
  assert.deepEqual(draw.slice(2),[r.x,r.y,r.width,r.height]);
  assert.equal(s.layout.clip.width,810);
  f.presenter.clear();assert.equal(f.children.length,0);assert.equal(f.observers[0].closed,true);
  assert.equal(f.presenter.snapshot().status,'inactive');
});
test('resize remaps the baseline without loading again and hides stale backing pixels',async()=>{
  const f=fixture();f.capture();await nextTurn();const old=f.presenter.snapshot();
  f.source.width*=2;f.source.height*=2;
  f.observers[0].fn();assert.equal(f.children[0].style.display,'none');
  f.capture(origin,{...f.camera(),sceneSize:123456,zoom:100});
  const s=f.presenter.snapshot();assert.equal(s.status,'ready');assert.equal(f.children[0].style.display,'');
  for(const k of ['x','y','width','height'])assert.equal(s.layout.rect[k],2*old.layout.rect[k]);
  assert.equal(f.calls.filter(c=>c[0]==='archive').length,1);
  f.capture(origin,null);assert.equal(f.children.length,0);assert.equal(f.presenter.snapshot().status,'layout-unavailable');
  f.capture();assert.equal(f.presenter.snapshot().status,'ready');
  assert.equal(f.calls.filter(c=>c[0]==='archive').length,1);
});
test('missing archive and missing original never draw a substitute',async()=>{
  for(const target of ['archive','photo']){
    const f=fixture();
    if(target==='archive')f.env.CurvatureModernCalibrationResultArchive.get=async()=>null;
    else f.env.CurvatureModernReferenceImageLibrary.findOriginal=async()=>null;
    f.capture();await nextTurn();assert.equal(f.presenter.snapshot().status,'unavailable');
    assert.match(f.presenter.snapshot().error,/unavailable/);assert.equal(f.children.length,0);
    assert.equal(f.calls.some(c=>c[0]==='draw'),false);
  }
});
test('origin mismatch and non-Scene association are not accepted',async()=>{
  const f=fixture();f.capture({...origin,baselineCamera:{...origin.baselineCamera,FocalLengthField:900}});
  await nextTurn();assert.match(f.presenter.snapshot().error,/does not match/);
  assert.equal(f.calls.some(c=>c[0]==='find'),false);assert.equal(f.children.length,0);
  f.capture({...origin,target:'A'});assert.equal(f.presenter.snapshot().status,'inactive');
});
test('late archive or image decode cannot repaint a cleared or replaced association',async()=>{
  const f=fixture();let release;
  f.env.CurvatureModernCalibrationResultArchive.get=()=>new Promise(resolve=>{release=resolve;});
  f.capture();f.presenter.clear();release({record:origin});await nextTurn();
  assert.equal(f.presenter.snapshot().status,'inactive');assert.equal(f.children.length,0);
  assert.equal(f.calls.some(c=>c[0]==='find'),false);
  f.env.CurvatureModernCalibrationResultArchive.get=async()=>({record:origin});
  f.env.Image=class {decode(){return new Promise(resolve=>{release=()=>{
    this.naturalWidth=1176;this.naturalHeight=791;resolve();};});}};
  f.capture();await nextTurn();f.presenter.clear();release();await nextTurn();
  assert.equal(f.children.length,0);assert.equal(f.presenter.snapshot().status,'inactive');
});

test('three display modes and opacity change only presentation and never repaint the source',async()=>{
  const f=fixture();f.capture();await nextTurn();
  const layer=f.children[0],before=f.calls.slice(),layout=f.presenter.snapshot().layout;
  f.presenter.setOpacity(23);
  assert.equal(layer.style.opacity,'0.23');
  f.presenter.setMode('scene');
  assert.equal(layer.style.display,'none');
  assert.equal(f.presenter.snapshot().effectiveMode,'scene');
  f.observers[0].fn();assert.equal(layer.style.display,'none');
  f.presenter.setMode('photo');
  assert.equal(layer.style.display,'');assert.equal(layer.style.background,'#fff');
  assert.equal(layer.style.opacity,'1');
  assert.equal(f.presenter.snapshot().effectiveMode,'photo');
  f.presenter.setOpacity(0);assert.equal(layer.style.opacity,'1');
  f.presenter.setMode('overlay');
  assert.equal(layer.style.background,'transparent');assert.equal(layer.style.opacity,'0');
  f.presenter.setOpacity(100);assert.equal(layer.style.opacity,'1');
  assert.deepEqual(f.calls,before);
  assert.deepEqual(f.presenter.snapshot().layout,layout);
  assert.deepEqual(f.source.style,{opacity:'',transform:''});
  assert.equal(f.updates.at(-1).opacity,100);
  for(const n of [-1,101,1.5,NaN,'20'])assert.throws(()=>f.presenter.setOpacity(n),/opacity/);
  assert.throws(()=>f.presenter.setMode('bad'),/mode/);
});
test('Photo only falls back to Scene while loading, unavailable, or backing pixels are stale',async()=>{
  const f=fixture();f.presenter.setMode('photo');f.capture();
  assert.equal(f.presenter.snapshot().effectiveMode,'scene');
  assert.equal(f.updates.at(-1).status,'loading');
  await nextTurn();
  assert.equal(f.updates.at(-1).effectiveMode,'photo');
  f.source.width*=2;f.source.height*=2;f.observers[0].fn();
  assert.equal(f.presenter.snapshot().available,false);
  assert.equal(f.updates.at(-1).effectiveMode,'scene');
  f.presenter.setOpacity(50);assert.equal(f.children[0].style.display,'none');
  f.capture();assert.equal(f.presenter.snapshot().effectiveMode,'photo');
  f.presenter.clear();
  assert.equal(f.updates.at(-1).effectiveMode,'scene');assert.equal(f.children.length,0);
  f.env.CurvatureModernCalibrationResultArchive.get=async()=>null;
  f.capture();await nextTurn();
  assert.equal(f.updates.at(-1).status,'unavailable');
  assert.equal(f.updates.at(-1).effectiveMode,'scene');
  assert.equal(f.updates.at(-1).available,false);
});

test('unchanged completed viewport reuses the same photo raster through physical and motion frames',async()=>{
  const f=fixture();f.capture();await nextTurn();
  const layer=f.children[0],layout=f.presenter.snapshot().layout,before=f.calls.slice();
  for(const fields of [{sceneSize:1,zoom:2},{sceneSize:500,zoom:9,pos:[1,2,3]},
    {center:[1,0,2],up:[0,1,0],objectZExtend:4}]){
    f.capture(origin,{...f.camera(),...fields});
    assert.equal(f.children[0],layer);
    assert.equal(f.presenter.snapshot().layout,layout);
  }
  assert.deepEqual(f.calls,before);
  // Layout change even with identical backing-store size is not ignored.
  const changed=f.camera();changed.pixelTransform.offsetX+=6;
  f.capture(origin,changed);
  assert.equal(f.presenter.snapshot().layout.rect.x,layout.rect.x+6);
  assert.equal(f.calls.filter(c=>c[0]==='archive').length,1);
  assert.equal(f.calls.filter(c=>c[0]==='draw').length,2);
});
test('queued resize from a detached generation cannot invalidate the new photo layer',async()=>{
  const f=fixture();f.capture();await nextTurn();
  const old=f.observers[0];f.presenter.clear();f.capture();await nextTurn();
  const newLayer=f.children[0],updates=f.updates.length;
  old.fn();
  assert.equal(f.updates.length,updates);
  assert.equal(f.children[0],newLayer);
  assert.equal(f.presenter.snapshot().available,true);
  f.presenter.clear();const count=f.updates.length;f.presenter.clear();
  assert.equal(f.updates.length,count);
});

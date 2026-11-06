'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const codec=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const pairAdapter=require('../src/ui/modern/ModernCompareModel');
const source=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function model(){
  return {Height:15,FocalLengthField:2000,Pan:.0464,Nick:.0121,Roll:0,
    viewcenterHorizon:3,deviceRatio:1.5,showModel:1,rEarth:6371000,
    showGrid:1,DemoText:'Tower test',Description:'Two independent atmospheres',
    ObjType:[3,3],NObjects:[85,2],ObjDist:[50,25550],ObjDeltaDist:[297.55,373],
    ObjSideType:[0,0],ObjSidePos:[35,25.4],ObjSideVar:[0,0],
    ObjSizeType:[0,0],ObjSize:[23,64],ObjSizeVar:[0,0],
    Update(){this.updated=(this.updated||0)+1;}};
}
function experiment(){
  const m=model();
  const physics=compare.preset('flat-inverse');
  return codec.capture(m,{atmosphere:'standard',occlusionRadius:6371000,
    preset:'custom',resetPreset:'pontchartrain'},physics,
    {mode:'compare',eyeLevel:true,horizon:true,selected:'B'});
}
test('134: versioned experiment encodes and decodes all shared Scene and independent Compare inputs',()=>{
  const e=experiment();
  e.scene.camera.Height=22.701;
  e.scene.objects.ObjDist[1]=30999.125;
  e.compare.B.occlusionRadius=9876543;
  e.compare.B.radiusKm=1e6;
  e.compare.A.atmosphere='vacuum';
  const token=codec.encode(e);
  assert.match(token,/^[A-Za-z0-9_-]+$/);
  assert.deepEqual(codec.decode(token),e);
  const url=codec.urlWithExperiment('https://example.org/demo/CurvatureModern.html?ui=modern&state=legacy&tab=View#App',e);
  assert.match(url,/CurvatureModern\.html\?ui=modern/);
  const parsed=new URL(url);
  assert.equal(parsed.searchParams.has('state'),false);
  assert.equal(parsed.searchParams.get('tab'),'View');
  assert.equal(parsed.hash,'#App');
  assert.deepEqual(codec.readUrl(parsed.search),e);
  assert.equal(codec.readUrl('?ui=modern&state=legacy'),null,'Legacy state is not a Modern experiment');
});
test('134: corrupted, unsupported and dangerous payloads fail before model mutation',()=>{
  const valid=experiment();
  for(const mutate of [
    e=>e.version=2,
    e=>e.scene.camera.Height='0',
    e=>e.scene.camera.Nick=999,
    e=>e.scene.objects.NObjects=[2,2.5],
    e=>e.scene.objects.ObjDist.push(3),
    e=>e.scene.objects.__proto__={},
    e=>e.compare.B.surface='triangular',
    e=>e.compare.B.occlusionRadius=0,
    e=>e.compare.selected='C',
    e=>e.display.eyeLevel=1,
    e=>e.scene.surface.showModel=3,
    e=>e.scene.preset='fake',
    e=>e.scene.camera.__proto__={bad:true}
  ]){
    const data=JSON.parse(JSON.stringify(valid));
    mutate(data);
    if(Object.keys(data.scene.camera).includes('bad'))assert.throws(()=>codec.validate(data));
    else if(Object.keys(data.scene.objects).includes('bad'))assert.throws(()=>codec.validate(data));
    else if(JSON.stringify(data)!==JSON.stringify(valid))assert.throws(()=>codec.validate(data));
  }
  assert.throws(()=>codec.decode('@bad!'));
  assert.throws(()=>codec.decode('A'.repeat(16001)));
  assert.throws(()=>codec.readUrl('?experiment=a&experiment=b'));
});
test('134: regenerated share link is independent of the receiver local store',()=>{
  const e=experiment();
  const url=codec.urlWithExperiment('file:///tmp/CurvatureApp.html?ui=modern',e);
  assert.deepEqual(codec.readUrl(new URL(url).search),e);
  const other=experiment();other.compare.B.atmosphere='vacuum';
  assert.notDeepEqual(codec.readUrl(new URL(url).search),other);
});
test('134: browser integration restores URL over local state and keeps arriving link unchanged',()=>{
  const original=experiment();
  const local=experiment();local.compare.A.atmosphere='vacuum';
  const url=codec.urlWithExperiment('https://example.org/CurvatureApp.html?ui=modern',original);
  const harness=boot(url,JSON.stringify(local));
  assert.equal(harness.app.getMode(),'compare');
  assert.equal(harness.app.getCompareConfig().A.atmosphere,'standard');
  assert.equal(harness.app.getCompareConfig().B.atmosphere,'inverse-spherical');
  assert.equal(harness.app.getModel().Height,15);
  assert.equal(harness.location.href,url,'an explicit incoming link must not be rewritten');
  harness.nodes.get('ModernModelTabB').listeners.click();
  harness.nodes.get('ModernModelAtmosphere').value='vacuum';
  harness.nodes.get('ModernModelAtmosphere').listeners.change();
  assert.equal(harness.app.getCompareConfig().B.atmosphere,'vacuum');
  assert.equal(harness.location.href,url,'editing a shared link must not silently replace it');
  assert.equal(harness.storage.get(codec.STORAGE_KEY).includes('"vacuum"'),true);
  harness.nodes.get('ModernCopyExperiment').listeners.click();
  const copied=codec.readUrl(new URL(harness.copied[0]).search);
  assert.equal(copied.compare.B.atmosphere,'vacuum');
  assert.equal(original.compare.B.atmosphere,'inverse-spherical');
});
test('134: local restore, URL auto-sync after edit and reset preserve Modern experiment namespace',()=>{
  const saved=experiment();saved.scene.camera.Height=40;saved.display.mode='scene';
  const h=boot('https://example.org/CurvatureApp.html?ui=modern',JSON.stringify(saved));
  assert.equal(h.app.getModel().Height,40);
  h.nodes.get('ModernCompareTab').listeners.click();
  assert.equal(h.app.getMode(),'compare');
  assert.ok(h.location.href.includes('experiment='));
  assert.equal(codec.readUrl(new URL(h.location.href).search).display.mode,'compare');
  h.nodes.get('ModernResetExperiment').listeners.click();
  assert.equal(h.storage.has(codec.STORAGE_KEY),false);
  assert.equal(h.assigned.length,1);
  assert.equal(new URL(h.assigned[0]).searchParams.has('experiment'),false);
  assert.match(source('CurvatureApp.html'),/ModernRoute.js/);
  assert.match(source('src/app/CurvatureStatePersistence.js'),/GetUrlStr\( 'state' \)/);
});
test('134: malformed explicit URL must not fall back to unrelated saved experiment',()=>{
  const h=boot('https://example.org/CurvatureApp.html?ui=modern&experiment=not-valid!',JSON.stringify(experiment()));
  assert.equal(h.app.getMode(),'scene');
  assert.equal(h.app.getModel().Height,15);
  assert.match(h.nodes.get('ModernPersistenceStatus').textContent,/not restored/);
});
function boot(href,saved){
  const names=['ModernStatus','ModernCurvatureLabel','ModernViewInfo','ModernModePill',
    'ModernOcclusionWrap','ModernSceneTab','ModernCompareTab','ModernCompareMessage',
    'ModernGraphHost','ModernCompareViews','ModernBackToScene','ModernHeight','ModernFocal',
    'ModernPan','ModernNick','ModernOcclusion','ModernCameraAim','ModernAtmosphere',
    'ModernGrid','ModernCurvature','ModernEarth','ModernRender','ModernRoll','ModernViewAngle',
    'ModernRadiusKm','ModernFlat','ModernPreset','ModernResetPreset','ModernObjectFields0',
    'ModernObjectFields1','ModernSceneTitle','ModernSceneDescription','ModernCompareLabelA',
    'ModernCompareLabelB','ModernCompareStatusA','ModernCompareStatusB',
    'ModernSceneSettings','ModernCompareSettings','ModernPairPreset','ModernModelTabA',
    'ModernModelTabB','ModernModelCurvature','ModernModelCurvatureLabel','ModernModelFlat','ModernModelEarth','ModernModelRadius','ModernModelAtmosphere',
    'ModernModelOcclusionWrap','ModernModelOcclusion','ModernRecalculateCompare',
    'ModernCompareEyeLevel','ModernCompareHorizon','ModernCopyExperiment','ModernResetExperiment',
    'ModernPersistenceStatus','ModernHorizonStatusA','ModernHorizonStatusB'];
  const nodes=new Map(names.map(id=>[id,{id,value:'',min:'',max:'',checked:true,hidden:false,
    textContent:'',listeners:{},classList:{toggle(){}},addEventListener(type,fn){this.listeners[type]=fn;},
    setAttribute(){},closest(){return {set hidden(value){this.value=value;}};}}]));
  nodes.get('ModernPreset').value='pontchartrain';
  const storage=new Map(saved?[[codec.STORAGE_KEY,saved]]:[]);
  const copied=[],assigned=[],location={href,search:new URL(href).search,assign(url){assigned.push(url);}};
  const history={state:null,replaceState(_,__,url){location.href=url;location.search=new URL(url).search;}};
  const callbacks=[];
  function Model(){Object.assign(this,model());}
  const root={CurveAppClass:Model,CurvatureModernSceneState:null,
    CurvatureModernCompareModel:pairAdapter,CurvatureModernCompareState:compare,
    CurvatureModernExperimentState:codec,
    CurvaturePhysicalSceneOptics:{create(){return {}; }},
    CurvatureMainCanvasRenderer:{renderPhysical(){return {drawn:10,fillTriangles:5,unresolved:0};}},
    CurvaturePhysicalCurvature:{modelStep(){return 164;},label(){return 'Earth';}},
    NewGraphX3D(params){return {Redraw(){params.DrawFunc({id:'scene'});}};},
    xOnLoad(fn){callbacks.push(fn);},console:{error(...e){throw new Error(e.map(String).join(' | '));}},
    location,history,navigator:{clipboard:{writeText(text){copied.push(text);return Promise.resolve();}}},
    localStorage:{getItem(k){return storage.get(k)||null;},setItem(k,v){storage.set(k,v);},removeItem(k){storage.delete(k);}}};
  root.window=root;
  const ctx={window:root,document:{getElementById(id){assert.ok(nodes.has(id),'missing '+id);return nodes.get(id);}},
    URL,URLSearchParams,requestAnimationFrame(fn){fn();return 1;},cancelAnimationFrame(){},
    setTimeout(fn){fn();return 1;},clearTimeout(){},console};
  vm.runInNewContext(source('src/ui/modern/ModernApp.js'),ctx);
  const app=root.CurvatureModernApp;
  for(const side of ['A','B'])app.registerCompareGraph(side,{UpdateCanvasSize(){},
    Redraw(){app.drawCompare(side,{id:side,Canvas:{width:800,height:500,
      getContext(){return {save(){},restore(){},setTransform(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(){}};}}});}});
  callbacks[0]();
  return {nodes,storage,location,assigned,copied,app};
}
test('140.12.9: GPU Compare mode and target count survive share URL and old links remain valid',()=>{
  const e=experiment();
  e.display.gpuProbe=true;
  e.display.probeTargets=1024;
  const url=codec.urlWithExperiment('https://example.org/CurvatureModern.html?ui=modern',e);
  assert.deepEqual(codec.readUrl(new URL(url).search),e);
  assert.equal(codec.readUrl(new URL(url).search).display.gpuProbe,true);
  assert.equal(codec.readUrl(new URL(url).search).display.probeTargets,1024);
  const legacy=JSON.parse(JSON.stringify(e));
  delete legacy.display.gpuProbe;
  delete legacy.display.probeTargets;
  assert.deepEqual(codec.validate(legacy).display,{mode:'compare',eyeLevel:true,horizon:true,
    gpuProbe:false,probeTargets:256,showTemperatureProfile:false,temperaturePlacement:'outside-right'});
  for(const invalid of [0,64,2048,'1024',null]){
    const candidate=JSON.parse(JSON.stringify(e));candidate.display.probeTargets=invalid;
    assert.throws(()=>codec.validate(candidate));
  }
});

test('Shared Compare atmospheric visibility survives URLs, JSON and A/B legacy migration',()=>{
  const saved=experiment();
  saved.scene.visibility={enabled:true,rangeKm:55};
  saved.compare.A.visibility={enabled:true,rangeKm:17};
  saved.compare.B.visibility={enabled:false,rangeKm:90};
  const encoded=codec.encode(saved);
  const shared=JSON.parse(JSON.stringify(saved));
  shared.compare.B.visibility={enabled:true,rangeKm:17};
  assert.deepEqual(codec.decode(encoded),shared);
  assert.deepEqual(codec.readUrl(new URL(codec.urlWithExperiment(
    'https://example.org/CurvatureModern.html',saved)).search),shared);
  const old=experiment();
  delete old.scene.visibility;
  delete old.compare.A.visibility;
  delete old.compare.B.visibility;
  const migrated=codec.validate(old);
  assert.deepEqual(migrated.scene.visibility,{enabled:false,rangeKm:60});
  assert.deepEqual(migrated.compare.A.visibility,{enabled:false,rangeKm:60});
  assert.deepEqual(migrated.compare.B.visibility,{enabled:false,rangeKm:60});
  for(const invalid of [0,501,NaN,'25']){
    const bad=JSON.parse(JSON.stringify(saved));bad.scene.visibility.rangeKm=invalid;
    assert.throws(()=>codec.validate(bad));
  }
});

test('Compare haze edits synchronize A/B without changing independent optics or Scene values',()=>{
  const source=experiment();
  source.scene.visibility={enabled:true,rangeKm:91};
  const originalA={...source.compare.A},originalB={...source.compare.B};
  const migrated=codec.validate(source);
  const updated=compare.update(migrated.compare,'B','visibility',{enabled:true,rangeKm:27});
  assert.deepEqual(updated.A.visibility,{enabled:true,rangeKm:27});
  assert.deepEqual(updated.B.visibility,{enabled:true,rangeKm:27});
  assert.notStrictEqual(updated.A.visibility,updated.B.visibility,'separate copies prevent accidental side effects');
  assert.equal(updated.A.surface,originalA.surface);
  assert.equal(updated.B.surface,originalB.surface);
  assert.equal(updated.A.atmosphere,originalA.atmosphere);
  assert.equal(updated.B.atmosphere,originalB.atmosphere);
  const saved=codec.validate({...migrated,compare:{...updated,selected:'B'}});
  assert.deepEqual(saved.scene.visibility,{enabled:true,rangeKm:91});
  assert.deepEqual(saved.compare.A.visibility,{enabled:true,rangeKm:27});
  assert.deepEqual(saved.compare.B.visibility,{enabled:true,rangeKm:27});
  const restored=codec.decode(codec.encode(saved));
  assert.deepEqual(restored,saved);
});

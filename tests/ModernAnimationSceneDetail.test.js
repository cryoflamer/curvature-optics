'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const lod=require('../src/optics/OpticalPreviewLod');
const preview=require('../src/animation/ModernAnimationPreview');
const codec=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const prefs=require('../src/ui/modern/ModernApplicationPreferences');
const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
function snapshot(){
  return codec.capture({Height:15,FocalLengthField:1000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:0,DemoText:'Bank',Description:'',
    ObjType:[3,3],NObjects:[85,2],ObjDist:[50,25550],ObjDeltaDist:[300,373],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]},
  {atmosphere:'standard',occlusionRadius:6371000,preset:'pontchartrain',resetPreset:'pontchartrain'},
  compare.preset('globe-flat-vacuum'),{mode:'scene',eyeLevel:false,horizon:false,selected:'A'});
}
test('Scene detail modes map to the shared stable LOD policy and reject unknown values',()=>{
  assert.equal(lod.sceneDetailStride('full'),1);
  assert.equal(lod.sceneDetailStride('balanced'),2);
  assert.equal(lod.sceneDetailStride('performance'),4);
  assert.throws(()=>lod.sceneDetailStride('auto'),/Invalid animation Scene detail/);
  assert.throws(()=>lod.sceneDetailStride('__proto__'),/Invalid animation Scene detail/);
});
test('Fast Scene/Compare uses chosen object detail without changing experiment or optics',()=>{
  const source=snapshot(),before=structuredClone(source),calls=[];
  class FakeModel {Update(){}}
  const view=preview.create({Model:FakeModel,renderer:{renderPhysical(graph,model,options){
    calls.push({quality:options.opticalQuality,stride:options.previewLod.stride,
      objects:model.NObjects.slice(),showModel:model.showModel});return {previewLod:{original:87,selected:87}};
  }}});
  for(const [detail,stride] of [['full',1],['balanced',2],['performance',4]]){
    const a=view.build(source,'A',{quality:'fast',animationMode:'camera',sceneDetail:detail});
    assert.equal(a.quality,'fast');assert.equal(a.options.previewLod.stride,stride);
    const b=view.build(source,'B',{quality:'fast',animationMode:'camera',sceneDetail:detail});
    assert.equal(b.options.previewLod.stride,stride);
    view.render(source,'A',{Canvas:{}},{quality:'fast',sceneDetail:detail});
  }
  assert.deepEqual(calls.map(c=>c.stride),[1,2,4]);
  assert.ok(calls.every(c=>c.quality==='fast'&&c.objects.join(',')==='85,2'));
  assert.deepEqual(source,before);
  assert.equal(view.build(source,'A',{quality:'auto',animationMode:'camera'}).options.previewLod.stride,4,
    'older callers retain the original Fast default');
  assert.equal(view.build(source,'A',{quality:'fast',sceneDetail:'full'}).options.previewLod.stride,1);
  assert.equal(view.build(source,'A',{quality:'accurate',sceneDetail:'performance'}).options.previewLod.stride,1);
  assert.equal(view.build(source,'A',{quality:'auto',animationMode:'physical',sceneDetail:'balanced'}).options.previewLod.stride,1);
  assert.throws(()=>view.build(source,'A',{quality:'fast',sceneDetail:'invalid'}),/Invalid animation Scene detail/);
});
test('All modes preserve non-tower objects; Full preserves the complete authored order',()=>{
  const placed=[];
  for(let i=0;i<85;i++)placed.push({id:i,name:'bank',distance:i,
    primitives:[{metadata:{objectBank:0}}]});
  for(let i=0;i<2;i++)placed.push({id:100+i,name:'second',distance:100+i,
    primitives:[{metadata:{objectBank:1}}]});
  const mountain={id:800,name:'mountain',distance:900,primitives:[{metadata:{objectBank:2}}]};
  const unknown={id:'one',name:'custom',distance:1000,primitives:[{}]};
  placed.push(mountain,unknown);
  const types={ObjType:[3,3,1]};
  const full=lod.thin(placed,types,lod.sceneDetailStride('full'));
  assert.equal(full.original,89);assert.equal(full.selected,89);
  assert.strictEqual(full.objects,placed,'Full cannot rebuild or drop modeled objects');
  for(const mode of ['balanced','performance']){
    const subset=lod.thin(placed,types,lod.sceneDetailStride(mode));
    assert.ok(subset.selected<89);
    assert.ok(subset.objects.includes(mountain));assert.ok(subset.objects.includes(unknown));
    assert.deepEqual(subset.objects,placed.filter(x=>subset.objects.includes(x)),
      'shared LOD keeps original painter order');
  }
});
test('Scene detail is a browser preference, not an animation project field',()=>{
  const entries=new Map(),storage={getItem:k=>entries.get(k)||null,
    setItem:(k,v)=>entries.set(k,v)};
  assert.equal(prefs.read(storage).studioPlaybackDetail,'performance');
  prefs.write(storage,{studioPlaybackDetail:'full'});
  assert.equal(prefs.read(storage).studioPlaybackDetail,'full');
  prefs.write(storage,{studioPlaybackDetail:'balanced'});
  assert.equal(prefs.read(storage).studioPlaybackDetail,'balanced');
  assert.equal(prefs.normalize({studioPlaybackDetail:'bogus'}).studioPlaybackDetail,'performance');
  assert.match(html,/id="ModernAnimationPlaybackDetail"/);
  assert.match(app,/sceneDetail:studioPlaybackDetail/);
  assert.match(app,/studioPlaybackDetail=remembered.studioPlaybackDetail/);
  assert.doesNotMatch(app,/studioDraft\.sceneDetail\s*=/);
  assert.doesNotMatch(app,/studioPrepared\.sceneDetail\s*=/);
});
test('Playback Scene detail selector repaints the current frame without editing the project',()=>{
  const events={};
  function node(id){return {value:'',addEventListener:(type,fn)=>{events[id+':'+type]=fn;}};}
  const detail=node('ModernAnimationPlaybackDetail');
  const optics=node('ModernAnimationPlaybackOptics');
  let saves=0,stops=0,paints=0,draftSaves=0;
  const context=vm.createContext({
    studioPlaybackDetail:'performance',studioPlaybackQuality:'auto',studioPlayback:{},
    studioPlaybackLastPaint:0,bindStudioBenchmark(){},
    newUiEl:id=>({ModernAnimationPlaybackDetail:detail,ModernAnimationPlaybackOptics:optics}[id]||null),
    saveApplicationPreferences(){saves++;},saveStudioDraft(){draftSaves++;},
    stopStudioPlayback(clear){assert.equal(clear,false);stops++;},
    renderStudioPlaybackSample(force){assert.equal(force,true);paints++;},
    syncStudioPlaybackControls(){},renderStudioLibrary(){},studioPreviewRenderer:null,
    root:{}
  });
  const start=app.indexOf('  function bindStudioPlayback(){');
  const end=app.indexOf('  function animationPickerAllEntries(',start);
  assert.ok(start>0&&end>start);
  vm.runInContext(app.slice(start,end)+'\nthis.bind=bindStudioPlayback;',context);
  context.bind();
  assert.equal(detail.value,'performance');
  detail.value='full';events['ModernAnimationPlaybackDetail:change']();
  assert.equal(context.studioPlaybackDetail,'full');
  assert.equal(saves,1);assert.equal(stops,1);assert.equal(paints,1);
  assert.equal(draftSaves,0,'Preview detail must never alter the animation project');
  detail.value='balanced';events['ModernAnimationPlaybackDetail:change']();
  assert.equal(context.studioPlaybackDetail,'balanced');
  assert.equal(paints,2);
  context.studioPlayback=null;
  detail.value='performance';events['ModernAnimationPlaybackDetail:change']();
  assert.equal(saves,3);assert.equal(paints,2,'no Playback means no rendering');
});

test('Classic browser modules share scene-detail LOD without a CommonJS require',()=>{
  const browser=vm.createContext({CurvatureModernExperimentState:codec,
    CurvatureRayHorizon:{},CurvaturePhysicalCamera:{},
    CurvatureOpticalFastRayField:{supportsAtmosphere:()=>true}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/optics/OpticalPreviewLod.js'),'utf8'),browser);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/animation/ModernAnimationPreview.js'),'utf8'),browser);
  assert.equal(typeof browser.CurvatureModernAnimationPreview.create,'function');
  assert.equal(browser.CurvatureOpticalPreviewLod.sceneDetailStride('full'),1);
  class FakeModel {Update(){}}
  const view=browser.CurvatureModernAnimationPreview.create({Model:FakeModel,
    renderer:{renderPhysical:()=>({})}});
  assert.equal(view.build(snapshot(),'A',{quality:'fast',sceneDetail:'full'}).options.previewLod.stride,1);
  assert.match(html,/src="src\/optics\/OpticalPreviewLod\.js[^"\n]*animation-detail=1/);
  assert.ok(html.indexOf('src/optics/OpticalPreviewLod.js')<html.indexOf('src/animation/ModernAnimationPreview.js'));
});

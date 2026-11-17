'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const adapter=require('../src/ui/modern/ModernSceneState');
const curvature=require('../src/app/CurvaturePhysicalCurvature');
const vec={Norm:a=>{const l=Math.hypot(...a);return a.map(v=>v/l);},
  Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  Scale:(a,s)=>a.map(v=>v*s),Add:(a,b)=>a.map((v,i)=>v+b[i]),
  ScalarProd:(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0)};
function model(){
  const context=vm.createContext({JsgVect3:vec});
  vm.runInContext(read('src/app/CurvatureModel.js'),context);
  return vm.runInContext('new CurveAppClass()',context);
}
test('131 pure state adapter uses exact one model and validates before mutation',()=>{
  const m=model();
  adapter.applyPreset(m,'pontchartrain');m.Update();
  assert.deepEqual(Array.from(m.NObjects),[85,2]);
  assert.deepEqual(Array.from(m.ObjDist),[50,25550]);
  adapter.setCamera(m,'FocalLengthField','2000');m.Update();
  const fov=m.ViewAngle;
  adapter.setCamera(m,'ViewAngleField','2');m.Update();
  assert.ok(Math.abs(m.ViewAngle-2)<1e-9,'FOV edits must beat the preceding focal input');
  assert.notEqual(m.ViewAngle,fov);
  adapter.setCamera(m,'Roll','-17.5');
  assert.equal(m.Roll,-17.5);
  adapter.setRadiusKm(m,'6000370');m.Update();
  assert.equal(m.rEarth,6000370000);
  assert.equal(m.showModel,1);
  curvature.applyStep(m,1000);m.Update();
  assert.equal(m.showModel,2);
  assert.equal(curvature.modelStep(m),1000);
  adapter.setRadiusKm(m,'6371');m.Update();
  assert.equal(m.showModel,1);
  assert.equal(m.rEarth,6371000);
  const before=m.ObjDist[1];
  assert.throws(()=>adapter.setObject(m,1,'ObjDist','Infinity'),/Expected/);
  assert.equal(m.ObjDist[1],before);
  assert.throws(()=>adapter.setObject(m,1,'NObjects','1.5'),/integer/);
  adapter.setObject(m,1,'ObjType',4);assert.equal(m.ObjType[1],4);
  assert.throws(()=>adapter.setObject(m,1,'ObjType',7),/Expected/);
  assert.throws(()=>adapter.setCamera(m,'Height',''),/required/);
  assert.throws(()=>adapter.setRadiusKm(m,0),/Expected/);
  assert.throws(()=>adapter.setCamera(m,'foo',1),/Unknown/);
  adapter.setObject(m,1,'ObjType','2');assert.equal(m.ObjType[1],2);
  adapter.setObject(m,0,'ObjSidePos','-35');assert.equal(m.ObjSidePos[0],-35);
});

test('131 presets reset every relevant object group field without duplicating Legacy state',()=>{
  const m=model();
  for(const id of ['pontchartrain','single','rows','bedford','chicago','chicago-near','canigou','canigou-low']){
    const p=adapter.applyPreset(m,id);m.Update();
    assert.equal(m.DemoText,p.name);
    assert.equal(m.Description,p.description);
    assert.equal(m.viewcenterHorizon,3);
    assert.equal(m.showModel,1);
    assert.equal(m.rEarth,6371000);
    assert.equal(m.NObjects[0],p.objects.NObjects[0]);
    assert.equal(m.NObjects[1],p.objects.NObjects[1]);
    assert.deepEqual(Array.from(m.ObjSideType),id.startsWith('chicago')||id.startsWith('canigou')?[2,0]:[0,0]);
  }
  adapter.setObject(m,1,'ObjSideVar',350);
  adapter.setObject(m,0,'ObjSizeVar',0.8);
  adapter.applyPreset(m,'single');m.Update();
  assert.deepEqual(Array.from(m.ObjSideVar),[0,0]);
  assert.deepEqual(Array.from(m.ObjSizeVar),[0,0]);
  assert.deepEqual(Array.from(m.NObjects),[1,0]);
  assert.throws(()=>adapter.applyPreset(m,'missing'),/Unknown/);
});

test('140.12.88 Pontchartrain caption follows first group count without modifying unrelated captions',()=>{
  const m=model();
  adapter.applyPreset(m,'pontchartrain');
  assert.equal(adapter.refreshDescription(m),'85 transmission towers across Lake Pontchartrain');
  adapter.setObject(m,0,'NObjects',200);
  assert.equal(adapter.refreshDescription(m),'200 transmission towers across Lake Pontchartrain');
  adapter.setObject(m,1,'NObjects',0);
  assert.equal(adapter.refreshDescription(m),'200 transmission towers across Lake Pontchartrain');
  adapter.setObject(m,0,'ObjType',2);
  assert.equal(adapter.refreshDescription(m),'200 ships across Lake Pontchartrain');
  m.Description='Custom annotated scene';
  adapter.setObject(m,0,'NObjects',12);
  assert.equal(adapter.refreshDescription(m),'Custom annotated scene');
  adapter.applyPreset(m,'rows');
  adapter.setObject(m,0,'NObjects',44);
  assert.equal(adapter.refreshDescription(m),'Illustrative near and distant rows for perspective study');
});

test('140.12.88 Scene and Compare caption updates on object edits and preset reset',async()=>{
  const r=buildRuntime(),m=r.win.CurvatureModernApp.getModel();
  const caption=()=>r.nodes.get('ModernSceneDescription').textContent;
  assert.equal(caption(),'85 transmission towers across Lake Pontchartrain');
  r.fire('ModernObject0NObjects','change','200');
  assert.equal(m.NObjects[0],200);
  assert.equal(caption(),'200 transmission towers across Lake Pontchartrain');
  assert.equal(m.Description,caption(),'canvas decorations and Compare copy read the same model description');
  r.fire('ModernObject1NObjects','change','0');
  assert.equal(caption(),'200 transmission towers across Lake Pontchartrain');
  await r.fire('ModernResetPreset','click');
  assert.equal(caption(),'85 transmission towers across Lake Pontchartrain');
});

test('Objects group summaries reflect validated edits and preset restoration without affecting Compare physics',async()=>{
  const r=buildRuntime(),m=r.win.CurvatureModernApp.getModel();
  const summary=i=>r.nodes.get('ModernObjectGroupSummary'+i).textContent;
  assert.equal(summary(0),'85 transmission towers');
  assert.equal(summary(1),'2 transmission towers');
  assert.match(r.nodes.get('ModernObjectFields0').innerHTML,/ModernObjectVariations0/);
  assert.match(r.nodes.get('ModernObjectFields1').innerHTML,/ModernObjectVariations1/);
  assert.match(r.nodes.get('ModernObjectFields0').innerHTML,/ModernObject0ObjSizeVar/,
    'hidden variation fields remain bound');
  r.fire('ModernObject0NObjects','change','200');
  assert.equal(summary(0),'200 transmission towers');
  r.fire('ModernObject0ObjType','change','2');
  assert.equal(summary(0),'200 ships');
  r.fire('ModernObject1NObjects','change','0');
  assert.equal(summary(1),'No objects');
  r.fire('ModernObject0NObjects','change','201');
  assert.equal(m.NObjects[0],200,'invalid count cannot mutate the model');
  assert.equal(summary(0),'200 ships','invalid count cannot update the summary');
  await r.fire('ModernPreset','change','single');
  assert.equal(summary(0),'1 transmission tower');
  assert.equal(summary(1),'No objects');
  r.fire('ModernCompareTab','click');
  r.fire('ModernObject0ObjType','change','1');
  assert.equal(summary(0),'1 measuring rod');
  assert.equal(m.ObjType[0],1,'Compare edits the shared object model');
});

test('131 HTML controls and isolated module order are explicit and no Legacy handlers are loaded',()=>{
  const html=read('CurvatureModern.html');
  const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,ids.length,'DOM IDs must be unique');
  for(const id of ['ModernPreset','ModernResetPreset','ModernRoll','ModernViewAngle',
    'ModernRadiusKm','ModernFlat','ModernObjectFields0','ModernObjectFields1']){
    assert.ok(ids.includes(id),id);
  }
  assert.ok(html.indexOf('src/ui/modern/ModernSceneState.js')<html.indexOf('src/ui/modern/ModernApp.js'));
  assert.doesNotMatch(html,/src\/ui\/ControlPanelX\.js|CurvatureAppRuntime\.js|CurvatureDemos\.js/);
  assert.match(read('docs/modern-ui-plan.md'),/131/);
});

function buildRuntime(){
  const nodes=new Map(),callbacks=[],draws=[],timers=new Map();
  let sequence=0;
  function node(id){
    if(nodes.has(id))return nodes.get(id);
    const n={id,value:'',checked:false,hidden:false,min:'',max:'',disabled:false,
      tagName:'INPUT',listeners:{},textContent:'',innerHTML:'',
      classList:{toggle(){}},addEventListener(name,cb){this.listeners[name]=cb;},
      setAttribute(){},closest(){return {hidden:false};},
      getAttribute(key){return this.attrs&&this.attrs[key];},
      querySelectorAll(){return [...nodes.values()].filter(v=>v.attrs&&v.attrs['data-group']===id.slice(-1));}};
    nodes.set(id,n);return n;
  }
  const staticIds=[...read('CurvatureModern.html').matchAll(/\sid="([^"]+)"/g)].map(x=>x[1]);
  for(const id of staticIds)node(id);
  node('ModernHeight').value='15';node('ModernFocal').value='2000';node('ModernPan').value='0.0464';
  node('ModernNick').value='0.0121';node('ModernRoll').value='0';
  node('ModernCameraAim').value='3';node('ModernAtmosphere').value='standard';
  node('ModernOcclusion').value='6371000';node('ModernCurvature').value='164';
  // Object host innerHTML is set at startup. Provide realistic querySelectorAll.
  for(let i=0;i<2;i++){
    const host=node('ModernObjectFields'+i);
    host.querySelectorAll=function(){
      const html=host.innerHTML;
      const matches=[...html.matchAll(/<(input|select)\s+id="(ModernObject\d+\w+)"[^>]*data-group="(\d+)" data-field="(\w+)"/g)];
      return matches.map(match=>{
        const n=node(match[2]);n.tagName=match[1].toUpperCase();
        n.attrs={'data-group':match[3],'data-field':match[4]};return n;
      });
    };
  }
  const modelCtx=vm.createContext({JsgVect3:vec});
  vm.runInContext(read('src/app/CurvatureModel.js'),modelCtx);
  const CurveAppClass=vm.runInContext('CurveAppClass',modelCtx);
  const historyEntries=[];
  const fingerprint=require('../src/ui/modern/ModernExperimentFingerprint');
  const experimentState=require('../src/ui/modern/ModernExperimentState');
  const compareState=require('../src/ui/modern/ModernCompareState');
  const historyStore={failRecord:false,waitForRecord:null,open:async()=>{},
    list:async()=>historyEntries.slice().reverse(),
    get:async id=>historyEntries.find(e=>e.id===Number(id))||null,
    record:async (snapshot,source)=>{
      if(historyStore.waitForRecord)await historyStore.waitForRecord;
      if(historyStore.failRecord)throw Error('History write failed');
      const signature=fingerprint.exactSignature(snapshot);
      const match=historyEntries.find(e=>e.signature===signature);
      if(match){if(source!=='auto')match.pinned=true;return {created:false,entry:match};}
      const entry={id:historyEntries.length+1,experiment:experimentState.validate(snapshot),
        signature,source,pinned:source!=='auto',name:'Saved scene',thumbnail:null};
      historyEntries.push(entry);return {created:true,entry};
    }};
  const win={CurveAppClass,CurvatureModernSceneState:adapter,
    CurvatureModernExperimentState:experimentState,CurvatureModernCompareState:compareState,
    CurvatureModernExperimentFingerprint:fingerprint,
    CurvatureModernExperimentHistory:{create:()=>historyStore},
    CurvaturePhysicalCurvature:curvature,
    CurvatureMainCanvasRenderer:{renderPhysical(g,m,opts){
      draws.push({height:m.Height,roll:m.Roll,viewAngle:m.ViewAngle,
        radius:m.rEarth,showModel:m.showModel,atmosphere:opts.atmosphere,
        geometryBackend:opts.geometryBackend,
        count:[...m.NObjects],lateral:[...m.ObjSidePos]});
      return {drawn:42,fillTriangles:10,unresolved:0,timings:{totalMs:5}};
    }},
    NewGraphX3D(options){return {Redraw(){options.DrawFunc({});}};},
    xOnLoad(fn){callbacks.push(fn);},console};
  const sandbox={window:win,document:{getElementById(id){return nodes.get(id)||null;},
    querySelector(selector){return selector.startsWith('#')?nodes.get(selector.slice(1))||null:null;}},
    requestAnimationFrame(fn){fn();return ++sequence;},cancelAnimationFrame(){},
    setTimeout(fn){const id=++sequence;timers.set(id,fn);return id;},
    clearTimeout(id){timers.delete(id);},console};
  win.window=win;
  win.CurvatureModernAnimationPlaybackControls=
    require('../src/animation/ModernAnimationPlaybackControls');
  vm.runInNewContext(read('src/ui/modern/ModernApp.js'),sandbox);
  callbacks[0]();
  function fire(id,type,value){const n=node(id);if(value!==undefined)n.value=value;
    const cb=n.listeners[type];assert.equal(typeof cb,'function',id+': '+type);
    return cb.call(n);}
  function drain(){while(timers.size){const entries=[...timers];timers.clear();for(const [,cb] of entries)cb();}}
  return {nodes,draws,timers,win,historyEntries,historyStore,fire,drain};
}

test('131 Modern events change the shared model; presets/flat/atmosphere keep state in sync',async()=>{
  const r=buildRuntime(),m=r.win.CurvatureModernApp.getModel();
  assert.equal(r.draws.length,1);
  assert.deepEqual(r.draws[0].count,[85,2]);
  r.fire('ModernRoll','change','15');assert.equal(m.Roll,15);
  r.fire('ModernViewAngle','change','2.5');
  assert.ok(Math.abs(m.ViewAngle-2.5)<1e-8);
  r.fire('ModernRadiusKm','change','6000370');
  assert.equal(m.rEarth,6000370000);
  assert.equal(r.nodes.get('ModernCurvature').value,String(curvature.modelStep(m)));
  r.nodes.get('ModernFlat').checked=true;
  r.fire('ModernFlat','change');
  assert.equal(m.showModel,2);
  assert.equal(r.nodes.get('ModernRadiusKm').disabled,true);
  r.fire('ModernObject1NObjects','change','0');assert.equal(m.NObjects[1],0);
  r.fire('ModernObject0ObjSidePos','change','-650');assert.equal(m.ObjSidePos[0],-650);
  r.fire('ModernAtmosphere','change','inverse-spherical');
  assert.equal(r.draws.at(-1).atmosphere,'inverse-spherical');
  assert.equal(r.nodes.get('ModernOcclusionWrap').hidden,false);
  assert.equal(r.nodes.get('ModernPreset').value,'custom');
  await r.fire('ModernPreset','change','single');
  assert.deepEqual(Array.from(m.NObjects),[1,0]);
  assert.equal(m.showModel,1);
  assert.equal(m.Roll,0);
  assert.equal(r.nodes.get('ModernSceneTitle').textContent,'Single transmission tower · sample');
  assert.equal(r.nodes.get('ModernPreset').value,'single');
  r.fire('ModernObject0NObjects','change','3');
  await r.fire('ModernResetPreset','click');
  assert.equal(m.NObjects[0],1);
  assert.equal(r.nodes.get('ModernPreset').value,'single');
  assert.equal(r.win.CurvatureModernApp.getPreset(),'single');
  assert.equal(r.nodes.get('ModernStatus').classList!==undefined,true);
});

test('Bedford partial native preset works through actual Modern UI in Scene and Compare',async()=>{
  const r=buildRuntime(),m=r.win.CurvatureModernApp.getModel();
  await r.fire('ModernPreset','change','bedford');
  assert.equal(r.win.CurvatureModernApp.getPreset(),'bedford');
  assert.equal(m.DemoText,'Bedford Level · marker study');
  assert.deepEqual(Array.from(m.NObjects),[3,0]);
  assert.deepEqual(Array.from(m.ObjDist),[124,0]);
  assert.deepEqual(Array.from(m.ObjSideVar),[18,0]);
  assert.equal(m.Height,4.04);
  assert.equal(m.FocalLengthField,5000);
  assert.equal(m.showGrid,0);
  assert.equal(r.nodes.get('ModernAtmosphere').value,'vacuum');
  assert.equal(r.draws.at(-1).atmosphere,'vacuum');
  assert.match(r.nodes.get('ModernSceneDescription').textContent,/not the original globe\/flat overlay/);
  r.fire('ModernCompareTab','click');
  assert.equal(r.win.CurvatureModernApp.getMode(),'compare');
  assert.deepEqual(Array.from(m.ObjDist),[124,0]);
  r.fire('ModernObject0ObjSideVar','change','0');
  assert.deepEqual(Array.from(m.ObjSideVar),[0,0]);
  await r.fire('ModernResetPreset','click');
  assert.deepEqual(Array.from(m.ObjSideVar),[18,0], 'reset restores authored lateral variation');
  assert.equal(r.win.CurvatureModernApp.getPreset(),'bedford');
  await r.fire('ModernPreset','change','single');
  assert.deepEqual(Array.from(m.ObjSideVar),[0,0], 'later presets must not inherit Bedford offsets');
});

test('Chicago partial preset survives UI edit, Compare, protected History return and Reset',async()=>{
  const r=buildRuntime(),m=r.win.CurvatureModernApp.getModel();
  assert.equal(await r.fire('ModernPreset','change','chicago'),true);
  assert.equal(r.win.CurvatureModernApp.getPreset(),'chicago');
  assert.equal(m.DemoText,'Chicago Skyline · distant-shore study');
  assert.deepEqual(Array.from(m.ObjType),[4,3]);
  assert.deepEqual(Array.from(m.NObjects),[6,0]);
  assert.deepEqual(Array.from(m.ObjSizeVar),[.381,0]);
  assert.equal(r.nodes.get('ModernObjectGroupSummary0').textContent,'6 city skylines');
  assert.equal(r.nodes.get('ModernAtmosphere').value,'standard');
  assert.equal(r.draws.at(-1).atmosphere,'standard');
  assert.equal(m.Height,2);
  assert.equal(m.CameraNorth,-60000);
  r.fire('ModernCompareTab','click');
  assert.equal(r.win.CurvatureModernApp.getMode(),'compare');
  r.fire('ModernObject0ObjSizeVar','change','0');
  assert.equal(r.win.CurvatureModernApp.getPresetSelection(),'custom');
  await r.fire('ModernResetPreset','click');
  assert.deepEqual(Array.from(m.ObjSizeVar),[.381,0]);
  assert.equal(r.win.CurvatureModernApp.getPresetSelection(),'chicago');
  const edited=r.historyEntries.find(e=>e.experiment.scene.objects.ObjSizeVar[0]===0 &&
    e.experiment.scene.preset==='custom');
  assert.ok(edited,'custom Chicago must remain protected after reset');
  assert.equal(await r.fire('ModernPreset','change','bedford'),true);
  assert.deepEqual(Array.from(m.ObjType),[0,3]);
  await r.fire('ModernPreviousExperiment','click');
  assert.deepEqual(Array.from(m.ObjType),[4,3]);
  assert.equal(r.win.CurvatureModernApp.getPreset(),'chicago');
});

test('Canigou partial presets switch through the real Modern UI, preserve edits and restore atmospheric study',async()=>{
  const r=buildRuntime(),m=r.win.CurvatureModernApp.getModel();
  assert.equal(await r.fire('ModernPreset','change','canigou'),true);
  assert.equal(r.win.CurvatureModernApp.getPreset(),'canigou');
  assert.deepEqual(Array.from(m.ObjType),[5,3]);
  assert.deepEqual(Array.from(m.NObjects),[40,0]);
  assert.equal(m.Height,1000);
  assert.equal(m.ObjDist[0],257000);
  assert.equal(m.ObjSideVar[0],-5620);
  assert.equal(r.nodes.get('ModernAtmosphere').value,'vacuum');
  assert.equal(r.draws.at(-1).atmosphere,'vacuum');
  assert.equal(r.nodes.get('ModernObjectGroupSummary0').textContent,'40 mountains');
  r.fire('ModernCompareTab','click');
  assert.equal(r.win.CurvatureModernApp.getMode(),'compare');
  r.fire('ModernObject0ObjSizeVar','change','0');
  assert.equal(r.win.CurvatureModernApp.getPresetSelection(),'custom');
  assert.equal(await r.fire('ModernPreset','change','canigou-low'),true);
  assert.equal(m.Height,244);
  assert.equal(r.nodes.get('ModernAtmosphere').value,'standard');
  assert.equal(r.win.CurvatureModernApp.getCompareConfig().A.atmosphere,'standard');
  assert.equal(r.win.CurvatureModernApp.getCompareConfig().B.atmosphere,'standard');
  assert.deepEqual(Array.from(m.ObjSizeVar),[.125,0]);
  assert.equal(r.historyEntries.some(e=>e.pinned&&e.experiment.scene.preset==='custom'&&
    e.experiment.scene.resetPreset==='canigou'&&e.experiment.scene.objects.ObjSizeVar[0]===0),true);
  await r.fire('ModernPreviousExperiment','click');
  assert.equal(m.Height,1000);
  assert.equal(m.ObjSizeVar[0],0);
  assert.equal(r.win.CurvatureModernApp.getPresetSelection(),'custom');
  assert.equal(r.win.CurvatureModernApp.getPreset(),'canigou');
  await r.fire('ModernPreviousExperiment','click');
  assert.equal(m.Height,244);
  assert.equal(r.win.CurvatureModernApp.getPreset(),'canigou-low');
  r.fire('ModernObject0ObjSideVar','change','0');
  await r.fire('ModernResetPreset','click');
  assert.equal(m.ObjSideVar[0],-5620);
  assert.equal(m.Height,244);
  assert.equal(r.win.CurvatureModernApp.getPresetSelection(),'canigou-low');
});

test('131 input debounce coalesces expensive optics and invalid entries never mutate model',()=>{
  const r=buildRuntime(),m=r.win.CurvatureModernApp.getModel();
  r.fire('ModernHeight','input','24');
  r.fire('ModernHeight','input','25');
  r.fire('ModernHeight','input','26');
  assert.equal(r.draws.length,1,'typing cannot shoot rays immediately');
  r.drain();
  assert.equal(r.draws.length,2);
  assert.equal(m.Height,26);
  const previous=r.draws.length;
  r.fire('ModernHeight','change','');
  assert.equal(m.Height,26);
  assert.equal(r.draws.length,previous);
  assert.match(r.nodes.get('ModernStatus').textContent,/Invalid/);
  r.fire('ModernObject0ObjType','change','9');
  assert.equal(m.ObjType[0],3);
  assert.equal(r.draws.length,previous);
  r.fire('ModernHeight','change','30');
  assert.equal(m.Height,30);
  assert.equal(r.draws.length,previous+1);
});


test('preset switch protects the outgoing edited experiment and Previous restores it through History',async()=>{
  const r=buildRuntime(),m=r.win.CurvatureModernApp.getModel();
  r.fire('ModernObject0NObjects','change','67');
  r.fire('ModernHeight','change','27');
  assert.equal(r.win.CurvatureModernApp.getPresetSelection(),'custom');
  // Native <select> already holds the incoming choice before change fires.
  await r.fire('ModernPreset','change','bedford');
  assert.equal(r.historyEntries.length,1);
  const old=r.historyEntries[0];
  assert.equal(old.source,'recovery');assert.equal(old.pinned,true);
  assert.equal(old.experiment.scene.preset,'custom');
  assert.equal(old.experiment.scene.resetPreset,'pontchartrain');
  assert.equal(old.experiment.scene.objects.NObjects[0],67);
  assert.equal(old.experiment.scene.camera.Height,27);
  assert.equal(r.win.CurvatureModernApp.getPresetSelection(),'bedford');
  assert.equal(m.NObjects[0],3);
  assert.equal(r.nodes.get('ModernPreviousExperiment').disabled,false);
  await r.fire('ModernPreviousExperiment','click');
  assert.equal(r.win.CurvatureModernApp.getPresetSelection(),'custom');
  assert.equal(r.nodes.get('ModernPreset').value,'custom');
  assert.equal(r.win.CurvatureModernApp.getPreset(),'pontchartrain');
  assert.equal(m.NObjects[0],67);assert.equal(m.Height,27);
  assert.equal(r.historyEntries.length,2);
  assert.equal(r.historyEntries[1].experiment.scene.preset,'bedford');
  assert.equal(r.historyEntries[1].pinned,true);
  await r.fire('ModernPreviousExperiment','click');
  assert.equal(r.win.CurvatureModernApp.getPresetSelection(),'bedford');
  assert.equal(m.NObjects[0],3);
  assert.equal(r.historyEntries.length,2,'roundtrip must reuse protected points, not create duplicates');
});

test('preset navigation fails closed on failed History write and retains current model and selector',async()=>{
  const r=buildRuntime(),m=r.win.CurvatureModernApp.getModel();
  r.fire('ModernHeight','change','44');
  const before=m.Height;r.historyStore.failRecord=true;
  const ok=await r.fire('ModernPreset','change','bedford');
  assert.equal(ok,false);
  assert.equal(m.Height,before);assert.equal(m.DemoText,'Lake Pontchartrain Transmission Line');
  assert.equal(r.win.CurvatureModernApp.getPresetSelection(),'custom');
  assert.equal(r.nodes.get('ModernPreset').value,'custom');
  assert.equal(r.nodes.get('ModernPreviousExperiment').disabled,true);
  assert.match(r.nodes.get('ModernPresetSwitchStatus').textContent,/History write failed/);
  assert.equal(r.historyEntries.length,0);
  r.historyStore.failRecord=false;
  assert.equal(await r.fire('ModernPreset','change','bedford'),true);
  assert.equal(m.Height,4.04);
});

test('concurrent edits during async History write cannot be overwritten by a stale preset change',async()=>{
  const r=buildRuntime(),m=r.win.CurvatureModernApp.getModel();
  r.fire('ModernHeight','change','25');
  let release;
  r.historyStore.waitForRecord=new Promise(resolve=>{release=resolve;});
  const pending=r.fire('ModernPreset','change','bedford');
  assert.equal(r.nodes.get('ModernPreset').disabled,true);
  assert.equal(r.nodes.get('ModernPreset').value,'custom');
  r.fire('ModernHeight','change','41');
  release();
  assert.equal(await pending,false);
  assert.equal(m.Height,41);
  assert.equal(r.win.CurvatureModernApp.getPresetSelection(),'custom');
  assert.equal(r.historyEntries.length,1);
  assert.equal(r.historyEntries[0].experiment.scene.camera.Height,25);
  r.historyStore.waitForRecord=null;
  assert.equal(await r.fire('ModernPreset','change','bedford'),true);
  assert.equal(r.historyEntries.length,2);
  assert.equal(r.historyEntries[1].experiment.scene.camera.Height,41);
});

test('Reset to preset archives edits and preserves one History entry per distinct experiment',async()=>{
  const r=buildRuntime(),m=r.win.CurvatureModernApp.getModel();
  await r.fire('ModernPreset','change','bedford');
  r.fire('ModernObject0ObjSideVar','change','0');
  assert.equal(r.win.CurvatureModernApp.getPresetSelection(),'custom');
  await r.fire('ModernResetPreset','click');
  assert.deepEqual(Array.from(m.ObjSideVar),[18,0]);
  assert.equal(r.win.CurvatureModernApp.getPresetSelection(),'bedford');
  const edited=r.historyEntries.find(entry=>entry.experiment.scene.objects.ObjSideVar[0]===0);
  assert.ok(edited,'Reset must preserve the edited scene');
  const previousCount=r.historyEntries.length;
  await r.fire('ModernResetPreset','click');
  const firstIdenticalReset=r.historyEntries.length;
  await r.fire('ModernResetPreset','click');
  assert.equal(r.historyEntries.length,firstIdenticalReset,
    'repeated unchanged Reset should reuse exact recovery checkpoint');
  assert.ok(firstIdenticalReset<=previousCount+1);
});

test('131 sample presets produce physical scenes using the real shared renderer',()=>{
  const renderer=require('../src/app/CurvatureMainCanvasRenderer');
  const context={save(){},restore(){},setTransform(){},beginPath(){},moveTo(){},lineTo(){},
    closePath(){},stroke(){},fill(){},clearRect(){},setLineDash(){},
    measureText(){return {width:0};},fillText(){}};
  const graph={Canvas:{width:700,height:466,getContext(){return context;}},Camera:{},
    ContextScale:1,WinTrans:{ScaleX:1,ScaleY:-1,OffsetX:0,OffsetY:0},
    AutoScalePix:false,MinLineWidth:1,ScalePixInt:false,DevicePixelRatio:1,
    GetPixScaling(){return 1;},SetViewport(){},SetGraphClipping(){},
    SetCameraClipping(d){this.CameraClipPlaneDist=d;},SetWindowToCameraScreen(){},
    SetCamera(p){this.Camera={CamPos:p.CamPos,CamUp:p.CamUp,CamViewCenter:p.CamViewCenter,
      SceneSize:p.SceneSize,ScreenSize:1,ObjectZExtend:0,Zoom:1};},
    SetCameraZoom(z){this.Camera.Zoom=z;}};
  const m=model();
  for(const id of ['single','rows','bedford','chicago','chicago-near','canigou','canigou-low']){
    adapter.applyPreset(m,id);m.Update();
    const output=renderer.renderPhysical(graph,m,{atmosphere:['bedford','chicago-near','canigou'].includes(id)?'vacuum':'standard',
      occlusionRadius:6371000,interactive:false});
    assert.equal(output.mode,'physical-scene');
    assert.ok(output.drawn>0,id+' draws visible physical geometry');
    assert.ok(Number.isFinite(output.drawn));
    assert.ok(Number.isFinite(output.unresolved));
    if(id.startsWith('chicago'))assert.ok(output.fillTriangles>0,'Chicago buildings must create actual optical fills');
  }
});

test('140.2: Display selects experimental GPU for redraw and returns to Canvas on demand',()=>{
  const r=buildRuntime(),app=r.win.CurvatureModernApp;
  assert.equal(app.getGeometryBackend(),'canvas');
  assert.equal(r.draws.at(-1).geometryBackend,'canvas');
  r.fire('ModernGeometryBackend','change','webgl2');
  assert.equal(app.getGeometryBackend(),'webgl2');
  assert.equal(r.draws.at(-1).geometryBackend,'webgl2');
  r.fire('ModernGeometryBackend','change','canvas');
  assert.equal(r.draws.at(-1).geometryBackend,'canvas');
});


test('Causeway preset retains source bridge geometry through UI Compare, History and Reset',async()=>{
  const r=buildRuntime(),m=r.win.CurvatureModernApp.getModel();
  assert.equal(await r.fire('ModernPreset','change','causeway'),true);
  assert.deepEqual(Array.from(m.ObjType),[6,3]);
  assert.deepEqual(Array.from(m.NObjects),[41,0]);
  assert.deepEqual(Array.from(m.ObjSideType),[1,0]);
  assert.equal(r.nodes.get('ModernAtmosphere').value,'vacuum');
  r.fire('ModernCompareTab','click');
  assert.equal(r.win.CurvatureModernApp.getMode(),'compare');
  r.fire('ModernObject0ObjSidePos','change','80');
  await r.fire('ModernPreset','change','grace');
  assert.ok(r.historyEntries.some(e=>e.pinned&&
    e.experiment.scene.resetPreset==='causeway'&&e.experiment.scene.objects.ObjSidePos[0]===80));
  await r.fire('ModernPreviousExperiment','click');
  assert.equal(m.ObjSidePos[0],80);
  assert.equal(r.win.CurvatureModernApp.getPreset(),'causeway');
  await r.fire('ModernResetPreset','click');
  assert.deepEqual(Array.from(m.ObjSidePos),[45,0]);
});

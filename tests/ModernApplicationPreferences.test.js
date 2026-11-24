'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const preferences=require('../src/ui/modern/ModernApplicationPreferences');
const historyFilterDefaults={query:'',mode:'all',geometry:'any',atmosphere:'any',geometryRelation:'any',refractionRelation:'any'};
const workspaceDefaults={mode:null,sceneTab:'Camera',compareTab:'Camera',compareModel:null,calibrationView:'editor',sections:{}};
function storage(values={}){
  const data=new Map(Object.entries(values));
  return {data,getItem(key){return data.has(key)?data.get(key):null;},
    setItem(key,value){data.set(key,value);},removeItem(key){data.delete(key);}};
}
test('application preference defaults, allowed values and individual invalid fields are validated',()=>{
  const defaults=preferences.defaults();
  assert.deepEqual(defaults,{opticalQuality:'accurate',previewDetail:'auto',studioPlaybackDetail:'performance',studioPlaybackFps:'auto',geometryBackend:'canvas',cameraHudVisible:true,cameraHudAppearance:{opacity:90,position:'top-left',size:100},targetIndicatorVisible:true,studioTargetVisible:true,targetIndicatorSelection:'scene',
    displayPanels:{advanced:false,diagnostics:false,gpu:false,profiler:false},historyGallerySize:'small',historyPinnedCollapsed:false,historyPanelOpen:false,historyFilters:historyFilterDefaults,studioPickerFilters:historyFilterDefaults,historyStoryboardQueue:[],
    navigation:{speed:10,turnRate:1,wheelStep:'auto'},workspace:workspaceDefaults});
  assert.deepEqual(preferences.normalize({opticalQuality:'auto',previewDetail:'32',studioPlaybackDetail:'balanced',studioPlaybackFps:'30',geometryBackend:'webgl2',
    displayPanels:{advanced:false,diagnostics:false,gpu:false,profiler:false},historyGallerySize:'small',historyPinnedCollapsed:false,historyPanelOpen:false,historyFilters:historyFilterDefaults,studioPickerFilters:historyFilterDefaults,historyStoryboardQueue:[],
    navigation:{speed:100,turnRate:.05,wheelStep:10}}),
  {opticalQuality:'auto',previewDetail:'32',studioPlaybackDetail:'balanced',studioPlaybackFps:'30',geometryBackend:'webgl2',cameraHudVisible:true,cameraHudAppearance:{opacity:90,position:'top-left',size:100},targetIndicatorVisible:true,studioTargetVisible:true,targetIndicatorSelection:'scene',
    displayPanels:{advanced:false,diagnostics:false,gpu:false,profiler:false},historyGallerySize:'small',historyPinnedCollapsed:false,historyPanelOpen:false,historyFilters:historyFilterDefaults,studioPickerFilters:historyFilterDefaults,historyStoryboardQueue:[],
    navigation:{speed:100,turnRate:.05,wheelStep:10},workspace:workspaceDefaults});
  const invalid=preferences.normalize({opticalQuality:'unsafe',previewDetail:'3',studioPlaybackDetail:'invalid',studioPlaybackFps:'120',geometryBackend:'webgpu',
    navigation:{speed:Infinity,turnRate:-1,wheelStep:'bad'}});
  assert.deepEqual(invalid,defaults);
  assert.equal(Object.isFrozen(invalid.navigation),true);
});
test('storage round trip, old navigation migration and reset both generations',()=>{
  const db=storage({[preferences.LEGACY_NAVIGATION_KEY]:JSON.stringify({speed:100,turnRate:5,wheelStep:1})});
  assert.equal(preferences.read(db).navigation.speed,100);
  assert.equal(preferences.read(db).opticalQuality,'accurate');
  assert.equal(preferences.write(db,{opticalQuality:'auto',geometryBackend:'webgl2',navigation:{speed:1}}),true);
  assert.equal(JSON.parse(db.data.get(preferences.STORAGE_KEY)).version,1);
  assert.equal(preferences.read(db).navigation.speed,1);
  assert.equal(preferences.read(db).opticalQuality,'auto');
  assert.equal(preferences.reset(db),true);
  assert.equal(db.data.size,0);
  assert.deepEqual(preferences.read(db),preferences.defaults());
});
test('corrupt, partial and blocked localStorage fail safely and do not affect source preference data',()=>{
  assert.deepEqual(preferences.read(storage({[preferences.STORAGE_KEY]:'{broken'})),preferences.defaults());
  assert.deepEqual(preferences.read(storage({[preferences.STORAGE_KEY]:JSON.stringify({version:2,opticalQuality:'fast'})})),preferences.defaults());
  const partial=preferences.read(storage({[preferences.STORAGE_KEY]:JSON.stringify({previewDetail:'4'})}));
  assert.equal(partial.previewDetail,'4');assert.equal(partial.geometryBackend,'canvas');
  assert.deepEqual(preferences.read({getItem(){throw Error('blocked');}}),preferences.defaults());
  assert.equal(preferences.write(null,{opticalQuality:'auto'}),false);
  assert.equal(preferences.reset(null),false);
  assert.throws(()=>preferences.write({setItem(){throw Error('quota');}},{}),/quota/);
  assert.throws(()=>preferences.reset({removeItem(){throw Error('blocked');}}),/blocked/);
  const source={navigation:{speed:100}};preferences.normalize(source);
  assert.deepEqual(source,{navigation:{speed:100}});
});

test('Display panels persist across reload without changing experiment preferences',()=>{
  const db=storage();
  const first=preferences.normalize({opticalQuality:'auto',previewDetail:'8',
    displayPanels:{advanced:true,diagnostics:true,gpu:true,profiler:false}});
  assert.equal(preferences.write(db,first),true);
  const second=preferences.read(db);
  assert.deepEqual(second.displayPanels,{advanced:true,diagnostics:true,gpu:true,profiler:false});
  assert.equal(Object.isFrozen(second.displayPanels),true);
  assert.equal(second.opticalQuality,'auto');assert.equal(second.previewDetail,'8');
  assert.equal(preferences.read(db).displayPanels.gpu,true);
  assert.equal(preferences.reset(db),true);
  assert.deepEqual(preferences.read(db).displayPanels,
    {advanced:false,diagnostics:false,gpu:false,profiler:false});
});
test('partial, stale or malformed Display panel preferences cannot open hidden diagnostics',()=>{
  const db=storage({[preferences.STORAGE_KEY]:JSON.stringify({version:1,
    displayPanels:{advanced:true,diagnostics:'true',gpu:1,profiler:null,unknown:true}})});
  assert.deepEqual(preferences.read(db).displayPanels,
    {advanced:true,diagnostics:false,gpu:false,profiler:false});
  assert.deepEqual(preferences.normalize({displayPanels:[]}).displayPanels,
    {advanced:false,diagnostics:false,gpu:false,profiler:false});
});

test('workspace preferences retain validated tabs, model, mode and independent section scopes',()=>{
  const db=storage();
  const saved=preferences.normalize({workspace:{mode:'compare',sceneTab:'Surface',
    compareTab:'Atmosphere',compareModel:'B',sections:{
      'scene.camera.animation':false,'compare.camera.animation':true,
      'compare.display.profiler':true,'scene.objects.group2':true}}});
  assert.equal(preferences.write(db,saved),true);
  const result=preferences.read(db).workspace;
  assert.equal(result.mode,'compare');assert.equal(result.sceneTab,'Surface');
  assert.equal(result.compareTab,'Atmosphere');assert.equal(result.compareModel,'B');
  assert.equal(result.sections['scene.camera.animation'],false);
  assert.equal(result.sections['compare.camera.animation'],true);
  assert.equal(result.sections['compare.display.profiler'],true);
  assert.equal(result.sections['scene.objects.group2'],true);
  assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.sections));
  assert.deepEqual(preferences.normalize({workspace:{mode:'invalid',sceneTab:'Missing',
    compareModel:'C',sections:{'scene.camera.animation':'true',
      'compare.camera.animation':1,'__proto__':true}}}).workspace,workspaceDefaults);
});
test('Image Library is a durable independent workspace mode, not an experiment mode',()=>{
  assert.ok(preferences.WORKSPACE_MODES.includes('images'));
  const db=storage();
  preferences.write(db,{workspace:{mode:'images',sceneTab:'Surface',compareTab:'Atmosphere'}});
  const saved=preferences.read(db).workspace;
  assert.equal(saved.mode,'images');
  assert.equal(saved.sceneTab,'Surface');
  assert.equal(saved.compareTab,'Atmosphere');
  assert.equal(preferences.startupWorkspace(saved.mode,'compare',null,false,null),'images');
  // Explicit physical links still win when no deliberate history choice exists.
  assert.equal(preferences.startupWorkspace(saved.mode,'compare','scene',false,null),'scene');
  assert.equal(preferences.startupWorkspace(saved.mode,'compare','scene',false,'images'),'images');
});

test('pre-workspace v1 preferences migrate without overriding embedded experiment mode',()=>{
  const db=storage({[preferences.STORAGE_KEY]:JSON.stringify({version:1,
    opticalQuality:'auto',displayPanels:{diagnostics:true},navigation:{speed:100}})});
  const restored=preferences.read(db);
  assert.equal(restored.opticalQuality,'auto');assert.equal(restored.navigation.speed,100);
  assert.equal(restored.displayPanels.diagnostics,true);
  assert.equal(restored.workspace.mode,null);
  assert.deepEqual(restored.workspace.sections,{});
});

test('History card size preference survives reload and invalid/legacy values fall back to compact',()=>{
  const db=storage();
  assert.equal(preferences.read(db).historyGallerySize,'small');
  assert.equal(preferences.read(db).historyPinnedCollapsed,false);
  assert.equal(preferences.read(db).historyPanelOpen,false);
  assert.equal(preferences.write(db,{historyGallerySize:'medium',historyPinnedCollapsed:true,opticalQuality:'fast'}),true);
  assert.equal(preferences.read(db).historyPinnedCollapsed,true);
  assert.equal(preferences.read(db).historyGallerySize,'medium');
  assert.equal(preferences.read(db).opticalQuality,'fast');
  preferences.write(db,{historyGallerySize:'large'});
  assert.equal(preferences.read(db).historyGallerySize,'large');
  assert.equal(preferences.normalize({historyGallerySize:'oversized'}).historyGallerySize,'small');
  assert.equal(preferences.normalize({historyPinnedCollapsed:'true'}).historyPinnedCollapsed,false);
  assert.equal(preferences.normalize({historyGallerySize:{size:'large'}}).historyGallerySize,'small');
  assert.equal(preferences.reset(db),true);
  assert.equal(preferences.read(db).historyGallerySize,'small');
});

test('History filters round-trip in browser preferences, independent of experiment state',()=>{
  const db=storage();
  const expected={query:'Lake  12',mode:'compare',geometry:'flat',atmosphere:'temperature-lapse',
    geometryRelation:'same',refractionRelation:'different'};
  preferences.write(db,{historyFilters:expected,historyPanelOpen:true,opticalQuality:'fast'});
  assert.deepEqual(preferences.read(db).historyFilters,expected);
  assert.equal(preferences.read(db).historyPanelOpen,true);
  assert.equal(preferences.read(db).opticalQuality,'fast');
  assert.equal(preferences.read(db).historyFilters===expected,false);
  assert.equal(Object.isFrozen(preferences.read(db).historyFilters),true);
  const invalid=preferences.normalize({historyFilters:{query:123,mode:'x',geometry:'cube',atmosphere:false}});
  assert.deepEqual(invalid.historyFilters,historyFilterDefaults);
  assert.equal(preferences.normalize({historyFilters:{query:'a'.repeat(500)}}).historyFilters.query.length,160);
  assert.deepEqual(preferences.read(storage({[preferences.STORAGE_KEY]:JSON.stringify({version:1})})).historyFilters,historyFilterDefaults,
    'old v1 preferences load with unfiltered History');
  assert.deepEqual(preferences.read(storage({[preferences.STORAGE_KEY]:'{invalid'})).historyFilters,historyFilterDefaults);
  assert.deepEqual(preferences.normalize({historyFilters:{mode:'scene',geometryRelation:'same',
    refractionRelation:'different'}}).historyFilters,
    {...historyFilterDefaults,mode:'scene'});
  const badRelation=preferences.normalize({historyFilters:{geometryRelation:'equal',refractionRelation:4}});
  assert.deepEqual(badRelation.historyFilters,historyFilterDefaults);
  preferences.reset(db);
  assert.deepEqual(preferences.read(db).historyFilters,historyFilterDefaults);
});

test('Snapshot Picker filters are persisted and validated independently of History',()=>{
  const db=storage();
  const history={query:'Lake',mode:'scene',geometry:'globe'};
  const picker={query:'Cloud towers',mode:'compare',geometry:'flat',atmosphere:'vacuum',
    geometryRelation:'different',refractionRelation:'same'};
  preferences.write(db,{historyFilters:history,studioPickerFilters:picker});
  assert.equal(preferences.read(db).historyFilters.query,'Lake');
  assert.deepEqual(preferences.read(db).studioPickerFilters,picker);
  assert.equal(Object.isFrozen(preferences.read(db).studioPickerFilters),true);
  assert.deepEqual(preferences.normalize({studioPickerFilters:{mode:'scene',
    geometryRelation:'different'}}).studioPickerFilters,
    {...historyFilterDefaults,mode:'scene'});
  assert.deepEqual(preferences.normalize({studioPickerFilters:{mode:'what',query:8}})
    .studioPickerFilters,historyFilterDefaults);
  assert.equal(preferences.normalize({studioPickerFilters:{query:'x'.repeat(400)}})
    .studioPickerFilters.query.length,160);
  assert.deepEqual(preferences.read(storage({[preferences.STORAGE_KEY]:
    JSON.stringify({version:1,historyFilters:history})})).studioPickerFilters,
    historyFilterDefaults,'older preferences load with independent Picker defaults');
  preferences.reset(db);
  assert.deepEqual(preferences.read(db).studioPickerFilters,historyFilterDefaults);
});

test('Storyboard shortlist preferences are ordered, bounded, unique and never contain untrusted identifiers',()=>{
  const db=storage();
  const valid=[7,2,7,4,0,-3,3.2,'5',Number.MAX_SAFE_INTEGER+1];
  assert.deepEqual(preferences.normalize({historyStoryboardQueue:valid}).historyStoryboardQueue,[7,2,4]);
  assert.equal(Object.isFrozen(preferences.normalize({historyStoryboardQueue:[1]}).historyStoryboardQueue),true);
  assert.deepEqual(preferences.normalize({historyStoryboardQueue:{0:1}}).historyStoryboardQueue,[]);
  assert.equal(preferences.normalize({historyStoryboardQueue:Array.from({length:250},(_,i)=>i+1)}).historyStoryboardQueue.length,200);
  preferences.write(db,{historyStoryboardQueue:[17,6,17,9],historyFilters:{mode:'scene'}});
  const saved=JSON.parse(db.data.get(preferences.STORAGE_KEY));
  assert.deepEqual(saved.historyStoryboardQueue,[17,6,9]);
  assert.deepEqual(preferences.read(db).historyStoryboardQueue,[17,6,9]);
  assert.equal(preferences.read(db).historyFilters.mode,'scene');
  preferences.reset(db);
  assert.deepEqual(preferences.read(db).historyStoryboardQueue,[]);
});

test('Camera HUD visibility is an optional local preference, not an experiment property',()=>{
  const db=storage();
  assert.equal(preferences.read(db).cameraHudVisible,true);
  const hidden=preferences.normalize({cameraHudVisible:false});
  assert.equal(hidden.cameraHudVisible,false);
  assert.equal(preferences.normalize({cameraHudVisible:'false'}).cameraHudVisible,true);
  assert.equal(preferences.normalize({cameraHudVisible:null}).cameraHudVisible,true);
  preferences.write(db,{cameraHudVisible:false,workspace:{mode:'compare'}});
  assert.equal(preferences.read(db).cameraHudVisible,false);
  assert.equal(preferences.read(db).workspace.mode,'compare');
  assert.equal(JSON.parse(db.data.get(preferences.STORAGE_KEY)).cameraHudVisible,false);
  // Old saved preferences continue with a visible HUD by default.
  assert.equal(preferences.read(storage({[preferences.STORAGE_KEY]:JSON.stringify({version:1,
    opticalQuality:'fast'})})).cameraHudVisible,true);
  preferences.reset(db);
  assert.equal(preferences.read(db).cameraHudVisible,true);
});

test('Camera HUD appearance is local display state, validated and reset independently of experiments',()=>{
  const db=storage(),defaults={opacity:90,position:'top-left',size:100};
  assert.deepEqual(preferences.read(db).cameraHudAppearance,defaults);
  const settings={opacity:0,position:'bottom-right',size:125};
  assert.equal(preferences.write(db,{cameraHudVisible:true,cameraHudAppearance:settings}),true);
  assert.deepEqual(preferences.read(db).cameraHudAppearance,settings);
  assert.deepEqual(JSON.parse(db.data.get(preferences.STORAGE_KEY)).cameraHudAppearance,settings);
  assert.equal(Object.isFrozen(preferences.read(db).cameraHudAppearance),true);
  assert.deepEqual(preferences.normalize({cameraHudAppearance:{opacity:100,
    position:'top-right',size:75}}).cameraHudAppearance,
    {opacity:100,position:'top-right',size:75});
  assert.deepEqual(preferences.normalize({cameraHudAppearance:{opacity:-1,
    position:'center',size:200}}).cameraHudAppearance,defaults);
  assert.deepEqual(preferences.normalize({cameraHudAppearance:{opacity:95.5,
    position:[],size:'125'}}).cameraHudAppearance,defaults);
  assert.deepEqual(preferences.normalize({cameraHudAppearance:[]}).cameraHudAppearance,defaults);
  assert.deepEqual(preferences.read(storage({[preferences.STORAGE_KEY]:JSON.stringify({
    version:1,cameraHudVisible:false})})).cameraHudAppearance,defaults,
    'older local preference files migrate transparently');
  preferences.reset(db);
  assert.deepEqual(preferences.read(db).cameraHudAppearance,defaults);
});

test('all five workspaces share the same local preference roundtrip and startup precedence',()=>{
  const db=storage();
  for(const mode of preferences.WORKSPACE_MODES){
    assert.equal(preferences.write(db,{workspace:{mode}}),true);
    const saved=preferences.read(db).workspace.mode;
    assert.equal(saved,mode);
    assert.equal(preferences.startupWorkspace(saved,'scene',null,false,null),mode);
    assert.equal(preferences.startupWorkspace(saved,'compare',null,true,null),'compare');
    assert.equal(preferences.startupWorkspace(saved,'scene','compare',false,null),'compare');
    assert.equal(preferences.startupWorkspace(saved,'compare',null,true,mode),mode);
    assert.equal(preferences.startupWorkspace(saved,'scene','compare',false,mode),mode);
  }
  assert.equal(preferences.startupWorkspace('invalid','compare',null,false,null),'compare');
  assert.equal(preferences.startupWorkspace('animation','scene','invalid',false,'compare'),'animation');
  assert.equal(preferences.startupWorkspace(null,'invalid',null,false,null),'scene');
});

test('Calibration Projects subview reuses the existing workspace preferences and reset contract',()=>{
  const db=storage();
  preferences.write(db,{workspace:{mode:'calibration',calibrationView:'projects'}});
  assert.equal(preferences.read(db).workspace.calibrationView,'projects');
  assert.equal(preferences.read(db).workspace.mode,'calibration');
  assert.equal(preferences.normalize({workspace:{calibrationView:'invalid'}}).workspace.calibrationView,'editor');
  assert.equal(preferences.normalize({workspace:{calibrationView:1}}).workspace.calibrationView,'editor');
  preferences.write(db,{workspace:{mode:'calibration',calibrationView:'editor'}});
  assert.equal(preferences.read(db).workspace.calibrationView,'editor');
  preferences.reset(db);
  assert.deepEqual(preferences.read(db).workspace,workspaceDefaults);
});

function sharedFixture(source,initial={revision:0,envelope:null}){
  let row=structuredClone(initial),writes=0;
  const backend={
    async read(scope){assert.equal(scope,'global');return structuredClone(row);},
    async write(scope,ctx,envelope,expected){
      assert.equal(scope,'global');
      if(row.revision!==expected)throw Error('revision conflict');
      writes++;row={revision:expected+1,envelope:structuredClone(envelope)};
      return {revision:row.revision};
    }
  };
  const open=(legacy=source)=>preferences.createShared({
    registryApi:require('../src/storage/ModernStateRegistry'),
    managerApi:require('../src/storage/ModernUiSessionManager'),store:backend,storage:legacy});
  return {open,read:()=>structuredClone(row),writes:()=>writes};
}
test('global preferences migrate exactly once without owning layout or changing legacy bytes',async()=>{
  const raw=JSON.stringify({version:1,opticalQuality:'fast',navigation:{speed:100},
    workspace:{mode:'compare',compareModel:'B'},displayPanels:{advanced:true}});
  const legacy=storage({[preferences.STORAGE_KEY]:raw}),f=sharedFixture(legacy);
  const a=f.open();assert.equal((await a.restore()).opticalQuality,'fast');
  assert.equal(a.values().navigation.speed,100);
  assert.equal(f.writes(),1);
  assert.equal(a.hasUnacknowledged(),false);
  const keys=Object.keys(f.read().envelope.values);
  assert.equal(keys.length,preferences.GLOBAL_KEYS.length);
  assert.equal(keys.includes('application.workspace'),false);
  assert.equal(keys.includes('application.displayPanels'),false);
  const b=f.open({getItem(){throw Error('legacy must not be accessed after backfill');}});
  await b.restore();assert.equal(f.writes(),1);
  await a.save({...a.values(),cameraHudVisible:false});
  assert.equal(f.writes(),2);
  await assert.rejects(b.save({...b.values(),previewDetail:'4'}),/revision conflict/);
  await assert.rejects(b.retryFailed(),/revision conflict/);
  const c=f.open();await c.restore();
  assert.equal(c.values().cameraHudVisible,false);
  assert.equal(c.values().previewDetail,'auto');
  assert.equal(f.writes(),2);
  assert.equal(legacy.data.get(preferences.STORAGE_KEY),raw);
});
test('global preference migration preserves malformed sources and incomplete or future global rows',async()=>{
  for(const raw of ['{bad','null','{"version":2}']){
    const legacy=storage({[preferences.STORAGE_KEY]:raw}),f=sharedFixture(legacy);
    await assert.rejects(f.open().restore());
    assert.equal(f.writes(),0);
    assert.equal(legacy.data.get(preferences.STORAGE_KEY),raw);
  }
  const legacy=storage(),f=sharedFixture(legacy);await f.open().restore();
  const full=f.read();
  for(const mutate of [
    row=>delete row.envelope.values['application.opticalQuality'],
    row=>row.envelope.values['application.opticalQuality'].version=2,
    row=>row.envelope.values['application.opticalQuality'].value='invalid',
    row=>row.envelope.values['application.future']={version:1,value:true}
  ]){
    const bad=structuredClone(full);mutate(bad);
    const g=sharedFixture(legacy,bad);
    await assert.rejects(g.open().restore(),/Unsupported/);
    assert.equal(g.writes(),0);assert.deepEqual(g.read(),bad);
  }
});
test('old navigation-only preferences can initialize the shared global envelope',async()=>{
  const raw=JSON.stringify({speed:100,turnRate:5,wheelStep:1});
  const legacy=storage({[preferences.LEGACY_NAVIGATION_KEY]:raw}),f=sharedFixture(legacy);
  const a=f.open();await a.restore();
  assert.deepEqual(a.values().navigation,{speed:100,turnRate:5,wheelStep:1});
  assert.equal(legacy.data.get(preferences.LEGACY_NAVIGATION_KEY),raw);
  assert.equal(f.writes(),1);
});

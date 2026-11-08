'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const preferences=require('../src/ui/modern/ModernApplicationPreferences');
const workspaceDefaults={mode:null,sceneTab:'Camera',compareTab:'Camera',compareModel:null,sections:{}};
function storage(values={}){
  const data=new Map(Object.entries(values));
  return {data,getItem(key){return data.has(key)?data.get(key):null;},
    setItem(key,value){data.set(key,value);},removeItem(key){data.delete(key);}};
}
test('application preference defaults, allowed values and individual invalid fields are validated',()=>{
  const defaults=preferences.defaults();
  assert.deepEqual(defaults,{opticalQuality:'accurate',previewDetail:'auto',geometryBackend:'canvas',
    displayPanels:{advanced:false,diagnostics:false,gpu:false,profiler:false},historyGallerySize:'small',historyPinnedCollapsed:false,
    navigation:{speed:10,turnRate:1,wheelStep:'auto'},workspace:workspaceDefaults});
  assert.deepEqual(preferences.normalize({opticalQuality:'auto',previewDetail:'32',geometryBackend:'webgl2',
    displayPanels:{advanced:false,diagnostics:false,gpu:false,profiler:false},historyGallerySize:'small',historyPinnedCollapsed:false,
    navigation:{speed:100,turnRate:.05,wheelStep:10}}),
  {opticalQuality:'auto',previewDetail:'32',geometryBackend:'webgl2',
    displayPanels:{advanced:false,diagnostics:false,gpu:false,profiler:false},historyGallerySize:'small',historyPinnedCollapsed:false,
    navigation:{speed:100,turnRate:.05,wheelStep:10},workspace:workspaceDefaults});
  const invalid=preferences.normalize({opticalQuality:'unsafe',previewDetail:'3',geometryBackend:'webgpu',
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

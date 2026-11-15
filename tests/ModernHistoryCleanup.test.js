'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const preferences=require('../src/ui/modern/ModernApplicationPreferences');
const studio=require('../src/animation/ModernAnimationStudio');
const state=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const root=path.resolve(__dirname,'..');
const source=file=>fs.readFileSync(path.join(root,file),'utf8');
function snapshot(height){
  const model={Height:height,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Migration',Description:'',
    ObjType:[3,3],NObjects:[1,0],ObjDist:[50,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[10,10],ObjSizeVar:[0,0]};
  return state.capture(model,{atmosphere:'standard',occlusionRadius:6371000,
    preset:'custom',resetPreset:'single'},compare.preset('globe-flat-vacuum'),
  {mode:'scene',eyeLevel:true,horizon:true,selected:'A'});
}
test('History is solely an archive: legacy staging UI, handlers and CSS are retired',()=>{
  const html=source('CurvatureModern.html'),app=source('src/ui/modern/ModernApp.js'),
    history=source('src/ui/modern/ModernExperimentHistoryUI.js'),css=source('src/ui/modern/ModernApp.css');
  for(const id of ['ModernHistoryQueueChecked','ModernHistoryQueueOpen',
    'ModernHistoryQueueClear','ModernHistoryQueueCount','ModernHistoryStoryboardQueue'])
    assert.doesNotMatch(html,new RegExp('id="'+id+'"'));
  assert.doesNotMatch(app,/historyStoryboardQueue\.push\(|renderHistoryStoryboard\(/);
  assert.doesNotMatch(history,/renderStoryboardQueue/);
  assert.doesNotMatch(css,/modern-history-storyboard-item|modern-history-handoff/);
  assert.match(html,/id="ModernHistoryPinChecked"/);
  assert.match(html,/id="ModernHistoryDeleteChecked"/);
  assert.match(html,/id="ModernAnimationLegacySelection"/);
  assert.match(html,/id="ModernAnimationLegacyAppend"/);
  assert.match(html,/id="ModernAnimationLegacyDismiss"/);
});
test('Old ordered selections remain valid until explicitly copied or discarded',()=>{
  const queued=preferences.normalize({historyStoryboardQueue:[9,3,8,9,777]})
    .historyStoryboardQueue;
  assert.deepEqual(queued,[9,3,8,777]);
  const entries=[{id:8,name:'Third',experiment:snapshot(8)},
    {id:3,name:'Second',experiment:snapshot(3)},
    {id:4,name:'Already on timeline',experiment:snapshot(4)},
    {id:9,name:'First',experiment:snapshot(9)}];
  const before=studio.history([4],entries);
  const owned=studio.insertSnapshots(before,queued,entries,before.frames.length);
  assert.deepEqual(owned.frames.map(frame=>frame.sourceSnapshotId),[4,9,3,8]);
  assert.deepEqual(before.frames.map(frame=>frame.sourceSnapshotId),[4]);
  // The dropped ID can reappear via a later History import; never prune it
  // merely because the current store lacks that record.
  const found=new Set(entries.map(entry=>entry.id));
  assert.deepEqual(queued.filter(id=>!found.has(id)),[777]);
  assert.deepEqual(studio.insertSnapshots(owned,queued,entries,owned.frames.length).frames
    .map(frame=>frame.sourceSnapshotId),[4,9,3,8],
    'retrying after a storage error cannot duplicate an already-owned frame');
});
test('Recovery is explicit and a durable draft must precede consuming legacy IDs',()=>{
  const app=source('src/ui/modern/ModernApp.js');
  const start=app.indexOf('  function appendLegacyHistorySelection(){');
  const end=app.indexOf('  // Animation Studio owns an independent draft',start);
  assert.ok(start>=0&&end>start);
  const body=app.slice(start,end);
  assert.match(body,/studioApi\.insertSnapshots\(studioDraft,available,studioHistoryEntries,/);
  assert.match(body,/saveStudioDraft\(false\)/);
  assert.match(body,/studioWorkspaceLocalSaved/);
  assert.match(body,/historyStoryboardQueue=historyStoryboardQueue\.filter/);
  assert.ok(body.indexOf('saveStudioDraft(false)')<body.indexOf('historyStoryboardQueue=historyStoryboardQueue.filter'),
    'a failed draft save cannot consume the only saved selection');
  assert.match(app,/if\(!root\.confirm\|\|!root\.confirm\('Discard the old saved History selection/);
  assert.doesNotMatch(app,/historyStoryboardQueue=surviving/);
  assert.match(app,/syncLegacyHistorySelection\(entries\)/);
});

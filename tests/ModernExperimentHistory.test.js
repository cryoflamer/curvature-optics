'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const state=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const fingerprint=require('../src/ui/modern/ModernExperimentFingerprint');
const history=require('../src/ui/modern/ModernExperimentHistory');
const root=path.resolve(__dirname,'..');
function experiment(mode='scene'){
  const model={Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Experiment',Description:'',
    ObjType:[3,3],NObjects:[85,2],ObjDist:[50,20000],ObjDeltaDist:[297.55,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  return state.capture(model,{atmosphere:'standard',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},compare.preset('globe-flat-vacuum'),
    {mode,eyeLevel:false,horizon:true,selected:'A'});
}
// Deterministic IndexedDB surface used by the History Core: request callbacks,
// read/write transactions, auto-increment keys and aborts. No external package.
function indexedDB(){
  const records=new Map(), api={failAdd:false,nextId:1}, db={
    objectStoreNames:{contains:name=>name==='snapshots'},
    createObjectStore(){return {createIndex(){}};},
    close(){},
    transaction(_name,mode){
      let pending=0,done=false;
      const tx={error:null,oncomplete:null,onerror:null,onabort:null,
        abort(){if(done)return;done=true;tx.error=Error('transaction aborted');
          setImmediate(()=>tx.onabort&&tx.onabort());},
        objectStore(){
          const request=action=>{
            const req={result:undefined,error:null,onsuccess:null,onerror:null};
            pending++;
            setImmediate(()=>{
              if(done)return;
              try{req.result=action();if(req.onsuccess)req.onsuccess();}
              catch(error){req.error=error;tx.error=error;done=true;
                if(tx.onabort)tx.onabort();return;}
              pending--;
              if(pending===0)setImmediate(()=>{
                if(!done&&pending===0){done=true;if(tx.oncomplete)tx.oncomplete();}
              });
            });
            return req;
          };
          const copy=v=>v===undefined?v:JSON.parse(JSON.stringify(v));
          return {getAll(){return request(()=>[...records.values()].map(copy));},
            get(id){return request(()=>copy(records.get(id)));},
            put(entry){return request(()=>{
              if(mode!=='readwrite')throw Error('Read-only');
              records.set(entry.id,copy(entry));return entry.id;
            });},
            add(entry){return request(()=>{
              if(mode!=='readwrite'||api.failAdd)throw Error('Quota exceeded');
              const id=api.nextId++;records.set(id,copy({...entry,id}));return id;
            });},
            delete(id){return request(()=>{if(mode!=='readwrite')throw Error('Read-only');records.delete(id);});}
          };
        }
      };return tx;
    }
  };
  api.open=()=>{
    const req={result:db,onupgradeneeded:null,onsuccess:null,onerror:null};
    setImmediate(()=>{if(req.onupgradeneeded)req.onupgradeneeded();if(req.onsuccess)req.onsuccess();});
    return req;
  };
  api.records=records;
  return api;
}
test('History features distinguish Scene/Compare and A/B geometry, ignoring inactive Flat radius',()=>{
  const a=experiment('compare');
  assert.equal(fingerprint.features(a).mode,'compare');
  assert.equal(fingerprint.features(a).relations.geometrySame,false);
  assert.equal(fingerprint.features(a).relations.atmosphereSame,true);
  a.compare.B.surface='globe';a.compare.B.radiusKm=a.compare.A.radiusKm;
  assert.equal(fingerprint.features(a).relations.geometrySame,true);
  assert.equal(fingerprint.features(a).relations.physicsSame,true);
  a.compare.B.atmosphere='standard';
  assert.equal(fingerprint.features(a).relations.atmosphereSame,false);
  assert.equal(fingerprint.features(a).relations.refractionSame,false);
  a.compare.B.surface='flat';a.compare.A.surface='flat';
  a.compare.A.radiusKm=1e6;a.compare.B.radiusKm=900;
  assert.equal(fingerprint.features(a).relations.geometrySame,true);
  a.compare.B.atmosphere='standard';a.compare.A.atmosphere='vacuum';
  a.compare.B.temperatureProfile.gradientKPerKm=-15;
  assert.equal(fingerprint.features(a).relations.atmosphereSame,false);
});
test('Physical signature does not change on camera motion or Compare editor selection',()=>{
  const a=experiment('compare'),b=structuredClone(a);
  b.scene.camera.Pan=80;b.scene.camera.Height=50;b.compare.selected='B';
  b.cameraSequence={keyframes:[]}; // validator removes an empty sequence
  assert.equal(fingerprint.physicalSignature(a),fingerprint.physicalSignature(b));
  assert.notEqual(fingerprint.exactSignature(a),fingerprint.exactSignature(b));
  b.compare.A.radiusKm=12345;
  assert.notEqual(fingerprint.physicalSignature(a),fingerprint.physicalSignature(b));
  const c=experiment('scene');
  c.scene.camera.Pan=80;
  assert.equal(fingerprint.physicalSignature(c),fingerprint.physicalSignature(experiment('scene')));
  c.scene.objects.ObjDist[1]+=1;
  assert.notEqual(fingerprint.physicalSignature(c),fingerprint.physicalSignature(experiment('scene')));
  const disabled=experiment('scene');
  disabled.scene.visibility.rangeKm=120;
  assert.equal(fingerprint.physicalSignature(disabled),fingerprint.physicalSignature(experiment('scene')),
    'inactive haze threshold does not affect physical output');
  disabled.scene.visibility.enabled=true;
  assert.notEqual(fingerprint.physicalSignature(disabled),fingerprint.physicalSignature(experiment('scene')));
});
test('IndexedDB history persists deep-copy validated snapshots, deduplicates latest and orders by stable id',async()=>{
  const db=indexedDB(),h=history.create({indexedDB:db,now:()=>12345});
  const a=experiment(),stored=await h.record(a,'manual');
  assert.equal(stored.created,true);assert.ok(Number.isInteger(stored.entry.id));
  a.scene.camera.Height=99;
  assert.equal((await h.get(stored.entry.id)).experiment.scene.camera.Height,15);
  const duplicate=await h.record(experiment(),'manual');
  assert.equal(duplicate.created,false);assert.equal((await h.list()).length,1);
  const b=experiment('compare');
  const savedB=await h.record(b,'auto');
  assert.equal(savedB.created,true);
  const second=history.create({indexedDB:db,now:()=>13000});
  assert.deepEqual((await second.list()).map(e=>e.id),[savedB.entry.id,stored.entry.id]);
  assert.equal((await second.get(savedB.entry.id)).features.mode,'compare');
  const upgraded=await second.record(b,'manual');
  assert.equal(upgraded.created,false);
  assert.equal(upgraded.entry.id,savedB.entry.id);
  assert.equal((await second.get(savedB.entry.id)).pinned,true);
  assert.equal((await second.get(savedB.entry.id)).source,'manual');
});
test('Recovery reuses an older identical snapshot even when another state is newer',async()=>{
  const h=history.create({indexedDB:indexedDB(),now:()=>123});
  const original=experiment('compare');
  const first=await h.record(original,'auto');
  const changed=structuredClone(original);changed.scene.camera.Height=99;
  await h.record(changed,'manual');
  const checkpoint=await h.record(original,'recovery');
  assert.equal(checkpoint.created,false);
  assert.equal(checkpoint.entry.id,first.entry.id);
  assert.equal(checkpoint.entry.pinned,true);
  assert.equal(checkpoint.entry.source,'recovery');
  assert.equal((await h.list()).length,2);
  const again=await h.record(original,'recovery');
  assert.equal(again.created,false);
  assert.equal((await h.list()).length,2);
});
test('Automatic history limit prunes only old unpinned auto entries, not manual/recovery',async()=>{
  const db=indexedDB(),h=history.create({indexedDB:db,maxAutoEntries:2});
  const manual=await h.record(experiment(),'manual');
  for(let i=1;i<=4;i++){
    const item=experiment();item.scene.objects.ObjDist[0]=i*100;
    await h.record(item,'auto');
  }
  assert.equal((await h.list()).filter(e=>e.source==='auto').length,2);
  assert.ok(await h.get(manual.entry.id));
  const recovery=await h.record(experiment('compare'),'recovery');
  assert.equal(recovery.entry.pinned,true);
  assert.equal(await h.clearAuto(),2);
  assert.deepEqual((await h.list()).map(e=>e.source),['recovery','manual']);
  assert.equal(await h.remove(manual.entry.id),true);
  assert.equal(await h.remove(manual.entry.id),false);
});
test('Failed IndexedDB writes reject and cannot mutate existing history entries',async()=>{
  const db=indexedDB(),h=history.create({indexedDB:db});
  const original=await h.record(experiment(),'manual');
  db.failAdd=true;
  await assert.rejects(h.record(experiment('compare'),'recovery'),/Quota exceeded/);
  assert.equal((await h.list()).length,1);
  assert.deepEqual((await h.get(original.entry.id)).experiment,experiment());
  await assert.rejects(history.create({}).record(experiment(),'manual'),/IndexedDB unavailable/);
  assert.throws(()=>h.record({...experiment(),version:999},'manual'),/Unsupported experiment/);
  assert.throws(()=>h.record(experiment(),'other'),/Invalid history source/);
});
test('Modern panel integrates separately from library and never rewrites existing experiment schema',()=>{
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const id of ['ModernHistoryPanel','ModernHistoryToggle','ModernSnapshotSave','ModernSnapshotSaveBar','ModernSnapshotSaveStatus','ModernHistorySelect',
    'ModernHistoryRestore','ModernHistoryDelete','ModernHistoryClearAuto','ModernHistoryStatus'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.ok(html.indexOf('ModernSnapshotSaveBar')>html.indexOf('ModernCompareViews'));
  assert.ok(html.indexOf('ModernSnapshotSaveBar')>html.indexOf('ModernHistoryPanel'));
  assert.doesNotMatch(html,/id="ModernHistorySave"/);
  assert.ok(html.indexOf('ModernExperimentFingerprint.js')<html.indexOf('ModernExperimentHistory.js'));
  assert.ok(html.indexOf('ModernExperimentHistory.js')<html.indexOf('ModernApp.js'));
  assert.match(app,/experimentHistory\.record\(current,'recovery',historyThumbnail\(current\)\)\.then\(function\(backup\)/);
  assert.match(app,/queueHistoryAuto\(\)/);
  assert.equal(state.VERSION,1);
});

test('Live Modern integration saves and restores a full experiment and protects current state first',async()=>{
  const vm=require('node:vm');
  const db=indexedDB();
  const ids=['ModernStatus','ModernCurvatureLabel','ModernViewInfo','ModernModePill',
    'ModernOcclusionWrap','ModernSceneTab','ModernCompareTab','ModernCompareMessage',
    'ModernGraphHost','ModernCompareViews','ModernBackToScene','ModernHeight','ModernFocal',
    'ModernPan','ModernNick','ModernOcclusion','ModernCameraAim','ModernAtmosphere',
    'ModernGrid','ModernCurvature','ModernEarth','ModernRender','ModernRoll','ModernViewAngle',
    'ModernRadiusKm','ModernFlat','ModernPreset','ModernResetPreset','ModernObjectFields0',
    'ModernObjectFields1','ModernSceneTitle','ModernSceneDescription','ModernCompareLabelA',
    'ModernCompareLabelB','ModernCompareStatusA','ModernCompareStatusB',
    'ModernSceneSettings','ModernCompareSettings','ModernPairPreset','ModernModelTabA',
    'ModernModelTabB','ModernModelCurvature','ModernModelCurvatureLabel','ModernModelFlat',
    'ModernModelEarth','ModernModelRadius','ModernModelAtmosphere','ModernModelOcclusionWrap',
    'ModernModelOcclusion','ModernRecalculateCompare','ModernCompareEyeLevel','ModernCompareHorizon',
    'ModernCopyExperiment','ModernResetExperiment','ModernPersistenceStatus',
    'ModernHorizonStatusA','ModernHorizonStatusB',
    'ModernHistoryPanel','ModernHistoryToggle','ModernHistoryClose','ModernSnapshotSave',
    'ModernSnapshotSaveBar','ModernSnapshotSaveStatus',
    'ModernHistorySelect','ModernHistoryRestore','ModernHistoryDelete','ModernHistoryClearAuto',
    'ModernHistoryStatus','ModernHistoryGallery','ModernHistorySize','ModernHistorySort',
    'ModernHistoryFilterQuery','ModernHistoryFilterMode','ModernHistoryFilterGeometry',
    'ModernHistoryFilterAtmosphere','ModernHistoryFilterGeometryRelation',
    'ModernHistoryFilterRefractionRelation','ModernHistoryFiltersClear','ModernHistoryFilterCount',
    'ModernHistoryPinChecked','ModernHistoryDeleteChecked',
    'ModernHistorySelectVisible','ModernHistoryClearChecked','ModernHistoryQueueChecked',
    'ModernHistoryQueueCount','ModernHistoryQueueClear','ModernHistoryStoryboardQueue',
    'ModernHistoryPin','ModernHistoryClearAll','ModernHistoryMultiCount',
    'ModernHistoryMetadataDialog','ModernHistoryMetadataForm','ModernHistoryMetadataName',
    'ModernHistoryMetadataDescription','ModernHistoryMetadataCancel','ModernHistoryMetadataSave',
    'ModernHistoryMetadataError'];
  const nodes=new Map(ids.map(id=>[id,{id,value:'',min:'',max:'',checked:true,
    hidden:false,textContent:'',children:[],listeners:{},classList:{toggle(){},remove(){}},
    addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(key,value){this[key]=value;},
    appendChild(child){this.children.push(child);},closest(){return {set hidden(value){}};}}]));
  Object.defineProperty(nodes.get('ModernHistoryStoryboardQueue'),'textContent',{
    get(){return '';},set(value){if(value==='')this.children=[];}
  });
  Object.defineProperty(nodes.get('ModernHistoryGallery'),'textContent',{
    get(){return '';},set(value){if(value==='')this.children=[];}
  });
  nodes.get('ModernPreset').value='pontchartrain';
  Object.assign(nodes.get('ModernHistoryMetadataDialog'),{
    showModal(){this.open=true;},close(){this.open=false;if(this.listeners.close)this.listeners.close();}});
  const href='https://example.org/CurvatureModern.html';
  const location={href,search:'',assign(){}};
  const historyApi={state:null,replaceState(state,_title,url){this.state=state;location.href=url;location.search=new URL(url).search;}};
  function Model(){Object.assign(this,{Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Experiment',Description:'',
    ObjType:[3,3],NObjects:[85,2],ObjDist:[50,20000],ObjDeltaDist:[297.55,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0],Update(){}});}
  let onload;
  const renderedCanvas={width:800,height:500,getContext(){return {save(){},restore(){},setTransform(){},
    beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(){}};}};
  const rootWindow={CurveAppClass:Model,
    CurvatureModernSceneState:null,
    CurvatureModernCompareModel:require('../src/ui/modern/ModernCompareModel'),
    CurvatureModernCompareState:compare,CurvatureModernExperimentState:state,
    CurvatureModernExperimentHistory:history,
    CurvatureModernExperimentHistoryUI:require('../src/ui/modern/ModernExperimentHistoryUI'),
    CurvatureModernExperimentHistoryFilters:require('../src/ui/modern/ModernExperimentHistoryFilters'),
    CurvatureModernApplicationPreferences:require('../src/ui/modern/ModernApplicationPreferences'),
    CurvatureModernExperimentFingerprint:fingerprint,
    CurvatureModernExperimentThumbnail:require('../src/ui/modern/ModernExperimentThumbnail'),
    CurvaturePhysicalSceneOptics:{create(){return {}; }},
    CurvatureMainCanvasRenderer:{renderPhysical(){return {drawn:10,fillTriangles:5,unresolved:0};}},
    CurvaturePhysicalCurvature:{modelStep(){return 164;},label(){return 'Earth';}},
    NewGraphX3D(params){return {Canvas:renderedCanvas,
      Redraw(){params.DrawFunc({Canvas:renderedCanvas});}};},
    xOnLoad(fn){onload=fn;},
    console:{error(){}},location,history:historyApi,indexedDB:db,confirm(){return true;},
    localStorage:{data:new Map(),getItem(key){return this.data.get(key)||null;},
      setItem(key,value){this.data.set(key,value);},removeItem(key){this.data.delete(key);}}};
  rootWindow.window=rootWindow;
  const document={getElementById(id){return nodes.get(id)||null;},
    querySelector(selector){return selector[0]==='#'?nodes.get(selector.slice(1))||null:null;},
    createElement(name){if(name==='canvas')return {width:0,height:0,
      getContext(){return {fillRect(){},fillText(){},drawImage(){}};},
      toDataURL(){return 'data:image/webp;base64,YQ==';}};
      return {value:'',textContent:'',children:[],style:{},listeners:{},
        appendChild(child){this.children.push(child);return child;},
        setAttribute(key,value){this[key]=value;},getAttribute(key){return this[key];},
        addEventListener(type,fn){this.listeners[type]=fn;}};}};
  const ctx={window:rootWindow,document,URL,URLSearchParams,
    requestAnimationFrame(fn){return setTimeout(()=>fn(Date.now()),0);},
    cancelAnimationFrame(id){clearTimeout(id);},setTimeout,clearTimeout,console};
  vm.runInNewContext(fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8'),ctx);
  const app=rootWindow.CurvatureModernApp;
  for(const side of ['A','B']){
    const sideCanvas={width:800,height:500,getContext(){return {save(){},restore(){},
      setTransform(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(){}};}};
    app.registerCompareGraph(side,{Canvas:sideCanvas,UpdateCanvasSize(){},
      Redraw(){app.drawCompare(side,{id:side,Canvas:sideCanvas});}});
  }
  onload();
  // The real HTML starts with History hidden; open it explicitly before
  // asserting gallery layout and interaction (rather than relying on a stub).
  nodes.get('ModernHistoryToggle').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,25)); // allow accurate scheduled redraw to complete
  const store=app.getHistoryStore();assert.ok(store);
  nodes.get('ModernSnapshotSave').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,60));
  const list=await store.list();assert.equal(list.length,1);assert.equal(list[0].source,'manual');
  assert.equal(list[0].thumbnail.mode,'scene','actual completed render is captured by Save');
  assert.equal(list[0].thumbnail.width,480);
  const id=list[0].id;
  assert.equal(nodes.get('ModernSnapshotSave').hidden,true,'existing saved experiment hides Save');
  assert.match(nodes.get('ModernSnapshotSaveStatus').textContent,/Already in History/);
  // Rename through the real card action and form, not just through the store.
  const renameSections=nodes.get('ModernHistoryGallery').children.filter(
    node=>node.className==='modern-history-section');
  const renameCard=renameSections.at(-2).children[1].children[0];
  const editButton=renameCard.children[3].children[2].children[1];
  editButton.listeners.click({stopPropagation(){}});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(nodes.get('ModernHistoryMetadataDialog').open,true);
  nodes.get('ModernHistoryMetadataName').value='Inversion study';
  nodes.get('ModernHistoryMetadataDescription').value='Observed at 15 m';
  nodes.get('ModernHistoryMetadataForm').listeners.submit({preventDefault(){}});
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(nodes.get('ModernHistoryMetadataDialog').open,false);
  assert.equal((await store.get(id)).name,'Inversion study');
  assert.equal((await store.get(id)).description,'Observed at 15 m');
  assert.ok(nodes.get('ModernHistorySelect').children.some(node=>/Inversion study/.test(node.textContent)),
    'named snapshot appears in the selection menu');
  assert.equal(nodes.get('ModernSnapshotSave').hidden,true,
    'renaming never changes the active experiment signature');
  // Cancelling a subsequent edit must not persist the partial form data.
  const currentSections=nodes.get('ModernHistoryGallery').children.filter(
    node=>node.className==='modern-history-section');
  currentSections.at(-2).children[1].children[0].children[3].children[2].children[1]
    .listeners.click({stopPropagation(){}});
  await new Promise(resolve=>setTimeout(resolve,12));
  nodes.get('ModernHistoryMetadataName').value='Unsaved draft';
  nodes.get('ModernHistoryMetadataCancel').listeners.click();
  assert.equal((await store.get(id)).name,'Inversion study');
  app.getModel().Height=66;
  nodes.get('ModernRender').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(nodes.get('ModernSnapshotSave').hidden,false,
    'changing camera creates a new full experiment without auto-history');
  nodes.get('ModernHistorySelect').value=String(id);
  db.failAdd=true;
  nodes.get('ModernHistoryRestore').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,60));
  assert.equal(app.getModel().Height,66,'failed recovery must block restoration');
  assert.match(nodes.get('ModernHistoryStatus').textContent,/Quota exceeded/);
  db.failAdd=false;
  const gallery=nodes.get('ModernHistoryGallery');
  assert.equal(gallery['data-size'],'small','compact is the default gallery density');
  const sections=gallery.children.filter(x=>x.className==='modern-history-section');
  const card=sections[0].children[1].children.find(x=>x['data-snapshot-id']===String(id));
  // Manual checkpoints are pinned by the existing History policy.
  assert.ok(card,'manual snapshot appears in the real rendered gallery');
  card.children[0].listeners.dblclick({stopPropagation(){}});
  await new Promise(resolve=>setTimeout(resolve,60));
  assert.equal(app.getModel().Height,15,'double-click restores through guarded path');
  nodes.get('ModernHistoryRestore').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,60));
  assert.equal((await store.list()).length,2,'toolbar Restore of active state is a no-op');
  const sizeControl=nodes.get('ModernHistorySize');
  sizeControl.value='large';sizeControl.listeners.change();
  assert.equal(gallery['data-size'],'large');
  assert.equal(JSON.parse(rootWindow.localStorage.data.get('curvature-modern-application-preferences-v1')).historyGallerySize,'large');
  const entries=await store.list();
  assert.equal(entries.length,2);
  assert.equal(entries[0].source,'recovery');
  assert.equal(entries[0].experiment.scene.camera.Height,66);
  assert.equal(entries[0].pinned,true);
  // An actual physical edit produces one debounced automatic snapshot.
  nodes.get('ModernAtmosphere').value='vacuum';
  nodes.get('ModernAtmosphere').listeners.change.call(nodes.get('ModernAtmosphere'));
  await new Promise(resolve=>setTimeout(resolve,1700));
  const auto=await store.list();
  assert.equal(auto.length,3);
  assert.equal(auto[0].source,'auto');
  assert.equal(auto[0].experiment.scene.atmosphere,'vacuum');
  assert.equal(nodes.get('ModernSnapshotSave').hidden,true,
    'new automatic History entry is recognized as saved');
  // Camera-only movement and a manual redraw must not flood the history.
  app.getModel().Height=22;
  nodes.get('ModernRender').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,1700));
  assert.equal((await store.list()).length,3);
  // A genuine two-view Compare render is saved as one labelled composite.
  nodes.get('ModernCompareTab').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(app.getMode(),'compare');
  nodes.get('ModernSnapshotSave').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,70));
  const pair=(await store.list())[0];
  assert.equal(pair.features.mode,'compare');
  assert.equal(pair.thumbnail.mode,'compare');
  assert.equal(pair.thumbnail.width,960);
  // Search and filters affect both gallery and select, never IndexedDB/physics.
  const count=nodes.get('ModernHistoryFilterCount');
  assert.equal(count.textContent,'Showing 4 of 4 snapshots');
  const query=nodes.get('ModernHistoryFilterQuery');
  query.value='Inversion study';query.listeners.input();
  await new Promise(resolve=>setTimeout(resolve,230));
  assert.equal(count.textContent,'Showing 1 of 4 snapshots');
  assert.equal(nodes.get('ModernHistorySelect').children.at(-1).value,String(id),
    'latest selection option is the one matching named snapshot');
  assert.match(nodes.get('ModernHistoryGallery').children.at(-1).className,/modern-history-section/);
  assert.equal(rootWindow.localStorage.data.size>0,true);
  assert.equal(JSON.parse(rootWindow.localStorage.data.get('curvature-modern-application-preferences-v1')).historyFilters.query,'Inversion study');
  query.value='not found anywhere';query.listeners.input();
  await new Promise(resolve=>setTimeout(resolve,230));
  assert.equal(count.textContent,'Showing 0 of 4 snapshots');
  assert.match(nodes.get('ModernHistoryGallery').children.at(-1).textContent,/No snapshots match/);
  nodes.get('ModernHistoryFiltersClear').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(count.textContent,'Showing 4 of 4 snapshots');
  assert.equal(query.value,'');
  const kind=nodes.get('ModernHistoryFilterMode');
  kind.value='compare';kind.listeners.change();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(count.textContent,'Showing 1 of 4 snapshots');
  const geometry=nodes.get('ModernHistoryFilterGeometry');
  geometry.value='flat';geometry.listeners.change();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(count.textContent,'Showing 1 of 4 snapshots');
  const atmosphere=nodes.get('ModernHistoryFilterAtmosphere');
  atmosphere.value='inverse-spherical';atmosphere.listeners.change();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(count.textContent,'Showing 0 of 4 snapshots');
  assert.equal((await store.list()).length,4,'filtering does not rewrite History');
  // Compare-only relation filters operate on the existing canonical A/B flags.
  nodes.get('ModernHistoryFiltersClear').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,35));
  const geometryRelation=nodes.get('ModernHistoryFilterGeometryRelation');
  const refractionRelation=nodes.get('ModernHistoryFilterRefractionRelation');
  geometryRelation.value=pair.features.relations.geometrySame?'same':'different';
  geometryRelation.listeners.change();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(count.textContent,'Showing 1 of 4 snapshots');
  assert.equal(nodes.get('ModernHistorySelect').children.at(-1).value,String(pair.id));
  refractionRelation.value=pair.features.relations.refractionSame?'same':'different';
  refractionRelation.listeners.change();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(count.textContent,'Showing 1 of 4 snapshots');
  assert.equal(JSON.parse(rootWindow.localStorage.data.get(
    'curvature-modern-application-preferences-v1')).historyFilters.geometryRelation,
    geometryRelation.value);
  refractionRelation.value=pair.features.relations.refractionSame?'different':'same';
  refractionRelation.listeners.change();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(count.textContent,'Showing 0 of 4 snapshots');
  kind.value='scene';kind.listeners.change();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(geometryRelation.value,'any','Scene clears Compare-only conditions');
  assert.equal(refractionRelation.value,'any');
  assert.equal(count.textContent,'Showing 3 of 4 snapshots');
  geometryRelation.value='different';geometryRelation.listeners.change();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(kind.value,'compare','selecting A/B relation in Scene switches to Compare');
  assert.equal(count.textContent,'Showing 1 of 4 snapshots');
  nodes.get('ModernHistoryFiltersClear').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(count.textContent,'Showing 4 of 4 snapshots');
  // Storyboard picks are separate from temporary bulk selection and persist
  // as ordered stable IDs, even while collecting from different filters.
  kind.value='compare';kind.listeners.change();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(nodes.get('ModernHistorySelectVisible').disabled,false);
  nodes.get('ModernHistorySelectVisible').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(nodes.get('ModernHistoryMultiCount').textContent,'1 shown snapshot selected');
  nodes.get('ModernHistoryQueueChecked').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,45));
  assert.equal(nodes.get('ModernHistoryQueueCount').textContent,'1 frame');
  let queue=JSON.parse(rootWindow.localStorage.data.get(
    'curvature-modern-application-preferences-v1')).historyStoryboardQueue;
  assert.deepEqual(queue,[pair.id]);
  kind.value='scene';kind.listeners.change();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(nodes.get('ModernHistoryMultiCount').textContent,'0 shown snapshots selected',
    'changing filters resets temporary bulk selection but retains shortlist');
  assert.equal(nodes.get('ModernHistoryQueueCount').textContent,'1 frame');
  nodes.get('ModernHistorySelectVisible').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(nodes.get('ModernHistoryMultiCount').textContent,'3 shown snapshots selected');
  assert.equal(nodes.get('ModernHistorySelectVisible').disabled,true);
  nodes.get('ModernHistoryQueueChecked').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,50));
  queue=JSON.parse(rootWindow.localStorage.data.get(
    'curvature-modern-application-preferences-v1')).historyStoryboardQueue;
  const sceneRecords=(await store.list()).filter(e=>e.features.mode==='scene');
  const shownScene=[...sceneRecords.filter(e=>e.pinned),...sceneRecords.filter(e=>!e.pinned)];
  assert.deepEqual(queue,[pair.id,...shownScene.map(e=>e.id)],
    'shortlist follows displayed Pinned then Recent order, not numeric IDs');
  assert.equal(nodes.get('ModernHistoryStoryboardQueue').children.length,4);
  nodes.get('ModernHistorySelectVisible').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,35));
  nodes.get('ModernHistoryQueueChecked').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.deepEqual(JSON.parse(rootWindow.localStorage.data.get(
    'curvature-modern-application-preferences-v1')).historyStoryboardQueue,queue,
    're-adding a checked card never duplicates or reorders earlier picks');
  const storyboardList=nodes.get('ModernHistoryStoryboardQueue');
  storyboardList.children[1].children[3].children[0].listeners.click({stopPropagation(){}});
  assert.equal(JSON.parse(rootWindow.localStorage.data.get(
    'curvature-modern-application-preferences-v1')).historyStoryboardQueue[0],shownScene[0].id,
    'moving a picked frame changes saved order without rewriting a snapshot');
  // Bulk operations cannot silently delete pinned or filtered-out records.
  nodes.get('ModernHistorySelectVisible').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,35));
  nodes.get('ModernHistoryDeleteChecked').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.match(nodes.get('ModernHistoryStatus').textContent,/Unpin selected pinned snapshots/);
  assert.equal((await store.list()).length,4);
  const pinnedGroup=nodes.get('ModernHistoryGallery').children[0];
  pinnedGroup.children[0].children[0].listeners.click({stopPropagation(){}});
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(nodes.get('ModernHistoryMultiCount').textContent,'0 shown snapshots selected',
    'collapsing Pinned clears all checkboxes before bulk operations');
  nodes.get('ModernHistorySelectVisible').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(nodes.get('ModernHistoryMultiCount').textContent,'1 shown snapshot selected',
    'Select shown excludes cards inside collapsed Pinned');
  nodes.get('ModernHistoryClearChecked').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,35));
  nodes.get('ModernHistoryGallery').children[0].children[0].children[0]
    .listeners.click({stopPropagation(){}});
  await new Promise(resolve=>setTimeout(resolve,35));
  // A vanished History record is pruned from the shortlist, but surviving IDs
  // retain their established relative sequence.
  const automatic=sceneRecords.find(e=>e.source==='auto');
  assert.ok(automatic);
  await store.remove(automatic.id);
  nodes.get('ModernHistoryClearChecked').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,35));
  const afterPrune=JSON.parse(rootWindow.localStorage.data.get(
    'curvature-modern-application-preferences-v1')).historyStoryboardQueue;
  assert.ok(!afterPrune.includes(automatic.id));
  assert.equal(afterPrune.length,3);
  nodes.get('ModernHistoryQueueClear').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(nodes.get('ModernHistoryQueueCount').textContent,'0 frames');
  assert.deepEqual(JSON.parse(rootWindow.localStorage.data.get(
    'curvature-modern-application-preferences-v1')).historyStoryboardQueue,[]);
  // Collect in oldest-first order: Pinned/Recent grouping still determines
  // the displayed sequence and therefore the future Storyboard frame order.
  kind.value='all';kind.listeners.change();
  await new Promise(resolve=>setTimeout(resolve,35));
  const sort=nodes.get('ModernHistorySort');sort.value='oldest';sort.listeners.change();
  await new Promise(resolve=>setTimeout(resolve,35));
  nodes.get('ModernHistorySelectVisible').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,35));
  nodes.get('ModernHistoryQueueChecked').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,50));
  const remaining=await store.list();
  const ordered=[...remaining.filter(e=>e.pinned).reverse(),
    ...remaining.filter(e=>!e.pinned).reverse()];
  assert.deepEqual(JSON.parse(rootWindow.localStorage.data.get(
    'curvature-modern-application-preferences-v1')).historyStoryboardQueue,
    ordered.map(e=>e.id));
  nodes.get('ModernHistoryQueueClear').listeners.click();
  await new Promise(resolve=>setTimeout(resolve,35));
});

test('Visual History attaches bounded screenshots, upgrades deduplicated entries, pins and clears explicitly',async()=>{
  const db=indexedDB(),h=history.create({indexedDB:db});
  const a=experiment('scene'),image={mode:'scene',width:320,height:200,
    dataUrl:'data:image/webp;base64,YQ=='};
  const initial=await h.record(a,'auto');
  assert.equal(initial.entry.thumbnail,null);
  const upgrade=await h.record(a,'manual',image);
  assert.equal(upgrade.created,false);
  assert.deepEqual((await h.get(initial.entry.id)).thumbnail,image);
  assert.equal((await h.get(initial.entry.id)).pinned,true);
  assert.throws(()=>h.record(experiment('compare'),'manual',image),/Invalid experiment thumbnail/);
  const b=await h.record(experiment('compare'),'auto');
  assert.equal((await h.list()).length,2);
  assert.equal(await h.pin(b.entry.id,true),true);
  assert.equal((await h.get(b.entry.id)).pinned,true);
  assert.equal(await h.clearAuto(),0,'pinned automatic snapshots must be preserved');
  assert.equal(await h.pin(b.entry.id,false),true);
  assert.equal(await h.clearAuto(),1);
  assert.equal((await h.list()).length,1);
  assert.equal(await h.clearAll(),1);
  assert.equal((await h.list()).length,0);
});

test('Manual Save reuses matching older snapshot, upgrades automatic entry and does not duplicate',async()=>{
  const db=indexedDB(),h=history.create({indexedDB:db});
  const scene=experiment('scene'),comparison=experiment('compare');
  const first=await h.record(scene,'auto');
  await h.record(comparison,'manual');
  const again=await h.record(scene,'manual');
  assert.equal(again.created,false);
  assert.equal(again.entry.id,first.entry.id);
  assert.equal(again.entry.source,'manual');
  assert.equal(again.entry.pinned,true);
  assert.equal((await h.list()).length,2);
  // A later automatic snapshot still records real chronological changes.
  const auto=await h.record(scene,'auto');
  assert.equal(auto.created,true);
  assert.equal((await h.list()).length,3);
});

test('Named snapshots persist independently of experiment state and survive deduplication',async()=>{
  const db=indexedDB(),store=history.create({indexedDB:db,now:()=>1710000000000});
  const original=await store.record(experiment('compare'),'manual');
  const before=await store.get(original.entry.id);
  assert.equal(before.name,'');assert.equal(before.description,'');
  const updated=await store.updateMetadata(before.id,'  Refracted horizon  ',
    '  Compare the same camera with different atmosphere.\r\nKeep for animation.  ');
  assert.equal(updated.name,'Refracted horizon');
  assert.equal(updated.description,'Compare the same camera with different atmosphere.\nKeep for animation.');
  assert.equal(updated.id,before.id);
  for(const key of ['experiment','signature','physicalSignature','features','thumbnail',
    'pinned','createdAt','version'])assert.deepEqual(updated[key],before[key]);
  const reopened=history.create({indexedDB:db});
  const persisted=await reopened.get(before.id);
  assert.equal(persisted.name,'Refracted horizon');
  assert.match(persisted.description,/Keep for animation/);
  const reused=await reopened.record(experiment('compare'),'manual');
  assert.equal(reused.created,false);
  assert.equal(reused.entry.name,'Refracted horizon');
  assert.equal((await reopened.list()).length,1);
  assert.equal(await reopened.pin(before.id,false),true);
  assert.equal((await reopened.get(before.id)).name,'Refracted horizon');
  const cleared=await reopened.updateMetadata(before.id,'','');
  assert.equal(cleared.name,'');assert.equal(cleared.description,'');
});

test('Metadata edits validate user input before IndexedDB writes and do not alter old records',async()=>{
  const db=indexedDB(),store=history.create({indexedDB:db});
  const created=await store.record(experiment(),'auto'),id=created.entry.id;
  // Existing schema-v1 records had no metadata fields.
  const legacy=structuredClone(db.records.get(id));delete legacy.name;delete legacy.description;
  db.records.set(id,legacy);
  assert.equal((await store.get(id)).name,undefined);
  assert.ok(await store.updateMetadata(id,'  Lake study  ','    '));
  const saved=await store.get(id);
  assert.equal(saved.name,'Lake study');assert.equal(saved.description,'');
  assert.equal(saved.pinned,false);assert.equal(saved.source,'manual',
    'annotating an automatic entry protects it from auto-pruning without pinning');
  assert.equal(await store.clearAuto(),0);
  assert.throws(()=>store.updateMetadata(id,'x'.repeat(history.MAX_NAME+1),''),/name exceeds/);
  assert.throws(()=>store.updateMetadata(id,'ok','x'.repeat(history.MAX_DESCRIPTION+1)),/description exceeds/);
  assert.throws(()=>store.updateMetadata(id,null,''),/must be text/);
  assert.deepEqual(await store.get(id),saved,'rejected changes leave stored metadata untouched');
  assert.equal(await store.updateMetadata(99999,'Missing',''),null);
  await assert.rejects(store.updateMetadata(-1,'Bad',''),/Invalid snapshot id/);
  assert.equal((await store.get(id)).name,'Lake study');
});

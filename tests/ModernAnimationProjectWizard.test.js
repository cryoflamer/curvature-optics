'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const state=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const wizard=require('../src/animation/ModernAnimationProjectWizard');
const contracts=require('../src/animation/ModernAnimationContract');
const projects=require('../src/animation/ModernAnimationProject');
const studio=require('../src/animation/ModernAnimationStudio');
const autosave=require('../src/animation/ModernAnimationDraftAutosave');
const ui=require('../src/ui/modern/ModernAnimationProjectWizardUI');
const copy=structuredClone;
const basePath=path.join(__dirname,'..');
function snapshot(mode='scene',atmosphere='temperature-lapse'){
  const model={Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Base',Description:'',
    ObjType:[3,3],NObjects:[2,0],ObjDist:[50,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[10,10],ObjSizeVar:[0,0]};
  return state.capture(model,{atmosphere,occlusionRadius:6371000,
    preset:'custom',resetPreset:'single'},compare.preset('globe-flat-vacuum'),
    {mode,eyeLevel:true,horizon:true,selected:'A'});
}
const entry=(id,experiment,name)=>({id,experiment,name:name||'Snapshot '+id});
function withRef(mode='camera',ref=snapshot(),id=1){
  let w=wizard.mode(wizard.initial(),mode);
  return wizard.reference(w,ref,id,'Reference');
}

test('Wizard requires explicit reference and validated channel before advancing',()=>{
  let w=wizard.initial();
  assert.equal(w.step,0);assert.equal(w.mode,'camera');
  assert.throws(()=>wizard.navigate(w,2),/step/);
  w=wizard.navigate(w,1);
  assert.throws(()=>wizard.navigate(w,2),/reference/);
  w=wizard.reference(w,snapshot(),1,'Base');
  w=wizard.navigate(w,2);assert.equal(w.step,2);
  w=wizard.mode(w,'physical');
  assert.throws(()=>wizard.navigate(w,3),/channel/);
  assert.ok(wizard.targets(w).some(t=>t.value==='scene|surface.curvature'));
  w=wizard.chooseTarget(w,'scene|surface.curvature');
  assert.equal(wizard.navigate(w,3).step,3);
  assert.throws(()=>wizard.chooseTarget(w,'B|surface.curvature'),/not active/);
});

test('Camera wizard accepts moving camera and zoom but rejects scene and atmosphere changes',()=>{
  const a=snapshot(),b=copy(a),physics=copy(a),objects=copy(a);
  b.scene.camera.Height=80;b.scene.camera.FocalLengthField+=250;
  physics.scene.temperatureProfile.gradientKPerKm+=1;
  objects.scene.objects.ObjDist[0]+=10;
  let w=withRef('camera',a);
  const entries=[entry(2,b,'Move'),entry(3,physics,'Atmosphere'),entry(4,objects,'Objects')];
  assert.equal(wizard.check(w,entries[0]).allowed,true);
  assert.equal(wizard.check(w,entries[1]).allowed,false);
  assert.equal(wizard.check(w,entries[2]).allowed,false);
  assert.throws(()=>wizard.toggle(w,3,entries),/violates/);
  assert.throws(()=>wizard.toggle(w,4,entries),/violates/);
  w=wizard.toggle(w,2,entries);w=wizard.patch(w,'name','Camera motion');
  const p=wizard.build(w,entries);
  assert.equal(p.version,2);assert.equal(p.mode,'camera');
  assert.deepEqual(p.keyframes.map(f=>f.sourceSnapshotId),[1,2]);
  assert.equal(projects.ready(p),true);
  assert.equal(projects.sampleAt(p,2500).scene.camera.Height,47.5);
  assert.equal(w.selectedIds.length,1,'build does not change transient wizard selection');
  const removed=wizard.toggle(w,2,entries);
  assert.deepEqual(removed.selectedIds,[]);
});

test('Physical wizard offers only active Scene/Compare channels and does not allow zoom',()=>{
  const base=snapshot();let w=withRef('physical',base);
  assert.deepEqual(wizard.targets(w).map(t=>t.value),[
    'scene|surface.curvature','scene|temperatureProfile.gradientKPerKm']);
  w=wizard.chooseTarget(w,'scene|temperatureProfile.gradientKPerKm');
  const b=copy(base);b.scene.temperatureProfile.gradientKPerKm+=5;
  const zoom=copy(b);zoom.scene.camera.FocalLengthField+=1;
  assert.equal(wizard.check(w,entry(2,b)).allowed,true);
  assert.equal(wizard.check(w,entry(3,zoom)).allowed,false);
  w=wizard.toggle(w,2,[entry(2,b)]);w=wizard.patch(w,'name','Lapse');
  assert.equal(projects.ready(wizard.build(w,[entry(2,b)])),true);
  const vacuum=withRef('physical',snapshot('scene','vacuum'));
  assert.deepEqual(wizard.targets(vacuum).map(t=>t.value),['scene|surface.curvature']);
  const compareRef=withRef('physical',snapshot('compare'));
  assert.deepEqual(wizard.targets(compareRef).map(t=>t.value),[
    'A|surface.curvature','B|surface.curvature']);
});

test('Experimental accepts mixed Scene/Compare snapshots; unfinished projects can have zero frames',()=>{
  const a=snapshot(),b=snapshot('compare'),c=copy(a);
  c.scene.objects.NObjects[0]+=1;
  let w=withRef('experimental',a);
  w=wizard.patch(w,'name','Mixed study');
  w=wizard.patch(w,'includeReference',false);
  const blank=wizard.build(w,[]);
  assert.equal(blank.keyframes.length,0);assert.equal(projects.ready(blank),false);
  w=wizard.toggle(w,2,[entry(2,b)]);
  w=wizard.toggle(w,3,[entry(2,b),entry(3,c)]);
  const project=wizard.build(w,[entry(2,b),entry(3,c)]);
  assert.equal(project.mode,'experimental');assert.equal(project.keyframes.length,2);
  assert.equal(project.keyframes[0].value.display.mode,'compare');
  assert.equal(projects.ready(project),false);
  assert.equal(studio.fromProject(project).frames.length,2);
  assert.deepEqual(contracts.validate(project.contract),project.contract);
});

test('Missing selected History entry and changed compatibility fail atomically',()=>{
  const a=snapshot(),b=copy(a);b.scene.camera.Height=75;
  let w=withRef('camera',a);
  w=wizard.toggle(w,2,[entry(2,b)]);w=wizard.patch(w,'name','Safe');
  assert.throws(()=>wizard.build(w,[]),/no longer available/);
  const wrong=copy(b);wrong.scene.objects.ObjDist[0]+=7;
  assert.throws(()=>wizard.build(w,[entry(2,wrong)]),/no longer compatible/);
  assert.equal(wizard.build(w,[entry(2,b)]).keyframes.length,2);
});

test('Wizard retains independent snapshot owned reference, selection order and text limits',()=>{
  const a=snapshot(),b=copy(a),c=copy(a);b.scene.camera.Height=25;c.scene.camera.Height=35;
  const original=copy(a);
  let w=wizard.reference(wizard.initial(),a,null,'Current');
  assert.notEqual(w.reference,a);
  a.scene.objects.ObjDist[0]+=2000;
  assert.deepEqual(w.reference,original);
  w=wizard.toggle(w,3,[entry(2,b),entry(3,c)]);
  w=wizard.toggle(w,2,[entry(2,b),entry(3,c)]);
  w=wizard.patch(w,'includeReference',false);w=wizard.patch(w,'name','From current');
  assert.deepEqual(wizard.build(w,[entry(3,c),entry(2,b)]).keyframes.map(x=>x.sourceSnapshotId),[3,2]);
  assert.throws(()=>wizard.patch(w,'name','x'.repeat(121)),/too long/);
  assert.throws(()=>wizard.mode(w,'other'),/Unknown/);
  assert.throws(()=>wizard.navigate(w,5),/step/);
  assert.throws(()=>wizard.build(w,[entry(3,c)]),/no longer available/);
});

test('Created project can roundtrip through autosaved draft; v1 builds remain unchanged',()=>{
  const a=snapshot(),w=wizard.patch(withRef('camera',a),'name','New constrained project');
  const p=wizard.build(w,[]),draft=studio.fromProject(p);
  assert.equal(draft.contract.mode,'camera');assert.equal(draft.frames.length,1);
  assert.deepEqual(studio.buildSaved(draft,'real_id').contract,p.contract);
  const recovered=autosave.normalize(autosave.checkpoint({draft,
    selectedKey:draft.frames[0].key,quality:'auto',prepared:false,positionMs:0},1000));
  assert.deepEqual(recovered.draft.contract,p.contract);
  assert.equal(studio.buildSaved(recovered.draft,'recovered_id').version,2);
  assert.equal(studio.blank().contract,null);
});

function fakeDom(){
  const doc={createElement(tag){
    return {tagName:tag.toUpperCase(),children:[],listeners:{},value:'',checked:false,
      disabled:false,className:'',textContent:'',hidden:false,style:{},
      appendChild(child){this.children.push(child);return child;},
      setAttribute(name,value){this[name]=value;},
      addEventListener(name,cb){this.listeners[name]=cb;}};
  }};
  return {doc,host:doc.createElement('section')};
}
function nodes(host){const out=[];function visit(node){out.push(node);(node.children||[]).forEach(visit);}visit(host);return out;}

test('Wizard UI renders all stages, disabled incompatible frames, and explicit create/cancel callbacks',()=>{
  const {doc,host}=fakeDom();const base=snapshot(),changed=copy(base),bad=copy(base);
  changed.scene.camera.Height=30;bad.scene.objects.ObjDist[0]+=22;
  const entries=[entry(1,base,'Baseline'),entry(2,changed,'Move'),entry(3,bad,'Bad')];
  const calls=[];const actions={cancel:()=>calls.push('cancel'),mode:x=>calls.push(x),
    referenceCurrent:()=>calls.push('current'),reference:x=>calls.push(x),
    openHistory:()=>calls.push('browse'),
    target:x=>calls.push(x),field:(k,v)=>calls.push(k+':'+v),
    toggle:id=>calls.push(id),back:()=>calls.push('back'),next:()=>calls.push('next'),
    finish:()=>calls.push('finish')};
  let w=wizard.initial();ui.render(doc,host,w,entries,base,actions,{});
  assert.ok(nodes(host).some(n=>n.textContent.includes('Camera Motion')));
  assert.ok(nodes(host).some(n=>n.textContent==='Next'&&!n.disabled));
  w=wizard.navigate(w,1);ui.render(doc,host,w,entries,base,actions,{});
  assert.ok(nodes(host).some(n=>n.textContent==='Next'&&n.disabled));
  const browse=nodes(host).find(n=>n.textContent==='Choose reference from History');
  assert.ok(browse);browse.listeners.click();assert.deepEqual(calls,['browse']);calls.length=0;
  assert.equal(nodes(host).some(n=>n.className==='modern-project-wizard-snapshots'),false);
  w=wizard.reference(w,base,1,'Baseline');w=wizard.navigate(w,2);
  w=wizard.navigate(w,3);w=wizard.patch(w,'showIncompatible',true);
  ui.render(doc,host,w,entries,base,actions,{});
  const picker=nodes(host).find(n=>n['data-wizard-picker']!==undefined);
  assert.ok(picker,'the step mounts the shared Snapshot Picker');
  assert.equal(nodes(host).some(n=>n.className==='modern-project-wizard-snapshots'),false);
  assert.equal(nodes(host).some(n=>n.textContent==='Search additional History frames'),false);
  w=wizard.navigate(w,4);w=wizard.patch(w,'name','The project');
  ui.render(doc,host,w,entries,base,actions,{});
  const create=nodes(host).find(n=>n.textContent==='Create project');
  assert.equal(create.disabled,false);create.listeners.click();
  assert.deepEqual(calls,['finish']);
  ui.render(doc,host,null,entries,base,actions,{});
  assert.equal(host.hidden,true);
});

test('Browser wiring loads wizard before ModernApp and contains a dedicated host',()=>{
  const html=fs.readFileSync(path.join(basePath,'CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(basePath,'src/ui/modern/ModernApp.js'),'utf8');
  assert.ok(html.includes('id="ModernAnimationProjectWizard"'));
  assert.ok(html.indexOf('ModernAnimationProjectWizard.js')<html.indexOf('ModernApp.js'));
  assert.ok(html.indexOf('ModernAnimationProjectWizardUI.js')<html.indexOf('ModernApp.js'));
  assert.match(app,/newProject:function\(\)\{openStudioWizard\(\);\}/);
  assert.match(app,/if\(next==='wizard'\)wizardSwitched=true/);
  assert.match(app,/saveNamedAnimation\(false\)/);
  const css=fs.readFileSync(path.join(basePath,'src/ui/modern/ModernApp.css'),'utf8');
  assert.match(css,/\.modern-project-wizard-picker\{[^}]*overflow:visible/s);
  assert.ok(html.includes('id="ModernHistoryUseAsReference"'));
  assert.match(app,/studioUI\.renderPicker\(document,picker,found,/);
});

test('Locked V2 drafts reject incompatible bulk/drag insertions before modifying the timeline',()=>{
  const a=snapshot(),good=copy(a),bad=copy(a);
  good.scene.camera.Height+=20;bad.scene.objects.ObjSize[0]+=1;
  let w=wizard.patch(withRef('camera',a),'name','Locked');
  const first=studio.fromProject(wizard.build(w,[]));
  const unchanged=JSON.stringify(first);
  assert.throws(()=>studio.insertSnapshots(first,[3],[entry(3,bad)],1),/violates project contract/);
  assert.equal(JSON.stringify(first),unchanged,'the original V2 draft must stay untouched');
  const inserted=studio.insertSnapshots(first,[2],[entry(2,good)],1);
  assert.equal(inserted.frames.length,2);assert.equal(studio.inspect(inserted).compatible,true);
  assert.throws(()=>studio.importCamera(a,[
    {name:'Start',camera:a.scene.camera,travelMs:0,holdMs:0,easing:'linear'},
    {name:'End',camera:good.scene.camera,travelMs:1000,holdMs:0,easing:'linear'}],inserted),
    /Locked project contract/);
  const experimental=studio.fromProject(wizard.build(
    wizard.patch(withRef('experimental',a),'name','Research'),[]));
  assert.equal(studio.insertSnapshots(experimental,[3],[entry(3,bad)],1).frames.length,2);
});

test('Locked projects hide unrestricted Camera Import control in Studio',()=>{
  const a=snapshot(),contract=wizard.build(wizard.patch(withRef('camera',a),'name','Locked'),[]);
  const draft=studio.fromProject(contract),{doc,host}=fakeDom();
  const actions={choose(){},importCamera(){},prepare(){},edit(){},frame(){},
    select(){},move(){},remove(){},dragStart(){},dragOver(){},drop(){},dragEnd(){}};
  ui.render(doc,host,wizard.initial(),[],a,{},{});
  const studioUI=require('../src/ui/modern/ModernAnimationStudioUI');
  studioUI.render(doc,host,draft,studio.inspect(draft),actions,false,{entries:[]});
  assert.equal(nodes(host).some(n=>n.textContent==='Replace with Camera Animation…'),false);
});

function switchHarness(libraryFails=false,draftFails=false){
  const source=fs.readFileSync(path.join(basePath,'src/ui/modern/ModernApp.js'),'utf8');
  function excerpt(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);
    assert.ok(a>=0&&b>a,'Missing application integration function');return source.slice(a,b);}
  const code=excerpt('  function saveNamedAnimation(replace){','  // Restore the saved Library revision')+'\n'+
    excerpt('  function requestStudioSwitch(kind,id){','  function deleteStudioWorkspace(id){');
  const vm=require('node:vm');const records=[],checkpoints=[],events=[];
  let drafts=0;
  const ctx={Promise,Map,Set,Object,Array,Number,RangeError,Error,Date,
    studioLibraryBusy:false,studioWorkspaceReady:true,studioWorkspaceId:'draft_old',
    studioDraft:studio.edit(studio.blank(),'name','Old work'),
    studioSelectedKey:null,studioPlaybackQuality:'auto',studioLibraryActive:null,
    studioLibraryPending:null,studioLibrarySelected:'',studioLibraryEntries:[],
    studioLibraryMessage:'',studioLibraryError:false,studioLibraryExpanded:false,
    studioLibraryScroll:0,studioDraftGeneration:0,studioWorkspaces:{workspaces:[]},
    studioPickerOpen:false,studioPickerScroll:0,studioPickerChecked:{},
    studioDragSession:null,studioRemovedFrameUndo:null,studioRestorePreviewPending:false,
    studioPrepared:null,studioPlayback:null,studioFilmstripScroll:0,
    studioDiagnosticTransition:null,studioWizard:{step:4},studioWizardError:'',
    cameraHudAppearance:{opacity:90,position:'top-left',size:100},
    root:{crypto:{},indexedDB:{}},studioApi:studio,studioPlaybackApi:null,
    studioDraftAutosave:{makeWorkspaceId(){return 'draft_'+(++drafts);},
      projectWorkspaceId:id=>'project_'+id},
    studioLibrary:{makeId(){return 'wizard_saved';},
      create(_db,project){if(libraryFails)return Promise.reject(Error('offline'));
        const record={id:project.id,project,quality:'auto',updatedAt:200};
        records.push(record);return Promise.resolve(record);}},
    studioHasUnsavedWork(){return true;},
    renderStudioLibrary(){},renderStudioWizard(){},renderAnimationStudio(){},
    persistStudioWorkspace(){return Promise.resolve(!draftFails);},
    saveStudioDraft(){ctx.studioDraftGeneration++;
      checkpoints.push({id:ctx.studioWorkspaceId,name:ctx.studioDraft.name,
        contract:ctx.studioDraft.contract});return true;},
    studioLibraryThumbnail(){return null;},
    studioLibraryNotice(message){events.push(message);},
    refreshStudioLibrary(){return Promise.resolve([]);},
    stopStudioPlayback(){},syncStudioPlaybackControls(){},syncWorkspaceVisibility(){},
    newUiEl(){return null;},experimentHistory:null,
    dropStudioWorkspace(){},semanticNaming:null,
  };
  vm.createContext(ctx);vm.runInContext(code,ctx);
  return {ctx,records,checkpoints,events,
    async flush(){for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));}};
}

test('Wizard switches only after old draft is persisted, then saves a named V2 Library project',async()=>{
  const a=snapshot(),w=wizard.patch(withRef('camera',a),'name','New project');
  const p=wizard.build(w,[]),h=switchHarness();
  h.ctx.requestStudioSwitch('wizard',p);await h.flush();
  assert.equal(h.records.length,1);assert.equal(h.records[0].project.version,2);
  assert.equal(h.records[0].project.name,'New project');
  assert.equal(h.ctx.studioWorkspaceId,'project_wizard_saved');
  assert.equal(h.ctx.studioLibraryActive.id,'wizard_saved');
  assert.equal(h.ctx.studioLibraryBusy,false);
  assert.deepEqual(h.checkpoints.map(x=>x.name),['Old work','New project','New project']);
  assert.ok(h.checkpoints[0].contract===null);
});

test('Wizard leaves old editor intact on checkpoint failure and retains new draft on Library failure',async()=>{
  const p=wizard.build(wizard.patch(withRef('experimental'),'name','Experiment'),[]);
  const failedDraft=switchHarness(false,true);
  failedDraft.ctx.requestStudioSwitch('wizard',p);await failedDraft.flush();
  assert.equal(failedDraft.records.length,0);
  assert.equal(failedDraft.ctx.studioDraft.name,'Old work');
  assert.equal(failedDraft.ctx.studioWorkspaceId,'draft_old');
  const failedLibrary=switchHarness(true,false);
  failedLibrary.ctx.requestStudioSwitch('wizard',p);await failedLibrary.flush();
  assert.equal(failedLibrary.records.length,0);
  assert.equal(failedLibrary.ctx.studioDraft.name,'Experiment');
  assert.equal(failedLibrary.ctx.studioDraft.contract.mode,'experimental');
  assert.ok(failedLibrary.events.some(x=>/Library save failed/.test(x)));
  assert.equal(failedLibrary.ctx.studioLibraryBusy,false);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const picker=require('../src/ui/modern/ModernAnimationStudioUI');
const wizard=require('../src/animation/ModernAnimationProjectWizard');
const state=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const filters=require('../src/ui/modern/ModernExperimentHistoryFilters');
const read=file=>fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');
function snapshot(){
  const m={Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Base',Description:'',
    ObjType:[3,3],NObjects:[2,0],ObjDist:[50,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[10,10],ObjSizeVar:[0,0]};
  return state.capture(m,{atmosphere:'temperature-lapse',occlusionRadius:6371000,
    preset:'custom',resetPreset:'single'},compare.preset('globe-flat-vacuum'),
    {mode:'scene',eyeLevel:true,horizon:true,selected:'A'});
}
const entry=(id,experiment)=>({id,experiment,name:'Snapshot '+id});
function dom(){
  const doc={createElement(tag){return {tagName:tag,children:[],listeners:{},
    textContent:'',className:'',hidden:false,style:{},value:'',checked:false,
    appendChild(child){this.children.push(child);return child;},
    addEventListener(key,fn){(this.listeners[key]??=[]).push(fn);},
    setAttribute(key,value){this[key]=value;},
    getAttribute(key){return this[key]??null;},
    dispatch(key){const event={stopPropagation(){},preventDefault(){}};
      for(const fn of this.listeners[key]||[])fn(event);}}
  ;}};
  return {doc,host:doc.createElement('div')};
}
function find(node,fn){return [node,...node.children.flatMap(child=>find(child,fn))].filter(fn);}

test('Wizard reuses Snapshot Picker without drag or insertion into the current editor',()=>{
  const {doc,host}=dom(),base=snapshot(),moving=structuredClone(base),bad=structuredClone(base);
  moving.scene.camera.Height=30;bad.scene.objects.ObjDist[0]+=10;
  let w=wizard.reference(wizard.initial(),base,1,'Base');
  const rows=[entry(2,moving),entry(3,bad)],events=[];
  const checks=Object.create(null);
  picker.renderPicker(doc,host,rows,{
    pickerToggle(id){events.push(['toggle',id]);},pickerFilter(){},
    pickerFiltersClear(){},pickerAdvancedToggle(){},
    pickerClearSelection(){},pickerOpenHistory(id){events.push(['history',id]);}
  },{open:true,wizard:true,checked:checks,totalEntries:rows.length,
    compatibility:row=>wizard.check(w,row)});
  const nodes=find(host,()=>true);
  assert.ok(nodes.some(n=>n.textContent==='Choose initial keyframes'));
  assert.ok(nodes.some(n=>n.textContent.includes('Selection is not added to the current timeline')));
  assert.ok(!nodes.some(n=>n.textContent==='Add checked'));
  assert.ok(!nodes.some(n=>n.className==='modern-studio-drag-handle'));
  assert.ok(!nodes.some(n=>n.textContent==='Close Snapshot Picker'));
  const input=nodes.filter(n=>n.className==='modern-studio-picker-checkbox');
  assert.equal(input.length,2);assert.equal(input[0].disabled,false);
  assert.equal(input[1].disabled,true);
  assert.ok(nodes.some(n=>n.className==='modern-studio-picker-incompatibility'&&
    /Objects · ObjDist/.test(n.textContent)));
  input[0].dispatch('change');assert.deepEqual(events,[['toggle',2]]);
  assert.ok(nodes.some(n=>n.textContent==='Open in History'));
});

test('History reference selection is explicit, does not Restore and keeps wizard until success',async()=>{
  const src=read('src/ui/modern/ModernApp.js');
  const a=src.indexOf('  function chooseWizardHistoryReference(){');
  const b=src.indexOf('  function updateHistorySelection(entry){',a);
  assert.ok(a>=0&&b>a);
  const original={step:1,reference:null};const chosen={id:7,name:'Seven',experiment:snapshot()};
  let restored=0,closed=0,rendered=0,scrolled=0,lookup=7;
  const ctx={Promise,Error,RangeError,historyWizardReferenceChoosing:true,
    studioWizard:original,studioWizardError:'',historySelectedId:'7',
    experimentHistory:{get:async()=>lookup===7?chosen:null},
    studioWizardApi:{reference:(w,exp,id,name)=>({...w,reference:exp,referenceId:id,referenceName:name})},
    setHistoryOpen(open){assert.equal(open,false);closed++;ctx.historyWizardReferenceChoosing=false;},
    renderStudioWizard(){rendered++;},
    newUiEl(){return {scrollIntoView(){scrolled++;}};},
    restoreHistorySnapshot(){restored++;}
  };
  vm.createContext(ctx);vm.runInContext(src.slice(a,b),ctx);
  await ctx.chooseWizardHistoryReference();
  assert.equal(ctx.studioWizard.referenceId,7);
  assert.equal(ctx.studioWizard.referenceName,'Seven');
  assert.equal(closed,1);assert.equal(rendered,1);assert.equal(scrolled,1);assert.equal(restored,0);
  await assert.rejects(ctx.chooseWizardHistoryReference(),/No project reference selection/);
  ctx.historyWizardReferenceChoosing=true;ctx.historySelectedId='7';lookup=0;
  await assert.rejects(ctx.chooseWizardHistoryReference(),/no longer available/);
  assert.equal(closed,1,'deleted candidate must not dismiss the selection panel');
});

test('Wizard candidate filters have independent state and cannot weaken physical contract',()=>{
  const a=snapshot(),good=structuredClone(a),bad=structuredClone(a);
  good.scene.camera.Height=20;bad.scene.objects.ObjSize[0]+=15;
  let w=wizard.reference(wizard.initial(),a,1,'Reference');
  w=wizard.navigate(w,1);w=wizard.navigate(w,2);w=wizard.navigate(w,3);
  const rows=[entry(2,good),entry(3,bad)];
  const pickerPrefs=filters.update(filters.normalize(),'geometry','flat');
  const wizardPrefs=filters.update(filters.normalize(),'query','Snapshot');
  const matches=filters.filter(rows,wizardPrefs).filter(row=>wizard.check(w,row).allowed);
  assert.deepEqual(matches.map(e=>e.id),[2]);
  assert.equal(pickerPrefs.geometry,'flat','saved standalone Picker preference unchanged');
  assert.throws(()=>wizard.toggle(w,3,rows),/violates/);
  w=wizard.toggle(w,2,rows);assert.deepEqual(w.selectedIds,[2]);
  const nextPrefs=filters.update(wizardPrefs,'query','unmatched');
  assert.equal(filters.filter(rows,nextPrefs).length,0);
  assert.deepEqual(w.selectedIds,[2],'filter changes never clear the wizard selection');
});

test('Wizard step 4 delegates filtering and selection to the shared Picker without changing normal Picker preferences',()=>{
  const src=read('src/ui/modern/ModernApp.js');
  const a=src.indexOf('  function renderStudioWizard(){');
  const b=src.indexOf('  function renderStudioLibrary(){',a);
  assert.ok(a>=0&&b>a);
  const base=snapshot(),good=structuredClone(base),bad=structuredClone(base);
  good.scene.camera.Height+=12;bad.scene.objects.ObjDist[0]+=12;
  let w=wizard.reference(wizard.initial(),base,1,'Reference');
  w=wizard.navigate(w,1);w=wizard.navigate(w,2);w=wizard.navigate(w,3);
  const picker={querySelector(){return null;}},host={querySelector(query){
    return query==='[data-wizard-picker]'?picker:null;
  }};
  const otherPrefs=filters.update(filters.normalize(),'geometry','flat');
  const captures=[];
  const ctx={Promise,Map,Object,Number,String,RangeError,Error,document:{},experimentPreview:{live:false,animationContext:null},
    studioWizard:w,studioWizardError:'',studioLibraryBusy:false,
    studioWizardPickerFilters:filters.normalize(),studioWizardPickerQueryDraft:'',
    studioWizardPickerAdvancedOpen:false,studioWizardPickerScroll:0,
    studioHistoryEntries:[entry(1,base),entry(2,good),entry(3,bad)],
    studioPickerFilters:otherPrefs,
    studioWizardUI:{render(){}},studioUI:{renderPicker(_doc,_picker,items,actions,options){
      captures.push({items,actions,options});
    }},studioWizardApi:wizard,historyFiltersApi:filters,
    newUiEl(){return host;},experimentSnapshot:()=>base,
    requestStudioSwitch(){throw Error('Unexpected project creation');},
    studioLibraryEntries:[],
    openHistoryFromPicker:async()=>{},setHistoryOpen(){},
  };
  vm.createContext(ctx);vm.runInContext(src.slice(a,b),ctx);
  ctx.renderStudioWizard();
  assert.deepEqual(Array.from(captures.at(-1).items,e=>e.id),[2]);
  captures.at(-1).actions.pickerToggle(2);
  assert.deepEqual(Array.from(ctx.studioWizard.selectedIds),[2]);
  assert.equal(captures.at(-1).options.wizard,true);
  assert.equal(captures.at(-1).options.selectedCount,1);
  captures.at(-1).actions.pickerFilter('query','unmatched');
  assert.equal(captures.at(-1).items.length,0);
  assert.deepEqual(Array.from(ctx.studioWizard.selectedIds),[2]);
  assert.equal(ctx.studioPickerFilters,otherPrefs,'ordinary Studio Picker filters untouched');
  const showIncompatible=wizard.patch(ctx.studioWizard,'showIncompatible',true);
  ctx.studioWizard=showIncompatible;
  captures.at(-1).actions.pickerFiltersClear();
  assert.deepEqual(Array.from(captures.at(-1).items,e=>e.id),[2,3]);
  assert.equal(captures.at(-1).options.compatibility(captures.at(-1).items[1]).allowed,false);
  captures.at(-1).actions.pickerToggle(3);
  assert.deepEqual(Array.from(ctx.studioWizard.selectedIds),[2]);
  assert.match(ctx.studioWizardError,/violates project constraints/);
});

test('Wizard Picker exposes bulk tools without changing normal Studio Picker',()=>{
  const {doc,host}=dom(),base=snapshot(),good=structuredClone(base),bad=structuredClone(base);
  good.scene.camera.Height+=10;bad.scene.objects.ObjDist[0]+=10;
  const w=wizard.reference(wizard.initial(),base,1,'Base');
  const rows=[entry(2,good),entry(3,bad)],events=[];
  function actions(){return {pickerFilter(){},pickerFiltersClear(){},pickerAdvancedToggle(){},
    pickerToggle(){},pickerOpenHistory(){},pickerClearSelection(){events.push('clear');},
    pickerSelectMatching(){events.push('select');},
    pickerDeselectMatching(){events.push('deselect');}};}
  picker.renderPicker(doc,host,rows,actions(),{open:true,wizard:true,
    checked:{2:true},selectedCount:2,totalEntries:rows.length,
    compatibility:row=>wizard.check(w,row)});
  let buttons=find(host,n=>n.tagName==='button');
  assert.equal(buttons.find(n=>n.textContent==='Select all matching').disabled,true,
    'only compatible visible snapshot is already selected');
  assert.equal(buttons.find(n=>n.textContent==='Deselect matching').disabled,false);
  buttons.find(n=>n.textContent==='Deselect matching').dispatch('click');
  buttons.find(n=>n.textContent==='Clear selection').dispatch('click');
  assert.deepEqual(events,['deselect','clear']);
  assert.equal(buttons.some(n=>n.textContent==='Add checked'),false);
  const {doc:d2,host:h2}=dom();
  picker.renderPicker(d2,h2,rows,actions(),{open:true,wizard:false,checked:{},totalEntries:2});
  buttons=find(h2,n=>n.tagName==='button');
  assert.equal(buttons.some(n=>n.textContent==='Select all matching'),false);
  assert.equal(buttons.some(n=>n.textContent==='Deselect matching'),false);
});

test('Wizard bulk picker actions use only filtered entries and preserve other Picker preferences',()=>{
  const src=read('src/ui/modern/ModernApp.js');
  const a=src.indexOf('  function renderStudioWizard(){');
  const b=src.indexOf('  function renderStudioLibrary(){',a);
  const base=snapshot(),good1=structuredClone(base),good2=structuredClone(base),bad=structuredClone(base);
  good1.scene.camera.Height=20;good2.scene.camera.Height=30;
  bad.scene.objects.ObjDist[0]+=100;
  let w=wizard.reference(wizard.initial(),base,1,'Base');
  w=wizard.navigate(w,1);w=wizard.navigate(w,2);w=wizard.navigate(w,3);
  const rows=[entry(1,base),entry(2,good1),entry(3,good2),entry(4,bad)];
  rows[1].name='UniqueCameraFrame';
  const pickerHost={querySelector(){return null;}},host={querySelector(query){
    return query==='[data-wizard-picker]'?pickerHost:null;
  }};
  const captures=[];
  const independentPrefs=filters.update(filters.normalize(),'geometry','flat');
  const ctx={Promise,Map,Object,Number,String,RangeError,Error,document:{},experimentPreview:{live:false,animationContext:null},
    studioWizard:w,studioWizardError:'',studioLibraryBusy:false,
    studioWizardPickerFilters:filters.normalize(),studioWizardPickerQueryDraft:'',
    studioWizardPickerAdvancedOpen:false,studioWizardPickerScroll:0,
    studioHistoryEntries:rows,studioPickerFilters:independentPrefs,
    studioWizardUI:{render(){}},studioUI:{renderPicker(_d,_h,items,actions,options){
      captures.push({items,actions,options});}},studioWizardApi:wizard,historyFiltersApi:filters,
    newUiEl(){return host;},experimentSnapshot:()=>base,
    requestStudioSwitch(){throw Error('Unexpected creation');},openHistoryFromPicker:async()=>{},
  };
  vm.createContext(ctx);vm.runInContext(src.slice(a,b),ctx);
  ctx.renderStudioWizard();
  captures.at(-1).actions.pickerSelectMatching();
  assert.deepEqual(Array.from(ctx.studioWizard.selectedIds),[2,3]);
  ctx.studioWizard=wizard.patch(ctx.studioWizard,'showIncompatible',true);
  ctx.renderStudioWizard();
  assert.equal(captures.at(-1).items.length,3);
  captures.at(-1).actions.pickerSelectMatching();
  assert.deepEqual(Array.from(ctx.studioWizard.selectedIds),[2,3],
    'incompatible visible entry is never selected');
  captures.at(-1).actions.pickerFilter('query','UniqueCameraFrame');
  assert.deepEqual(Array.from(captures.at(-1).items,e=>e.id),[2]);
  captures.at(-1).actions.pickerDeselectMatching();
  assert.deepEqual(Array.from(ctx.studioWizard.selectedIds),[3],
    'hidden ID must remain selected');
  captures.at(-1).actions.pickerClearSelection();
  assert.deepEqual(Array.from(ctx.studioWizard.selectedIds),[]);
  assert.equal(ctx.studioPickerFilters,independentPrefs);
});

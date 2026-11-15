'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const filters=require('../src/animation/ModernAnimationLibraryFilters');
const codec=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const contracts=require('../src/animation/ModernAnimationContract');
const projects=require('../src/animation/ModernAnimationProject');
const studio=require('../src/animation/ModernAnimationStudio');
const library=require('../src/animation/ModernAnimationLibrary');
function reference(mode='scene',atmosphere='standard'){
  return codec.capture({Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Reference',Description:'',
    ObjType:[3,3],NObjects:[2,0],ObjDist:[50,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[10,10],ObjSizeVar:[0,0]},
  {atmosphere,occlusionRadius:6371000,preset:'custom',resetPreset:'single'},
  compare.preset('globe-flat-vacuum'),{mode,eyeLevel:true,horizon:true,selected:'A'});
}
function records(){
  const a=reference(),b=structuredClone(a);b.scene.camera.Height=65;
  const v1=projects.create([a,b],{id:'cam',name:'Coastal Glide',description:'An eye-level move'});
  const curvature=contracts.create(a,{mode:'physical',target:{scope:'scene',parameter:'surface.curvature'}});
  const flat=structuredClone(a);flat.scene.surface.showModel=2;
  const phys=projects.createV2(curvature,[a,flat],{id:'curv',name:'Earth Shape',description:'Globe to flat'});
  const compareSnapshot=reference('compare','temperature-lapse');
  const exp=projects.createV2(contracts.create(compareSnapshot,{mode:'experimental'}),[],
    {id:'exp',name:'Mixed Storyboard',description:'Free compositions'});
  return [library.record(v1,'auto','cam',10,20),library.record(phys,'auto','curv',11,30),
    library.record(exp,'auto','exp',12,40)];
}
const names=items=>items.map(e=>e.project.name);

test('Animation Library filters normalize invalid persisted values and remain immutable',()=>{
  const defaults=filters.normalize({sort:'nonsense',baseMode:'scene',geometryRelation:'different',
    type:'bad',query:' '+('X'.repeat(200))+' '});
  assert.equal(defaults.sort,'updated-desc');assert.equal(defaults.type,'all');
  assert.equal(defaults.geometryRelation,'any');assert.ok(defaults.query.length<=160);
  assert.ok(Object.isFrozen(defaults));
  assert.equal(filters.update(defaults,'nonsense','x').sort,'updated-desc');
  assert.equal(filters.update(filters.normalize(),'baseMode','scene').baseMode,'scene');
  assert.equal(filters.update({baseMode:'scene'},'geometryRelation','different').baseMode,'compare');
  assert.equal(filters.active(filters.normalize()),false);
  assert.equal(filters.active({sort:'name-asc'}),true);
});

test('v1 and v2 project kinds and physical channels are independently filterable',()=>{
  const all=records();
  assert.deepEqual(names(filters.filter(all,{type:'camera'})),['Coastal Glide']);
  assert.deepEqual(names(filters.filter(all,{type:'physical',channel:'curvature'})),['Earth Shape']);
  assert.deepEqual(filters.filter(all,{type:'camera',channel:'gradient'}),[]);
  assert.deepEqual(names(filters.filter(all,{type:'experimental'})),['Mixed Storyboard']);
  assert.deepEqual(names(filters.filter(all,{objects:'1-5'})),
    ['Mixed Storyboard','Earth Shape','Coastal Glide']);
  assert.deepEqual(filters.filter(all,{objects:'none'}),[]);
  assert.deepEqual(names(filters.filter(all,{baseMode:'scene'})),['Earth Shape','Coastal Glide']);
  assert.deepEqual(names(filters.filter(all,{baseMode:'compare'})),['Mixed Storyboard']);
  assert.deepEqual(names(filters.filter(all,{geometry:'flat',baseMode:'compare'})),['Mixed Storyboard']);
  assert.deepEqual(names(filters.filter(all,{geometry:'globe',atmosphere:'standard'})),
    ['Earth Shape','Coastal Glide']);
  assert.deepEqual(names(filters.filter(all,{baseMode:'compare',geometryRelation:'different'})),
    ['Mixed Storyboard']);
});

test('temperature gradient filter identifies physical v2 contracts without changing snapshots',()=>{
  const a=reference('scene','temperature-lapse');
  const contract=contracts.create(a,{mode:'physical',
    target:{scope:'scene',parameter:'temperatureProfile.gradientKPerKm'}});
  const p=projects.createV2(contract,[],
    {id:'gradient',name:'Gradient at fixed camera',description:'Atmospheric transition'});
  const record=library.record(p,'auto','gradient',22,25);
  assert.deepEqual(filters.filter([record],{channel:'gradient'}),[record]);
  assert.deepEqual(filters.filter([record],{channel:'curvature'}),[]);
  assert.deepEqual(filters.filter([record],{atmosphere:'temperature-lapse'}),[record]);
});

test('search terms match across project metadata, kind and base physics',()=>{
  const all=records();
  assert.deepEqual(names(filters.filter(all,{query:'coastal standard'})),['Coastal Glide']);
  assert.deepEqual(names(filters.filter(all,{query:'earth curvature'})),['Earth Shape']);
  assert.deepEqual(names(filters.filter(all,{query:'EXPERIMENTAL COMPARE'})),['Mixed Storyboard']);
  assert.deepEqual(names(filters.filter(all,{query:'nonexistent'})),[]);
  assert.equal(filters.filter(all,{query:'free'}).length,1);
});

test('frame count, duration and sorting use project metadata without altering entry order',()=>{
  const all=records();const before=all.map(e=>e.id);
  assert.deepEqual(names(filters.filter(all,{frames:'zero'})),['Mixed Storyboard']);
  assert.deepEqual(names(filters.filter(all,{frames:'2-5'})),['Earth Shape','Coastal Glide']);
  assert.deepEqual(names(filters.filter(all,{duration:'under10',frames:'zero'})),['Mixed Storyboard']);
  assert.deepEqual(names(filters.filter(all,{sort:'name-asc'})),['Coastal Glide','Earth Shape','Mixed Storyboard']);
  assert.deepEqual(names(filters.filter(all,{sort:'name-desc'})),['Mixed Storyboard','Earth Shape','Coastal Glide']);
  assert.deepEqual(names(filters.filter(all,{sort:'updated-asc'})),['Coastal Glide','Earth Shape','Mixed Storyboard']);
  assert.deepEqual(all.map(e=>e.id),before);
});

test('Library filter module loads after History filters in the actual Modern HTML',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
  assert.ok(html.indexOf('ModernExperimentHistoryFilters.js')<html.indexOf('ModernAnimationLibraryFilters.js'));
  assert.ok(html.indexOf('ModernAnimationLibraryFilters.js')<html.indexOf('ModernApp.js'));
  const context={};context.globalThis=context;vm.createContext(context);
  for(const file of ['src/ui/modern/ModernExperimentState.js',
    'src/ui/modern/ModernExperimentFingerprint.js',
    'src/ui/modern/ModernExperimentHistoryFilters.js',
    'src/animation/ModernAnimationLibraryFilters.js']){
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context,{filename:file});
  }
  assert.equal(context.CurvatureModernAnimationLibraryFilters.normalize().type,'all');
});

test('Library UI keeps backup and edit actions independent from filtered gallery',()=>{
  const ui=require('../src/ui/modern/ModernAnimationStudioUI');
  const doc={createElement(tag){return {tagName:tag,children:[],listeners:{},
    textContent:'',value:'',className:'',disabled:false,
    appendChild(node){this.children.push(node);return node;},
    addEventListener(name,fn){this.listeners[name]=fn;},
    setAttribute(name,value){this[name]=value;}};}};
  const host=doc.createElement('section'),all=records();
  const calls=[];const actions={filter:(...args)=>calls.push(['filter',...args]),
    clearFilters:()=>calls.push('clear'),toggleFilterDetails:v=>calls.push(['details',v]),
    exportAll:()=>calls.push('exportAll'),exportSelected:()=>calls.push('exportSelected')};
  const nodes=()=>{function visit(node){return [node,...node.children.flatMap(visit)];}return visit(host);};
  const filtered=filters.filter(all,{type:'camera'});
  ui.renderLibrary(doc,host,all,{expanded:true,visibleEntries:filtered,
    filters:filters.normalize({type:'camera'}),filtersActive:true,selectedId:'exp'},actions);
  assert.equal(nodes().filter(n=>n.tagName==='article').length,1);
  assert.ok(nodes().some(n=>String(n.textContent).includes('1 of 3 projects found')));
  assert.ok(nodes().some(n=>String(n.textContent).includes('selected backup project hidden')));
  nodes().find(n=>n.tagName==='button'&&n.textContent==='Export all').listeners.click();
  assert.equal(calls.pop(),'exportAll');
  nodes().find(n=>n.tagName==='button'&&n.textContent==='Export selected').listeners.click();
  assert.equal(calls.pop(),'exportSelected');
  const query=nodes().find(n=>n.className==='modern-animation-library-search');
  query.value='globe  curvature';query.listeners.input();
  assert.deepEqual(calls.pop(),['filter','query','globe  curvature',undefined]);
  nodes().find(n=>n.tagName==='button'&&n.textContent==='Clear filters').listeners.click();
  assert.equal(calls.pop(),'clear');
  assert.deepEqual(all.map(e=>e.id),['cam','curv','exp']);
});

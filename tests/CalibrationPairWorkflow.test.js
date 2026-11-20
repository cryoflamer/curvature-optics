'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPairWorkflow}=require('../src/ui/modern/ModernPhotoCalibrationEditor');
const row=(id,x=1)=>({kind:'vertex',landmark:{id,bank:0,objectType:3,primitive:0,vertex:x},pixel:[x,2],weight:2,included:false});
test('Browse/Add accepts either point first and supports commit, cancel and undo',()=>{
  for(const modelFirst of [false,true]){
    const w=createPairWorkflow(),a=row('a');
    assert.equal(w.mode,'browse');w.beginAdd();assert.equal(w.mode,'add');assert.equal(w.canCommit,false);
    if(modelFirst){w.selectModel(a.landmark);w.selectPhoto(a.pixel);}
    else {w.selectPhoto(a.pixel);w.selectModel(a.landmark);}
    assert.equal(w.canCommit,true);assert.deepEqual(w.rows,[]);
    w.change([a],'a',{finish:true});assert.equal(w.mode,'browse');assert.equal(w.activePair,'a');
    w.selectPhoto([7,8]);assert.equal(w.mode,'add');w.cancel();assert.equal(w.mode,'browse');assert.deepEqual(w.rows,[a]);
    assert.equal(w.undo(),true);assert.deepEqual(w.rows,[]);assert.equal(w.undo(),false);
  }
});
test('Edit preserves saved rows and rejects switching target; sequential Undo',()=>{
  const w=createPairWorkflow(),a=row('a'),b=row('b',3);
  w.replaceAll([a,b]);assert.equal(w.beginEdit('missing'),false);assert.equal(w.beginEdit('a'),true);
  assert.equal(w.mode,'edit');assert.equal(w.canCommit,true);assert.equal(w.select('b'),false);assert.equal(w.activePair,'a');
  w.selectPhoto([8,9]);w.selectModel(row('a',7).landmark);assert.deepEqual(w.rows,[a,b]);
  w.cancel();assert.equal(w.activePair,'a');assert.equal(w.mode,'browse');assert.deepEqual(w.rows,[a,b]);
  w.beginEdit('a');w.selectPhoto([8,9]);const next={...a,pixel:w.pending};
  w.change([next,b],'a',{finish:true});assert.equal(w.mode,'browse');assert.deepEqual(w.rows,[next,b]);
  w.change([next],'a');assert.equal(w.undo(),true);assert.deepEqual(w.rows,[next,b]);assert.equal(w.undo(),true);assert.deepEqual(w.rows,[a,b]);
});
test('Legacy draft and history restoration, unrelated deletion preserves edit',()=>{
  const w=createPairWorkflow(),a=row('a'),b=row('b',3);w.replaceAll([a,b]);
  w.restoreDraft({editing:'a',activePair:'b',pending:[5,6],pendingModel:a.landmark});
  assert.equal(w.mode,'edit');assert.equal(w.activePair,'a');assert.deepEqual(w.pending,[5,6]);
  w.change([a]);assert.equal(w.mode,'edit');assert.equal(w.editing,'a');
  w.change([]);assert.equal(w.mode,'browse');assert.equal(w.activePair,null);
  w.restoreHistory([{rows:[a,b],activePair:'b'}]);assert.equal(w.undo(),true);assert.equal(w.activePair,'b');
  w.restoreDraft({editing:'missing',pending:[3,4]});assert.equal(w.mode,'add');assert.equal(w.canCommit,false);
  w.replaceAll();assert.equal(w.mode,'browse');assert.equal(w.undo(),false);
});
test('Legacy Flat edit may use selector instead of draft material point',()=>{
  const w=createPairWorkflow(),a=row('a');w.replaceAll([a]);w.beginEdit('a',{model:false});
  assert.equal(w.editing,'a');assert.equal(w.pendingModel,null);assert.deepEqual(w.pending,a.pixel);
  w.change([{...a,pixel:[4,5]}],'a',{finish:true});assert.equal(w.mode,'browse');
});

test('Shared toolbar reflects explicit add, edit, read-only and legacy readiness',()=>{
  const {pairToolbarState}=require('../src/ui/modern/ModernPhotoCalibrationEditor');
  const w=createPairWorkflow(),a=row('a'),ready={ready:true};
  assert.equal(pairToolbarState(w).addDisabled,true);
  assert.equal(pairToolbarState(w,ready).addDisabled,false);
  w.beginAdd();w.selectModel(null);assert.equal(w.mode,'add');assert.equal(w.explicitAdd,true);
  let t=pairToolbarState(w,ready);assert.equal(t.cancelDisabled,false);assert.equal(t.commitDisabled,true);
  w.selectPhoto([2,3]);assert.equal(pairToolbarState(w,ready).commitDisabled,true);
  assert.equal(pairToolbarState(w,{...ready,legacy:true,legacyModel:true}).commitDisabled,false);
  w.selectModel(a.landmark);assert.equal(pairToolbarState(w,ready).commitDisabled,false);
  assert.equal(pairToolbarState(w,{...ready,readOnly:true}).commitDisabled,true);
  w.cancel();w.replaceAll([a]);w.select('a');assert.equal(pairToolbarState(w,ready).editDisabled,false);
  w.beginEdit('a');t=pairToolbarState(w,ready);assert.equal(t.commitLabel,'Update pair');assert.equal(t.deleteDisabled,true);
  w.restoreDraft({explicitAdd:true});assert.equal(w.mode,'add');assert.equal(w.explicitAdd,true);
  w.cancel();w.selectPhoto([1,2]);assert.equal(w.explicitAdd,false);w.selectPhoto(null);assert.equal(w.mode,'browse');
});


test('implicit pairing links only a complete draft on its marker, in either order',()=>{
  const {linkDraftGesture,pairToolbarState}=require('../src/ui/modern/ModernPhotoCalibrationEditor');
  for(const modelFirst of [false,true]){
    const w=createPairWorkflow(),a=row('a'),existing=row('b',3);
    w.replaceAll([existing]);let calls=0;
    const commit=()=>{calls++;w.change([existing,a],null,{finish:true});};
    const dbl=target=>({kind:'double-click',target:{kind:target}});
    if(modelFirst)w.selectModel(a.landmark);else w.selectPhoto(a.pixel);
    assert.equal(linkDraftGesture(w,dbl('draft'),commit),true);assert.equal(calls,0);
    w.select('b');assert.equal(w.mode,'add');
    if(modelFirst)w.selectPhoto(a.pixel);else w.selectModel(a.landmark);
    assert.equal(w.canCommit,true);
    assert.equal(pairToolbarState(w,{ready:true,implicit:true}).hint,'Double-click either draft point to link the pair.');
    assert.equal(linkDraftGesture(w,dbl('saved'),commit),false);
    assert.equal(linkDraftGesture(w,dbl('background'),commit),false);
    assert.equal(linkDraftGesture(w,dbl('draft'),commit,false),false);
    assert.equal(linkDraftGesture(w,dbl('draft'),commit),true);assert.equal(calls,1);
    assert.equal(w.mode,'browse');assert.equal(w.rows.length,2);
    assert.equal(linkDraftGesture(w,dbl('draft'),commit),true);assert.equal(calls,1);
  }
  const w=createPairWorkflow(),a=row('a');w.selectPhoto(a.pixel);w.selectModel(a.landmark);
  linkDraftGesture(w,{kind:'double-click',target:{kind:'draft'}},()=>false);
  assert.equal(w.canCommit,true);assert.deepEqual(w.rows,[]);
});

test('saved endpoint moves preserve unrelated draft, order, identity and history',()=>{
  const editor=require('../src/ui/modern/ModernPhotoCalibrationEditor');
  const engine=require('../src/geometry/CurvatureGeometryEngine');
  const resolver=require('../src/calibration/CameraMaterialAnchorResolver');
  const model={showModel:1,rEarth:6371000,Height:12,Pan:3,CameraNorth:25,CameraEast:15,
    NObjects:[2,0],ObjType:[3,3],ObjDist:[1000,1200],ObjDeltaDist:[100,100],
    ObjSideType:[0,0],ObjSidePos:[30,40],ObjSideVar:[0,0],ObjSizeType:[0,0],ObjSize:[10,20],ObjSizeVar:[0,0]};
  const ps=engine.createObjectSequenceScene({...model,geometryRadius:model.rEarth},0,true,
    {opticsNeutral:true,physicalSurface:true,curvature:1/model.rEarth}).primitives;
  const session=resolver.create(model),index=ps.findIndex(p=>p.metadata?.landmarkOwner&&p.points.length>=3);
  const p=ps[index],material=(id,i)=>session.fromPick({kind:'vertex',bank:0,index,primitive:p.metadata.landmarkPrimitive,owner:p.metadata.landmarkOwner,indices:[i],weights:[1]},id);
  const a=editor.pair(material('a',0),[11,12],100,100,2,false),b=editor.pair(material('b',1),[21,22],100,100,3,true);
  const w=createPairWorkflow();w.replaceAll([a,b]);w.selectPhoto([50,60]);w.selectModel(material('draft',2));w.select('b');
  const draft=w.snapshot().draft;
  assert.equal(editor.moveSavedEndpoint(w,'a',{landmark:material('new-id',2)},100,100,model),true);
  assert.equal(w.rows[0].landmark.id,'a');assert.deepEqual(w.rows[0].pixel,a.pixel);
  assert.equal(w.rows[0].included,false);assert.equal(w.rows[0].weight,2);assert.deepEqual(w.rows[1],b);
  assert.deepEqual(w.snapshot().draft,draft);assert.equal(w.activePair,'b');assert.equal(w.undoStack.length,1);
  const before=w.snapshot();
  assert.equal(editor.moveSavedEndpoint(w,'a',{landmark:material('other-id',2)},100,100,model),false);
  assert.throws(()=>editor.moveSavedEndpoint(w,'a',{landmark:b.landmark},100,100,model),/already paired/);
  assert.throws(()=>editor.moveSavedEndpoint(w,'a',{pixel:[-1,10]},100,100,model),/Invalid correspondence/);
  assert.deepEqual(w.snapshot(),before);
  assert.equal(editor.moveSavedEndpoint(w,'a',{pixel:[31,32]},100,100,model),true);
  assert.deepEqual(w.rows[0].landmark,before.rows[0].landmark);
  assert.deepEqual(w.snapshot().draft,draft);assert.equal(w.undoStack.length,2);
  assert.equal(editor.moveSavedEndpoint(w,'a',{pixel:[31,32]},100,100,model),false);
  assert.equal(w.undoStack.length,2);
  assert.equal(w.canCommit,true);
});

test('undo and redo preserve unfinished draft; a new durable change invalidates redo',()=>{
  const w=createPairWorkflow(),a=row('a'),b=row('b',3);
  w.replaceAll([a]);w.change([a,b],'b');
  w.selectPhoto([50,60]);w.selectModel(row('draft',7).landmark);
  const draft=w.snapshot().draft;
  assert.equal(w.undo(),true);assert.deepEqual(w.rows,[a]);assert.deepEqual(w.snapshot().draft,draft);
  assert.equal(w.redoStack.length,1);assert.equal(w.redo(),true);assert.deepEqual(w.rows,[a,b]);assert.deepEqual(w.snapshot().draft,draft);
  assert.equal(w.undo(),true);w.selectPhoto([51,61]);assert.equal(w.redoStack.length,1);
  w.change([{...a,weight:5}]);assert.equal(w.redoStack.length,0);assert.equal(w.redo(),false);
  const snapshot=w.snapshot(),restored=createPairWorkflow();restored.replaceAll(snapshot.rows);
  w.undo();restored.replaceAll(w.rows);restored.restoreHistory(w.undoStack,w.redoStack);
  assert.equal(restored.redo(),true);assert.deepEqual(restored.rows,snapshot.rows);
  w.replaceAll([a]);w.change([a,b]);w.beginEdit('b');w.undo();assert.equal(w.mode,'browse');
});
test('context actions distinguish draft, saved target and viewport background',()=>{
  const {contextActions,pairToolbarState}=require('../src/ui/modern/ModernPhotoCalibrationEditor');
  const w=createPairWorkflow(),a=row('a');w.replaceAll([a]);w.selectPhoto([3,4]);
  const ids=items=>items.map(x=>x.id),get=(target,side)=>contextActions(w,target,side);
  assert.equal(get({kind:'draft'},'photo')[0].disabled,true);
  w.selectModel(a.landmark);assert.equal(get({kind:'draft'},'model')[0].disabled,false);
  assert.deepEqual(ids(get({kind:'saved',id:'a'},'model')),['select','pivot','properties','role','delete']);
  assert.deepEqual(get({kind:'saved',id:'missing'},'model'),[]);
  assert.ok(ids(get({kind:'background'},'model')).includes('wireframe'));
  assert.ok(!ids(get({kind:'background'},'photo')).includes('wireframe'));
  w.change([]);w.undo();assert.equal(pairToolbarState(w,{ready:true}).redoDisabled,false);
  assert.equal(get({kind:'background'},'photo').find(a=>a.id==='redo').disabled,false);
});

test('context menu clamps, routes activation and dismisses without a workspace action',()=>{
  const {createContextMenu}=require('../src/ui/modern/ModernPhotoCalibrationEditor');
  const doc={activeElement:null,events:{},addEventListener(k,fn){this.events[k]=fn;}};
  const node=()=>({style:{},children:[],events:{},hidden:false,
    setAttribute(){},append(n){this.children.push(n);},replaceChildren(){this.children=[];},
    getBoundingClientRect(){return {width:190,height:100};},
    contains(n){return n===this||this.children.includes(n);},focus(){doc.activeElement=this;},
    addEventListener(k,fn){this.events[k]=fn;}});
  doc.createElement=node;
  const env={innerWidth:300,innerHeight:200,events:{},addEventListener(k,fn){this.events[k]=fn;}};
  const workspace=node(),source=node(),called=[],menu=createContextMenu(doc,env,workspace),dom=workspace.children[0];
  const items=[{id:'undo',label:'Undo',disabled:true},{id:'redo',label:'Redo',disabled:false},{id:'cancel',label:'Cancel',disabled:false}];
  assert.equal(menu.open([290,195],items,id=>called.push(id),source),true);
  assert.equal(dom.style.left,'106px');assert.equal(dom.style.top,'96px');assert.equal(doc.activeElement,dom.children[1]);
  dom.children[0].onclick();assert.deepEqual(called,[]);
  let stopped=false;const key=k=>dom.events.keydown({key:k,preventDefault(){},stopPropagation(){stopped=true;}});
  assert.equal(dom.className,'modern-calibration-context-menu');
  dom.children[2].events.pointerenter({pointerType:'mouse'});assert.equal(doc.activeElement,dom.children[2]);
  dom.children[0].events.pointerenter({pointerType:'mouse'});assert.equal(doc.activeElement,dom.children[2]);
  dom.children[1].events.pointerenter({pointerType:'touch'});assert.equal(doc.activeElement,dom.children[2]);
  assert.deepEqual(called,[]);assert.equal(menu.visible,true);
  key('ArrowUp');assert.equal(doc.activeElement,dom.children[1]);
  key('ArrowDown');assert.equal(doc.activeElement,dom.children[2]);
  key('Enter');assert.equal(stopped,true);doc.activeElement.onclick();
  assert.deepEqual(called,['cancel']);assert.equal(menu.visible,false);assert.equal(doc.activeElement,source);
  menu.open([0,0],items,id=>called.push(id),source);doc.events.pointerdown({target:source});assert.equal(menu.visible,false);
  menu.open([0,0],items,id=>called.push(id),source);key('Escape');assert.equal(menu.visible,false);assert.equal(doc.activeElement,source);
});

test('nonlinear stage state keeps editing separate from optical results',()=>{
  const {calibrationStageState}=require('../src/ui/modern/ModernPhotoCalibrationEditor');
  for(const hasFit of [false,true])for(const camera of ['initial','best']){
    assert.deepEqual(calibrationStageState('correspondences',hasFit,camera),{stage:'correspondences',editing:true,configuring:false,results:false,best:false});
    assert.deepEqual(calibrationStageState('calibration',hasFit,camera),{stage:'calibration',editing:false,configuring:true,results:false,best:false});
    assert.deepEqual(calibrationStageState('result',hasFit,camera),{stage:'result',editing:false,configuring:false,results:true,best:hasFit&&camera==='best'});
  }
  assert.equal(calibrationStageState('corrupt',true).stage,'correspondences');
});

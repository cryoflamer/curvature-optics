'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const codec=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const sequence=require('../src/camera/ModernCameraSequence');
const studio=require('../src/animation/ModernAnimationStudio');
const editing=require('../src/animation/ModernAnimationStudioEditing');
const contracts=require('../src/animation/ModernAnimationContract');
const animation=require('../src/animation/ModernAnimationProject');
const editor=require('../src/ui/modern/ModernAnimationStudioUI');
function experiment(mode='scene'){
  const model={Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Base',Description:'',
    ObjType:[3,3],NObjects:[85,2],ObjDist:[50,20000],ObjDeltaDist:[297.55,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  return codec.capture(model,{atmosphere:'temperature-lapse',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},compare.preset('globe-flat-vacuum'),
    {mode,eyeLevel:false,horizon:true,selected:'A'});
}
const clone=v=>structuredClone(v);
const entry=(id,e,name='')=>({id,name,experiment:e});

test('Ordered History shortlist becomes independent owned animation draft',()=>{
  const a=experiment(),b=clone(a),c=clone(a);
  b.scene.camera.Height=55;c.scene.camera.Height=85;
  const entries=[entry(2,b,'Middle'),entry(1,a,'Start'),entry(3,c,'End')];
  const input=clone(entries);
  let draft=studio.history([1,2,3],entries);
  assert.deepEqual(draft.frames.map(f=>f.sourceSnapshotId),[1,2,3]);
  assert.deepEqual(draft.frames.map(f=>f.name),['Start','Middle','End']);
  draft=studio.editFrame(draft,'history-2','travelMs','3.2');
  draft=studio.editFrame(draft,'history-2','holdMs','1.5');
  draft=studio.editFrame(draft,'history-2','easing','smoothstep');
  assert.equal(draft.frames[1].travelMs,3200);
  const previous=studio.history([1,2,3],entries,draft);
  assert.equal(previous.frames[1].travelMs,3200,'reloading preserves timings');
  assert.equal(previous.frames[1].holdMs,1500);
  assert.equal(studio.inspect(draft).mode,'camera');
  assert.equal(studio.inspect(draft).compatible,true);
  const project=studio.build(draft,'story_project');
  assert.equal(project.mode,'camera');assert.equal(project.keyframes.length,3);
  assert.equal(project.keyframes[1].travelMs,3200);
  assert.equal(animation.totalMs(project),9700);
  assert.equal(animation.sampleAt(project,0).scene.camera.Height,15);
  assert.equal(animation.sampleAt(project,100000).scene.camera.Height,85);
  assert.deepEqual(entries,input,'building does not modify the IndexedDB records');
  entries[0].experiment.scene.camera.Height=999;
  assert.equal(animation.sampleAt(project,100000).scene.camera.Height,85,
    'project works after source History has changed or vanished');
});

test('Reorder and deletion do not modify source shortlist; first frame has no incoming travel',()=>{
  const a=experiment(),b=clone(a),c=clone(a);
  b.scene.camera.Height=40;c.scene.camera.Height=70;
  const queue=[1,2,3],entries=[entry(1,a),entry(2,b),entry(3,c)];
  let draft=studio.history(queue,entries);
  draft=studio.move(draft,'history-1',1);
  assert.deepEqual(draft.frames.map(f=>f.sourceSnapshotId),[2,1,3]);
  assert.equal(draft.frames[0].travelMs,0);
  assert.equal(draft.frames[1].travelMs,5000);
  draft=studio.remove(draft,'history-1');
  assert.deepEqual(draft.frames.map(f=>f.sourceSnapshotId),[2,3]);
  assert.deepEqual(queue,[1,2,3],'shortlist does not change');
  assert.equal(studio.inspect(draft).compatible,true);
  assert.deepEqual(studio.history([3,1],entries,draft).frames.map(f=>f.sourceSnapshotId),[3,1]);
});

test('One physical gradient is supported; mixed camera/physics and extra channels explain blockers',()=>{
  const a=experiment(),b=clone(a),c=clone(a);
  b.scene.temperatureProfile.gradientKPerKm=10;
  let draft=studio.history([1,2],[entry(1,a),entry(2,b)]);
  const inferred=studio.inspect(draft);
  assert.equal(inferred.compatible,true);assert.equal(inferred.mode,'physical');
  assert.deepEqual(inferred.target,{scope:'scene',parameter:'temperatureProfile.gradientKPerKm'});
  const project=studio.build(draft,'gradient_study');
  assert.equal(animation.sampleAt(project,2500).scene.temperatureProfile.gradientKPerKm,1.75);
  draft=studio.edit(draft,'mode','physical');
  assert.equal(studio.inspect(draft).compatible,false,'manual physical mode requires an explicit target');
  draft=studio.edit(draft,'target','scene|temperatureProfile.gradientKPerKm');
  assert.equal(studio.inspect(draft).compatible,true);
  c.scene.camera.Height=50;
  const mixed=studio.history([1,2,3],[entry(1,a),entry(2,b),entry(3,c)]);
  assert.equal(studio.inspect(mixed).compatible,false);
  assert.ok(studio.inspect(mixed).issues.some(issue=>issue.path==='camera.Height'));
  assert.throws(()=>studio.build(mixed,'blocked'),/incompatible/i);
});

test('Old Camera Animation imports without changing current experiment or existing sequence',()=>{
  const current=experiment(),first=clone(current.scene.camera),second=clone(first);
  second.Height=50;second.Pan=45;
  const legacy=sequence.validate([
    {name:'Start',camera:first,travelMs:0,holdMs:200,easing:'linear'},
    {name:'High view',camera:second,travelMs:3000,holdMs:500,easing:'smoothstep'}
  ]);
  const old=clone([legacy,current]);
  let draft=studio.importCamera(current,legacy);
  assert.equal(draft.mode,'camera');assert.equal(draft.source,'camera-sequence');
  assert.equal(studio.inspect(draft).compatible,true);
  assert.deepEqual(draft.frames.map(f=>f.sourceSnapshotId),[null,null]);
  draft=studio.edit(draft,'name','Imported camera study');
  const project=studio.build(draft,'imported_camera');
  assert.equal(project.keyframes[1].travelMs,3000);
  assert.equal(project.keyframes[1].easing,'smoothstep');
  assert.equal(animation.sampleAt(project,10000).scene.camera.Height,50);
  assert.deepEqual([legacy,current],old,'no changes to legacy Camera Animation or active experiment');
  assert.throws(()=>studio.importCamera(current,[legacy[0]]),/at least two/);
});

test('Controls reject invalid values, require named frames, and allow unchanged explicit camera',()=>{
  const a=experiment();let draft=studio.history([1,2],[entry(1,a),entry(2,a)]);
  assert.equal(studio.inspect(draft).compatible,false);
  draft=studio.edit(draft,'mode','camera');
  assert.equal(studio.inspect(draft).compatible,true);
  assert.throws(()=>studio.editFrame(draft,'history-2','travelMs',''),/duration/);
  assert.throws(()=>studio.editFrame(draft,'history-2','travelMs','0.1'),/range/);
  assert.throws(()=>studio.editFrame(draft,'history-2','holdMs','-4'),/range/);
  assert.throws(()=>studio.editFrame(draft,'history-2','holdMs','Infinity'),/range/);
  assert.throws(()=>studio.editFrame(draft,'history-2','easing','bogus'),/easing/);
  assert.throws(()=>studio.edit(draft,'target','B|unknown'),/target/);
  draft=studio.editFrame(draft,'history-2','name','');
  assert.ok(studio.inspect(draft).issues.some(issue=>issue.code==='missing-frame-name'));
  draft=studio.editFrame(draft,'history-2','name','Again');
  draft=studio.edit(draft,'name','');
  assert.ok(studio.inspect(draft).issues.some(issue=>issue.code==='missing-name'));
  assert.throws(()=>studio.build(draft,'invalid'),/incompatible/);
});

function mockDom(){
  const doc={createElement(tag){return {tagName:tag,children:[],listeners:{},_text:'',
    get textContent(){return this._text;},set textContent(v){this._text=v;this.children=[];},
    className:'',value:'',disabled:false,
    appendChild(node){this.children.push(node);return node;},
    addEventListener(name,fn){this.listeners[name]=fn;},
    setAttribute(name,value){this[name]=value;},
    getAttribute(name){return this[name]===undefined?null:String(this[name]);}};}};
  return {doc,host:doc.createElement('section')};
}
function collect(node,predicate){
  return [node,...node.children.flatMap(child=>collect(child,predicate))].filter(predicate);
}

test('DOM editor wires controls, shows issue paths, and disables preparation on mismatch',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=50;
  let draft=studio.history([1,2],[entry(1,a,'First'),entry(2,b,'Second')]);
  const {doc,host}=mockDom(),calls=[];
  const actions={choose:()=>calls.push('choose'),importCamera:()=>calls.push('import'),
    edit:(...args)=>calls.push(['edit',...args]),frame:(...args)=>calls.push(['frame',...args]),
    move:(...args)=>calls.push(['move',...args]),remove:(...args)=>calls.push(['remove',...args]),
    select:(...args)=>calls.push(['select',...args]),prepare:()=>calls.push('prepare')};
  editor.render(doc,host,draft,studio.inspect(draft),actions,false,{});
  const buttons=collect(host,n=>n.tagName==='button');
  buttons.find(b=>b.textContent==='Choose from History').listeners.click();
  assert.equal(buttons.some(b=>b.textContent.startsWith('Load staged snapshots')),false);
  buttons.find(b=>b.textContent==='Replace with Camera Animation…').listeners.click();
  assert.deepEqual(calls,['choose','import']);
  assert.equal(buttons.some(b=>b.textContent==='Preview animation'),false,'Preview navigation belongs to the workspace tab and keyframes');
  assert.equal(collect(host,n=>n.tagName==='button'&&n.textContent==='Prepare project').length,0,
    'old ambiguous action must not appear');
  assert.ok(collect(host,n=>n.textContent&&n.textContent.includes('Preview does not save')).length);
  const projectPane=collect(host,n=>n.className==='modern-studio-project-panel')[0];
  const fieldInputs=collect(projectPane,n=>n.tagName==='input');
  fieldInputs[0].value='Named study';fieldInputs[0].listeners.change();
  assert.deepEqual(calls.at(-1),['edit','name','Named study']);
  const keyframes=collect(host,n=>n.tagName==='button'&&n.className.includes('modern-studio-keyframe'));
  assert.equal(keyframes.length,2);
  assert.equal(keyframes[0]['aria-pressed'],'true');
  keyframes[1].listeners.click();
  assert.deepEqual(calls.at(-1),['select','history-2']);
  host.children=[];
  editor.render(doc,host,draft,studio.inspect(draft),actions,false,{selectedKey:'history-2'});
  const frameControls=collect(host,n=>n.tagName==='button'&&n.textContent==='↑');
  assert.equal(frameControls.length,1,'one selected-frame editor instead of every frame');
  frameControls[0].listeners.click();
  assert.deepEqual(calls.at(-1),['move','history-2',-1]);
  const broken=clone(b);broken.scene.temperatureProfile.gradientKPerKm=9;
  draft=studio.history([1,2],[entry(1,a),entry(2,broken)]);
  host.children=[]; // The minimal DOM mock does not implement textContent's child clearing.
  editor.render(doc,host,draft,studio.inspect(draft),actions,false);
  const status=collect(host,n=>n.className.includes('modern-studio-status'))[0];
  assert.match(status.children.map(n=>n.textContent).join(' '),/Cannot preview this sequence/);
  const pairDiagnostics=collect(host,n=>n.className==='modern-studio-transition');
  assert.equal(pairDiagnostics.length,1);
  const cells=collect(pairDiagnostics[0],n=>n.tagName==='td');
  assert.ok(cells.some(n=>n.textContent==='Camera · Camera height (m)'));
  assert.ok(cells.some(n=>n.textContent==='15'));
  assert.ok(cells.some(n=>n.textContent==='50'));
  assert.equal(collect(host,n=>n.tagName==='button'&&n.textContent==='Preview animation').length,0);
});

test('Studio fields persist valid in-progress edits on input before focus leaves the field',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=60;
  const draft=studio.history([1,2],[entry(1,a),entry(2,b)]);
  const {doc,host}=mockDom(),calls=[];
  const actions={load(){},importCamera(){},edit(){},frame(){},prepare(){},
    liveEdit:(field,value)=>calls.push(['liveEdit',field,value]),
    liveFrame:(key,field,value)=>calls.push(['liveFrame',key,field,value])};
  editor.render(doc,host,draft,studio.inspect(draft),actions,false,{selectedKey:'history-2'});
  const projectPane=collect(host,n=>n.className==='modern-studio-project-panel')[0];
  const framePane=collect(host,n=>n.className==='modern-studio-frame-panel')[0];
  const projectControls=collect(projectPane,n=>n.tagName==='input'||n.tagName==='textarea');
  const frameControls=collect(framePane,n=>n.tagName==='input'||n.tagName==='textarea');
  const projectName=projectControls.find(n=>n.type==='text');
  projectName.value='New draft before F5';projectName.listeners.input();
  assert.deepEqual(calls.at(-1),['liveEdit','name','New draft before F5']);
  const names=frameControls.filter(n=>n.type==='text');
  names[0].value='Renamed frame';names[0].listeners.input();
  assert.deepEqual(calls.at(-1),['liveFrame','history-2','name','Renamed frame']);
  names[1].value='Chapter title';names[1].listeners.input();
  assert.deepEqual(calls.at(-1),['liveFrame','history-2','narrativeTitle','Chapter title']);
  const number=frameControls.find(n=>n.type==='number');
  number.value='6.2';number.listeners.input();
  assert.deepEqual(calls.at(-1),['liveFrame','history-2','travelMs','6.2']);
  const textarea=projectControls.find(n=>n.tagName==='textarea');
  textarea.value='An important physical experiment';textarea.listeners.input();
  assert.deepEqual(calls.at(-1),['liveEdit','description','An important physical experiment']);
  const caption=frameControls.find(n=>n.tagName==='textarea');
  assert.equal(caption.maxLength,1000);caption.value='Frame explanation';caption.listeners.input();
  assert.deepEqual(calls.at(-1),['liveFrame','history-2','description','Frame explanation']);
});

test('Spline disables Easing but retains the previous value for Linear',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=75;
  const base=studio.editFrame(studio.history([1,2],[entry(1,a),entry(2,b)]),
    'history-2','easing','smoothstep');
  const {doc,host}=mockDom(),calls=[];
  const actions={frame:(...args)=>calls.push(args),edit(){},select(){},prepare(){}};
  const easing=()=>collect(host,n=>n.tagName==='select'&&
    n.children.some(child=>child.value==='smoothstep'))[0];
  editor.render(doc,host,base,studio.inspect(base),actions,false,{selectedKey:'history-2'});
  assert.equal(easing().disabled,false);
  assert.equal(easing().value,'smoothstep');
  easing().value='linear';easing().listeners.change();
  assert.deepEqual(calls.pop(),['history-2','easing','linear']);
  const spline=studio.edit(base,'interpolation','spline');
  host.children=[];
  editor.render(doc,host,spline,studio.inspect(spline),actions,false,{selectedKey:'history-2'});
  const inactive=easing();
  assert.equal(inactive.disabled,true);
  assert.equal(inactive.value,'smoothstep','the saved easing is not reset');
  assert.equal(inactive['aria-describedby'],'modern-studio-easing-note');
  assert.match(collect(host,n=>n.className==='modern-studio-field-note')[0].textContent,
    /Spline ignores per-frame easing.*kept for Linear/);
  const before=calls.length;
  inactive.value='linear';inactive.listeners.change();
  assert.equal(calls.length,before,'a stale change event cannot edit easing in Spline');
  assert.equal(spline.frames[1].easing,'smoothstep');
  const restored=studio.edit(spline,'interpolation','linear');
  host.children=[];
  editor.render(doc,host,restored,studio.inspect(restored),actions,false,{selectedKey:'history-2'});
  assert.equal(easing().disabled,false);
  assert.equal(easing().value,'smoothstep');
  assert.equal(collect(host,n=>n.className==='modern-studio-field-note').length,0);
});

test('Studio thumbnail filmstrip uses saved History images, selected-only controls and camera placeholders',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=75;
  let draft=studio.history([1,2],[entry(1,a,'Base'),entry(2,b,'High')]);
  const image='data:image/webp;base64,YQ==';
  const saved=[{...entry(1,a,'Base'),thumbnail:{dataUrl:image,mode:'scene',width:480,height:300}},
    {...entry(2,b,'High'),thumbnail:{dataUrl:image,mode:'scene',width:480,height:300}}];
  const before=structuredClone([draft,saved]);
  const {doc,host}=mockDom(),calls=[];
  const actions={load(){},importCamera(){},edit(){},prepare(){},
    select:key=>calls.push(['select',key]),frame:(...a)=>calls.push(['frame',...a]),
    move:(...a)=>calls.push(['move',...a]),remove:key=>calls.push(['remove',key])};
  editor.render(doc,host,draft,studio.inspect(draft),actions,false,
    {entries:saved,selectedKey:'history-2'});
  const cards=collect(host,n=>n.className.includes('modern-studio-keyframe')&&n.tagName==='button');
  assert.equal(cards.length,2);
  assert.equal(cards[0].children[0].children[0].src,image);
  assert.equal(cards[1]['aria-pressed'],'true');
  assert.match(cards[1].children[2].textContent,/Camera 75 m/);
  assert.equal(collect(host,n=>n.className==='modern-studio-selected-frame').length,1);
  assert.equal(collect(host,n=>n.className==='modern-studio-frame-fields').length,1);
  assert.equal(collect(host,n=>n.className==='modern-studio-field').length,8,
    'three global fields plus five selected keyframe fields');
  const change=collect(host,n=>n.className==='modern-studio-frame-fields')[0];
  change.children[0].children[1].value='Renamed';
  change.children[0].children[1].listeners.change();
  assert.deepEqual(calls.at(-1),['frame','history-2','name','Renamed']);
  cards[0].listeners.click();
  assert.deepEqual(calls.at(-1),['select','history-1']);
  assert.deepEqual([draft,saved],before,'visuals never modify source records or drafts');
  const previews=collect(host,n=>n.className==='modern-studio-preview');
  assert.equal(previews.length,0,'Inspector no longer duplicates the thumbnail shown in the timeline');
  const imported=studio.importCamera(a,sequence.validate([
    {name:'Low',camera:a.scene.camera,travelMs:0,holdMs:0,easing:'linear'},
    {name:'High',camera:b.scene.camera,travelMs:1000,holdMs:0,easing:'linear'}]));
  host.children=[];
  editor.render(doc,host,imported,studio.inspect(imported),actions,false,{entries:saved});
  const placeholders=collect(host,n=>n.className==='modern-storyboard-no-image');
  assert.equal(placeholders.length,2,'timeline camera views do not borrow unrelated History screenshots');
});

test('Timeline thumbnail Preview, Properties and Edit remain distinct and Edit is a stub',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=42;
  const draft=studio.history([1,2],[entry(1,a),entry(2,b)]);
  const {doc,host}=mockDom(),calls=[];
  editor.render(doc,host,draft,studio.inspect(draft),{
    previewFrame:key=>calls.push(['preview',key]),
    select:key=>calls.push(['properties',key]),
    editKeyframe:key=>calls.push(['edit-stub',key])
  },false,{selectedKey:'history-1'});
  const items=collect(host,n=>n.className==='modern-studio-filmstrip-item');
  items[1].children[0].listeners.click();
  const controls=collect(items[1],n=>n.className==='modern-studio-card-actions')[0].children;
  assert.deepEqual(controls.map(c=>c.textContent),['Properties','Edit']);
  controls[0].listeners.click();controls[1].listeners.click();
  assert.deepEqual(calls,[['preview','history-2'],['properties','history-2'],['edit-stub','history-2']]);
});

test('Keyframe card × removes its own frame without selecting, dragging or touching History',()=>{
  const a=experiment(),b=clone(a),c=clone(a);
  b.scene.camera.Height=40;c.scene.camera.Height=70;
  const entries=[entry(1,a,'One'),entry(2,b,'Two'),entry(3,c,'Three')];
  const draft=studio.history([1,2,3],entries),original=structuredClone(entries);
  const {doc,host}=mockDom(),calls=[];
  const actions={select:key=>calls.push(['select',key]),remove:key=>calls.push(['remove',key]),
    dragStart:()=>calls.push('drag'),dragEnd:()=>calls.push('end')};
  editor.render(doc,host,draft,studio.inspect(draft),actions,false,{entries,selectedKey:'history-2'});
  const items=collect(host,n=>n.className==='modern-studio-filmstrip-item');
  assert.equal(items.length,3);
  const removes=items.map(item=>collect(item,n=>n.className==='modern-studio-card-remove modern-card-delete'));
  assert.deepEqual(removes.map(items=>items.length),[1,1,1]);
  assert.match(removes[0][0]['aria-label'],/Remove animation frame 1: One/);
  assert.equal(removes[0][0].draggable,false);
  assert.equal(removes[0][0].tagName,'button');
  assert.equal(items[0].children[0].tagName,'button','selection button remains separate');
  assert.equal(removes[0][0].children.length,0,'no nested buttons');
  let stopped=0,prevented=0;
  removes[0][0].listeners.pointerdown({stopPropagation(){stopped++;}});
  removes[0][0].listeners.mousedown({stopPropagation(){stopped++;},preventDefault(){prevented++;}});
  removes[0][0].listeners.dragstart({stopPropagation(){stopped++;},preventDefault(){prevented++;}});
  removes[0][0].listeners.dblclick({stopPropagation(){stopped++;}});
  removes[0][0].listeners.click({stopPropagation(){stopped++;}});
  assert.equal(stopped,5);assert.equal(prevented,2);
  assert.deepEqual(calls,[['remove','history-1']]);
  assert.deepEqual(entries,original,'card actions never mutate History records');
  const removed=studio.remove(draft,'history-1');
  assert.deepEqual(removed.frames.map(f=>f.key),['history-2','history-3']);
  assert.deepEqual(draft.frames.map(f=>f.key),['history-1','history-2','history-3']);
  assert.equal(collect(host,n=>n['aria-label']==='Remove animation frame 2').length,0,
    'old removal button in selected-frame toolbar was retired');
});

test('Studio Undo/Redo controls support full draft history and disabled states',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=45;
  const draft=studio.history([1,2],[entry(1,a),entry(2,b)]);
  const {doc,host}=mockDom(),calls=[];
  const actions={undo:()=>calls.push('undo'),redo:()=>calls.push('redo')};
  editor.render(doc,host,draft,studio.inspect(draft),actions,false,
    {canUndo:true,canRedo:false,selectedKey:'history-1'});
  const undo=collect(host,n=>n.textContent==='Undo'&&n.tagName==='button');
  const redo=collect(host,n=>n.textContent==='Redo'&&n.tagName==='button');
  assert.equal(undo.length,2,'Undo is in the top toolbar and next to the move arrows');
  assert.equal(redo.length,2,'Redo is in the top toolbar and next to the move arrows');
  assert.ok(undo.every(b=>b.disabled===false));
  assert.ok(redo.every(b=>b.disabled===true));
  undo[1].listeners.click();assert.deepEqual(calls,['undo'],
    'inline Undo uses the same timeline history');
  assert.equal(collect(host,n=>n.className==='modern-studio-undo-removal').length,0,
    'old one-shot removal banner is retired');
  host.children=[];
  editor.render(doc,host,draft,studio.inspect(draft),actions,false,
    {canUndo:false,canRedo:true,selectedKey:'history-1'});
  assert.ok(collect(host,n=>n.textContent==='Undo'&&n.tagName==='button').every(b=>b.disabled));
  const redoActive=collect(host,n=>n.textContent==='Redo'&&n.tagName==='button');
  assert.ok(redoActive.every(b=>!b.disabled));redoActive[1].listeners.click();
  assert.deepEqual(calls,['undo','redo']);
});

test('Bounded edit history undoes and redoes reorders, frame edits, insertion and removal',()=>{
  const a=experiment(),b=clone(a),c=clone(a);b.scene.camera.Height=45;c.scene.camera.Height=80;
  const entries=[entry(1,a),entry(2,b),entry(3,c)];
  let draft=studio.history([1,2],entries),selection='history-1';
  const initial=draft,hist=studio.createEditHistory(3);
  function change(next,selected,group){
    studio.recordEdit(hist,draft,next,selection,group);
    draft=next;selection=selected===undefined?selection:selected;
  }
  change(studio.editFrame(draft,'history-2','holdMs','1.5'));
  change(studio.reorder(draft,'history-1',2),'history-1');
  change(studio.insertSnapshots(draft,[3],entries,draft.frames.length),'history-3');
  change(studio.remove(draft,'history-2'),'history-3');
  assert.equal(hist.past.length,3,'history is bounded');
  assert.deepEqual(draft.frames.map(f=>f.key),['history-1','history-3']);
  for(const expected of [['history-2','history-1','history-3'],
    ['history-2','history-1'],['history-1','history-2']]){
    const previous=studio.stepEditHistory(hist,draft,selection,'undo');
    draft=previous.draft;selection=previous.selectedKey;
    assert.deepEqual(draft.frames.map(f=>f.key),expected);
  }
  assert.equal(studio.stepEditHistory(hist,draft,selection,'undo'),null);
  assert.equal(draft.frames[1].holdMs,1500,'first edit was trimmed, not lost from current state');
  for(const expected of [['history-2','history-1'],
    ['history-2','history-1','history-3'],['history-1','history-3']]){
    const next=studio.stepEditHistory(hist,draft,selection,'redo');
    draft=next.draft;selection=next.selectedKey;
    assert.deepEqual(draft.frames.map(f=>f.key),expected);
  }
  assert.equal(studio.stepEditHistory(hist,draft,selection,'redo'),null);
  assert.deepEqual(initial.frames.map(f=>f.key),['history-1','history-2'],
    'history never mutates the original draft');
});

test('Live field input groups into one undo step, no-ops preserve redo, new edits clear redo',()=>{
  let draft=studio.blank();const hist=studio.createEditHistory(20);
  for(const text of ['A','An','Ani','Animation']){
    const next=studio.edit(draft,'name',text);
    studio.recordEdit(hist,draft,next,null,'project:name');draft=next;
  }
  assert.equal(hist.past.length,1);
  const unchanged=studio.edit(draft,'name','Animation');
  assert.equal(studio.recordEdit(hist,draft,unchanged,null,'project:name'),false);
  studio.endEditGroup(hist);
  const full=draft;
  const back=studio.stepEditHistory(hist,draft,null,'undo');draft=back.draft;
  assert.equal(draft.name,'Animation study');
  assert.equal(hist.future.length,1);
  const noOp=studio.edit(draft,'description',draft.description);
  assert.equal(studio.recordEdit(hist,draft,noOp,null),false);
  assert.equal(hist.future.length,1,'no-op must not invalidate redo');
  const forward=studio.stepEditHistory(hist,draft,null,'redo');
  assert.equal(forward.draft.name,full.name);
  draft=forward.draft;
  const changed=studio.edit(draft,'description','A real change');
  studio.recordEdit(hist,draft,changed,null);
  assert.equal(hist.future.length,0);
  const earlier=studio.stepEditHistory(hist,changed,null,'undo');
  assert.equal(earlier.draft.description,'');
});

test('App timeline actions undo/redo through autosaved drafts without touching History or sibling workspaces',()=>{
  const vm=require('node:vm');
  const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  const render=app.slice(app.indexOf('  function renderAnimationStudio(entries){'),
    app.indexOf('  var historyMetadataEditingId=null;'));
  const a=experiment(),b=clone(a),c=clone(a);
  b.scene.camera.Height=40;c.scene.camera.Height=75;
  const entries=[entry(1,a),entry(2,b),entry(3,c)];
  const initial=studio.history([1,2],entries);
  let actions,autosaves=0;
  const undoButtons=[{disabled:true},{disabled:true}],redoButtons=[{disabled:true},{disabled:true}];
  const host={__studioHistoryKeysBound:false,listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},
    contains(target){return target&&target.insideStudio===true;},
    querySelector(){return null;},querySelectorAll(selector){
      return selector==='.modern-studio-edit-undo'?undoButtons:
        selector==='.modern-studio-edit-redo'?redoButtons:[];
    }};
  const doc={listeners:{},body:{tagName:'BODY'},documentElement:{tagName:'HTML'},
    addEventListener(type,fn){this.listeners[type]=fn;}};
  const ctx={studioActiveDemo:null,studioApi:studio,studioEditingApi:editing,studioDraft:initial,studioSelectedKey:'history-1',
    studioEditHistory:studio.createEditHistory(),studioPickerOpen:false,
    studioPickerChecked:{},studioPickerShowIncompatible:false,studioPickerScroll:0,
    studioFilmstripScroll:0,studioDiagnosticTransition:null,
    studioPrepared:null,studioPlayback:null,studioRestorePreviewPending:false,
    studioLibraryActive:{id:'other_project'},studioHistoryEntries:entries,
    studioUI:{render(doc,host,draft,result,callbacks,prepared,options){
      actions=callbacks;assert.equal(options.canUndo,ctx.studioEditHistory.past.length>0);
    }},
    newUiEl(id){return id==='ModernAnimationStudio'?host:null;},
    syncLegacyHistorySelection(){},animationPickerPruneSelection(){},
    animationPickerSelectedEntries(){return [];},renderStudioLibrary(){},
    stopStudioPlayback(){},saveStudioDraft(){autosaves++;return true;},
    applySuggestedStudioName(v){return v;},root:{},document:doc,animationWorkspaceOpen:true,
    Promise,Map,Set,Array,Object,String,Number,Date,RangeError,Error};
  vm.runInNewContext(render,ctx);
  ctx.renderAnimationStudio(entries);
  actions.frame('history-2','holdMs','1.5');
  assert.equal(ctx.studioDraft.frames[1].holdMs,1500);
  actions.move('history-1',1);
  assert.deepEqual(Array.from(ctx.studioDraft.frames,f=>f.key),['history-2','history-1']);
  actions.remove('history-2');
  assert.deepEqual(Array.from(ctx.studioDraft.frames,f=>f.key),['history-1']);
  actions.undo();
  assert.deepEqual(Array.from(ctx.studioDraft.frames,f=>f.key),['history-2','history-1']);
  actions.undo();
  assert.deepEqual(Array.from(ctx.studioDraft.frames,f=>f.key),['history-1','history-2']);
  actions.undo();
  assert.equal(ctx.studioDraft.frames[1].holdMs,0);
  assert.equal(ctx.studioSelectedKey,'history-1');
  actions.redo();assert.equal(ctx.studioDraft.frames[1].holdMs,1500);
  // A clicked move arrow is removed when Studio rerenders. The browser
  // then focuses document.body, so the host-only key listener from #20
  // never received Ctrl+Z. The document listener must handle this case.
  let prevented=0;
  assert.equal(typeof doc.listeners.keydown,'function');
  doc.listeners.keydown({ctrlKey:true,key:'z',target:doc.body,
    preventDefault(){prevented++;}});
  assert.equal(ctx.studioDraft.frames[1].holdMs,0);
  doc.listeners.keydown({ctrlKey:true,key:'y',target:{tagName:'INPUT',insideStudio:true},
    preventDefault(){prevented++;}});
  assert.equal(prevented,1,'native text undo is not intercepted');
  doc.listeners.keydown({ctrlKey:true,key:'z',target:{tagName:'BUTTON',insideStudio:false},
    preventDefault(){prevented++;}});
  assert.equal(prevented,1,'other UI areas are not intercepted');
  doc.listeners.keydown({ctrlKey:true,shiftKey:true,key:'z',
    target:{tagName:'BUTTON',insideStudio:true},preventDefault(){prevented++;}});
  assert.equal(ctx.studioDraft.frames[1].holdMs,1500);
  assert.equal(prevented,2);
  ctx.animationWorkspaceOpen=false;
  doc.listeners.keydown({ctrlKey:true,key:'z',target:doc.body,
    preventDefault(){prevented++;}});
  assert.equal(prevented,2,'shortcuts are inactive in Scene/Compare');
  ctx.animationWorkspaceOpen=true;
  const editsBefore=ctx.studioEditHistory.past.length;
  for(const text of ['Camera A','Camera An','Camera Animation'])actions.liveEdit('name',text);
  assert.ok(undoButtons.every(button=>button.disabled===false),
    'top and inline Undo buttons update during live input without a rerender');
  assert.ok(redoButtons.every(button=>button.disabled===true));
  assert.equal(ctx.studioEditHistory.past.length,editsBefore+1,
    'many valid live inputs coalesce to one app-level undo entry');
  const inputSaves=autosaves;
  actions.edit('name','Camera Animation');
  assert.equal(autosaves,inputSaves,'blur does not save or rebuild a second time');
  actions.undo();assert.equal(ctx.studioDraft.name,initial.name);
  actions.redo();assert.equal(ctx.studioDraft.name,'Camera Animation');
  assert.ok(autosaves>=6,'undo and redo checkpoint the working draft');
  assert.equal(ctx.studioLibraryActive.id,'other_project');
  assert.deepEqual(initial.frames.map(f=>f.key),['history-1','history-2']);
});

test('Studio uses one History picker and never exposes a second staged gallery or destructive load',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=65;
  const entries=[entry(11,a,'Globe'),entry(12,b,'Flat')];
  const draft=studio.history([11,12],entries);
  const {doc,host}=mockDom();
  editor.render(doc,host,draft,studio.inspect(draft),{},false,
    {entries,stagedCount:2,stagedIds:[12,11]});
  assert.equal(collect(host,n=>n.className==='modern-studio-staged-card').length,0);
  const labels=collect(host,n=>n.tagName==='button').map(n=>n.textContent);
  assert.ok(labels.includes('Choose from History'));
  assert.ok(labels.includes('Replace with Camera Animation…'));
  assert.ok(!labels.some(label=>label.startsWith('Load staged snapshots')));
  const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  assert.doesNotMatch(app,/loadStagedAnimation/);
  assert.match(app,/function appendLegacyHistorySelection\(\)/);
  assert.match(app,/studioApi\.insertSnapshots\(studioDraft,available,studioHistoryEntries,/);
  assert.match(app,/Replace all .*keyframes with Camera Animation/);
  assert.match(app,/root\.confirm\(/);
});

test('Responsive storyboard layout bounds editor width and scrolls thumbnail timelines horizontally',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.css'),'utf8');
  assert.match(css,/\.modern-animation-studio\{max-width:1160px;margin:12px auto/);
  assert.match(css,/\.modern-animation-workspace\{box-sizing:border-box;width:min\(1220px/);
  assert.match(css,/\.modern-history\{position:fixed/);
  assert.match(css,/\.modern-studio-preview\{display:grid/);
  assert.match(css,/\.modern-studio-filmstrip\{display:flex/);
  assert.match(css,/overflow-x:auto/);
});

test('Modern shell loads pure project modules ahead of UI and keeps legacy camera controls',()=>{
  const root=path.resolve(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  assert.ok(html.indexOf('ModernAnimationCompatibility.js')<html.indexOf('ModernAnimationStudio.js'));
  assert.ok(html.indexOf('ModernAnimationStudio.js')<html.indexOf('ModernAnimationStudioUI.js'));
  assert.match(html,/id="ModernAnimationStudio"/);
  assert.match(html,/id="ModernAnimationWorkspace"/);
  assert.ok(html.indexOf('id="ModernAnimationStudio"')>html.indexOf('id="ModernHistoryPanel"'));
  assert.match(html,/id="ModernAnimationTab"/);
  assert.doesNotMatch(html,/id="ModernHistoryStoryboardQueue"/);
  assert.match(html,/id="ModernCameraAnimationSection"/);
  assert.match(app,/getAnimationStudioProject/);
  assert.match(app,/studioApi\.importCamera\(experimentSnapshot\(\),cameraSequence,studioDraft\)/);
});

test('Drag reorder uses target gaps, preserves frame identities and keeps first travel zero',()=>{
  const a=experiment(),b=clone(a),c=clone(a),d=clone(a);
  [b,c,d].forEach((e,i)=>{e.scene.camera.Height=30+i*20;});
  const entries=[entry(1,a,'A'),entry(2,b,'B'),entry(3,c,'C'),entry(4,d,'D')];
  let draft=studio.history([1,2,3,4],entries);
  draft=studio.editFrame(draft,'history-2','holdMs','2');
  draft=studio.reorder(draft,'history-1',3); // gap immediately before original frame 4
  assert.deepEqual(draft.frames.map(f=>f.sourceSnapshotId),[2,3,1,4]);
  assert.equal(draft.frames[0].travelMs,0);
  assert.ok(draft.frames.slice(1).every(f=>f.travelMs>=200));
  assert.equal(draft.frames[0].holdMs,2000);
  draft=studio.reorder(draft,'history-4',0);
  assert.deepEqual(draft.frames.map(f=>f.sourceSnapshotId),[4,2,3,1]);
  const old=structuredClone(draft);
  assert.deepEqual(studio.reorder(draft,'history-2',2),draft,'dropping on own right gap is a no-op');
  assert.deepEqual(draft,old);
  assert.throws(()=>studio.reorder(draft,'history-1',99),/drop target/);
  assert.deepEqual(studio.build(draft,'reordered').keyframes.map(f=>f.name),['D','B','C','A']);
});

test('Snapshot insertion is additive, de-duplicated, self-contained, and accepts ordered multi-add',()=>{
  const a=experiment(),b=clone(a),c=clone(a),d=clone(a);
  b.scene.camera.Height=30;c.scene.camera.Height=50;d.scene.camera.Height=70;
  const entries=[entry(1,a,'A'),entry(2,b,'B'),entry(3,c,'C'),entry(4,d,'D')];
  const original=structuredClone(entries);
  let draft=studio.history([1,4],entries);
  draft=studio.editFrame(draft,'history-4','travelMs','8');
  draft=studio.insertSnapshots(draft,[2,3,2,4],entries,1);
  assert.deepEqual(draft.frames.map(f=>f.sourceSnapshotId),[1,2,3,4]);
  assert.equal(draft.frames[3].travelMs,8000,'previous timing retained');
  assert.equal(draft.frames[1].name,'B');
  assert.equal(draft.frames[0].travelMs,0);
  assert.deepEqual(studio.insertSnapshots(draft,[2,3],entries,2),draft,'no duplicate insertion');
  assert.equal(studio.inspect(draft).compatible,true);
  assert.deepEqual(entries,original,'History unchanged');
  entries[1].experiment.scene.camera.Height=9000;
  assert.equal(animation.sampleAt(studio.build(draft,'saved'),5000).scene.camera.Height,30,
    'inserted frame is independent of History mutations');
  assert.throws(()=>studio.insertSnapshots(draft,[2],entries,-1),/insertion/);
  assert.throws(()=>studio.insertSnapshots(draft,[2],entries,99),/insertion/);
});

test('Inserting History snapshots into imported Camera Animation keeps camera frames',()=>{
  const a=experiment(),b=clone(a),c=clone(a);
  b.scene.camera.Height=55;c.scene.camera.Height=75;
  const legacy=sequence.validate([
    {name:'Imported low',camera:a.scene.camera,travelMs:0,holdMs:300,easing:'linear'},
    {name:'Imported high',camera:b.scene.camera,travelMs:2500,holdMs:100,easing:'smoothstep'}
  ]);
  const old=structuredClone(legacy);
  let draft=studio.importCamera(a,legacy);
  draft=studio.insertSnapshots(draft,[3],[entry(3,c,'History camera')],1);
  assert.equal(draft.source,'mixed');
  assert.deepEqual(draft.frames.map(f=>f.key),['camera-0','history-3','camera-1']);
  assert.equal(draft.frames[2].travelMs,2500);
  assert.equal(draft.frames[2].easing,'smoothstep');
  assert.deepEqual(legacy,old);
  assert.equal(studio.inspect(draft).compatible,true);
  const next=studio.reorder(draft,'history-3',3);
  assert.deepEqual(next.frames.map(f=>f.key),['camera-0','camera-1','history-3']);
});

test('Maximum keyframe count and compatibility validation also apply to drag insertion',()=>{
  const a=experiment();
  const base=studio.history([1],[entry(1,a)]);
  const big=structuredClone(base);
  for(let i=1;i<200;i++)big.frames.push({...big.frames[0],key:'mock-'+i,sourceSnapshotId:null});
  assert.throws(()=>studio.insertSnapshots(big,[201],[entry(201,a)],200),/maximum/);
  const incompatible=clone(a);incompatible.scene.camera.Height=70;
  incompatible.scene.temperatureProfile.gradientKPerKm=3;
  const draft=studio.insertSnapshots(base,[2],[entry(2,incompatible)],1);
  assert.equal(studio.inspect(draft).compatible,false);
  assert.throws(()=>studio.build(draft,'invalid'),/incompatible/);
});

test('DOM timeline renders droppable gaps and wires frame drag and end',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=55;
  const draft=studio.history([1,2],[entry(1,a),entry(2,b)]);
  const {doc,host}=mockDom(),calls=[];
  const actions={choose(){},load(){},importCamera(){},edit(){},frame(){},select(){},move(){},remove(){},prepare(){},
    dragStart:(payload,event)=>calls.push(['start',payload]),
    dragOver:()=>true,drop:(index)=>calls.push(['drop',index]),dragEnd:()=>calls.push('end'),
    insertChecked:index=>calls.push(['insert',index])};
  editor.render(doc,host,draft,studio.inspect(draft),actions,false,{pickerSelectedCount:2});
  const slots=collect(host,n=>n.className==='modern-studio-drop-slot');
  assert.equal(slots.length,3,'one drop gap before, between and after frames');
  const cards=collect(host,n=>n.className==='modern-studio-filmstrip-item');
  assert.equal(cards.length,2);
  assert.equal(cards[0].draggable,true);
  cards[1].listeners.dragstart({dataTransfer:{setData(){},effectAllowed:null}});
  assert.deepEqual(calls.at(-1),['start',{kind:'frame',key:'history-2'}]);
  let prevented=false;
  slots[0].listeners.dragover({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  slots[0].listeners.drop({preventDefault(){}});
  assert.deepEqual(calls.at(-1),['drop',0]);
  slots[1].children[0].listeners.click();
  assert.deepEqual(calls.at(-1),['insert',1]);
  cards[1].listeners.dragend();
  assert.equal(calls.at(-1),'end');
});

test('Snapshot Picker contains saved images, search, bulk select and drag handles',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=95;
  const {doc,host}=mockDom(),calls=[];
  const saved=[{...entry(1,a,'First'),thumbnail:{dataUrl:'data:image/webp;base64,YQ=='}},
    {...entry(2,b,'Second'),thumbnail:null}];
  const actions={pickerFilter:(...args)=>calls.push(['filter',...args]),
    pickerFiltersClear:()=>calls.push('clear'),
    pickerClearSelection:()=>calls.push('uncheck'),
    pickerAdvancedToggle:open=>calls.push(['advanced',open]),
    pickerToggle:(...args)=>calls.push(['toggle',...args]),pickerClose:()=>calls.push('close'),
    pickerFullHistory:()=>calls.push('full'),insertChecked:()=>calls.push('insert'),
    dragStart:(...args)=>calls.push(['drag',...args]),dragEnd:()=>calls.push('end')};
  editor.renderPicker(doc,host,saved,actions,{open:true,search:'test',checked:{1:true},
    filters:{query:'test',mode:'compare',geometry:'flat',atmosphere:'vacuum',
      geometryRelation:'same',refractionRelation:'different'},
    advancedOpen:true,totalEntries:5,selectedCount:3});
  assert.equal(host.hidden,false);
  const cards=collect(host,n=>n.className==='modern-studio-picker-card');
  assert.equal(cards.length,2);
  assert.equal(cards[0].draggable,true);
  assert.equal(collect(cards[0],n=>n.tagName==='img')[0].src,saved[0].thumbnail.dataUrl);
  assert.equal(collect(cards[1],n=>n.className==='modern-storyboard-no-image').length,1);
  cards[1].children[0].checked=true;cards[1].children[0].listeners.change();
  assert.deepEqual(calls.at(-1),['toggle',2,true]);
  cards[0].listeners.dragstart({dataTransfer:{setData(){}}});
  assert.deepEqual(calls.at(-1)[1],{kind:'snapshots',id:1});
  const query=collect(host,n=>n.className==='modern-studio-picker-search')[0];
  query.value='camera';query.listeners.input();
  assert.deepEqual(calls.at(-1).slice(0,3),['filter','query','camera']);
  const detail=collect(host,n=>n.className==='modern-studio-picker-filter-details')[0];
  assert.equal(detail.open,true);
  const select=key=>collect(host,n=>n.className==='modern-studio-picker-filter-'+key)[0];
  for(const [key,value] of [['mode','compare'],['geometry','flat'],['atmosphere','vacuum'],
    ['geometryRelation','same'],['refractionRelation','different']]){
    assert.equal(select(key).value,value);
  }
  select('atmosphere').value='standard';select('atmosphere').listeners.change();
  assert.deepEqual(calls.at(-1),['filter','atmosphere','standard']);
  detail.open=false;detail.listeners.toggle();
  assert.deepEqual(calls.at(-1),['advanced',false]);
  const count=collect(host,n=>n.tagName==='small'&&n.textContent.includes('found'))[0];
  assert.match(count.textContent,/3 selected \(2 hidden\) · 2 of 5 found/);
  assert.equal(collect(host,n=>n.className==='modern-studio-picker-hidden-note').length,1);
  const buttons=collect(host,n=>n.tagName==='button');
  buttons.find(n=>n.textContent==='Clear filters').listeners.click();
  assert.equal(calls.at(-1),'clear');
  buttons.find(n=>n.textContent==='Add checked').listeners.click();
  assert.equal(calls.at(-1),'insert');
  buttons.find(n=>n.textContent==='Clear selected').listeners.click();
  assert.equal(calls.at(-1),'uncheck');
  editor.renderPicker(doc,host,saved,actions,{open:false});
  assert.equal(host.hidden,true);
});

test('Picker shows A/B relations only in Compare and keeps checked totals independent of matches',()=>{
  const {doc,host}=mockDom(),calls=[],entries=[entry(1,experiment(),'One')];
  const actions={pickerFilter:(...args)=>calls.push(args),pickerFiltersClear(){},
    pickerClose(){},pickerFullHistory(){},pickerToggle(){},insertChecked(){},
    dragStart(){},dragEnd(){}};
  editor.renderPicker(doc,host,entries,actions,{open:true,checked:{1:true,2:true},
    selectedCount:2,totalEntries:8,filters:{query:'',mode:'scene',geometry:'any',
      atmosphere:'any',geometryRelation:'any',refractionRelation:'any'}});
  assert.equal(collect(host,n=>n.className==='modern-studio-picker-relations').length,0);
  assert.match(collect(host,n=>n.tagName==='small'&&n.textContent.includes('found'))[0].textContent,
    /2 selected \(1 hidden\) · 1 of 8 found/);
  const mode=collect(host,n=>n.className==='modern-studio-picker-filter-mode')[0];
  mode.value='compare';mode.listeners.change();
  assert.deepEqual(calls.at(-1),['mode','compare']);
  editor.renderPicker(doc,host,entries,actions,{open:true,filters:{mode:'compare'},
    checked:{1:true},selectedCount:1,totalEntries:8});
  assert.equal(collect(host,n=>n.className==='modern-studio-picker-relations').length,1);
});

test('Live Picker actions filter independently, keep hidden selections and insert them in pinned order',()=>{
  const vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  const functions=source.slice(source.indexOf('  function animationPickerAllEntries(entries){'),
    source.indexOf('  function toggleAnimationPicker(open){'));
  const render=source.slice(source.indexOf('  function renderAnimationStudio(entries){'),
    source.indexOf('  var historyMetadataEditingId=null;'));
  const filters=require('../src/ui/modern/ModernExperimentHistoryFilters');
  const flat=clone(experiment());flat.scene.surface.showModel=2;flat.scene.atmosphere='vacuum';
  const entries=[entry(1,experiment(),'Globe scene'),entry(2,flat,'Flat scene'),
    {...entry(3,experiment('compare'),'Compare demo'),pinned:true}];
  const sourceCopy=clone(entries);
  let picker,preferencesSaved=0,draftSaved=0;
  const host={querySelector(){return null;},querySelectorAll(){return [];}};
  const ctx={historyFiltersApi:filters,studioPickerFilters:filters.normalize(),
    historyFilters:filters.normalize({query:'History exclusive',mode:'scene'}),
    studioPickerQueryDraft:'',studioPickerAdvancedOpen:true,studioPickerOpen:true,
    studioPickerShowIncompatible:false,studioPickerChecked:Object.create(null),studioPickerScroll:0,studioFilmstripScroll:0,
    studioSelectedKey:null,studioDragSession:null,studioDiagnosticTransition:null,
    studioEditHistory:null,studioPrepared:null,studioPlayback:null,
    studioActiveDemo:null,studioLibraryActive:null,studioRestorePreviewPending:false,animationWorkspaceOpen:false,
    studioInitialPaintFrame:null,studioPlaybackRenderedAt:null,
    studioDraft:{frames:[]},studioEditingApi:editing,studioUI:{render(){},renderPicker(_doc,_host,shown,actions,options){
      picker={shown,actions,options};}},
    studioApi:{inspect(){return {};},findSequences(){return [];},activeFrames(){return [];},
      insertSnapshots(draft,ids){return {...draft,frames:draft.frames.concat(ids.map(id=>({
        key:'snapshot-'+id,sourceSnapshotId:id})))}}},
    newUiEl(id){if(id==='ModernAnimationStudio')return host;
      if(id==='ModernAnimationSnapshotPicker')return {querySelector(){return null;}};
      return null;},document:{},renderStudioLibrary(){},syncLegacyHistorySelection(){},
    saveApplicationPreferences(){preferencesSaved++;},saveStudioDraft(){draftSaved++;},
    applySuggestedStudioName(v){return v;},stopStudioPlayback(){},root:{},
    Promise,Array,Object,Number,RangeError,Error};
  vm.runInNewContext(functions+'\n'+render,ctx);
  ctx.renderAnimationStudio(entries);
  assert.deepEqual(Array.from(picker.shown,e=>e.id),[3,1,2]);
  picker.actions.pickerToggle(2,true);
  picker.actions.pickerFilter('mode','compare');
  assert.deepEqual(Array.from(picker.shown,e=>e.id),[3]);
  assert.equal(picker.options.selectedCount,1);
  assert.equal(picker.options.totalEntries,3);
  picker.actions.pickerToggle(3,true);
  picker.actions.pickerFilter('geometryRelation','different');
  picker.actions.pickerFilter('atmosphere','vacuum');
  picker.actions.pickerFilter('query','Compare ');
  assert.equal(picker.options.search,'Compare ', 'trailing query space is retained for typing');
  picker.actions.pickerFilter('query','Compare demo');
  assert.equal(ctx.studioPickerFilters.query,'Compare demo');
  assert.deepEqual(Array.from(picker.shown,e=>e.id),[3]);
  picker.actions.pickerFilter('mode','scene');
  assert.equal(ctx.studioPickerFilters.geometryRelation,'any',
    'switching away from Compare clears hidden A/B conditions');
  assert.equal(ctx.studioPickerFilters.refractionRelation,'any');
  assert.equal(picker.options.selectedCount,2,'hidden checks survive filtering');
  picker.actions.pickerFiltersClear();
  assert.equal(picker.options.search,'');
  assert.equal(picker.options.selectedCount,2,'resetting filters does not reset selection');
  assert.deepEqual(Array.from(picker.shown,e=>e.id),[3,1,2]);
  picker.actions.insertChecked();
  assert.deepEqual(Array.from(ctx.studioDraft.frames,f=>f.sourceSnapshotId),[3,2],
    'Add checked inserts both selected cards, including formerly hidden ones, pinned first');
  assert.equal(picker.options.selectedCount,0);
  assert.equal(ctx.historyFilters.query,'History exclusive');
  assert.ok(preferencesSaved>=6);
  assert.equal(draftSaved,1);
  assert.deepEqual(entries,sourceCopy,'Picker filtering and insertion never mutate History records');
  picker.actions.pickerToggle(1,true);
  picker.actions.pickerClearSelection();
  assert.equal(picker.options.selectedCount,0);
});

test('Animation workspace renders a docked picker, rather than making History the DnD target',()=>{
  const root=path.resolve(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const css=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.css'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  assert.match(html,/id="ModernAnimationSnapshotPicker"/);
  assert.ok(html.indexOf('id="ModernAnimationSnapshotPicker"')<html.indexOf('id="ModernAnimationStudio"'));
  assert.match(css,/\.modern-animation-workspace\.has-snapshot-picker/);
  assert.match(app,/studioApi\.insertSnapshots\(studioDraft,drag\.ids,entries,index\)/);
  assert.match(app,/studioApi\.reorder\(studioDraft,drag\.key,index\)/);
  assert.match(app,/studioUI\.renderPicker\(/);
  assert.match(app,/toggleAnimationPicker\(!studioPickerOpen\)/);
});

test('Snapshot Picker uses a single scroll container and unboxed A/B filters',()=>{
  const root=path.resolve(__dirname,'..');
  const css=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.css'),'utf8');
  const ui=fs.readFileSync(path.join(root,'src/ui/modern/ModernAnimationStudioUI.js'),'utf8');
  const rule=selector=>{
    const i=css.indexOf(selector+'{');
    assert.ok(i>=0,'Missing CSS selector '+selector);
    return css.slice(i+selector.length+1,css.indexOf('}',i));
  };
  assert.match(rule('.modern-animation-snapshot-picker'),/overflow-y:auto/,
    'Picker itself owns the vertical scroll');
  assert.doesNotMatch(rule('.modern-studio-picker-filters'),/max-height|overflow:auto|overflow-y:auto/,
    'Advanced filters expand naturally without a second scrollbar');
  assert.match(rule('.modern-studio-picker-filters'),/overflow:visible/);
  assert.doesNotMatch(rule('.modern-studio-picker-list'),/overflow:auto|overflow-y:auto/,
    'Snapshot cards scroll together with filters');
  assert.doesNotMatch(rule('.modern-studio-picker-relations'),/border:1px/,
    'Compare-specific controls have no extra nested frame');
  assert.match(ui,/el\(doc,'div','modern-studio-picker-relations'\)/);
  assert.doesNotMatch(ui,/el\(doc,'fieldset','modern-studio-picker-relations'\)/);
  assert.doesNotMatch(css,/\.modern-studio-picker-filters\{max-height:/,
    'Narrow screens must not restore nested filter scrolling');
  assert.match(css,/grid-template-columns:repeat\(auto-fill,minmax\(190px,1fr\)\);overflow:visible/,
    'Narrow screens must not restore a separate snapshot-list scrollbar');
});

test('Touch pointer drag resolves drop position without relying on native HTML drag events',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=43;
  const draft=studio.history([1,2],[entry(1,a),entry(2,b)]);
  const {doc,host}=mockDom(),docListeners={},calls=[];
  doc.addEventListener=(name,fn)=>{docListeners[name]=fn;};
  doc.removeEventListener=name=>{delete docListeners[name];};
  const dropTarget={getAttribute:name=>name==='data-animation-gap'?'0':null,
    classList:{add(){},remove(){},contains(){return false;}}};
  doc.elementFromPoint=()=>({closest:()=>dropTarget});
  const actions={choose(){},load(){},importCamera(){},edit(){},frame(){},select(){},move(){},remove(){},prepare(){},
    dragStart:payload=>calls.push(['start',payload]),dragOver(){return true;},
    dragEnd:()=>calls.push('end'),drop:index=>calls.push(['drop',index]),insertChecked(){}};
  editor.render(doc,host,draft,studio.inspect(draft),actions,false);
  const handle=collect(host,n=>n.className==='modern-studio-drag-handle')[0];
  assert.equal(typeof handle.listeners.pointerdown,'function');
  handle.listeners.pointerdown({pointerType:'touch',pointerId:7,clientX:2,clientY:2});
  docListeners.pointermove({pointerId:7,clientX:4,clientY:4});
  assert.equal(calls.length,0,'tap/micro-movement does not drag');
  docListeners.pointermove({pointerId:7,clientX:60,clientY:5,preventDefault(){}});
  assert.equal(calls[0][0],'start');
  docListeners.pointerup({pointerId:7,clientX:60,clientY:5,preventDefault(){},type:'pointerup'});
  assert.deepEqual(calls.slice(-2),[['drop',0],'end']);
  assert.equal(docListeners.pointermove,undefined,'pointer listeners removed on completion');
});


test('Editor has no redundant Preview button or readiness bar for compatible and incompatible drafts',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=50;
  const draft=studio.history([1,2],[entry(1,a),entry(2,b)]);
  const {doc,host}=mockDom();
  editor.render(doc,host,draft,studio.inspect(draft),{},true,{});
  assert.equal(collect(host,n=>n.tagName==='button'&&n.textContent==='Preview animation').length,0);
  assert.equal(collect(host,n=>typeof n.className==='string'&&n.className.startsWith('modern-studio-preview-bar')).length,0);
  host.children=[];
  const broken=studio.history([1,2],[entry(1,a),entry(2,a)]);
  editor.render(doc,host,broken,studio.inspect(broken),{},false,{});
  assert.equal(collect(host,n=>n.tagName==='button'&&n.textContent==='Preview animation').length,0);
});

test('Preview navigation is one-shot, gesture-cancellable and respects reduced motion',()=>{
  const listeners=new Map(),calls=[];
  const view={
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
    removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
    matchMedia(){return {matches:false};}
  };
  const target={hidden:false,scrollIntoView(args){calls.push(args);}};
  const navigation=editor.createPreviewNavigation(view,{hidden:false});
  const dispatch=(type,event)=>{for(const fn of [...(listeners.get(type)||[])])fn(event||{});};
  assert.equal(navigation.finish(target),false,'unrequested frame painting must never scroll');
  navigation.start();
  assert.equal(navigation.isPending(),true);
  dispatch('keydown',{key:'a'});
  assert.equal(navigation.isPending(),true,'ordinary typing does not cancel scroll');
  dispatch('wheel');
  assert.equal(navigation.finish(target),false,'wheel navigation cancels deferred scroll');
  assert.equal(calls.length,0);
  navigation.start();dispatch('touchstart');assert.equal(navigation.finish(target),false);
  navigation.start();dispatch('pointerdown');assert.equal(navigation.finish(target),false);
  navigation.start();dispatch('keydown',{key:'PageDown'});assert.equal(navigation.finish(target),false);
  navigation.start();
  assert.equal(navigation.finish(target),true);
  assert.deepEqual(calls,[{behavior:'smooth',block:'start'}]);
  assert.equal(navigation.finish(target),false,'a second paint cannot repeat navigation');
  assert.equal([...listeners.values()].every(s=>s.size===0),true,'listeners cleaned after navigation');
  view.matchMedia=()=>({matches:true});
  navigation.start();assert.equal(navigation.finish(target),true);
  assert.deepEqual(calls.at(-1),{behavior:'auto',block:'start'});
  navigation.start();navigation.cancel();assert.equal(navigation.finish(target),false);
  navigation.start();assert.equal(navigation.finish({hidden:true,scrollIntoView(){throw Error('hidden');}}),false);
  navigation.start();assert.equal(editor.createPreviewNavigation(view,{hidden:true}).finish(target),false);
});

test('Locked v2 Picker filters by contract, protects hidden selections and blocks incompatible drags',()=>{
  const vm=require('node:vm');
  const src=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  const functions=src.slice(src.indexOf('  function animationPickerAllEntries(entries){'),
    src.indexOf('  function toggleAnimationPicker(open){'));
  const render=src.slice(src.indexOf('  function renderAnimationStudio(entries){'),
    src.indexOf('  var historyMetadataEditingId=null;'));
  const filters=require('../src/ui/modern/ModernExperimentHistoryFilters');
  const base=experiment(),camera=clone(base),pan=clone(base),objects=clone(base),physics=clone(base);
  camera.scene.camera.Height=30;pan.scene.camera.Pan=6;
  objects.scene.objects.ObjDist[0]+=10;
  physics.scene.temperatureProfile.gradientKPerKm+=10;
  const entries=[entry(1,base,'Reference'),entry(2,camera,'Compatible high'),
    entry(3,objects,'Bad objects'),entry(4,physics,'Bad atmosphere'),
    entry(5,pan,'Compatible pan')];
  const draft={...studio.blank(),contract:contracts.create(base,{mode:'camera'})};
  const host={querySelector(){return null;},querySelectorAll(){return [];}};
  let picker,edits=0;
  const ctx={historyFiltersApi:filters,studioContractApi:contracts,studioPickerFilters:filters.normalize(),
    studioPickerQueryDraft:'',studioPickerAdvancedOpen:true,studioPickerOpen:true,
    studioPickerShowIncompatible:false,
    studioPickerChecked:{2:true,3:true,4:true},studioPickerScroll:0,studioFilmstripScroll:0,
    studioSelectedKey:null,studioDragSession:null,studioDiagnosticTransition:null,
    studioEditHistory:null,studioPrepared:null,studioPlayback:null,
    studioActiveDemo:null,studioLibraryActive:null,studioRestorePreviewPending:false,animationWorkspaceOpen:false,
    studioInitialPaintFrame:null,studioPlaybackRenderedAt:null,
    studioDraft:draft,studioEditingApi:editing,studioUI:{render(){},renderPicker(_doc,_host,shown,actions,options){
      picker={shown,actions,options};}},studioApi:studio,
    newUiEl(id){if(id==='ModernAnimationStudio')return host;
      if(id==='ModernAnimationSnapshotPicker')return {querySelector(){return null;}};
      return null;},document:{},renderStudioLibrary(){},syncLegacyHistorySelection(){},
    saveApplicationPreferences(){},saveStudioDraft(){edits++;return true;},
    applySuggestedStudioName:v=>v,stopStudioPlayback(){},root:{},
    Promise,Array,Object,Map,Set,Number,String,RangeError,Error};
  vm.runInNewContext(functions+'\n'+render,ctx);
  ctx.renderAnimationStudio(entries);
  assert.deepEqual(Array.from(picker.shown,e=>e.id),[1,2,5]);
  assert.match(picker.options.contractMode,/Camera Motion/);
  assert.equal(picker.options.compatibleCount,3);
  assert.equal(picker.options.incompatibleCount,2);
  assert.equal(picker.options.selectedCount,1);
  assert.deepEqual(Object.keys(ctx.studioPickerChecked),['2'],
    'previous checked frames outside the contract are removed');
  picker.actions.pickerShowIncompatible(true);
  assert.deepEqual(Array.from(picker.shown,e=>e.id),[1,2,3,4,5]);
  assert.equal(picker.options.compatibility(entries[2]).allowed,false);
  picker.actions.pickerToggle(3,true);
  assert.deepEqual(Object.keys(ctx.studioPickerChecked),['2']);
  let dragPrevented=false;
  picker.actions.dragStart({kind:'snapshots',id:3},
    {preventDefault(){dragPrevented=true;}});
  assert.equal(dragPrevented,true);
  assert.equal(ctx.studioDragSession,null);
  picker.actions.pickerFilter('query','Bad objects');
  assert.deepEqual(Array.from(picker.shown,e=>e.id),[3]);
  assert.equal(picker.options.selectedCount,1,'compatible selection survives search');
  picker.actions.insertChecked();
  assert.deepEqual(Array.from(ctx.studioDraft.frames,f=>f.sourceSnapshotId),[2],
    'Add checked includes compatible hidden selection, not rejected rows');
  assert.equal(edits,1);
  picker.actions.pickerShowIncompatible(false);
  assert.equal(picker.shown.length,0);
  picker.actions.pickerFiltersClear();
  assert.deepEqual(Array.from(picker.shown,e=>e.id),[1,2,5]);
  assert.equal(picker.options.selectedCount,0);
});

test('Picker shows incompatible v2 snapshots read-only with reasons and History navigation',()=>{
  const base=experiment(),good=clone(base),bad=clone(base);
  good.scene.camera.Height+=15;bad.scene.objects.ObjSize[0]+=20;
  const contract=contracts.create(base,{mode:'camera'});
  const rows=[entry(1,good,'Good'),entry(2,bad,'Different objects')];
  const {doc,host}=mockDom(),events=[];
  const actions={pickerFilter(){},pickerFiltersClear(){},pickerAdvancedToggle(){},
    pickerClose(){},pickerToggle(){events.push('toggle');},pickerClearSelection(){},
    pickerShowIncompatible:v=>events.push(['show',v]),
    pickerOpenHistory:id=>events.push(['history',id]),insertChecked(){},
    dragStart(){events.push('drag');},dragEnd(){}};
  editor.renderPicker(doc,host,rows,actions,{open:true,contractMode:'Camera Motion · project rules',
    compatibleCount:1,incompatibleCount:1,showIncompatible:true,
    compatibility:row=>contracts.inspectCandidate(contract,row.experiment),checked:{2:true}});
  const cards=collect(host,n=>String(n.className).split(' ').includes('modern-studio-picker-card'));
  assert.equal(cards.length,2);
  assert.equal(cards[0].draggable,true);
  assert.notEqual(cards[1].draggable,true,'incompatible snapshots cannot start a drag');
  assert.equal(cards[1].children[0].disabled,true);
  assert.equal(cards[1].children[0].checked,false);
  assert.match(collect(cards[1],n=>n.className==='modern-studio-picker-incompatibility')[0]
    .textContent,/Objects · ObjSize/);
  assert.equal(collect(cards[1],n=>n.className==='modern-studio-drag-handle').length,0);
  const toggle=collect(host,n=>n.getAttribute&&
    n.getAttribute('aria-label')==='Show incompatible project snapshots')[0];
  toggle.checked=false;toggle.listeners.change();
  assert.deepEqual(events,[['show',false]]);
  const openHistory=collect(cards[1],n=>n.className==='modern-studio-picker-open-history')[0];
  openHistory.listeners.click({stopPropagation(){}});
  assert.deepEqual(events.at(-1),['history',2],
    'incompatible snapshots remain inspectable in History');
});

test('Picker compatibility follows the selected physical channel, Experimental permits mixed snapshots, and v1 is unrestricted',()=>{
  const vm=require('node:vm');
  const src=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  const helpers=src.slice(src.indexOf('  function animationPickerAllEntries(entries){'),
    src.indexOf('  function toggleAnimationPicker(open){'));
  const base=experiment(),gradient=clone(base),moved=clone(base),mixed=experiment('compare');
  gradient.scene.temperatureProfile.gradientKPerKm+=5;
  moved.scene.camera.Height+=10;
  const target={scope:'scene',parameter:'temperatureProfile.gradientKPerKm'};
  const ctx={studioContractApi:contracts,studioDraft:{contract:contracts.create(base,{mode:'physical',target})},
    studioPickerChecked:{2:true,3:true},Map,Object,String,Array};
  vm.runInNewContext(helpers,ctx);
  assert.equal(ctx.animationPickerVerdict(entry(2,gradient)).allowed,true);
  assert.equal(ctx.animationPickerVerdict(entry(3,moved)).allowed,false);
  ctx.animationPickerPruneSelection([entry(2,gradient),entry(3,moved)]);
  assert.deepEqual(Object.keys(ctx.studioPickerChecked),['2']);
  ctx.studioDraft={contract:contracts.create(base,{mode:'experimental'})};
  assert.equal(ctx.animationPickerVerdict(entry(4,mixed)).allowed,true);
  ctx.studioDraft={contract:null};
  assert.equal(ctx.animationPickerVerdict(entry(4,mixed)),null);
});


test('Storyboard uses prepared subsequence arrival times and shared key selection, without editor actions',()=>{
  const a=experiment(),b=clone(a),c=clone(a);
  b.scene.camera.Height=45;c.scene.camera.Height=85;
  let draft=studio.history([1,2,3],[entry(1,a,'First'),entry(2,b,'Excluded'),entry(3,c,'Last')]);
  draft={...draft,activeFrameKeys:['history-1','history-3']};
  draft=studio.editFrame(draft,'history-1','holdMs','1.25');
  draft=studio.editFrame(draft,'history-3','travelMs','3.17');
  const project=studio.build(draft,'storyboard_test');
  const {doc,host}=mockDom(),calls=[];
  editor.renderStoryboard(doc,host,draft,studio.activeFrames(draft),animation.timeline(project),'history-3',(...args)=>calls.push(args));
  const cards=collect(host,n=>n.tagName==='button');
  assert.equal(cards.length,2);
  assert.equal(cards[0]['aria-label'],'Jump to keyframe 1: First · 0.00 s');
  assert.equal(cards[1]['aria-label'],'Jump to keyframe 3: Last · 4.42 s');
  assert.equal(cards[1]['aria-pressed'],'true');
  assert.equal(cards[0]['aria-pressed'],'false');
  cards[0].listeners.click();assert.deepEqual(calls,[['history-1','storyboard']]);
  assert.equal(host.hidden,false);
  editor.renderStoryboard(doc,host,draft,[],[],null,()=>{});assert.equal(host.hidden,true);
});

test('Editor timeline remains present after preview preparation even with Storyboard',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=45;
  const draft=studio.history([1,2],[entry(1,a),entry(2,b)]),{doc,host}=mockDom();
  editor.render(doc,host,draft,studio.inspect(draft),{},true,{readOnly:true,storyboard:true});
  assert.equal(collect(host,n=>n.className==='modern-studio-filmstrip').length,0);
  editor.render(doc,host,draft,studio.inspect(draft),{},true,{storyboard:true});
  assert.equal(collect(host,n=>n.className==='modern-studio-filmstrip').length,1);
  assert.equal(collect(host,n=>n.className==='modern-studio-editor-details').length,0);
});


test('Storyboard renders captured and missing thumbnails with an independent refresh action',()=>{
  const a=experiment('compare'),b=clone(a);b.scene.camera.Height=45;
  const draft=studio.history([1,2],[entry(1,a,'First'),entry(2,b,'Second')]);
  const project=studio.build(draft,'storyboard_thumbs'),{doc,host}=mockDom(),calls=[];
  const image={dataUrl:'data:image/webp;base64,YQ==',width:960,height:300,mode:'compare'};
  editor.renderStoryboard(doc,host,draft,draft.frames,animation.timeline(project),'history-2',
    (...args)=>calls.push(args),{resolve:f=>({...f,thumbnail:f.key==='history-1'?image:null}),refresh:key=>calls.push(['refresh',key]),batch:action=>calls.push(['batch',action]),batchBusy:true,cancelBatch:()=>calls.push(['cancel'])});
  const cards=collect(host,n=>n.className.includes('modern-animation-storyboard-card'));
  assert.equal(collect(cards[0],n=>n.tagName==='img')[0].src,image.dataUrl);
  assert.equal(collect(cards[1],n=>n.className==='modern-storyboard-no-image').length,1);
  collect(host,n=>n.className.includes('modern-animation-storyboard-capture'))[0].listeners.click();
  const author=collect(host,n=>n.className.includes('modern-animation-author-only'));
  assert.equal(author.filter(n=>n.tagName==='button').length,6);
  assert.equal(author.filter(n=>n.className.includes('modern-animation-storyboard-status')).length,1);
  assert.ok(cards.every(n=>!n.className.includes('modern-animation-author-only')));
  cards[1].listeners.click();assert.deepEqual(calls,[['refresh','history-2'],['history-2','storyboard']]);
});

test('History source ID never displays an image for a changed keyframe',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=45;
  const draft=studio.history([1,2],[entry(1,a),entry(2,b)]);
  const {doc,host}=mockDom(),changed=clone(b);changed.scene.camera.Height=999;
  editor.render(doc,host,draft,studio.inspect(draft),{},false,{entries:[{...entry(2,changed),thumbnail:{dataUrl:'data:image/webp;base64,YQ==',width:480,height:300,mode:'scene'}}],selectedKey:'history-2'});
  assert.equal(collect(host,n=>n.tagName==='img').length,0);
});

test('reference editor lists shared photographs, labels missing IDs, and issues only selected frame edits',async()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=75;
  const d=studio.history([1,2],[entry(1,a),entry(2,b)]);
  const draft=studio.editFrame(d,'history-2','referenceImageIds',['missing','photo_A']);
  const {doc,host}=mockDom(),calls=[];
  const actions={frame:(...args)=>calls.push(args),edit(){},select(){},prepare(){}};
  editor.render(doc,host,draft,studio.inspect(draft),actions,false,{selectedKey:'history-2',
    listReferenceImages:async()=>[{id:'photo_A',title:'Photo A',thumbnail:{dataUrl:'data:image/png;base64,YQ=='}},{id:'photo_B',title:'Photo B',thumbnail:{dataUrl:'data:image/png;base64,Yg=='}}]});
  await Promise.resolve();await Promise.resolve();
  const section=collect(host,n=>n.className==='modern-studio-reference-links')[0];
  assert.ok(collect(section,n=>n.textContent==='Missing local photograph: missing').length);
  assert.ok(collect(section,n=>n.textContent==='Photo A').length);
  const picker=collect(section,n=>n.className==='modern-studio-reference-gallery')[0];
  const choice=collect(picker,n=>n['aria-label']==='Select photograph Photo B')[0];
  assert.ok(choice);assert.ok(!collect(picker,n=>n['aria-label']==='Select photograph Photo A').length);
  assert.ok(collect(choice,n=>n.tagName==='img').some(n=>n.src==='data:image/png;base64,Yg=='));
  assert.ok(collect(section,n=>n.tagName==='img').some(n=>n.src==='data:image/png;base64,YQ=='));
  choice.listeners.click();assert.equal(choice['aria-pressed'],'true');
  const attach=collect(section,n=>n.textContent==='Attach')[0];assert.equal(attach.disabled,false);attach.listeners.click();
  assert.deepEqual(calls.pop(),['history-2','referenceImageIds',['missing','photo_A','photo_B']]);
  const unlink=collect(section,n=>n['aria-label']==='Unlink reference photograph 1')[0];unlink.listeners.click();
  assert.deepEqual(calls.pop(),['history-2','referenceImageIds',['photo_A']]);
  const move=collect(section,n=>n['aria-label']==='Move reference photograph 2 earlier')[0];move.listeners.click();
  assert.deepEqual(calls.pop(),['history-2','referenceImageIds',['photo_A','missing']]);
  section.isConnected=false;unlink.listeners.click();assert.equal(calls.length,0);
  assert.deepEqual(draft.frames[1].referenceImageIds,['missing','photo_A']);
});

test('Editor Inspector toggles without remounting timeline or changing draft',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=65;
  const draft=studio.history([1,2],[entry(1,a),entry(2,b)]);
  const {doc,host}=mockDom(),events=[];
  const actions={select:key=>events.push(key),edit(){},frame(){},move(){},prepare(){}};
  editor.render(doc,host,draft,studio.inspect(draft),actions,false,{selectedKey:'history-1'});
  const timeline=collect(host,n=>n.className==='modern-studio-timeline-pane')[0];
  const frame=collect(host,n=>n.className==='modern-studio-frame-panel')[0];
  const project=collect(host,n=>n.className==='modern-studio-project-panel')[0];
  const nav=collect(host,n=>n.className==='modern-studio-inspector-nav')[0];
  assert.ok(timeline);assert.ok(frame);assert.ok(project);
  assert.equal(frame.hidden,false);assert.equal(project.hidden,true);
  assert.ok(collect(frame,n=>n.textContent==='Frame name').length);
  const input=collect(frame,n=>n.tagName==='input')[0],buttons=collect(nav,n=>n.tagName==='button');
  buttons[1].listeners.click();
  assert.equal(frame.hidden,true);assert.equal(project.hidden,false);
  assert.equal(buttons[1]['aria-pressed'],'true');
  assert.equal(collect(host,n=>n.className==='modern-studio-timeline-pane')[0],timeline);
  buttons[0].listeners.click();
  assert.equal(collect(frame,n=>n.tagName==='input')[0],input);
  buttons[1].listeners.click();
  editor.render(doc,host,draft,studio.inspect(draft),actions,false,{selectedKey:'history-1'});
  assert.equal(collect(host,n=>n.className==='modern-studio-project-panel')[0].hidden,false);
  const keys=collect(host,n=>n.tagName==='button'&&n.className.includes('modern-studio-keyframe'));
  keys[1].listeners.click();assert.deepEqual(events,['history-2']);
  editor.render(doc,host,draft,studio.inspect(draft),actions,false,{selectedKey:'history-2'});
  assert.equal(collect(host,n=>n.className==='modern-studio-frame-panel')[0].hidden,false);
});

test('Editor diagnostics retain exact values behind a compact disclosure',()=>{
  const a=experiment(),b=clone(a),c=clone(a);
  b.scene.camera.Height=55;c.scene.temperatureProfile.gradientKPerKm=11;
  const draft=studio.history([1,2,3],[entry(1,a),entry(2,b),entry(3,c)]);
  const {doc,host}=mockDom(),result=studio.inspect(draft);
  assert.equal(result.compatible,false);
  editor.render(doc,host,draft,result,{edit(){},frame(){},prepare(){}},false,{});
  let d=collect(host,n=>n.className==='modern-studio-diagnostics-disclosure')[0];
  assert.ok(d);assert.equal(d.open,false);assert.ok(collect(d,n=>n.tagName==='td').length);
  editor.render(doc,host,draft,result,{edit(){},frame(){},prepare(){}},false,{diagnosticTransition:1});
  d=collect(host,n=>n.className==='modern-studio-diagnostics-disclosure')[0];
  assert.equal(d.open,true);
  d.open=false;
  d.listeners.toggle();
  editor.render(doc,host,draft,result,{edit(){},frame(){},prepare(){}},false,{});
  d=collect(host,n=>n.className==='modern-studio-diagnostics-disclosure')[0];
  assert.equal(d.open,false,'user-collapsed diagnostics stay collapsed after rerender');
});

test('Compatible sequences disclosure stays compact and preserves user-open state',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=90;
  const draft=studio.history([1,2],[entry(1,a),entry(2,b)]);
  const {doc,host}=mockDom(),actions={edit(){},frame(){},prepare(){}};
  const result=studio.inspect(draft);
  editor.render(doc,host,draft,result,actions,false,{});
  let disclosure=collect(host,n=>n.className==='modern-studio-sequences-disclosure')[0];
  assert.ok(disclosure);assert.equal(disclosure.open,false,'sequence choices are closed by default');
  assert.equal(collect(disclosure,n=>n.className==='modern-studio-sequences').length,1);
  disclosure.open=true;
  disclosure.listeners.toggle();
  editor.render(doc,host,draft,result,actions,false,{});
  disclosure=collect(host,n=>n.className==='modern-studio-sequences-disclosure')[0];
  assert.equal(disclosure.open,true,'user-open sequence choices survive a draft render');
  assert.deepEqual(draft.frames.map(f=>f.key),['history-1','history-2']);
});

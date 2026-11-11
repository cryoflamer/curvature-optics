'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const codec=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const sequence=require('../src/camera/ModernCameraSequence');
const studio=require('../src/animation/ModernAnimationStudio');
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
  const doc={createElement(tag){return {tagName:tag,children:[],listeners:{},textContent:'',
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
  const actions={choose:()=>calls.push('choose'),load:()=>calls.push('load'),importCamera:()=>calls.push('import'),
    edit:(...args)=>calls.push(['edit',...args]),frame:(...args)=>calls.push(['frame',...args]),
    move:(...args)=>calls.push(['move',...args]),remove:(...args)=>calls.push(['remove',...args]),
    select:(...args)=>calls.push(['select',...args]),prepare:()=>calls.push('prepare')};
  editor.render(doc,host,draft,studio.inspect(draft),actions,false,{stagedCount:2});
  const buttons=collect(host,n=>n.tagName==='button');
  buttons.find(b=>b.textContent==='Choose from History').listeners.click();
  buttons.find(b=>b.textContent==='Load staged snapshots (2)').listeners.click();
  buttons.find(b=>b.textContent==='Import Camera Animation').listeners.click();
  buttons.find(b=>b.textContent==='Prepare project').listeners.click();
  assert.deepEqual(calls,['choose','load','import','prepare']);
  const fieldInputs=collect(host,n=>n.tagName==='input');
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
  assert.ok(status.children.some(n=>n.tagName==='ul'));
  assert.equal(collect(host,n=>n.tagName==='button'&&n.textContent==='Prepare project')[0].disabled,true);
});

test('Studio fields persist valid in-progress edits on input before focus leaves the field',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=60;
  const draft=studio.history([1,2],[entry(1,a),entry(2,b)]);
  const {doc,host}=mockDom(),calls=[];
  const actions={load(){},importCamera(){},edit(){},frame(){},prepare(){},
    liveEdit:(field,value)=>calls.push(['liveEdit',field,value]),
    liveFrame:(key,field,value)=>calls.push(['liveFrame',key,field,value])};
  editor.render(doc,host,draft,studio.inspect(draft),actions,false,{selectedKey:'history-2'});
  const controls=collect(host,n=>n.tagName==='input'||n.tagName==='textarea');
  const names=controls.filter(n=>n.type==='text');
  names[0].value='New draft before F5';names[0].listeners.input();
  assert.deepEqual(calls.at(-1),['liveEdit','name','New draft before F5']);
  names[1].value='Renamed frame';names[1].listeners.input();
  assert.deepEqual(calls.at(-1),['liveFrame','history-2','name','Renamed frame']);
  const number=controls.find(n=>n.type==='number');
  number.value='6.2';number.listeners.input();
  assert.deepEqual(calls.at(-1),['liveFrame','history-2','travelMs','6.2']);
  const textarea=controls.find(n=>n.tagName==='textarea');
  textarea.value='An important physical experiment';textarea.listeners.input();
  assert.deepEqual(calls.at(-1),['liveEdit','description','An important physical experiment']);
});

test('Studio thumbnail filmstrip uses saved History images, selected-only controls and camera placeholders',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=75;
  let draft=studio.history([1,2],[entry(1,a,'Base'),entry(2,b,'High')]);
  const image='data:image/webp;base64,YQ==';
  const saved=[{...entry(1,a,'Base'),thumbnail:{dataUrl:image}},
    {...entry(2,b,'High'),thumbnail:{dataUrl:image}}];
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
  assert.equal(collect(host,n=>n.className==='modern-studio-field').length,7,
    'three global fields plus four selected keyframe fields');
  const change=collect(host,n=>n.className==='modern-studio-frame-fields')[0];
  change.children[0].children[1].value='Renamed';
  change.children[0].children[1].listeners.change();
  assert.deepEqual(calls.at(-1),['frame','history-2','name','Renamed']);
  cards[0].listeners.click();
  assert.deepEqual(calls.at(-1),['select','history-1']);
  assert.deepEqual([draft,saved],before,'visuals never modify source records or drafts');
  const previews=collect(host,n=>n.className==='modern-studio-preview');
  assert.equal(previews.length,1);
  assert.equal(collect(previews[0],n=>n.tagName==='img')[0].src,image);
  const imported=studio.importCamera(a,sequence.validate([
    {name:'Low',camera:a.scene.camera,travelMs:0,holdMs:0,easing:'linear'},
    {name:'High',camera:b.scene.camera,travelMs:1000,holdMs:0,easing:'linear'}]));
  host.children=[];
  editor.render(doc,host,imported,studio.inspect(imported),actions,false,{entries:saved});
  const placeholders=collect(host,n=>n.className==='modern-storyboard-no-image');
  assert.equal(placeholders.length,3,'imported camera views, including selected preview, do not borrow unrelated History screenshots');
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
  const removes=items.map(item=>collect(item,n=>n.className==='modern-studio-card-remove'));
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

test('One-step removal undo is visible only when requested and restores through its action',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=45;
  const draft=studio.history([1,2],[entry(1,a),entry(2,b)]);
  const {doc,host}=mockDom(),calls=[];
  editor.render(doc,host,draft,studio.inspect(draft),{
    undoRemove:()=>calls.push('undo')},false,{undoRemoval:'First & last',selectedKey:'history-1'});
  const banner=collect(host,n=>n.className==='modern-studio-undo-removal');
  assert.equal(banner.length,1);
  assert.match(banner[0].children[0].textContent,/First & last/);
  banner[0].children[1].listeners.click();
  assert.deepEqual(calls,['undo']);
  host.children=[];
  editor.render(doc,host,draft,studio.inspect(draft),{},false,{});
  assert.equal(collect(host,n=>n.className==='modern-studio-undo-removal').length,0);
  const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  assert.match(app,/undo\.after!==studioDraft/);
  assert.match(app,/studioSelectedKey=undo\.selectedKey/);
  assert.match(app,/studioApi\.remove\(studioDraft,key\)/);
});

test('Staged snapshot cards remove shortlist IDs, not saved History entries',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=65;
  const entries=[entry(11,a,'Globe'),entry(12,b,'Flat')];
  const draft=studio.history([11,12],entries),before=structuredClone([entries,draft]);
  const {doc,host}=mockDom(),calls=[];
  editor.render(doc,host,draft,studio.inspect(draft),{
    unstage:id=>calls.push(['unstage',id])},false,
  {entries,stagedCount:2,stagedIds:[12,11]});
  const staged=collect(host,n=>n.className==='modern-studio-staged-card');
  assert.equal(staged.length,2);
  assert.match(staged[0].children[1].textContent,/Flat/);
  const remove=collect(staged[0],n=>n.className==='modern-studio-card-remove')[0];
  assert.match(remove['aria-label'],/from staging/);
  remove.listeners.click({stopPropagation(){}});
  assert.deepEqual(calls,[['unstage',12]]);
  assert.deepEqual([entries,draft],before,'History and draft stay untouched');
  assert.match(fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8'),
    /historyStoryboardQueue=historyStoryboardQueue\.filter\(function\(value\)\{return value!==id;\}\)/);
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
  const actions={pickerSearch:(...args)=>calls.push(['search',...args]),
    pickerToggle:(...args)=>calls.push(['toggle',...args]),pickerClose:()=>calls.push('close'),
    pickerFullHistory:()=>calls.push('full'),insertChecked:()=>calls.push('insert'),
    dragStart:(...args)=>calls.push(['drag',...args]),dragEnd:()=>calls.push('end')};
  editor.renderPicker(doc,host,saved,actions,{open:true,search:'test',checked:{1:true}});
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
  assert.equal(calls.at(-1)[1],'camera');
  editor.renderPicker(doc,host,saved,actions,{open:false});
  assert.equal(host.hidden,true);
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

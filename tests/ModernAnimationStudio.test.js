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
    setAttribute(name,value){this[name]=value;}};}};
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

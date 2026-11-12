'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const codec=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const sequences=require('../src/animation/ModernAnimationSequences');
const studio=require('../src/animation/ModernAnimationStudio');
const autosave=require('../src/animation/ModernAnimationDraftAutosave');
const ui=require('../src/ui/modern/ModernAnimationStudioUI');
const animation=require('../src/animation/ModernAnimationProject');
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
function draftOf(experiments){return studio.history(experiments.map((_,i)=>i+1),
  experiments.map((exp,i)=>({id:i+1,name:'Snapshot '+(i+1),experiment:exp})));}
function fiveFrames(){
  const c1=experiment('compare'),c2=clone(c1),c3=clone(c1);
  c2.scene.camera.Height=55;c3.scene.camera.Height=80;
  const flat=experiment('scene'),globe=clone(flat);
  flat.scene.surface.showModel=2;
  return [c1,c2,c3,flat,globe];
}
function mockDom(){
  const doc={createElement(tag){return {tagName:tag,children:[],listeners:{},textContent:'',
    className:'',value:'',disabled:false,
    appendChild(node){this.children.push(node);return node;},
    addEventListener(name,fn){this.listeners[name]=fn;},
    setAttribute(name,value){this[name]=value;},
    getAttribute(name){return this[name]===undefined?null:String(this[name]);}};}};
  return {doc,host:doc.createElement('div')};
}
function collect(node,predicate){return [node,...node.children.flatMap(n=>collect(n,predicate))].filter(predicate);}

test('Auto-detect finds camera and Flat/Globe sequences from a mixed 5-frame draft',()=>{
  const source=fiveFrames(),backup=clone(source),draft=draftOf(source);
  assert.equal(studio.inspect(draft).compatible,false);
  const choices=studio.findSequences(draft);
  assert.deepEqual(choices.map(v=>[v.mode,v.target?.parameter||null,v.indices]),[
    ['camera',null,[0,1,2]],['physical','surface.curvature',[3,4]]]);
  assert.deepEqual(source,backup,'discovery never modifies the source snapshots');
  let chosen=studio.selectSequence(draft,choices[0].id);
  assert.deepEqual(studio.activeFrames(chosen).map(f=>f.key),choices[0].keys);
  assert.equal(studio.inspect(chosen).compatible,true);
  assert.equal(studio.build(chosen,'camera_study').keyframes.length,3);
  assert.equal(studio.build(chosen,'camera_study').mode,'camera');
  assert.equal(chosen.frames.length,5,'all five source cards remain editable');
  chosen=studio.edit(chosen,'mode','auto');
  assert.equal(chosen.activeFrameKeys,null,'re-choosing a mode resets an old selection');
  chosen=studio.selectSequence(chosen,studio.findSequences(chosen)[1].id);
  const project=studio.build(chosen,'curvature_study');
  assert.equal(project.mode,'physical');
  assert.deepEqual(project.target,{scope:'scene',parameter:'surface.curvature'});
  assert.equal(project.keyframes.length,2);
  assert.equal(animation.sampleAt(project,0).scene.surface.showModel,2);
  assert.equal(animation.sampleAt(project,100000).scene.surface.showModel,1);
  assert.equal(chosen.frames.length,5);
  assert.equal(studio.inspect(studio.clearSequence(chosen)).compatible,false);
});

test('Largest global groups can skip incompatible intervening frames',()=>{
  const a=experiment(),b=clone(a),c=clone(a),d=clone(a),e=clone(a);
  b.scene.temperatureProfile.gradientKPerKm=3;
  c.scene.camera.Height=35;d.scene.temperatureProfile.gradientKPerKm=8;
  e.scene.camera.Height=60;
  const draft=draftOf([a,b,c,d,e]);
  const found=studio.findSequences(draft);
  assert.ok(found.some(g=>g.mode==='camera'&&g.indices.join(',')==='0,2,4'));
  assert.ok(found.some(g=>g.mode==='physical'&&g.target.parameter==='temperatureProfile.gradientKPerKm'&&
    g.indices.join(',')==='0,1,3'));
  for(const group of found){
    const selected=studio.selectSequence(draft,group.id);
    assert.equal(studio.inspect(selected).compatible,true,'every offered group must be accepted by Preview');
  }
});

test('Explicit mode filters options; comparison channel and fixed controls are never mixed',()=>{
  const frames=fiveFrames(),draft=draftOf(frames);
  assert.deepEqual(sequences.discover(draft.frames,'camera').map(v=>v.mode),['camera']);
  assert.ok(sequences.discover(draft.frames,'physical').every(v=>v.mode==='physical'));
  const a=experiment('compare'),b=clone(a),c=clone(a);
  b.compare.A.radiusKm=6800;
  c.compare.B.surface='globe';c.compare.B.radiusKm=6500;
  const variants=studio.findSequences(draftOf([a,b,c]));
  // Each comparison channel is independent: A and B cannot be interpolated together.
  assert.ok(variants.some(v=>v.target?.scope==='A'&&v.indices.join(',')==='0,1'));
  assert.ok(variants.some(v=>v.target?.scope==='B'&&v.indices.join(',')==='0,2'));
  assert.ok(!variants.some(v=>v.indices.join(',')==='0,1,2'));
  assert.throws(()=>studio.selectSequence(draft,'fake-variant'),/no longer available/);
});

test('An active variant survives autosave, can be edited and keeps unrelated cards',()=>{
  const draft=draftOf(fiveFrames());
  const selected=studio.selectSequence(draft,studio.findSequences(draft)[0].id);
  const updated=studio.editFrame(selected,selected.activeFrameKeys[1],'name','Camera waypoint');
  assert.deepEqual(updated.activeFrameKeys,selected.activeFrameKeys);
  const checkpoint=autosave.checkpoint({draft:updated,selectedKey:updated.frames[0].key,
    quality:'accurate',prepared:true,positionMs:1250},1000);
  assert.deepEqual(checkpoint.draft.activeFrameKeys,selected.activeFrameKeys);
  assert.equal(studio.build(checkpoint.draft,'autosaved').keyframes.length,3);
  assert.equal(checkpoint.draft.frames.length,5);
  const invalid=clone(checkpoint);
  invalid.draft.activeFrameKeys.push('nonexistent');
  assert.throws(()=>autosave.normalize(invalid),/selected animation sequence/);
  const afterInsert=studio.insertSnapshots(updated,[6],[{id:6,name:'Extra',experiment:experiment()}],5);
  assert.equal(afterInsert.activeFrameKeys,null,'inserting new snapshots returns to the full sequence');
  assert.equal(studio.remove(updated,updated.frames[4].key).activeFrameKeys,null);
});

test('UI exposes usable groups, marks excluded frames and keeps all five cards',()=>{
  const draft=draftOf(fiveFrames()),{doc,host}=mockDom(),actions=[],variants=studio.findSequences(draft);
  const callbacks={prepare(){},edit(){},selectSequence(id){actions.push(id);},clearSequence(){actions.push('clear');}};
  ui.render(doc,host,draft,studio.inspect(draft),callbacks,false,
    {sequences:variants,activeFrames:studio.activeFrames(draft)});
  const use=collect(host,n=>n.tagName==='button'&&n.textContent==='Use sequence');
  assert.equal(use.length,2);
  use[0].listeners.click();assert.equal(actions[0],variants[0].id);
  const selected=studio.selectSequence(draft,actions[0]);
  const otherHost=mockDom();
  ui.render(otherHost.doc,otherHost.host,selected,studio.inspect(selected),callbacks,false,
    {sequences:studio.findSequences(selected),activeFrames:studio.activeFrames(selected)});
  const cards=collect(otherHost.host,n=>n.tagName==='button'&&n.className.includes('modern-studio-keyframe'));
  assert.equal(cards.length,5);
  assert.equal(cards.filter(n=>n.className.includes('is-outside-sequence')).length,2);
  assert.ok(collect(otherHost.host,n=>n.tagName==='button'&&n.textContent==='Preview animation')[0].disabled===false);
  collect(otherHost.host,n=>n.tagName==='button'&&n.textContent==='Use all keyframes')[0].listeners.click();
  assert.equal(actions.at(-1),'clear');
});

test('Static entrypoint routes the selected subsequence to Preview and library export',()=>{
  const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  assert.ok(html.indexOf('ModernAnimationSequences.js')<html.indexOf('ModernAnimationStudio.js'));
  assert.match(app,/studioApi\.selectSequence\(studioDraft,id\)/);
  assert.match(app,/studioApi\.activeFrames\(studioDraft\)\[0\]/);
  assert.match(app,/studioPrepared=studioApi\.build\(studioDraft,'studio_draft'\)/);
  assert.match(app,/project=studioApi\.build\(studioDraft,id\)/);
});

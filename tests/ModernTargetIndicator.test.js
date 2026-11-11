'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const indicator=require('../src/ui/modern/ModernTargetIndicator');
const direction=require('../src/camera/ModernTargetDirection');
const png=require('../src/animation/ModernAnimationFrameExport');
const video=require('../src/animation/ModernAnimationVideoPipeline');
const prefs=require('../src/ui/modern/ModernApplicationPreferences');
function model(geometry=1,pan=0){return {rEarth:6371000,rFEarth:10007543,
  showModel:geometry,Height:15,CameraEast:0,CameraNorth:0,Pan:pan,Nick:0,Roll:0,
  camViewAngle:Math.PI/3,deviceRatio:16/9,viewcenterHorizon:3,
  ObjType:[3,3],NObjects:[1,1],ObjDist:[1000,1200],ObjDeltaDist:[300,300],
  ObjSidePos:[0,400],ObjSideVar:[0,0],ObjSideType:[0,0],ObjSize:[65,65],
  ObjSizeVar:[0,0],ObjSizeType:[0,0]};}
function doc(){function make(){return {children:[],attributes:{},parentNode:null,hidden:false,
  appendChild(child){child.parentNode=this;this.children.push(child);return child;},
  removeChild(child){this.children.splice(this.children.indexOf(child),1);child.parentNode=null;},
  setAttribute(k,v){this.attributes[k]=v;}};}return {createElement:make};}
function canvas(){const actions=[],ctx={save(){actions.push(['save']);},
  restore(){actions.push(['restore']);},setTransform(){actions.push(['transform']);},
  measureText(s){return {width:s.length*6};},fillRect(){actions.push(['fillRect']);},
  fillText(s){actions.push(['text',s]);}};
  return {width:960,height:540,actions,getContext(){return ctx;}};}

test('scene, groups and missing groups are geometric only; no optics verdict',()=>{
  const m=model(),original=structuredClone(m);
  assert.equal(indicator.selection(), 'scene');
  assert.equal(indicator.description(m,'scene'),null,'target in view: do not obscure scene');
  const left=indicator.description({...m,Pan:60},'scene');
  const right=indicator.description({...m,Pan:-60},'scene');
  assert.equal(left.direction,'left');assert.equal(left.arrow,'←');
  assert.equal(right.direction,'right');assert.equal(right.arrow,'→');
  assert.equal(indicator.description({...m,Pan:180},'scene').direction,'behind');
  assert.match(indicator.description({...m,Pan:180},'group-1').text,/Group 2.*BEHIND/);
  assert.equal(indicator.description({...m,Pan:180,NObjects:[1,0]},'group-1'),null);
  assert.equal(Object.hasOwn(right,'opticallyVisible'),false);
  assert.deepEqual(m,original);
  assert.equal(typeof direction.measure,'function');
});

test('Flat and Globe indicator agree on left/right and remain independent of refraction',()=>{
  for(const showModel of [1,2]){
    const m=model(showModel,-60);
    assert.equal(indicator.description(m,'group-0').direction,'right');
    assert.equal(indicator.description(m,'group-1').direction,'right');
  }
  for(const invalid of ['object','group-2',42,{},''])
    assert.throws(()=>indicator.selection(invalid),RangeError);
});

test('DOM indicator is offscreen-only, reuses its node, and Compare sides stay independent',()=>{
  const d=doc(),widget=indicator.create({document:d});
  const parentA=d.createElement('div'),parentB=d.createElement('div');
  const a=d.createElement('canvas'),b=d.createElement('canvas');
  parentA.appendChild(a);parentB.appendChild(b);
  assert.equal(widget.update('A',a,model(1,60)),true);
  assert.equal(widget.update('B',b,model(2,-60)),true);
  const nodeA=parentA.children[1],nodeB=parentB.children[1];
  assert.equal(nodeA.attributes['data-direction'],'left');
  assert.equal(nodeB.attributes['data-direction'],'right');
  assert.equal(nodeA.children[0].textContent,'←');
  assert.equal(widget.update('A',a,model(1,0)),false);
  assert.equal(nodeA.hidden,true);assert.equal(nodeB.hidden,false);
  widget.update('A',a,model(1,180));
  assert.equal(parentA.children[1],nodeA);
  assert.equal(nodeA.attributes['data-direction'],'behind');
  widget.hideAll();assert.equal(nodeA.hidden,true);assert.equal(nodeB.hidden,true);
  assert.equal(widget.update('wrong',a,model(1,180)),false);
});

test('Canvas burn-in paints after optics only when out of view, not when in view',()=>{
  const m=model(),c=canvas();
  assert.equal(indicator.paint(c,m),c);
  assert.deepEqual(c.actions,[]);
  const before=structuredClone(m);
  indicator.paint(c,{...m,Pan:180});
  assert.equal(c.actions[0][0],'save');
  assert.ok(c.actions.some(x=>x[0]==='text'&&/BEHIND/.test(x[1])));
  assert.equal(c.actions.at(-1)[0],'restore');
  assert.deepEqual(m,before);
  assert.throws(()=>indicator.paint(null,m),TypeError);
});

test('independent app preferences persist indicator visibility and selection safely',()=>{
  const stored=new Map();const db={getItem:k=>stored.get(k)||null,
    setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
  prefs.write(db,{targetIndicatorVisible:false,studioTargetVisible:false,
    targetIndicatorSelection:'group-1'});
  const recovered=prefs.read(db);
  assert.equal(recovered.targetIndicatorVisible,false);
  assert.equal(recovered.studioTargetVisible,false);
  assert.equal(recovered.targetIndicatorSelection,'group-1');
  assert.equal(prefs.normalize({targetIndicatorSelection:'invalid'}).targetIndicatorSelection,'scene');
  assert.equal(prefs.defaults().targetIndicatorVisible,true);
});

test('PNG and video validate opt-in target settings without changing opt-out defaults',()=>{
  // Selection validation is common for both timelines even for disabled UI.
  for(const planner of [png,video]){
    const base=fs.readFileSync(path.join(__dirname,'../src/animation/'+
      (planner===png?'ModernAnimationFrameExport.js':'ModernAnimationVideoPipeline.js')),'utf8');
    assert.match(base,/targetIndicator:!!\(options&&options.targetIndicator===true\)/);
    assert.match(base,/targetSelection:target\?target.selection/);
    assert.match(base,/target\.paint|png\.prepareCanvas/);
  }
});

test('browser/worker dependency order and UI controls are complete',()=>{
  const root=path.resolve(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
  const html=read('CurvatureModern.html');
  assert.equal((html.match(/<script src="src\/ui\/modern\/ModernTargetIndicator.js\?/g)||[]).length,1);
  assert.ok(html.indexOf('src/camera/ModernTargetDirection.js')<html.indexOf('src/ui/modern/ModernTargetIndicator.js'));
  assert.ok(html.indexOf('src/ui/modern/ModernTargetIndicator.js')<html.indexOf('src/animation/ModernAnimationFrameExport.js'));
  for(const id of ['ModernTargetIndicatorToggle','ModernTargetIndicatorSelection',
    'ModernAnimationTargetToggle','ModernAnimationTargetSelection',
    'ModernAnimationFrameExportTarget','ModernAnimationVideoExportTarget'])assert.ok(html.includes('id="'+id+'"'),id);
  for(const worker of ['ModernAnimationFrameWorker','ModernAnimationVideoEncoderWorker','ModernAnimationArchiveWorker']){
    const code=read('src/animation/'+worker+'.js');
    assert.match(code,/ModernTargetIndicator.js\?target-indicator=1/);
    assert.ok(code.indexOf('ModernTargetIndicator.js')<code.indexOf('ModernAnimationFrameExport.js'));
  }
  const app=read('src/ui/modern/ModernApp.js');
  assert.match(app,/function updateTargetIndicator\(override\)/);
  assert.match(app,/function syncStudioTargetIndicator\(\)/);
  assert.match(app,/updateTargetIndicator\(override\);/);
  assert.match(app,/targetIndicator:!!\(newUiEl\('ModernAnimationVideoExportTarget'\)/);
  assert.doesNotMatch(read('CurvatureApp.html'),/ModernTargetIndicator|ModernTargetDirection/);
});

test('browser module draws a real direction with geometry dependency in UMD context',()=>{
  const api={CurvatureModernTargetDirection:direction};
  const src=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernTargetIndicator.js'),'utf8');
  vm.runInNewContext(src,{globalThis:api});
  assert.equal(api.CurvatureModernTargetIndicator.description(model(2,180)).direction,'behind');
});

const projectApi=require('../src/animation/ModernAnimationProject');
const state=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
function compareProject(){
  const m={...model(1),FocalLengthField:1000,showGrid:0,DemoText:'Target',Description:''};
  const experiment=state.capture(m,{atmosphere:'vacuum',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},compare.preset('globe-flat-vacuum'),
    {mode:'compare',eyeLevel:false,horizon:false,selected:'A'});
  const other=structuredClone(experiment);other.scene.camera.Height=25;
  return projectApi.create([{experiment,holdMs:0},{experiment:other,travelMs:1000}],
    {id:'target_indicator',name:'Direction test'});
}
function exportCanvas(w,h){
  const c=canvas();c.width=w;c.height=h;
  c.toBlob=cb=>cb(new Blob([Uint8Array.from([137,80,78,71,13,10,26,10]),
    Buffer.from(JSON.stringify(c.actions))],{type:'image/png'}));
  return c;
}
function renderer(store){return async(_sample,side,dimensions)=>{
  const c=exportCanvas(dimensions.width,dimensions.height);store[side]=c;
  return {canvas:c,quality:'accurate',cameraModel:model(side==='A'?1:2,180),
    metrics:{opticalQuality:'accurate'}};
};}
test('PNG target burn-in is opt-in, independent of camera HUD, and includes manifest settings',async()=>{
  const project=compareProject(),without=png.plan(project,{fps:5,width:640,height:360});
  const pixels={};const a=await png.renderTimestamp(without,0,renderer(pixels));
  for(const side of ['A','B'])assert.equal(pixels[side].actions.some(x=>x[0]==='text'),false);
  const p=png.plan(project,{fps:5,width:640,height:360,targetIndicator:true,
    targetSelection:'group-0',cameraHud:false});
  const on={};const b=await png.renderTimestamp(p,0,renderer(on));
  for(const side of ['A','B'])assert.equal(on[side].actions.filter(x=>x[0]==='text').length,1);
  assert.notDeepEqual(Buffer.from(a.entries[0].data),Buffer.from(b.entries[0].data));
  const rendered=[b];for(let i=1;i<p.timesMs.length;i++)rendered.push(await png.renderTimestamp(p,i,renderer({})));
  const manifest=png.assemble(p,rendered).manifest;
  assert.equal(manifest.targetIndicatorIncluded,true);
  assert.equal(manifest.targetSelection,'group-0');
  assert.equal(manifest.cameraHudIncluded,undefined);
  assert.throws(()=>png.plan(project,{targetIndicator:true,targetSelection:'group-2'}),RangeError);
  assert.throws(()=>png.plan(project,{targetIndicator:'yes'}),RangeError);
});
test('video carries target indicator onto both source canvases before combined frame construction',async()=>{
  const project=compareProject();
  const p=video.plan(project,{fps:5,width:640,height:360,targetIndicator:true,
    targetSelection:'scene',cameraHud:false});
  assert.equal(p.outputSides.join(','),'COMBINED');
  const frames={};let captured=null;
  class VideoFrameMock{constructor(c){this.canvas=c;this.closed=false;}close(){this.closed=true;}}
  const result=await video.renderTimestamp(p,0,renderer(frames),VideoFrameMock,null,(images)=>{
    captured=Object.fromEntries(Object.entries(images).map(([side,image])=>[side,image.canvas.actions]));
    return exportCanvas(p.outputWidth,p.outputHeight);
  });
  for(const side of ['A','B'])assert.equal(captured[side].filter(x=>x[0]==='text').length,1);
  assert.equal(result.frames.COMBINED.closed,false);
  video.closeFrames(result);assert.equal(result.frames.COMBINED.closed,true);
  const disabled=video.plan(project,{fps:5,width:640,height:360,targetIndicator:false});
  const none={};await video.renderTimestamp(disabled,0,renderer(none),VideoFrameMock,null,
    ()=>exportCanvas(disabled.outputWidth,disabled.outputHeight));
  for(const side of ['A','B'])assert.equal(none[side].actions.some(x=>x[0]==='text'),false);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const compose=require('../src/animation/ModernAnimationPresentationCompositor');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=';
function project(compare=true){
  const p=structuredClone(require('../demos/modern/soundly.json').animations[0].project);
  if(compare){p.baseExperiment.display.mode='compare';p.contract.referenceExperiment.display.mode='compare';}
  p.keyframes[0].referenceImageIds=['first','second'];p.keyframes[0].narrativeTitle='Observation';p.keyframes[0].description='An actual observation.';
  p.keyframes[3].referenceImageIds=['last'];return p;
}
function sources(frame){return Object.fromEntries(frame.sides.map(side=>[side,{quality:'accurate',timeMs:frame.timeMs,
  cameraModel:{showModel:frame.expected[side].showModel},metrics:{opticalQuality:'accurate'},canvas:{...frame.viewSize,
    getContext(){throw Error('Source mutated');}}}]));}
function target(frame,fail=false){
  const calls=[],ctx={save(){calls.push(['save']);},restore(){calls.push(['restore']);},setTransform(...args){calls.push(['transform',...args]);},
    fillRect(...args){calls.push(['rect',...args]);},drawImage(...args){calls.push(['image',...args,this.imageSmoothingEnabled]);if(fail)throw Error('paint failed');},
    measureText(s){return {width:Array.from(s).length*Number(/\d+px/.exec(this.font)[0].slice(0,-2))*.5};},
    fillText(...args){calls.push(['text',...args]);}};
  return {width:frame.width,height:frame.height,calls,getContext(){return ctx;}};
}
function observation(id='first',meta={}){return compose.observation({version:1,id,title:'Actual photograph',original:{dataUrl:png,width:1,height:1},...meta},{naturalWidth:1,naturalHeight:1});}
function inside(r,b){assert.ok(r.x>=b.x&&r.y>=b.y&&r.x+r.width<=b.x+b.width+1e-8&&r.y+r.height<=b.y+b.height+1e-8,JSON.stringify({r,b}));}
function overlap(a,b){return a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;}

test('fixed output geometry fits all presets, views and layout modes without overlap',()=>{
  for(const width of [1280,1920,2560,3840])for(const compare of [true,false])for(const referenceLayout of ['side','below','hidden'])for(const showNarrative of [true,false])for(const layoutMode of ['fixed','dynamic'])for(const cameraHud of [true,false]){
    const p=compose.plan(project(compare),{width,referenceLayout,showNarrative,layoutMode,cameraHud,cameraHudAppearance:{size:125,opacity:90,position:'bottom-right'}});
    const f=compose.frameAt(p,0),g=compose.frameAt(p,p.times[1].arrivalMs),h=compose.frameAt(p,p.durationMs);
    for(const frame of [f,g,h]){
      assert.equal(frame.width/frame.height,16/9);assert.equal(frame.viewSize.width/frame.viewSize.height,16/9);
      assert.ok(frame.viewSize.width>=320&&frame.viewSize.width<=1920&&frame.viewSize.height>=180&&frame.viewSize.height<=1080);
      const bounds={x:0,y:0,width:frame.width,height:frame.height};
      const boxes=frame.sides.map(s=>frame.panels[s].panel);
      if(frame.photo){boxes.push(frame.photo);inside(frame.photoBox,frame.photo);inside(frame.photoText,frame.photo);assert.ok(!overlap(frame.photoBox,frame.photoText));assert.ok(frame.photoText.height>=4*Math.ceil(Math.round(12*frame.scale)*1.22));}
      if(frame.narrative)boxes.push(frame.narrative);
      boxes.forEach((b,i)=>{inside(b,bounds);boxes.slice(i+1).forEach(c=>assert.ok(!overlap(b,c)));});
      frame.sides.forEach(s=>{
        const v=frame.panels[s].viewport;inside(v,frame.panels[s].panel);
        for(const meta of [frame.sceneCaption,frame.cameraHud].filter(Boolean)){
          inside(meta,bounds);assert.ok(!overlap(v,meta));
          if(frame.photo)assert.ok(!overlap(frame.photo,meta));
          if(frame.narrative)assert.ok(!overlap(frame.narrative,meta));
        }
      });
    }
    if(layoutMode==='fixed'){assert.deepEqual(f.panels,g.panels);assert.deepEqual(g.panels,h.panels);}
    if(referenceLayout==='hidden'){assert.equal(f.photo,null);assert.equal(f.referenceId,null);}
    else if(layoutMode==='dynamic'){assert.ok(f.photo);assert.equal(g.photo,null);assert.ok(g.viewSize.width>=f.viewSize.width);}
  }
});
test('frozen plan and sampled frame share exact hold boundaries and outgoing narrative',()=>{
  const raw=project(),p=compose.plan(raw),f=compose.frameAt(p,0),end=p.times[0].departureMs;
  raw.keyframes[0].referenceImageIds.reverse();raw.name='Changed';
  assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.project)&&Object.isFrozen(p.times[0].referenceImageIds));
  assert.equal(f.referenceId,'first');assert.equal(f.referenceCount,2);assert.match(f.chapter,/Observation/);
  assert.equal(compose.frameAt(p,end).referenceId,'first');
  const travel=compose.frameAt(p,end+1);assert.equal(travel.referenceId,null);assert.equal(travel.caption.text,'An actual observation.');
  assert.equal(compose.frameAt(p,p.times[1].arrivalMs).caption,null);
  assert.equal(compose.frameAt(p,p.times[3].arrivalMs).referenceId,'last');assert.equal(compose.frameAt(p,p.durationMs).referenceId,null);
  assert.equal(compose.frameAt(p,0).title,f.title);assert.ok(!('referenceImageIds' in f.sample));
  const d=compose.plan(project(),{layoutMode:'dynamic'});assert.ok(compose.frameAt(d,end+1).photo);
});
test('photo containment preserves complete portrait, landscape and square originals',()=>{
  const box={x:10,y:20,width:350,height:180};
  for(const [w,h] of [[3,4],[10000,10],[10,10000],[1,1],[1920,1080]]){
    const r=compose.contain(box,w,h);inside(r,box);assert.ok(Math.abs(r.width/r.height-w/h)<1e-7);assert.ok(Math.abs(r.width-box.width)<1e-8||Math.abs(r.height-box.height)<1e-8);
  }
});
test('painting preserves independent optics pixels, uses original and labels provenance, quality and clock',()=>{
  const f=compose.frameAt(compose.plan(project()),0),a=sources(f),p=observation(),out=target(f);
  const result=compose.paint(out,f,a,p);assert.equal(result.canvas,out);assert.deepEqual(result.warnings,[]);
  assert.deepEqual(out.calls.filter(c=>c[0]==='image'),[
    ['image',a.A.canvas,f.panels.A.viewport.x,f.panels.A.viewport.y,false],
    ['image',a.B.canvas,f.panels.B.viewport.x,f.panels.B.viewport.y,false],
    ['image',p.image,...Object.values(compose.contain(f.photoBox,1,1)),true]]);
  const text=out.calls.filter(c=>c[0]==='text').map(c=>c[1]);
  for(const label of ['Reference · real observation · 1 / 2','Author: Unknown','License: Unknown','Source: Unknown','An actual observation.'])assert.ok(text.includes(label),label);
  assert.ok(text.some(t=>t.includes('Accurate RK4')));assert.ok(text.some(t=>t.includes(f.expected.A.atmosphere)));
  assert.equal(out.calls.at(-1)[0],'restore');
  const again=target(f);compose.paint(again,f,a,p);assert.deepEqual(again.calls,out.calls);
});
test('overflow visibly marked without concealing source or license behind long title and author',()=>{
  const raw=project();raw.keyframes[0].description='Long narrative '.repeat(70).slice(0,1000);
  const f=compose.frameAt(compose.plan(raw,{width:1280}),0),out=target(f);
  const result=compose.paint(out,f,sources(f),observation('first',{title:'X'.repeat(200),author:'a'.repeat(300),license:'CC BY',sourceUrl:'https://example.org/'+'x'.repeat(600)}));
  assert.ok(result.warnings.includes('reference title'));assert.ok(result.warnings.includes('reference author'));assert.ok(result.warnings.includes('reference source'));
  const text=out.calls.filter(c=>c[0]==='text').map(c=>c[1]);assert.ok(text.includes('License: CC BY'));assert.ok(text.some(t=>t.startsWith('Source: https://')));assert.ok(text.some(t=>t.endsWith('…')));
});
test('rejects inaccurate, wrong timestamp/geometry, duplicate target, missing or stale photograph before paint',()=>{
  const p=compose.plan(project()),f=compose.frameAt(p,0),a=sources(f),photo=observation();
  for(const bad of [{...a,A:{...a.A,quality:'fast'}},{...a,A:{...a.A,timeMs:1}},
    {...a,A:{...a.A,cameraModel:{showModel:3}}},{...a,A:{...a.A,canvas:{width:5,height:5}}},
    {...a,B:{...a.B,canvas:a.A.canvas}},{A:a.A}]){
    const out=target(f);assert.throws(()=>compose.paint(out,f,bad,photo));assert.deepEqual(out.calls,[]);
  }
  for(const bad of [undefined,observation('last')]){const out=target(f);assert.throws(()=>compose.paint(out,f,a,bad),/original/);assert.deepEqual(out.calls,[]);}
  const travel=compose.frameAt(p,p.times[0].departureMs+1);assert.throws(()=>compose.paint(target(travel),travel,sources(travel),photo),/Unexpected/);
  const out=target(f,true);assert.throws(()=>compose.paint(out,f,a,photo),/paint failed/);assert.equal(out.calls.at(-1)[0],'restore');
  assert.throws(()=>compose.observation({version:1,id:'first',title:'Photo',original:{dataUrl:png,width:1,height:1}},{width:2,height:1}),/dimensions/);
  for(const opts of [{width:640},{height:500},{referenceLayout:'overlay'},{layoutMode:'stretch'},{showNarrative:'yes'}])assert.throws(()=>compose.plan(project(),opts));
  for(const time of [-1,NaN,p.durationMs+1])assert.throws(()=>compose.frameAt(p,time));
});
test('unlinked demos have no empty photo panel; standalone browser-compatible module has no DOM dependency',()=>{
  const p=structuredClone(require('../demos/modern/soundly.json').animations[0].project),f=compose.frameAt(compose.plan(p),0);
  assert.equal(f.photo,null);assert.equal(f.narrative,null);assert.equal(f.sides.length,1);
  const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'src/animation/ModernAnimationPresentationCompositor.js'),'utf8');
  const context={CurvatureModernAnimationProject:require('../src/animation/ModernAnimationProject'),CurvatureModernAnimationPresentation:require('../src/animation/ModernAnimationPresentation'),CurvatureModernReferenceImage:require('../src/animation/ModernReferenceImage')};
  vm.runInNewContext(source,context);assert.equal(context.CurvatureModernAnimationPresentationCompositor.plan(p).width,1920);
});

function cameraSources(frame){
  const a=sources(frame);
  for(const side of frame.sides)Object.assign(a[side].cameraModel,{Height:8,CameraEast:-44.5,CameraNorth:496,
    Pan:.5,Nick:0,Roll:0,camViewAngle:1.2*Math.PI/180,deviceRatio:16/9,viewcenterHorizon:3,rEarth:6371000,rFEarth:10000000});
  return a;
}
test('external HUD uses actual camera values, shares exact equal telemetry, and separates differing pitch',()=>{
  const raw=project(),f=compose.frameAt(compose.plan(raw,{width:1920,cameraHud:true}),0),a=cameraSources(f),out=target(f);
  assert.deepEqual(f.viewSize,{width:624,height:351});
  const texts=out=>out.calls.filter(c=>c[0]==='text');
  assert.deepEqual(compose.paint(out,f,a,observation()).warnings,[]);
  let labels=texts(out).map(c=>c[1]);
  assert.ok(labels.includes('Camera · A / B'));assert.equal(labels.filter(t=>t==='Height 8.00 m').length,1);
  assert.equal(labels.filter(t=>t===f.sceneTitle).length,1);
  assert.ok(labels.includes('Pitch 0.0°'));assert.ok(labels.includes('FOV 1.2°'));
  for(const c of texts(out).filter(c=>c[1]==='Height 8.00 m'))assert.ok(c[3]>=f.cameraHud.y);
  a.B.cameraModel.Nick=0.125;
  const different=target(f);compose.paint(different,f,a,observation());labels=texts(different).map(c=>c[1]);
  assert.ok(labels.includes('Camera · A')&&labels.includes('Camera · B'));
  assert.equal(labels.filter(t=>t==='Height 8.00 m').length,2);
  assert.ok(labels.includes('Pitch 0.13°'));
  const disabled=compose.frameAt(compose.plan(raw),0),noHud=target(disabled);
  compose.paint(noHud,disabled,sources(disabled),observation());assert.ok(!texts(noHud).some(c=>c[1].startsWith('Camera ·')));
});

test('adaptive shares use original aspect ratios, preserve physical size and stable Fixed geometry',()=>{
  const dimensions=[{id:'first',width:501,height:612},{id:'second',width:4000,height:1000},{id:'last',width:1176,height:791}];
  for(const width of [1280,1920,2560,3840])for(const compare of [true,false])for(const referenceLayout of ['side','below','hidden'])for(const layoutMode of ['fixed','dynamic'])for(const cameraHud of [true,false]){
    const raw=project(compare),opts={width,referenceLayout,layoutMode,cameraHud,cameraHudAppearance:{size:125,opacity:90,position:'bottom-right'}},
      legacy=compose.plan(raw,opts),p=compose.plan(raw,{...opts,referenceDimensions:dimensions});
    const frames=[0,p.times[0].departureMs+1,p.times[1].arrivalMs,p.times[3].arrivalMs,p.durationMs].map(t=>compose.frameAt(p,t));
    for(const f of frames){
      const old=compose.frameAt(legacy,f.timeMs);
      assert.ok(f.viewSize.width>=old.viewSize.width);assert.equal(f.viewSize.width/f.viewSize.height,16/9);
      const bounds={x:0,y:0,width:f.width,height:f.height};
      const boxes=f.sides.map(s=>f.panels[s].panel);
      if(f.photo){boxes.push(f.photo);inside(f.photoBox,f.photo);inside(f.photoText,f.photo);assert.ok(!overlap(f.photoBox,f.photoText));}
      if(f.narrative)boxes.push(f.narrative);
      boxes.forEach((b,i)=>{inside(b,bounds);boxes.slice(i+1).forEach(c=>assert.ok(!overlap(b,c)));});
      for(const side of f.sides){const v=f.panels[side].viewport;inside(v,f.panels[side].panel);
        for(const meta of [f.sceneCaption,f.cameraHud].filter(Boolean)){inside(meta,bounds);assert.ok(!overlap(v,meta));if(f.photo)assert.ok(!overlap(f.photo,meta));}}
      if(f.referenceId){const d=dimensions.find(d=>d.id===f.referenceId),photo=compose.contain(f.photoBox,d.width,d.height);inside(photo,f.photoBox);}
    }
    if(layoutMode==='fixed')for(const f of frames){assert.deepEqual(f.panels,frames[0].panels);assert.deepEqual(f.photo,frames[0].photo);}
  }
  const raw=project(),opts={width:1920,cameraHud:true,layoutMode:'dynamic'},frame=(w,h)=>compose.frameAt(compose.plan(raw,{...opts,referenceDimensions:[{id:'first',width:w,height:h}]}),0);
  assert.ok(frame(1,4).viewSize.width>frame(4,1).viewSize.width);
  assert.ok(frame(1,4).photo.width<frame(4,1).photo.width);
  assert.throws(()=>compose.plan(raw,{referenceDimensions:[{id:'first',width:0,height:1}]}),/dimensions/);
});

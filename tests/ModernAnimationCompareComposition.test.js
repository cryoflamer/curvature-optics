'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const compose=require('../src/animation/ModernAnimationCompareComposition');

function view(width,height,showModel){
  // Source context is never accessed by the compositor: no new optical paint,
  // and a pre-existing Camera HUD on the view Canvas must survive untouched.
  const canvas={width,height,getContext(){throw Error('Source canvas was mutated');}};
  return {quality:'accurate',cameraModel:{showModel},canvas,
    metrics:{opticalQuality:'accurate'}};
}
function output(width=1920,height=1080,failDraw=false){
  const actions=[];
  const ctx={globalAlpha:0.5,globalCompositeOperation:'destination-over',
    imageSmoothingEnabled:true,fillStyle:'',font:'',textAlign:'',textBaseline:'',
    save(){actions.push(['save']);},restore(){actions.push(['restore']);},
    setTransform(...args){actions.push(['transform',...args]);},
    fillRect(...args){actions.push(['rect',this.fillStyle,this.globalAlpha,this.globalCompositeOperation,...args]);},
    drawImage(...args){actions.push(['image',...args,this.imageSmoothingEnabled]);
      if(failDraw)throw Error('2d renderer failure');},
    fillText(...args){actions.push(['text',...args]);}};
  return {width,height,actions,ctx,getContext(type){assert.equal(type,'2d');return ctx;}};
}

test('layout preserves two full-size views inside a 16:9 output, without cropping or resampling',()=>{
  for(const [w,h] of [[640,360],[960,540],[1280,720],[1920,1080]]){
    const p=compose.layout(w,h);
    assert.equal(p.width,2*w);assert.equal(p.height,2*h);
    assert.deepEqual(p.panels.A,{x:0,y:h/2,width:w,height:h});
    assert.deepEqual(p.panels.B,{x:w,y:h/2,width:w,height:h});
    assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.panels)&&Object.isFrozen(p.panels.A));
    assert.equal(p.width/p.height,16/9);
  }
  assert.deepEqual(compose.layout(800,600).panels.B,{x:800,y:300,width:800,height:600});
});

test('composition copies A/B pixels 1:1 and draws physically correct labels outside viewports',()=>{
  const target=output(),a=view(960,540,1),b=view(960,540,2);
  const result=compose.paint(target,{A:a,B:b},{timeMs:7200,durationMs:10000,
    animationMode:'camera'});
  assert.equal(result,target);
  const items=target.actions;
  assert.deepEqual(items[0],['save']);
  assert.deepEqual(items[1],['transform',1,0,0,1,0,0]);
  assert.deepEqual(items.find(x=>x[0]==='rect'),['rect','#101923',1,'source-over',0,0,1920,1080]);
  assert.deepEqual(items.filter(x=>x[0]==='image'),[
    ['image',a.canvas,0,270,false],['image',b.canvas,960,270,false]]);
  const labels=items.filter(x=>x[0]==='text').map(x=>x[1]);
  assert.deepEqual(labels,['COMPARE A / B','A · GLOBE','B · FLAT','CAMERA ANIMATION',
    '00:07.20 / 00:10.00']);
  const positions=items.filter(x=>x[0]==='text').map(x=>x.slice(2));
  assert.ok(positions[1][1]<270&&positions[2][1]<270,
    'A/B labels stay above the optical frame, not over its contents or HUD');
  assert.ok(positions[3][1]>270+540&&positions[4][1]>270+540);
  assert.deepEqual(items.at(-1),['restore']);
});

test('labels reflect the actual camera geometries, not a hardcoded A Globe/B Flat preset',()=>{
  for(const [models,labels] of [
    [[2,1],['A · FLAT','B · GLOBE']],
    [[2,2],['A · FLAT','B · FLAT']],
    [[1,1],['A · GLOBE','B · GLOBE']]
  ]){
    const target=output(1280,720),a=view(640,360,models[0]),b=view(640,360,models[1]);
    compose.paint(target,{A:a,B:b},{animationMode:'physical'});
    const texts=target.actions.filter(x=>x[0]==='text').map(x=>x[1]);
    assert.deepEqual(texts,['COMPARE A / B',...labels,'PHYSICAL ANIMATION']);
    assert.deepEqual(target.actions.filter(x=>x[0]==='image').map(x=>x.slice(2,4)),
      [[0,180],[640,180]]);
  }
});

test('repeated composition uses fixed data, never wall-clock time or new rendering',()=>{
  const frames={A:view(960,540,1),B:view(960,540,2)},opts={
    timeMs:10000,durationMs:10000,animationMode:'camera'};
  const first=output(),second=output();
  compose.paint(first,frames,opts);compose.paint(second,frames,opts);
  assert.deepEqual(first.actions,second.actions);
  assert.equal(first.actions.filter(x=>x[0]==='text').at(-1)[1],
    '00:10.00 / 00:10.00');
  const before=JSON.stringify(opts);
  assert.equal(JSON.stringify(opts),before);
  assert.equal(first.actions.filter(x=>x[0]==='image').length,2);
});

test('invalid layout, missing sides, fast frames, bad timestamps and target reuse fail before painting',()=>{
  for(const [w,h] of [[319,180],[320,179],[1921,1080],[1920,1081],
    [NaN,540],[960.5,540],[1920,1080.5],[4000,2250]])
    assert.throws(()=>compose.layout(w,h),/Invalid Compare composition/);
  const a=view(960,540,1),b=view(960,540,2);
  for(const frames of [
    {A:a},
    {A:a,B:view(640,360,2)},
    {A:{...a,quality:'fast'},B:b},
    {A:{...a,metrics:{opticalQuality:'fast'}},B:b},
    {A:{...a,cameraModel:{showModel:3}},B:b},
    {A:a,B:{...b,cameraModel:null}},
  ]){
    const target=output();
    assert.throws(()=>compose.paint(target,frames),/Compare [AB]/);
    assert.equal(target.actions.length,0);
  }
  const reused=output();
  assert.throws(()=>compose.paint(reused,{A:{...a,canvas:reused},B:b}),/Compare A/);
  assert.equal(reused.actions.length,0);
  for(const opts of [
    {timeMs:1},{durationMs:3},{timeMs:-1,durationMs:2},
    {timeMs:4,durationMs:2},{timeMs:0,durationMs:0},
    {timeMs:NaN,durationMs:1},{timeMs:0,durationMs:Infinity},
    {animationMode:'scrubbing'}
  ]){
    const target=output();
    assert.throws(()=>compose.paint(target,{A:a,B:b},opts),/Invalid Compare composition/);
    assert.equal(target.actions.length,0);
  }
  assert.throws(()=>compose.paint(output(1920,540),{A:a,B:b}),/Compare A/);
});

test('canvas failures still restore the 2D context; missing Canvas API fails closed',()=>{
  const a=view(960,540,1),b=view(960,540,2),target=output(1920,1080,true);
  assert.throws(()=>compose.paint(target,{A:a,B:b}),/2d renderer failure/);
  assert.deepEqual(target.actions.at(-1),['restore']);
  const broken=output();delete broken.ctx.drawImage;
  assert.throws(()=>compose.paint(broken,{A:a,B:b}),/Canvas 2D/);
  assert.equal(broken.actions.length,0);
});

test('browser and frame-worker versions load without touching Legacy or current ZIP protocol',()=>{
  const root=path.join(__dirname,'..');
  const source=fs.readFileSync(path.join(root,'src/animation/ModernAnimationCompareComposition.js'),'utf8');
  const modern=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const legacy=fs.readFileSync(path.join(root,'CurvatureApp.html'),'utf8');
  const frameWorker=fs.readFileSync(path.join(root,'src/animation/ModernAnimationFrameWorker.js'),'utf8');
  const encoderWorker=fs.readFileSync(path.join(root,'src/animation/ModernAnimationVideoEncoderWorker.js'),'utf8');
  const frameExport=fs.readFileSync(path.join(root,'src/animation/ModernAnimationFrameExport.js'),'utf8');
  assert.ok(modern.indexOf('ModernAnimationCompareComposition.js')>0);
  assert.ok(modern.indexOf('ModernAnimationCompareComposition.js')<
    modern.indexOf('ModernAnimationVideoPipeline.js'));
  assert.ok(frameWorker.indexOf("'ModernAnimationCompareComposition.js'")>0);
  assert.ok(frameWorker.indexOf("'ModernAnimationCompareComposition.js'")<
    frameWorker.indexOf("'ModernAnimationVideoPipeline.js?"));
  assert.doesNotMatch(legacy,/ModernAnimationCompareComposition/);
  assert.doesNotMatch(encoderWorker,/ModernAnimationCompareComposition/);
  assert.doesNotMatch(frameExport,/ModernAnimationCompareComposition/);
  const browser={};
  vm.runInNewContext(source,{globalThis:browser},{filename:'ModernAnimationCompareComposition.js'});
  assert.equal(typeof browser.CurvatureModernAnimationCompareComposition.paint,'function');
  assert.equal(browser.CurvatureModernAnimationCompareComposition.layout(960,540).width,1920);
});

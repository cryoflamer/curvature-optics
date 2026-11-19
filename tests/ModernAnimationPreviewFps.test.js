'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const controls=require('../src/animation/ModernAnimationPlaybackControls');
const preferences=require('../src/ui/modern/ModernApplicationPreferences');
const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');

function rendererHarness(target='60',options={}){
  let time=1000,playing=true,renderCost=14;
  const paints=[],nodes=new Map(),loading=[],samples=[];
  function node(id){
    if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,checked:true,
      classList:{toggle(){}}});
    return nodes.get(id);
  }
  const graph=()=>({Canvas:{width:900,height:600},CanvasWidth:898,BorderWidth:1});
  const graphs={A:graph(),B:graph()};
  const fakeRenderer={render(sample,side,graph,opts){paints.push(time);samples.push({sample,side,width:graph.Canvas.width});time+=renderCost;
    return options.render?options.render(side,opts):
      {quality:'canvas-direct',result:{drawn:128},overlays:{}};}};
  const meter=controls.createPreviewFpsMeter();
  const context=vm.createContext({
    studioPlayback:{status:()=>({playing,positionMs:time-1000,durationMs:100000}),
      sample:()=>({display:{mode:options.compare?'compare':'scene'},scene:{atmosphere:'vacuum'}})},
    studioPrepared:{mode:'camera',id:'fps_test'},animationWorkspaceOpen:true,
    studioPlaybackFps:target,studioPlaybackLastPaint:-Infinity,studioPlaybackNextDue:-Infinity,
    studioPlaybackRenderedAt:null,studioPreviewLifecycle:{markPainted(widths){if(options.markPainted)options.markPainted(widths);}},
    studioPlaybackFpsMeter:meter,studioPlaybackControlsApi:controls,
    studioPlaybackQuality:'canvas-direct',studioPlaybackDetail:'full',
    studioPreviewApi:{create:()=>fakeRenderer},studioPreviewRenderer:null,
    studioQualityAudit:null,studioLastParity:null,studioLastQualityFrame:null,
    studioPlaybackApi:{describeSample:()=>''},
    root:{CurvatureModernAnimationGraphs:graphs},
    profileNow:()=>time,newUiEl:node,attachStudioPreviewGraphs:()=>true,
    syncStudioReferences(position){if(options.layout)options.layout(position,graphs);},syncStudioPresentation(){},syncStudioCameraHud(){},studioFrameLoading(value){loading.push(value); },
    captureStudioKeyframeThumbnail(sample,time,graphs){if(options.capture)options.capture(sample,time,graphs);}
  });
  const start=app.indexOf('  function renderStudioPlaybackSample(force){');
  const end=app.indexOf('  function syncStudioQualitySummary(){',start);
  assert.ok(start>0&&end>start,'extract real renderer orchestration');
  vm.runInContext(app.slice(start,end)+'\nthis.paint=renderStudioPlaybackSample;',context);
  return {context,meter,paints,node,loading,samples,
    frame(at,forced=false){time=at;context.paint(forced);},
    playing(value){playing=value;},
    cost(value){renderCost=value;}};
}

test('preview caps use paint START timestamps rather than paint completion',()=>{
  assert.equal(controls.previewFrameAllowed('60',1000,1016.667,1016.667,false),true);
  assert.equal(controls.previewFrameAllowed('60',1000,1016.667,1014,false),false);
  assert.equal(controls.previewFrameAllowed('30',1000,1033.333,1016.667,false),false);
  assert.equal(controls.previewFrameAllowed('30',1000,1033.333,1033.333,false),true);
  assert.equal(controls.previewFrameAllowed('15',1000,1066.667,1066.667,false),true);
  assert.equal(controls.previewFrameAllowed('10',1000,1100,1100,false),true);
  assert.equal(controls.previewFrameAllowed('auto',1000,1001,1001,false),true);
  assert.equal(controls.previewFrameAllowed('10',1000,1100,1001,true),true);
  assert.equal(controls.previewFrameAllowed('60',-Infinity,-Infinity,1000,false),true);
  assert.throws(()=>controls.previewFrameAllowed('120',0,1000,1000,false),/Invalid preview FPS/);
});

test('the real preview path sustains 60 FPS with a 14 ms Canvas Direct painter',()=>{
  const h=rendererHarness('60');
  for(let i=0;i<60;i++)h.frame(1000+i*1000/60);
  assert.equal(h.paints.length,60,
    '60 Hz input with a 14 ms painter must not be throttled to 30 FPS');
  assert.ok(Math.abs(h.meter.fps(2000)-60)<0.1);
  assert.equal(h.context.studioPlaybackLastPaint,1000+59*1000/60,
    'stored paint time is the start, not the end of the render');
  h.playing(false);h.frame(2000,true);
  assert.equal(h.meter.fps(2014),null,'paused forced redraw does not count as playback');
});

test('30, 15 and 10 FPS caps skip excess browser ticks without changing the playhead',()=>{
  for(const [target,expected] of [['30',30],['15',15],['10',10]]){
    const h=rendererHarness(target);
    for(let i=0;i<60;i++)h.frame(1000+i*1000/60);
    assert.equal(h.paints.length,expected,target+' FPS from a 60 Hz refresh');
    assert.ok(Math.abs(h.meter.fps(2000)-expected)<0.1,target+' actual FPS');
  }
  const highRefresh=rendererHarness('60');
  highRefresh.cost(5);
  for(let i=0;i<144;i++)highRefresh.frame(1000+i*1000/144);
  assert.ok(highRefresh.paints.length>=59&&highRefresh.paints.length<=61,
    '60 FPS on a 144 Hz screen must alternate frame gaps instead of falling to 48');
  const auto=rendererHarness('auto');
  for(let i=0;i<12;i++)auto.frame(1000+i*1000/120);
  assert.equal(auto.paints.length,12,'Auto follows display refresh without an artificial 120 ms delay');
});

test('FPS meter uses a recent window, discards stale samples and resets on a time jump',()=>{
  const meter=controls.createPreviewFpsMeter();
  for(let i=0;i<31;i++)meter.record(i*1000/30);
  assert.ok(Math.abs(meter.fps(1000)-30)<0.1);
  assert.equal(meter.fps(2000),null,'an old reading cannot masquerade as live FPS');
  meter.record(500);
  assert.equal(meter.fps(500),null,'backward clocks discard the previous window');
  meter.reset();
  assert.equal(meter.fps(1000),null);
});

test('preview FPS belongs to browser preferences and is independent of PNG/video export',()=>{
  assert.match(html,/id="ModernAnimationPlaybackFps"/);
  assert.match(html,/id="ModernAnimationPlaybackActualFps"/);
  for(const value of ['auto','10','15','30','60'])
    assert.match(html,new RegExp('<option value="'+value+'"'));
  assert.equal(preferences.defaults().studioPlaybackFps,'auto');
  for(const value of ['10','15','30','60']){
    let data;
    const storage={getItem:()=>data||null,setItem:(key,val)=>{data=val;}};
    preferences.write(storage,{studioPlaybackFps:value});
    assert.equal(preferences.read(storage).studioPlaybackFps,value);
  }
  assert.equal(preferences.normalize({studioPlaybackFps:'300'}).studioPlaybackFps,'auto');
  assert.match(app,/studioPlaybackFps=remembered.studioPlaybackFps/);
  assert.match(app,/studioPlaybackFps:studioPlaybackFps/);
  assert.doesNotMatch(app,/studioDraft\.studioPlaybackFps\s*=/);
  assert.doesNotMatch(app,/studioPrepared\.studioPlaybackFps\s*=/);
});

test('Compare falls back atomically to Accurate if either side cannot use Canvas Direct',()=>{
  for(const rejected of ['A','B']){
    const requests=[];
    const h=rendererHarness('auto',{compare:true,render(side,opts){
      requests.push([side,opts.quality]);
      return side===rejected&&opts.quality==='canvas-direct'?{
        quality:'accurate',fallback:'Canvas Direct unavailable: Flat refraction',
        result:{drawn:12},overlays:{}}:
        {quality:opts.quality,result:{drawn:12},overlays:{}};
    }});
    h.frame(1000,true);
    assert.deepEqual(requests,[['A','canvas-direct'],['B','canvas-direct'],
      [rejected==='A'?'B':'A','accurate']],
      'the supported side is repainted in Accurate to avoid mixed optics');
    assert.match(h.node('ModernAnimationPlaybackQuality').textContent,
      /Accurate RK4 optics · Canvas Direct unavailable/);
    assert.match(h.node('ModernAnimationPlaybackDiagnostics').textContent,
      /Preview fallback: Canvas Direct unavailable/);
  }
});

test('paired playback uses one owned sample and masks partial frames on a B failure',()=>{
  let fail=true,captures=0;
  const h=rendererHarness('auto',{compare:true,capture(){captures++;},render(side,opts){
    if(side==='B'&&fail)throw Error('failed B');
    return {quality:opts.quality,result:{},overlays:{}};
  }});
  assert.throws(()=>h.frame(1000,true),/failed B/);
  assert.equal(h.context.studioPlaybackRenderedAt,null);
  assert.equal(captures,0);
  assert.equal(h.loading.at(-1),true);
  assert.strictEqual(h.samples[0].sample,h.samples[1].sample);
  fail=false;h.frame(1200,true);
  assert.equal(h.context.studioPlaybackRenderedAt,200);
  assert.equal(captures,1);
  assert.equal(h.loading.at(-1),false);
  assert.strictEqual(h.samples[2].sample,h.samples[3].sample);
});


test('reference columns match the requested frame before both physical paints and captures',()=>{
  let width=600,order=[],marks=[];const h=rendererHarness('auto',{compare:true,
    layout(position,graphs){
      if(Number.isFinite(position)){
        width=position<100?600:900;
        for(const graph of Object.values(graphs)){graph.Canvas.width=width;graph.CanvasWidth=width-2;}
        order.push('layout '+width);
      }else order.push('publish');
    },render(side){order.push(side+' '+width);return {quality:'canvas-direct',result:{},overlays:{}};},
    markPainted(widths){marks.push([widths.A,widths.B]);order.push('painted');},
    capture(sample,time,graphs){order.push('capture '+graphs.A.Canvas.width);}
  });
  h.frame(1000,true);h.frame(1200,true);h.frame(1000,true);
  assert.deepEqual(h.samples.map(s=>s.width),[600,600,900,900,600,600]);
  assert.deepEqual(marks,[[600,600],[900,900],[600,600]]);
  assert.deepEqual(order,[600,900,600].flatMap(w=>['layout '+w,'A '+w,'B '+w,'painted','publish','capture '+w]));
});

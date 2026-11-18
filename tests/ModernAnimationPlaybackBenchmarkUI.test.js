'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const runner=require('../src/animation/ModernAnimationPlaybackBenchmark');
const app=fs.readFileSync('src/ui/modern/ModernApp.js','utf8');
function harness(){
  const nodes=new Map(),queue=new Map(),downloads=[];
  let nextId=0,now=1000,position=40000,playing=true,renderCount=0,stops=0,starts=0;
  const paintOptions=[];
  function node(id){
    if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,checked:true,
      textContent:'',listeners:new Map(),addEventListener(event,cb){
        this.listeners.set(event,cb);
      },emit(event){const cb=this.listeners.get(event);assert.ok(cb,id+':'+event);cb();}});
    return nodes.get(id);
  }
  function context2d(){return {save(){},restore(){},setTransform(){},drawImage(){}};}
  const canvas={width:1200,height:800,clientWidth:800,clientHeight:533,
    getContext(){return context2d();},
    getBoundingClientRect(){return {width:800,height:533};}};
  const graph={Canvas:canvas};
  const sample={scene:{title:'Soundly Causeway'},display:{mode:'scene'}};
  const player={status(){return {positionMs:position,playing,durationMs:59000};},
    sample(){return sample;},pause(){playing=false;stops++;},start(){playing=true;starts++;},
    seek(v){position=v;}};
  const controls={halt(){player.pause();},schedule(){starts++;}};
  const painter={render(_sample,_side,_graph,options){
    renderCount++;now+=4;
    const flags=options&&options.canvasDirectDiagnostics||{};
    paintOptions.push({...flags});
    const calls=flags.strokeMode==='path-only'?0:flags.strokeMode==='batched'?10:60;
    return {quality:'canvas-direct',overlays:{},
      result:{timings:{projectionMs:2,canvasMs:2},
        directStats:{fillCalls:40,strokeCalls:calls,strokePrimitives:60,
          strokeWidthRange:{minPx:flags.strokeWidth===undefined?2:flags.strokeWidth,
            maxPx:flags.strokeWidth===undefined?3:flags.strokeWidth},
          horizonMasks:1,canvasCalls:{beginPath:100,stroke:calls,lineTo:250}},
        previewLod:{original:128},primitiveCount:250,drawn:250}};
  }};
  const probe={mode(){return 'normal';},setMode(){}};
  const context=vm.createContext({
    newUiEl:node,studioBenchmarkApi:runner,studioBenchmark:null,
    studioBenchmarkLastReport:null,studioPlayback:player,studioPrepared:{id:'soundly',mode:'camera'},
    studioPlaybackExperiment:probe,studioPlaybackFps:'auto',studioPlaybackQuality:'canvas-direct',
    studioPlaybackDetail:'full',studioPlaybackFpsMeter:{reset(){}},
    studioPlaybackLastPaint:25,studioPlaybackNextDue:20,studioFrameTiming:null,
    animationWorkspaceOpen:true,studioPreviewApi:{create(){return painter;}},
    studioPreviewRenderer:painter,studioPlaybackProfileEnabled:false,
    root:{navigator:{userAgent:'Test Opera'},devicePixelRatio:1.5,
      CurvatureModernAnimationGraphs:{A:graph,B:graph}},
    profileNow(){return now;},ensureStudioPlaybackControls(){return controls;},
    cancelStudioInitialPaint(){},attachStudioPreviewGraphs(){return true;},
    syncStudioPlaybackControls(){},renderStudioPlaybackSample(force,opts){
      assert.equal(force,true);
      if(opts){
        now+=opts.domOnly?1:5;
        return {rendererMs:opts.domOnly?0:4,postMs:1,A:{projectionMs:2,canvasMs:2}};
      }
      return null;
    },
    downloadHistoryJson(json,name){downloads.push({json:JSON.parse(json),name});},
    requestAnimationFrame(cb){const id=++nextId;queue.set(id,cb);return id;},
    cancelAnimationFrame(id){queue.delete(id);},
    document:{hidden:false,createElement(tag){assert.equal(tag,'canvas');return {
      width:0,height:0,getContext(){return context2d();}};}}
  });
  const from=app.indexOf('  function bindStudioBenchmark(){');
  const to=app.indexOf('  function bindStudioPlayback(){',from);
  assert.ok(from>0&&to>from);
  vm.runInContext(app.slice(from,to)+'\nthis.bind=bindStudioBenchmark;',context);
  context.bind();
  function tick(){
    assert.equal(queue.size,1);
    const [[id,callback]]=queue;queue.delete(id);
    now+=12;callback(now);
  }
  return {context,node,queue,tick,downloads,paintOptions,get position(){return position;},get renderCount(){return renderCount;},
    get playing(){return playing;},get starts(){return starts;},get stops(){return stops;}};
}

test('Run benchmark automatically exports JSON after sequential modes and restores Playback',()=>{
  const h=harness();
  h.node('ModernAnimationBenchmarkRun').emit('click');
  assert.equal(h.context.studioBenchmark.running(),true);
  assert.equal(h.node('ModernAnimationPlaybackPlay').disabled,true);
  for(let i=0;h.context.studioBenchmark.running()&&i<3000;i++)h.tick();
  assert.equal(h.context.studioBenchmark.running(),false);
  assert.equal(h.downloads.length,1);
  const {name,json}=h.downloads[0];
  assert.match(name,/^curvature-playback-benchmark-.*\.json$/);
  assert.equal(json.runs.length,15);
  assert.equal(json.environment.fixedTimeMs,40000);
  assert.equal(json.environment.canvas.width,1200);
  assert.equal(json.environment.canvas.cssWidth,800);
  assert.equal(h.playing,true,'original Playback running state restored');
  assert.equal(h.node('ModernAnimationPlaybackPlay').disabled,false);
  assert.equal(h.node('ModernAnimationBenchmarkCancel').hidden,true);
  assert.equal(h.node('ModernAnimationBenchmarkDownload').hidden,false);
  h.node('ModernAnimationBenchmarkDownload').emit('click');
  assert.equal(h.downloads.length,2,'last report is downloadable again');
  assert.ok(h.renderCount>100,'actual Canvas renderer executed outside JS-only modes');
});

test('Cancel benchmark restores Playback without exporting partial JSON',()=>{
  const h=harness();h.node('ModernAnimationBenchmarkRun').emit('click');
  for(let i=0;i<35;i++)h.tick();
  h.node('ModernAnimationBenchmarkCancel').emit('click');
  assert.equal(h.queue.size,0);
  assert.equal(h.downloads.length,0);
  assert.equal(h.playing,true);
  assert.match(h.node('ModernAnimationBenchmarkStatus').textContent,/cancelled/);
});


test('Canvas strokes UI exports all four modes and restores current display settings',()=>{
  const h=harness();
  h.node('ModernCanvasDirectFills').checked=false;
  h.node('ModernCanvasDirectStrokes').checked=false;
  h.node('ModernCanvasDirectMask').checked=false;
  h.node('ModernAnimationBenchmarkStrokes').emit('click');
  assert.equal(h.context.studioBenchmark.running(),true);
  assert.equal(h.node('ModernAnimationBenchmarkStrokes').disabled,true);
  for(let i=0;h.context.studioBenchmark.running()&&i<3000;i++)h.tick();
  assert.equal(h.downloads.length,1);
  const report=h.downloads[0].json;
  assert.equal(report.config.profile,'canvas-strokes');
  assert.equal(report.runs.length,12);
  assert.equal(report.environment.fixedTimeMs,40000);
  assert.equal(report.summary.stroke_baseline.strokeCalls.p50,60);
  assert.equal(report.summary.stroke_path_only.strokeCalls.p50,0);
  assert.equal(report.summary.stroke_batched.strokeCalls.p50,10);
  assert.equal(report.summary.stroke_path_only.strokePrimitives.p50,60);
  const modes=new Set(h.paintOptions.map(x=>x.strokeMode).filter(Boolean));
  assert.deepEqual([...modes].sort(),['batched','normal','path-only','simple']);
  assert.ok(h.paintOptions.filter(x=>x.strokeMode).every(x=>
    x.fills===true&&x.strokes===true&&x.horizonMask===true));
  assert.equal(h.node('ModernCanvasDirectFills').checked,false);
  assert.equal(h.node('ModernCanvasDirectStrokes').checked,false);
  assert.equal(h.node('ModernCanvasDirectMask').checked,false);
  assert.equal(h.node('ModernAnimationBenchmarkStrokes').disabled,false);
  assert.equal(h.playing,true);
});

test('stroke style benchmark exports six modes while retaining all live options',()=>{
  const h=harness();
  h.node('ModernCanvasDirectFills').checked=false;
  h.node('ModernCanvasDirectStrokes').checked=false;
  h.node('ModernCanvasDirectMask').checked=false;
  h.node('ModernAnimationBenchmarkStrokeStyles').emit('click');
  assert.equal(h.context.studioBenchmark.running(),true);
  assert.equal(h.node('ModernAnimationBenchmarkStrokeStyles').disabled,true);
  assert.equal(h.node('ModernAnimationBenchmarkStrokes').disabled,true);
  for(let i=0;h.context.studioBenchmark.running()&&i<4000;i++)h.tick();
  assert.equal(h.downloads.length,1);
  const report=h.downloads[0].json;
  assert.equal(report.config.profile,'canvas-stroke-styles');
  assert.equal(report.runs.length,18);
  assert.equal(report.environment.fixedTimeMs,40000);
  assert.equal(report.summary.stroke_baseline.strokeCalls.p50,60);
  assert.equal(report.summary.stroke_width_one.strokeCalls.p50,60);
  assert.equal(report.summary.stroke_miter.strokeCalls.p50,60);
  assert.equal(report.summary.stroke_simple.strokeCalls.p50,60);
  assert.deepEqual([...new Set(h.paintOptions.map(x=>x.strokeMode).filter(Boolean))].sort(),
    ['black','miter','normal','opaque','simple','unit-width']);
  assert.ok(h.paintOptions.filter(x=>x.strokeMode).every(x=>
    x.fills===true&&x.strokes===true&&x.horizonMask===true));
  assert.equal(h.node('ModernCanvasDirectFills').checked,false);
  assert.equal(h.node('ModernCanvasDirectStrokes').checked,false);
  assert.equal(h.node('ModernCanvasDirectMask').checked,false);
  assert.equal(h.node('ModernAnimationBenchmarkStrokeStyles').disabled,false);
  assert.equal(h.playing,true);
  assert.match(h.node('ModernAnimationBenchmarkStatus').textContent,/18 runs across six modes/);
});


test('stroke width sweep exports 30 runs with exact width overrides and restores controls',()=>{
  const h=harness();
  h.node('ModernCanvasDirectFills').checked=false;
  h.node('ModernCanvasDirectStrokes').checked=false;
  h.node('ModernCanvasDirectMask').checked=false;
  h.node('ModernAnimationBenchmarkStrokeWidths').emit('click');
  assert.equal(h.context.studioBenchmark.running(),true);
  assert.equal(h.node('ModernAnimationBenchmarkStrokeWidths').disabled,true);
  assert.equal(h.node('ModernAnimationBenchmarkStrokeStyles').disabled,true);
  for(let i=0;h.context.studioBenchmark.running()&&i<6000;i++)h.tick();
  assert.equal(h.context.studioBenchmark.running(),false);
  assert.equal(h.downloads.length,1);
  const report=h.downloads[0].json;
  assert.equal(report.config.profile,'canvas-stroke-widths');
  assert.equal(report.runs.length,30);
  assert.equal(report.summary.stroke_baseline.strokeCalls.p50,60);
  assert.equal(report.summary.stroke_width_1.strokeCalls.p50,60);
  assert.equal(report.summary.stroke_width_1_125.strokeCalls.p50,60);
  assert.equal(report.summary.stroke_width_1_125.strokeWidthMinPx.p50,1.125);
  assert.equal(report.summary.stroke_width_1_125.strokeWidthMaxPx.p50,1.125);
  assert.equal(report.summary.stroke_baseline.strokeWidthMinPx.p50,2);
  assert.equal(report.summary.stroke_baseline.strokeWidthMaxPx.p50,3);
  assert.deepEqual([...new Set(h.paintOptions.map(x=>x.strokeWidth)
    .filter(x=>x!==undefined))].sort((a,b)=>a-b),
    [0.5,0.75,1,1.125,1.25,1.5,2,3,4]);
  assert.ok(h.paintOptions.filter(x=>x.strokeWidth!==undefined).every(x=>
    x.strokeMode==='normal'&&x.fills===true&&x.strokes===true&&x.horizonMask===true));
  assert.equal(h.node('ModernCanvasDirectFills').checked,false);
  assert.equal(h.node('ModernCanvasDirectStrokes').checked,false);
  assert.equal(h.node('ModernCanvasDirectMask').checked,false);
  assert.equal(h.node('ModernAnimationBenchmarkStrokeWidths').disabled,false);
  assert.equal(h.playing,true);
  assert.match(h.node('ModernAnimationBenchmarkStatus').textContent,/30 runs across ten modes/);
});


test('one click runs all three physical Canvas Direct pipeline modes and auto-exports one JSON',()=>{
  const h=harness();
  h.node('ModernCanvasDirectStrokes').checked=false;
  h.node('ModernAnimationPipelineRun').emit('click');
  assert.equal(h.context.studioBenchmark.running(),true);
  assert.equal(h.node('ModernAnimationPipelineRun').disabled,true);
  assert.equal(h.node('ModernAnimationPipelineCancel').hidden,false);
  for(let i=0;h.context.studioBenchmark.running()&&i<500;i++)h.tick();
  assert.equal(h.context.studioBenchmark.running(),false);
  assert.equal(h.downloads.length,1,'one click automatically downloads one file');
  const {json}=h.downloads[0];
  assert.equal(json.config.profile,'canvas-pipeline');
  assert.deepEqual(Array.from(json.config.modes),
    ['pipeline_full','pipeline_projection_only','pipeline_fixed_redraw']);
  assert.equal(json.runs.length,6);
  assert.equal(json.summary.pipeline_full.frames,100);
  assert.equal(json.summary.pipeline_projection_only.frames,100);
  assert.equal(json.summary.pipeline_fixed_redraw.frames,100);
  assert.equal(json.environment.pipeline.drawingDisabled,
    'projection-only painter and overlays, no Canvas drawing');
  assert.equal(json.summary.pipeline_fixed_redraw.timelineMs.p50,40000);
  assert.ok(json.summary.pipeline_full.timelineMs.p50>0);
  assert.ok(json.summary.pipeline_projection_only.timelineMs.p50>0);
  assert.ok(h.paintOptions.some(x=>x.skipCanvasPaint===true));
  assert.ok(h.paintOptions.some(x=>x.skipCanvasPaint===false));
  assert.ok(h.paintOptions.filter(x=>x.strokeMode==='normal').every(x=>
    x.fills===true&&x.strokes===true&&x.horizonMask===true));
  assert.equal(h.node('ModernCanvasDirectStrokes').checked,false,
    'authored viewing switches must remain untouched');
  assert.equal(h.position,40000,'the original timeline position is restored');
  assert.equal(h.playing,true,'the original playback state is restored');
  assert.equal(h.node('ModernAnimationPipelineRun').disabled,false);
  assert.equal(h.node('ModernAnimationPipelineCancel').hidden,true);
  assert.match(h.node('ModernAnimationPipelineStatus').textContent,/complete[\s\S]*JSON downloaded/);
});

test('one-click pipeline cancellation restores player without exporting incomplete data',()=>{
  const h=harness();h.node('ModernAnimationPipelineRun').emit('click');
  for(let i=0;i<15;i++)h.tick();
  h.node('ModernAnimationPipelineCancel').emit('click');
  assert.equal(h.context.studioBenchmark.running(),false);
  assert.equal(h.queue.size,0);
  assert.equal(h.downloads.length,0);
  assert.equal(h.position,40000);
  assert.equal(h.playing,true);
  assert.equal(h.node('ModernAnimationPipelineCancel').hidden,true);
  assert.match(h.node('ModernAnimationPipelineStatus').textContent,/cancelled/);
});

test('one click sweeps moving-camera widths and two controls, then exports one JSON',()=>{
  const h=harness();
  h.node('ModernCanvasDirectFills').checked=false;
  h.node('ModernCanvasDirectStrokes').checked=false;
  h.node('ModernCanvasDirectMask').checked=false;
  h.node('ModernAnimationMovingStrokeWidthsRun').emit('click');
  assert.equal(h.context.studioBenchmark.running(),true);
  assert.equal(h.node('ModernAnimationMovingStrokeWidthsRun').disabled,true);
  assert.equal(h.node('ModernAnimationPipelineCancel').hidden,false);
  for(let i=0;h.context.studioBenchmark.running()&&i<1500;i++)h.tick();
  assert.equal(h.context.studioBenchmark.running(),false);
  assert.equal(h.downloads.length,1);
  const report=h.downloads[0].json;
  assert.equal(report.config.profile,'canvas-stroke-width-motion');
  assert.equal(report.config.widthSweepUnits,'Canvas backing-store pixels');
  assert.equal(report.config.warmupFrames,8);
  assert.equal(report.config.sampleFrames,36);
  assert.equal(report.runs.length,24);
  for(const mode of runner.MOVING_STROKE_WIDTH_MODES){
    assert.equal(report.summary[mode].frames,72);
    assert.equal(report.summary[mode].timelineMs.count,72);
    const first=report.runs.find(r=>r.mode===mode);
    assert.equal(first.rows[0].timelineMs,report.runs[0].rows[0].timelineMs);
    assert.equal(first.rows.at(-1).timelineMs,report.runs[0].rows.at(-1).timelineMs);
    assert.equal(first.rows[0].painted,1);
  }
  assert.equal(report.summary.motion_path_only.strokeCalls.p50,0);
  assert.equal(report.summary.motion_empty_stroke.strokeCalls.p50,60);
  assert.equal(report.summary.motion_baseline.strokeCalls.p50,60);
  assert.equal(report.summary.motion_width_0_25.strokeWidthMinPx.p50,0.25);
  assert.equal(report.summary.motion_width_1_125.strokeWidthMaxPx.p50,1.125);
  assert.equal(report.summary.motion_width_3.strokeWidthMaxPx.p50,3);
  assert.deepEqual([...new Set(h.paintOptions.map(x=>x.strokeWidth)
    .filter(x=>x!==undefined))].sort((a,b)=>a-b),
    [0.25,0.5,0.75,1,1.125,1.25,1.5,2,3]);
  assert.ok(h.paintOptions.some(x=>x.strokeMode==='path-only'));
  assert.ok(h.paintOptions.some(x=>x.strokeMode==='empty-stroke'));
  assert.ok(h.paintOptions.filter(x=>x.strokeMode).every(x=>
    x.fills===true&&x.strokes===true&&x.horizonMask===true));
  assert.deepEqual(report.environment.movingStrokeWidth.widthsPx,
    [0.25,0.5,0.75,1,1.125,1.25,1.5,2,3]);
  assert.equal(h.node('ModernCanvasDirectFills').checked,false);
  assert.equal(h.node('ModernCanvasDirectStrokes').checked,false);
  assert.equal(h.node('ModernCanvasDirectMask').checked,false);
  assert.equal(h.position,40000);
  assert.equal(h.playing,true);
  assert.equal(h.node('ModernAnimationMovingStrokeWidthsRun').disabled,false);
  assert.equal(h.node('ModernAnimationPipelineCancel').hidden,true);
  assert.match(h.node('ModernAnimationPipelineStatus').textContent,
    /Moving stroke-width sweep complete[\s\S]*JSON downloaded/);
});

test('cancelling moving stroke-width benchmark restores Play and does not export',()=>{
  const h=harness();
  h.node('ModernAnimationMovingStrokeWidthsRun').emit('click');
  for(let i=0;i<25;i++)h.tick();
  h.node('ModernAnimationPipelineCancel').emit('click');
  assert.equal(h.context.studioBenchmark.running(),false);
  assert.equal(h.queue.size,0);
  assert.equal(h.downloads.length,0);
  assert.equal(h.position,40000);
  assert.equal(h.playing,true);
  assert.equal(h.node('ModernAnimationPipelineCancel').hidden,true);
  assert.match(h.node('ModernAnimationPipelineStatus').textContent,/cancelled/);
});

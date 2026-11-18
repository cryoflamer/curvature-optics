'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const benchmark=require('../src/animation/ModernAnimationPlaybackBenchmark');

function harness(overrides={}){
  const scheduled=new Map();let id=0,now=100,finished=null,fail=null,cancelCount=0;
  const steps=[],progress=[];
  const runner=benchmark.create({
    requestFrame(cb){const next=++id;scheduled.set(next,cb);return next;},
    cancelFrame(handle){scheduled.delete(handle);},now(){return now;},
    step(mode){
      steps.push(mode);
      if(overrides.failAt===steps.length)throw Error('synthetic paint failure');
      now+=mode==='compute_only'?0.6:mode==='bitmap_replay'?2:8;
      return {rendererMs:mode==='compute_only'?null:5,projectionMs:2,
        canvasMs:3,fillCalls:1400,strokeCalls:1450};
    },
    progress(s){progress.push({...s});},
    completed(r){finished=r;},failed(e){fail=e;},cancelled(){cancelCount++;}
  });
  function tick(){
    assert.equal(scheduled.size,1);
    const [[next,cb]]=scheduled;
    scheduled.delete(next);
    now+=6;
    cb(now);
  }
  return {runner,tick,scheduled,steps,progress,
    get result(){return finished;},get error(){return fail;},get cancelCount(){return cancelCount;}};
}

test('one click runs five modes in three rotated passes and exports measured JSON-ready rows',()=>{
  const h=harness();
  h.runner.start({warmupFrames:3,sampleFrames:5,passes:3,
    environment:{scene:'Soundly Causeway',canvas:{width:1300,height:860}}});
  for(let i=0;h.runner.running()&&i<1000;i++)h.tick();
  assert.equal(h.runner.running(),false);
  assert.equal(h.scheduled.size,0);
  const result=h.result;
  assert.ok(result,'completion must be reached');
  assert.equal(result.schema,'curvature-playback-benchmark/1');
  assert.equal(result.environment.scene,'Soundly Causeway');
  assert.equal(result.runs.length,15);
  assert.equal(h.steps.length,15*8);
  assert.deepEqual(result.runs.slice(0,5).map(x=>x.mode),benchmark.order(0));
  assert.deepEqual(result.runs.slice(5,10).map(x=>x.mode),benchmark.order(1));
  assert.deepEqual(result.runs.slice(10,15).map(x=>x.mode),benchmark.order(2));
  for(const run of result.runs){
    assert.equal(run.rows.length,5,'warmup frames excluded');
    assert.equal(run.statistics.gapMs.count,5,'RAF gaps sampled after warmup');
    assert.equal(run.statistics.callbackMs.count,5);
    assert.equal(run.statistics.fillCalls.count,5);
    assert.ok(run.statistics.callbackMs.p95>=run.statistics.callbackMs.p50);
  }
  const encoded=JSON.parse(JSON.stringify(result));
  assert.equal(encoded.runs[14].rows.length,5);
  assert.equal(h.progress.at(-1).completed,14,'progress before final completion');
});

test('cancel halts RAF and never calls completion or writes partial results',()=>{
  const h=harness();h.runner.start({warmupFrames:2,sampleFrames:2,passes:1});
  for(let i=0;i<3;i++)h.tick();
  assert.equal(h.runner.cancel(),true);
  assert.equal(h.runner.cancel(),false);
  assert.equal(h.scheduled.size,0);
  assert.equal(h.result,null);
  assert.equal(h.cancelCount,1);
});

test('paint exceptions stop scheduling and propagate to the error hook',()=>{
  const h=harness({failAt:4});h.runner.start({warmupFrames:2,sampleFrames:2,passes:1});
  for(let i=0;i<4;i++)h.tick();
  assert.equal(h.runner.running(),false);
  assert.match(h.error.message,/synthetic paint failure/);
  assert.equal(h.scheduled.size,0);
  assert.equal(h.result,null);
});

test('input validation and report statistics distinguish missing timing samples',()=>{
  const h=harness();
  assert.throws(()=>h.runner.start({passes:0}),/frame counts/);
  assert.throws(()=>h.runner.start({warmupFrames:0}),/frame counts/);
  assert.deepEqual(benchmark.percentiles([null,4,2,9,1]),
    {count:4,p50:2,p95:9,max:9});
  assert.deepEqual(benchmark.percentiles([]),{count:0,p50:null,p95:null,max:null});
  h.runner.start({passes:1,sampleFrames:2,warmupFrames:1});
  assert.throws(()=>h.runner.start({}),/already running/);
  h.runner.cancel();
});

test('benchmark code is isolated to Modern and the independent fixed-frame runner',()=>{
  const html=fs.readFileSync('CurvatureModern.html','utf8');
  const legacy=fs.readFileSync('CurvatureApp.html','utf8');
  const app=fs.readFileSync('src/ui/modern/ModernApp.js','utf8');
  const path='src/animation/ModernAnimationPlaybackBenchmark.js';
  assert.ok(html.indexOf(path)>html.indexOf('src/animation/ModernAnimationPlaybackExperiment.js'));
  for(const id of ['ModernAnimationBenchmarkRun','ModernAnimationBenchmarkCancel',
    'ModernAnimationBenchmarkDownload','ModernAnimationBenchmarkStatus'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.doesNotMatch(legacy,/ModernAnimationBenchmarkRun|ModernAnimationPlaybackBenchmark/);
  assert.match(app,/studioBenchmarkApi\.create\(/);
  assert.match(app,/function renderStudioPlaybackSample\(force,benchmark\)/);
  assert.match(app,/domOnly:true,A:baseline\.A,B:baseline\.B/);
  assert.match(app,/downloadHistoryJson\(JSON\.stringify\(report,null,2\)/);
  const browser=vm.createContext({});
  vm.runInContext(fs.readFileSync(path,'utf8'),browser);
  assert.equal(typeof browser.CurvatureModernAnimationPlaybackBenchmark.create,'function');
});

test('Canvas layer profile rotates four fixed-frame variants and includes operation statistics',()=>{
  const h=harness();
  h.runner.start({profile:'canvas-layers',warmupFrames:2,sampleFrames:4,passes:3,
    environment:{scene:'Soundly',displayMode:'scene',fixedTimeMs:1234}});
  for(let i=0;h.runner.running()&&i<500;i++)h.tick();
  assert.ok(h.result);
  assert.equal(h.result.runs.length,12);
  assert.equal(h.result.config.profile,'canvas-layers');
  assert.equal(h.result.summary.canvas_full.frames,12);
  assert.equal(h.result.summary.canvas_no_mask.fillCalls.count,12);
  assert.equal(h.result.summary.canvas_no_strokes.callbackMs.count,12);
  assert.deepEqual(h.result.config.modes,benchmark.LAYER_MODES);
  assert.deepEqual(h.result.runs.slice(0,4).map(x=>x.mode),benchmark.order(0,benchmark.LAYER_MODES));
  assert.deepEqual(h.result.runs.slice(4,8).map(x=>x.mode),benchmark.order(1,benchmark.LAYER_MODES));
  for(const run of h.result.runs){
    assert.equal(run.rows.length,4);
    assert.equal(run.statistics.fillCalls.p50,1400);
    assert.equal(run.statistics.beginPathCalls.count,0,'missing metric is a null distribution, not fabricated zero');
  }
});

test('layer benchmark UI reuses the same runner and reads nested Canvas Direct counters',()=>{
  const html=fs.readFileSync('CurvatureModern.html','utf8');
  const app=fs.readFileSync('src/ui/modern/ModernApp.js','utf8');
  const renderer=fs.readFileSync('src/app/CurvatureMainCanvasRenderer.js','utf8');
  assert.match(html,/id="ModernAnimationBenchmarkLayers"/);
  assert.match(app,/startBenchmark\('canvas-layers'\)/);
  assert.match(app,/a\.directStats/);
  assert.match(app,/canvas_no_fills/);
  assert.match(app,/canvas_no_strokes/);
  assert.match(app,/canvas_no_mask/);
  assert.match(renderer,/canvasCalls:direct\.canvasCalls/);
});


test('Canvas stroke profile runs four rotated fixed-frame variants with full telemetry',()=>{
  const h=harness();
  h.runner.start({profile:'canvas-strokes',warmupFrames:2,sampleFrames:4,passes:3,
    environment:{scene:'Soundly',fixedTimeMs:26890.5}});
  for(let i=0;h.runner.running()&&i<500;i++)h.tick();
  assert.ok(h.result);
  assert.equal(h.result.config.profile,'canvas-strokes');
  assert.equal(h.result.runs.length,12);
  assert.deepEqual(h.result.config.modes,benchmark.STROKE_MODES);
  assert.deepEqual(h.result.runs.slice(0,4).map(x=>x.mode),
    benchmark.order(0,benchmark.STROKE_MODES));
  assert.deepEqual(h.result.runs.slice(4,8).map(x=>x.mode),
    benchmark.order(1,benchmark.STROKE_MODES));
  for(const mode of benchmark.STROKE_MODES){
    assert.equal(h.result.summary[mode].frames,12);
    assert.equal(h.result.summary[mode].strokeCalls.p50,1450);
    assert.equal(h.result.summary[mode].strokePrimitives.count,0);
  }
  assert.equal(h.result.runs[0].rows.length,4);
  assert.match(h.result.notes.join(' '),/Path-only|path-only/i);
  assert.throws(()=>benchmark.create({}),/requires/);
  assert.throws(()=>h.runner.start({profile:'invalid'}),/Invalid benchmark profile/);
});

test('stroke style profile rotates six single-factor modes and reports style distributions',()=>{
  const h=harness();
  h.runner.start({profile:'canvas-stroke-styles',warmupFrames:2,sampleFrames:4,passes:3,
    environment:{scene:'Soundly',fixedTimeMs:27186}});
  for(let i=0;h.runner.running()&&i<1000;i++)h.tick();
  assert.ok(h.result);
  assert.equal(h.result.config.profile,'canvas-stroke-styles');
  assert.equal(h.result.runs.length,18);
  assert.deepEqual(h.result.config.modes,benchmark.STROKE_STYLE_MODES);
  assert.deepEqual(h.result.runs.slice(0,6).map(x=>x.mode),
    benchmark.order(0,benchmark.STROKE_STYLE_MODES));
  assert.deepEqual(h.result.runs.slice(6,12).map(x=>x.mode),
    benchmark.order(1,benchmark.STROKE_STYLE_MODES));
  assert.deepEqual(h.result.runs.slice(12,18).map(x=>x.mode),
    benchmark.order(2,benchmark.STROKE_STYLE_MODES));
  for(const mode of benchmark.STROKE_STYLE_MODES){
    assert.equal(h.result.summary[mode].frames,12);
    assert.equal(h.result.summary[mode].strokeCalls.p50,1450);
    assert.equal(h.result.summary[mode].strokeTranslucent.count,0,
      'unknown mock telemetry must remain missing, not fabricated');
  }
  assert.match(h.result.notes.join(' '),/single-factor/i);
});

test('stroke benchmark UI contains one independent opt-in button',()=>{
  const html=fs.readFileSync('CurvatureModern.html','utf8');
  const app=fs.readFileSync('src/ui/modern/ModernApp.js','utf8');
  assert.match(html,/id="ModernAnimationBenchmarkStrokes"/);
  assert.match(app,/startBenchmark\('canvas-strokes'\)/);
  assert.match(app,/stroke_path_only/);
  assert.match(app,/stroke_simple/);
  assert.match(app,/stroke_batched/);
  assert.match(html,/id="ModernAnimationBenchmarkStrokeStyles"/);
  assert.match(app,/startBenchmark\('canvas-stroke-styles'\)/);
  assert.match(app,/stroke_width_one/);
  assert.match(app,/stroke_opaque/);
  assert.match(app,/stroke_miter/);
  assert.match(html,/id="ModernAnimationBenchmarkStrokeWidths"/);
  assert.match(app,/startBenchmark\('canvas-stroke-widths'\)/);
  assert.ok(benchmark.STROKE_WIDTH_MODES.includes('stroke_width_1_125'));
});


test('stroke width profile rotates ten width variants and preserves full RAF telemetry',()=>{
  const h=harness();
  h.runner.start({profile:'canvas-stroke-widths',warmupFrames:2,sampleFrames:4,passes:3,
    environment:{scene:'Soundly',fixedTimeMs:27363.3,devicePixelRatio:1.125}});
  for(let i=0;h.runner.running()&&i<1500;i++)h.tick();
  assert.ok(h.result);
  assert.equal(h.result.config.profile,'canvas-stroke-widths');
  assert.equal(h.result.config.widthSweepUnits,'Canvas backing-store pixels');
  assert.equal(h.result.runs.length,30);
  assert.deepEqual(h.result.config.modes,benchmark.STROKE_WIDTH_MODES);
  assert.deepEqual(h.result.runs.slice(0,10).map(x=>x.mode),
    benchmark.order(0,benchmark.STROKE_WIDTH_MODES));
  assert.deepEqual(h.result.runs.slice(10,20).map(x=>x.mode),
    benchmark.order(1,benchmark.STROKE_WIDTH_MODES));
  assert.deepEqual(h.result.runs.slice(20,30).map(x=>x.mode),
    benchmark.order(2,benchmark.STROKE_WIDTH_MODES));
  for(const mode of benchmark.STROKE_WIDTH_MODES){
    assert.equal(h.result.summary[mode].frames,12);
    assert.equal(h.result.summary[mode].strokeCalls.p50,1450);
    assert.equal(h.result.summary[mode].gapMs.count,12);
    assert.equal(h.result.summary[mode].strokeWidthMinPx.count,0,
      'unavailable widths must be null, not zero');
  }
  assert.match(h.result.notes.join(' '),/backing-store pixels/);
});


test('one-click pipeline diagnosis rotates full, projection-only and frozen redraw with matching frame indices',()=>{
  const modes=benchmark.PIPELINE_MODES;
  assert.deepEqual(modes,['pipeline_full','pipeline_projection_only','pipeline_fixed_redraw']);
  const h=harness();
  h.runner.start({profile:'canvas-pipeline',passes:2,warmupFrames:2,sampleFrames:5,
    environment:{previewFps:'auto',quality:'canvas-direct'}});
  for(let i=0;h.runner.running()&&i<100;i++)h.tick();
  assert.ok(h.result);
  assert.equal(h.result.config.profile,'canvas-pipeline');
  assert.equal(h.result.config.camera,'moving for full/projection, frozen for redraw');
  assert.equal(h.result.runs.length,6);
  assert.deepEqual(h.result.runs.slice(0,3).map(x=>x.mode),benchmark.order(0,modes));
  assert.deepEqual(h.result.runs.slice(3,6).map(x=>x.mode),benchmark.order(1,modes));
  for(const mode of modes){
    assert.equal(h.result.summary[mode].frames,10);
    assert.equal(h.result.summary[mode].gapMs.count,10);
  }
  assert.match(h.result.notes.join(' '),/Projection only runs Canvas Direct geometry/);
  assert.match(h.result.notes.join(' '),/not presented-frame FPS/);
  assert.equal(h.result.runs[0].rows.length,5);
});

test('pipeline step receives identical per-run iteration indices after each mode rotation',()=>{
  const scheduled=new Map(),seen=[];
  let id=0,clock=0,report=null;
  const runner=benchmark.create({now:()=>clock,
    requestFrame(fn){scheduled.set(++id,fn);return id;},
    cancelFrame(key){scheduled.delete(key);},
    step(mode,frame){seen.push({mode,...frame});clock+=3;return {sampleMs:1,painted:mode==='pipeline_projection_only'?0:1};},
    progress(){},completed(r){report=r;},failed(e){throw e;},cancelled(){}});
  runner.start({profile:'canvas-pipeline',passes:2,warmupFrames:1,sampleFrames:2});
  while(runner.running()){
    const [key,fn]=scheduled.entries().next().value;
    scheduled.delete(key);clock+=16;fn(clock);
  }
  for(let i=0;i<6;i++){
    assert.deepEqual(seen.slice(i*3,i*3+3).map(row=>row.iteration),[0,1,2]);
    assert.equal(seen[i*3].pass,1+Math.floor(i/3));
  }
  assert.equal(report.summary.pipeline_projection_only.painted.p50,0);
  assert.equal(report.summary.pipeline_full.painted.p50,1);
  assert.equal(report.summary.pipeline_fixed_redraw.painted.p50,1);
  assert.equal(report.summary.pipeline_full.sampleMs.p50,1);
});

test('one-click pipeline UI has its own launch, cancel and visible result status',()=>{
  const html=fs.readFileSync('CurvatureModern.html','utf8');
  const app=fs.readFileSync('src/ui/modern/ModernApp.js','utf8');
  const direct=fs.readFileSync('src/renderers/CurvatureCanvasDirectPreview.js','utf8');
  for(const id of ['ModernAnimationPipelineRun','ModernAnimationPipelineCancel',
    'ModernAnimationPipelineStatus'])assert.ok(html.includes('id="'+id+'"'));
  assert.match(app,/startBenchmark\('canvas-pipeline'\)/);
  assert.match(app,/skipCanvasPaint:mode==='pipeline_projection_only'/);
  assert.match(app,/passes:2,warmupFrames:10,sampleFrames:50/);
  assert.match(app,/if\(pipelineRun\)pipelineRun\.addEventListener\('click'/);
  assert.match(app,/if\(pipelineCancel\)pipelineCancel\.addEventListener\('click'/);
  assert.match(direct,/if\(skipCanvasPaint\)/);
  assert.ok(!fs.readFileSync('CurvatureApp.html','utf8').includes('ModernAnimationPipelineRun'));
});

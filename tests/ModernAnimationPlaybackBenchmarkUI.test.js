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
  const painter={render(){renderCount++;now+=4;return {quality:'canvas-direct',overlays:{},
    result:{timings:{projectionMs:2,canvasMs:2},fillCalls:40,strokeCalls:60}};}};
  const probe={mode(){return 'normal';},setMode(){}};
  const context=vm.createContext({
    newUiEl:node,studioBenchmarkApi:runner,studioBenchmark:null,
    studioBenchmarkLastReport:null,studioPlayback:player,studioPrepared:{id:'soundly',mode:'camera'},
    studioPlaybackExperiment:probe,studioPlaybackFps:'auto',studioPlaybackQuality:'canvas-direct',
    studioPlaybackDetail:'full',studioPlaybackFpsMeter:{reset(){}},
    studioPlaybackLastPaint:25,studioPlaybackNextDue:20,
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
  return {context,node,queue,tick,downloads,get renderCount(){return renderCount;},
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

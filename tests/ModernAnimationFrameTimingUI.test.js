'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const probe=require('../src/animation/ModernAnimationFrameTiming');
const source=fs.readFileSync('src/ui/modern/ModernApp.js','utf8');

function harness(){
  const nodes=new Map(),queue=new Map(),downloads=[],errors=[];
  let now=1000,next=0,pauses=0,seekCalls=0;
  function node(id){
    if(!nodes.has(id))nodes.set(id,{id,checked:false,disabled:false,value:'after',
      textContent:'',listeners:new Map(),addEventListener(type,fn){this.listeners.set(type,fn);},
      emit(type){assert.ok(this.listeners.has(type),id+':'+type);this.listeners.get(type)();}});
    return nodes.get(id);
  }
  const context=vm.createContext({
    studioFrameTiming:null,studioFrameTimingApi:probe,
    studioPlayback:{status(){return {playing:false};}},studioPrepared:{mode:'camera'},
    studioPlaybackQuality:'canvas-direct',studioPlaybackFps:'auto',
    studioPlaybackDetail:'performance',animationWorkspaceOpen:true,studioBenchmark:null,
    newUiEl:node,profileNow(){return now;},requestAnimationFrame(fn){const id=++next;queue.set(id,fn);return id;},
    cancelAnimationFrame(id){queue.delete(id);},
    ensureStudioPlaybackControls(){return {pause(){pauses++;}};},
    playbackNotice(msg){errors.push(msg);},
    root:{navigator:{userAgent:'Test browser'},devicePixelRatio:1.5,
      CurvatureModernAnimationGraphs:{A:{Canvas:{width:1334,height:889,
        getBoundingClientRect(){return {width:1000,height:660};}}}}},
    downloadHistoryJson(text,name){downloads.push({data:JSON.parse(text),name});}
  });
  const start=source.indexOf('  function syncStudioFrameTimingControls(){');
  const end=source.indexOf('  function bindStudioPlayback(){',start);
  assert.ok(start>0&&end>start);
  vm.runInContext(source.slice(start,end)+
    '\nthis.bind=bindStudioFrameTiming;this.getProbe=ensureStudioFrameTiming;',context);
  function tick(ms){assert.equal(queue.size,1);
    const [[id,cb]]=queue;queue.delete(id);now+=ms;cb(now);}
  context.bind(value=>{
    seekCalls++;
    context.getProbe().input('auto',value,()=>context.getProbe().render(()=>{
      now+=2;return {painted:true};
    }));
  });
  return {node,tick,queue,downloads,errors,context,
    get pauses(){return pauses;},get seekCalls(){return seekCalls;}};
}

test('opt-in controls auto-sweep the same callback, report events and export JSON',()=>{
  const h=harness();
  const toggle=h.node('ModernAnimationFrameTimingEnabled');
  toggle.checked=true;toggle.emit('change');
  assert.equal(h.queue.size,1);
  const p=h.context.getProbe();
  p.input('manual',450,()=>p.render(()=>({painted:true})));
  h.node('ModernAnimationFrameTimingAuto').emit('click');
  assert.equal(h.pauses,1);
  for(let i=0;p.autoRunning()&&i<300;i++)h.tick(20);
  assert.equal(p.autoRunning(),false);
  assert.ok(h.seekCalls>30);
  assert.equal(h.node('ModernAnimationFrameTimingAuto').disabled,false);
  assert.match(h.node('ModernAnimationFrameTimingReport').textContent,/Manual seek: 1 inputs/);
  h.node('ModernAnimationFrameTimingExport').emit('click');
  assert.equal(h.downloads.length,1);
  assert.match(h.downloads[0].name,/^curvature-frame-timing-/);
  const report=h.downloads[0].data;
  assert.equal(report.summary.manual.inputs,1);
  assert.ok(report.summary.auto.paints>30);
  assert.equal(report.environment.canvas.width,1334);
  assert.equal(report.measurements.inputs.find(e=>e.source==='auto').autoRequestOrder,'after');
  assert.deepEqual(h.errors,[]);
  toggle.checked=false;toggle.emit('change');
  assert.equal(h.queue.size,0);
});

test('frame timing UI rejects missing Canvas Direct and cancels sweep',()=>{
  const h=harness();h.context.studioPlaybackQuality='accurate';
  const toggle=h.node('ModernAnimationFrameTimingEnabled');
  toggle.checked=true;toggle.emit('change');
  assert.equal(toggle.checked,false);
  assert.equal(h.queue.size,0);
  h.context.studioPlaybackQuality='canvas-direct';
  toggle.checked=true;toggle.emit('change');
  h.node('ModernAnimationFrameTimingAuto').emit('click');
  assert.equal(h.context.getProbe().autoRunning(),true);
  h.node('ModernAnimationFrameTimingStop').emit('click');
  assert.equal(h.context.getProbe().autoRunning(),false);
  assert.equal(h.node('ModernAnimationFrameTimingStop').disabled,true);
});

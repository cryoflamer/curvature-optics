/* Reproducible synthetic stress test for the shared Canvas painter.
 * This deliberately benchmarks painter commands, NOT browser FPS or RK4.
 * The guide workload is ~78k short segments, as seen in Globe screenshots.
 */
'use strict';
const {performance}=require('node:perf_hooks');
const painter=require('../src/renderers/CurvatureFrameRenderer');
const frames=require('../src/scene/CurvatureRenderFrame');
const contract=require('../src/scene/CurvatureSceneContract');
const {create:makeScheduler}=require('../src/app/CurvatureCanvasFrameScheduler');
const SIZE=78000;
function benchmark(options={}){
  const count=options.count??SIZE, width=options.width??480,height=options.height??320;
  const guides=[];
  for(let i=0;i<count;i++){
    // Vary near/far positions; many fragments fall off screen, as in the app.
    const x=(i%400-200)*0.06,y=(Math.floor(i/400)%240-120)*0.06;
    guides.push({type:'line',commandIndex:i,points:[[x,y,0],[x+0.05,y+0.02,0]],
      style:{stroke:'#777777',alpha:.6}});
  }
  const scene=contract.createScene('legacy',guides,{
    generator:'benchmark-physical-redraw-117',layerRanges:[{name:'surface-guides',role:'visual-aid',start:0,end:count}]});
  const camera={pos:[0,0,20],center:[0,0,0],up:[0,1,0],sceneSize:20,
    screenSize:20,objectZExtend:0,zoom:1};
  const start=performance.now();
  const frame=frames.fromScene(scene,camera,width,height);
  const frameMs=performance.now()-start;
  let strokes=0,moves=0,lines=0;
  const ctx={clearRect(){},beginPath(){},moveTo(){moves++;},lineTo(){lines++;},
    closePath(){},fill(){},stroke(){strokes++;}};
  const canvas={width,height,getContext(){return ctx;}};
  const result=painter.render(canvas,frame,{mode:'painter'});
  let callbacks=[],draws=0;
  const scheduler=makeScheduler(cb=>{callbacks.push(cb);return callbacks.length},()=>{},()=>draws++);
  for(let i=0;i<100;i++)scheduler.schedule();
  callbacks[0]();
  return {guidePrimitives:count,viewport:{width,height},frameMs:+frameMs.toFixed(2),
    painterMs:+result.timings.totalMs.toFixed(2),
    validationMs:+result.timings.validationMs.toFixed(2),
    fillProjectionMs:+result.timings.fillGeometryMs.toFixed(2),
    canvasPhaseMs:+result.timings.canvasPaintMs.toFixed(2),strokes,moves,lines,
    projectedStrokes:result.statistics.drawnSegments,
    batching:result.statistics.canvasStrokeCalls,
    redrawRequests:100,scheduledFrames:scheduler.stats().scheduled,
    actualFrames:draws,coalesced:scheduler.stats().coalesced};
}
if(require.main===module)console.log(JSON.stringify(benchmark({count:Number(process.argv[2])||SIZE}),null,2));
module.exports={benchmark};

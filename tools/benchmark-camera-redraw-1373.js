/* Paired warm Node benchmark for the frame handoff, not browser FPS or optics.
 * Old path: fromComposition -> render -> validate (duplicated serialization).
 * New path: renderComposition (one isolated validated snapshot).
 */
'use strict';
const {performance}=require('node:perf_hooks');
const contract=require('../src/scene/CurvatureSceneContract');
const frames=require('../src/scene/CurvatureRenderFrame');
const renderer=require('../src/renderers/CurvatureFrameRenderer');
const camera={pos:[0,0,20],center:[0,0,0],up:[0,1,0],sceneSize:20,
  screenSize:20,objectZExtend:0,zoom:1};
function setup(count){
 const guides=[];
 for(let i=0;i<count;i++){
   const x=(i%400-200)*.06,y=(Math.floor(i/400)%240-120)*.06;
   guides.push({type:'line',commandIndex:i,points:[[x,y,0],[x+.05,y+.02,0]],
     style:{stroke:'#777777',alpha:.6}});
 }
 const ranges=[{name:'surface-guides',role:'visual-aid',start:0,end:count,count}];
 return {scene:contract.createScene('legacy',guides,{layerRanges:ranges}),ranges};
}
function canvas(){
 let count=0;
 const ctx={globalAlpha:1,clearRect(){},beginPath(){},moveTo(){count++;},lineTo(){},
   closePath(){},fill(){},stroke(){}};
 return {width:480,height:320,getContext(){return ctx;},commands(){return count;}};
}
function median(values){const a=values.slice().sort((a,b)=>a-b),i=Math.floor(a.length/2);
 return a.length%2?a[i]:(a[i-1]+a[i])/2;}
function benchmark(count=3653,rounds=10){
 const composed=setup(count),times={old:[],new:[]},calls={old:[],new:[]};
 function run(which){
   const c=canvas(),start=performance.now();
   if(which==='old')renderer.render(c,frames.fromComposition(composed,camera,480,320));
   else renderer.renderComposition(c,composed,camera,480,320);
   return [performance.now()-start,c.commands()];
 }
 // Warm both branches; alternate order to reduce warm/JIT bias.
 run('old');run('new');
 for(let i=0;i<rounds;i++){
   for(const which of i%2?['new','old']:['old','new']){
     const [ms,commands]=run(which);times[which].push(ms);calls[which].push(commands);
   }
 }
 if(calls.old.some((v,i)=>v!==calls.new[i]))throw Error('Canvas command counts changed');
 const before=median(times.old),after=median(times.new);
 return {kind:'synthetic-frame-handoff-node-proxy',count,rounds,
   oldMedianMs:+before.toFixed(2),newMedianMs:+after.toFixed(2),
   relativeReductionPercent:+((before-after)/before*100).toFixed(1),
   equalDrawCommandCounts:true,
   caveats:['Warm Node/mock Canvas benchmark, not Opera FPS or cached-ray performance',
     'No numerical ray tracing measured','Different hardware and JIT conditions change the numbers']};
}
if(require.main===module)console.log(JSON.stringify(benchmark(Number(process.argv[2])||3653,
  Number(process.argv[3])||10),null,2));
module.exports={benchmark};

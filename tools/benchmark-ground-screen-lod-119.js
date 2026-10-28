/* Independent screen guide LOD benchmark. Uses the real frame/painter pipeline
 * and a controllably dense set of coherent optical-style ground guide curves.
 * This is a Node command-count proxy, not a browser FPS measurement.
 */
'use strict';
const {performance}=require('node:perf_hooks');
const lod=require('../src/renderers/CurvatureScreenSpaceGuides119');
const contract=require('../src/scene/CurvatureSceneContract');
const frame=require('../src/scene/CurvatureRenderFrame');
const renderer=require('../src/renderers/CurvatureFrameRenderer');
const camera={pos:[0,0,0],center:[0,1,0],up:[0,0,1],sceneSize:1,
  screenSize:2,objectZExtend:0,zoom:1,near:.001};
function makeScene(curves=160,segments=485){
 const guides=[];
 for(let j=0;j<curves;j++){
  const angle=j/curves;
  for(let i=0;i<segments;i++){
   function point(n){const x=-3+6*n/segments;
    return [x,10+(j%7)*.05,.04*Math.sin(x*2+angle*4)+.006*j];}
   guides.push({type:'line',commandIndex:guides.length,mode:1,
     points:[point(i),point(i+1)],style:{stroke:'#5b7c9b',alpha:.5},
     metadata:{kind:'latitude',angle:angle,physicalGround:true}});
  }
 }
 const ranges=[{name:'surface-guides',role:'visual-aid',start:0,end:guides.length,count:guides.length}];
 return {scene:contract.createScene('legacy',guides,{layerRanges:ranges}),ranges};
}
function fakeCanvas(width=1600,height=900){
 let strokes=0;
 const ctx={clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){strokes++;},fill(){}};
 return {width,height,getContext(){return ctx;},strokes(){return strokes;}};
}
function once(composition){
 const canvas=fakeCanvas(),start=performance.now(),f=frame.fromComposition(composition,camera,1600,900),
   snap=performance.now(),paint=renderer.render(canvas,f,{mode:'painter'}),finished=performance.now();
 return {snapshotMs:snap-start,paintMs:paint.timings.totalMs,
   wallMs:finished-start,strokes:canvas.strokes(),primitives:composition.scene.primitives.length};
}
function benchmark(){
 const full=makeScene(),warm=lod.simplify(full,camera,1600,900),lodStart=performance.now(),
   screen=lod.simplify(full,camera,1600,900),lodMs=performance.now()-lodStart;
 return {schema:'screen-guide-lod-119-node-proxy',
   baseline:once(full),optimized:once(screen.composition),lodMs:+lodMs.toFixed(2),
   stats:screen.stats,limitations:['No browser GPU or frame presentation measured',
     'Repeated warmed Node runs/JIT and hardware affect timings',
     '0.5-pixel maximum is checked on sampled source vertices only']};
}
if(require.main===module)console.log(JSON.stringify(benchmark(),null,2));
module.exports={makeScene,benchmark};

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const lod=require('../src/renderers/CurvatureScreenSpaceGuides119');
const stroke=require('../src/renderers/CurvatureStrokePreview');
const frames=require('../src/scene/CurvatureRenderFrame');
const contract=require('../src/scene/CurvatureSceneContract');
const camera={pos:[0,0,0],center:[0,1,0],up:[0,0,1],sceneSize:1,
  screenSize:2,objectZExtend:0,zoom:1,near:.001};
function line(a,b,i,metadata={physicalGround:true,kind:'latitude',angle:1},style={stroke:'blue'}){
 return {type:'line',commandIndex:i,points:[a,b],style,metadata};
}
function composition(items,guideCount=items.length){
 const ranges=[{name:'ground',role:'visual-aid',start:0,end:guideCount,count:guideCount}];
 if(guideCount<items.length)ranges.push({name:'towers',role:'objects',start:guideCount,
   end:items.length,count:items.length-guideCount});
 return {scene:contract.createScene('legacy',items.map((p,i)=>({...p,commandIndex:i})),
   {layerRanges:ranges}),ranges};
}
function project(p){return [800+900*p[0]/p[1],450-900*p[2]/p[1]];}
function dist(point,a,b){
 let dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy;
 let t=d?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/d)):0;
 return Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy);
}
function maxDeviation(before,after){
 const lines=after.scene.primitives.filter(p=>p.metadata&&p.metadata.physicalGround&&p.metadata.kind!=='physical-horizon');
 return Math.max(...before.map(p=>Math.min(...lines.map(q=>dist(project(p.points[1]),project(q.points[0]),project(q.points[1]))))));
}
test('119: straight ground curve shrinks to one segment, preserving objects and horizon',()=>{
 const guides=Array.from({length:1200},(_,i)=>line([-2+i*4/1200,10,0],[-2+(i+1)*4/1200,10,0],i));
 guides.push(line([0,8,-.1],[1,8,-.1],1200,{physicalGround:true,kind:'physical-horizon'}));
 guides.push(line([0,5,0],[1,5,0],1201,{placedObjectIndex:0,kind:'tower'},{stroke:'black'}));
 const input=composition(guides,1201),output=lod.simplify(input,camera,1600,900);
 assert.equal(output.stats.inputGroundSegments,1200);
 assert.equal(output.stats.removedBySimplification,1199);
 assert.equal(output.composition.scene.primitives.length,3);
 assert.equal(output.composition.scene.primitives[1].metadata.kind,'physical-horizon');
 assert.equal(output.composition.scene.primitives[2].metadata.kind,'tower');
 assert.ok(output.composition.scene.primitives.every((p,i)=>p.commandIndex===i));
 assert.equal(input.scene.primitives.length,1202,'source cannot be changed by camera LOD');
 frames.fromComposition(output.composition,camera,1600,900);
});
test('119: curved optical guide vertices stay within 0.5 backing-store pixels',()=>{
 const N=5000,world=Array.from({length:N+1},(_,i)=>{
  const x=-2+i*4/N;return [x,10,0.14*Math.sin(x*2.1)];
 });
 const items=Array.from({length:N},(_,i)=>line(world[i],world[i+1],i));
 const result=lod.simplify(composition(items),camera,1600,900);
 assert.ok(result.stats.removedBySimplification>N*.8);
 assert.ok(result.stats.maxSampledPixelDeviation<=.5+1e-9);
 assert.ok(maxDeviation(items,result.composition)<=.50000001);
 // Also verify that independently projected Canvas geometry remains valid.
 const before=stroke.build(composition(items).scene,camera,1600,900);
 const after=stroke.build(result.composition.scene,camera,1600,900);
 assert.ok(after.segments.length<before.segments.length*.2);
});
test('119: near-plane crossings are kept exact, fully behind segments are removed',()=>{
 const items=[
  line([0,-3,0],[0,-2,0],0),
  line([0,-2,0],[0,2,0],1),
  line([0,2,0],[.2,2,0],2),
  line([.2,2,0],[.4,-2,0],3)];
 const result=lod.simplify(composition(items),camera,1600,900);
 assert.equal(result.stats.removedOffscreen,1);
 assert.equal(result.stats.unsafeNearPlane,2);
 assert.equal(result.composition.scene.primitives.length,3);
 assert.deepEqual(result.composition.scene.primitives[0].points,items[1].points);
 assert.deepEqual(result.composition.scene.primitives[2].points,items[3].points);
});
test('119: gaps in the physical visibility boundary are not bridged',()=>{
 const items=[line([-1,10,0],[0,10,0],0),line([.1,10,0],[1,10,0],1)];
 const result=lod.simplify(composition(items),camera,1600,900);
 assert.equal(result.composition.scene.primitives.length,2);
 assert.deepEqual(result.composition.scene.primitives.map(p=>p.points),items.map(p=>p.points));
});
test('119: viewport culling preserves crossing curves and removes only certified outside curves',()=>{
 const items=[line([100,10,0],[101,10,0],0),
  line([-100,10,0],[100,10,0],1,{physicalGround:true,kind:'longitude',angle:2})];
 const r=lod.simplify(composition(items),camera,1600,900);
 assert.equal(r.stats.removedOffscreen,1);
 assert.equal(r.composition.scene.primitives.length,1);
 assert.equal(r.composition.scene.primitives[0].metadata.kind,'longitude');
});
test('119: no simplification is applied to non-ground geometry or styled fills',()=>{
 const items=[
  {type:'polygon',mode:2,commandIndex:0,points:[[0,10,0],[1,10,0],[0,10,1]],style:{fill:'brown'},metadata:{kind:'tower-fill'}},
  line([0,10,0],[1,10,0],1,{kind:'physical-horizon',physicalGround:true})];
 const result=lod.simplify(composition(items),camera,1600,900);
 assert.deepEqual(result.composition.scene.primitives,items);
});
test('119: screen tolerance is explicit and validated',()=>{
 assert.throws(()=>lod.simplify(composition([]),camera,1600,900,{tolerancePixels:-1}),/tolerance/);
 assert.throws(()=>lod.simplify(composition([]),camera,1600,900,{tolerancePixels:5}),/tolerance/);
});
test('119: a large coherent grid reduces primitive cloning without changing camera-dependent optics',()=>{
 const curves=40,N=250,items=[];
 for(let c=0;c<curves;c++){
  for(let i=0;i<N;i++){
   const f=n=>[-2+n*4/N,10,Math.sin(n*4/N)*.02+c*.005];
   items.push(line(f(i),f(i+1),items.length,{physicalGround:true,kind:'latitude',angle:c}));
  }
 }
 const input=composition(items),before=input.scene.primitives.length;
 const first=lod.simplify(input,camera,1600,900);
 const shifted={...camera,center:[.2,1,0]};
 const second=lod.simplify(input,shifted,1600,900);
 assert.ok(first.composition.scene.primitives.length<before*.1);
 assert.ok(second.composition.scene.primitives.length<before*.1);
 assert.ok(first.stats.maxSampledPixelDeviation<=.5);
 assert.ok(second.stats.maxSampledPixelDeviation<=.5);
 assert.equal(input.scene.primitives.length,before);
});
test('119: real Globe/Standard tower scene retains every physical tower, fill and horizon primitive',()=>{
 const {model}=require('../tools/benchmark-adaptive-prism-112');
 const composition=require('../src/scene/CurvatureIndependentComposition');
 const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
 const m=model(85,'globe');
 m.aDelta=.00009;m.aDip=.12;
 const neutral=composition.composeOpticalMain(m,true);
 const original=optics.create().transform(neutral,m,{atmosphere:'standard'}).composition;
 const selected=lod.simplify(original,camera,1600,900);
 function unchanged(p){return !(p.metadata&&p.metadata.physicalGround&&p.metadata.kind!=='physical-horizon');}
 const sourceUnchanged=original.scene.primitives.filter(unchanged).map(p=>({type:p.type,points:p.points,style:p.style,metadata:p.metadata}));
 const selectedUnchanged=selected.composition.scene.primitives.filter(unchanged).map(p=>({type:p.type,points:p.points,style:p.style,metadata:p.metadata}));
 assert.deepEqual(selectedUnchanged,sourceUnchanged);
 assert.ok(selected.stats.inputGroundSegments>10000);
 assert.ok(selected.stats.outputPrimitives<original.scene.primitives.length*.6);
 assert.ok(selected.stats.maxSampledPixelDeviation<=.5);
 frames.fromComposition(selected.composition,camera,1600,900);
});

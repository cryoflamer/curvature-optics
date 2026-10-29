'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const scheduler=require('../src/app/CurvatureCanvasFrameScheduler');
const painter=require('../src/renderers/CurvatureLegacyOrderPreview');
const camera={pos:[0,0,10],center:[0,0,0],up:[0,1,0],sceneSize:10,
  screenSize:10,objectZExtend:0,zoom:1};
function fakeCanvas(){
 const operations=[];
 const ctx={clearRect(){operations.push('clear')},beginPath(){operations.push('begin')},
   moveTo(x,y){operations.push(['move',x,y])},lineTo(x,y){operations.push(['line',x,y])},
   closePath(){operations.push('close')},stroke(){operations.push('stroke')},fill(){operations.push('fill')}};
 return {canvas:{width:100,height:100,getContext(){return ctx}},operations};
}
function line(i,style={stroke:'#333',lineWidth:1}){
 return {type:'line',commandIndex:i,points:[[0,0,0],[1,0,0]],style};
}
function triangle(i){return {type:'polygon',commandIndex:i,mode:2,
 points:[[0,0,0],[1,0,0],[0,1,0]],style:{fill:'brown'}};}
const triangleProjection=i=>({commandIndex:i,
 points:[[40,40,10],[50,40,10],[45,50,10]]});
test('117: many adjacent guide segments share a bounded Canvas path',()=>{
 const scene={primitives:Array.from({length:3000},(_,i)=>line(i))};
 const {canvas,operations}=fakeCanvas();
 const result=painter.draw(canvas,scene,camera,[]);
 assert.equal(result.commands.length,3000);
 assert.equal(result.statistics.batchedStrokeCommands,3000);
 const actual=operations.filter(x=>x==='stroke').length;
 assert.ok(actual<=6,`expected <=6 strokes for 3000 guide segments, got ${actual}`);
 assert.equal(result.statistics.canvasStrokeCalls,actual);
 assert.equal(operations.filter(x=>Array.isArray(x)&&x[0]==='move').length,3000,
   'independent source commands must start separate subpaths');
});
test('117: changing stroke or alpha flushes batching without changing source order',()=>{
 const scene={primitives:[line(0),line(1),line(2,{stroke:'blue',alpha:.5}),line(3)]};
 const {canvas,operations}=fakeCanvas(),r=painter.draw(canvas,scene,camera,[]);
 assert.equal(r.statistics.canvasStrokeCalls,3);
 assert.equal(operations.filter(x=>x==='stroke').length,3);
 assert.deepEqual(operations.filter(x=>Array.isArray(x)&&x[0]==='move').length,4);
});
test('117: filled commands remain barriers between near/far strokes',()=>{
 const scene={primitives:[line(0),line(1),triangle(2),line(3),line(4)]};
 const {canvas,operations}=fakeCanvas();
 painter.draw(canvas,scene,camera,[triangleProjection(2)]);
 assert.deepEqual(operations.filter(x=>x==='stroke'||x==='fill'),['stroke','fill','stroke']);
});
test('117: scheduler draws latest frame only and cancels pending Physical work on mode switch',()=>{
 const callbacks=new Map(),cancelled=[],draws=[];
 let id=0,view=0;
 const api=scheduler.create(cb=>{callbacks.set(++id,cb);return id},
   n=>{cancelled.push(n);callbacks.delete(n)},()=>draws.push(view));
 for(let i=0;i<25;i++){view=i;api.schedule()}
 assert.equal(api.stats().scheduled,1);
 assert.equal(api.stats().coalesced,24);
 callbacks.get(1)();
 assert.deepEqual(draws,[24]);
 assert.equal(api.stats().pending,false);
 view=99;api.schedule();api.cancel();
 assert.deepEqual(draws,[24]);
 assert.deepEqual(cancelled,[2]);
 api.schedule();callbacks.get(3)();
 assert.deepEqual(draws,[24,99]);
});
test('117: frame requests made during drawing schedule the next frame',()=>{
 const callbacks=new Map();let id=0,draws=0,api;
 api=scheduler.create(cb=>{callbacks.set(++id,cb);return id},()=>{},()=>{
   if(++draws===1)api.schedule();
 });
 api.schedule();callbacks.get(1)();
 assert.equal(api.stats().pending,true);
 callbacks.get(2)();assert.equal(draws,2);
});
test('117: browser wiring coalesces only Physical and reports stage timings',()=>{
 const root=path.resolve(__dirname,'..');
 const html=fs.readFileSync(path.join(root,'CurvatureApp.html'),'utf8');
 const runtime=fs.readFileSync(path.join(root,'src/app/CurvatureAppRuntime.js'),'utf8');
 const main=fs.readFileSync(path.join(root,'src/app/CurvatureMainCanvasRenderer.js'),'utf8');
 assert.ok(html.indexOf('CurvatureCanvasFrameScheduler.js')<html.indexOf('CurvatureAppRuntime.js'));
 assert.match(runtime,/selector\.value==='physical'\)physicalCanvasFrameScheduler\.schedule\(\)/);
 assert.match(runtime,/physicalCanvasFrameScheduler\.cancel\(\);immediateGraphRedraw\(\)/);
 assert.match(runtime,/t\.canvasMs/);
 assert.match(main,/paintMs:paintOnlyMs/);
 assert.match(main,/renderer\.renderComposition\(g\.Canvas/);
});

const app=require('../src/app/CurvatureMainCanvasRenderer');
test('117: dense ground preview keeps complete curves, horizon and all object primitives',()=>{
 const guides=[];
 for(let curve=0;curve<120;curve++)for(let edge=0;edge<110;edge++){
  guides.push({type:'line',commandIndex:guides.length,
    points:[[curve,edge,0],[curve,edge+1,0]],style:{stroke:'blue'},
    metadata:{kind:'latitude',angle:curve}});
 }
 guides.push({type:'line',commandIndex:guides.length,points:[[0,0,0],[1,0,0]],
   style:{stroke:'green'},metadata:{kind:'physical-horizon'}});
 const objects=[];
 for(let i=0;i<15;i++)objects.push({type:'line',commandIndex:guides.length+i,
   points:[[0,i,0],[1,i,0]],style:{stroke:'black'},metadata:{kind:'physical-object-stroke'}});
 const all=[...guides,...objects],source={
  scene:{version:1,source:'legacy',primitives:all,metadata:{}},
  ranges:[{name:'surface-guides',role:'visual-aid',start:0,end:guides.length,count:guides.length},
    {name:'objects',role:'objects',start:guides.length,end:all.length,count:objects.length}]};
 const result=app.previewComposition(source);
 assert.equal(result.preview,true);
 assert.ok(result.drawnGuides<2500);
 const sampled=result.composition.scene.primitives;
 assert.equal(sampled.filter(p=>p.metadata.kind==='physical-horizon').length,1);
 assert.equal(sampled.filter(p=>p.metadata.kind==='physical-object-stroke').length,15);
 const retained=new Map();
 for(const p of sampled.filter(p=>p.metadata.kind==='latitude'))
   retained.set(p.metadata.angle,(retained.get(p.metadata.angle)||0)+1);
 assert.equal(retained.size,10);
 assert.ok([...retained.values()].every(n=>n===110));
 assert.ok(sampled.every((p,i)=>p.commandIndex===i));
 assert.equal(source.scene.primitives.length,all.length,'do not change the cached source');
});
test('117: small ground scenes retain their full geometry even during interaction',()=>{
 const source={scene:{primitives:[line(0),line(1)]},ranges:[
   {name:'surface-guides',role:'visual-aid',start:0,end:2,count:2}]};
 const result=app.previewComposition(source);
 assert.equal(result.preview,false);
 assert.equal(result.composition,source);
});

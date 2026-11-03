'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const objects=require('../src/diagnostics/CurvatureCameraFirstObjects141239');
const oracle=require('../src/diagnostics/CurvatureCameraFirstOracle141238');
const composition=require('../src/scene/CurvatureIndependentComposition');
const benchmark=require('../tools/benchmark-adaptive-prism-112');
const model=Object.assign({},benchmark.model(2,'globe'),{
  deviceRatio:1.5,camViewAngle:.3,Pan:0,Nick:0,Roll:0,viewcenterHorizon:3});
const snapshot={widthPx:800,heightPx:540,imagePlaneFocal:440,
  pixelScaleX:1,pixelScaleY:-1,pixelOffsetX:400,pixelOffsetY:270};
const config={model,snapshot};
function scene(){return composition.composeOpticalMain(model,true,{physicalWorld:true});}
function mesh(){return objects.prepare(scene());}
function tri(y=15){const a=[-1,y,0],b=[1,y,0],c=[0,y,2];
  return {a,b,c,e1:[2,0,0],e2:[1,0,2],maxRadius:y+1,zmin:0,zmax:2,
    sourceIndex:1,placedObjectIndex:0,sourceLayer:'test',triangleIndex:0,fill:'#000'};}
test('140.12.39: CPU chord hits a two-sided triangle and excludes coplanar/behind hits',()=>{
  const t=tri(15);
  assert.ok(Math.abs(objects.chordTriangle([0,0,1],[0,20,1],t)-.75)<1e-12);
  assert.ok(Math.abs(objects.chordTriangle([0,20,1],[0,0,1],t)-.25)<1e-12);
  assert.equal(objects.chordTriangle([3,0,1],[3,20,1],t),null);
  assert.equal(objects.chordTriangle([0,0,1],[0,10,1],t),null);
  assert.equal(objects.chordTriangle([0,15,0],[0,15,2],t),null); // coplanar
});
test('140.12.39: first physical intersection beats ground only when closer along ray',()=>{
  const mesh={triangles:[tri(15)],proxyTriangles:[]};
  const cand=objects.azimuthCandidates(mesh,0);
  assert.equal(cand.length,1);
  assert.equal(objects.azimuthCandidates(mesh,Math.PI/2).length,0);
  const path=[[0,1],[10,1],[20,1],[30,1]];
  const a=objects.firstHitFromPoints(path,0,null,cand);
  assert.equal(a.kind,'object');assert.ok(Math.abs(a.distance-15)<1e-10);
  assert.equal(objects.firstHitFromPoints(path,0,12,cand).kind,'ground');
  assert.equal(objects.firstHitFromPoints(path,0,16,cand).kind,'object');
  assert.equal(objects.firstHitFromPoints(path,0,null,[]).kind,'range');
});
test('140.12.39: physical-authored objects are distinct from projected polygons and outlines',()=>{
  const c=scene(),m=objects.prepare(c);
  assert.ok(m.counts.sourceOpaquePolygons>0);
  assert.ok(m.counts.sourceOutlineOnlyPolygons>0);
  assert.ok(m.counts.opaqueTriangles>0);
  assert.ok(m.counts.outlineProxyTriangles>0);
  assert.ok(m.triangles.every(t=>Number.isInteger(t.sourceIndex)&&t.sourceLayer.startsWith('objects-')));
  assert.ok(m.proxyTriangles.every(t=>Number.isInteger(t.sourceIndex)));
  assert.ok(c.scene.primitives.some(p=>p.type==='polygon'&&p.mode===1));
  assert.throws(()=>objects.prepare({...c,scene:{...c.scene,metadata:{...c.scene.metadata,
    physicalMetricWorld:false}}}),/Metric optics-neutral/);
});
test('140.12.39: focused ROI is an in-bounds physically authored object region',()=>{
  const focused=objects.focusedRoi(config,scene());
  assert.ok(focused);assert.ok(focused.bounds.width>=64&&focused.bounds.width<=240);
  assert.ok(focused.bounds.height>=64&&focused.bounds.height<=240);
  assert.ok(focused.bounds.x>=0&&focused.bounds.y>=0);
  assert.ok(focused.bounds.x+focused.bounds.width<=snapshot.widthPx);
  assert.ok(focused.bounds.y+focused.bounds.height<=snapshot.heightPx);
  assert.equal(focused.config.snapshot.pixelOffsetX,snapshot.pixelOffsetX-focused.bounds.x);
  assert.equal(focused.config.snapshot.pixelOffsetY,snapshot.pixelOffsetY-focused.bounds.y);
});
test('140.12.39: actual Globe/standard objects sample independent 3D trajectories and produce silhouette-proxy hits',()=>{
  const c=scene(),m=objects.prepare(c),roi=objects.focusedRoi(config,c),rows=[];
  for(let y=0;y<64;y++)rows.push(objects.sampleRow(roi.config,m,y,'standard',100));
  const s=objects.summary(rows,m);
  assert.equal(s.total,4096);
  assert.ok(s.proxyCounts.object>0,'near-view real tower outlines should be located by focused ROI');
  assert.ok(s.proxyExtraPixels>0);
  assert.ok(s.counts.ground>0);
  assert.ok(s.counts.range>0);
  assert.equal(s.counts.object+s.counts.ground+s.counts.grazing+s.counts.range,4096);
  for(const p of rows.flat()){
    if(p.kind==='object')assert.ok(p.groundDistanceMetres===null||p.distanceMetres<p.groundDistanceMetres);
  }
  const mask=objects.frame(rows),proxy=objects.frame(rows,'proxy');
  assert.equal(mask.width,512);assert.equal(proxy.rgba.length,512*512*4);
  assert.notDeepEqual(mask.rgba,proxy.rgba);
  const convergence=objects.convergence(roi.config,m,rows,96);
  assert.ok(convergence.checkedSamples>0&&convergence.checkedSamples<=96);
  assert.ok(Number.isInteger(convergence.changedOpaqueFirstHits));
  assert.ok(Number.isInteger(convergence.changedOutlineProxyFirstHits));
  const hit=rows.flat().find(p=>p.proxyKind==='object');
  const sameAngle=oracle.pixelRay(roi.config.model,roi.config.snapshot,hit.column,hit.row);
  assert.equal(hit.angleRadians,sameAngle.angleRadians);
});
test('140.12.39: pixel-centred CPU canvas sampling matches the focused region exactly',()=>{
  const rgba=new Uint8ClampedArray(64*64*4);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)rgba.set([x,y,67,255],(y*64+x)*4);
  const out=objects.downsample({width:64,height:64,rgba},{x:16,y:16,width:32,height:32});
  assert.deepEqual(Array.from(out.rgba.slice(0,4)),[16,16,67,255]);
  assert.deepEqual(Array.from(out.rgba.slice(-4)),[47,47,67,255]);
  assert.throws(()=>objects.downsample({width:64,height:64,rgba},{x:63,y:0,width:20,height:20}),/ROI/);
});
test('140.12.39: diagnostic ZIP includes original canvas, strict vs hypothetical proxy, and focused ROI',()=>{
  const rows=Array.from({length:64},(_,row)=>Array.from({length:64},(_,column)=>({
    row,column,kind:'range',proxyKind:'object',sourceIndex:null,proxySourceIndex:2})));
  const report={summary:{counts:{object:0}}},rgba=new Uint8ClampedArray(64*64*4),
    input={width:64,height:64,rgba},roi={bounds:{x:0,y:0,width:64,height:64}};
  const files=objects.entries(rows,report,input,{}, {png(){return new Uint8Array([137,80,78,71]);}},rows,roi);
  assert.equal(files.filter(x=>x.name.endsWith('.png')).length,8);
  assert.ok(files.some(x=>x.name.endsWith('focused-production-cpu-sampled.png')));
  assert.match(files.find(x=>x.name.endsWith('README.txt')).data,/NOT PHYSICALLY AUTHORED/);
});

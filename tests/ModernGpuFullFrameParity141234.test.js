'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const parity=require('../src/diagnostics/CurvatureGpuFullFrameParity141234');
function frame(w=20,h=16){return {width:w,height:h,rgba:new Uint8ClampedArray(w*h*4).fill(255)};}
function paint(f,x0,y0,x1,y1,color=[0,0,0,255]){
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)f.rgba.set(color,(y*f.width+x)*4);
  return f;
}
test('140.12.34: real two-Canvas readback copies bytes and rejects mismatched backing sizes',()=>{
  const f=paint(frame(),2,3,8,12);
  const result=parity.canvasCapture({width:f.width,height:f.height,
    getContext:()=>({getImageData:()=>({data:f.rgba})})});
  assert.deepEqual(Array.from(result.rgba),Array.from(f.rgba));
  f.rgba[0]=17;assert.equal(result.rgba[0],255,'snapshot is immutable w.r.t. later canvas painting');
  assert.throws(()=>parity.canvasCapture({width:0,height:1}),/Canvas/);
  assert.throws(()=>parity.analyze(result,frame(10,16),{zeroElevationRowPx:8}),/backing dimensions/);
  assert.throws(()=>parity.analyze(result,result,{}),/Finite actual-camera/);
});
test('140.12.34: identical RGBA frames have zero significant, edge and coverage mismatches',()=>{
  const a=paint(frame(),0,8,20,16),b=paint(frame(),0,8,20,16);
  const r=parity.analyze(a,b,{zeroElevationRowPx:8});
  assert.equal(r.totalPixels,320);assert.equal(r.exactRgbaPixels,320);
  assert.equal(r.significantPixels,0);assert.equal(r.maxCompositedChannelDelta,0);
  assert.equal(r.rgbMeanAbsoluteChannelDelta,0);
  assert.equal(r.coverageProxy.referenceOnlyPainted,0);
  assert.equal(r.coverageProxy.candidateOnlyPainted,0);
  assert.equal(r.eyeLevelBand.edgeProxy.referenceUnmatched,0);
  assert.equal(r.lowerRight45pct.significantPixels,0);
  assert.deepEqual(r.worstRows[0],{y:0,significantPixels:0});
});
test('140.12.34: one-pixel painted boundary shift exposes frame pixels and contrast edge displacement',()=>{
  const a=paint(frame(),0,8,20,16),b=paint(frame(),0,9,20,16);
  const r=parity.analyze(a,b,{zeroElevationRowPx:8});
  assert.equal(r.changedRgbaPixels,20);assert.equal(r.significantPixels,20);
  assert.equal(r.coverageProxy.referenceOnlyPainted,20);
  assert.equal(r.coverageProxy.candidateOnlyPainted,0);
  assert.equal(r.eyeLevelBand.significantPixels,20);
  assert.equal(r.eyeLevelBand.edgeProxy.referenceEdges,20);
  assert.equal(r.eyeLevelBand.edgeProxy.referenceMatchedWithin3px,20);
  assert.equal(r.eyeLevelBand.edgeProxy.meanAbsoluteMatchedEdgeOffsetPx,1);
  assert.equal(r.eyeLevelBand.edgeProxy.maxAbsoluteMatchedEdgeOffsetPx,1);
  assert.equal(r.worstRows[0].y,8);assert.equal(r.worstRows[0].significantPixels,20);
  assert.equal(r.tiles.reduce((s,t)=>s+t.significantPixels,0),20);
  const heat=parity.diffHeatmap(a,b);
  assert.deepEqual(Array.from(heat.rgba.slice((8*20+3)*4,(8*20+3)*4+4)),[140,45,192,255]);
  assert.deepEqual(Array.from(heat.rgba.slice(4,8)),[242,246,249,255]);
});
test('140.12.34: alpha, tolerance and out-of-frame zero-elevation ROI are explicitly handled',()=>{
  const a=frame(),b=frame();
  b.rgba[0]=250; // <=8/255 difference; does not count significant or painted
  b.rgba[4]=241; // >8/255 difference; paints candidate
  let r=parity.analyze(a,b,{zeroElevationRowPx:-200});
  assert.equal(r.changedRgbaPixels,2);assert.equal(r.significantPixels,1);
  assert.equal(r.coverageProxy.candidateOnlyPainted,1);
  assert.equal(r.eyeLevelBand.pixels,0);assert.equal(r.eyeLevelBand.edgeProxy,null);
  b.rgba[(4*20+4)*4]=0;b.rgba[(4*20+4)*4+3]=0; // completely transparent is white
  r=parity.analyze(a,b,{zeroElevationRowPx:8});
  assert.equal(r.coverageProxy.candidateOnlyPainted,1);
  assert.ok(r.maxRawRgbaChannelDelta>=255);
  assert.ok(r.maxCompositedChannelDelta<255,'fully transparent black must not count as a changed displayed pixel');
});
test('140.12.34: exact count, four viewpoints, and non-DS limitations are enforced in report',()=>{
  assert.throws(()=>parity.report([],{}),/Four measured camera/);
  const cases=Array.from({length:4},(_,i)=>({id:String(i),camera:{},pixelDiff:{significantPixels:0}}));
  const result=parity.report(cases,{gpuRayCount:4096});
  assert.equal(result.actualRenderedImageCompared,true);
  assert.equal(result.gpuDoubleSingleShootingUsed,false);
  assert.equal(result.dsFullFrameParityEstablished,false);
  assert.equal(result.productionAuthorized,false);
  assert.match(result.gpuAlgorithm,/f32 RK4 predictor/);
  assert.match(result.limitations.join(' '),/NOT a double-single/);
});

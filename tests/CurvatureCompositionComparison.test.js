'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('../src/diagnostics/CurvatureCompositionComparison');
const camera={pos:[0,0,10],zoom:1};
function frame(){const rgba=new Uint8ClampedArray(32*32*4);rgba.fill(255);return {width:32,height:32,camera,rgba};}
test('matching captures produce perfect agreement',()=>{const a=frame(),b=frame();a.rgba.set([0,0,0,255],(15*32+15)*4);b.rgba.set([0,0,0,255],(15*32+15)*4);const r=harness.compare(a,b,{edges:{inset:1,top:1,bottom:1}});assert.equal(r.foreground.intersectionOverUnion,1);assert.equal(r.rgba.exactRgbaFraction,1);assert.equal(r.edges.referenceUnmatched,0);});
test('changed pixels are reported',()=>{const a=frame(),b=frame();a.rgba.set([0,0,0,255],(15*32+15)*4);const r=harness.compare(a,b,{edges:{inset:1,top:1,bottom:1}});assert.equal(r.foreground.referenceOnly,1);assert.ok(r.rgba.exactRgbaFraction<1);assert.ok(r.edges.referenceUnmatched>0);});
test('camera, viewport and buffer mismatches are rejected',()=>{const a=frame(),b=frame();b.camera={pos:[0,0,11],zoom:1};assert.throws(()=>harness.compare(a,b),/Camera mismatch/);b.camera=camera;b.width=33;assert.throws(()=>harness.compare(a,b),/Viewport mismatch/);b.width=32;b.rgba=new Uint8ClampedArray(3);assert.throws(()=>harness.compare(a,b),/RGBA buffer/);});
test('composition is audited before rendering',()=>{const model={geometryRadius:6371000,Height:7,ObjType:[3,3],NObjects:[3,0],ObjDist:[100,0],ObjDeltaDist:[400,0],ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSideType:[0,0],ObjSize:[12,0],ObjSizeVar:[0,0],ObjSizeType:[0,0],rDisk:400,zDisk:3,hDip:1};const r=harness.prepare(model,0,true,{segments:32});assert.equal(r.audit.rendererReady,true);assert.equal(r.ranges.length,4);});

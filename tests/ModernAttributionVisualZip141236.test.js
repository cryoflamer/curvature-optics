'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const visual=require('../src/diagnostics/CurvatureAttributionVisualZip141236');
const zip=require('../src/diagnostics/GeometryDiagnosticsZip');
function frame(r,g,b){return {width:2,height:2,rgba:new Uint8ClampedArray([r,g,b,255,255,255,255,255,255,255,255,255,255,255,255,255])};}
test('140.12.36 difference distinguishes CPU-only and GPU-only and overlay',()=>{
 const a=frame(0,0,0),b=frame(255,255,255);
 assert.deepEqual([...visual.visual(a,b,'difference').rgba.slice(0,4)],[255,35,35,255]);
 assert.deepEqual([...visual.visual(b,a,'difference').rgba.slice(0,4)],[35,100,255,255]);
 assert.deepEqual([...visual.visual(a,b,'overlay').rgba.slice(0,4)],[128,128,128,255]);
 assert.throws(()=>visual.visual(a,{width:1,height:1,rgba:new Uint8ClampedArray(4)},'difference'),/dimensions/);
});
test('140.12.36 PNG entries include all four camera cases and JSON',async()=>{
 const a=frame(0,0,0),b=frame(255,255,255),calls=[];
 const doc={createElement(name){assert.equal(name,'canvas');return {width:0,height:0,getContext(){return {createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(){}};},toDataURL(){calls.push(this.width);return 'data:image/png;base64,iVBORw0KGgo=';}};}};
 const cases=['tilt-up','tilt-down','narrow-field','actual-camera'].map(id=>({id,frames:{cpu:a,baseline:b,strict:b,strictDirect:b}}));
 const entries=visual.entries(cases,{version:'140.12.35'},doc);
 assert.equal(entries.length,4*11+2);
 assert.ok(entries.some(x=>x.name==='actual-camera/cpu-vs-strictDirect-difference.png'));
 assert.ok(entries.some(x=>x.name==='tilt-up/cpu.png'));
 assert.equal(calls.length,44);
 const blob=zip.build(entries);assert.equal(blob.type,'application/zip');
 const bytes=new Uint8Array(await blob.arrayBuffer());assert.deepEqual([...bytes.slice(0,4)],[80,75,3,4]);
});

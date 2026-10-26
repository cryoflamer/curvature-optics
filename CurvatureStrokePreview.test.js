const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const strokes=require('./CurvatureStrokePreview');
const camera={pos:[0,0,0],center:[0,10,0],up:[0,0,1],sceneSize:10,screenSize:2,objectZExtend:0,zoom:1};
const poly=(mode,points)=>({type:'polygon',mode,points});
test('stroke renderer respects legacy mode flags and closes outlines',()=>{
 const p=[[-1,10,-1],[1,10,-1],[1,10,1],[-1,10,1]];
 const r=strokes.build({primitives:[poly(1,p),poly(2,p),poly(3,p)]},camera,100,100);
 assert.equal(r.statistics.strokePolygons,2);assert.equal(r.statistics.skippedNonStrokePolygons,1);
 assert.equal(r.statistics.inputSegments,8);assert.equal(r.segments.length,8);
});
test('near plane rejects hidden segments and clips crossing segments',()=>{
 assert.equal(strokes.clipNear([0,0,-1],[1,0,-2],1e-6),null);
 const r=strokes.clipNear([0,0,-1],[1,0,1],1e-6);assert.ok(Math.abs(r[0][2]-1e-6)<1e-10);
});
test('viewport clips segment and preserves interpolated depth',()=>{
 const r=strokes.clipViewport([ -10,5,2],[10,5,4],10,10);
 assert.ok(r);assert.equal(r[0][0],0);assert.ok(Math.abs(r[0][2]-8/3)<1e-10);
 assert.equal(strokes.clipViewport([-10,0,2],[-5,0,2],10,10),null);
});
test('stroke rasterizer depth-tests against existing fill',()=>{
 const line=[{points:[[1,2,10],[7,2,10]]}];
 const nearFill=new Float64Array(100).fill(1/5);
 assert.equal(strokes.rasterize(line,10,10,nearFill).visiblePixels,0);
 assert.ok(strokes.rasterize(line,10,10).visiblePixels>0);
});
test('diagnostics export includes separate strokes and combined previews',()=>{
 const html=fs.readFileSync(__dirname+'/CurvatureApp.html','utf8');
 for(const token of ['CurvatureStrokePreview.js','camera-strokes.png','camera-combined.png','cameraStrokes:strokeResult.statistics','cameraCombined:combinedResult.statistics'])assert.ok(html.includes(token));
});

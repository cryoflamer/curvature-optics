const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const {compare}=require('./CurvaturePixelComparison');
test('classifies foreground overlap and disagreement',()=>{const a=Uint8ClampedArray.from([0,0,0,255,255,255,255,255,0,0,0,255]);const b=Uint8ClampedArray.from([0,0,0,255,0,0,0,255,255,255,255,255]);const r=compare(a,b,3,1);assert.equal(r.statistics.both,1);assert.equal(r.statistics.referenceOnly,1);assert.equal(r.statistics.candidateOnly,1);assert.equal(r.statistics.intersectionOverUnion,1/3);});
test('rejects mismatched buffers',()=>assert.throws(()=>compare(new Uint8Array(4),new Uint8Array(8),1,1)));
test('diagnostics preserve native viewport and export explicit unavailability',()=>{const h=fs.readFileSync(__dirname+'/CurvatureApp.html','latin1');for(const x of ['CurvaturePixelComparison.js','camera-foreground-diff.png','cameraPixelComparison:pixelComparison','Viewport dimensions differ; no resampling performed'])assert.ok(h.includes(x));});

test('all camera diagnostic previews share captured reference viewport',()=>{
  const h=fs.readFileSync(__dirname+'/CurvatureApp.html','latin1');
  assert.match(h,/var cameraWidth=captureEndPixels\?captureEndPixels\.width:900/);
  assert.match(h,/var cameraHeight=captureEndPixels\?captureEndPixels\.height:500/);
  for(const name of ['perspectiveCanvas','filledCanvas','zCanvas','earCanvas','strokeCanvas','combinedCanvas']){
    assert.ok(h.includes(name+'.width=cameraWidth;'+name+'.height=cameraHeight;'),name);
    assert.ok(!h.includes(name+'.width=900;'+name+'.height=500;'),name);
  }
  assert.ok(h.includes('canvas.width=900;canvas.height=500'),'orthographic previews remain fixed size');
});

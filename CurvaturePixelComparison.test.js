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

test('edge comparison ignores uniform dark sky and matches offset edges within tolerance',()=>{
 const {compareEdges}=require('./CurvaturePixelComparison');const w=40,h=40;
 function canvas(bg,lineX){const a=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;const v=lineX!==null&&x===lineX?255-bg:bg;a.set([v,v,v,255],i);}return a;}
 const a=canvas(0,18),b=canvas(255,19);
 const r=compareEdges(a,b,w,h,{top:2,bottom:2,inset:2,tolerance:2});
 assert.ok(r.statistics.referenceEdges>0);
 assert.ok(r.statistics.candidateEdges>0);
 assert.ok(r.statistics.f1>0.8);
 const same=compareEdges(canvas(0,null),canvas(255,null),w,h,{top:2,bottom:2,inset:2});
 assert.equal(same.statistics.referenceEdges,0);assert.equal(same.statistics.candidateEdges,0);
});
test('edge diagnostics are exported alongside legacy mask comparison',()=>{
 const h=fs.readFileSync(__dirname+'/CurvatureApp.html','latin1');
 assert.ok(h.includes('camera-edge-diff.png'));
 assert.ok(h.includes('edgeComparison:edgeComparison.statistics'));
});

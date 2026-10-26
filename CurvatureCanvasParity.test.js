'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const painter=require('./CurvatureLegacyOrderPreview');
const styled=require('./CurvatureStyledCombinedPreview');
const comparison=require('./CurvaturePixelComparison');
test('painter stroke reconnects contiguous clipped segments and splits gaps',()=>{
 const ops=[],ctx={beginPath(){ops.push('begin')},moveTo(...a){ops.push(['move',...a])},lineTo(...a){ops.push(['line',...a])},stroke(){ops.push('stroke')}};
 const n=painter.strokePaths(ctx,[{points:[[0,0,1],[1,1,1]]},{points:[[1,1,1],[2,2,1]]},{points:[[5,5,1],[6,6,1]]}]);
 assert.equal(n,2);assert.equal(ops.filter(x=>Array.isArray(x)&&x[0]==='move').length,2);
});
test('painter canvas is cleared transparently, without white fillRect',()=>{
 const s=fs.readFileSync(require.resolve('./CurvatureLegacyOrderPreview'),'utf8');
 assert.match(s,/clearRect/);assert.doesNotMatch(s,/fillRect\(0,0,canvas.width,canvas.height\)/);
});
test('styled color parser recognizes blue',()=>assert.deepEqual(styled.color('blue'),[0,0,255,1]));
test('RGBA diagnostic distinguishes alpha, raw RGB and composited RGB',()=>{
 const a=Uint8ClampedArray.from([0,0,0,0,255,0,0,255]);
 const b=Uint8ClampedArray.from([255,255,255,255,255,0,0,255]);
 const r=comparison.compareRgba(a,b,2,1);
 assert.equal(r.exactRgbaPixels,1);assert.equal(r.exactAlphaPixels,1);assert.equal(r.compositedWhiteRgbMae,0);
});
test('diagnostic export records both RGBA comparisons',()=>{
 const html=fs.readFileSync(__dirname+'/CurvatureApp.html','latin1');
 assert.match(html,/styledRgbaComparison:styledRgba/);assert.match(html,/legacyOrderRgbaComparison:legacyOrderRgba/);
});

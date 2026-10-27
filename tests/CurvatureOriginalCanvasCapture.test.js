const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync(__dirname+'/../CurvatureApp.html','latin1');
test('geometry diagnostics capture original canvas independently of replay checkbox',()=>{
  assert.match(html,/\(compareCanvas \|\| geometryDiagnosticsExportRequested\) && captureProbe/);
  assert.match(html,/captureProbe\.snapshotCanvas\(g\.Canvas\)/);
  assert.match(html,/var snapshotProbe = compareCanvas && captureProbe/);
});
test('native original image is included in diagnostics archive',()=>{
  assert.match(html,/images\.push\(\{name:'camera-original\.png',data:originalBytes\}\)/);
  assert.match(html,/captureEndPixels\.toDataURL\('image\/png'\)/);
});
test('pixel comparison includes original and independent native sizes',()=>{
  assert.match(html,/originalSize:\[captureEndPixels\.width,captureEndPixels\.height\]/);
  assert.match(html,/independentSize:\[combinedCanvas\.width,combinedCanvas\.height\]/);
  assert.match(html,/originalImage:'camera-original\.png'/);
  assert.match(html,/Viewport dimensions differ; no resampling performed/);
});

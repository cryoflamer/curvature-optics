'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=path=>fs.readFileSync(require('node:path').join(root,path),'utf8');
const html=read('CurvatureModern.html');
const app=read('src/ui/modern/ModernApp.js');
const css=read('src/ui/modern/ModernApp.css');
const display=html.slice(html.indexOf('id="ModernPanelDisplay"'),html.indexOf('id="ModernRender"'));

test('Display stays compact with primary controls outside all collapsible panels',()=>{
  const firstFold=display.indexOf('<details class="modern-display-fold"');
  assert.ok(firstFold>0);
  for(const id of ['ModernGrid','ModernShowTemperatureProfile','ModernTemperaturePlacement',
    'ModernCompareEyeLevel','ModernCompareHorizon','ModernOpticalQuality','ModernPreviewDetail',
    'ModernGeometryBackend','ModernOpticalQualityStatus','ModernGeometryBackendStatus']){
    assert.ok(display.indexOf('id="'+id+'"')>0&&display.indexOf('id="'+id+'"')<firstFold,
      id+' must stay visible');
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' duplicated');
  }
  assert.doesNotMatch(display.slice(0,firstFold),/Fast Preview reuses the Modern painter|WebGL2 rasterizes projected triangles/);
  for(const hint of ['Help: temperature column','Help: eye-level line','Help: traced horizon',
    'Help: optical ray field','Help: Fast Preview object detail','Help: rendering backend'])
    assert.ok(display.includes('aria-label="'+hint+'"'),hint);
  assert.match(css,/\.modern-help:hover:after,\.modern-help:focus:after/);
  assert.match(css,/\.modern-display-fold>summary:focus-visible/);
});

test('Advanced and diagnostics are native nested details with unchanged working control IDs',()=>{
  for(const id of ['ModernDisplayAdvanced','ModernDisplayDiagnostics','ModernDisplayGpu',
    'ModernDisplayProfiler']){
    const tag=display.match(new RegExp('<details[^>]+id="'+id+'"[^>]*>'));
    assert.ok(tag,id+' missing');
    assert.doesNotMatch(tag[0],/\sopen(?:\s|=|>)/,id+' should be collapsed by default');
  }
  const diagnostics=display.indexOf('id="ModernDisplayDiagnostics"');
  const gpu=display.indexOf('id="ModernDisplayGpu"');
  const profiler=display.indexOf('id="ModernDisplayProfiler"');
  assert.ok(diagnostics<gpu&&gpu<profiler);
  assert.ok(display.indexOf('id="ModernResetPreferences"')<diagnostics);
  for(const id of ['ModernGpuCheck','ModernGpuResults','ModernGpuNote','ModernGpuActiveBackend',
    'ModernPerfRecord','ModernPerfStop','ModernPerfCold','ModernPerfWarm','ModernPerfSnapshot',
    'ModernPerfReset','ModernPerfExport','ModernPerfStatus','ModernPerfResults'])
    assert.ok(display.indexOf('id="'+id+'"')>diagnostics,id+' should remain in diagnostics');
  assert.match(display,/id="ModernDiagnosticsRecordingState" hidden/);
  assert.match(display,/id="ModernProfilerRecordingState" hidden/);
  assert.match(app,/\['ModernProfilerRecordingState','ModernDiagnosticsRecordingState'\]/);
});

test('Display fold toggles and Reset use the existing preferences, never experiment state',()=>{
  assert.match(app,/function bindDisplayPanels\(\)/);
  assert.match(app,/node\.addEventListener\('toggle',function\(\)/);
  assert.match(app,/displayPanels\[entry\[0\]\]=node\.open/);
  assert.match(app,/displayPanels:displayPanels/);
  assert.match(app,/bindDisplayPanels\(\);/);
  assert.match(app,/displayPanels=Object\.assign\(\{\},defaults\.displayPanels\)/);
  assert.match(app,/node\.hidden=!error&&!\/reset\/i\.test\(message\)/);
  assert.doesNotMatch(read('src/ui/modern/ModernApplicationPreferences.js'),/experimentStorage|ModernExperimentState/);
});

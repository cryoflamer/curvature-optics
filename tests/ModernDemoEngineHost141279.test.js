'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const sources=html=>[...html.replace(/<!--[\s\S]*?-->/g,'').matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)]
  .map(match=>match[1].split('?')[0]);
const old=read('CurvatureApp.html');
const host=read('CurvatureDemosHost.html');

// The actual Legacy module load order is a hard runtime dependency: graph,
// model, parser-time controls and authored animations share globals.
test('141.2.79: the dedicated host retains the authored Legacy runtime load order',()=>{
  const exclude=new Set(['src/ui/modern/ModernRoute.js','src/ui/legacy/LegacyDemoEmbed.js',
    'src/diagnostics/LegacyBrowserReferenceExport.js']);
  const baseline=sources(old).filter(src=>!exclude.has(src));
  assert.ok(baseline.length>80);
  assert.deepEqual(sources(host).filter(src=>!['src/ui/legacy/LegacyDemoEmbed.js',
    'src/ui/legacy/LegacyDemoDomMount.js'].includes(src)),baseline);
  assert.ok(baseline.includes('src/animation/CurvatureDemos.js'));
  assert.ok(baseline.includes('src/app/CurvatureAppRuntime.js'));
  assert.ok(baseline.includes('src/legacy/GraphX3DX.js'));
  for(const src of sources(host))assert.ok(fs.existsSync(path.join(root,src)),src);
});

test('141.2.79: host is independent of the historical Legacy document and diagnostics UI',()=>{
  assert.match(host,/<!doctype html>/i);
  assert.match(host,/id="Wiki"/);
  assert.match(host,/id="MoreAnimationInfos"/);
  assert.match(host,/id="MainCanvasRenderer"/);
  assert.match(host,/<option selected value="legacy">/);
  assert.match(host,/id="CurveDemosTabs"/);
  assert.match(host,/id="CurveSettingsTabs"/);
  assert.match(host,/id="CurveSettingsTabsBoxes"/);
  assert.match(host,/src="src\/ui\/legacy\/LegacyDemoEmbed\.js/);
  assert.doesNotMatch(host,/src="CurvatureApp\.html|id="OpticsAdvancedDiagnostics"|id="LegacyReferenceExportToolbar"/);
  assert.doesNotMatch(host,/Demos\.New\(/); // no second authored catalog
  assert.equal((host.match(/id="MoreAnimationInfos"/g)||[]).length,1);
  assert.equal((host.match(/id="CurveDemosTabs"/g)||[]).length,1);
  assert.equal((host.match(/src="src\/animation\/CurvatureDemos\.js"/g)||[]).length,1);
});

test('141.2.79: Modern Demos loads dedicated host lazily without changing Scene/Compare',()=>{
  const modern=read('src/ui/modern/ModernDemos.js');
  const html=read('CurvatureModern.html');
  assert.match(html,/id="ModernDemoFrame"[^>]*src="about:blank"/);
  assert.match(modern,/frame\.src='CurvatureDemosHost\.html\?embed=demos'/);
  assert.doesNotMatch(modern,/frame\.src='CurvatureApp\.html/);
  assert.match(read('src/ui/legacy/LegacyDemoEmbed.js'),/get\('embed'\)!=='demos'/);
  assert.match(read('src/ui/modern/ModernApp.js'),/return; \/\/ Never serialize Demos/);
  assert.match(html,/id="ModernSceneTab"/);
  assert.match(html,/id="ModernCompareTab"/);
  assert.match(old,/src="src\/ui\/legacy\/LegacyDemoEmbed\.js/);
});

test('141.2.79: the host uses the original surface and the Legacy-only layout rules',()=>{
  const css=read('src/ui/legacy/LegacyDemoEmbed.css');
  assert.match(css,/#Wiki>:not\(#JsGraph1\)/);
  assert.match(host,/<div id="Wiki">/);
  const runtime=read('src/app/CurvatureAppRuntime.js');
  assert.match(runtime,/Id: 'JsGraph1'/);
  const graph=read('src/legacy/GraphX3DX.js');
  assert.match(graph,/document\.writeln\(s\)/);
  assert.match(host,/<script src="src\/app\/CurvatureAppRuntime\.js"><\/script>/);
});

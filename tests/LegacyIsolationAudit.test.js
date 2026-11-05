'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {
  extractScriptSources, resolveLocalScript, readEntryPoint, buildReport,
} = require('../tools/audit-legacy-isolation');

const root = path.resolve(__dirname, '..');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures',
  'legacy-isolation-boundary.json'), 'utf8'));
const report = buildReport();

test('the repository-derived static HTML/require boundary is a reviewed, deterministic fixture', () => {
  assert.deepEqual(fixture, report, 'review the source changes and regenerate fixture via --json');
  assert.equal(report.schemaVersion, 2);
  assert.match(report.policy, /no ownership.*deletion approval/i);
  assert.equal(report.sourceJsCount, Object.keys(report.sourceModules).length);
});

test('HTML comments, query strings, entities, duplicate scripts and load ordering are handled', () => {
  const html = '<!-- <script src="bad.js"></script> -->' +
    '<script async src="src/a.js?v=1&amp;x=2"></script>' +
    "<script src='src/a.js?v=2'></script><script src=bare.js></script>";
  assert.deepEqual(extractScriptSources(html), ['src/a.js?v=1&amp;x=2', 'src/a.js?v=2']);
  assert.deepEqual(report.entrypoints.modern.duplicatedLoads,
    [{file:'src/ui/modern/ModernCompareGraph.js', count:2}]);
  assert.equal(report.entrypoints.legacy.scriptTags, 99);
  assert.equal(report.entrypoints.legacy.inlineScriptBlocks, 1);
  assert.equal(report.entrypoints.modern.inlineScriptBlocks, 0);
  assert.equal(report.entrypoints.legacy.inlineScriptSha256[0].length, 64);
  assert.equal(report.entrypoints.legacy.scripts[0], 'src/ui/modern/ModernRoute.js');
  assert.equal(report.entrypoints.legacy.scripts.at(-1), 'src/ui/panels/ComputedValuesPanel.js');
});

test('both live entrypoints have no missing or escaping static JS paths', () => {
  for (const entry of Object.values(report.entrypoints)) {
    assert.equal(entry.scripts.length, entry.scriptTags);
    for (const file of entry.scripts) {
      assert.ok(file.startsWith('src/'));
      assert.ok(fs.statSync(path.join(root, file)).isFile(), file);
    }
  }
  assert.equal(readEntryPoint(root, 'CurvatureApp.html').uniqueScripts, 99);
  assert.equal(resolveLocalScript(root, 'CurvatureModern.html', 'src/app/CurvatureModel.js?v=123&amp;b=5'),
    'src/app/CurvatureModel.js');
});

test('missing, absolute, remote and repository-escaping browser script paths fail closed', () => {
  for (const url of ['https://cdn.invalid/a.js', '/src/app/CurvatureModel.js',
    '../outside.js', 'src/no-such-file.js']) {
    assert.throws(() => resolveLocalScript(root, 'CurvatureApp.html', url),
      /missing|escapes|non-local/);
  }
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-isolation-'));
  try {
    fs.writeFileSync(path.join(sandbox, 'example.html'), '<script src="not-present.js"></script>');
    assert.throws(() => readEntryPoint(sandbox, 'example.html'), /missing static script/);
  } finally {
    fs.rmSync(sandbox, {recursive:true, force:true});
  }
});

test('shared scripts are protected by evidence irrespective of misleading path names', () => {
  for (const file of ['src/legacy/GraphX3DX.js', 'src/app/CurvatureModel.js',
    'src/optics/OpticalRayTracer.js']) {
    assert.deepEqual(report.sourceModules[file].directHtmlLoads.slice(0, 2), ['legacy', 'modern'], file);
    assert.ok(report.matrix.loadedByLegacyAndModern.includes(file));
  }
  assert.ok(report.matrix.loadedByLegacyAndModern.length >= 25);
  assert.deepEqual(report.sourceModules['src/diagnostics/GeometryDiagnosticsZip.js'].directHtmlLoads,['legacy']);
});

test('Legacy transport and narrative demos remain isolated without a Modern animation migration', () => {
  for (const file of ['src/animation/CurvatureDemos.js',
    'src/animation/CurvatureAnimations.js', 'src/app/CurvatureAppRuntime.js',
    'src/app/CurvatureStatePersistence.js']) {
    assert.deepEqual(report.sourceModules[file].directHtmlLoads, ['legacy']);
  }
  assert.ok(report.matrix.loadedByLegacyNotModern.length >= 62);
  assert.ok(report.matrix.loadedByModernNotLegacy.includes('src/ui/modern/ModernApp.js'));
});

test('Modern WebGL2 is retained, but the WebGPU optical research entrypoint is archived', () => {
  assert.deepEqual(report.sourceModules['src/renderers/CurvatureWebGLGeometryRenderer.js'].directHtmlLoads, ['modern']);
  assert.equal(report.entrypoints.webgpuResearch, undefined);
  assert.equal(fs.existsSync(path.join(root,'tools/webgpu-optics.html')),false);
});

test('literal CommonJS references in source/tests/tools do not disappear from the isolation evidence', () => {
  const ray = report.sourceModules['src/optics/OpticalRayTracer.js'];
  assert.ok(ray.commonJsSourceCallers.includes('src/optics/OpticalTargetProjection.js'));
  assert.ok(ray.commonJsTestCallers.includes('tests/OpticalRayTracer.test.js'));
  assert.ok(ray.commonJsToolCallers.includes('tools/diagnose-short-range-shooting-1406.js'));
  assert.ok(report.sourceModules['src/legacy/LegacySceneAdapter.js'].commonJsTestCallers
    .includes('tests/LegacySceneAdapter.test.js'));
  assert.equal(report.sourceModules['src/diagnostics/CurvatureGpuPrecisionGeometry141229.js'],undefined);
  assert.match(report.policy, /Static evidence only/);
});

test('isolation audit --check is read-only and agrees with checked-in JSON', () => {
  const check = spawnSync(process.execPath, ['tools/audit-legacy-isolation.js', '--check'],
    {cwd:root, encoding:'utf8'});
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /OK: Legacy 99 tags; Modern [0-9]+ tags/);
  assert.deepEqual(buildReport(), report);
});

test('Legacy remains a supported separate mode; references, route semantics and Modern CPU baseline survive', () => {
  const route = require('../src/ui/modern/ModernRoute');
  assert.equal(route.isModern('?ui=legacy'), false);
  assert.equal(route.isModern('?demo=TransLine&pos=5&play=1'), false);
  assert.equal(route.target({pathname:'/CurvatureApp.html',search:'?ui=modern&experiment=x',hash:'#App'}),
    '/CurvatureModern.html?ui=modern&experiment=x#App');
  assert.ok(fs.existsSync(path.join(root, 'tests/fixtures/legacy-browser-references.zip')));
  assert.ok(fs.existsSync(path.join(root, 'tools/validate-legacy-visual-reference.py')));
  const doc = fs.readFileSync(path.join(root, 'docs/legacy-isolation-audit.md'), 'utf8');
  assert.match(doc, /animation|анімац/i);
  assert.match(doc, /Legacy.*Modern/);
  assert.match(doc, /(?:no deletion|не видаля|без видалення)/i);
  assert.match(doc, /WebGL2/);
  assert.match(doc, /fused-gradient/);
});

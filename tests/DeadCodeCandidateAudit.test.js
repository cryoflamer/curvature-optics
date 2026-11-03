'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {buildReportWithRoot, commentedScriptSources, historicalBuildSources} =
  require('../tools/audit-dead-code-candidates');
const {buildReport} = require('../tools/audit-legacy-isolation');

const ROOT = path.resolve(__dirname, '..');
const expected = JSON.parse(fs.readFileSync(path.join(ROOT,
  'tests/fixtures/dead-code-candidates.json'), 'utf8'));
const actual = buildReportWithRoot();
const find = file => actual.candidates.find(row => row.file === file);

test('a deterministic, source-backed review fixture is required; all deletions remain forbidden', () => {
  assert.deepEqual(actual, expected);
  assert.equal(actual.schemaVersion, 1);
  assert.equal(actual.counts.deletionApproved, 0);
  assert.equal(actual.counts.totalReviewCandidates, actual.candidates.length);
  assert.equal(new Set(actual.candidates.map(x => x.file)).size, actual.candidates.length);
  assert.ok(actual.candidates.every(x => x.deletionApproved === false));
  assert.match(actual.policy, /no deletion authorized/i);
});

test('the audit partitions the 27 non-loaded and 11 research-only src modules without conflation', () => {
  const isolation = buildReport();
  const kinds = {
    'commented-legacy-debug-source': 10,
    'not-loaded-but-statically-referenced': 17,
    'research-harness-loaded': 11,
  };
  for (const [kind, count] of Object.entries(kinds)) {
    assert.equal(actual.candidates.filter(c => c.kind === kind).length, count);
  }
  assert.equal(actual.counts.sourceJs, isolation.sourceJsCount);
  assert.equal(actual.counts.totalReviewCandidates, 38);
  assert.deepEqual(actual.candidates.filter(c => c.kind === 'research-harness-loaded').map(c => c.file),
    isolation.matrix.researchOnlyNotEitherApp);
  assert.deepEqual(actual.candidates.filter(c => c.kind !== 'research-harness-loaded').map(c => c.file),
    isolation.matrix.notDirectlyLoadedByTheseEntrypoints);
});

test('commented HTML debug source tags are not mistaken for active browser loads', () => {
  const commented = actual.candidates.filter(x => x.kind === 'commented-legacy-debug-source');
  assert.equal(commented.length, 10);
  for (const entry of commented) {
    assert.deepEqual(entry.directHtmlLoads, [], entry.file);
    assert.deepEqual(entry.commentedHtmlReferences, ['CurvatureApp.html'], entry.file);
    assert.equal(entry.historicalBuildInput.script, 'src/make.bat');
    assert.equal(entry.disposition, 'review-source-bundle-provenance-before-removal');
  }
  assert.equal(find('src/x.js').kind, 'commented-legacy-debug-source');
  assert.equal(find('src/ModelAnimation.js').kind, 'commented-legacy-debug-source');
  assert.deepEqual(buildReport().sourceModules['src/legacy/GraphX3DX.js'].directHtmlLoads,
    ['legacy', 'modern']);
});

test('comment parsing recognizes only script tags inside comments and preserves source paths', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dead-code-comment-'));
  try {
    fs.mkdirSync(path.join(tmp, 'src'));
    fs.writeFileSync(path.join(tmp, 'index.html'),
      '<script src="src/active.js"></script>\n' +
      '<!-- <script src="src/old.js?v=123"></script> -->\n' +
      '<!-- <script src="src/other.js"></script> -->');
    const result = commentedScriptSources(tmp, ['index.html']);
    assert.deepEqual([...result.keys()], ['src/old.js', 'src/other.js']);
    assert.deepEqual(result.get('src/old.js'), ['index.html']);
    assert.equal(result.has('src/active.js'), false);
  } finally {fs.rmSync(tmp, {force:true, recursive:true});}
});

test('historical DOS bundle build records the actual case mismatch, not a working build claim', () => {
  const build = historicalBuildSources(ROOT);
  assert.equal(build.length, 10);
  assert.equal(build.filter(item => !item.exactCaseExists).length, 1);
  assert.deepEqual(build.find(item => item.file.toLowerCase() === 'src/slider.js'),
    {file:'src/slider.js', exactCaseExists:false});
  assert.equal(find('src/Slider.js').historicalBuildInput.writtenPath, 'src/slider.js');
});

test('research-only HTML modules remain protected by their canonical active entrypoint', () => {
  const research = actual.candidates.filter(x => x.kind === 'research-harness-loaded');
  assert.equal(research.length, 11);
  for (const entry of research) {
    assert.deepEqual(entry.directHtmlLoads, ['webgpuResearch']);
    assert.equal(entry.disposition, 'retain-until-explicit-research-retirement');
    assert.ok(entry.commonJsSourceCallers.length + entry.commonJsTestCallers.length > 0);
  }
  assert.equal(find('src/diagnostics/CurvatureWebGPUBatchShooting1412.js').commonJsTestCallers.length, 15);
  assert.ok(fs.existsSync(path.join(ROOT, 'tools/webgpu-optics.html')));
});

test('unloaded diagnostics are still linked from tests or other diagnostics, never labeled dead', () => {
  const rows = actual.candidates.filter(x => x.kind === 'not-loaded-but-statically-referenced');
  assert.equal(rows.length, 17);
  for (const item of rows) {
    assert.deepEqual(item.directHtmlLoads, []);
    assert.ok(item.commonJsSourceCallers.length + item.commonJsTestCallers.length +
      item.commonJsToolCallers.length > 0, item.file);
    assert.equal(item.disposition, 'review-static-and-dynamic-consumers-before-removal');
  }
  const precision = find('src/diagnostics/CurvatureGpuPrecisionFoundation141228.js');
  assert.equal(precision.commonJsSourceCallers.length, 5);
  assert.ok(find('src/diagnostics/CurvatureSeparationAudit.js').commonJsTestCallers
    .includes('tests/CurvatureSeparationAudit.test.js'));
});

test('Modern CPU diagnostics and WebGL2 are protected regardless of GPU-style names', () => {
  const byName = Object.fromEntries(actual.protectedFiles.map(x => [x.file, x.directHtmlLoads]));
  assert.deepEqual(byName['src/legacy/GraphX3DX.js'], ['legacy', 'modern']);
  assert.deepEqual(byName['src/optics/OpticalRayTracer.js'], ['legacy', 'modern', 'webgpuResearch']);
  assert.deepEqual(byName['src/renderers/CurvatureWebGLGeometryRenderer.js'], ['modern']);
  assert.deepEqual(byName['src/diagnostics/CurvatureGpuDsPainterGate141240.js'], ['modern']);
  assert.deepEqual(byName['src/diagnostics/CurvatureGpuPixelSpaceAudit141233.js'], ['modern']);
  assert.deepEqual(byName['src/diagnostics/CurvatureGpuFullFrameParity141234.js'], ['modern']);
  for (const name of Object.keys(byName)) assert.equal(find(name), undefined, name);
});

test('CLI --check is read-only, matches the pinned fixture, and bad flags fail', () => {
  const fixturePath = path.join(ROOT, 'tests/fixtures/dead-code-candidates.json');
  const initial = fs.readFileSync(fixturePath);
  const args = ['tools/audit-dead-code-candidates.js', '--check'];
  const result = spawnSync(process.execPath, args, {cwd:ROOT, encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /38 review candidates; 0 approved deletions/);
  assert.deepEqual(fs.readFileSync(fixturePath), initial);
  const reject = spawnSync(process.execPath, [args[0], '--delete'], {cwd:ROOT, encoding:'utf8'});
  assert.notEqual(reject.status, 0);
  assert.match(reject.stderr, /Usage:/);
});

test('review gates retain baseline, legacy preservation and GPU retirement evidence', () => {
  for (const file of ['docs/legacy-preservation-contract.md',
    'docs/experiments/webgpu-retirement.md', 'docs/experiments/gpu.md',
    'tests/fixtures/legacy-browser-references.zip']) {
    assert.ok(fs.statSync(path.join(ROOT, file)).isFile(), file);
  }
  const doc = fs.readFileSync(path.join(ROOT, 'docs/dead-code-candidate-audit.md'), 'utf8');
  for (const phrase of ['Legacy', 'Modern', 'WebGL2', 'src/make.bat',
    'optics-baseline-2026-11', 'Opera']) assert.ok(doc.includes(phrase), phrase);
  assert.match(doc, /no deletion|nothing.*deleted/i);
});

'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {GROUPS, jsTokens, buildReport} = require('../tools/audit-legacy-bundle-provenance');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = 'tests/fixtures/legacy-bundle-provenance.json';
const result = buildReport();
const pinned = JSON.parse(fs.readFileSync(path.join(ROOT, FIXTURE), 'utf8'));

function withSourceCopy(fn) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-provenance-'));
  try {
    fs.cpSync(path.join(ROOT, 'src'), path.join(temp, 'src'), {recursive: true});
    for (const page of ['CurvatureApp.html', 'CurvatureModern.html']) {
      fs.copyFileSync(path.join(ROOT, page), path.join(temp, page));
    }
    fn(temp);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
}

test('reviewed provenance fixture pins exact content and authorizes no removal', () => {
  assert.deepEqual(result, pinned);
  assert.equal(result.schemaVersion, 1);
  assert.deepEqual(result.counts, {
    legacySourceFiles: 10, activeBundles: 3, lexicalMatches: 3,
    recipeCaseMismatches: 1, historicalOutputsNotActive: 3, approvedDeletions: 0,
  });
  assert.equal(new Set(result.bundles.flatMap(b => b.inputs.map(i => i.file))).size, 10);
  assert.equal(result.tool.executed, false);
});

test('all three active bundles match the historical input token stream and parse as JS', () => {
  assert.deepEqual(GROUPS.map(g => g.bundle), [
    'src/legacy/GraphX3DX.js', 'src/ui/ControlPanelX.js', 'src/ui/ModelAnimationX.js']);
  assert.deepEqual(result.bundles.map(g => g.tokenCount), [66561, 29119, 7380]);
  for (const bundle of result.bundles) {
    assert.match(bundle.comparison, /identical-lexical-token-streams/);
    assert.ok(bundle.inputs.every(x => x.bytes > 0 && x.sha256.length === 64));
    assert.equal(bundle.bundleSha256.length, 64);
    assert.ok(bundle.bundleBytes < bundle.sourceBytes);
  }
});

test('the actual historical make.bat recipe has one Linux case error and three obsolete outputs', () => {
  const wrong = result.recipe.filter(x => !fs.existsSync(path.join(ROOT, 'src', x.input)));
  assert.deepEqual(wrong.map(x => x.input), ['slider.js']);
  assert.deepEqual(result.recipe.filter(x => !x.append).map(x => x.output),
    ['GraphX3DX.js', 'ControlPanelX.js', 'ModelAnimationX.js']);
  assert.deepEqual(result.bundles.map(b => b.historicalOutput),
    ['GraphX3DX.js', 'ControlPanelX.js', 'ModelAnimationX.js']);
  assert.deepEqual(result.bundles.map(b => b.activeEntrypoints),
    [['legacy', 'modern'], ['legacy'], ['legacy']]);
  assert.equal(result.bundles[1].inputs.find(x => x.file === 'src/Slider.js').exactCaseInRecipe, false);
});

test('lexer preserves quoted strings and regular expressions while ignoring comments/layout', () => {
  const source = 'var s = "http://test/*x*/"; var r = /\\"/g; /*keep*/ var n = 12 / 3;';
  const compact = 'var s="http://test/*x*/";var r=/\\"/g;var n=12/3;';
  assert.deepEqual(jsTokens(source), jsTokens(compact));
  assert.notDeepEqual(jsTokens('var x = 1;'), jsTokens('var x = 2;'));
});

test('modifying even one original source token invalidates its bundle provenance', () => {
  withSourceCopy(tmp => {
    fs.appendFileSync(path.join(tmp, 'src', 'x.js'), '\nvar changedOriginal = 123;\n');
    assert.throws(() => buildReport(tmp), /Token count mismatch|Token mismatch/);
  });
});

test('modifying a compiled bundle invalidates provenance', () => {
  withSourceCopy(tmp => {
    fs.appendFileSync(path.join(tmp, 'src/ui/ModelAnimationX.js'), '\nvar changedBundle = true;\n');
    assert.throws(() => buildReport(tmp), /Token count mismatch|Token mismatch/);
  });
});

test('unexpected changes to build recipe/order are rejected before making parity claims', () => {
  withSourceCopy(tmp => {
    const file = path.join(tmp, 'src/make.bat');
    const src = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, src.replace('jsmin <jsg.js >>', 'jsmin <jsg.js >'));
    assert.throws(() => buildReport(tmp), /recipe changed/);
  });
});

test('accidentally enabling a disabled unminified script is rejected', () => {
  withSourceCopy(tmp => {
    const file = path.join(tmp, 'CurvatureApp.html');
    const html = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, html.replace('</head>', '<script src="src/x.js"></script>\n</head>'));
    assert.throws(() => buildReport(tmp), /no longer a disabled Legacy debug source/);
  });
});

test('read-only --check compares the pinned fixture; unsupported flags fail', () => {
  const file = path.join(ROOT, FIXTURE);
  const initial = fs.readFileSync(file);
  const check = spawnSync(process.execPath, ['tools/audit-legacy-bundle-provenance.js', '--check'],
    {cwd: ROOT, encoding: 'utf8'});
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /3 bundles \/ 10 historical inputs/);
  assert.deepEqual(fs.readFileSync(file), initial);
  const invalid = spawnSync(process.execPath, ['tools/audit-legacy-bundle-provenance.js', '--delete'],
    {cwd: ROOT, encoding: 'utf8'});
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Usage:/);
});

test('historical licensing comments and active Legacy preservation remain in place', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'src/x.js'), 'utf8'), /LGPL/);
  assert.match(fs.readFileSync(path.join(ROOT, 'src/Slider.js'), 'utf8'), /MIT License/);
  for (const file of ['docs/legacy-preservation-contract.md',
    'tests/fixtures/legacy-browser-references.zip', 'src/jsmin.exe']) {
    assert.ok(fs.statSync(path.join(ROOT, file)).isFile());
  }
  assert.equal(result.counts.approvedDeletions, 0);
});

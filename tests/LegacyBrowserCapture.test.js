'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const {buildFixtures} = require('../tools/extract-legacy-demo-fixtures');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'tools/capture-legacy-browser.py');
function call(...args) {
  return spawnSync('python3', ['-B', script, ...args], {cwd: root, encoding: 'utf8', timeout: 15000});
}

test('offline capture plan names all six exact source states and never pretends to contain PNG baselines', () => {
  const response = call('--plan');
  assert.equal(response.status, 0, response.stderr);
  const plan = JSON.parse(response.stdout);
  const fixture = buildFixtures();
  assert.equal(plan.schemaVersion, 1);
  assert.match(plan.evidenceKind, /NOT completed captures/);
  assert.match(plan.captureMode, /zero-based sourceIndex/);
  assert.deepEqual(plan.viewportCssPixels, {width: 1440, height: 900});
  assert.equal(plan.deviceScaleFactor, 1);
  assert.deepEqual(plan.samples, fixture.scenarios.flatMap(group =>
    group.samples.map(s => ({demo: group.demo, sourceIndex: s.sourceIndex}))));
  assert.equal(Object.hasOwn(plan, 'complete'), false);
  assert.equal(Object.hasOwn(plan, 'images'), false);
});

test('source-state fixture uses one-based Legacy URL positions distinct from zero-based API indices', () => {
  const fixture = buildFixtures();
  for (const group of fixture.scenarios) {
    for (const sample of group.samples) {
      const query = new URLSearchParams(sample.legacyQuery);
      assert.equal(query.get('demo'), group.demo);
      assert.equal(Number(query.get('pos')), sample.sourceIndex + 1);
    }
  }
  const original = fs.readFileSync(path.join(root, 'src/app/CurvatureStatePersistence.js'), 'utf8');
  assert.match(original, /pos--;/);
  assert.match(original, /Demos\.SetDemo\( dataStr, play, pos \)/);
});

test('capture command refuses missing output directory and invalid timeout without launching browser', () => {
  const missing = call();
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Supply --out/);
  const invalid = call('--out', '/tmp/curvature-capture-never-written', '--timeout', '1');
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /at least 1000 ms/);
});

test('capture cannot overwrite prior reference evidence', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'curvature-legacy-capture-test-'));
  try {
    const sentinel = path.join(temp, 'evidence.txt');
    fs.writeFileSync(sentinel, 'DO NOT OVERWRITE');
    const response = call('--out', temp);
    assert.equal(response.status, 1);
    assert.match(response.stderr, /already exists/);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'DO NOT OVERWRITE');
  } finally {
    fs.rmSync(temp, {recursive: true, force: true});
  }
});

test('browser capture source explicitly uses original canvas and atomic complete-only manifests', () => {
  const source = fs.readFileSync(script, 'utf8');
  assert.match(source, /Demos\.SetDemo\(demo, false, index\)/);
  assert.match(source, /graph\.Canvas\.id !== 'JsGraph1-Canvas'/);
  assert.match(source, /engine\.value !== 'legacy'/);
  assert.match(source, /comparison\.value !== 'original'/);
  assert.match(source, /ctx\.getImageData\(/);
  assert.match(source, /pixelSha256/);
  assert.match(source, /if len\(manifest\['samples'\]\) != 6:/);
  assert.match(source, /stage\.rename\(target\)/);
  assert.match(source, /shutil\.rmtree\(stage, ignore_errors=True\)/);
});


test('browser apply callback selects exact zero-based state and rejects an incorrect renderer', () => {
  const py = 'import importlib.util,json; p=importlib.util.spec_from_file_location("capture",' + JSON.stringify(script) + '); m=importlib.util.module_from_spec(p); p.loader.exec_module(m); print(json.dumps(m.APPLY_JS))';
  const output = spawnSync('python3', ['-B', '-c', py], {encoding: 'utf8', timeout: 15000});
  assert.equal(output.status, 0, output.stderr);
  const browserJs = JSON.parse(output.stdout);
  const sourceState = {Height: 15, Pan: -10, ObjType: [3, 3], NObjects: [85, 2]};
  const model = {...sourceState, rEarth: 6371000, refractionCoeff: 0.17, refractionSync: 2, dHorizon: 12000, Nick: 0};
  let redraws = 0;
  const graph = {Canvas: {width: 600}, Redraw() { redraws++; }};
  const state = {selected: -1, name: null};
  const demos = {
    DemoList: [], CurrDemo: null, Find(name) { return name === 'TransLine' ? 0 : -1; },
    SetDemo(name, play, pos) { assert.equal(play, false); state.selected=pos; state.name=name; this.CurrDemo={Name:name}; },
    GetCurrPos() { return state.selected; }, IsPlaying() { return false; },
  };
  let renderer = 'legacy';
  const document = {getElementById(id) { return {value: id === 'MainCanvasRenderer' ? renderer : 'original'}; }};
  const env = vm.createContext({Demos:demos, CurveApp:model, graph, document, Error, JSON});
  const apply = vm.runInContext('(' + browserJs + ')', env);
  const result = apply({demo:'TransLine',index:4,sourceState});
  assert.equal(state.selected, 4);
  assert.equal(result.model.observerHeightMetres,15);
  assert.equal(result.effectiveStateFields.Pan, -10);
  assert.equal(redraws, 1);
  renderer = 'physical';
  assert.throws(() => apply({demo:'TransLine',index:0,sourceState}), /original rendering mode/);
  renderer = 'legacy';
  assert.throws(() => apply({demo:'Wrong',index:0,sourceState}), /not found/);
});

test('browser readback callback hashes raw pixels and refuses blank frames', async () => {
  const py = 'import importlib.util,json; p=importlib.util.spec_from_file_location("capture",' + JSON.stringify(script) + '); m=importlib.util.module_from_spec(p); p.loader.exec_module(m); print(json.dumps(m.CANVAS_JS))';
  const output = spawnSync('python3', ['-B', '-c', py], {encoding: 'utf8', timeout: 15000});
  assert.equal(output.status, 0, output.stderr);
  const bytes = new Uint8ClampedArray(16*16*4);
  for (let i = 0; i < 16*16; ++i) {
    bytes[i*4] = i < 128 ? 255 : 0;
    bytes[i*4+3] = 255;
  }
  const canvas = {id:'JsGraph1-Canvas',isConnected:true,width:16,height:16,
    getContext() { return {getImageData() { return {data:bytes}; }}; },
    toDataURL() { return 'data:image/png;base64,iVBORw0KGgo='; },
    getBoundingClientRect() { return {width:16,height:16}; }};
  const graph = {Canvas:canvas};
  const env = vm.createContext({graph, window:{graph}, crypto:webcrypto,
    Uint8Array, Error, Set, Math, Array});
  const capture = vm.runInContext('(' + JSON.parse(output.stdout) + ')',env);
  const got = await capture();
  assert.equal(got.width, 16);
  assert.equal(got.sampleDistinctColors, 2);
  assert.match(got.pixelSha256,/^[0-9a-f]{64}$/);
  bytes.fill(255);
  await assert.rejects(capture(),/Blank or uniform Canvas/);
});

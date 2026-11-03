'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const {buildContract} = require('../tools/check-legacy-preservation');
const {extractDemoStates} = require('../tools/extract-legacy-demo-fixtures');
const route = require('../src/ui/modern/ModernRoute');

const ROOT = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(ROOT, file), 'latin1');
const fixture = JSON.parse(source('tests/fixtures/legacy-preservation-contract.json'));

function sourceStateLiterals(name) {
  // Check the exact JavaScript strings passed to Demos.AddState. Some original
  // narrative text is escaped for JS and is not valid raw JSON until decoded.
  const js = source('src/animation/CurvatureDemos.js');
  const starts = [...js.matchAll(/Demos\.New\(\s*'([^']+)'/g)];
  const index = starts.findIndex(m => m[1] === name);
  assert.ok(index >= 0);
  const section = js.slice(starts[index].index,
    index + 1 < starts.length ? starts[index + 1].index : js.length);
  return [...section.matchAll(/Demos\.AddState\s*\(\s*('(?:\\.|[^'\\])*')\s*\)/g)]
    .map(match => vm.runInNewContext(match[1], {}, {timeout:1000}));
}

function makeDemosHarness() {
  const load = [], domReady = [], handlers = new Map(), displayed = new Map();
  const applied = [], updates = [];
  const context = {
    CurveApp: {Height:100},
    xDefStr: (value, fallback) => typeof value === 'string' ? value : fallback,
    xDefNum: (value, fallback) => typeof value === 'number' ? value : fallback,
    xStr: value => typeof value === 'string',
    xOnLoad: callback => load.push(callback),
    xOnDomReady: callback => domReady.push(callback),
    xInnerHTML: (id, value) => displayed.set(id, value),
    xAddClass(){}, xRemoveClass(){},
    Tabs: {AddButtonClickHandler(tab, id, callback) {handlers.set(`${tab}:${id}`, callback);}},
    NewModelAnimation(options) {
      return {
        CurrState:0, TargetState:0, NStates:0, IsPlaying:false, states:[], transitions:[],
        OnSetState(i, callback) {this.states[i] = callback; this.NStates = Math.max(this.NStates, i + 1);},
        AnimationToState(i, definition) {this.transitions[i] = definition;},
        Reset() {this.SetState(0);},
        Play() {this.IsPlaying = true;},
        Stop() {this.IsPlaying = false;},
        SetState(i) {
          this.CurrState = this.TargetState = i;
          if (this.states[i]) this.states[i]();
          if (options.OnAfterStateChange) options.OnAfterStateChange(this, i);
        },
      };
    },
    JsonToAppState: state => {applied.push(state); return true;},
    UpdateAll: stop => updates.push(stop),
    InitCustomDemo(){},
    ShowMoreInfos(){},
  };
  vm.runInNewContext(source('src/animation/CurvatureDemos.js'), context,
    {filename:'CurvatureDemos.js', timeout:5000});
  // Browser load events are explicitly dispatched by the test; they are not
  // implicit merely because source code registered a callback.
  load.forEach(fn => fn());
  domReady.forEach(fn => fn());
  return {demos:context.Demos, handlers, displayed, applied, updates,
    click(tab, id) {
      const handler = handlers.get(`${tab}:${id}`);
      assert.equal(typeof handler, 'function', `Missing handler: ${tab}:${id}`);
      handler();
    }};
}

function makeUrlHarness(search) {
  const jobs = [], events = [];
  const query = new URLSearchParams(search);
  const context = {
    CurveApp: {}, CurveAppMetaData: {},
    location: {hash:''},
    xOnLoad(){},
    document: {querySelectorAll:() => []},
    setTimeout(callback, ms) {assert.equal(ms, 1000); jobs.push(callback); return jobs.length;},
    DataX: {
      GetUrlStr: name => query.get(name) || '',
      GetUrlInt: (name, fallback) => {
        const value = Number(query.get(name));
        return query.has(name) && Number.isInteger(value) ? value : fallback;
      },
      FromStream: (_model, _meta, state) => events.push(['state', state]),
      ParseUrl() {},
    },
    Tabs: {Select: (tab, pos) => events.push(['tab', tab, pos])},
    Demos: {
      SetDemo: (name, play, pos) => events.push(['setDemo', name, play, pos]),
      Play: (name, reset) => events.push(['playDemo', name, reset]),
    },
    UpdateAll: stop => events.push(['redraw', stop]),
  };
  vm.runInNewContext(source('src/app/CurvatureStatePersistence.js'), context,
    {filename:'CurvatureStatePersistence.js', timeout:5000});
  context.HandleUrlCommands();
  return {events, jobs, hash:context.location.hash, flush() {jobs.splice(0).forEach(fn => fn());}};
}

test('reviewed Legacy preservation contract fixes all nine demos, 80 states and 71 interpolated transitions', () => {
  const actual = buildContract();
  assert.deepEqual(actual, fixture);
  assert.equal(fixture.demos.length, 9);
  assert.equal(fixture.demos.reduce((n, d) => n + d.states, 0), 80);
  assert.equal(fixture.demos.reduce((n, d) => n + d.animatedTransitions, 0), 71);
  assert.deepEqual(fixture.demoButtonOrder,
    ['Curve','Causeway','TransLine','Grace','Chicago','Canigou','Bedford','Tensas','Soundly']);
  assert.deepEqual(fixture.animationControls, ['BackButton','PlayButton','ForwButton','CountButton']);
  assert.match(fixture.evidence, /not browser timing, pixel or physics parity/);
});

test('real demo registration exposes all state callbacks and animation definitions', () => {
  const h = makeDemosHarness();
  const registered = h.demos.DemoList.map(d => ({name:d.Name, states:d.Anim.NStates,
    animatedTransitions:d.Anim.transitions.filter(Boolean).length}));
  assert.deepEqual(JSON.parse(JSON.stringify(registered)), fixture.demos);
  for (const {name, states} of fixture.demos) {
    const animation = h.demos.DemoList.find(d => d.Name === name).Anim;
    const expectedStrings = sourceStateLiterals(name);
    assert.equal(expectedStrings.length, states, `${name}: state literal parse differs from runtime registration`);
    assert.equal(animation.states.filter(Boolean).length, states);
    assert.equal(h.demos.Find(name) >= 0, true);
    assert.equal(h.handlers.has(`CurveDemosTabs:${name}Button`), true);
    for (let i = 0; i < states; i++) {
      // Assert real Legacy state strings remain connected to callbacks.
      h.demos.CurrDemo = h.demos.DemoList.find(d => d.Name === name);
      animation.SetState(i);
      assert.equal(h.applied.at(-1), expectedStrings[i]);
      if (name === 'TransLine' || name === 'Bedford') {
        assert.deepEqual(JSON.parse(h.applied.at(-1).replace(/^CurveApp = /, '')), extractDemoStates(name)[i]);
      }
    }
  }
});

test('the registered demo and transport button handlers retain play, pause, step, jump and reset wiring', () => {
  const h = makeDemosHarness();
  assert.equal(h.handlers.size, 14, 'nine demo buttons + reset + four transport controls');
  h.click('CurveDemosTabs', 'TransLineButton');
  assert.equal(h.demos.CurrDemo.Name, 'TransLine');
  assert.equal(h.demos.IsPlaying(), true);
  assert.equal(h.displayed.get('PlayButton'), 'Stop');
  h.click('CurveSettingsTabs', 'PlayButton');
  assert.equal(h.demos.IsPlaying(), false);
  assert.equal(h.displayed.get('PlayButton'), 'Play');
  h.click('CurveSettingsTabs', 'ForwButton');
  assert.equal(h.demos.GetCurrPos(), 1);
  h.click('CurveSettingsTabs', 'BackButton');
  assert.equal(h.demos.GetCurrPos(), 0);
  h.click('CurveSettingsTabs', 'CountButton');
  assert.equal(h.demos.GetCurrPos(), 7);
  h.click('CurveSettingsTabs', 'CountButton');
  assert.equal(h.demos.GetCurrPos(), 0);
  h.click('CurveSettingsTabs', 'PlayButton');
  assert.equal(h.demos.IsPlaying(), true);
  h.click('CurveDemosTabs', 'TransLineButton');
  assert.equal(h.demos.GetCurrPos(), 1, 'active demo button skips one step');
  const beforeReset = h.applied.length;
  h.click('CurveDemosTabs', 'ResetButton');
  assert.equal(h.applied.length, beforeReset + 1, 'ResetApp reapplies the canonical default state');
  assert.equal(h.demos.IsActive(), false);
  assert.equal(h.updates.at(-1), true);
});

test('Legacy Canvas click retains its own animation toggle rather than Modern RK4 re-rendering', () => {
  assert.match(source('src/app/CurvatureAppRuntime.js'), /OnClick:\s*function\(e\)\{\s*Demos\.PlayStop\(\);\s*\}/);
  assert.match(source('src/app/CurvatureAppRuntime.js'), /selector\.value\s*!==\s*'physical'/);
  assert.match(source('CurvatureApp.html'), /id="MainCanvasRenderer"[^>]*><option value="legacy" selected>/);
  assert.match(source('src/animation/CurvatureDemos.js'), /PlayStop:\s*function\(/);
});

test('Legacy demo URL with one-based pos positions the state without autoplay, even with play=1', () => {
  const h = makeUrlHarness('?demo=TransLine&pos=5&play=1');
  assert.equal(h.hash, '#App');
  assert.equal(h.jobs.length, 1);
  assert.deepEqual(h.events, []);
  h.flush();
  assert.deepEqual(h.events, [['setDemo', 'TransLine', false, 4]]);
});

test('Legacy old play-only, pos-only and bare demo links retain their distinct semantics', () => {
  for (const [search, expected] of [
    ['?demo=TransLine&play=1', ['setDemo','TransLine',true,0]],
    ['?demo=Bedford&pos=7', ['setDemo','Bedford',false,6]],
    ['?demo=Curve', ['playDemo','Curve',true]],
    ['?demo=Canigou&pos=1', ['setDemo','Canigou',false,0]],
  ]) {
    const h = makeUrlHarness(search);
    h.flush();
    assert.deepEqual(h.events, [expected], search);
  }
});

test('Legacy ?state= serialized URL remains independently restorable and subordinate to ?demo=', () => {
  const serialized = 'key+value/with spaces & symbols';
  const h = makeUrlHarness('?tab=Refr&state='+encodeURIComponent(serialized));
  assert.equal(h.hash, '#App');
  assert.deepEqual(h.events, [['tab','CurveSettingsTabs',3]]);
  h.flush();
  assert.deepEqual(h.events, [['tab','CurveSettingsTabs',3], ['state',serialized], ['redraw',false]]);
  const override = makeUrlHarness('?demo=Curve&state='+encodeURIComponent(serialized));
  override.flush();
  assert.deepEqual(override.events, [['playDemo','Curve',true]]);
  const empty = makeUrlHarness('?experiment=my-modern-scene');
  assert.equal(empty.hash, '');
  assert.equal(empty.jobs.length, 0);
});

test('shared entrypoint router keeps Legacy as default and redirects only explicit ui=modern', () => {
  for (const q of ['', '?ui=legacy', '?state=s', '?demo=Curve&pos=12', '?play=1', '?experiment=s']) {
    assert.equal(route.isModern(q), false, q);
  }
  assert.equal(route.isModern('?ui=modern&demo=Curve&pos=5'), true);
  const loc = {pathname:'/nested/CurvatureApp.html', search:'?ui=modern&experiment=x', hash:'#App'};
  assert.equal(route.target(loc), '/nested/CurvatureModern.html?ui=modern&experiment=x#App');
  assert.equal(route.canonical({...loc, pathname:'/nested/CurvatureModern.html'}),
    '/nested/CurvatureApp.html?ui=modern&experiment=x#App');
});

test('the archived Opera visual evidence is still readable by its existing independent validator', () => {
  const result = spawnSync('python3', ['tools/validate-legacy-visual-reference.py'],
    {cwd:ROOT, encoding:'utf8', timeout:30000});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /6|OK|valid/i);
});

test('preservation CLI is read-only and detects unintended fixture drift', () => {
  const result = spawnSync(process.execPath, ['tools/check-legacy-preservation.js', '--check'],
    {cwd:ROOT, encoding:'utf8', timeout:10000});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /9 Legacy demos \/ 80 states \/ 71 animated transitions/);
  const bad = structuredClone(fixture);
  bad.demos[0].states++;
  assert.notDeepEqual(bad, buildContract());
});

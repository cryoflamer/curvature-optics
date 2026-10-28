'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'latin1');
const html = read('CurvatureApp.html');
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"\s*><\/script>/g)].map(m => m[1]);

test('HTML entrypoint contains no inline JavaScript, script attributes, or page CSS blocks', () => {
  assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc=)/i);
  assert.doesNotMatch(html, /\bon(?:click|change|load|submit)\s*=/i);
  assert.doesNotMatch(html, /href=["']javascript:/i);
  assert.doesNotMatch(html, /<style\b/i);
  assert.match(html, /<link rel="stylesheet" href="src\/ui\/CurvaturePage\.css" media="all">/);
  assert.equal(new Set(scripts).size, scripts.length);
  for (const file of scripts) assert.ok(fs.statSync(path.join(root, file)).isFile(), file);
});

test('legacy drawing declarations load before application boot and diagnostics', () => {
  const drawing = scripts.indexOf('src/legacy/CurvatureLegacyDrawing.js');
  const bootstrap = scripts.indexOf('src/app/CurvatureAppRuntime.js');
  const model = scripts.indexOf('src/app/CurvatureModel.js');
  const diagnostics = scripts.indexOf('src/diagnostics/CurvatureLegacyFrameCaptureController.js');
  assert.ok(drawing >= 0 && model === drawing + 1);
  assert.equal(diagnostics, model + 1);
  assert.equal(scripts[diagnostics + 1], 'src/app/CurvaturePhysicalCamera127.js');
  assert.equal(scripts[diagnostics + 2], 'src/app/CurvaturePhysicalCurvature127.js');
  assert.equal(scripts[diagnostics + 3], 'src/app/CurvatureMainCanvasRenderer.js');
  assert.equal(scripts[diagnostics + 4], 'src/app/CurvatureCanvasFrameScheduler.js');
  assert.equal(scripts[diagnostics + 5], 'src/app/CurvatureHeightChangeScheduler120.js');
  assert.equal(bootstrap, diagnostics + 6);
  assert.match(read('src/legacy/CurvatureLegacyDrawing.js'), /function DrawModel\( g \)/);
  assert.match(read('src/legacy/CurvatureLegacyDrawing.js'), /function DrawShape\( objIx, g, m \)/);
  assert.match(read('src/app/CurvatureAppRuntime.js'), /DrawFunc: DrawMainCanvasFrame/);
  assert.ok(scripts.indexOf('src/scene/CurvatureIndependentComposition.js') < drawing);
});

test('parser-time panel creation remains synchronous at its original DOM location', () => {
  for (const file of [
    'ViewSliders', 'ViewOptions', 'ObjectSliders0', 'ObjectOptions0',
    'ObjectSliders1', 'ObjectOptions1', 'LengthCalculatorPanel', 'ComputedValuesPanel'
  ]) {
    const name = 'src/ui/panels/' + file + '.js';
    assert.ok(scripts.includes(name), name);
    assert.match(read(name), /ControlPanels\.New(?:Slider)?Panel\(/);
    assert.match(read(name), /\.Render\(\)/);
  }
  assert.ok(scripts.indexOf('src/ui/panels/ViewSliders.js') > scripts.indexOf('src/app/CurvatureAppRuntime.js'));
  assert.ok(scripts.indexOf('src/animation/CurvatureDemos.js') > scripts.indexOf('src/animation/CurvatureAnimations.js'));
  assert.ok(html.indexOf('id="SaveRestorePanel"') < html.indexOf('src/app/CurvatureStatePersistence.js'));
  assert.ok(html.indexOf('id="TowerComparisonMode"') < html.indexOf('src/ui/OpticsOverlayControls.js'));
  for (const file of scripts) assert.doesNotMatch(html.match(new RegExp('<script src="' + file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>'))[0], /\b(?:async|defer|type="module")/);
});

test('all extracted classic scripts parse independently', () => {
  const extracted = scripts.filter(name => /^(?:src\/(?:app|animation)|src\/ui\/|src\/legacy\/CurvatureLegacyDrawing\.js|src\/diagnostics\/CurvatureLegacyFrameCaptureController\.js)/.test(name) && !['src/ui/ControlPanelX.js', 'src/ui/ModelAnimationX.js'].includes(name));
  assert.equal(extracted.length, 30);
  for (const file of extracted) assert.doesNotThrow(() => new vm.Script(read(file), {filename:file}), file);
});

test('state hyperlinks invoke external action handlers without changing the URL hash', () => {
  const names = ['GetAppState','GetAppStateUrl','SetAppState','CompactJson','ClearAppStatePanel'];
  for (const name of names) assert.match(html, new RegExp('href="#" data-state-action="'+name+'"'));
  const links = names.map(name => ({name, getAttribute(){return this.name;}, addEventListener(type, callback){assert.equal(type,'click');this.callback=callback;}}));
  let focused = 0;
  const state = {value:'text',focus(){focused++;}};
  const context = {document:{querySelectorAll(){return links;}}, CurveApp:{StateDisplay:state}, xOnLoad(){}};
  vm.runInNewContext(read('src/app/CurvatureStatePersistence.js'),context);
  let prevented=false;
  links[4].callback.call(links[4],{preventDefault(){prevented=true;}});
  assert.equal(state.value,'');
  assert.equal(focused,1);
  assert.equal(prevented,true);
});

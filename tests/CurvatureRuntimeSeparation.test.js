'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const scripts = [...source('CurvatureApp.html').matchAll(/<script src="([^"]+)"\s*><\/script>/g)].map(x => x[1]);
const model = 'src/app/CurvatureModel.js';
const diagnostic = 'src/diagnostics/CurvatureLegacyFrameCaptureController.js';
const runtime = 'src/app/CurvatureAppRuntime.js';

test('model, capture diagnostics, and bootstrap have explicit script ownership', () => {
  assert.deepEqual(scripts.slice(scripts.indexOf(model), scripts.indexOf(runtime) + 1),
    [model, diagnostic, 'src/app/CurvatureMainCanvasRenderer.js', runtime]);
  assert.match(source(model), /function CurveAppClass\(\)/);
  assert.match(source(model), /CurveAppClass\.prototype\.UpdateObjectInput/);
  assert.match(source(diagnostic), /function DrawModelWithOptionalAudit\(g\)/);
  assert.match(source(runtime), /var CurveApp = new CurveAppClass\(\)/);
  assert.match(source(runtime), /DrawFunc: DrawMainCanvasFrame/);
  assert.doesNotMatch(source(runtime), /GeometryDiagnosticsZip|function CurveAppClass|captureFrame\(/);
  assert.doesNotMatch(source(model), /document\.getElementById|NewGraphX3D\(/);
  assert.doesNotMatch(source(diagnostic), /new CurveAppClass\(/);
});

test('classic scripts initialize global handlers and graph without a module loader', () => {
  let redraws = 0, draws = 0, panelUpdates = 0, onLoad;
  let graphOptions;
  const controls = new Map();
  const context = vm.createContext({
    window: {},
    document: {getElementById(id) {
      if (!controls.has(id)) controls.set(id, {handlers: {}, addEventListener(type, fn) {this.handlers[type] = fn;}});
      return controls.get(id);
    }},
    xDefBool(value, fallback) {return value === undefined ? fallback : value;},
    xOnLoad(fn) {onLoad = fn;},
    NewGraphX3D(options) {
      graphOptions = options;
      return {Redraw() {redraws++; graphOptions.DrawFunc({});}};
    },
    DrawModel() {draws++;},
    Demos: {Reset() {}, PlayStop() {}},
    ControlPanels: {Update() {panelUpdates++;}},
    HandleUrlCommands() {},
    ShowMoreInfos() {},
  });
  vm.runInContext(source(model), context, {filename:model});
  // This test checks the startup contract, not the numerical Update algorithm.
  vm.runInContext('CurveAppClass.prototype.Update = function() { this.modelUpdates = (this.modelUpdates || 0) + 1; };', context);
  vm.runInContext(source(diagnostic), context, {filename:diagnostic});
  vm.runInContext(source(runtime), context, {filename:runtime});
  assert.ok(context.CurveApp instanceof context.CurveAppClass);
  assert.equal(context.CurveApp.modelUpdates, 1);
  assert.equal(typeof graphOptions.DrawFunc, 'function');
  graphOptions.DrawFunc({});
  assert.equal(draws, 1);
  onLoad();
  assert.equal(panelUpdates, 1);
  assert.equal(redraws, 1);
  assert.equal(draws, 2);
  assert.equal(context.CurveApp.modelUpdates, 2);
  assert.equal(typeof controls.get('GeometryDiagnosticsExportButton').handlers.click, 'function');
  assert.equal(typeof controls.get('LegacyFrameCaptureButton').handlers.click, 'function');
});

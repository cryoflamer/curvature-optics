'use strict';
const assert = require('assert');
const diagnostics = require('./OpticalTowerDiagnostics');
const overlay = require('./OpticalTowerOverlay');
const original = {
  document: globalThis.document,
  CurveApp: globalThis.CurveApp,
  graph: globalThis.graph
};
let output = { textContent: '', innerHTML: '' };
let handler;
globalThis.CurveApp = {
  NObjects: [85], ObjType: [3], Height: 15, rEarth: 6371000,
  ObjDist: [50], ObjDeltaDist: [297.5], ObjSize: [23], ObjSidePos: [0]
};
globalThis.document = {
  readyState: 'complete',
  getElementById(id) {
    if (id === 'OpticsTowerDiagnostic') return {};
    if (id === 'TowerDiagnosticRun') return {addEventListener: (_event, fn) => {handler=fn;}};
    if (id === 'TowerOverlayEnabled') return {addEventListener: () => {}};
    if (id === 'TowerDiagnosticGeometry') return {value: 'globe'};
    if (id === 'TowerDiagnosticAtmosphere') return {value: 'vacuum'};
    if (id === 'TowerDiagnosticOutput') return output;
    return null;
  }
};
let redraws = 0;
globalThis.graph = {Redraw() {redraws++;}};
// Module is already cached; bind through a fresh require to test the browser-like path.
delete require.cache[require.resolve('./OpticalTowerDiagnostics')];
require('./OpticalTowerDiagnostics');
assert.equal(typeof handler, 'function');
const oldTimeout = globalThis.setTimeout;
globalThis.setTimeout = fn => fn();
handler();
globalThis.setTimeout = oldTimeout;
assert(!output.textContent.startsWith('Diagnostic error:'), output.textContent);
assert(output.innerHTML.includes('<table'));
assert(redraws > 0);
Object.keys(original).forEach(key => {
  if (original[key] === undefined) delete globalThis[key];
  else globalThis[key] = original[key];
});
console.log('OpticalTowerDiagnostics integration: 3 checks passed');

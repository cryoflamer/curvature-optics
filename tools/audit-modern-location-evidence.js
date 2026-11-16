#!/usr/bin/env node
'use strict';
/*
 * Read-only source-state baselines for the Legacy -> native Modern migration.
 * Literal demo states are parsed, never evaluated. This is NOT a state importer,
 * optics oracle, UI preset generator, or authorization to retire Legacy.
 * --write deliberately refreshes the small, selected-state evidence fixture.
 */
const fs = require('node:fs');
const path = require('node:path');
const {extractAllDemoStates} = require('./audit-legacy-modern-boundary');
const catalog = require('../src/ui/modern/ModernLocationCatalog');
const root = path.resolve(__dirname, '..');
const source = 'src/animation/CurvatureDemos.js';
const fixture = 'tests/fixtures/modern-location-evidence.json';

// Zero-based source indices: opening, a meaningful middle, and final state.
// Existing original-Canvas references for TransLine / Bedford are preserved.
const INDICES = Object.freeze({
  Curve: Object.freeze([0, 7, 11]),
  Causeway: Object.freeze([0, 2, 5]),
  TransLine: Object.freeze([0, 4, 7]),
  Grace: Object.freeze([0, 5, 8]),
  Bedford: Object.freeze([0, 3, 6]),
  Tensas: Object.freeze([0, 3, 5]),
  Soundly: Object.freeze([0, 9, 17]),
  Chicago: Object.freeze([0, 2, 5]),
  Canigou: Object.freeze([0, 3, 7]),
});

function activeBank(state, group) {
  const count = state.NObjects[group];
  if (!Number.isInteger(count) || count <= 0) return null;
  const startMetres = state.ObjDist[group], spacingMetres = state.ObjDeltaDist[group];
  const lastMetres = startMetres + (count - 1) * spacingMetres;
  return {
    group, type: state.ObjType[group], count,
    startMetres, spacingMetres, lastMetres,
    // An honest count even when a source allows zero spacing or negative ranges.
    behindObserver: Array.from({length: count}, (_, i) => startMetres + i * spacingMetres)
      .filter(distance => distance < 0).length,
    sideMetres: state.ObjSidePos[group], sideVariation: state.ObjSideVar[group],
    sideVariationType: state.ObjSideType[group],
    sizeMetres: state.ObjSize[group], sizeVariation: state.ObjSizeVar[group],
    sizeVariationType: state.ObjSizeType[group],
  };
}

function sampleState(state, demo, sourceIndex) {
  const fields = ['Height', 'FocalLengthField', 'Pan', 'Nick', 'Roll',
    'viewcenterHorizon', 'deviceRatio'];
  const camera = Object.fromEntries(fields.map(key => [key, state[key]]));
  return {
    sourceIndex, legacyQuery: '?demo=' + encodeURIComponent(demo) + '&pos=' + (sourceIndex + 1),
    camera, surface: {showModel: state.showModel, rEarth: state.rEarth},
    banks: [0, 1].map(group => activeBank(state, group)).filter(Boolean),
    refraction: {
      syncMode: state.refractionSync === undefined ? null : state.refractionSync,
      // null indicates *absent*, not a substitute for zero.
      authoredCoefficient: Object.hasOwn(state, 'refractionCoeff') ? state.refractionCoeff : null,
    },
  };
}

function buildEvidence() {
  const text = fs.readFileSync(path.join(root, source), 'latin1');
  const demos = extractAllDemoStates(text);
  if (demos.length !== catalog.SCENARIOS.length || Object.keys(INDICES).length !== demos.length)
    throw Error('Scenario coverage changed; review the selected source indices');
  return {
    schemaVersion: 1, source,
    policy: 'source-derived geometry and camera summaries only; no Modern import, optical parity or browser pixel certification',
    scenarios: catalog.SCENARIOS.map(scenario => {
      const demo = demos.find(entry => entry.demo === scenario.legacyDemo);
      if (!demo || !Object.hasOwn(INDICES, demo.demo) || demo.states.length !== scenario.stateCount)
        throw Error('Authored demo count/identity changed: ' + scenario.legacyDemo);
      const indices = INDICES[demo.demo];
      if (indices.length !== 3 || indices[0] !== 0 || indices[1] <= 0 ||
          indices[1] >= demo.states.length - 1 || indices[2] !== demo.states.length - 1)
        throw Error('Opening/middle/final sample invalid: ' + demo.demo);
      return {
        scenarioId: scenario.id, legacyDemo: demo.demo, totalStates: demo.states.length,
        samples: indices.map(index => sampleState(demo.states[index], demo.demo, index)),
      };
    }),
  };
}

function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || !['--check', '--write'].includes(argv[0]))
    throw Error('Usage: node tools/audit-modern-location-evidence.js --check | --write');
  const json = JSON.stringify(buildEvidence(), null, 2) + '\n';
  const out = path.join(root, fixture);
  if (argv[0] === '--write') {
    fs.writeFileSync(out, json, 'utf8');
    console.log('Updated curated Legacy source-state evidence (not an imported experiment)');
  } else if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== json) {
    throw Error(fixture + ' is stale; review source changes and regenerate deliberately with --write');
  } else {
    console.log('OK: 9 source demos / 27 pinned state summaries; geometry/camera evidence unchanged');
  }
}
if (require.main === module) {
  try { main(); } catch (e) { console.error('Location evidence FAILED: ' + e.message); process.exitCode = 1; }
}
module.exports = {INDICES, activeBank, sampleState, buildEvidence, main};

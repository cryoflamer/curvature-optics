#!/usr/bin/env node
'use strict';

// Data-only compatibility audit, NEVER a Legacy state importer or URL converter.
// The original JS demo strings are parsed without running Legacy application code.
const fs = require('node:fs');
const path = require('node:path');
const codec = require('../src/ui/modern/ModernExperimentState');
const root = path.resolve(__dirname, '..');
const sourcePath = 'src/animation/CurvatureDemos.js';
const fixturePath = 'tests/fixtures/legacy-modern-boundary.json';

const fieldTargets = Object.freeze({
  DemoText: 'scene.title', Description: 'scene.description',
  showModel: 'scene.surface.showModel', rEarth: 'scene.surface.rEarth',
  showGrid: 'scene.showGrid',
  ...Object.fromEntries(codec.CAMERA.map(k => [k, 'scene.camera.' + k])),
  viewcenterHorizon: 'scene.camera.viewcenterHorizon',
  deviceRatio: 'scene.camera.deviceRatio',
  ...Object.fromEntries(codec.OBJECT.map(k => [k, 'scene.objects.' + k])),
});

const legacyOnlyReasons = Object.freeze({
  nLines: 'Legacy viewport decoration density, not a Modern experiment field',
  showData: 'Legacy computed-value overlay, not the Modern display schema',
  showTangent: 'Legacy tangent overlay, not the Modern display schema',
  showEyeLevel: 'Legacy eye-level overlay; Modern display.eyeLevel has different view semantics',
  rFEarth: 'Legacy flat-Earth reference radius, no Scene surface field',
  opticsMode: 'Legacy optical backend selection; Modern has independent Scene/Compare optics',
  opticsProfile: 'Legacy optical profile is not a Modern atmosphere mapping',
  refractionCoeff: 'Legacy effective-radius k, not a Modern atmosphere profile',
  tempGradient: 'Legacy lapse rate, not a Modern atmosphere profile',
  refractionSync: 'Legacy parameter synchronization mode, not a Modern atmosphere profile',
  pressure: 'Legacy barometric input; Modern atmosphere is selected by named profile',
  temperatureC: 'Legacy thermal input; Modern atmosphere is selected by named profile',
  refractionFactMin: 'Legacy refraction slider boundary, absent from Modern state',
  refractionFactMax: 'Legacy refraction slider boundary, absent from Modern state',
});

// A valid validation *probe*, not a translated scene or recommended physical config.
// Using the actual Modern codec makes its allowed values/ranges the authority.
function validProbe() {
  const m = {
    Height: 15, FocalLengthField: 2000, Pan: 0, Nick: 0, Roll: 0,
    viewcenterHorizon: 0, deviceRatio: 1.5,
    showModel: 1, rEarth: 6371000, showGrid: 1,
    DemoText: '', Description: '',
    NObjects: [1, 1], ObjType: [3, 3], ObjDist: [50, 100],
    ObjDeltaDist: [10, 10], ObjSideType: [0, 0], ObjSidePos: [0, 0],
    ObjSideVar: [0, 0], ObjSizeType: [0, 0], ObjSize: [10, 10], ObjSizeVar: [0, 0],
  };
  const physics = {surface: 'globe', radiusKm: 6371, atmosphere: 'vacuum', occlusionRadius: 6371000};
  return codec.capture(m, {atmosphere: 'vacuum', occlusionRadius: 6371000,
    preset: 'custom', resetPreset: 'single'},
  {A: physics, B: {...physics}, preset: 'custom'},
  {selected: 'A', mode: 'scene', eyeLevel: false, horizon: false});
}

function setPath(obj, dotted, value) {
  const parts = dotted.split('.');
  let at = obj;
  for (const part of parts.slice(0, -1)) at = at[part];
  at[parts[parts.length - 1]] = value;
}

function decodeJsSingleQuotedLiteral(raw) {
  // Decode only the escapes actually needed by the source; fail closed for new ones.
  return raw.replace(/\\(.)/gs, (_, c) => {
    if (c === "'") return "'";
    if (c === '\\') return '\\';
    if (c === 'n') return '\n';
    if (c === 'r') return '\r';
    if (c === 't') return '\t';
    throw new Error('Unsupported JavaScript escape in Legacy demo literal: \\' + c);
  });
}

function extractAllDemoStates(text) {
  const starts = [...text.matchAll(/Demos\.New\(\s*'([^']+)'/g)];
  if (!starts.length) throw new Error('No Legacy demos found');
  return starts.map((match, index) => {
    const section = text.slice(match.index, index + 1 < starts.length ? starts[index + 1].index : undefined);
    const expected = [...section.matchAll(/Demos\.AddState\s*\(/g)].length;
    const literals = [...section.matchAll(/Demos\.AddState\s*\(\s*'((?:\\.|[^'\\])*)'\s*\)/g)];
    if (expected !== literals.length) throw new Error(match[1] + ': non-literal AddState');
    const states = literals.map((m, i) => {
      const decoded = decodeJsSingleQuotedLiteral(m[1]);
      if (!decoded.startsWith('CurveApp = ')) throw new Error(match[1] + ' ' + i + ': not a CurveApp state');
      const value = JSON.parse(decoded.slice('CurveApp = '.length));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid state object');
      return value;
    });
    return {demo: match[1], states};
  });
}

function auditState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('Legacy state must be an object');
  const mapped = [], unmapped = [], blockers = [];
  for (const key of Object.keys(state).sort()) {
    const target = fieldTargets[key];
    if (!target) {
      const reason = legacyOnlyReasons[key];
      unmapped.push({field: key, reason: reason || 'Unknown Legacy field; translation is prohibited'});
      if (!reason) blockers.push({code: 'unknown-field', field: key});
      continue;
    }
    let value = state[key];
    if (key === 'showGrid') {
      if (value !== 0 && value !== 1) {
        blockers.push({code: 'grid-mode-not-representable', field: key, value});
        continue;
      }
      value = value === 1;
    }
    // Each property is checked in isolation against the real Modern schema;
    // this does NOT validate a complete converted experiment or its semantics.
    try {
      const probe = validProbe();
      setPath(probe, target, value);
      codec.validate(probe);
      mapped.push({field: key, target, kind: key === 'showGrid' ? 'boolean-normalization' :
        ['DemoText', 'Description'].includes(key) ? 'rename' : 'same-name'});
    } catch (_) {
      blockers.push({code: 'modern-schema-rejected', field: key, value});
    }
  }
  const types = Array.isArray(state.ObjType) ? [...new Set(state.ObjType)].sort((a, b) => a - b) : [];
  if (!types.length || types.some(t => !Number.isInteger(t))) {
    blockers.push({code: 'invalid-legacy-object-types', field: 'ObjType'});
  }
  // The allowed Modern values 0..3 are *only* schema-compatible. The original
  // shapes and rays must still be independently compared before migration.
  return {
    mapped, unmapped, blockers,
    geometryTypes: types,
    geometryParity: 'not-established',
    opticalParity: 'not-established',
    conversionStatus: 'not-supported',
    structuralStatus: blockers.length ? 'blocked' : 'review-only',
  };
}

function buildReport() {
  const source = fs.readFileSync(path.join(root, sourcePath), 'latin1');
  const demos = extractAllDemoStates(source);
  const selected = require(path.join(root, 'tests/fixtures/legacy-reference-scenarios.json'));
  const selectedIds = new Set(selected.scenarios.flatMap(s => s.samples.map(p => s.demo + ':' + p.sourceIndex)));
  const entries = demos.map(({demo, states}) => ({
    demo, totalStates: states.length,
    states: states.map((state, sourceIndex) => {
      const a = auditState(state);
      return {
        sourceIndex,
        legacyQuery: '?demo=' + encodeURIComponent(demo) + '&pos=' + (sourceIndex + 1),
        selectedVisualFixture: selectedIds.has(demo + ':' + sourceIndex),
        showModel: state.showModel,
        geometryTypes: a.geometryTypes,
        mappedFields: a.mapped.map(x => x.field),
        unmappedFields: a.unmapped.map(x => x.field),
        blockers: a.blockers,
        structuralStatus: a.structuralStatus,
        conversionStatus: a.conversionStatus,
      };
    }),
  }));
  return {
    schemaVersion: 1,
    source: sourcePath,
    modernSchema: 'src/ui/modern/ModernExperimentState.js',
    policy: 'read-only; no URL rewriting, model import, optical equivalence or deletion approval',
    totalDemos: entries.length,
    totalStates: entries.reduce((n, e) => n + e.states.length, 0),
    browserReferenceStates: entries.reduce((n, e) => n + e.states.filter(s => s.selectedVisualFixture).length, 0),
    demos: entries,
  };
}

function main(argv) {
  const flags = argv.slice(2);
  if (flags.some(x => !['--check', '--json'].includes(x))) throw new Error('Usage: node tools/audit-legacy-modern-boundary.js [--check|--json]');
  if (flags.length > 1) throw new Error('Choose --check or --json');
  const report = buildReport();
  const json = JSON.stringify(report, null, 2) + '\n';
  const filepath = path.join(root, fixturePath);
  if (flags.includes('--check')) {
    if (!fs.existsSync(filepath) || fs.readFileSync(filepath, 'utf8') !== json) {
      throw new Error(fixturePath + ' is stale; regenerate with node tools/audit-legacy-modern-boundary.js --json');
    }
    process.stdout.write(`OK: ${report.totalDemos} demos / ${report.totalStates} states; ${report.browserReferenceStates} selected visual fixtures; no conversion approved\n`);
  } else if (flags.includes('--json')) {
    process.stdout.write(json);
  } else {
    process.stdout.write(`${report.totalDemos} Legacy demos / ${report.totalStates} states audited; ${report.browserReferenceStates} source states have browser-reference fixtures.\n`);
    for (const demo of report.demos) {
      const blocked = demo.states.filter(s => s.structuralStatus === 'blocked').length;
      const types = [...new Set(demo.states.flatMap(s => s.geometryTypes))].sort((a, b) => a - b);
      process.stdout.write(`${demo.demo}: ${blocked}/${demo.totalStates} schema-blocked; object types ${types.join(',')}; no automatic conversion\n`);
    }
  }
}

if (require.main === module) {
  try { main(process.argv); }
  catch (error) { console.error('Compatibility audit FAILED: ' + error.message); process.exitCode = 1; }
}
module.exports = {auditState, buildReport, extractAllDemoStates, fieldTargets, legacyOnlyReasons};

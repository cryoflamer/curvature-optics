#!/usr/bin/env node
'use strict';

// Node-only numerical regression capture for the literal Legacy demo states.
// The *original* model and barometer scripts run; only their presentation
// controls and vector dependency are replaced. This is not a rendering oracle.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const inputsPath = path.join(root, 'tests/fixtures/legacy-reference-scenarios.json');
const outputPath = path.join(root, 'tests/fixtures/legacy-headless-numerics.json');
const modelPath = 'src/app/CurvatureModel.js';
const atmospherePath = 'src/app/CurvatureAtmosphere.js';
const modelScript = new vm.Script(fs.readFileSync(path.join(root, modelPath), 'utf8'), {filename: modelPath});
const atmosphereScript = new vm.Script(fs.readFileSync(path.join(root, atmospherePath), 'utf8'), {filename: atmospherePath});
const NEAR_REL = 1e-12;
const NEAR_ABS = 1e-12;

const vectors = Object.freeze({
  Norm(a) { const n = Math.hypot(...a); return a.map(v => v / n); },
  Mult(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; },
  Scale(a, s) { return a.map(v => v*s); },
  Add(a, b) { return a.map((v, i) => v+b[i]); },
  ScalarProd(a, b) { return a.reduce((sum, v, i) => sum+v*b[i], 0); },
});

// CurvatureAtmosphere.js registers two control panels at top level. Their
// registration has no bearing on BaroConst/BaroModel numerics. Fail closed if
// the source begins to require a new UI method rather than silently skipping it.
function noOpPanel() {
  const panel = {};
  for (const name of ['AddSliderField', 'AddTextField', 'AddRadiobuttonField', 'AddHeader', 'Render']) {
    panel[name] = () => panel;
  }
  return panel;
}

function contextForState() {
  const panel = noOpPanel();
  const context = vm.createContext({
    JsgVect3: vectors,
    xDefNum: (value, fallback) => typeof value === 'number' ? value : fallback,
    ControlPanels: {NewPanel: () => panel, SmallButtonR: () => ''},
    UpdateAll() { throw new Error('UI update must not run in headless reference capture'); },
  });
  modelScript.runInContext(context, {timeout: 1000});
  vm.runInContext('CurveApp = new CurveAppClass()', context, {timeout: 1000});
  atmosphereScript.runInContext(context, {timeout: 1000});
  if (!context.CurveApp.BaroModel || context.CurveApp.BaroModel !== context.BaroModel) {
    throw new Error('Original Legacy BaroModel was not installed');
  }
  return context;
}

function validateState(state, metadata) {
  if (!state || typeof state !== 'object' || Array.isArray(state) || Object.getPrototypeOf(state) !== Object.prototype) {
    throw new TypeError('Legacy state must be a plain JSON object');
  }
  const fields = new Map(metadata.Properties.map(p => [p.Name, p]));
  for (const [key, value] of Object.entries(state)) {
    if (!fields.has(key)) throw new TypeError(`Unexpected Legacy field: ${key}`);
    const spec = fields.get(key);
    const validScalar = (v, kind) => kind === 'str' ? typeof v === 'string' && v.length <= 10000
      : kind === 'bool' ? typeof v === 'boolean'
      : kind === 'int' ? Number.isSafeInteger(v)
      : kind === 'num' ? typeof v === 'number' && Number.isFinite(v)
      : false;
    if (spec.Type === 'arr') {
      if (!Array.isArray(value) || value.length !== spec.Size || !value.every(v => validScalar(v, spec.ArrayType))) {
        throw new TypeError(`Invalid Legacy array: ${key}`);
      }
    } else if (!validScalar(value, spec.Type)) {
      throw new TypeError(`Invalid Legacy field value: ${key}`);
    }
  }
}

function finiteRecord(value, label = 'measurements') {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`Non-finite ${label}`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => finiteRecord(v, `${label}[${i}]`));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([k, v]) => finiteRecord(v, `${label}.${k}`));
  }
  return value;
}

function captureState(state) {
  const context = contextForState();
  validateState(state, context.CurveAppMetaData);
  // Copy only values admitted by CurveAppMetaData, following the legacy
  // JsonToAppState/AllStatesChanged + Update path. Do not execute state text.
  const input = JSON.parse(JSON.stringify(state));
  Object.assign(context.CurveApp, input);
  context.CurveApp.AllStatesChanged = true;
  vm.runInContext('CurveApp.Update()', context, {timeout: 1000});
  const m = context.CurveApp, b = m.BaroModel;
  return finiteRecord({
    refraction: {
      syncMode: m.refractionSync,
      k: m.refractionCoeff,
      radiusFactor: m.refractionFact,
      effectiveRadiusMetres: m.refractionRadius,
      temperatureC: m.temperatureC,
      pressureHpa: m.pressure,
      lapseRateKelvinPerMetre: m.tempGradient,
      standardAtmospherePressurePa: b.p,
      standardAtmosphereTemperatureKelvin: b.T,
    },
    horizon: {
      observerHeightMetres: m.Height,
      earthRadiusMetres: m.rEarth,
      geometryRadiusMetres: m.geometryRadius,
      dipRadians: m.aDip,
      horizonArcMetres: m.dHorizon,
      horizonLineOfSightMetres: m.dView,
      horizonRadiusMetres: m.rDisk,
      horizonRefractionAngleDegrees: m.HorizonRefrAng,
    },
    camera: {
      fieldOfViewDegrees: m.ViewAngle,
      panRadians: m.PanRad,
      viewCenter: Array.from(m.camViewCenter),
      up: Array.from(m.camUp),
      sceneSizeLegacyUnits: m.camSceneSize,
    },
    firstObject: {
      apparentAngularSizeDegrees: m.ObjAngSize,
      refractionAngleDegrees: m.ObjRefrAng,
      viewDistanceMetres: m.ObjViewDist,
      liftAbsoluteMetres: m.ObjLiftAbs,
      liftRelativeMetres: m.ObjLiftRel,
    },
  });
}

function captureFixtures(fixtures) {
  if (!fixtures || fixtures.schemaVersion !== 1 || !Array.isArray(fixtures.scenarios)) {
    throw new TypeError('Unsupported Legacy input fixture schema');
  }
  return {
    schemaVersion: 1,
    evidenceKind: 'same-code Legacy numerical regression snapshot; NOT independent physics, ray or pixel oracle',
    inputSource: 'tests/fixtures/legacy-reference-scenarios.json',
    runtimeSources: [modelPath, atmospherePath],
    relativeTolerance: NEAR_REL,
    absoluteTolerance: NEAR_ABS,
    samples: fixtures.scenarios.flatMap(scenario => scenario.samples.map(sample => ({
      demo: scenario.demo,
      sourceIndex: sample.sourceIndex,
      legacyQuery: sample.legacyQuery,
      observables: captureState(sample.state),
    }))),
  };
}

function compareCapture(actual, expected, location = 'capture') {
  if (typeof expected === 'number') {
    if (typeof actual !== 'number' || !Number.isFinite(actual) ||
        Math.abs(actual-expected) > NEAR_ABS + NEAR_REL * Math.max(Math.abs(actual), Math.abs(expected))) {
      throw new Error(`${location}: ${actual} differs from saved reference ${expected}`);
    }
  } else if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(expected) !== Array.isArray(actual) ||
        Object.keys(expected).length !== Object.keys(actual).length) {
      throw new Error(`${location}: measurement structure differs`);
    }
    for (const key of Object.keys(expected)) {
      if (!Object.hasOwn(actual, key)) throw new Error(`${location}.${key}: missing field`);
      compareCapture(actual[key], expected[key], `${location}.${key}`);
    }
  } else if (actual !== expected) {
    throw new Error(`${location}: metadata differs`);
  }
}

function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || !['--write', '--check'].includes(args[0])) {
    throw new Error('Usage: node tools/legacy-headless-reference.js --check | --write');
  }
  const sourceFixtures = JSON.parse(fs.readFileSync(inputsPath, 'utf8'));
  const current = captureFixtures(sourceFixtures);
  if (args[0] === '--write') {
    fs.writeFileSync(outputPath, JSON.stringify(current, null, 2) + '\n');
    console.log('Wrote tests/fixtures/legacy-headless-numerics.json');
  } else {
    const expected = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    compareCapture(current, expected);
    console.log(`OK: ${current.samples.length} Legacy numerical snapshots match saved regression reference`);
  }
}

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {captureState, captureFixtures, compareCapture, validateState, main};

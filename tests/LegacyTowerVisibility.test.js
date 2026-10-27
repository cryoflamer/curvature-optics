'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const html = require('./helpers/readCurvatureSources')();
const start = html.indexOf('function DrawShape( objIx, g, m ) {');
const end = html.indexOf('\nfunction PointOnEarth(', start);
assert(start >= 0 && end > start);
let visible = false, comparisonMode = 'both', captured = 0, lines = 0, polygons = 0;
const context = {
  document: {getElementById(id) {
    if (id === 'ShowLegacyTransmissionTowers') return {checked:visible};
    if (id === 'TowerComparisonMode') return {value:comparisonMode};
    return null;
  }},
  window: {CurvatureRenderedVertexAudit: {beginTower(g) {
    const underlying = g.PolygonOnPlane;
    g.PolygonOnPlane = function(...args) { captured++; return underlying.apply(this,args); };
    return () => {g.PolygonOnPlane = underlying;};
  }}},
  CurvatureRenderedVertexAudit: null,
};
context.CurvatureRenderedVertexAudit = context.window.CurvatureRenderedVertexAudit;
vm.createContext(context);
vm.runInContext(html.slice(start,end),context);
const m = {ObjType:[3,3],isHiddenObj:[false,false],showModel:1,opticsMode:'ray-tracing'};
for (const objIx of [0,1]) {
  lines = 0; polygons = 0;
  const g = {
    LineOnPlane() {lines++;}, PolygonOnPlane() {polygons++;},
    SetBgColor() {},
  };
  const originalLine = g.LineOnPlane, originalPolygon = g.PolygonOnPlane;
  visible = false;
  context.DrawShape(objIx,g,m);
  assert.strictEqual(g.LineOnPlane,originalLine);
  assert.strictEqual(g.PolygonOnPlane,originalPolygon);
  assert.equal(lines,0);
  assert.equal(polygons,0);
  assert(captured>0,'audit must still capture hidden tower polygons');
  visible = true;
  comparisonMode = 'optical';
  context.DrawShape(objIx,g,m);
  assert(polygons>0,'checked legacy towers must render even in optical comparison mode');
  assert.strictEqual(g.PolygonOnPlane,originalPolygon);
}
console.log('LegacyTowerVisibility: both groups hidden, visible in optical comparison mode, audit captures, methods restored');

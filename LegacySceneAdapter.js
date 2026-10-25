/* Phase 2: opt-in, lossless graph-command recorder for the legacy renderer.
 * Capture is a pass-through: it never changes the active drawing path.
 * Commands are captured at the JsGraph API boundary, before projection.
 * This is a graph command stream, not yet a CurvatureSceneContract 3D scene.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LegacySceneAdapter = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var VERSION = 1;
  var POLYGON_TAG = '__legacyGraphType';
  // Explicit allowlist: state-changing graph calls and drawing calls used by
  // DrawModel/DrawShape. More calls can be added after validating real traces.
  var METHODS = [
    'SetTrans3D','ResetTrans3D','SetTrans','ResetTrans',
    'SetClipping','SetGraphClipping','SetWindow','SetViewport','SetViewport3D',
    'SetLineAttr','SetAreaAttr','SetBgColor','SetColor','SetLineWidth',
    'SetTextAttr','SetTextColor','SetMarkerAttr','SetMarkerSymbol','SetMarkerSize',
    'LineOnPlane','PolygonOnPlane','Line3D','NewPoly3D',
    'AddPointToPoly3D','DrawPoly3D','VectList3D',
    'Line','DrawLine','DrawPolygon','DrawText','Text',
    'SetPlane','SetPlaneTrans','ResetPlaneTrans'
  ];
  function describe(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'Array';
    if (typeof value !== 'object') return typeof value;
    var proto = Object.getPrototypeOf(value);
    return proto && proto.constructor && proto.constructor.name || 'object (null prototype)';
  }
  function clone(value, path) {
    path = path || 'argument';
    if (Array.isArray(value)) return value.map(function (item, i) { return clone(item, path + '[' + i + ']'); });
    if (value && typeof value === 'object') {
      // JsgPolygon is a mutable, reusable graph work buffer. Snapshot only
      // its active vertices, not spare capacity or its prototype methods.
      if (describe(value) === 'JsgPolygon' &&
          Array.isArray(value.X) && Array.isArray(value.Y) &&
          (value.Z === null || Array.isArray(value.Z)) &&
          Number.isSafeInteger(value.Size) && value.Size >= 0 &&
          value.X.length >= value.Size && value.Y.length >= value.Size &&
          (value.Z === null || value.Z.length >= value.Size)) {
        return {__legacyGraphType:'JsgPolygon', Size:value.Size,
          X:clone(value.X.slice(0,value.Size),path+'.X'),
          Y:clone(value.Y.slice(0,value.Size),path+'.Y'),
          Z:value.Z === null ? null : clone(value.Z.slice(0,value.Size),path+'.Z')};
      }
      if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
        throw new TypeError('Unsupported non-plain graph argument at ' + path + ' (' + describe(value) + ')');
      var out = {};
      Object.keys(value).forEach(function (k) { out[k] = clone(value[k], path + '.' + k); });
      return out;
    }
    if (typeof value === 'function' || typeof value === 'symbol')
      throw new TypeError('Unsupported graph argument at ' + path + ' (' + describe(value) + ')');
    return value;
  }
  function revive(value, polygonCtor) {
    if (Array.isArray(value)) return value.map(function (v) { return revive(v, polygonCtor); });
    if (value && typeof value === 'object') {
      if (Object.prototype.hasOwnProperty.call(value, POLYGON_TAG)) {
        if (value[POLYGON_TAG] !== 'JsgPolygon' ||
            !Number.isSafeInteger(value.Size) || value.Size < 0 ||
            !Array.isArray(value.X) || !Array.isArray(value.Y) ||
            !(value.Z === null || Array.isArray(value.Z)) ||
            value.X.length !== value.Size || value.Y.length !== value.Size ||
            (value.Z !== null && value.Z.length !== value.Size))
          throw new TypeError('Invalid serialized JsgPolygon');
        if (typeof polygonCtor !== 'function')
          throw new TypeError('JsgPolygon constructor required for replay');
        var polygon = new polygonCtor(value.Z !== null);
        polygon.X = value.X.map(function (v) { return revive(v, polygonCtor); });
        polygon.Y = value.Y.map(function (v) { return revive(v, polygonCtor); });
        polygon.Z = value.Z === null ? null : value.Z.map(function (v) { return revive(v, polygonCtor); });
        polygon.Size = value.Size;
        return polygon;
      }
      var out = {};
      Object.keys(value).forEach(function (k) { out[k] = revive(value[k], polygonCtor); });
      return out;
    }
    return value;
  }
  function record(graph, draw, options) {
    if (!graph || typeof graph !== 'object' || typeof draw !== 'function')
      throw new TypeError('A graph and drawing callback are required');
    options = options || {};
    var commands = [], saved = [], depth = 0, unsupported = [];
    var methods = options.methods || METHODS;
    if (!Array.isArray(methods)) throw new TypeError('methods must be an array');
    try {
      methods.forEach(function (name) {
        if (typeof graph[name] !== 'function') return;
        var own = Object.prototype.hasOwnProperty.call(graph, name);
        var original = graph[name];
        saved.push({name:name, own:own, value:original});
        graph[name] = function () {
          // Avoid duplicate recording when a graph method invokes another
          // wrapped graph method internally. The outer call is replayable.
          if (depth === 0) {
            try {
              commands.push({method:name,args:clone(Array.prototype.slice.call(arguments), 'args')});
            } catch (error) {
              if (!options.diagnostic) throw new TypeError(name + ': ' + error.message);
              unsupported.push({method:name, message:error.message});
            }
          }
          depth++;
          try { return original.apply(this, arguments); }
          finally { depth--; }
        };
      });
      draw(graph);
    } finally {
      for (var i=saved.length-1;i>=0;i--) {
        var item=saved[i];
        if (item.own) graph[item.name]=item.value;
        else delete graph[item.name];
      }
    }
    return {version:VERSION, kind:'legacy-graph-commands', commands:commands, unsupported:unsupported, complete:unsupported.length===0};
  }
  function replay(graph, trace, options) {
    if (!graph || !trace || trace.version !== VERSION || trace.kind !== 'legacy-graph-commands' || !Array.isArray(trace.commands))
      throw new TypeError('Invalid legacy command trace');
    var polygonCtor = options && options.JsgPolygon || (typeof globalThis !== 'undefined' && globalThis.JsgPolygon);
    trace.commands.forEach(function (command) {
      if (!command || METHODS.indexOf(command.method) < 0 || !Array.isArray(command.args) || typeof graph[command.method] !== 'function')
        throw new TypeError('Unsupported graph command');
      graph[command.method].apply(graph, revive(clone(command.args), polygonCtor));
    });
    return graph;
  }
  return {VERSION:VERSION, METHODS:METHODS.slice(), record:record, replay:replay};
}));

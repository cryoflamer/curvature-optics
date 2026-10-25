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
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') {
      if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
        throw new TypeError('Unsupported non-plain graph argument');
      var out = {};
      Object.keys(value).forEach(function (k) { out[k] = clone(value[k]); });
      return out;
    }
    if (typeof value === 'function' || typeof value === 'symbol')
      throw new TypeError('Unsupported graph argument');
    return value;
  }
  function record(graph, draw, options) {
    if (!graph || typeof graph !== 'object' || typeof draw !== 'function')
      throw new TypeError('A graph and drawing callback are required');
    options = options || {};
    var commands = [], saved = [], depth = 0;
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
          if (depth === 0) commands.push({method:name,args:clone(Array.prototype.slice.call(arguments))});
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
    return {version:VERSION, kind:'legacy-graph-commands', commands:commands};
  }
  function replay(graph, trace) {
    if (!graph || !trace || trace.version !== VERSION || trace.kind !== 'legacy-graph-commands' || !Array.isArray(trace.commands))
      throw new TypeError('Invalid legacy command trace');
    trace.commands.forEach(function (command) {
      if (!command || METHODS.indexOf(command.method) < 0 || !Array.isArray(command.args) || typeof graph[command.method] !== 'function')
        throw new TypeError('Unsupported graph command');
      graph[command.method].apply(graph, clone(command.args));
    });
    return graph;
  }
  return {VERSION:VERSION, METHODS:METHODS.slice(), record:record, replay:replay};
}));

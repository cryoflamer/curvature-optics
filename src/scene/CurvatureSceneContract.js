/* Shared, renderer-independent scene contract (phase 1).
 * This module is deliberately passive: the existing drawing pipeline remains
 * the reference until the legacy adapter has been validated pixel-for-pixel.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CurvatureSceneContract = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var VERSION = 1;
  function finite(n) { return typeof n === 'number' && Number.isFinite(n); }
  function vec3(p) { return Array.isArray(p) && p.length === 3 && p.every(finite); }
  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (value && typeof value === 'object') {
      var result = {};
      Object.keys(value).forEach(function (key) { result[key] = copy(value[key]); });
      return result;
    }
    return value;
  }
  var STATE_FIELDS = ['showModel','geometryRadius','Height','Pan','Nick','Roll',
    'camPos','camUp','camViewCenter','camSceneSize','ObjDist','ObjDeltaDist',
    'ObjSidePos','ObjSize','ObjSizeType','ObjSizeVar','NObjects',
    'showEyeLevel','rDisk','hDip','Refraction','TempGradient'];
  function state(model) {
    if (!model || typeof model !== 'object') throw new TypeError('Scene model is required');
    // Preserve original model field names and values: do not derive refraction
    // or effective curvature here, and do not mutate the live CurveApp model.
    var values = {};
    STATE_FIELDS.forEach(function (name) {
      if (Object.prototype.hasOwnProperty.call(model, name)) values[name] = copy(model[name]);
    });
    return {version: VERSION, values: values};
  }
  function scene(source, primitives, metadata, adoptOwned) {
    if (source !== 'legacy' && source !== 'optical-p4') throw new TypeError('Unknown scene source');
    if (!Array.isArray(primitives)) throw new TypeError('Scene primitives must be an array');
    // Both entrypoints validate the same geometry. The default public path
    // makes a deep defensive copy; the explicit ownership-transfer path is
    // reserved for a renderer that *just created* its private primitives.
    var result = adoptOwned ? primitives : [];
    primitives.forEach(function (p) {
      if (!p || typeof p !== 'object') throw new TypeError('Invalid scene primitive');
      if (p.type !== 'line' && p.type !== 'polygon') throw new TypeError('Unknown primitive type');
      if (!Array.isArray(p.points) || p.points.length < (p.type === 'line' ? 2 : 3))
        throw new TypeError('Invalid 3D primitive points');
      if (p.type === 'line' && p.points.length !== 2) throw new TypeError('Line needs two points');
      if (p.mode !== undefined && !Number.isInteger(p.mode)) throw new TypeError('Invalid draw mode');
      if (p.visible !== undefined && typeof p.visible !== 'boolean') throw new TypeError('Invalid visibility');
      // Trusted adapters can hand over sole ownership of freshly generated
      // projected primitives. Validate the same geometry either way; only
      // the public defensive-copy entrypoint duplicates all nested arrays.
      var points = adoptOwned ? null : new Array(p.points.length);
      for (var i = 0; i < p.points.length; i++) {
        var point = p.points[i];
        if (!vec3(point)) throw new TypeError('Invalid 3D primitive points');
        if (!adoptOwned) points[i] = point.slice();
      }
      if (!adoptOwned) {
        var cloned = {};
        Object.keys(p).forEach(function (key) {
          cloned[key] = key === 'points' ? points : copy(p[key]);
        });
        result.push(cloned);
      }
    });
    return {version: VERSION, source: source, primitives: result, metadata: copy(metadata || {})};
  }
  // Only for adapters that create and exclusively own all primitive objects,
  // point arrays, styles and metadata. The caller MUST NOT retain or mutate
  // those objects after adoption. External callers use createScene(), which
  // keeps its historical deep-copy isolation and identical validation.
  function createScene(source, primitives, metadata) {
    return scene(source, primitives, metadata, false);
  }
  function adoptScene(source, ownedPrimitives, metadata) {
    return scene(source, ownedPrimitives, metadata, true);
  }
  return {VERSION: VERSION, STATE_FIELDS: STATE_FIELDS.slice(), captureState: state,
    createScene: createScene, adoptScene: adoptScene};
}));

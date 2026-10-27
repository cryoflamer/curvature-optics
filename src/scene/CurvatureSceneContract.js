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
  function scene(source, primitives, metadata) {
    if (source !== 'legacy' && source !== 'optical-p4') throw new TypeError('Unknown scene source');
    if (!Array.isArray(primitives)) throw new TypeError('Scene primitives must be an array');
    var result = primitives.map(function (p) {
      if (!p || typeof p !== 'object') throw new TypeError('Invalid scene primitive');
      if (p.type !== 'line' && p.type !== 'polygon') throw new TypeError('Unknown primitive type');
      if (!Array.isArray(p.points) || p.points.length < (p.type === 'line' ? 2 : 3) ||
          !p.points.every(vec3)) throw new TypeError('Invalid 3D primitive points');
      if (p.type === 'line' && p.points.length !== 2) throw new TypeError('Line needs two points');
      if (p.mode !== undefined && !Number.isInteger(p.mode)) throw new TypeError('Invalid draw mode');
      if (p.visible !== undefined && typeof p.visible !== 'boolean') throw new TypeError('Invalid visibility');
      return copy(p);
    });
    return {version: VERSION, source: source, primitives: result, metadata: copy(metadata || {})};
  }
  return {VERSION: VERSION, STATE_FIELDS: STATE_FIELDS.slice(), captureState: state, createScene: scene};
}));

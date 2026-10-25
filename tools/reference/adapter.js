'use strict';
// Independent forward solver, copied unchanged from the supplied 20261025-0737 simulator pack.
const original = require('./original-solver');
exports.solveAngle = function (options) {
  if (options.geometry !== 'globe' || options.radius !== original.R || options.observerHeight <= 0)
    throw Error('Reference adapter requires globe, R=6371000 m and positive observer height');
  if (options.atmosphere !== 'standard' && options.atmosphere !== 'vacuum')
    throw Error('Unsupported reference atmosphere');
  const s = { geometry: 'sphere', profile: options.atmosphere,
    ho: options.observerHeight, L: options.distance, ht: options.targetHeight,
    fov: 0.02 };
  const result = original.shootForHeight(s, options.targetHeight);
  // Original solver reports no visible ray for both occlusion and nonconvergence.
  // Do not invent a more specific classification.
  return result.visible
    ? { status: 'visible', angle: result.angle }
    : { status: 'no solution', angle: null };
};

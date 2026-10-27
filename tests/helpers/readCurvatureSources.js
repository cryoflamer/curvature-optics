'use strict';

// Source inspection compatibility for the migration tests. The entry HTML
// intentionally no longer embeds JavaScript. Read its actual source files
// instead of checking a stale copy of the pre-extraction HTML.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');

module.exports = function readCurvatureSources() {
  const html = fs.readFileSync(path.join(root, 'CurvatureApp.html'), 'latin1');
  const read = file => fs.readFileSync(path.join(root, file), 'latin1');
  // Keep DrawModel and its helper functions contiguous: several existing
  // geometry tests extract these functions to execute them in a VM.
  const sources = [
    'src/app/CurvatureModel.js',
    'src/diagnostics/CurvatureLegacyFrameCaptureController.js',
    'src/app/CurvatureAppRuntime.js',
    'src/legacy/CurvatureLegacyDrawing.js',
    'src/animation/CurvatureAnimations.js',
    'src/animation/CurvatureDemos.js',
    'src/app/CurvatureAtmosphere.js',
    'src/app/CurvatureStatePersistence.js',
    'src/ui/LengthCalculator.js'
  ];
  return html + '\n' + sources.map(read).join('\n');
};

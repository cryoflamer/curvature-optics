/* Backend selection scaffold. Patch 01 does not change optical calculations. */
(function (root) {
  'use strict';
  var modes = { 'legacy-k': true, 'ray-tracing': true };
  var profiles = { vacuum: true, standard: true, custom: true };

  function sync() {
    if (typeof CurveApp === 'undefined') return;
    if (!modes[CurveApp.opticsMode]) CurveApp.opticsMode = 'legacy-k';
    if (!profiles[CurveApp.opticsProfile]) CurveApp.opticsProfile = 'standard';
    var mode = document.getElementById('OpticsModeSelect');
    var profile = document.getElementById('OpticsProfileSelect');
    var status = document.getElementById('OpticsBackendStatus');
    if (!mode || !profile || !status) return;
    mode.value = CurveApp.opticsMode;
    profile.value = CurveApp.opticsProfile;
    profile.disabled = CurveApp.opticsMode === 'legacy-k';
    status.textContent = CurveApp.opticsMode === 'legacy-k'
      ? 'Active: original Bislin k-based renderer. Profile selection is saved but not used.'
      : 'Preview only: n(h) tracing is not implemented yet. The scene still uses the original k-based renderer.';
  }

  function bind() {
    var mode = document.getElementById('OpticsModeSelect');
    var profile = document.getElementById('OpticsProfileSelect');
    if (!mode || !profile) return;
    mode.addEventListener('change', function () {
      CurveApp.opticsMode = mode.value;
      sync();
    });
    profile.addEventListener('change', function () {
      CurveApp.opticsProfile = profile.value;
      sync();
    });
    sync();
  }

  root.CurvatureOpticsUI = { sync: sync };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
}(window));

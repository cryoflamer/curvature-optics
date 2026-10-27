
    // One-click reproducible visual setup; no external browser automation.
    function RunOpticsTestPreset(flat) {
      var status = document.getElementById(flat ? 'OpticsComparisonStatus' : 'OpticsTestPresetStatus');
      try {
        if (typeof Demos === 'undefined' || typeof CurveApp === 'undefined' ||
            typeof UpdateAll !== 'function' || !window.CurvatureInverseOpticsBridge)
          throw Error('Application or optics bridge is not initialized');
        opticalPresetRunning = true;
        CancelOpticalP4Refresh();
        Demos.SetDemo('TransLine', false, 0);
        // Override the demo's introductory camera with a stable test viewpoint.
        CurveApp.opticsMode = 'ray-tracing';
        CurveApp.opticsProfile = 'standard';
        CurveApp.showModel = flat ? 2 : 1;
        CurveApp.Height = 15;
        // Start with a safe lens; the tower is fitted from captured vertices below.
        CurveApp.FocalLengthField = 1600;
        CurveApp.Pan = 0;
        CurveApp.Nick = 0;
        CurveApp.Roll = 0;
        CurveApp.ObjSidePos[0] = 35;
        CurveApp.ObjSidePos[1] = 25.4;
        document.getElementById('TowerDiagnosticGeometry').value = flat ? 'flat' : 'globe';
        document.getElementById('TowerDiagnosticAtmosphere').value = 'vacuum';
        document.getElementById('TowerOverlayEnabled').checked = false;
        document.getElementById('TowerOverlayVacuumOnly').checked = true;
        document.getElementById('TowerOverlayDisplay').value = 'crosses';
        // The preset owns the initial state, not subsequent user changes.
        document.getElementById('TowerComparisonMode').value = 'optical';
        document.getElementById('OpticsSceneComparison').value = 'optical';
        document.getElementById('InverseVacuumTower21').checked = false;
        document.getElementById('InverseAtmosphereLineMode').value = 'all';
        document.getElementById('InverseAtmosphereLineQuality').value = 'p4';
        document.getElementById('InverseAtmosphereLineCountLabel').style.display = 'none';
        document.getElementById('InverseAtmosphereLineShow').checked = false;
        document.getElementById('ShowLegacyTransmissionTowers').checked = false;
        document.getElementById('ShowP4OpticalHorizon').checked = !flat;
        document.getElementById('ShowP4VacuumHorizon').checked = false;
        // Do not turn on the optical scene until the new all-tower P4 result
        // is ready: the normal change handler rejects incomplete data.
        document.getElementById('OpticalSceneTowers').checked = false;
        UpdateAll(false);
        var framing = FrameOpticsTestTower21(Number(document.getElementById('OpticsFocusTower').value)||21);
        status.textContent = (flat ? 'Flat Earth: ' : '') + framing + '; calculating all 85 towers (P4)...';
        document.getElementById('InverseAtmosphereLine').click();
        // The asynchronous calculation's completion callback is responsible
        // for enabling the scene, not the click handler itself.
        var bridge = window.CurvatureInverseOpticsBridge;
        var pollResult = function () {
          var result = bridge.getLineAtmosphere();
          if (result.state === 'ready' && bridge.hasCompleteP4Line(CurveApp)) {
            var scene = document.getElementById('OpticalSceneTowers');
            scene.checked = true;
            scene.dispatchEvent(new Event('change'));
            document.getElementById('InverseAtmosphereLineShow').checked = false;
            SetOpticsSceneComparison(document.getElementById('OpticsSceneComparison').value);
            status.textContent = (flat ? 'Flat Earth: ' : '') + framing + '; optical scene ready (' + result.towers + ' towers)';
          } else if (result.state === 'error') {
            status.textContent = 'Optics Test failed: ' + result.message;
          } else if (result.state === 'working') {
            setTimeout(pollResult, 25);
          } else {
            status.textContent = 'Optics Test: P4 result not available';
          }
        };
        pollResult();
      } catch (err) {
        status.textContent = 'Optics Test failed: ' + err.message;
        console.error('Optics Test preset:', err);
      } finally {
        opticalPresetRunning = false;
      }
    }
    document.getElementById('OpticsTestPreset').addEventListener('click', function () { RunOpticsTestPreset(false); });
    document.getElementById('FlatP4TestPreset').addEventListener('click', function () { RunOpticsTestPreset(true); });

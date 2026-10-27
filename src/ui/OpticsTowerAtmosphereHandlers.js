
    document.getElementById('InverseAtmosphereTower21').addEventListener('click', function () {
      var status = document.getElementById('InverseAtmosphereTower21Status');
      var bridge = window.CurvatureInverseOpticsBridge;
      var audit = window.CurvatureRenderedVertexAudit;
      var solver = window.CurvatureTowerDiagnostics;
      if (!bridge || !audit || !solver || typeof CurveApp === 'undefined') {
        status.textContent = 'Missing optics modules'; return;
      }
      if (CurveApp.opticsMode !== 'ray-tracing' || CurveApp.showModel !== 1) {
        status.textContent = 'Select Globe / ray tracing and TrnsmLine'; return;
      }
      status.textContent = 'Computing...';
      bridge.calculateAtmosphere21(CurveApp, audit, solver,
        function (message) { status.textContent = message; },
        function (result) {
          status.textContent = result.message;
          if (result.state === 'ready') graph.Redraw();
        });
    });


    // The original ControlPanels sliders call UpdateAll().  Keep the existing
    // camera redraw path, but recompute the expensive P4 cache only when its
    // physical geometry changes.  This also covers text fields and model tabs.
    var opticalRefreshTimer = null;
    var opticalRefreshToken = 0;
    var opticalRefreshKey = null;
    var opticalPresetRunning = false;
    function OpticalP4InputKey(m) {
      return [m.showModel,m.rEarth,m.Height,m.ObjDist[0],m.ObjDeltaDist[0],
        m.ObjSize[0],m.ObjSidePos[0],m.NObjects[0]].join('|');
    }
    function CancelOpticalP4Refresh() {
      ++opticalRefreshToken;
      if (opticalRefreshTimer !== null) clearTimeout(opticalRefreshTimer);
      opticalRefreshTimer = null;
      opticalRefreshKey = null;
    }
    function ScheduleOpticalP4Refresh() {
      var bridge=window.CurvatureInverseOpticsBridge;
      var selector=document.getElementById('OpticsSceneComparison');
      if (opticalPresetRunning || !bridge || !selector || selector.value==='original' ||
          CurveApp.opticsMode!=='ray-tracing' ||
          (CurveApp.showModel!==1 && CurveApp.showModel!==2)) return;
      var key=OpticalP4InputKey(CurveApp);
      var current=bridge.getLineAtmosphere();
      var status=document.getElementById('OpticsComparisonStatus');
      if (bridge.hasCompleteP4Line(CurveApp)) {
        if (opticalRefreshTimer!==null) clearTimeout(opticalRefreshTimer);
        opticalRefreshTimer=null;
        opticalRefreshKey=key;
        status.textContent='';
        return;
      }
      // The one-click preset and manual diagnostics already own their solver.
      // Never replace an in-flight calculation for the same physical model.
      if (current.state==='working' && current.key===key) {
        if (opticalRefreshTimer!==null) clearTimeout(opticalRefreshTimer);
        opticalRefreshTimer=null;
        opticalRefreshKey=key;
        status.textContent='Calculating Optical P4...';
        return;
      }
      if (key===opticalRefreshKey && opticalRefreshTimer!==null) return;
      opticalRefreshKey=key;
      var token=++opticalRefreshToken;
      if (opticalRefreshTimer!==null) clearTimeout(opticalRefreshTimer);
      status.textContent='Updating Optical P4...';
      opticalRefreshTimer=setTimeout(function(){
        opticalRefreshTimer=null;
        if(token!==opticalRefreshToken || selector.value==='original' || opticalPresetRunning) return;
        if(bridge.hasCompleteP4Line(CurveApp)) {status.textContent='';return;}
        var active=bridge.getLineAtmosphere();
        if(active.state==='working' && active.key===key) {
          status.textContent='Calculating Optical P4...';return;
        }
        var diagnostic=document.getElementById('InverseAtmosphereLineStatus');
        try {
          // UpdateAll has already redrawn and captured the current vertices.
          // A second redraw here could recursively invalidate the capture.
          bridge.calculateAtmosphereLine(CurveApp,window.CurvatureRenderedVertexAudit,
            window.CurvatureTowerDiagnostics,
            function(message){if(token===opticalRefreshToken)diagnostic.textContent=message;},
            function(result){
              if(token!==opticalRefreshToken) return;
              diagnostic.textContent=result.message;
              if(result.state==='ready' && bridge.hasCompleteP4Line(CurveApp)) {
                document.getElementById('OpticalSceneTowers').checked=true;
                document.getElementById('ShowLegacyTransmissionTowers').checked=selector.value==='both';
                document.getElementById('InverseAtmosphereLineShow').checked=false;
                status.textContent='Optical P4 updated';
                graph.Redraw();
              } else {
                status.textContent='Optical P4: '+result.message;
              }
            },{mode:'all',quality:'p4'});
        } catch(err) {
          status.textContent='Optical P4 failed: '+err.message;
          console.error('Optical P4 refresh:',err);
        }
      },180);
    }
    // Switch visibility only; keep camera, atmosphere and P4 cache unchanged.
    function SetOpticsSceneComparison(mode) {
      var bridge=window.CurvatureInverseOpticsBridge;
      var status=document.getElementById('OpticsComparisonStatus');
      document.getElementById('OpticsSceneComparison').value=mode;
      if(mode==='original') { CancelOpticalP4Refresh(); status.textContent=''; }
      else if(!bridge||!bridge.hasCompleteP4Line(CurveApp)) ScheduleOpticalP4Refresh();
      else status.textContent='';
      document.getElementById('OpticalSceneTowers').checked=mode!=='original';
      document.getElementById('ShowLegacyTransmissionTowers').checked=mode!=='optical';
      document.getElementById('InverseAtmosphereLineShow').checked=false;
      document.getElementById('TowerComparisonMode').value=mode;
      graph.Redraw();
    }
    document.getElementById('OpticsSceneComparison').addEventListener('change',function(){
      SetOpticsSceneComparison(this.value);
    });
    document.getElementById('OpticsFocusTowerButton').addEventListener('click',function(){
      var index=Number(document.getElementById('OpticsFocusTower').value);
      var status=document.getElementById('OpticsComparisonStatus');
      if(!Number.isInteger(index)||index<1||index>CurveApp.NObjects[0]) {
        status.textContent='Choose tower 1..'+CurveApp.NObjects[0];return;
      }
      try {status.textContent=FrameOpticsTestTower21(index);}
      catch(err){status.textContent=err.message;}
    });


    document.getElementById('InverseAtmosphereLineMode').addEventListener('change',function(){
      document.getElementById('InverseAtmosphereLineCountLabel').style.display=this.value==='sample'?'':'none';
    });
    document.getElementById('InverseAtmosphereLine').addEventListener('click',function(){
      var status=document.getElementById('InverseAtmosphereLineStatus');
      var bridge=window.CurvatureInverseOpticsBridge;
      if (!bridge || !window.CurvatureRenderedVertexAudit || !window.CurvatureTowerDiagnostics ||
          typeof CurveApp==='undefined') { status.textContent='Missing optics modules';return; }
      if (CurveApp.opticsMode!=='ray-tracing' || (CurveApp.showModel!==1 && CurveApp.showModel!==2)) {
        status.textContent='Select Globe or Flat / ray tracing first';return;
      }
      status.textContent='Computing...';
      var mode=document.getElementById('InverseAtmosphereLineMode').value;
      var count=Number(document.getElementById('InverseAtmosphereLineCount').value);
      bridge.calculateAtmosphereLine(CurveApp,CurvatureRenderedVertexAudit,
        CurvatureTowerDiagnostics,function(message){status.textContent=message;},
        function(result){
          status.textContent=result.message;
          if(result.state==='ready') {
            // Optical-scene preset deliberately avoids a duplicate orange overlay.
            document.getElementById('InverseAtmosphereLineShow').checked=
              !document.getElementById('OpticalSceneTowers').checked;
            graph.Redraw();
          }
        },{mode:mode,count:count,quality:document.getElementById("InverseAtmosphereLineQuality").value});
    });
    document.getElementById('InverseAtmosphereLineShow').addEventListener('change',function(){graph.Redraw();});
    document.getElementById('ShowLegacyTransmissionTowers').addEventListener('change',function(){
      document.getElementById('OpticsSceneComparison').value=document.getElementById('OpticalSceneTowers').checked?(this.checked?'both':'optical'):'original';
      graph.Redraw();
    });
    document.getElementById('OpticalFootingHorizonMask').addEventListener('change',function(){graph.Redraw();});
    document.getElementById('ShowP4OpticalHorizon').addEventListener('change',function(){graph.Redraw();});
    document.getElementById('ShowP4VacuumHorizon').addEventListener('change',function(){graph.Redraw();});
    document.getElementById('OpticalSceneTowers').addEventListener('change',function(){
      var bridge=window.CurvatureInverseOpticsBridge;
      if(this.checked && (!bridge || !bridge.hasCompleteP4Line(CurveApp))) {
        this.checked=false;
        document.getElementById('OpticalSceneTowersStatus').textContent=
          'Calculate all towers using Analytic P4 first';
      } else {
        document.getElementById('OpticalSceneTowersStatus').textContent='';
        // Preserve the old replace behavior on activation; users can opt
        // back into both layers with the independent legacy checkbox.
        if (this.checked) document.getElementById('ShowLegacyTransmissionTowers').checked=false;
      }
      document.getElementById('OpticsSceneComparison').value=this.checked?(document.getElementById('ShowLegacyTransmissionTowers').checked?'both':'optical'):'original';
      graph.Redraw();
    });

var CurveApp = new CurveAppClass();
var UpdateAllRunning = false;

function UpdateAll( stopAnimation ) {
  if (UpdateAllRunning) return;
  UpdateAllRunning = true;
  try {
    stopAnimation = xDefBool( stopAnimation, true );
    if (stopAnimation) {
      Demos.Reset();
      CurveApp.DemoText = '';
      CurveApp.Description = '';
      ShowMoreInfos();
    }
    CurveApp.Update();
    if (window.CurvatureOpticsUI) CurvatureOpticsUI.sync();
    ControlPanels.Update();
    graph.Redraw();
    if (typeof ScheduleOpticalP4Refresh === 'function') ScheduleOpticalP4Refresh();
  }
  finally {
    UpdateAllRunning = false;
  }
}

xOnLoad(
  function() {
    HandleUrlCommands();
    UpdateAll( false );
  }
);

var graph = NewGraphX3D( {
  Id: 'JsGraph1',
  Width: '100%',
  Height: '66.67%',
  DrawFunc: DrawModelWithOptionalAudit,
  OnClick: function(e){ Demos.PlayStop(); },
  AutoReset: true,
  AutoClear: true,
  AutoScalePix: true
} );

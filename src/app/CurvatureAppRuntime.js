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

// Keep one-shot legacy diagnostics on their original DrawModel capture path.
// Never let the preview replace geometry exports, and do not conflate the
// independent Canvas engine with the separate Optical P4 comparison selector.
function DrawMainCanvasFrame(g) {
  var selector = document.getElementById('MainCanvasRenderer');
  var status = document.getElementById('MainCanvasRendererStatus');
  var independent = window.CurvatureMainCanvasRenderer;
  if (!selector || selector.value !== 'independent' || !independent ||
      legacyFrameAuditRequested || legacyFrameAuditInProgress) {
    if (status && (!selector || selector.value === 'legacy')) status.textContent = '';
    return DrawModelWithOptionalAudit(g);
  }
  var availability = independent.support(CurveApp);
  if (!availability.supported) {
    if (status) status.textContent = availability.reason;
    return DrawModelWithOptionalAudit(g);
  }
  try {
    var result = independent.render(g, CurveApp);
    if (status) status.textContent = result.warning;
  } catch (error) {
    if (status) status.textContent = 'Independent failed; Legacy restored: ' + error.message;
    console.error('Independent main Canvas render:', error);
    // On failure, avoid leaving behind a partly rendered preview.
    g.Reset(true);
    return DrawModelWithOptionalAudit(g);
  }
}

var graph = NewGraphX3D( {
  Id: 'JsGraph1',
  Width: '100%',
  Height: '66.67%',
  DrawFunc: DrawMainCanvasFrame,
  OnClick: function(e){ Demos.PlayStop(); },
  AutoReset: true,
  AutoClear: true,
  AutoScalePix: true
} );

var mainCanvasRendererSelect = document.getElementById('MainCanvasRenderer');
if (mainCanvasRendererSelect) mainCanvasRendererSelect.addEventListener('change', function() {
  graph.Redraw();
});

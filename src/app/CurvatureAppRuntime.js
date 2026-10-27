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
  if (!selector || (selector.value !== 'independent' && selector.value !== 'physical') || !independent ||
      legacyFrameAuditRequested || legacyFrameAuditInProgress) {
    if (status && (!selector || selector.value === 'legacy')) status.textContent = '';
    return DrawModelWithOptionalAudit(g);
  }
  var physicalMode = selector.value === 'physical';
  var availability = physicalMode ? independent.supportPhysical(CurveApp) : independent.support(CurveApp);
  if (!availability.supported) {
    if (status) status.textContent = availability.reason;
    return DrawModelWithOptionalAudit(g);
  }
  try {
    var result;
    if (physicalMode) {
      var atmosphere = document.getElementById('PhysicalCanvasAtmosphere');
      var radius = document.getElementById('PhysicalCanvasOcclusionRadius');
      result = independent.renderPhysical(g, CurveApp, {
        atmosphere:atmosphere ? atmosphere.value : 'vacuum',
        occlusionRadius:radius ? Number(radius.value) : 6371000
      });
      if (status) {
        var reasons=result.unresolvedReasons||{},samples=result.sampleStatuses||{};
        var failure=(samples.solver_failed||0)+(samples.indeterminate||0);
        var pieces=[];
        pieces.push(result.drawn+' lines (visible outline pieces)');
        pieces.push(result.unresolved+' unresolved ('+
          (reasons['visibility-boundary']||0)+' horizon/boundary, '+
          (reasons['optical-solver']||0)+' solver, '+
          (reasons['sample-budget']||0)+' sample-budget, '+
          (reasons['grazing-uncertainty']||0)+' grazing)');
        pieces.push(failure+' uncertain/failed point evaluations');
        pieces.push(result.cacheReused?'optical geometry cached':'optical geometry '+result.buildMs+' ms');
        if(result.step)pieces.push('RK4 step '+Math.round(result.step)+' m');
        if(result.fieldStats)pieces.push(result.fieldStats.solves+' exact ray solves');
        status.textContent=(result.budgetExceeded?'PARTIAL (time budget): ':failure?'CHECK SOLVER: ':result.unresolved?'BOUNDARY UNCERTAINTY: ':'')+
          pieces.join(' · ')+'. Geometric horizon/grid guides; fills pending.';
      }
    } else {
      result = independent.render(g, CurveApp);
      if (status) status.textContent = result.warning;
    }
  } catch (error) {
    if (status) status.textContent = (physicalMode ? 'Physical' : 'Independent') + ' failed; Legacy restored: ' + error.message;
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

function RefreshPhysicalCanvasControls(){
  var selector=document.getElementById('MainCanvasRenderer');
  var physical=selector&&selector.value==='physical';
  var controls=document.getElementById('PhysicalCanvasControls');
  if(controls&&controls.style)controls.style.display=physical?'flex':'none';
  var atmosphere=document.getElementById('PhysicalCanvasAtmosphere');
  var kind=atmosphere?atmosphere.value:'vacuum';
  var engineered=kind==='inverse-spherical'||kind==='exponential-occlusion';
  var r=document.getElementById('PhysicalCanvasOcclusionWrap');
  if(r&&r.style)r.style.display=engineered?'':'none';
  var help=document.getElementById('PhysicalCanvasProfileHelp');
  if(help)help.textContent=kind==='vacuum'?'Straight rays; no atmospheric refraction.':
    kind==='standard'?'Exponential near-surface refractivity; comparison R does not apply.':
    'Flat engineered profile: R controls the comparison horizon, not the Globe radius.';
}
RefreshPhysicalCanvasControls();
['PhysicalCanvasAtmosphere','PhysicalCanvasOcclusionRadius'].forEach(function(id){
  var control=document.getElementById(id);
  if(control)control.addEventListener('change',function(){RefreshPhysicalCanvasControls();graph.Redraw();});
});
var mainCanvasRendererSelect = document.getElementById('MainCanvasRenderer');
if (mainCanvasRendererSelect) mainCanvasRendererSelect.addEventListener('change', function() {
  RefreshPhysicalCanvasControls();
  graph.Redraw();
});

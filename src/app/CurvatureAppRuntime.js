var CurveApp = new CurveAppClass();
var UpdateAllRunning = false;
// This flag affects only temporary ground-guide presentation, never optics or
// tower visibility. After the last change the complete frame is restored.
var physicalCanvasInteractive = false;
var physicalCanvasSettleTimer = null;
// Only changes to the observer height debounce the expensive RK4 cold build.
// A pending height never triggers an incorrect/approximate Physical scene.
var physicalCanvasPreviousHeight = null;
var physicalHeightScheduler120 = null;
function QueuePhysicalHeightChange(){
  if(!physicalHeightScheduler120&&window.CurvatureHeightChangeScheduler120){
    physicalHeightScheduler120=CurvatureHeightChangeScheduler120.create(
      setTimeout,clearTimeout,function(){
        var selector=document.getElementById('MainCanvasRenderer');
        if(!selector||selector.value!=='physical')return;
        physicalCanvasInteractive=false;
        graph.Redraw();
      },150);
  }
  if(!physicalHeightScheduler120)return false;
  physicalCanvasInteractive=false;
  if(physicalCanvasSettleTimer!==null){
    clearTimeout(physicalCanvasSettleTimer);physicalCanvasSettleTimer=null;
  }
  if(physicalCanvasFrameScheduler)physicalCanvasFrameScheduler.cancel();
  physicalHeightScheduler120.schedule();
  var status=document.getElementById('MainCanvasRendererStatus');
  if(status)status.textContent='HEIGHT CHANGING: exact Physical optics pending; previous image is shown until the latest height is solved.';
  return true;
}

function SchedulePhysicalCanvasFinalFrame(){
  var selector=document.getElementById('MainCanvasRenderer');
  if(!selector||selector.value!=='physical')return;
  physicalCanvasInteractive=true;
  if(physicalCanvasSettleTimer!==null)clearTimeout(physicalCanvasSettleTimer);
  physicalCanvasSettleTimer=setTimeout(function(){
    physicalCanvasSettleTimer=null;
    physicalCanvasInteractive=false;
    graph.Redraw();
  },180);
}


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
    var currentHeight=CurveApp.Height;
    var changedHeight=physicalCanvasPreviousHeight!==null&&
      currentHeight!==physicalCanvasPreviousHeight;
    physicalCanvasPreviousHeight=currentHeight;
    var physicalSelector=document.getElementById('MainCanvasRenderer');
    var heightPending=changedHeight&&physicalSelector&&physicalSelector.value==='physical'&&
      QueuePhysicalHeightChange();
    if(!heightPending){
      if(physicalHeightScheduler120)physicalHeightScheduler120.cancel();
      SchedulePhysicalCanvasFinalFrame();
      graph.Redraw();
    }
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
        occlusionRadius:radius ? Number(radius.value) : 6371000,
        interactive:physicalCanvasInteractive
      });
      if (status) {
        var reasons=result.unresolvedReasons||{},samples=result.sampleStatuses||{};
        var solverFailures=samples.solver_failed||0;
        var grazingSamples=samples.indeterminate||0;
        var pieces=[];
        pieces.push(result.drawn+' lines (visible outline pieces)');
        if(result.interactiveGuidePreview)pieces.push('INTERACTIVE PREVIEW: '+
          result.previewGuidePrimitives+'/'+result.fullGuidePrimitives+
          ' ground guides (full grid restored after slider settles)');
        if(result.fillTriangles!==undefined){
          pieces.push(result.fillTriangles+' physical fill triangles | '+
            result.fillUnresolved+' uncertain fill triangles omitted');
          if(result.fillUnresolved)pieces.push('fill boundaries: '+
            JSON.stringify(result.fillUnresolvedReasons||{}));
        }
        pieces.push(result.unresolved+' unresolved ('+
          (reasons['visibility-boundary']||0)+' horizon/boundary, '+
          (reasons['optical-solver']||0)+' solver, '+
          (reasons['sample-budget']||0)+' sample-budget, '+
          (reasons['grazing-uncertainty']||0)+' grazing)');
        if(result.boundaryClipped)pieces.push(result.boundaryClipped+
          ' bounded boundary clips (gap <= '+
          result.maxBoundaryGapMetres.toFixed(4)+' m; hidden gap not drawn'+
          (result.boundaryGrazingStops?'; '+result.boundaryGrazingStops+' grazing stops':'')+')');
        pieces.push(solverFailures+' failed point evaluations | '+
          grazingSamples+' grazing/indeterminate point samples');
        pieces.push(result.cacheReused?'optical geometry cached':'optical geometry '+result.buildMs+' ms');
        if(result.timings){
          var t=result.timings;
          pieces.push('frame '+Math.round(t.totalMs)+' ms ('+
            'scene '+Math.round(t.composeMs)+' + optics '+Math.round(t.opticsMs)+
            ' + screen LOD '+Math.round(t.screenLodMs||0)+
            ' + snapshot '+Math.round(t.snapshotOnlyMs===undefined?t.frameMs:t.snapshotOnlyMs)+
            ' + painter '+Math.round(t.paintMs)+
            ' [validation '+Math.round(t.validationMs)+
            ', fill projection '+Math.round(t.projectionMs)+
            ', Canvas '+Math.round(t.canvasMs)+'] ms; '+
            t.strokeCalls+' Canvas strokes)');
        }
        if(result.guideScreenLod){
          var l=result.guideScreenLod;
          pieces.push('screen grid <= '+l.tolerancePixels+' px: '+
            l.inputGroundSegments+' source -> '+
            (l.inputGroundSegments-l.removedBySimplification-l.removedOffscreen)+
            ' displayed ('+l.removedOffscreen+' offscreen/behind, '+
            l.removedBySimplification+' simplified, '+l.unsafeNearPlane+
            ' near-plane preserved)');
        }
        if(result.opticalStages&&!result.cacheReused){
          var ot=result.opticalStages;
          pieces.push('cold optics: ground '+Math.round(ot.groundGuidesMs)+
            ', outlines '+Math.round(ot.outlinesMs)+', fills '+Math.round(ot.fillsMs)+
            ', exact solver '+Math.round(ot.exactSolveMs)+' ms (solver included in ground/outlines/fills)');
        }
        if(result.step)pieces.push('RK4 step '+Math.round(result.step)+' m');
        if(result.fieldStats){
          pieces.push(result.fieldStats.solves+' shared exact ray solves'+
            (result.towerSolves!==undefined?' ('+result.towerSolves+' tower, '+
              result.sharedGroundSolves+' ground)':''));
          if(result.fieldPrism)pieces.push('tower prism '+
            Math.round(result.fieldPrism.minDistance/1000)+'-'+
            Math.round(result.fieldPrism.maxDistance/1000)+' km | '+
            Math.round(result.fieldPrism.minHeight)+'-'+
            Math.round(result.fieldPrism.maxHeight)+' m elevation');
          pieces.push(result.fieldStats.interpolations+' interpolated points | '+
            result.fieldStats.fallbacks+' exact fallbacks');
          if(!result.cacheReused&&result.fieldStats.predictorAccepted)
            pieces.push('fast shooting '+result.fieldStats.predictorAccepted+' verified roots / '+
              result.fieldStats.shootEvaluations+' trials | '+
              result.fieldStats.clearGroundSteps+' clear ground steps (no substep search)');
          if(result.fieldStats.refinements!==undefined)
            pieces.push(result.fieldStats.acceptedCells+' qualified adaptive cells | '+
              result.fieldStats.refinements+' refinements'+
              (result.fieldStats.adaptiveLimits?' | '+result.fieldStats.adaptiveLimits+' refinement limits':''));
        }
        if(result.groundHorizon!==null&&Number.isFinite(result.groundHorizon))
          pieces.push('optical horizon '+(result.groundHorizon/1000).toFixed(2)+' km');
        else pieces.push('no finite ground horizon resolved');
        if(result.guideSegments!==undefined)pieces.push(result.guideSegments+' physical surface guide pieces');
        if(result.guideSolves!==undefined)pieces.push(result.guideSolves+' ground ray queries'+
          (result.sharedGroundCacheHits?' ('+result.sharedGroundCacheHits+' exact cache hits)':''));
        if(result.guideCulling&&(result.guideCulling.skippedEdges||result.guideCulling.clippedEdges))
          pieces.push('ground-grid drawing limited to '+Math.round(result.guideRenderExtent/1000)+
            ' km ('+result.guideCulling.skippedEdges+' skipped, '+result.guideCulling.clippedEdges+' clipped edges; NOT an optical horizon)');
        status.textContent=(result.budgetExceeded?'PARTIAL (time budget): ':solverFailures?'CHECK SOLVER: ':result.unresolved?'BOUNDARY UNCERTAINTY: ':'')+
          pieces.join(' | ')+'. Physical ground grid/horizon; authored foundation fills, mutual object occlusion pending.';
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

// Physical camera sliders can emit many changes per refresh interval. Keep
// GraphX3DX's synchronous legacy Redraw semantics; only Physical opts in to
// one redraw of the LATEST camera state per browser animation frame.
var physicalCanvasFrameScheduler = null;
if (window.CurvatureCanvasFrameScheduler && typeof requestAnimationFrame === 'function' &&
    typeof cancelAnimationFrame === 'function') {
  var immediateGraphRedraw=graph.Redraw.bind(graph);
  physicalCanvasFrameScheduler=CurvatureCanvasFrameScheduler.create(
    requestAnimationFrame.bind(window),cancelAnimationFrame.bind(window),immediateGraphRedraw);
  graph.Redraw=function(){
    // A direct redraw (mode/atmosphere/settings change) supersedes a queued
    // height-only redraw; otherwise the later timer would draw twice.
    if(physicalHeightScheduler120)physicalHeightScheduler120.cancel();
    var selector=document.getElementById('MainCanvasRenderer');
    if(selector&&selector.value==='physical')physicalCanvasFrameScheduler.schedule();
    else {
      physicalCanvasInteractive=false;
      if(physicalHeightScheduler120)physicalHeightScheduler120.cancel();
      if(physicalCanvasSettleTimer!==null){clearTimeout(physicalCanvasSettleTimer);physicalCanvasSettleTimer=null;}
      physicalCanvasFrameScheduler.cancel();immediateGraphRedraw();
    }
  };
}

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

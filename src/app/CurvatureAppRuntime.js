// One model/Canvas owner per Legacy runtime. Keep the historical globals as
// compatibility aliases until all authored modules accept instance ports.
var legacyAppContext = window.CurvatureLegacyAppContext.create({
  createModel: function(){return new CurveAppClass();},
  createGraph: function(options){return NewGraphX3D(options);},
  applyState: function(model,state){return JsonToAppState(state,model);}
});
var CurveApp = legacyAppContext.model;
// This flag affects only temporary ground-guide presentation, never optics or
// tower visibility. After the last change the complete frame is restored.
var physicalCanvasInteractive = false;
var physicalCanvasSettleTimer = null;
// Only changes to the observer height debounce the expensive RK4 cold build.
// A pending height never triggers an incorrect/approximate Physical scene.
var physicalHeightScheduler120 = null;
function QueuePhysicalHeightChange(){
  if(!physicalHeightScheduler120&&window.CurvatureHeightChangeScheduler){
    physicalHeightScheduler120=CurvatureHeightChangeScheduler.create(
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


// The standalone page and the Demos host retain the historical UpdateAll
// entrypoint. The refresh sequence itself belongs to the instance-scoped
// coordinator, not to the browser globals above.
var legacyUpdateCoordinator = window.CurvatureLegacyUpdateCoordinator.create({
  getModel: function(){return legacyAppContext.model;},
  resetDemos: function(){Demos.Reset();},
  showInfo: function(){ShowMoreInfos();},
  syncOptics: function(){if(window.CurvatureOpticsUI)CurvatureOpticsUI.sync();},
  updatePanels: function(){ControlPanels.Update();},
  syncCurvature: function(){SyncPhysicalCurvatureControl127();},
  isPhysical: function(){
    var selector=document.getElementById('MainCanvasRenderer');
    return !!selector&&selector.value==='physical';
  },
  queueHeightChange: function(){return QueuePhysicalHeightChange();},
  cancelHeightChange: function(){if(physicalHeightScheduler120)physicalHeightScheduler120.cancel();},
  scheduleFinalFrame: function(){SchedulePhysicalCanvasFinalFrame();},
  redraw: function(){legacyAppContext.redraw();},
  refreshOptics: function(){
    if(typeof ScheduleOpticalP4Refresh==='function')ScheduleOpticalP4Refresh();
  }
});
function UpdateAll(stopAnimation){
  return legacyUpdateCoordinator.update(stopAnimation);
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
var legacyCanvasPresenter = window.CurvatureLegacyCanvasPresenter.create({
  getModel: function(){return legacyAppContext.model;},
  getMode: function(){return document.getElementById('MainCanvasRenderer');},
  getStatus: function(){return document.getElementById('MainCanvasRendererStatus');},
  getRenderer: function(){return window.CurvatureMainCanvasRenderer;},
  isAuditActive: function(){return legacyFrameAuditRequested||legacyFrameAuditInProgress;},
  drawLegacy: function(g){return DrawModelWithOptionalAudit(g);},
  getPhysicalOptions: function(){
    var atmosphere=document.getElementById('PhysicalCanvasAtmosphere');
    var radius=document.getElementById('PhysicalCanvasOcclusionRadius');
    return {
      atmosphere:atmosphere?atmosphere.value:'vacuum',
      occlusionRadius:radius?Number(radius.value):6371000,
      interactive:physicalCanvasInteractive
    };
  },
  reportError: function(error){console.error('Independent main Canvas render:',error);}
});
// Historical entrypoint is retained for the GraphX3D and diagnostic contracts.
function DrawMainCanvasFrame(g) {
  return legacyCanvasPresenter.draw(g);
}

var graph = legacyAppContext.mountGraph( {
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

function SyncPhysicalCurvatureControl127(){
  var api=window.CurvaturePhysicalCurvature;
  if(!api)return;
  var slider=document.getElementById('PhysicalCanvasCurvature');
  var label=document.getElementById('PhysicalCanvasCurvatureLabel');
  if(!slider||!label)return;
  var step=api.modelStep(CurveApp);
  if(step!==null)slider.value=String(step);
  label.textContent=api.label(CurveApp);
  // The slider is a *physical-only* control. Legacy radio selectors keep
  // ownership of the separate Globe+FE comparison mode.
  slider.disabled=CurveApp.showModel===3;
}
function WirePhysicalCurvature127(){
  var api=window.CurvaturePhysicalCurvature;
  if(!api)return;
  var slider=document.getElementById('PhysicalCanvasCurvature');
  var earth=document.getElementById('PhysicalCanvasEarthRadius');
  if(!slider)return;
  var delayed=null;
  function commit(){
    if(delayed!==null){clearTimeout(delayed);delayed=null;}
    UpdateAll();
  }
  slider.addEventListener('input',function(){
    if(delayed!==null)clearTimeout(delayed);
    if(physicalCanvasFrameScheduler)physicalCanvasFrameScheduler.cancel();
    api.applyStep(CurveApp,Number(slider.value));
    CurveApp.Update();
    ControlPanels.Update();
    SyncPhysicalCurvatureControl127();
    var status=document.getElementById('MainCanvasRendererStatus');
    if(status)status.textContent='CURVATURE CHANGING: exact Physical optics pending; the previous image is retained until the slider settles.';
    // Unlike pan/nick, a curvature change invalidates the entire optical
    // field. Never launch an expensive exact solve for every pointer event.
    delayed=setTimeout(commit,250);
  });
  slider.addEventListener('change',commit);
  if(earth)earth.addEventListener('click',function(){
    api.resetEarth(CurveApp);commit();
  });
  SyncPhysicalCurvatureControl127();
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
WirePhysicalCurvature127();
['PhysicalCanvasAtmosphere','PhysicalCanvasOcclusionRadius'].forEach(function(id){
  var control=document.getElementById(id);
  if(control)control.addEventListener('change',function(){RefreshPhysicalCanvasControls();graph.Redraw();});
});
var mainCanvasRendererSelect = document.getElementById('MainCanvasRenderer');
if (mainCanvasRendererSelect) mainCanvasRendererSelect.addEventListener('change', function() {
  RefreshPhysicalCanvasControls();
  graph.Redraw();
});

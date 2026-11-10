/* Modern UI: separate HTML shell over one CurveAppClass and one shared Physical
 * renderer. Scene controls (131) never read/drive the Legacy DOM.
 * GraphX3DX is created at the parser's document.write position.
 */
(function(root){
  'use strict';
  var state={mode:'scene',atmosphere:'standard',occlusionRadius:6371000,
    visibility:{enabled:false,rangeKm:60},
    temperatureProfile:{temperatureC:15,pressureHpa:1013.25,gradientKPerKm:-6.5},
    transitionProfile:{source:'standard',weight:0},
    inverseProfile:{source:'temperature-lapse',weight:0},
    showTemperatureProfile:false,temperaturePlacement:'outside-right',
    preset:'pontchartrain',timer:null,frame:null,last:null,editTimeouts:{},
    curvatureCommitTimer:null,curvaturePending:false,
    compareGraphs:{A:null,B:null},comparePair:null,compareLast:{A:null,B:null},
    geometryBackend:'canvas',opticalQuality:'accurate',previewDetail:'auto',opticalSample:null,compareEyeLevel:false,compareHorizon:true,horizonCache:{Scene:null,A:null,B:null},compareConfig:null,compareSelected:'A',compareCache:{A:null,B:null},compareFastCache:{A:null,B:null}};
  var adapter=root.CurvatureModernSceneState;
  var compareAdapter=root.CurvatureModernCompareModel;
  var compareState=root.CurvatureModernCompareState;
  var experiments=root.CurvatureModernExperimentState;
  var historyFactory=root.CurvatureModernExperimentHistory;
  var historyFingerprint=root.CurvatureModernExperimentFingerprint;
  var thumbnailApi=root.CurvatureModernExperimentThumbnail;
  var historyUI=root.CurvatureModernExperimentHistoryUI;
  var historyFiltersApi=root.CurvatureModernExperimentHistoryFilters;
  var sessionAutosave=root.CurvatureModernSessionAutosave;
  var studioApi=root.CurvatureModernAnimationStudio;
  var studioUI=root.CurvatureModernAnimationStudioUI;
  var studioProjects=root.CurvatureModernAnimationProject;
  var studioPlaybackApi=root.CurvatureModernAnimationPlayback;
  var studioPreviewApi=root.CurvatureModernAnimationPreview;
  var studioFrameExportApi=root.CurvatureModernAnimationFrameExport;
  var studioFrameExportTask=null;
  var studioQualityApi=root.CurvatureModernAnimationQualityAudit;
  var studioQualityAudit=studioQualityApi?studioQualityApi.create():null;
  var studioLastQualityFrame=null;
  var studioLastParity=null;
  var studioDraftAutosave=root.CurvatureModernAnimationDraftAutosave;
  var studioLibrary=root.CurvatureModernAnimationLibrary;
  // One gesture controller and one camera for Scene and both Compare models.
  var cameraInteraction=root.CurvatureModernCameraInteraction?
    root.CurvatureModernCameraInteraction.create():null;
  var cameraPreview=root.CurvatureModernCameraDragPreview?
    root.CurvatureModernCameraDragPreview.create({
      requestFrame:function(fn){return requestAnimationFrame(fn);},
      cancelFrame:function(id){cancelAnimationFrame(id);},
      cursorHost:document.documentElement,
      perspective:root.CurvatureModernCameraPerspectiveWarp,
      angleMapping:root.CurvatureModernCameraInteraction.angles}):null;
  // 140.0: diagnostics are opt-in and never select a rendering backend.
  var gpuCapabilities=root.CurvatureModernGpuCapabilities;
  var gpuSnapshot=null;
  var gpuProbePending=false;
  function bindGpuDiagnostics(){
    if(!gpuCapabilities)return;
    var button=document.getElementById('ModernGpuCheck');
    if(!button)return;
    button.addEventListener('click',function(){
      if(gpuProbePending)return;
      gpuProbePending=true;button.disabled=true;
      var note=document.getElementById('ModernGpuNote');
      if(note)note.textContent='Checking browser GPU capabilities…';
      Promise.resolve().then(function(){return gpuCapabilities.probe({document:document,navigator:root.navigator});})
        .then(function(report){
          gpuSnapshot=report;
          function show(id,value){var node=document.getElementById(id);if(node)node.textContent=String(value);}
          show('ModernGpuWebGL',report.webgl.status);
          show('ModernGpuWebGL2',report.webgl2.status);
          show('ModernGpuWebGPU',report.webgpu.status);
          var gl=report.webgl2.status==='available'?report.webgl2:report.webgl;
          show('ModernGpuRenderer',gl.renderer||'Not disclosed');
          show('ModernGpuFloat',gl.floatTexture||'Not checked');
          show('ModernGpuHardware',report.hardwareAcceleration);
          if(note)note.textContent=report.guidance;
        }).catch(function(err){if(note)note.textContent='GPU probe failed: '+String(err&&err.message||err);})
        .then(function(){gpuProbePending=false;button.disabled=false;});
    });
  }
  // #140.2 is opt-in only: keep Canvas as reference and avoid changing
  // experiments/URLs. An unavailable or lost WebGL2 context falls back per frame.
  function geometryUi(id){
    // Older test/embedded hosts may not include optional #140.2 controls.
    return typeof document.querySelector==='function'?document.querySelector('#'+id):null;
  }
  function updateGeometryBackendStatus(result){
    var status=geometryUi('ModernGeometryBackendStatus');
    var active=geometryUi('ModernGpuActiveBackend');
    var backend=result&&result.geometryBackend||'Canvas 2D';
    if(status)status.textContent='Active: '+backend+
      (result&&result.geometryFallback?' · fallback: '+result.geometryFallback:'');
    if(active)active.textContent=backend;
  }
  // Preview LOD is an ephemeral display preference, NOT experiment physics.
  // The same stride is used by both Compare viewports, so A/B always show
  // identical tower subsets even when their optical atmospheres differ.
  // Auto is an opt-in navigation policy, never an optical field handed to
  // the renderer. Fast is used only for qualified camera-motion samples;
  // idle renders and unsupported profiles always retain Accurate.
  var autoCameraActive=false,autoCameraLastFrame=-Infinity,autoCameraSettleTimer=null;
  var cameraTransition=null;
  var AUTO_FRAME_INTERVAL_MS=120,AUTO_WHEEL_IDLE_MS=220;
  function qualifiedFastProfile(atmosphere,surface,inverse){
    return atmosphere==='vacuum'||atmosphere==='standard'||
      (surface==='flat'&&(atmosphere==='exponential-occlusion'||
        (atmosphere==='inverse-temperature'&&inverse&&inverse.weight===1)));
  }
  function autoPreviewSupported(){
    if(state.mode==='demos'||state.demosActive)return false;
    if(state.mode==='compare'){
      if(!state.compareConfig)return state.atmosphere==='standard'||state.atmosphere==='vacuum';
      return ['A','B'].every(function(side){var spec=state.compareConfig[side];
        return spec&&qualifiedFastProfile(spec.atmosphere,spec.surface,spec.inverseProfile);
      });
    }
    return qualifiedFastProfile(state.atmosphere,model.showModel===2?'flat':'globe',state.inverseProfile);
  }
  function effectiveOpticalQuality(){
    if(cameraTransition)return 'fast';
    return state.opticalQuality==='auto'?(autoCameraActive&&autoPreviewSupported()?'fast':'accurate'):
      state.opticalQuality;
  }
  function clearAutoCameraSettle(){
    if(autoCameraSettleTimer!==null){clearTimeout(autoCameraSettleTimer);autoCameraSettleTimer=null;}
  }
  function stopAutoCameraPreview(){
    clearAutoCameraSettle();autoCameraActive=false;autoCameraLastFrame=-Infinity;
  }
  function requestAutoCameraPreview(){
    if((state.opticalQuality!=='auto'&&!cameraTransition)||!autoPreviewSupported())return false;
    if(!autoCameraActive){
      autoCameraActive=true;autoCameraLastFrame=-Infinity;
      // The first dense-scene frame should be inexpensive. Auto LOD will
      // subsequently tune the stride from measured complete frame times.
      if(state.previewDetail==='auto'&&previewLodControllers){
        var scope=state.mode==='compare'?'compare':'Scene';
        previewLodControllers[scope].reset(8);
      }
    }
    var now=profileNow();
    if(now-autoCameraLastFrame>=AUTO_FRAME_INTERVAL_MS&&state.frame===null){
      autoCameraLastFrame=now;
      redraw('camera-motion');
    }
    return true;
  }
  var previewLodApi=root.CurvatureOpticalPreviewLod;
  var previewLodControllers=previewLodApi?{
    Scene:previewLodApi.createController(45),
    compare:previewLodApi.createController(70)}:null;
  function previewStride(view){
    if(effectiveOpticalQuality()!=='fast')return 1;
    if(state.previewDetail!=='auto')return Number(state.previewDetail);
    return previewLodControllers?previewLodControllers[view==='Scene'?'Scene':'compare'].stride():1;
  }
  function updatePreviewDetailStatus(){
    var selector=geometryUi('ModernPreviewDetail'),note=geometryUi('ModernPreviewDetailStatus');
    if(selector)selector.disabled=effectiveOpticalQuality()!=='fast'&&state.opticalQuality!=='auto';
    if(!note)return;
    if(effectiveOpticalQuality()!=='fast'){
      note.textContent=state.opticalQuality==='auto'?
        'Auto at rest: all towers in Accurate; selected LOD applies during motion.':
        'Accurate: all authored towers retained.';return;
    }
    var scope=state.mode==='compare'?'compare':'Scene';
    var stride=previewStride(scope),result=scope==='Scene'?state.last:state.compareLast.B;
    var drawn=result&&result.previewLod||null;
    note.textContent='Fast Preview LOD: '+(state.previewDetail==='auto'?'Auto':'Manual')+
      ' · '+(drawn?'drawn '+drawn.selected+'/'+drawn.original+' objects · ':'')+
      (stride===1?'next: full detail':'next: every '+stride+'th tower')+
      ' · no effect on Accurate';
  }
  function bindPreviewDetail(){
    var selector=geometryUi('ModernPreviewDetail');
    if(!selector)return;
    selector.value=state.previewDetail;
    selector.addEventListener('change',function(){
      state.previewDetail=['auto','1','2','4','8','16','32'].includes(selector.value)?selector.value:'auto';
      saveApplicationPreferences();
      if(previewLodControllers){previewLodControllers.Scene.reset();previewLodControllers.compare.reset();}
      updatePreviewDetailStatus();
      if(state.opticalQuality!=='auto'||autoCameraActive)redraw();
    });
    updatePreviewDetailStatus();
  }
  function observePreviewFrame(scope,ms,fullBatch){
    var valid=scope==='Scene'?state.last&&state.last.opticalQuality==='fast'&&state.last.previewLod:
      fullBatch&&state.compareLast.A&&state.compareLast.B&&
      state.compareLast.A.opticalQuality==='fast'&&state.compareLast.B.opticalQuality==='fast'&&
      state.compareLast.A.previewLod&&state.compareLast.B.previewLod;
    if(effectiveOpticalQuality()==='fast'&&state.previewDetail==='auto'&&
        previewLodControllers&&valid)previewLodControllers[scope].observe(ms);
    updatePreviewDetailStatus();
  }
  function bindOpticalQuality(){
    var select=geometryUi('ModernOpticalQuality');
    if(!select)return;
    select.value=state.opticalQuality;
    select.addEventListener('change',function(){
      stopAutoCameraPreview();
      state.opticalQuality=['fast','auto'].includes(select.value)?select.value:'accurate';
      saveApplicationPreferences();
      updateOpticalQualityStatus();updatePreviewDetailStatus();redraw();
    });
    updateOpticalQualityStatus();
  }
  function updateOpticalQualityStatus(message){
    var target=geometryUi('ModernOpticalQualityStatus');
    if(target)target.textContent=message||('Active: '+
      (effectiveOpticalQuality()==='fast'?'Fast Preview (approximate; no RK4 fallback)':
        state.opticalQuality==='auto'?'Auto · Accurate (RK4) at rest'+
          (!autoPreviewSupported()?' · Fast unsupported for this profile':''):'Accurate (RK4)'));
  }
  // An unsupported Fast Preview must not leave a previously calculated frame
  // masquerading as the new camera/atmosphere state.
  function clearUnavailablePreview(graph){
    var canvas=graph&&graph.Canvas,ctx=canvas&&canvas.getContext&&canvas.getContext('2d');
    if(ctx&&typeof ctx.clearRect==='function'){
      if(typeof ctx.save==='function')ctx.save();
      try{
        if(typeof ctx.setTransform==='function')ctx.setTransform(1,0,0,1,0,0);
        ctx.clearRect(0,0,canvas.width,canvas.height);
      }finally{if(typeof ctx.restore==='function')ctx.restore();}
    }
  }
  function bindGeometryBackend(){
    var select=geometryUi('ModernGeometryBackend');
    if(!select)return;
    select.value=state.geometryBackend;
    select.addEventListener('change',function(){
      state.geometryBackend=select.value==='webgl2'?'webgl2':'canvas';
      saveApplicationPreferences();
      updateGeometryBackendStatus(null);
      redraw();
    });
  }
  var renderProfiler=root.CurvatureModernRenderProfiler?
    root.CurvatureModernRenderProfiler.create():null;
  // #140.1 exposes the already present physical stage profiler in Display.
  // WebGL timing is opt-in; CPU command submission != GPU execution.
  var profilingRecording=false;
  function performanceSnapshot(){
    return {version:'140.3',mode:state.mode,backend:state.geometryBackend==='webgl2'?'WebGL2 experimental':'Canvas 2D',
      recordedAt:new Date().toISOString(),recording:profilingRecording,
      gpuCapabilities:gpuSnapshot,profile:renderProfiler?renderProfiler.summary():null};
  }
  function refreshPerformanceReport(note){
    var report=root.CurvatureModernPerformanceReport;
    var target=document.getElementById('ModernPerfResults');
    if(target)target.textContent=report&&renderProfiler?
      report.format(renderProfiler.summary()):'Render performance diagnostics unavailable.';
    var status=document.getElementById('ModernPerfStatus');
    if(status&&note)status.textContent=note;
  }
  function bindPerformanceDiagnostics(){
    if(!root.CurvatureModernPerformanceReport)return;
    var record=document.getElementById('ModernPerfRecord');
    var stop=document.getElementById('ModernPerfStop');
    if(!record||!renderProfiler)return;
    if(record.__curvaturePerfBound)return;
    // App and profiler must expose the same API; a stale cached module must not
    // cause an uncaught TypeError or pretend recording was started.
    if(typeof renderProfiler.setEnabled!=='function'||
       typeof renderProfiler.clear!=='function'||
       typeof renderProfiler.summary!=='function'){
      record.disabled=true;
      if(stop)stop.disabled=true;
      refreshPerformanceReport('Profiler API mismatch. Reload the page with Ctrl+F5; check ModernRenderProfiler.js?v=140.1.2.');
      return;
    }
    record.__curvaturePerfBound=true;
    function updateRecordButton(){
      record.textContent='Start recording';
      record.disabled=profilingRecording;
      record.setAttribute('aria-pressed',String(profilingRecording));
      if(stop)stop.disabled=!profilingRecording;
      ['ModernProfilerRecordingState','ModernDiagnosticsRecordingState'].forEach(function(id){
        var node=geometryUi(id);if(node)node.hidden=!profilingRecording;
      });
    }
    function setRecording(active){
      if(active===profilingRecording)return;
      if(active){
        renderProfiler.clear();renderProfiler.setEnabled(true);
        profilingRecording=true;
        if(atmosphericShimmer)atmosphericShimmer.setProfiling(true);
        refreshPerformanceReport('Status: recording. Recalculate several times, then Stop recording.');
      }else{
        if(atmosphericShimmer)atmosphericShimmer.setProfiling(false);
        renderProfiler.setEnabled(false);profilingRecording=false;
        refreshPerformanceReport('Status: stopped. Samples are frozen until you start again.');
      }
      updateRecordButton();
    }
    record.addEventListener('click',function(){setRecording(true);});
    if(stop)stop.addEventListener('click',function(){setRecording(false);});
    // Both actions perform exactly ONE ordinary scene/Compare redraw.
    // Cold invalidates the targeted optical session at its transform boundary;
    // Warm leaves it alone and reports whether the cache was truly reused.
    ['cold','warm'].forEach(function(kind){
      var button=document.getElementById(kind==='cold'?'ModernPerfCold':'ModernPerfWarm');
      if(button)button.addEventListener('click',function(){
        if(!profilingRecording){
          refreshPerformanceReport('Start recording before taking optical samples.');return;
        }
        refreshPerformanceReport('Status: recording · '+kind+' optical sample scheduled for '+
          (state.mode==='scene'?'Scene':'Compare A/B')+'.');
        redraw(kind);
      });
    });
    var snapshot=document.getElementById('ModernPerfSnapshot');
    if(snapshot)snapshot.addEventListener('click',function(){
      refreshPerformanceReport('Report refreshed. Median/p95 use only collected samples.');
    });
    var clear=document.getElementById('ModernPerfReset');
    if(clear)clear.addEventListener('click',function(){
      renderProfiler.clear();refreshPerformanceReport('Status: '+(profilingRecording?'recording':'stopped')+'. Samples cleared.');
    });
    var exportButton=document.getElementById('ModernPerfExport');
    if(exportButton)exportButton.addEventListener('click',function(){
      if(!root.Blob||!root.URL||!root.URL.createObjectURL){
        refreshPerformanceReport('JSON export is unavailable in this browser.');return;
      }
      var blob=new root.Blob([JSON.stringify(performanceSnapshot(),null,2)],{type:'application/json'});
      var url=root.URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download='curvature-optical-profile-140.3.json';
      try{link.click();}finally{
        // Keep the blob URL alive until the browser has dispatched the click.
        if(typeof root.setTimeout==='function')root.setTimeout(function(){root.URL.revokeObjectURL(url);},1000);
        else root.URL.revokeObjectURL(url);
      }
    });
    updateRecordButton();
  }

  // 138.2: the shimmer is a screen-space visual approximation, NOT an
  // atmosphere-derived C_n^2 prediction. Disabled means no extra RAF or GPU.
  var atmosphericShimmer=root.CurvatureModernAtmosphericShimmer?
    root.CurvatureModernAtmosphericShimmer.create({
      onProfile:function(name,entry){
        if(renderProfiler)renderProfiler.recordPresentation(Object.assign({viewport:name},entry));
      },
      onGpuTime:function(name,entry){
        if(renderProfiler)renderProfiler.recordGpuDraw(Object.assign({viewport:name},entry));
      },
      onContextLost:function(name){
        if(atmosphericPresentation)atmosphericPresentation.contextLost(name);
        stopShimmerFrame();
      },
      onContextRestored:function(name){
        if(atmosphericPresentation)atmosphericPresentation.contextRestored(name);
        atmosphericShimmer.resetClock(name);scheduleShimmerFrame();
      }
    }):null;
  var atmosphericPresentation=root.CurvatureModernAtmosphericPresentation?
    root.CurvatureModernAtmosphericPresentation.create({document:document,
      present:atmosphericShimmer?function(source,target,name,meta){
        try{return atmosphericShimmer.present(source,target,name,meta);}
        catch(error){atmosphericShimmer.noteError(name,error);throw error;}
      }:undefined,
      onRemove:atmosphericShimmer?atmosphericShimmer.dispose:undefined}):null;
  var shimmerFrame=null;
  var shimmerLastFrameMs=null;
  var shimmerPaused={Scene:false,A:false,B:false};
  function shimmerAnimating(name){
    if(!atmosphericPresentation||shimmerPaused[name]||!atmosphericPresentation.ready(name))return false;
    var settings=atmosphericShimmer.getSettings(name);
    // Zero strength renders the unwarped capture; zero drift is a frozen field.
    // Neither needs continuous GPU work until a control or capture changes.
    return settings.intensity>0&&settings.drift>0;
  }
  function shimmerViews(){return state.mode==='compare'?['A','B']:['Scene'];}
  function scheduleShimmerFrame(){
    if(shimmerFrame!==null||!atmosphericShimmer||!atmosphericPresentation||document.hidden)return;
    if(!shimmerViews().some(shimmerAnimating))return;
    shimmerFrame=requestAnimationFrame(function(timestamp){
      shimmerFrame=null;
      // One full-screen procedural shader is substantial GPU work; Compare
      // presents two. Cap Scene at 60 Hz and Compare at 30 Hz, independent
      // of high-refresh-rate monitors, without slowing the optical renderer.
      var minimumMs=1000/(state.mode==='compare'?30:60);
      if(shimmerLastFrameMs===null||timestamp-shimmerLastFrameMs>=minimumMs-1.75){
        shimmerLastFrameMs=timestamp;
        shimmerViews().forEach(function(name){if(shimmerAnimating(name))
          atmosphericPresentation.frame(name,timestamp);});
      }
      scheduleShimmerFrame();
    });
  }
  function stopShimmerFrame(){
    if(shimmerFrame!==null){cancelAnimationFrame(shimmerFrame);shimmerFrame=null;}
    shimmerLastFrameMs=null;
  }
  if(typeof document.addEventListener==='function')document.addEventListener('visibilitychange',function(){
    if(document.hidden){stopShimmerFrame();if(atmosphericShimmer)atmosphericShimmer.resetClock();}
    else scheduleShimmerFrame();
  });
  // 138.3: UI-only settings. A/B independently select their own shader settings;
  // range edits and pause never schedule physical optics or upload a texture.
  function shimmerTarget(group){return group==='Scene'?'Scene':state.compareSelected;}
  function shimmerUi(id){return newUiEl('ModernShimmer'+id);}
  function syncShimmerControls(){
    if(!atmosphericShimmer||!atmosphericPresentation)return;
    ['Scene','Compare'].forEach(function(group){
      var enabled=shimmerUi(group+'Enabled'),options=shimmerUi(group+'Options');
      if(!enabled||!options)return;
      var name=shimmerTarget(group),active=atmosphericPresentation.enabled(name);
      var settings=atmosphericShimmer.getSettings(name);
      enabled.checked=active;options.hidden=!active;
      var summary=newUiEl('ModernAtmosphere'+group+'ShimmerSummary');
      if(summary)summary.textContent=active?(shimmerPaused[name]?'Paused':'On'):'Off';
      var targetLabel=shimmerUi('CompareTarget');
      if(group==='Compare'&&targetLabel)targetLabel.textContent='model '+name;
      [['Intensity','intensity',' px'],['Scale','scale',' px'],['Drift','drift',' px/s']].forEach(function(row){
        var input=shimmerUi(group+row[0]),output=shimmerUi(group+row[0]+'Value');
        if(input)input.value=String(settings[row[1]]);
        if(output)output.textContent=settings[row[1]]+row[2];
      });
      var pause=shimmerUi(group+'Pause');
      if(pause){pause.disabled=!active;pause.textContent=shimmerPaused[name]?'Resume animation':'Pause animation';
        pause.setAttribute('aria-pressed',String(shimmerPaused[name]));}
    });
  }
  function bindShimmerControls(){
    if(!atmosphericShimmer||!atmosphericPresentation)return;
    ['Scene','Compare'].forEach(function(group){
      var toggle=shimmerUi(group+'Enabled');if(!toggle)return;
      toggle.addEventListener('change',function(){
        var name=shimmerTarget(group),enabled=!!toggle.checked;
        if(!atmosphericPresentation.setEnabled(name,enabled))return;
        atmosphericShimmer.resetClock(name);
        if(!enabled)shimmerPaused[name]=false;
        stopShimmerFrame();syncShimmerControls();
        // Only ON/OFF needs a cached physical repaint: this separates source
        // decorations from the GPU texture and restores them on disable.
        redraw();
      });
      [['Intensity','intensity'],['Scale','scale'],['Drift','drift']].forEach(function(row){
        var control=shimmerUi(group+row[0]);if(!control)return;
        control.addEventListener('input',function(){
          var name=shimmerTarget(group),value=Number(control.value);
          try{
            var change={};change[row[1]]=value;
            atmosphericShimmer.configure(change,name);
            atmosphericShimmer.resetClock(name);
            // A paused or static viewport can preview a setting change once.
            if(atmosphericPresentation.ready(name))atmosphericPresentation.frame(name);
            stopShimmerFrame();syncShimmerControls();scheduleShimmerFrame();
          }catch(error){updateStatus('Invalid shimmer '+row[1]+': '+error.message,true);}
        });
      });
      var pause=shimmerUi(group+'Pause');if(!pause)return;
      pause.addEventListener('click',function(){
        var name=shimmerTarget(group);
        if(!atmosphericPresentation.enabled(name))return;
        shimmerPaused[name]=!shimmerPaused[name];
        atmosphericShimmer.resetClock(name);
        stopShimmerFrame();syncShimmerControls();scheduleShimmerFrame();
      });
    });
    syncShimmerControls();
  }
  function profileNow(){return root.performance&&typeof root.performance.now==='function'?
    root.performance.now():Date.now();}
  // A replaceState-authored experiment URL is not an externally shared link.
  // Its history marker survives reload, so browser workspace preferences remain
  // authoritative without giving an imported/shared URL the wrong mode.
  var AUTO_EXPERIMENT_HISTORY_KEY='__curvatureModernAutoExperimentUrlV1';
  var EDITED_SHARED_URL_KEY='__curvatureModernEditedSharedUrlV1';
  var persistence={ready:false,explicitUrl:false,timer:null,dirty:false,latestTimestamp:0,
    pendingCheckpoint:Promise.resolve()};
  // Saved camera poses belong to the experiment; navigation speed belongs to
  // the user's local preferences and is never mixed into a cinematic keyframe.
  var cameraPositions=[];
  var cameraSequence=[];
  var initialCamera=null;
  var navigation=root.CurvatureModernCameraNavigation;
  var navigationPrefs=navigation?navigation.settings():{speed:10,turnRate:1,wheelStep:'auto'};
  var navigationKeys=Object.create(null),navigationFrame=null,navigationStamp=null;
  var navigationMoved=false,navigationModifiers={fast:false,precise:false};
  var NAVIGATION_STORAGE_KEY='curvature-modern-camera-navigation-v1';
  var applicationPreferences=root.CurvatureModernApplicationPreferences;
  var historyGallerySize='small';
  var historyPinnedCollapsed=false;
  var historyPanelOpen=false;
  var historyStoryboardQueue=[];
  var studioDraft=studioApi?studioApi.blank():null;
  var studioSelectedKey=null;
  var studioFilmstripScroll=0;
  var studioPrepared=null;
  var studioPlayback=null;
  var studioPlaybackFrame=null;
  var studioPlaybackLastPaint=-Infinity;
  var studioPlaybackRenderedAt=null;
  var studioPlaybackQuality='auto'; // Physical -> Accurate; camera -> qualified Fast.
  var studioLibraryEntries=[],studioLibraryActive=null,studioLibraryPending=null;
  var studioLibrarySelected='',studioLibraryBusy=false,studioLibraryMessage='',studioLibraryError=false;
  var studioLibraryExpanded=true,studioLibraryRenamingId='',studioHistoryEntries=[];
  var studioLibraryDuplicate=null,studioLibraryShowDuplicates=false;
  var studioLibraryScroll=0;
  var studioDraftSavedAt=0,studioDraftLastPositionSave=0,studioDraftGeneration=0;
  var studioDraftCheckpoint=null,studioDraftSaveTimer=null;
  var studioDraftWriteQueue=Promise.resolve(),studioRestorePreviewPending=false;
  var studioInitialPaintFrame=null,studioInitialPaintToken=0;
  var studioPreviewObservedWidths={A:0,B:0};
  var studioPreviewRenderer=null;
  var STUDIO_PREVIEW_MIN_INTERVAL_MS=120;
  var studioPickerOpen=false;
  var studioPickerSearch='';
  var studioPickerScroll=0;
  var studioPickerChecked=Object.create(null);
  var studioDragSession=null;
  var historyFilters={query:'',mode:'all',geometry:'any',atmosphere:'any',
    geometryRelation:'any',refractionRelation:'any'};
  var displayPanels={advanced:false,diagnostics:false,gpu:false,profiler:false};
  var legacyDisplayPanels=Object.assign({},displayPanels);
  var workspaceState={mode:null,sceneTab:'Camera',compareTab:'Camera',compareModel:null,sections:{}};
  var workspaceSections=[];
  var workspaceInitialSections={
    'camera.pose':true,'camera.navigation':false,'camera.animation':true,
    'camera.savedViews':false,'camera.frameName':false,
    'surface.geometry':true,'atmosphere.profile':true,'atmosphere.explanation':false,
    'atmosphere.visibility':false,'atmosphere.shimmer':false,
    'objects.group1':true,'objects.group2':false,
    'objects.group1.variations':false,'objects.group2.variations':false,
    'display.advanced':false,'display.diagnostics':false,'display.gpu':false,'display.profiler':false
  };
  function preferencesStorage(){
    try{return root.localStorage||null;}catch(error){return null;}
  }
  if(applicationPreferences){
    var remembered=applicationPreferences.read(preferencesStorage());
    state.opticalQuality=remembered.opticalQuality;
    state.previewDetail=remembered.previewDetail;
    state.geometryBackend=remembered.geometryBackend;
    historyGallerySize=remembered.historyGallerySize;
    historyPinnedCollapsed=remembered.historyPinnedCollapsed;
    historyPanelOpen=remembered.historyPanelOpen;
    historyFilters=remembered.historyFilters;
    historyStoryboardQueue=remembered.historyStoryboardQueue.slice();
    displayPanels=Object.assign({},remembered.displayPanels);
    legacyDisplayPanels=Object.assign({},displayPanels);
    workspaceState={mode:remembered.workspace.mode,sceneTab:remembered.workspace.sceneTab,
      compareTab:remembered.workspace.compareTab,compareModel:remembered.workspace.compareModel,
      sections:Object.assign({},remembered.workspace.sections)};
    navigationPrefs=navigation?navigation.settings(remembered.navigation):remembered.navigation;
  }
  function preferencesStatus(message,error){
    var node=geometryUi('ModernPreferencesStatus');
    if(node){
      node.textContent=message;node.classList.toggle('is-error',!!error);
      // Success messages need not permanently occupy the Display pane.
      node.hidden=!error&&!/reset/i.test(message);
    }
  }
  function saveApplicationPreferences(){
    if(!applicationPreferences)return;
    try{
      if(!applicationPreferences.write(preferencesStorage(),{
        opticalQuality:state.opticalQuality,previewDetail:state.previewDetail,
        geometryBackend:state.geometryBackend,navigation:navigationPrefs,displayPanels:displayPanels,
        historyGallerySize:historyGallerySize,historyPinnedCollapsed:historyPinnedCollapsed,
        historyPanelOpen:historyPanelOpen,historyFilters:historyFilters,
        historyStoryboardQueue:historyStoryboardQueue,
        workspace:workspaceState
      }))preferencesStatus('Browser storage unavailable; changes will not survive reload.',true);
      else preferencesStatus('Application preferences saved in this browser.',false);
    }catch(error){preferencesStatus('Cannot save application preferences: '+error.message,true);}
  }
  var animationWorkspaceOpen=false;
  function syncWorkspaceVisibility(){
    var physical=newUiEl('ModernWorkspace'),animation=newUiEl('ModernAnimationWorkspace');
    if(physical)physical.hidden=animationWorkspaceOpen;
    if(animation){animation.hidden=!animationWorkspaceOpen;
      animation.classList.toggle('has-snapshot-picker',animationWorkspaceOpen&&studioPickerOpen);}

    var tab=newUiEl('ModernAnimationTab');
    if(tab){tab.classList.toggle('is-active',animationWorkspaceOpen);
      tab.setAttribute('aria-pressed',String(animationWorkspaceOpen));}
  }
  function workspaceScope(){return state.demosActive?'scene':state.mode==='compare'?'compare':'scene';}
  function workspaceSectionValue(scope,suffix){
    var key=scope+'.'+suffix;
    if(Object.prototype.hasOwnProperty.call(workspaceState.sections,key))return workspaceState.sections[key];
    // Migrate the original four Display folds without changing their old storage key.
    if(suffix.indexOf('display.')===0){
      // Read the old global Display choice only while no mode-specific Display
      // override exists. Otherwise a Scene toggle would leak into Compare
      // after the next reload through the old displayPanels mirror.
      var hasScopedDisplay=Object.keys(workspaceState.sections).some(function(section){
        return section.indexOf('.display.')!==-1;
      });
      if(!hasScopedDisplay){
        var old=suffix.slice('display.'.length);
        return Object.prototype.hasOwnProperty.call(legacyDisplayPanels,old)?legacyDisplayPanels[old]:false;
      }
      return false;
    }
    return workspaceInitialSections[suffix]===true;
  }
  function applyWorkspaceSections(){
    var scope=workspaceScope();
    workspaceSections.forEach(function(entry){
      var desired=workspaceSectionValue(scope,entry.suffix);
      if(entry.node.open!==desired)entry.node.open=desired;
      if(entry.suffix.indexOf('display.')===0)
        displayPanels[entry.suffix.slice('display.'.length)]=desired;
    });
  }
  function bindWorkspaceSections(){
    var elements=typeof document.querySelectorAll==='function'?
      document.querySelectorAll('details[data-workspace-section]'):null;
    if(elements&&elements.length){
      workspaceSections=Array.prototype.map.call(elements,function(node){
        return {node:node,suffix:node.getAttribute('data-workspace-section')};
      });
    }else{
      // Older embedded hosts and integration DOM fixtures do not implement
      // querySelectorAll. Keep optional native details (especially Display) live.
      workspaceSections=[
        ['ModernCameraPoseSection','camera.pose'],
        ['ModernCameraNavigationSection','camera.navigation'],
        ['ModernCameraAnimationSection','camera.animation'],
        ['ModernSavedCameraLibrary','camera.savedViews'],
        ['ModernCameraFrameNameSection','camera.frameName'],
        ['ModernSceneSurfaceGeometrySection','surface.geometry'],
        ['ModernCompareSurfaceGeometrySection','surface.geometry'],
        ['ModernSceneAtmosphereProfileSection','atmosphere.profile'],
        ['ModernCompareAtmosphereProfileSection','atmosphere.profile'],
        ['ModernSceneAtmosphereExplanationSection','atmosphere.explanation'],
        ['ModernCompareAtmosphereExplanationSection','atmosphere.explanation'],
        ['ModernSceneAtmosphereVisibilitySection','atmosphere.visibility'],
        ['ModernCompareAtmosphereVisibilitySection','atmosphere.visibility'],
        ['ModernSceneAtmosphereShimmerSection','atmosphere.shimmer'],
        ['ModernCompareAtmosphereShimmerSection','atmosphere.shimmer'],
        ['ModernObjectGroup0','objects.group1'],
        ['ModernObjectGroup1','objects.group2'],
        ['ModernObjectVariations0','objects.group1.variations'],
        ['ModernObjectVariations1','objects.group2.variations'],
        ['ModernDisplayAdvanced','display.advanced'],
        ['ModernDisplayDiagnostics','display.diagnostics'],
        ['ModernDisplayGpu','display.gpu'],
        ['ModernDisplayProfiler','display.profiler']
      ].map(function(entry){return {node:geometryUi(entry[0]),suffix:entry[1]};})
        .filter(function(entry){return !!entry.node;});
    }
    workspaceSections.forEach(function(entry){
      entry.node.addEventListener('toggle',function(){
        var key=workspaceScope()+'.'+entry.suffix;
        // Programmatic restoration of a mode-specific fold must not be saved
        // back as an explicit user preference (toggle events are asynchronous).
        if(entry.node.open===workspaceSectionValue(workspaceScope(),entry.suffix))return;
        workspaceState.sections[key]=entry.node.open;
        if(entry.suffix.indexOf('display.')===0){
          var shortKey=entry.suffix.slice('display.'.length);
          displayPanels[shortKey]=entry.node.open;
        }
        saveApplicationPreferences();
      });
    });
    applyWorkspaceSections();
  }
  function bindDisplayPanels(){
    // Preserve the existing Display entry point, but share the same per-mode
    // controller with Camera, Objects and all future native <details> folds.
    bindWorkspaceSections();
  }
  function syncHistoryFilterControls(){
    [['ModernHistoryFilterQuery','query'],['ModernHistoryFilterMode','mode'],
      ['ModernHistoryFilterGeometry','geometry'],
      ['ModernHistoryFilterAtmosphere','atmosphere'],
      ['ModernHistoryFilterGeometryRelation','geometryRelation'],
      ['ModernHistoryFilterRefractionRelation','refractionRelation']].forEach(function(pair){
      var node=newUiEl(pair[0]);if(node)node.value=historyFilters[pair[1]];
    });
  }
  function resetWorkspaceLayout(){
    workspaceState={mode:null,sceneTab:'Camera',compareTab:'Camera',compareModel:null,sections:{}};
    displayPanels={advanced:false,diagnostics:false,gpu:false,profiler:false};
    legacyDisplayPanels=Object.assign({},displayPanels);
    state.compareSelected='A';
    if(state.compareConfig)syncCompareEditor();
    // Do not render or alter the experiment when resetting the workspace.
    applyWorkspaceSections();
    if(typeof document.querySelector==='function')activateSettings('Camera',false,false);
    saveApplicationPreferences();
    preferencesStatus('Workspace layout reset to defaults.',false);
  }
  function bindApplicationPreferences(){
    var layoutButton=geometryUi('ModernResetWorkspace');
    if(layoutButton&&applicationPreferences)layoutButton.addEventListener('click',resetWorkspaceLayout);
    var button=geometryUi('ModernResetPreferences');
    if(!button||!applicationPreferences)return;
    button.addEventListener('click',function(){
      var storage=preferencesStorage(),cleared=false;
      try{cleared=applicationPreferences.reset(storage);}
      catch(error){preferencesStatus('Cannot reset stored preferences: '+error.message,true);return;}
      var defaults=applicationPreferences.defaults();
      state.opticalQuality=defaults.opticalQuality;
      state.previewDetail=defaults.previewDetail;
      state.geometryBackend=defaults.geometryBackend;
      historyGallerySize=defaults.historyGallerySize;
      historyPinnedCollapsed=defaults.historyPinnedCollapsed;
      historyPanelOpen=defaults.historyPanelOpen;
      historyFilters=defaults.historyFilters;
      historyStoryboardQueue=[];
      syncHistoryFilterControls();
      var historyPanel=newUiEl('ModernHistoryPanel'),historyToggle=newUiEl('ModernHistoryToggle');
      if(historyPanel)historyPanel.hidden=true;
      var historyBackdrop=newUiEl('ModernHistoryBackdrop');if(historyBackdrop)historyBackdrop.hidden=true;
      if(historyToggle)historyToggle.setAttribute('aria-expanded','false');
      if(historyUI)historyUI.hideInspector(newUiEl('ModernHistoryGallery'));
      var historySizeControl=newUiEl('ModernHistorySize');
      if(historySizeControl)historySizeControl.value=historyGallerySize;
      if(historyUI)historyUI.setSize(newUiEl('ModernHistoryGallery'),historyGallerySize);
      navigationPrefs=navigation?navigation.settings(defaults.navigation):defaults.navigation;
      displayPanels=Object.assign({},defaults.displayPanels);
      legacyDisplayPanels=Object.assign({},displayPanels);
      workspaceState={mode:defaults.workspace.mode,sceneTab:defaults.workspace.sceneTab,
        compareTab:defaults.workspace.compareTab,compareModel:defaults.workspace.compareModel,
        sections:Object.assign({},defaults.workspace.sections)};
      applyWorkspaceSections();
      // A full preference reset also restores visible tab/model selection.
      state.compareSelected='A';
      if(state.compareConfig)syncCompareEditor();
      if(typeof document.querySelector==='function')activateSettings('Camera',false,false);
      [['ModernOpticalQuality',state.opticalQuality],['ModernPreviewDetail',state.previewDetail],
        ['ModernGeometryBackend',state.geometryBackend],['ModernCameraMoveSpeed',navigationPrefs.speed],
        ['ModernCameraTurnRate',navigationPrefs.turnRate],['ModernCameraWheelStep',navigationPrefs.wheelStep]
      ].forEach(function(entry){var node=geometryUi(entry[0]);if(node)node.value=String(entry[1]);});
      updateNavigationPanelSummary();
      stopAutoCameraPreview();
      if(previewLodControllers){previewLodControllers.Scene.reset();previewLodControllers.compare.reset();}
      updateGeometryBackendStatus(null);updateOpticalQualityStatus();updatePreviewDetailStatus();redraw();
      preferencesStatus(cleared?'Application preferences reset to defaults.':
        'Defaults restored for this session; browser storage is unavailable.',!cleared);
    });
  }
  var model=new root.CurveAppClass();
  Object.assign(model,{
    DemoText:'Lake Pontchartrain Transmission Line',Description:'85 transmission towers across Lake Pontchartrain',
    Height:15,FocalLengthField:2000,Roll:0,Nick:0.0121,Pan:0.0464,
    CameraEast:0,CameraNorth:0,
    viewcenterHorizon:3,showModel:1,showGrid:1,showData:false,
    showTangent:false,showEyeLevel:false,deviceRatio:1.5,
    ObjType:[3,3],NObjects:[85,2],ObjDist:[50,25550],ObjDeltaDist:[297.55,373],
    ObjSideType:[0,0],ObjSidePos:[35,25.4],ObjSideVar:[0,0],
    ObjSizeType:[0,0],ObjSize:[23,64],ObjSizeVar:[0,0],rEarth:6371000
  });
  model.Update();
  if(root.CurvaturePhysicalSceneOptics&&typeof root.CurvaturePhysicalSceneOptics.create==='function'){
    state.compareCache.A=root.CurvaturePhysicalSceneOptics.create();
    state.compareCache.B=root.CurvaturePhysicalSceneOptics.create();
  }
  function el(id){return document.getElementById(id);}
  // Older isolated Node harnesses have no document.querySelector. These are
  // optional new presentation nodes, not new physical-model requirements.
  function newUiEl(id){return typeof document.querySelector==='function'?el(id):null;}
  function updateStatus(text,isError){
    var node=el('ModernStatus');
    if(node){node.textContent=text;node.classList.toggle('is-error',!!isError);}
  }
  function persistenceStatus(message,isError){
    var node=el('ModernPersistenceStatus');
    if(node){node.textContent=message||'';node.classList.toggle('is-error',!!isError);}
  }
  function experimentSnapshot(){
    if(!experiments||!compareState)return null;
    var config=state.compareConfig||compareState.initial(model,state.atmosphere,state.occlusionRadius,state.temperatureProfile,state.transitionProfile,state.inverseProfile);
    return experiments.capture(model,{
      atmosphere:state.atmosphere,occlusionRadius:state.occlusionRadius,
      visibility:state.visibility,temperatureProfile:state.temperatureProfile,
      transitionProfile:state.transitionProfile,inverseProfile:state.inverseProfile,preset:(el('ModernPreset')&&el('ModernPreset').value)||state.preset,
      resetPreset:state.preset
    },config,{mode:state.mode,eyeLevel:state.compareEyeLevel,
      horizon:state.compareHorizon,selected:state.compareSelected,
      gpuProbe:false,probeTargets:256,
      showTemperatureProfile:state.showTemperatureProfile,
      temperaturePlacement:state.temperaturePlacement,
      cameraPositions:cameraPositions,cameraSequence:cameraSequence}); // Keep legacy schema; never re-enable retired WebGPU.
  }
  function localSession(){
    if(!experiments)return null;
    try{
      var storage=preferencesStorage(),raw=storage&&storage.getItem(experiments.STORAGE_KEY);
      if(!raw)return null;
      var timestamp=sessionAutosave&&storage.getItem(sessionAutosave.META_KEY);
      var savedAt=timestamp&&Number(timestamp);
      return {experiment:experiments.validate(JSON.parse(raw)),
        savedAt:Number.isSafeInteger(savedAt)&&savedAt>0?savedAt:null};
    }catch(error){return null;}
  }
  function storeExperiment(){
    if(!persistence.ready||!persistence.dirty||!experiments||!root.location)return;
    var current;
    try{current=experimentSnapshot();}
    catch(error){persistenceStatus('Cannot save working session: '+error.message,true);return;}
    var errors=[],saved=false,localSaved=false,idbPending=false;
    var timestamp=Math.max(Date.now(),persistence.latestTimestamp+1);
    persistence.latestTimestamp=timestamp;
    try{
      var storage=preferencesStorage();
      if(storage){
        // This legacy-compatible synchronous slot is critical on pagehide:
        // the browser is free to cancel unfinished IndexedDB transactions.
        storage.setItem(experiments.STORAGE_KEY,JSON.stringify(current));
        if(sessionAutosave)storage.setItem(sessionAutosave.META_KEY,String(timestamp));
        saved=true;localSaved=true;
      }
    }catch(error){errors.push('browser storage: '+error.message);}
    // Serialize async checkpoints so an older transaction cannot overwrite
    // the final state if the user changes physics during an ongoing write.
    if(sessionAutosave&&root.indexedDB){
      idbPending=true;
      persistence.pendingCheckpoint=persistence.pendingCheckpoint.catch(function(){}).then(function(){
        return sessionAutosave.write(root.indexedDB,current,timestamp);
      }).then(function(){
        if(timestamp===persistence.latestTimestamp)persistenceStatus('Working session saved');
      },function(error){
        if(timestamp===persistence.latestTimestamp)persistenceStatus(
          (localSaved?'Session saved locally, but IndexedDB failed: ':'Session checkpoint unavailable: ')+error.message,true);
      });
      saved=true;
    }
    if(!saved){persistenceStatus('Working-session storage unavailable',true);return;}
    persistence.dirty=false;
    // The automatically generated URL must never rewrite an incoming shared
    // experiment URL. Explicit shared links always keep their original query.
    if(persistence.explicitUrl&&root.history&&root.location.href){
      // The first arrival through a shared URL must win. After the user edits
      // that same history entry, a refresh should resume their live work while
      // keeping the publicly shareable URL bytes completely unchanged.
      try{
        var previousShared=root.history.state;
        var sharedState=Object.assign({},previousShared&&typeof previousShared==='object'?previousShared:{});
        sharedState[EDITED_SHARED_URL_KEY]=root.location.href;
        root.history.replaceState(sharedState,'',root.location.href);
      }catch(error){errors.push('shared-link workspace: '+error.message);}
    }
    if(!persistence.explicitUrl&&root.history&&root.location.href){
      try{
        var url=new URL(root.location.href);
        if(!url.searchParams.has('state')){
          var previous=root.history.state;
          var historyState=Object.assign({},previous&&typeof previous==='object'?previous:{});
          historyState[AUTO_EXPERIMENT_HISTORY_KEY]=true;
          root.history.replaceState(historyState,'',experiments.urlWithExperiment(url.href,current));
        }
      }catch(error){errors.push('URL: '+error.message);}
    }
    if(errors.length)persistenceStatus('Partial save: '+errors.join('; '),true);
    else if(idbPending)persistenceStatus(localSaved?'Working session saved locally; syncing…':'Saving working session…');
    else persistenceStatus('Working session saved locally');
  }
  function scheduleExperimentSave(){
    if(!persistence.ready||!experiments||!root.location)return;
    updateSnapshotSaveAction();
    persistence.dirty=true;
    if(persistence.timer!==null)clearTimeout(persistence.timer);
    persistence.timer=setTimeout(function(){persistence.timer=null;storeExperiment();},550);
  }
  function flushWorkingSession(){
    if(!persistence.ready||!persistence.dirty)return;
    if(persistence.timer!==null){clearTimeout(persistence.timer);persistence.timer=null;}
    storeExperiment();
  }
  function bindWorkingSessionLifecycle(){
    if(root.addEventListener){
      root.addEventListener('pagehide',flushWorkingSession);
      // On mobile pagehide can be skipped when the browser is suspended.
      root.addEventListener('beforeunload',flushWorkingSession);
    }
    if(document.addEventListener)document.addEventListener('visibilitychange',function(){
      if(document.hidden)flushWorkingSession();
    });
  }
  // History lives in IndexedDB, not in the URL/legacy history or localStorage.
  // A render produces an auto snapshot only after active physical inputs have
  // changed; camera gestures, keyframe playback, editor tabs and demo playback
  // cannot fill the journal with near-duplicates.
  var experimentHistory=null,historyBaseline=null,historyTimer=null,historyEpoch=0;
  var savedHistorySignatures=null,snapshotSaveBusy=false;
  var historyLoadError=null,snapshotSaveError=null;
  // This is an in-memory index of persisted full-state signatures. Never query
  // IndexedDB or calculate optics while toggling the Save Snapshot affordance.
  function updateSnapshotSaveAction(){
    var bar=newUiEl('ModernSnapshotSaveBar'),button=newUiEl('ModernSnapshotSave');
    var status=newUiEl('ModernSnapshotSaveStatus');
    if(!button||!status)return;
    if(bar)bar.hidden=!!state.demosActive;
    button.hidden=true;button.disabled=snapshotSaveBusy;
    if(state.demosActive){status.textContent='';return;}
    if(!persistence.ready){status.textContent='Preparing current experiment…';return;}
    if(historyLoadError){status.textContent='History unavailable: '+historyLoadError;return;}
    if(!savedHistorySignatures){status.textContent='Checking History…';return;}
    try{
      var signature=historyFingerprint.exactSignature(experimentSnapshot());
      var existing=savedHistorySignatures.get(signature);
      if(existing){
        status.textContent=existing.pinned?'Already in History · protected':
          existing.source==='auto'?'Already in History · automatic (pin it in History to keep it)':
          'Already in History · saved';
      }else{
        status.textContent=snapshotSaveBusy?'Saving snapshot…':
          snapshotSaveError?'Save failed: '+snapshotSaveError:'Not yet saved in History';
        button.hidden=false;
      }
    }catch(error){status.textContent='Snapshot unavailable: '+error.message;}
  }
  var historyMultiSelection=Object.create(null);
  var historyShownIds=[];
  var historyRenderedKeys={Scene:null,A:null,B:null};
  var HISTORY_IDLE_MS=1600;
  // Timestamped physical renders are the only eligible screenshot sources.
  // In Compare a partial A/B redraw is safe ONLY if the untouched side still
  // matches its own current physical state and the shared camera/objects.
  function historyViewKey(snapshot,view){
    return thumbnailApi.viewKey(snapshot,view);
  }
  function markHistoryRendered(view){
    historyRenderedKeys[view]=null;
    if(!experiments||!thumbnailApi||effectiveOpticalQuality()!=='accurate')return;
    try{historyRenderedKeys[view]=historyViewKey(experimentSnapshot(),view);}
    catch(ignore){}
  }
  function historyCanvasLayers(view){
    var g=view==='Scene'?graph:state.compareGraphs[view];
    var base=g&&g.Canvas;
    if(!base||!base.width||!base.height)return null;
    if(atmosphericPresentation&&atmosphericPresentation.ready(view)&&
      typeof atmosphericPresentation.getGuideCanvas==='function'){
      var image=atmosphericPresentation.getCanvas(view);
      var guides=atmosphericPresentation.getGuideCanvas(view);
      if(image&&guides)return [image,guides];
    }
    return [base];
  }
  function historyThumbnail(snapshot){
    if(!thumbnailApi||effectiveOpticalQuality()!=='accurate'||state.frame!==null)return null;
    var mode=snapshot.display.mode;
    if(mode!=='scene'&&mode!=='compare')return null;
    var views=mode==='scene'?['Scene']:['A','B'];
    var sources=[];
    for(var i=0;i<views.length;i++){
      var view=views[i];
      if(historyRenderedKeys[view]!==historyViewKey(snapshot,view))return null;
      var layers=historyCanvasLayers(view);
      if(!layers)return null;
      sources.push({layers:layers});
    }
    return thumbnailApi.capture(document,mode,sources);
  }
  function historyStatus(message,error){
    var node=newUiEl('ModernHistoryStatus');
    if(node){node.textContent=message;node.classList.toggle('is-error',!!error);}
  }
  function cancelHistoryAuto(){
    historyEpoch++;
    if(historyTimer!==null){clearTimeout(historyTimer);historyTimer=null;}
  }
  function historyPhysicalSignature(){
    return historyFingerprint.physicalSignature(experimentSnapshot());
  }
  function resetHistoryBaseline(){
    cancelHistoryAuto();
    try{historyBaseline=historyPhysicalSignature();}
    catch(error){historyBaseline=null;}
  }
  function queueHistoryAuto(){
    if(!experimentHistory||!persistence.ready||state.demosActive||cameraTransition||autoCameraActive)return;
    var key;
    try{key=historyPhysicalSignature();}
    catch(error){return;}
    if(key===historyBaseline){cancelHistoryAuto();return;}
    cancelHistoryAuto();
    var generation=historyEpoch;
    historyTimer=setTimeout(function(){
      historyTimer=null;
      if(!persistence.ready||state.demosActive||cameraTransition||autoCameraActive)return;
      var snapshot,signature;
      try{snapshot=experimentSnapshot();signature=historyFingerprint.physicalSignature(snapshot);}
      catch(error){historyStatus('Auto-history capture failed: '+error.message,true);return;}
      if(signature===historyBaseline)return;
      experimentHistory.record(snapshot,'auto',historyThumbnail(snapshot)).then(function(result){
        if(generation===historyEpoch)historyBaseline=signature;
        if(result.created&&generation===historyEpoch)refreshHistoryList();
      },function(error){historyStatus('Auto-history unavailable: '+error.message,true);});
    },HISTORY_IDLE_MS);
  }
  function historySelectedIds(){
    return Object.keys(historyMultiSelection).filter(function(id){return historyMultiSelection[id];})
      .map(Number).filter(Number.isSafeInteger);
  }
  function historyVisibleSelectedIds(){
    var shown=new Set(historyShownIds);
    return historySelectedIds().filter(function(id){return shown.has(id);});
  }
  function historyMultiCount(){
    var count=historyVisibleSelectedIds().length;
    var node=newUiEl('ModernHistoryMultiCount');
    if(node)node.textContent=count+' shown '+(count===1?'snapshot':'snapshots')+' selected';
    ['ModernHistoryClearChecked','ModernHistoryPinChecked','ModernHistoryDeleteChecked',
      'ModernHistoryQueueChecked'].forEach(function(id){
      var button=newUiEl(id);if(button)button.disabled=count===0;
    });
    var select=newUiEl('ModernHistorySelectVisible');
    if(select)select.disabled=!historyShownIds.length||count===historyShownIds.length;
  }
  function renderHistoryStoryboard(entries){
    var count=newUiEl('ModernHistoryQueueCount');
    if(count)count.textContent=historyStoryboardQueue.length+' '+
      (historyStoryboardQueue.length===1?'frame':'frames');
    ['ModernHistoryQueueClear','ModernHistoryQueueOpen'].forEach(function(id){
      var button=newUiEl(id);if(button)button.disabled=historyStoryboardQueue.length===0;
    });
  }
  // Animation Studio has its OWN single editable checkpoint. Never put the
  // draft into the physical experiment URL, Session Autosave or History.
  // LocalStorage is updated synchronously on edit for F5/pagehide; IndexedDB
  // writes are debounced and serialized so late transactions cannot win.
  function studioDraftStatus(message,error){
    var node=newUiEl('ModernAnimationDraftStatus');
    if(node){node.textContent=message;node.classList.toggle('is-error',!!error);}
  }
  function studioLibraryDirty(){
    if(!studioLibraryActive)return false;
    try{return studioPlaybackQuality!==studioLibraryActive.quality||
      JSON.stringify(studioApi.build(studioDraft,studioLibraryActive.id))!==
      JSON.stringify(studioLibraryActive.project);}
    catch(error){return true;}
  }
  function renderStudioLibrary(){
    if(!studioUI||!studioUI.renderLibrary)return;
    var host=newUiEl('ModernAnimationLibrary');
    var previous=host&&host.querySelector&&host.querySelector('.modern-animation-library-gallery');
    if(previous)studioLibraryScroll=previous.scrollLeft;
    studioUI.renderLibrary(document,host,studioLibraryEntries,{
      selectedId:studioLibrarySelected,activeId:studioLibraryActive&&studioLibraryActive.id,
      canSave:!!(studioApi&&studioDraft&&studioApi.inspect(studioDraft).compatible),
      dirty:studioLibraryDirty(),busy:studioLibraryBusy,
      expanded:studioLibraryExpanded,renameId:studioLibraryRenamingId,
      duplicate:studioLibraryDuplicate,showDuplicates:studioLibraryShowDuplicates,
      duplicateGroups:studioLibrary&&studioLibrary.findDuplicates?
        studioLibrary.findDuplicates(studioLibraryEntries):[],
      message:studioLibraryMessage,error:studioLibraryError
    },{
      select:function(id){studioLibrarySelected=id;renderStudioLibrary();},
      toggleExpanded:function(){studioLibraryExpanded=!studioLibraryExpanded;renderStudioLibrary();},
      toggleDuplicates:function(){studioLibraryShowDuplicates=!studioLibraryShowDuplicates;renderStudioLibrary();},
      openDuplicate:function(){if(studioLibraryDuplicate)openNamedAnimation(studioLibraryDuplicate.id);},
      forceCopy:function(){saveNamedAnimation(false,true);},
      renameStart:function(id){studioLibraryRenamingId=id;studioLibraryExpanded=true;renderStudioLibrary();},
      renameCancel:function(){studioLibraryRenamingId='';renderStudioLibrary();},
      rename:function(id,name){renameNamedAnimation(id,name);},
      save:function(){saveNamedAnimation(false);},
      saveAs:function(){saveNamedAnimation(false);},
      saveChanges:function(){saveNamedAnimation(true);},
      exportSelected:function(){exportNamedAnimations(false);},
      exportAll:function(){exportNamedAnimations(true);},
      importFile:function(file){importNamedAnimations(file);},
      open:function(id){openNamedAnimation(id);},
      remove:function(id){deleteNamedAnimation(id);}
    });
    var gallery=host&&host.querySelector&&host.querySelector('.modern-animation-library-gallery');
    if(gallery)gallery.scrollLeft=studioLibraryScroll;
  }
  function studioLibraryNotice(message,error){
    studioLibraryMessage=message;studioLibraryError=!!error;renderStudioLibrary();
  }
  function refreshStudioLibrary(){
    if(!studioLibrary){
      studioLibraryNotice('Animation Library module failed to load; check the browser console.',true);
      return Promise.resolve([]);
    }
    if(!root.indexedDB){
      studioLibraryNotice('Named animations require browser IndexedDB storage.',true);
      return Promise.resolve([]);
    }
    return studioLibrary.list(root.indexedDB).then(function(entries){
      studioLibraryEntries=entries;
      if(studioLibraryPending){
        var match=entries.find(function(e){return e.id===studioLibraryPending.id;});
        if(match&&match.updatedAt===studioLibraryPending.revision){
          studioLibraryActive=match;
        }else{
          studioLibraryActive=null;
          studioLibraryMessage='Previous saved project was changed or removed. Your draft is safe; use Save As.';
          studioLibraryError=true;
        }
        studioLibraryPending=null;
      }
      if(studioLibrarySelected&&!entries.some(function(e){return e.id===studioLibrarySelected;}))
        studioLibrarySelected='';
      if(studioLibraryRenamingId&&!entries.some(function(e){return e.id===studioLibraryRenamingId;}))
        studioLibraryRenamingId='';
      if(studioLibraryActive)studioLibrarySelected=studioLibraryActive.id;
      renderStudioLibrary();return entries;
    }).catch(function(error){studioLibraryNotice('Animation Library unavailable: '+error.message,true);return [];});
  }
  function exportNamedAnimations(all){
    if(!studioLibrary||studioLibraryBusy)return;
    try{
      var entries=all?studioLibraryEntries:studioLibraryEntries.filter(function(entry){
        return entry.id===studioLibrarySelected;
      });
      if(!entries.length)throw Error('Select a saved animation first');
      downloadHistoryJson(studioLibrary.exportPortable(entries),
        all?'curvature-animations.json':'curvature-animation.json');
      studioLibraryNotice('Exported '+entries.length+' complete animation'+
        (entries.length===1?'':'s')+' to portable JSON.',false);
    }catch(error){studioLibraryNotice('Animation export failed: '+error.message,true);}
  }
  function importNamedAnimations(file){
    if(studioLibraryBusy||!studioLibrary||!file)return;
    if(!root.indexedDB){studioLibraryNotice('Animation Library requires IndexedDB.',true);return;}
    if(file.size>studioLibrary.MAX_PORTABLE_LENGTH){
      studioLibraryNotice('Animation JSON file is too large.',true);return;
    }
    studioLibraryBusy=true;studioLibraryNotice('Checking animation JSON…',false);
    Promise.resolve().then(function(){return file.text();}).then(function(contents){
      var entries=studioLibrary.parsePortable(contents);
      return studioLibrary.importEntries(root.indexedDB,entries,undefined,root.crypto);
    }).then(function(result){
      studioLibraryExpanded=true;
      studioLibrarySelected=result.createdIds[0]||result.reusedIds[0]||studioLibrarySelected;
      studioLibraryMessage='Imported '+result.created+' animations; '+result.reused+
        ' already present (including repeated entries in the file). Working draft unchanged.';
      studioLibraryError=false;
      return refreshStudioLibrary();
    }).catch(function(error){
      studioLibraryMessage='Animation import failed: '+error.message;
      studioLibraryError=true;
    }).then(function(){studioLibraryBusy=false;renderStudioLibrary();});
  }
  function bindStudioLibrary(){refreshStudioLibrary();}
  function studioLibraryThumbnail(project){
    // The library owns its preview. Never use a History screenshot if the
    // first frame's actual physical state no longer matches that snapshot.
    if(!studioDraft||!studioDraft.frames.length||!thumbnailApi)return null;
    var first=studioDraft.frames[0];
    var found=studioHistoryEntries.find(function(e){return e.id===first.sourceSnapshotId;});
    if(found&&found.thumbnail&&JSON.stringify(found.experiment)===
       JSON.stringify(project.baseExperiment))
      return thumbnailApi.validate(found.thumbnail,project.baseExperiment.display.mode);
    if(studioLibraryActive&&studioLibraryActive.thumbnail&&
       JSON.stringify(studioLibraryActive.project.baseExperiment)===
       JSON.stringify(project.baseExperiment))return studioLibraryActive.thumbnail;
    return null;
  }
  function renameNamedAnimation(id,name){
    if(studioLibraryBusy||!studioLibrary)return;
    var current=studioLibraryEntries.find(function(entry){return entry.id===id;});
    if(!current){studioLibraryNotice('Saved animation no longer exists.',true);return;}
    studioLibraryBusy=true;renderStudioLibrary();
    studioLibrary.rename(root.indexedDB,id,name,current.updatedAt).then(function(saved){
      // Keep any unsaved physical edits to the current working draft. Rename
      // updates metadata only; don't silently apply Save Changes.
      if(studioLibraryActive&&studioLibraryActive.id===id){
        var updateDraftName=studioDraft.name===studioLibraryActive.project.name;
        studioLibraryActive=saved;
        if(updateDraftName){
          studioDraft=studioApi.edit(studioDraft,'name',saved.project.name);
          saveStudioDraft(false);
          renderAnimationStudio(studioHistoryEntries);
        }
      }
      studioLibraryRenamingId='';studioLibrarySelected=id;
      studioLibraryMessage='Renamed saved animation to '+saved.project.name;
      studioLibraryError=false;
      return refreshStudioLibrary();
    }).catch(function(error){
      studioLibraryMessage='Cannot rename animation: '+error.message;
      studioLibraryError=true;
    }).then(function(){studioLibraryBusy=false;renderStudioLibrary();});
  }
  function saveNamedAnimation(replace,forceDuplicate){
    if(!studioLibrary||studioLibraryBusy)return;
    var project,quality=studioPlaybackQuality,active=studioLibraryActive;
    try{
      if(replace&&!active)throw Error('Open a saved animation before using Save Changes');
      var id=replace?active.id:studioLibrary.makeId(root.crypto);
      project=studioApi.build(studioDraft,id);
    }catch(error){studioLibraryNotice('Cannot save animation: '+error.message,true);return;}
    var key=studioLibrary.fingerprint(project);
    if(forceDuplicate&&(!studioLibraryDuplicate||studioLibraryDuplicate.fingerprint!==key)){
      studioLibraryDuplicate=null;
      studioLibraryNotice('Animation changed; try Save As again before creating a copy.',true);
      return;
    }
    if(!forceDuplicate)studioLibraryDuplicate=null;
    var image=studioLibraryThumbnail(project);
    studioLibraryBusy=true;studioLibraryNotice('Saving named animation…',false);
    var operation=replace?
      studioLibrary.update(root.indexedDB,project,quality,active.updatedAt,undefined,image):
      studioLibrary.create(root.indexedDB,project,quality,undefined,image,!!forceDuplicate);
    operation.then(function(saved){
      studioLibraryActive=saved;studioLibraryPending=null;studioLibraryDuplicate=null;
      studioLibrarySelected=saved.id;
      studioLibraryMessage=(replace?'Saved changes to ':'Saved new animation: ')+saved.project.name;
      studioLibraryError=false;
      saveStudioDraft(false);
      return refreshStudioLibrary();
    }).catch(function(error){
      if(error.code==='ANIMATION_DUPLICATE'){
        studioLibraryDuplicate={id:error.existingId,name:error.existingName,fingerprint:key};
        studioLibrarySelected=error.existingId;
        studioLibraryNotice('This animation is already saved as '+error.existingName+'.',false);
      }else studioLibraryNotice('Animation was not saved: '+error.message,true);
    })
      .then(function(){studioLibraryBusy=false;renderStudioLibrary();});
  }
  function openNamedAnimation(id){
    if(id)studioLibrarySelected=id;
    if(!studioLibrarySelected||studioLibraryBusy||!studioLibrary)return;
    if(studioDraft&&studioDraft.frames.length&&
      (!studioLibraryActive||studioLibraryDirty())&&typeof root.confirm==='function'&&
      !root.confirm('Opening a saved animation replaces the current draft. Continue?'))return;
    var id=studioLibrarySelected,startGeneration=studioDraftGeneration;
    studioLibraryBusy=true;renderStudioLibrary();
    studioLibrary.get(root.indexedDB,id).then(function(record){
      if(!record)throw Error('Saved animation no longer exists');
      var draft=studioApi.fromProject(record.project); // validate before touching live draft
      if(studioDraftGeneration!==startGeneration)
        throw Error('Draft changed while opening; current edits were kept');
      stopStudioPlayback(true);
      studioDraft=draft;studioSelectedKey=draft.frames[0].key;
      studioFilmstripScroll=0;studioLibraryActive=record;studioLibraryPending=null;
      studioLibraryDuplicate=null;
      studioPlaybackQuality=record.quality;
      studioPrepared=studioApi.build(draft,'studio_draft');
      studioPlayback=studioPlaybackApi?studioPlaybackApi.create(studioPrepared):null;
      studioPlaybackLastPaint=-Infinity;studioPlaybackRenderedAt=null;
      studioRestorePreviewPending=!!studioPlayback;
      var optics=newUiEl('ModernAnimationPlaybackOptics');if(optics)optics.value=record.quality;
      saveStudioDraft(false);syncStudioPlaybackControls();
      if(studioPlayback&&animationWorkspaceOpen)scheduleStudioInitialPaint('library');
      if(experimentHistory)refreshHistoryList().catch(function(){renderAnimationStudio([]);});
      else renderAnimationStudio([]);
      studioLibraryMessage='Opened '+record.project.name+' · playback paused at first frame.';
      studioLibraryError=false;
    }).catch(function(error){studioLibraryMessage='Cannot open animation: '+error.message;
      studioLibraryError=true;}).then(function(){studioLibraryBusy=false;renderStudioLibrary();});
  }
  function deleteNamedAnimation(id){
    if(id)studioLibrarySelected=id;
    if(!studioLibrarySelected||studioLibraryBusy||!studioLibrary)return;
    var id=studioLibrarySelected,found=studioLibraryEntries.find(function(e){return e.id===id;});
    if(typeof root.confirm==='function'&&!root.confirm('Delete saved animation "'+
      (found?found.project.name:id)+'"? The current draft will remain available.'))return;
    studioLibraryBusy=true;renderStudioLibrary();
    studioLibrary.remove(root.indexedDB,id).then(function(removed){
      if(studioLibraryActive&&studioLibraryActive.id===id){
        studioLibraryActive=null;studioLibraryPending=null;saveStudioDraft(false);
      }
      studioLibrarySelected='';
      studioLibraryMessage=removed?'Saved animation deleted. Current draft was not deleted.':
        'Animation was already removed.';
      studioLibraryError=false;
      return refreshStudioLibrary();
    }).catch(function(error){studioLibraryMessage='Cannot delete animation: '+error.message;
      studioLibraryError=true;}).then(function(){studioLibraryBusy=false;renderStudioLibrary();});
  }
  function studioDraftRecord(){
    var stamp=Math.max(Date.now(),studioDraftSavedAt+1);
    var record=studioDraftAutosave.checkpoint({draft:studioDraft,
      selectedKey:studioSelectedKey,quality:studioPlaybackQuality,
      prepared:!!studioPrepared,
      libraryId:studioLibraryActive?studioLibraryActive.id:
        studioLibraryPending?studioLibraryPending.id:null,
      libraryRevision:studioLibraryActive?studioLibraryActive.updatedAt:
        studioLibraryPending?studioLibraryPending.revision:null,
      positionMs:studioPlayback?studioPlayback.status().positionMs:0},stamp);
    studioDraftSavedAt=stamp;
    return record;
  }
  function writeStudioDraftIndexedDB(){
    if(studioDraftSaveTimer!==null){clearTimeout(studioDraftSaveTimer);studioDraftSaveTimer=null;}
    if(!studioDraftCheckpoint||!root.indexedDB||!studioDraftAutosave)return;
    var checkpoint=studioDraftCheckpoint;
    studioDraftWriteQueue=studioDraftWriteQueue.catch(function(){return null;}).then(function(){
      return studioDraftAutosave.write(root.indexedDB,checkpoint);
    }).catch(function(error){
      studioDraftStatus('Animation draft saved locally; IndexedDB unavailable: '+error.message,true);
    });
  }
  function saveStudioDraft(throttled){
    if(!studioDraftAutosave||!studioDraft)return;
    var now=Date.now();
    if(throttled&&now-studioDraftLastPositionSave<1200)return;
    studioDraftLastPositionSave=now;
    studioDraftGeneration++;
    try{
      studioDraftCheckpoint=studioDraftRecord();
      var saved=false;
      try{saved=studioDraftAutosave.writeLocal(preferencesStorage(),studioDraftCheckpoint);}
      catch(error){studioDraftStatus('Local animation backup failed: '+error.message+'; trying IndexedDB.',true);}
      if(!saved&&!root.indexedDB)studioDraftStatus('Animation draft cannot be saved: browser storage unavailable.',true);
      else if(saved)studioDraftStatus('Animation draft autosaved · paused position and keyframes will restore after reload.',false);
      if(studioDraftSaveTimer!==null)clearTimeout(studioDraftSaveTimer);
      studioDraftSaveTimer=setTimeout(writeStudioDraftIndexedDB,450);
    }catch(error){studioDraftStatus('Animation draft save failed: '+error.message,true);}
  }
  function restoreStudioDraft(record){
    if(!record||!studioDraftAutosave||!studioApi)return;
    // Records are strictly versioned and include full owned experiments. An
    // incompatible animation is a valid draft, but must not auto-prepare.
    var saved=studioDraftAutosave.normalize(record);
    studioDraft=saved.draft;studioSelectedKey=saved.selectedKey;
    studioPlaybackQuality=saved.quality;studioDraftSavedAt=saved.savedAt;
    studioLibraryActive=null;
    studioLibraryPending=saved.libraryId?{id:saved.libraryId,revision:saved.libraryRevision}:null;
    studioPrepared=null;studioPlayback=null;studioPlaybackRenderedAt=null;
    cancelStudioInitialPaint();
    studioPlaybackLastPaint=-Infinity;studioRestorePreviewPending=false;
    if(saved.prepared&&studioPlaybackApi){
      try{
        studioPrepared=studioApi.build(studioDraft,'studio_draft');
        studioPlayback=studioPlaybackApi.create(studioPrepared);
        studioPlayback.seek(saved.positionMs,profileNow());
        studioRestorePreviewPending=true;
      }catch(error){studioPrepared=null;studioPlayback=null;
        studioDraftStatus('Draft restored; re-prepare it to play: '+error.message,true);}
    }
    var optics=newUiEl('ModernAnimationPlaybackOptics');
    if(optics)optics.value=studioPlaybackQuality;
    syncStudioPlaybackControls();
    if(studioPlayback&&animationWorkspaceOpen)scheduleStudioInitialPaint('restored');
  }
  function bindStudioDraftPersistence(){
    if(!studioDraftAutosave)return;
    var local=studioDraftAutosave.readLocal(preferencesStorage());
    if(local){try{restoreStudioDraft(local);
      studioDraftStatus('Animation draft restored from browser backup (playback paused).',false);
    }catch(error){studioDraftStatus('Animation draft backup could not be restored: '+error.message,true);}}
    var generation=studioDraftGeneration;
    if(root.indexedDB)studioDraftAutosave.read(root.indexedDB).then(function(remote){
      if(studioDraftGeneration!==generation)return; // never overwrite new user edits
      var best=studioDraftAutosave.newer(local,remote);
      if(best&&(!local||best.savedAt>local.savedAt)){
        restoreStudioDraft(best);studioDraftCheckpoint=best;
        studioDraftStatus('Animation draft restored from IndexedDB (playback paused).',false);
        if(experimentHistory)refreshHistoryList().catch(function(){/* retain restored draft */});
        if(studioLibraryPending)refreshStudioLibrary();
      }
    }).catch(function(error){
      if(!local)studioDraftStatus('Animation draft recovery unavailable: '+error.message,true);
    });
    if(root.addEventListener){
      root.addEventListener('pagehide',function(){
        if(studioDraftGeneration){saveStudioDraft(false);writeStudioDraftIndexedDB();}
      });
      root.addEventListener('beforeunload',function(){
        if(studioDraftGeneration){saveStudioDraft(false);writeStudioDraftIndexedDB();}
      });
    }
    if(document.addEventListener)document.addEventListener('visibilitychange',function(){
      if(document.hidden&&studioDraftGeneration){saveStudioDraft(false);writeStudioDraftIndexedDB();}
    });
  }
  // Staging IDs survive History filtering; actual animation states are copied
  // into the draft only on explicit hand-off. Missing IDs are pruned by History.
  function stopStudioPlayback(clear){
    if(clear)cancelStudioInitialPaint();
    if(studioPlaybackFrame!==null){cancelAnimationFrame(studioPlaybackFrame);studioPlaybackFrame=null;}
    if(studioPlayback)studioPlayback.pause(profileNow());
    if(clear){studioPlayback=null;studioPlaybackLastPaint=-Infinity;studioPlaybackRenderedAt=null;
      studioLastQualityFrame=null;studioLastParity=null;}
    syncStudioPlaybackControls();
  }
  function syncStudioPlaybackControls(){
    var stage=newUiEl('ModernAnimationPlaybackStage');
    if(!stage)return;
    var ready=!!(studioPrepared&&studioPlayback);
    stage.hidden=!ready;
    syncStudioFrameExportControls();
    if(!ready)return;
    var info=studioPlayback.status();
    var seek=newUiEl('ModernAnimationPlaybackSeek');
    if(seek)seek.value=String(info.durationMs?Math.round(1000*info.positionMs/info.durationMs):0);
    var clock=newUiEl('ModernAnimationPlaybackTime');
    if(clock)clock.textContent=(info.positionMs/1000).toFixed(1)+' / '+(info.durationMs/1000).toFixed(1)+' s'+
      (studioPlaybackRenderedAt!==null&&Math.abs(info.positionMs-studioPlaybackRenderedAt)>500?
        ' (image at '+(studioPlaybackRenderedAt/1000).toFixed(1)+'s)':'');
    var play=newUiEl('ModernAnimationPlaybackPlay');if(play)play.disabled=info.playing;
    var pause=newUiEl('ModernAnimationPlaybackPause');if(pause)pause.disabled=!info.playing;
  }
  function previewGraphsReady(){
    var graphs=root.CurvatureModernAnimationGraphs;
    return !!(graphs&&graphs.A&&graphs.B&&graphs.A.Canvas&&graphs.B.Canvas);
  }
  function attachStudioPreviewGraphs(){
    if(!previewGraphsReady())return false;
    ['A','B'].forEach(function(side){
      var host=newUiEl('ModernAnimationCanvas'+side),graph=root.CurvatureModernAnimationGraphs[side];
      if(host&&graph.ContainerDiv&&graph.ContainerDiv.parentNode!==host)
        host.appendChild(graph.ContainerDiv);
    });
    return true;
  }
  // GraphX3DX starts in a hidden bootstrap container and its canvas can be
  // resized/cleared when the independent viewport first becomes visible.
  // Paint AFTER layout, not during draft recovery or while the panel is hidden.
  // A later restore/prepare/seek invalidates pending callbacks by generation.
  function cancelStudioInitialPaint(){
    studioInitialPaintToken++;
    if(studioInitialPaintFrame!==null){cancelAnimationFrame(studioInitialPaintFrame);
      studioInitialPaintFrame=null;}
  }
  function studioFrameLoading(loading,message){
    ['A','B'].forEach(function(side){
      var notice=newUiEl('ModernAnimationFrameLoading'+side);
      if(notice){notice.hidden=!loading;if(loading)notice.textContent=message;}
    });
  }
  function scheduleStudioInitialPaint(reason){
    if(!studioPlayback||!studioPrepared)return;
    studioRestorePreviewPending=true;
    cancelStudioInitialPaint();
    if(!animationWorkspaceOpen||document.hidden)return;
    var token=studioInitialPaintToken,attempts=0;
    var position=studioPlayback.status().positionMs;
    studioFrameLoading(true,'Rendering physical frame at '+(position/1000).toFixed(2)+' s…');
    var status=newUiEl('ModernAnimationPlaybackStatus');
    if(status)status.textContent=(reason==='restored'?'Restored project · ':'')+
      'Rendering the '+(position===0?'first':'saved')+' frame (playback paused)…';
    // Two layout frames allow the hidden workspace and its parser-created
    // GraphX3DX canvas to acquire final dimensions before pixel painting.
    function next(){studioInitialPaintFrame=requestAnimationFrame(paint);}
    function paint(){
      studioInitialPaintFrame=null;
      if(token!==studioInitialPaintToken||!studioPlayback||!studioPrepared||
         !animationWorkspaceOpen||document.hidden)return;
      var host=newUiEl('ModernAnimationCanvasA');
      if(host&&typeof host.getBoundingClientRect==='function'&&
         host.getBoundingClientRect().width<2&&attempts++<12){next();return;}
      try{
        studioPlaybackLastPaint=-Infinity;
        renderStudioPlaybackSample(true);
        studioRestorePreviewPending=false;
        studioFrameLoading(false,'');
        syncStudioPlaybackControls();
        var ready=newUiEl('ModernAnimationPlaybackStatus');
        if(ready)ready.textContent='Frame at '+(studioPlaybackRenderedAt/1000).toFixed(2)+
          ' s ready · playback paused.';
      }catch(error){
        studioFrameLoading(true,'Physical frame unavailable · use Retry frame');
        var failed=newUiEl('ModernAnimationPlaybackStatus');
        if(failed)failed.textContent='Unable to render frame: '+error.message+' · Retry frame is available.';
      }
    }
    studioInitialPaintFrame=requestAnimationFrame(function(){
      if(token===studioInitialPaintToken)next();
    });
  }
  function observeStudioPreviewSize(){
    function resized(){
      if(!studioPlayback||!studioPrepared||!animationWorkspaceOpen||
         studioPlayback.status().playing)return;
      var changed=false;
      ['A','B'].forEach(function(side){
        var host=newUiEl('ModernAnimationCanvas'+side);
        if(!host||typeof host.getBoundingClientRect!=='function')return;
        var width=Math.round(host.getBoundingClientRect().width);
        if(width>1&&studioPreviewObservedWidths[side]!==width){
          studioPreviewObservedWidths[side]=width;changed=true;
        }
      });
      if(changed)scheduleStudioInitialPaint('resized');
    }
    if(typeof root.ResizeObserver==='function'){
      var observer=new root.ResizeObserver(resized);
      ['A','B'].forEach(function(side){var host=newUiEl('ModernAnimationCanvas'+side);
        if(host)observer.observe(host);});
    }else if(root.addEventListener)root.addEventListener('resize',resized);
  }
  function renderStudioPlaybackSample(force){
    if(!studioPlayback||!studioPrepared||!animationWorkspaceOpen)return;
    var now=profileNow();
    if(!force&&now-studioPlaybackLastPaint<STUDIO_PREVIEW_MIN_INTERVAL_MS)return;
    if(!studioPreviewApi||!attachStudioPreviewGraphs())
      throw Error('Independent optical preview graphs are unavailable');
    if(!studioPreviewRenderer)studioPreviewRenderer=studioPreviewApi.create({
      Model:root.CurveAppClass,renderer:root.CurvatureMainCanvasRenderer,
      optics:root.CurvaturePhysicalSceneOptics});
    var renderedAt=studioPlayback.status().positionMs;
    var sampled=studioPlayback.sample();
    var parameter=newUiEl('ModernAnimationPlaybackParameter');
    if(parameter){
      parameter.hidden=studioPrepared.mode!=='physical';
      parameter.textContent=studioPlaybackApi.describeSample(studioPrepared,sampled);
    }
    var isCompare=sampled.display.mode==='compare';
    var panels=newUiEl('ModernAnimationPlaybackPanels');
    if(panels)panels.classList.toggle('is-compare',isCompare);
    var second=newUiEl('ModernAnimationPlaybackViewB');if(second)second.hidden=!isCompare;
    var label=newUiEl('ModernAnimationPlaybackLabelA');
    if(label)label.textContent=isCompare?'Model A':'Scene';
    var graphs=root.CurvatureModernAnimationGraphs;
    var renderOptions={quality:studioPlaybackQuality,animationMode:studioPrepared.mode};
    var begun=profileNow();
    var a=studioPreviewRenderer.render(sampled,'A',graphs.A,renderOptions);
    var b=isCompare?studioPreviewRenderer.render(sampled,'B',graphs.B,renderOptions):null;
    // When Model B discovers an unsupported fast configuration, repaint A
    // in Accurate too: a Compare frame must not silently mix approximations.
    if(b&&b.fallback&&a.quality==='fast')a=studioPreviewRenderer.render(sampled,'A',graphs.A,
      {quality:'accurate',animationMode:studioPrepared.mode});
    var spent=profileNow()-begun; // includes any Accurate redraw after a B fallback
    var fast=a.quality==='fast'&&(!b||b.quality==='fast');
    var auditQuality=b&&b.quality!==a.quality?'mixed':a.quality;
    if(studioQualityAudit){
      studioQualityAudit.record({timeMs:renderedAt,frameMs:spent,quality:auditQuality,
        projectId:studioPrepared.id,viewportA:{width:graphs.A.Canvas.width,
          height:graphs.A.Canvas.height},viewportB:isCompare?{
          width:graphs.B.Canvas.width,height:graphs.B.Canvas.height}:null,
        A:a.result,B:b&&b.result});
      studioLastQualityFrame={experiment:sampled,quality:auditQuality,
        mode:sampled.display.mode,backends:{A:a.result&&a.result.geometryBackend,
          B:b&&b.result&&b.result.geometryBackend},timeMs:renderedAt};
      if(studioLastParity){
        studioLastParity=null;
        var parityNode=newUiEl('ModernAnimationQualityParity');
        if(parityNode)parityNode.textContent='Frame changed; run a new pixel comparison.';
      }
      syncStudioQualitySummary();
    }
    var qualityNode=newUiEl('ModernAnimationPlaybackQuality');
    if(qualityNode)qualityNode.textContent=fast?'Fast Preview · approximate':
      'Accurate RK4 optics'+(b&&b.quality!==a.quality?' / mixed quality':'');
    var diagnostic=newUiEl('ModernAnimationPlaybackDiagnostics');
    if(diagnostic){
      function describe(view,side){
        if(!view)return '';
        var overlays=view.overlays||{};
        return side+': '+view.quality+' · eye level '+(overlays.eyeLevel||'unknown')+
          ' · horizon '+(overlays.horizon||'unknown');
      }
      var drawn=a.result||{};
      var fallbacks=Math.max(a.fallbackCount||0,b&&b.fallbackCount||0);
      var fallbackReasons=[a.fallback,b&&b.fallback].filter(Boolean);
      var requestedLabel={auto:'Auto',fast:'Fast if supported',accurate:'Accurate RK4'}[studioPlaybackQuality];
      var effectiveLabel=fast?'Fast Preview (approximate)':
        (b&&b.quality!==a.quality?'Mixed quality':'Accurate RK4');
      var fallbackNote=fallbackReasons.length?' · Fast unavailable: '+
        Array.from(new Set(fallbackReasons)).join(' / '):'';
      diagnostic.textContent='Requested optics: '+requestedLabel+' · Effective: '+effectiveLabel+' · Rendered t='+(renderedAt/1000).toFixed(2)+'s / '+
        (studioPlayback.status().durationMs/1000).toFixed(2)+'s · frame '+
        Math.round(spent)+' ms · '+describe(a,isCompare?'A':'Scene')+
        (isCompare?' · '+describe(b,'B'):'')+
        (Number.isFinite(drawn.drawn)?' · '+drawn.drawn+' visible segments':'')+
        fallbackNote+' · Fast runtime fallback(s): '+fallbacks+
        (spent>500?' · slow calculation: playback may skip intermediate frames':'');
    }
    // This timestamp always corresponds to the pixels just drawn. The
    // playback clock may advance during synchronous Accurate rendering.
    studioPlaybackRenderedAt=renderedAt;
    studioPlaybackLastPaint=profileNow();
    studioFrameLoading(false,'');
  }
  function studioPlaybackTick(now){
    studioPlaybackFrame=null;
    if(!studioPlayback||!animationWorkspaceOpen)return;
    try{
      var before=studioPlayback.status();
      if(!before.playing)return;
      var next=studioPlayback.tick(Number.isFinite(now)?now:profileNow());
      renderStudioPlaybackSample(!next.playing);
      syncStudioPlaybackControls();
      if(next.playing)studioPlaybackFrame=requestAnimationFrame(studioPlaybackTick);
      saveStudioDraft(!!next.playing);
      if(!next.playing){
        var status=newUiEl('ModernAnimationPlaybackStatus');
        if(status)status.textContent='Animation finished · live Scene / Compare unchanged.';
      }
    }catch(error){
      stopStudioPlayback(false);
      var status=newUiEl('ModernAnimationPlaybackStatus');
      if(status)status.textContent='Playback failed: '+error.message;
    }
  }
  function syncStudioQualitySummary(){
    var node=newUiEl('ModernAnimationQualitySummary');
    if(!node||!studioQualityAudit)return;
    var summary=studioQualityAudit.summary(),f=summary.frameMs;
    function time(value){return value===null?'n/a':value.toFixed(1)+' ms';}
    node.textContent=summary.count+' sampled frames · total p50 '+time(f.p50)+
      ' / p95 '+time(f.p95)+' · Fast '+summary.fastFrames+
      ' / Accurate '+summary.accurateFrames+' / Mixed '+summary.mixedFrames+
      ' · A optics cold p95 '+time(summary.A.cold.p95)+
      ', warm p95 '+time(summary.A.warm.p95)+
      ' · A cache hits '+summary.A.cacheHits+'/'+summary.A.count+
      (summary.B.count?' · B optics cold p95 '+time(summary.B.cold.p95)+
        ', warm p95 '+time(summary.B.warm.p95):'')+
      ' · unresolved A '+(summary.A.unresolved===null?'n/a':summary.A.unresolved)+
      (summary.B.count?', B '+(summary.B.unresolved===null?'n/a':summary.B.unresolved):'');
  }
  function compareStudioToWorkingFrame(){
    var note=newUiEl('ModernAnimationQualityParity');
    if(!note||!studioQualityApi||!studioLastQualityFrame)return;
    function reject(reason){studioLastParity={status:'not-comparable',reason:reason};
      note.textContent='Not comparable: '+reason;return;}
    try{
      // Use the last *rendered* animation sample, never the moving clock.
      if(!studioPlayback||studioPlayback.status().playing){reject('Pause playback first');return;}
      if(studioPlayback.status().positionMs!==studioLastQualityFrame.timeMs){
        reject('Seek to a rendered frame before comparing');return;
      }
      var sampled=studioLastQualityFrame.experiment;
      var reference=experimentSnapshot();
      var compare=sampled.display.mode==='compare';
      var quality=studioLastQualityFrame.quality;
      if(quality==='mixed'){reject('Compare A/B used different optical qualities');return;}
      var last=compare?state.compareLast:state.last;
      var first=compare&&last?last.A:last;
      var reason=studioQualityApi.conditions({reference:reference,sample:sampled,
        mode:state.mode,referenceRendered:!!first,referenceQuality:first&&first.opticalQuality,
        animationQuality:quality,referenceBackend:first&&first.geometryBackend,
        animationBackend:studioLastQualityFrame.backends.A,
        shimmer:!!(atmosphericPresentation&&
          (atmosphericPresentation.enabled('Scene')||atmosphericPresentation.enabled('A')||
           atmosphericPresentation.enabled('B')))||state.showTemperatureProfile});
      if(reason){reject(reason);return;}
      var referenceGraphs=compare?state.compareGraphs:{A:graph};
      var animationGraphs=root.CurvatureModernAnimationGraphs;
      var bySide={},sides=compare?['A','B']:['A'];
      for(var i=0;i<sides.length;i++){
        var side=sides[i],refView=referenceGraphs[side],animationView=animationGraphs&&animationGraphs[side];
        var refResult=compare&&last?last[side]:last;
        if(!refResult||refResult.opticalQuality!==quality||
           refResult.geometryBackend!=='Canvas 2D'||
           studioLastQualityFrame.backends[side]!=='Canvas 2D'){
          reject('Optical quality or backend differs for '+side);return;
        }
        if(!refView||!refView.Canvas||!animationView||!animationView.Canvas){
          reject('A reference or Animation Canvas is unavailable');return;
        }
        if(refView.Canvas.width!==animationView.Canvas.width||
           refView.Canvas.height!==animationView.Canvas.height){
          reject(side+' backing sizes differ ('+refView.Canvas.width+'×'+refView.Canvas.height+
            ' versus '+animationView.Canvas.width+'×'+animationView.Canvas.height+
            '); exact pixel parity cannot be asserted');return;
        }
        bySide[side]=studioQualityApi.compareCanvases(refView.Canvas,animationView.Canvas);
      }
      studioLastParity={status:'measured',timeMs:studioLastQualityFrame.timeMs,
        quality:quality,sides:bySide};
      note.textContent='Actual Canvas comparison at t='+
        (studioLastQualityFrame.timeMs/1000).toFixed(2)+'s, '+quality+': '+
        sides.map(function(side){var report=bySide[side];return side+' '+report.width+
          '×'+report.height+' · '+(100*report.overToleranceFraction).toFixed(3)+
          '% pixels differ by more than '+report.tolerance+
          '/255 · mean channel error '+report.meanAbsoluteChannelError.toFixed(3);}).join(' · ')+
        '. A measured difference is not automatically a physical-model error.';
    }catch(error){reject('Pixel readback failed: '+error.message);}
  }
  function bindStudioQualityAudit(){
    var compare=newUiEl('ModernAnimationQualityCompare');
    if(compare)compare.addEventListener('click',compareStudioToWorkingFrame);
    var clear=newUiEl('ModernAnimationQualityClear');
    if(clear)clear.addEventListener('click',function(){
      if(studioQualityAudit)studioQualityAudit.clear();studioLastParity=null;
      syncStudioQualitySummary();
      var note=newUiEl('ModernAnimationQualityParity');if(note)note.textContent='Pixel parity not checked.';
    });
    var exportButton=newUiEl('ModernAnimationQualityExport');
    if(exportButton)exportButton.addEventListener('click',function(){
      if(!studioQualityAudit)return;
      var bundle={schema:'curvature-animation-quality-audit',version:1,
        capturedAt:new Date().toISOString(),
        project:studioPrepared?{id:studioPrepared.id,name:studioPrepared.name,
          mode:studioPrepared.mode,target:studioPrepared.target}:null,
        summary:studioQualityAudit.summary(),frames:studioQualityAudit.snapshot(),
        pixelParity:studioLastParity};
      downloadHistoryJson(JSON.stringify(bundle,null,2),'curvature-animation-quality-audit.json');
    });
    syncStudioQualitySummary();
  }
  // Offline frame export is isolated from the current Scene, History and even
  // the on-screen Animation playback graph. The entire project is snapshotted
  // at Start and every PNG uses Accurate RK4 at an invariant backing size.
  function syncStudioFrameExportControls(){
    var start=newUiEl('ModernAnimationFrameExportStart');
    var cancel=newUiEl('ModernAnimationFrameExportCancel');
    if(start)start.disabled=!!studioFrameExportTask||!studioPrepared;
    if(cancel)cancel.disabled=!studioFrameExportTask;
  }
  function bindStudioFrameExport(){
    var api=studioFrameExportApi;
    var start=newUiEl('ModernAnimationFrameExportStart');
    var cancel=newUiEl('ModernAnimationFrameExportCancel');
    if(!start||!cancel)return;
    function message(text){var node=newUiEl('ModernAnimationFrameExportStatus');
      if(node)node.textContent=text;}
    cancel.addEventListener('click',function(){
      if(studioFrameExportTask){studioFrameExportTask.cancelled=true;
        message('Cancel requested · finishing the current synchronous optical calculation…');}
    });
    start.addEventListener('click',async function(){
      if(studioFrameExportTask)return;
      if(!api||!studioPreviewApi||!studioPrepared){message('Prepare a valid animation before exporting.');return;}
      var task={cancelled:false};
      studioFrameExportTask=task;
      syncStudioFrameExportControls();
      var progress=newUiEl('ModernAnimationFrameExportProgress');
      if(progress){progress.value=0;progress.max=100;}
      try{
        if(!previewGraphsReady())throw Error('GraphX3DX preview reference is unavailable');
        var fps=Number(newUiEl('ModernAnimationFrameExportFps').value);
        var size=newUiEl('ModernAnimationFrameExportSize').value.split('x').map(Number);
        var sourceProject=studioProjects.validate(studioPrepared);
        var plan=api.plan(sourceProject,{fps:fps,width:size[0],height:size[1]});
        var graphs={};
        plan.sides.forEach(function(side){
          var canvas=document.createElement('canvas');
          canvas.width=plan.width;canvas.height=plan.height;
          graphs[side]=api.graphForCanvas(root.CurvatureModernAnimationGraphs[side],canvas);
        });
        // A new owned optical session keeps export caches independent from
        // interactive animation. Never mutate root.CurvatureModernAnimationGraphs.
        var painter=studioPreviewApi.create({Model:root.CurveAppClass,
          renderer:root.CurvatureMainCanvasRenderer,optics:root.CurvaturePhysicalSceneOptics});
        message('Rendering '+plan.timesMs.length+' timestamps × '+plan.sides.length+
          ' view(s), Accurate RK4 · this can take longer than the video duration.');
        var result=await api.run({project:sourceProject,fps:fps,width:plan.width,height:plan.height,
          cancel:task,
          yieldUi:function(){return new Promise(function(resolve){setTimeout(resolve,0);});},
          render:function(sample,side,dimensions){
            var graph=graphs[side];
            // Reset the offscreen 2D context and clipping for each frame.
            // Width/height never depend on the visible workspace or DPR.
            graph.Canvas.width=dimensions.width;graph.Canvas.height=dimensions.height;
            var report=painter.render(sample,side,graph,{quality:'accurate',animationMode:sourceProject.mode});
            return {quality:report.quality,canvas:graph.Canvas,metrics:report.result};
          },
          onProgress:function(info){
            if(progress)progress.value=100*info.completed/info.total;
            message('Rendered '+info.completed+' / '+info.total+' timestamps · t='+
              (info.timeMs/1000).toFixed(2)+' s · Accurate RK4');
          }
        });
        if(result.cancelled){message('PNG export cancelled; no partial archive was saved.');return;}
        if(task.cancelled){message('PNG export cancelled; no archive was saved.');return;}
        var url=root.URL.createObjectURL(result.blob);
        try{
          var link=document.createElement('a');
          link.href=url;link.download='curvature-animation-frames.zip';
          document.body.appendChild(link);link.click();link.remove();
        }finally{setTimeout(function(){root.URL.revokeObjectURL(url);},30000);}
        message('PNG archive ready: '+result.manifest.frameCount+' timestamps × '+
          result.manifest.sides.length+' view(s), including exact final frame.');
      }catch(error){message('PNG export failed: '+error.message+' · No partial archive saved.');}
      finally{studioFrameExportTask=null;syncStudioFrameExportControls();}
    });
    syncStudioFrameExportControls();
  }
  function bindStudioPlayback(){
    var optics=newUiEl('ModernAnimationPlaybackOptics');
    if(optics){optics.value=studioPlaybackQuality;optics.addEventListener('change',function(){
      studioPlaybackQuality=['auto','fast','accurate'].includes(optics.value)?optics.value:'auto';
      // Explicit quality changes must allow a fresh Fast probe at the current
      // physical state; a previous runtime rejection is not a permanent ban.
      if(studioPreviewRenderer&&typeof studioPreviewRenderer.resetFastFailures==='function')
        studioPreviewRenderer.resetFastFailures();
      saveStudioDraft(false);renderStudioLibrary();
      if(!studioPlayback)return;
      stopStudioPlayback(false);
      studioPlaybackLastPaint=-Infinity;
      try{renderStudioPlaybackSample(true);syncStudioPlaybackControls();}
      catch(error){var status=newUiEl('ModernAnimationPlaybackStatus');
        if(status)status.textContent='Playback optics: '+error.message;}
    });}
    var play=newUiEl('ModernAnimationPlaybackPlay');
    if(!play)return;
    function safely(fn){try{fn();}catch(error){
      stopStudioPlayback(false);
      var status=newUiEl('ModernAnimationPlaybackStatus');
      if(status)status.textContent='Playback failed: '+error.message;
    }}
    play.addEventListener('click',function(){safely(function(){
      if(!studioPlayback)throw Error('Prepare a compatible animation project first');
      cancelStudioInitialPaint();
      studioPlayback.start(profileNow());
      var status=newUiEl('ModernAnimationPlaybackStatus');
      if(status)status.textContent=(studioPrepared.mode==='camera'?'Camera':'Physical')+
        ' animation playing in an independent optical viewport.';
      renderStudioPlaybackSample(true);syncStudioPlaybackControls();
      saveStudioDraft(false);
      if(studioPlaybackFrame===null)studioPlaybackFrame=requestAnimationFrame(studioPlaybackTick);
    });});
    var pause=newUiEl('ModernAnimationPlaybackPause');
    if(pause)pause.addEventListener('click',function(){safely(function(){
      stopStudioPlayback(false);saveStudioDraft(false);
      var status=newUiEl('ModernAnimationPlaybackStatus');if(status)status.textContent='Paused.';
    });});
    var stop=newUiEl('ModernAnimationPlaybackStop');
    if(stop)stop.addEventListener('click',function(){safely(function(){
      stopStudioPlayback(false);if(studioPlayback)studioPlayback.stop();
      saveStudioDraft(false);syncStudioPlaybackControls();
      scheduleStudioInitialPaint('first');
    });});
    var seek=newUiEl('ModernAnimationPlaybackSeek');
    if(seek)seek.addEventListener('input',function(){safely(function(){
      if(!studioPlayback)return;
      studioPlayback.seek(studioPlayback.status().durationMs*Number(seek.value)/1000,profileNow());
      cancelStudioInitialPaint();saveStudioDraft(false);
      studioPlaybackLastPaint=-Infinity;
      renderStudioPlaybackSample(true);syncStudioPlaybackControls();
    });});
    var retry=newUiEl('ModernAnimationPlaybackRetry');
    if(retry)retry.addEventListener('click',function(){
      if(studioPlayback){stopStudioPlayback(false);scheduleStudioInitialPaint('retry');}
    });
    bindStudioQualityAudit();
    bindStudioFrameExport();
    observeStudioPreviewSize();
    if(document.addEventListener)document.addEventListener('visibilitychange',function(){
      if(document.hidden&&studioPlayback){stopStudioPlayback(false);saveStudioDraft(false);
        var status=newUiEl('ModernAnimationPlaybackStatus');
        if(status)status.textContent='Paused while the tab is hidden.';
      }else if(studioPlayback&&animationWorkspaceOpen&&studioRestorePreviewPending){
        scheduleStudioInitialPaint('visible');
      }
    });
  }
  function loadStagedAnimation(entries){
    if(!studioApi)throw Error('Animation Studio is unavailable');
    if(!historyStoryboardQueue.length)throw RangeError('Select snapshots for animation first');
    studioSelectedKey=null;studioFilmstripScroll=0;
    studioDraft=studioApi.history(historyStoryboardQueue,entries,studioDraft);
    stopStudioPlayback(true);studioPrepared=null;
    saveStudioDraft(false);
    renderAnimationStudio(entries);
  }
  function animationPickerEntries(entries){
    var query=studioPickerSearch.trim();
    var found=!query||!historyFiltersApi?entries:historyFiltersApi.filter(entries,{
      query:query,mode:'all',geometry:'any',atmosphere:'any',
      geometryRelation:'any',refractionRelation:'any'
    });
    return found.slice().sort(function(a,b){return Number(!!b.pinned)-Number(!!a.pinned);});
  }
  function toggleAnimationPicker(open){
    studioPickerOpen=!!open;
    syncWorkspaceVisibility();
    if(experimentHistory){
      refreshHistoryList().catch(function(error){
        var msg=newUiEl('ModernAnimationStudioMessage');
        if(msg){msg.textContent=error.message;msg.classList.add('is-error');}
      });
    }
  }
  // Animation Studio is a temporary, self-contained draft, not a new History
  // store or a live renderer. The shortlist and old camera sequence are read
  // only when the user explicitly imports them into the editor.
  function renderAnimationStudio(entries){
    var host=newUiEl('ModernAnimationStudio');
    if(!studioApi||!studioUI||!host)return;
    if(!studioDraft)studioDraft=studioApi.blank();
    var assessment=studioApi.inspect(studioDraft);
    var resetFilmstrip=studioSelectedKey===null;
    if(!studioDraft.frames.some(function(f){return f.key===studioSelectedKey;}))
      studioSelectedKey=studioDraft.frames.length?studioDraft.frames[0].key:null;
    var oldPicker=newUiEl('ModernAnimationSnapshotPicker');
    var oldPickerList=oldPicker&&oldPicker.querySelector&&oldPicker.querySelector('.modern-studio-picker-list');
    if(oldPickerList)studioPickerScroll=oldPickerList.scrollTop;
    var oldStrip=host.querySelector&&host.querySelector('.modern-studio-filmstrip');
    if(oldStrip&&!resetFilmstrip)studioFilmstripScroll=oldStrip.scrollLeft;
    function update(next){
      studioDraft=next;stopStudioPlayback(true);studioPrepared=null;
      if(!next.frames.some(function(f){return f.key===studioSelectedKey;}))
        studioSelectedKey=next.frames.length?next.frames[0].key:null;
      saveStudioDraft(false);
      var status=newUiEl('ModernAnimationStudioMessage');
      if(status){status.textContent='';status.classList.remove('is-error');}
      renderAnimationStudio(entries);
    }
    function report(error){
      var status=newUiEl('ModernAnimationStudioMessage');
      if(status){status.textContent=error.message;status.classList.add('is-error');}
    }
    function safe(action){try{action();}catch(error){report(error);}}
    renderStudioLibrary();
    studioUI.render(document,host,studioDraft,assessment,{
      choose:function(){toggleAnimationPicker(!studioPickerOpen);},
      load:function(){safe(function(){
        studioSelectedKey=null;studioFilmstripScroll=0;
        loadStagedAnimation(entries);
      });},
      importCamera:function(){safe(function(){
        studioSelectedKey=null;studioFilmstripScroll=0;
        update(studioApi.importCamera(experimentSnapshot(),cameraSequence,studioDraft));
      });},
      edit:function(field,value){safe(function(){update(studioApi.edit(studioDraft,field,value));});},
      frame:function(key,field,value){safe(function(){
        update(studioApi.editFrame(studioDraft,key,field,value));
      });},
      liveEdit:function(field,value){
        try{studioDraft=studioApi.edit(studioDraft,field,value);
          stopStudioPlayback(true);studioPrepared=null;saveStudioDraft(false);renderStudioLibrary();
        }catch(error){/* Temporary invalid text is reported by the committed change event. */}
      },
      liveFrame:function(key,field,value){
        try{studioDraft=studioApi.editFrame(studioDraft,key,field,value);
          stopStudioPlayback(true);studioPrepared=null;saveStudioDraft(false);renderStudioLibrary();
        }catch(error){/* Do not persist incomplete or invalid intermediate numbers. */}
      },
      select:function(key){
        studioSelectedKey=key;saveStudioDraft(false);renderAnimationStudio(entries);
        var active=host.querySelector&&host.querySelector('.modern-studio-keyframe.is-active');
        if(active&&typeof active.focus==='function')active.focus({preventScroll:true});
      },
      move:function(key,step){safe(function(){update(studioApi.move(studioDraft,key,step));});},
      remove:function(key){safe(function(){
        var index=studioDraft.frames.findIndex(function(f){return f.key===key;});
        var next=studioApi.remove(studioDraft,key);
        if(studioSelectedKey===key)
          studioSelectedKey=next.frames.length?next.frames[Math.min(index,next.frames.length-1)].key:null;
        update(next);
      });},
      prepare:function(){safe(function(){
        stopStudioPlayback(true);
        studioPrepared=studioApi.build(studioDraft,'studio_draft');
        studioPlayback=studioPlaybackApi?studioPlaybackApi.create(studioPrepared):null;
        saveStudioDraft(false);
        syncStudioPlaybackControls();
        if(studioPlayback)scheduleStudioInitialPaint('prepared');
        renderAnimationStudio(entries);
        var status=newUiEl('ModernAnimationStudioMessage');
        if(status){status.classList.remove('is-error');
          status.textContent=studioPlayback?
            (studioPrepared.mode==='camera'?'Camera':'Physical')+
              ' project prepared. Play in the independent optical viewport above.':
            'Independent animation playback is unavailable.';}
      });},
      dragStart:function(payload,event){
        var chosen=payload.kind==='snapshots'&&studioPickerChecked[payload.id]?
          animationPickerEntries(entries).filter(function(e){return studioPickerChecked[e.id];})
            .map(function(e){return e.id;}):[payload.id];
        studioDragSession=payload.kind==='snapshots'?{kind:'snapshots',ids:chosen}:
          {kind:'frame',key:payload.key};
        if(event&&event.dataTransfer){
          event.dataTransfer.effectAllowed=payload.kind==='frame'?'move':'copy';
          // A private payload marker; never import arbitrary external drops.
          event.dataTransfer.setData('application/x-curvature-animation','internal');
          event.dataTransfer.setData('text/plain','Curvature animation keyframe');
        }
      },
      dragOver:function(event){
        if(!studioDragSession)return false;
        if(event&&event.dataTransfer)event.dataTransfer.dropEffect=
          studioDragSession.kind==='frame'?'move':'copy';
        return true;
      },
      drop:function(index,event){
        if(!studioDragSession)return;
        var drag=studioDragSession;studioDragSession=null;
        safe(function(){
          var next=drag.kind==='frame'?studioApi.reorder(studioDraft,drag.key,index):
            studioApi.insertSnapshots(studioDraft,drag.ids,entries,index);
          if(drag.kind==='snapshots'){
            drag.ids.forEach(function(id){delete studioPickerChecked[id];});
            // Selection follows the first newly inserted snapshot, if any.
            var added=next.frames.find(function(f){return drag.ids.includes(f.sourceSnapshotId)&&
              !studioDraft.frames.some(function(old){return old.key===f.key;});});
            if(added)studioSelectedKey=added.key;
          }else studioSelectedKey=drag.key;
          update(next);
        });
      },
      dragEnd:function(){studioDragSession=null;},
      insertChecked:function(index){safe(function(){
        var ids=animationPickerEntries(entries).filter(function(e){return studioPickerChecked[e.id];})
          .map(function(e){return e.id;});
        if(!ids.length)throw RangeError('Check snapshots in the picker first');
        var gap=Number.isInteger(index)?index:studioSelectedKey?
          studioDraft.frames.findIndex(function(f){return f.key===studioSelectedKey;})+1:
          studioDraft.frames.length;
        if(gap<0)gap=studioDraft.frames.length;
        var next=studioApi.insertSnapshots(studioDraft,ids,entries,gap);
        ids.forEach(function(id){delete studioPickerChecked[id];});
        var added=next.frames.find(function(f){return ids.includes(f.sourceSnapshotId)&&
          !studioDraft.frames.some(function(old){return old.key===f.key;});});
        if(added)studioSelectedKey=added.key;
        update(next);
      });}
    },!!studioPrepared,{selectedKey:studioSelectedKey,entries:entries,
      stagedCount:historyStoryboardQueue.length,
      pickerSelectedCount:Object.keys(studioPickerChecked).filter(function(id){return studioPickerChecked[id];}).length});
    var picker=newUiEl('ModernAnimationSnapshotPicker');
    if(picker&&studioUI.renderPicker){
      var shown=animationPickerEntries(entries);
      var dragActions={
        dragStart:function(payload,event){
          var ids=studioPickerChecked[payload.id]?shown.filter(function(e){return studioPickerChecked[e.id];})
            .map(function(e){return e.id;}):[payload.id];
          studioDragSession={kind:'snapshots',ids:ids};
          if(event&&event.dataTransfer){
            event.dataTransfer.effectAllowed='copy';
            event.dataTransfer.setData('application/x-curvature-animation','internal');
            event.dataTransfer.setData('text/plain','Curvature animation snapshot');
          }
        },
        dragEnd:function(){studioDragSession=null;},
        drop:function(){},
        pickerClose:function(){toggleAnimationPicker(false);},
        pickerFullHistory:function(){setHistoryOpen(true);},
        pickerSearch:function(query,caret){
          studioPickerSearch=query;
          renderAnimationStudio(entries);
          studioPickerScroll=0;
          var freshList=picker.querySelector&&picker.querySelector('.modern-studio-picker-list');
          if(freshList)freshList.scrollTop=0;
          var search=picker.querySelector&&picker.querySelector('.modern-studio-picker-search');
          if(search&&typeof search.focus==='function'){
            search.focus({preventScroll:true});
            if(typeof search.setSelectionRange==='function')search.setSelectionRange(caret,caret);
          }
        },
        pickerToggle:function(id,checked){
          if(checked)studioPickerChecked[id]=true;
          else delete studioPickerChecked[id];
          renderAnimationStudio(entries);
        },
        insertChecked:function(index){
          // Reuse the same action as the timeline gaps.
          var slots=host.querySelectorAll&&host.querySelectorAll('.modern-studio-drop-button');
          if(slots&&Number.isInteger(index)&&slots[index])slots[index].click();
          else{
            var selected=shown.filter(function(e){return studioPickerChecked[e.id];}).map(function(e){return e.id;});
            safe(function(){
              var at=studioSelectedKey?studioDraft.frames.findIndex(function(f){return f.key===studioSelectedKey;})+1:studioDraft.frames.length;
              if(at<0)at=studioDraft.frames.length;
              var next=studioApi.insertSnapshots(studioDraft,selected,entries,at);
              selected.forEach(function(id){delete studioPickerChecked[id];});
              update(next);
            });
          }
        }
      };
      studioUI.renderPicker(document,picker,shown,dragActions,{
        open:studioPickerOpen,search:studioPickerSearch,checked:studioPickerChecked});
      var pickerList=picker.querySelector&&picker.querySelector('.modern-studio-picker-list');
      if(pickerList)pickerList.scrollTop=studioPickerScroll;
    }
    var strip=host.querySelector&&host.querySelector('.modern-studio-filmstrip');
    if(strip)strip.scrollLeft=studioFilmstripScroll;
    if(studioRestorePreviewPending&&studioPlayback&&animationWorkspaceOpen&&
       studioInitialPaintFrame===null&&studioPlaybackRenderedAt===null){
      scheduleStudioInitialPaint('restored');
    }
  }
  var historyMetadataEditingId=null;
  function closeHistoryMetadataEditor(){
    var dialog=newUiEl('ModernHistoryMetadataDialog');
    if(dialog){
      if(typeof dialog.close==='function'&&dialog.open)dialog.close();
      else if(typeof dialog.removeAttribute==='function')dialog.removeAttribute('open');
    }
    historyMetadataEditingId=null;
  }
  function openHistoryMetadataEditor(id){
    var dialog=newUiEl('ModernHistoryMetadataDialog');
    var name=newUiEl('ModernHistoryMetadataName');
    var description=newUiEl('ModernHistoryMetadataDescription');
    if(!dialog||!name||!description)return Promise.reject(Error('Snapshot editor unavailable'));
    return experimentHistory.get(id).then(function(entry){
      if(!entry)throw RangeError('History snapshot not found');
      if(historyUI)historyUI.hideInspector(newUiEl('ModernHistoryGallery'));
      historyMetadataEditingId=entry.id;
      name.value=entry.name||'';description.value=entry.description||'';
      var errorNode=newUiEl('ModernHistoryMetadataError');
      if(errorNode)errorNode.textContent='';
      if(typeof dialog.showModal==='function'){
        if(!dialog.open)dialog.showModal();
      }else if(typeof dialog.setAttribute==='function')dialog.setAttribute('open','');
      if(typeof name.focus==='function')name.focus();
    });
  }
  function refreshHistoryList(selectedId){
    if(!experimentHistory)return Promise.resolve([]);
    var select=newUiEl('ModernHistorySelect');
    return experimentHistory.list().then(function(entries){
      historyLoadError=null;snapshotSaveError=null;
      savedHistorySignatures=new Map();
      studioHistoryEntries=entries;
      entries.forEach(function(entry){
        // list() is newest-first; preserve the newest matching record.
        if(!savedHistorySignatures.has(entry.signature))
          savedHistorySignatures.set(entry.signature,entry);
      });
      updateSnapshotSaveAction();
      var ids=new Set(entries.map(function(entry){return entry.id;}));
      historySelectedIds().forEach(function(id){if(!ids.has(id))delete historyMultiSelection[id];});
      var surviving=historyStoryboardQueue.filter(function(id){return ids.has(id);});
      if(surviving.length!==historyStoryboardQueue.length){
        historyStoryboardQueue=surviving;saveApplicationPreferences();
      }
      renderHistoryStoryboard(entries);
      renderAnimationStudio(entries);
      var visible=historyFiltersApi?historyFiltersApi.filter(entries,historyFilters):entries;
      var count=newUiEl('ModernHistoryFilterCount');
      if(count)count.textContent='Showing '+visible.length+' of '+entries.length+' snapshots';
      var order=newUiEl('ModernHistorySort');
      if(order&&order.value==='oldest')visible=visible.slice().reverse();
      // A collapsed Pinned section contains no selectable cards. Never let a
      // bulk action silently modify snapshots that are no longer shown.
      historyShownIds=visible.filter(function(entry){return !!entry.pinned&&!historyPinnedCollapsed;})
        .concat(visible.filter(function(entry){return !entry.pinned;}))
        .map(function(entry){return entry.id;});
      historySelectedIds().forEach(function(id){
        if(!historyShownIds.includes(id))delete historyMultiSelection[id];
      });
      historyMultiCount();
      if(!select)return entries;
      var previous=selectedId===undefined?select.value:String(selectedId);
      select.textContent='';
      var placeholder=document.createElement('option');
      placeholder.value='';placeholder.textContent=!entries.length?'No snapshots yet':
        !visible.length?'No matches':'Choose snapshot';
      select.appendChild(placeholder);
      visible.forEach(function(entry){
        var option=document.createElement('option');option.value=String(entry.id);
        var scene=entry.features&&entry.features.mode||entry.experiment.display.mode;
        var label=scene==='compare'?'Compare A/B':'Scene';
        option.textContent=(entry.name?entry.name+' · ':'')+
          new Date(entry.createdAt).toLocaleString()+' · '+label+' · '+entry.source+
          (entry.pinned?' · pinned':'');
        select.appendChild(option);
      });
      select.value=previous&&visible.some(function(entry){return String(entry.id)===previous;})?previous:'';
      var gallery=newUiEl('ModernHistoryGallery'),panel=newUiEl('ModernHistoryPanel');
      if(gallery&&historyUI&&panel&&!panel.hidden){
        historyUI.setSize(gallery,historyGallerySize);
        historyUI.render(document,gallery,visible,select.value,{
        select:function(id){select.value=String(id);historyUI.select(gallery,id);},
        restore:function(id){handleHistoryRestore(id);},
        pin:function(id,pinned){
          experimentHistory.pin(id,pinned).then(function(){return refreshHistoryList(id);})
            .catch(function(error){historyStatus(error.message,true);});
        },
        edit:function(id){openHistoryMetadataEditor(id).catch(function(error){
          historyStatus(error.message,true);
        });},
        remove:function(id){
          if(entries.some(function(entry){return entry.id===id&&entry.pinned;})){
            historyStatus('Unpin this snapshot before deleting it.',true);return;
          }
          if(!root.confirm||!root.confirm('Delete snapshot '+id+'?'))return;
          experimentHistory.remove(id).then(function(){
            delete historyMultiSelection[id];
            historyStatus('Snapshot deleted.');return refreshHistoryList();
          }).catch(function(error){historyStatus(error.message,true);});
        },
        setPinnedCollapsed:function(collapsed){
          historyPinnedCollapsed=collapsed;
          historyMultiSelection=Object.create(null);
          saveApplicationPreferences();refreshHistoryList();
        },
        multi:function(id,checked){
          if(checked)historyMultiSelection[id]=true;
          else delete historyMultiSelection[id];
          historyMultiCount();
        }
      },historyMultiSelection,{pinnedCollapsed:historyPinnedCollapsed,
        emptyFiltered:entries.length>0,
        filtersActive:!!(historyFiltersApi&&historyFiltersApi.active(historyFilters)),
        hasPinned:entries.some(function(entry){return !!entry.pinned;})});
      }
      return entries;
    });
  }
  var historyRestoreBusy=false;
  function restoreHistorySnapshot(id){
    if(historyRestoreBusy)return Promise.resolve();
    if(!id)return Promise.reject(RangeError('Select a history snapshot to restore'));
    historyRestoreBusy=true;
    return experimentHistory.get(id).then(function(entry){
      if(!entry)throw RangeError('History snapshot not found');
      var target=experiments.validate(entry.experiment);
      // A protected checkpoint must commit BEFORE changing current physics.
      cancelEdits();stopCameraTransition(false,'History restore interrupted animation',false);
      stopCameraKeyboard(true);abortCameraDrag();cancelPending();cancelHistoryAuto();
      var current=experimentSnapshot();
      if(historyFingerprint.exactSignature(current)===historyFingerprint.exactSignature(target)){
        historyStatus('This snapshot already matches the current experiment.');
        return refreshHistoryList(id);
      }
      return experimentHistory.record(current,'recovery',historyThumbnail(current)).then(function(backup){
        if(persistence.timer!==null){clearTimeout(persistence.timer);persistence.timer=null;}
        applyExperiment(target);syncNumericInputs();syncCompareEditor();
        setMode(state.mode,false);resetHistoryBaseline();
        historyStatus('Snapshot restored. Previous state '+
          (backup.created?'saved as protected recovery point.':'already in history.'));
        return refreshHistoryList(id);
      });
    }).finally(function(){historyRestoreBusy=false;});
  }
  function handleHistoryRestore(id){
    return restoreHistorySnapshot(id).catch(function(error){historyStatus(error.message,true);});
  }
  function downloadHistoryJson(contents,filename){
    var address=URL.createObjectURL(new Blob([contents],{type:'application/json'}));
    try{
      var anchor=document.createElement('a');anchor.href=address;anchor.download=filename;
      document.body.appendChild(anchor);anchor.click();anchor.remove();
    }finally{setTimeout(function(){URL.revokeObjectURL(address);},1000);}
  }
  function setHistoryOpen(open){
    var panel=newUiEl('ModernHistoryPanel'),toggle=newUiEl('ModernHistoryToggle');
    if(!panel||!toggle)return;
    historyPanelOpen=!!open;panel.hidden=!historyPanelOpen;
    var backdrop=newUiEl('ModernHistoryBackdrop');if(backdrop)backdrop.hidden=!historyPanelOpen;
    toggle.setAttribute('aria-expanded',String(historyPanelOpen));
    saveApplicationPreferences();
    if(historyPanelOpen){
      refreshHistoryList().catch(function(error){historyStatus(error.message,true);});
      if(typeof panel.focus==='function')panel.focus();
    }else{
      if(historyUI)historyUI.hideInspector(newUiEl('ModernHistoryGallery'));
      if(typeof toggle.focus==='function')toggle.focus();
    }
  }
  function bindHistory(){
    var panel=newUiEl('ModernHistoryPanel'),toggle=newUiEl('ModernHistoryToggle');
    if(!panel||!toggle||!historyFactory||!historyFingerprint)return;
    experimentHistory=historyFactory.create({indexedDB:root.indexedDB});
    var metadataForm=newUiEl('ModernHistoryMetadataForm');
    var metadataCancel=newUiEl('ModernHistoryMetadataCancel');
    var metadataDialog=newUiEl('ModernHistoryMetadataDialog');
    var metadataSave=newUiEl('ModernHistoryMetadataSave');
    if(metadataCancel)metadataCancel.addEventListener('click',closeHistoryMetadataEditor);
    if(metadataDialog)metadataDialog.addEventListener('close',function(){historyMetadataEditingId=null;});
    if(metadataForm)metadataForm.addEventListener('submit',function(event){
      if(event&&event.preventDefault)event.preventDefault();
      if(historyMetadataEditingId===null||!metadataSave||metadataSave.disabled)return;
      var id=historyMetadataEditingId;
      metadataSave.disabled=true;
      Promise.resolve().then(function(){return experimentHistory.updateMetadata(id,
        newUiEl('ModernHistoryMetadataName').value,
        newUiEl('ModernHistoryMetadataDescription').value);
      }).then(function(updated){
        if(!updated)throw RangeError('History snapshot not found');
        closeHistoryMetadataEditor();
        historyStatus('Snapshot details saved.');
        return refreshHistoryList(id);
      }).catch(function(error){
        var errorNode=newUiEl('ModernHistoryMetadataError');
        if(errorNode)errorNode.textContent=error.message;
        historyStatus('Snapshot details: '+error.message,true);
      })
        .finally(function(){metadataSave.disabled=false;});
    });
    syncHistoryFilterControls();
    var filterRefreshTimer=null;
    function changeHistoryFilter(key,value,debounced){
      if(!historyFiltersApi)return;
      historyFilters=historyFiltersApi.update(historyFilters,key,value);
      if(key==='mode'||key==='geometryRelation'||key==='refractionRelation')
        syncHistoryFilterControls();
      // A bulk operation must not silently affect records now hidden by filters.
      historyMultiSelection=Object.create(null);historyMultiCount();
      saveApplicationPreferences();
      if(filterRefreshTimer!==null)clearTimeout(filterRefreshTimer);
      filterRefreshTimer=setTimeout(function(){
        filterRefreshTimer=null;
        refreshHistoryList().catch(function(error){historyStatus(error.message,true);});
      },debounced?150:0);
    }
    [['ModernHistoryFilterQuery','query','input',true],
      ['ModernHistoryFilterMode','mode','change',false],
      ['ModernHistoryFilterGeometry','geometry','change',false],
      ['ModernHistoryFilterAtmosphere','atmosphere','change',false],
      ['ModernHistoryFilterGeometryRelation','geometryRelation','change',false],
      ['ModernHistoryFilterRefractionRelation','refractionRelation','change',false]
    ].forEach(function(config){
      var node=newUiEl(config[0]);
      if(node)node.addEventListener(config[2],function(){
        changeHistoryFilter(config[1],node.value,config[3]);
      });
    });
    var clearFilters=newUiEl('ModernHistoryFiltersClear');
    if(clearFilters)clearFilters.addEventListener('click',function(){
      historyFilters=historyFiltersApi?historyFiltersApi.normalize():
        {query:'',mode:'all',geometry:'any',atmosphere:'any',
          geometryRelation:'any',refractionRelation:'any'};
      syncHistoryFilterControls();
      historyMultiSelection=Object.create(null);historyMultiCount();
      saveApplicationPreferences();
      if(filterRefreshTimer!==null)clearTimeout(filterRefreshTimer);
      filterRefreshTimer=null;
      refreshHistoryList().catch(function(error){historyStatus(error.message,true);});
    });
    var sizeControl=newUiEl('ModernHistorySize');
    if(sizeControl){
      sizeControl.value=historyGallerySize;
      sizeControl.addEventListener('change',function(){
        if(!['small','medium','large'].includes(sizeControl.value))return;
        historyGallerySize=sizeControl.value;
        if(historyUI)historyUI.setSize(newUiEl('ModernHistoryGallery'),historyGallerySize);
        saveApplicationPreferences();
      });
    }
    function handle(operation){
      Promise.resolve().then(operation).catch(function(error){historyStatus(error.message,true);});
    }
    toggle.addEventListener('click',function(){setHistoryOpen(panel.hidden);});
    var historyBackdrop=newUiEl('ModernHistoryBackdrop');
    if(historyBackdrop)historyBackdrop.addEventListener('click',function(){setHistoryOpen(false);});
    if(typeof panel.addEventListener==='function')panel.addEventListener('keydown',function(event){
      if(event&&event.key==='Escape'){event.preventDefault();setHistoryOpen(false);}
    });
    el('ModernHistoryClose').addEventListener('click',function(){setHistoryOpen(false);});
    // The preference is applied before IndexedDB has finished opening. Once
    // open() resolves, refreshHistoryList() populates the visible panel.
    panel.hidden=!historyPanelOpen;
    if(historyBackdrop)historyBackdrop.hidden=!historyPanelOpen;
    toggle.setAttribute('aria-expanded',String(historyPanelOpen));
    el('ModernHistorySelect').addEventListener('change',function(){
      handle(function(){return refreshHistoryList();});
    });
    var historySort=newUiEl('ModernHistorySort');
    if(historySort)historySort.addEventListener('change',function(){
      handle(function(){return refreshHistoryList();});
    });
    var selectVisible=newUiEl('ModernHistorySelectVisible');
    if(selectVisible)selectVisible.addEventListener('click',function(){
      historyShownIds.forEach(function(id){historyMultiSelection[id]=true;});
      refreshHistoryList().catch(function(error){historyStatus(error.message,true);});
    });
    var clearChecked=newUiEl('ModernHistoryClearChecked');
    if(clearChecked)clearChecked.addEventListener('click',function(){
      historyMultiSelection=Object.create(null);
      refreshHistoryList().catch(function(error){historyStatus(error.message,true);});
    });
    var queueChecked=newUiEl('ModernHistoryQueueChecked');
    if(queueChecked)queueChecked.addEventListener('click',function(){handle(function(){
      var selected=new Set(historyVisibleSelectedIds());
      if(!selected.size)throw RangeError('Select visible snapshots first');
      var added=0;
      historyShownIds.forEach(function(id){
        if(selected.has(id)&&!historyStoryboardQueue.includes(id)&&historyStoryboardQueue.length<200){
          historyStoryboardQueue.push(id);added++;
        }
      });
      historyMultiSelection=Object.create(null);
      saveApplicationPreferences();
      return refreshHistoryList().then(function(entries){
        setHistoryOpen(false);setMode('animation');
        try{
          // Full History bulk hand-off adds frames; it must not silently
          // replace an in-progress Animation Studio draft.
          studioDraft=studioApi.insertSnapshots(studioDraft,Array.from(selected),entries,
            studioDraft.frames.length);
          stopStudioPlayback(true);studioPrepared=null;renderAnimationStudio(entries);
        }catch(error){historyStatus(error.message,true);
          var message=newUiEl('ModernAnimationStudioMessage');
          if(message){message.classList.add('is-error');message.textContent=error.message;}}
      });
    });});
    var openStaged=newUiEl('ModernHistoryQueueOpen');
    if(openStaged)openStaged.addEventListener('click',function(){handle(function(){
      return refreshHistoryList().then(function(entries){
        setHistoryOpen(false);setMode('animation');loadStagedAnimation(entries);
      });
    });});
    var clearQueue=newUiEl('ModernHistoryQueueClear');
    if(clearQueue)clearQueue.addEventListener('click',function(){
      historyStoryboardQueue=[];saveApplicationPreferences();
      refreshHistoryList().catch(function(error){historyStatus(error.message,true);});
    });
    var pinChecked=newUiEl('ModernHistoryPinChecked');
    if(pinChecked)pinChecked.addEventListener('click',function(){handle(function(){
      var ids=historyVisibleSelectedIds();
      if(!ids.length)throw RangeError('Select shown snapshots using the card checkboxes');
      return Promise.all(ids.map(function(id){return experimentHistory.pin(id,true);})).then(function(){
        historyStatus('Pinned '+ids.length+' selected snapshots.');return refreshHistoryList();
      });
    });});
    var deleteChecked=newUiEl('ModernHistoryDeleteChecked');
    if(deleteChecked)deleteChecked.addEventListener('click',function(){handle(function(){
      var ids=historyVisibleSelectedIds();
      if(!ids.length)throw RangeError('Select shown snapshots using the card checkboxes');
      return experimentHistory.list().then(function(entries){
        if(entries.some(function(entry){return entry.pinned&&ids.includes(entry.id);}))
          throw RangeError('Unpin selected pinned snapshots before deletion');
        if(!root.confirm||!root.confirm('Delete '+ids.length+' selected snapshots?'))return false;
        return Promise.all(ids.map(function(id){return experimentHistory.remove(id);}));
      }).then(function(result){
        if(result===false)return;
        ids.forEach(function(id){delete historyMultiSelection[id];});
        historyStatus('Deleted '+ids.length+' selected snapshots.');return refreshHistoryList();
      });
    });});
    var selectedPin=newUiEl('ModernHistoryPin');
    if(selectedPin)selectedPin.addEventListener('click',function(){handle(function(){
      var id=el('ModernHistorySelect').value;
      if(!id)throw RangeError('Select a history snapshot to pin or unpin');
      return experimentHistory.get(id).then(function(entry){
        if(!entry)throw RangeError('History snapshot not found');
        return experimentHistory.pin(id,!entry.pinned);
      }).then(function(){return refreshHistoryList(id);});
    });});
    var clearAll=newUiEl('ModernHistoryClearAll');
    if(clearAll)clearAll.addEventListener('click',function(){handle(function(){
      if(!root.confirm||!root.confirm('Permanently delete ALL history snapshots, including pinned and recovery?'))return;
      return experimentHistory.clearAll().then(function(count){
        historyMultiSelection=Object.create(null);
        resetHistoryBaseline();historyStatus('Deleted '+count+' history snapshots.');
        return refreshHistoryList('');
      });
    });});
    var saveSnapshot=newUiEl('ModernSnapshotSave');
    if(saveSnapshot)saveSnapshot.addEventListener('click',function(){
      if(snapshotSaveBusy)return;
      snapshotSaveBusy=true;updateSnapshotSaveAction();
      Promise.resolve().then(function(){
        cancelEdits();
        var snapshot=experimentSnapshot(),signature=historyFingerprint.exactSignature(snapshot);
        // Another History operation may have committed since the last refresh.
        // The store handles this race transactionally as well.
        if(savedHistorySignatures&&savedHistorySignatures.has(signature))return null;
        var image=historyThumbnail(snapshot);
        return experimentHistory.record(snapshot,'manual',image).then(function(result){
          resetHistoryBaseline();
          historyStatus((result.created?'Snapshot saved.':'Current snapshot already saved.')+
            (!image&&!result.entry.thumbnail?' Accurate preview unavailable; full experiment is safe.':''));
          return result.entry.id;
        });
      }).then(function(id){return refreshHistoryList(id===null?undefined:id);})
        .catch(function(error){historyStatus(error.message,true);
          snapshotSaveError=error.message;
        }).finally(function(){snapshotSaveBusy=false;updateSnapshotSaveAction();});
    });
    el('ModernHistoryRestore').addEventListener('click',function(){handle(function(){
      return restoreHistorySnapshot(el('ModernHistorySelect').value);
    });});
    el('ModernHistoryDelete').addEventListener('click',function(){handle(function(){
      var id=el('ModernHistorySelect').value;
      if(!id)throw RangeError('Select a history snapshot to delete');
      return experimentHistory.get(id).then(function(entry){
        if(entry&&entry.pinned)throw RangeError('Unpin this snapshot before deletion');
        if(!root.confirm||!root.confirm('Delete selected history snapshot?'))return false;
        return experimentHistory.remove(id);
      }).then(function(deleted){
        if(deleted===false)return;
        historyStatus(deleted?'Snapshot deleted.':'Snapshot not found.');return refreshHistoryList();
      });
    });});
    el('ModernHistoryClearAuto').addEventListener('click',function(){handle(function(){
      if(!root.confirm||!root.confirm('Delete all unpinned automatic snapshots?'))return;
      return experimentHistory.clearAuto().then(function(count){
        resetHistoryBaseline();
        historyStatus('Removed '+count+' automatic snapshots. Manual and recovery snapshots kept.');
        return refreshHistoryList();
      });
    });});
    var exportSelected=newUiEl('ModernHistoryExportSelected');
    if(exportSelected)exportSelected.addEventListener('click',function(){handle(function(){
      var id=newUiEl('ModernHistorySelect').value;
      if(!id)throw RangeError('Select a snapshot to export');
      return experimentHistory.get(id).then(function(entry){
        if(!entry)throw RangeError('Snapshot not found');
        downloadHistoryJson(historyFactory.exportPortable([entry]),'curvature-snapshot.json');
        historyStatus('Snapshot exported with name, notes and preview.');
      });
    });});
    var exportAll=newUiEl('ModernHistoryExportAll');
    if(exportAll)exportAll.addEventListener('click',function(){handle(function(){
      return experimentHistory.list().then(function(entries){
        if(!entries.length)throw RangeError('No snapshots to export');
        downloadHistoryJson(historyFactory.exportPortable(entries),'curvature-history.json');
        historyStatus('Exported '+entries.length+' snapshots with annotations.');
      });
    });});
    var exportCurrent=newUiEl('ModernHistoryExportCurrent');
    if(exportCurrent)exportCurrent.addEventListener('click',function(){handle(function(){
      cancelEdits();
      downloadHistoryJson(root.CurvatureModernExperimentLibrary.exportJson(experimentSnapshot()),
        'curvature-experiment.json');
      historyStatus('Current experiment exported as compatible plain JSON.');
    });});
    var importButton=newUiEl('ModernHistoryImport'),importFile=newUiEl('ModernHistoryImportFile');
    if(importButton&&importFile){
      importButton.addEventListener('click',function(){importFile.value='';importFile.click();});
      importFile.addEventListener('change',function(){
        var file=importFile.files&&importFile.files[0];if(!file)return;
        if(file.size>historyFactory.MAX_PORTABLE_LENGTH){
          historyStatus('History JSON file too large.',true);return;
        }
        file.text().then(function(contents){
          var entries=historyFactory.parsePortable(contents);
          return experimentHistory.importEntries(entries).then(function(result){
            return refreshHistoryList().then(function(){
              historyStatus('Imported '+result.created+' snapshots; '+result.reused+
                ' already present. Use Restore to load an imported experiment.');
            });
          });
        }).catch(function(error){historyStatus('Import failed: '+error.message,true);});
      });
    }
    experimentHistory.open().then(function(){
      var oldLibrary=root.CurvatureModernExperimentLibrary;
      if(!oldLibrary)return;
      return oldLibrary.migrate(root.localStorage,experimentHistory).then(function(result){
        if(result&&!result.skipped&&result.created)
          historyStatus('Imported '+result.created+' named Library experiments. Original local data retained.');
      }).catch(function(error){
        historyStatus('Old Library migration pending: '+error.message,true);
      });
    }).then(function(){return refreshHistoryList();}).catch(function(error){
      historyLoadError=error.message;
      historyStatus('Experiment history unavailable: '+error.message,true);
      updateSnapshotSaveAction();
    });
  }
  function applyExperiment(experiment){
    stopCameraTransition(false,'Transition interrupted by experiment load',false);
    var data=experiments.validate(experiment),scene=data.scene;
    // All values are prevalidated as one transaction before touching CurveApp.
    Object.keys(scene.camera).forEach(function(key){model[key]=scene.camera[key];});
    Object.keys(scene.objects).forEach(function(key){model[key]=scene.objects[key].slice();});
    model.showModel=scene.surface.showModel;model.rEarth=scene.surface.rEarth;
    model.showGrid=scene.showGrid?1:0;
    model.DemoText=scene.title;model.Description=scene.description;
    state.atmosphere=scene.atmosphere;state.occlusionRadius=scene.occlusionRadius;
    state.visibility=Object.assign({},scene.visibility);
    state.temperatureProfile=Object.assign({},scene.temperatureProfile);
    state.transitionProfile=Object.assign({},scene.transitionProfile);
    state.inverseProfile=Object.assign({},scene.inverseProfile);
    state.showTemperatureProfile=data.display.showTemperatureProfile;
    state.temperaturePlacement=data.display.temperaturePlacement;
    state.preset=scene.resetPreset;
    state.compareConfig=compareState.sharedVisibility({A:data.compare.A,B:data.compare.B,preset:data.compare.preset});
    state.compareSelected=data.compare.selected;
    state.compareEyeLevel=data.display.eyeLevel;state.compareHorizon=data.display.horizon;
    state.mode=data.display.mode;
    cameraPositions=data.cameraPositions||[];
    cameraSequence=data.cameraSequence?data.cameraSequence.keyframes:[];
    initialCamera=null;
    // Older saved experiments may contain display.gpuProbe=true. The mode is
    // retired: load their A/B physical settings without invoking WebGPU.
    model.Update();
    var select=el('ModernPreset');if(select)select.value=scene.preset;
    initialCamera=captureCameraPose();
    renderCameraPositions('');renderCameraSequenceKeyframes(-1);
  }
  function isExplicitSharedExperiment(){
    if(!experiments||!root.location)return false;
    var params=new URLSearchParams(root.location.search||'');
    var historyState=root.history&&root.history.state;
    var generated=!!(historyState&&historyState[AUTO_EXPERIMENT_HISTORY_KEY]===true);
    var editedHere=!!(historyState&&historyState[EDITED_SHARED_URL_KEY]===root.location.href);
    return params.has(experiments.PARAM)&&!generated&&!editedHere;
  }
  function restoreExperiment(remoteRecord,remoteError){
    if(!experiments||!root.location)return false;
    var params=new URLSearchParams(root.location.search||'');
    var explicit=isExplicitSharedExperiment();
    persistence.explicitUrl=explicit;
    var data=null,source='';
    try{
      if(explicit){
        // Explicit shared links win even when they are invalid: never replace
        // a broken incoming link with another user's private local session.
        data=experiments.readUrl(root.location.search);source='shared URL';
      }else{
        var local=localSession(),remote=null;
        if(remoteRecord&&sessionAutosave){
          try{remote=sessionAutosave.normalize(remoteRecord,experiments.validate);}
          catch(error){remoteError=error;}
        }
        var chosen=sessionAutosave?sessionAutosave.newer(local,remote):(local||remote);
        if(chosen){data=chosen.experiment;source=chosen===remote?'working-session database':'working-session storage';
          if(chosen.savedAt!==null)persistence.latestTimestamp=chosen.savedAt;
          if(chosen===remote){
            // Repair the synchronous unload fallback after a successful IDB
            // recovery. This does not mark a new edit or create History.
            try{var storage=preferencesStorage();if(storage){
              storage.setItem(experiments.STORAGE_KEY,JSON.stringify(data));
              storage.setItem(sessionAutosave.META_KEY,String(remote.savedAt));
            }}catch(ignore){}
          }
        }else if(params.has(experiments.PARAM)){
          data=experiments.readUrl(root.location.search);source='previous session URL';
        }
      }
      if(!data){
        if(remoteError)persistenceStatus('Session storage unavailable: '+remoteError.message,true);
        return false;
      }
      applyExperiment(data);
      persistenceStatus('Restored '+source);
      return true;
    }catch(error){
      persistenceStatus('Experiment not restored: '+error.message,true);
      return false;
    }
  }
  function copyExperimentUrl(){
    if(!experiments||!root.location||!root.location.href)return;
    try{
      cancelEdits();
      var url=experiments.urlWithExperiment(root.location.href,experimentSnapshot());
      if(root.navigator&&root.navigator.clipboard&&root.navigator.clipboard.writeText){
        root.navigator.clipboard.writeText(url).then(function(){persistenceStatus('Experiment URL copied');},
          function(){if(root.prompt)root.prompt('Copy experiment URL',url);
            persistenceStatus('Clipboard unavailable — use the shown URL');});
      }else if(root.prompt){root.prompt('Copy experiment URL',url);}
      else persistenceStatus('Clipboard is unavailable',true);
    }catch(error){persistenceStatus('Cannot share experiment: '+error.message,true);}
  }
  function resetExperiment(){
    cancelEdits();cancelPending();
    persistence.dirty=false;
    if(persistence.timer!==null){clearTimeout(persistence.timer);persistence.timer=null;}
    try{
      if(root.localStorage){
        root.localStorage.removeItem(experiments.STORAGE_KEY);
        if(sessionAutosave)root.localStorage.removeItem(sessionAutosave.META_KEY);
      }
    }catch(error){persistenceStatus('Could not clear saved experiment: '+error.message,true);return;}
    function navigateDefault(){
      if(root.location&&root.location.href){
        var url=new URL(root.location.href);
        url.searchParams.delete(experiments.PARAM);url.searchParams.delete('state');
        url.searchParams.set('ui','modern');
        if(typeof root.location.assign==='function')root.location.assign(url.href);
        else persistenceStatus('Reload this page to restore the default experiment');
      }
    }
    if(sessionAutosave&&root.indexedDB){
      persistence.pendingCheckpoint.catch(function(){}).then(function(){
        return sessionAutosave.clear(root.indexedDB);
      }).then(navigateDefault,function(error){
        persistenceStatus('Could not clear working-session database: '+error.message,true);
      });
    }else navigateDefault();
  }
  function bindPersistence(){
    if(!experiments)return;
    var copy=el('ModernCopyExperiment');if(copy)copy.addEventListener('click',copyExperimentUrl);
    var reset=el('ModernResetExperiment');if(reset)reset.addEventListener('click',resetExperiment);
  }
  // Compact physics summaries reflect live model state, not workspace preferences.
  // Mathematical model caveats remain visible outside collapsed help/equations.
  function updatePhysicsPanelPresentation(compare){
    var scope=compare?'Compare':'Scene';
    var spec=compare&&state.compareConfig?state.compareConfig[state.compareSelected]:null;
    if(compare&&!spec)return;
    var surface=compare?spec.surface:(model.showModel===2?'flat':'globe');
    var radiusKm=compare?spec.radiusKm:model.rEarth/1000;
    var radiusLabel=Number.isFinite(Number(radiusKm))?
      Number(Number(radiusKm).toPrecision(7)).toLocaleString('en-US')+' km':'unknown R';
    var summary=newUiEl('ModernSurface'+scope+'Summary');
    if(summary)summary.textContent=surface==='flat'?'Flat · κ = 0':'Globe · R = '+radiusLabel;
    var kind=compare?spec.atmosphere:state.atmosphere;
    if(compare){
      var physicsSummary=newUiEl('ModernCompareSelectedSummary');
      if(physicsSummary){
        var atmosphereNames={'standard':'Standard','vacuum':'Vacuum',
          'temperature-lapse':'Temperature gradient','profile-transition':'Profile transition',
          'inverse-temperature':'Inverse temperature','exponential-occlusion':'Engineered exponential',
          'inverse-spherical':'Legacy inverse'};
        physicsSummary.textContent='Model '+state.compareSelected+' · '+
          (surface==='flat'?'Flat':'Globe · R = '+radiusLabel)+' · '+
          (atmosphereNames[kind]||kind);
      }
    }
    var caution=newUiEl('ModernAtmosphere'+scope+'Caution');
    var cautionText={
      'profile-transition':'Mathematical n(h) blend — not an atmospheric temperature law.',
      'inverse-temperature':'Inverse T(h) can become nonphysical above zero Kelvin; rays still follow a mathematical refractive profile.',
      'exponential-occlusion':'Engineered refractive profile — hypothetical, not an observed atmosphere.',
      'inverse-spherical':'Legacy inverse model — a mathematical construction, not an observed atmosphere.'
    }[kind]||'';
    if(caution){caution.textContent=cautionText;caution.hidden=!cautionText;}
    var profile=newUiEl('Modern'+scope+'AtmosphereProfileSection');
    if(profile)profile.hidden=!['temperature-lapse','profile-transition',
      'inverse-temperature','exponential-occlusion','inverse-spherical'].includes(kind);
  }
  function refreshLabels(){
    var curvature=root.CurvaturePhysicalCurvature;
    var output=el('ModernCurvatureLabel');
    if(output)output.textContent=curvature.label(model);
    var slider=el('ModernCurvature');
    if(slider)slider.value=String(curvature.modelStep(model));
    var flat=el('ModernFlat');if(flat)flat.checked=model.showModel===2;
    ['ModernSceneRadiusWrap','ModernSceneEarthWrap'].forEach(function(id){
      var node=newUiEl(id);if(node)node.hidden=model.showModel===2;
    });
    var radius=el('ModernRadiusKm');
    if(radius){radius.disabled=model.showModel===2;
      if(model.showModel===1)radius.value=String(Number((model.rEarth/1000).toPrecision(12)));}
    var mode=el('ModernViewInfo');
    if(mode)mode.textContent=(model.viewcenterHorizon===3?'Eye level':'Camera aim '+model.viewcenterHorizon)+
      ' · '+(model.showModel===2?'Flat surface':'Globe');
    var pill=el('ModernModePill');if(pill)pill.textContent=state.mode.toUpperCase();
    updateObjectGroupSummaries();
    var wrap=el('ModernOcclusionWrap');
    if(wrap)wrap.hidden=!['inverse-spherical','exponential-occlusion','profile-transition','inverse-temperature'].includes(state.atmosphere);
    showLegacyOption('ModernAtmosphere',state.atmosphere);
    renderAtmosphereDescription('ModernAtmosphereInfo',state.atmosphere);
    updatePhysicsPanelPresentation(false);
    syncTemperatureControls();
    var fov=el('ModernViewAngle');if(fov&&Number.isFinite(model.ViewAngle))
      fov.value=String(Number(model.ViewAngle.toFixed(4)));
  }
  function draw(g){
    if(state.mode!=='scene')return;
    try{
      var startedAt=profileNow();
      var separateDecorations=!!(atmosphericPresentation&&atmosphericPresentation.enabled('Scene'));
      var result=root.CurvatureMainCanvasRenderer.renderPhysical(g,model,{
        atmosphere:state.atmosphere,occlusionRadius:state.occlusionRadius,
        visibility:state.visibility,temperatureProfile:state.temperatureProfile,
        transitionProfile:state.transitionProfile,inverseProfile:state.inverseProfile,interactive:false,
        deferDecorations:separateDecorations,geometryBackend:state.geometryBackend,
        opticalQuality:effectiveOpticalQuality(),
        previewLod:{stride:previewStride('Scene')},
        forceColdOptics:state.opticalSample==='cold'
      });
      var renderedAt=profileNow();
      var guideGraph=atmosphericPresentation?atmosphericPresentation.capture('Scene',g):g;
      // drawPresentationDecorations also handles WebGL-unavailable fallback:
      // if capture failed, the original Canvas receives its captions again.
      if(separateDecorations&&root.CurvatureMainCanvasRenderer.drawPresentationDecorations)
        root.CurvatureMainCanvasRenderer.drawPresentationDecorations(
          guideGraph.Canvas,model,result.decorationCamera);
      state.last=result;
      updateGeometryBackendStatus(result);
      var sceneOptions={atmosphere:state.atmosphere,occlusionRadius:state.occlusionRadius,
        temperatureProfile:state.temperatureProfile,transitionProfile:state.transitionProfile,inverseProfile:state.inverseProfile};
      if(state.compareEyeLevel&&guideGraph&&guideGraph.Canvas)drawCompareEyeLevel(guideGraph,model);
      if(effectiveOpticalQuality()==='fast'){
        var fastHorizon=el('ModernHorizonStatusScene');
        if(fastHorizon)fastHorizon.textContent='Exact horizon: disabled in Fast Preview';
      }else if(state.compareHorizon)drawCompareHorizon('Scene',guideGraph,model,sceneOptions);
      markHistoryRendered('Scene');
      scheduleShimmerFrame();
      var finishedAt=profileNow();
      if(renderProfiler)renderProfiler.recordRender({viewport:'Scene',
        totalMs:finishedAt-startedAt,rendererMs:renderedAt-startedAt,
        overlayMs:finishedAt-renderedAt,stages:result.timings,
        backend:result.geometryBackend,cacheReused:result.cacheReused,
        opticalSample:state.opticalSample,opticalStages:result.opticalStages,
        opticalWork:result.opticalWork,fieldStats:result.fieldStats});
      var fullStatus=(effectiveOpticalQuality()==='fast'?'Fast Preview · approximate':
        (result.cacheReused?'Cached optics':'Physical optics'))+
        ' · '+result.drawn+' outline pieces · '+result.fillTriangles+
        ' fill triangles · '+result.unresolved+' unresolved · '+(result.geometryBackend||'Canvas 2D')+
        (result.geometryFallback?' (GPU fallback: '+result.geometryFallback+')':'')+
        (result.timings?' · '+Math.round(result.timings.totalMs)+' ms':'');
      var statusNode=el('ModernStatus');if(statusNode)statusNode.title=fullStatus;
      updateStatus(fullStatus,result.unresolved>0);
      updateOpticalQualityStatus();
    }catch(error){
      historyRenderedKeys.Scene=null;state.last=null;
      if(effectiveOpticalQuality()==='fast')clearUnavailablePreview(g);
      updateOpticalQualityStatus(effectiveOpticalQuality()==='fast'?'Fast Preview: '+error.message:undefined);
      updateStatus('Physical renderer: '+error.message,true);
      if(root.console&&root.console.error)root.console.error('Modern Scene render:',error);
    }
  }
  function drawCompare(side,g){
    if(state.mode!=='compare'||!state.comparePair)return;
    var m=state.comparePair[side];
    if(!m)return;
    try{
      var startedAt=profileNow();
      // A and B invoke the actual Physical renderer separately, not copied pixels.
      var spec=state.compareConfig&&state.compareConfig[side];
      var options={atmosphere:spec?spec.atmosphere:state.atmosphere,
        occlusionRadius:spec?spec.occlusionRadius:state.occlusionRadius,
        visibility:spec?spec.visibility:state.visibility,
        temperatureProfile:spec?spec.temperatureProfile:state.temperatureProfile,
        transitionProfile:spec?spec.transitionProfile:state.transitionProfile,
        inverseProfile:spec?spec.inverseProfile:state.inverseProfile,interactive:false,
        geometryBackend:state.geometryBackend,opticalQuality:effectiveOpticalQuality(),
        previewLod:{stride:previewStride('compare')},
        forceColdOptics:state.opticalSample==='cold'};
      // Separate optical sessions prevent A and B from evicting each other's
      // keyed ray fields as two viewports are rendered in succession.
      if(effectiveOpticalQuality()==='fast'){
        // Preview sessions are created lazily: Accurate remains the ordinary
        // startup path, and A/B cannot evict each other's ray fields.
        if(!state.compareFastCache[side]&&root.CurvaturePhysicalSceneOptics&&
            typeof root.CurvaturePhysicalSceneOptics.create==='function')
          state.compareFastCache[side]=root.CurvaturePhysicalSceneOptics.create();
        if(state.compareFastCache[side])options.cacheSession=state.compareFastCache[side];
      }else if(state.compareCache[side])options.cacheSession=state.compareCache[side];
      // Production A/B never installs a WebGPU or replay optical field.
      var separateDecorations=!!(atmosphericPresentation&&atmosphericPresentation.enabled(side));
      if(separateDecorations)options.deferDecorations=true;
      var result=root.CurvatureMainCanvasRenderer.renderPhysical(g,m,options);
      var renderedAt=profileNow();
      var guideGraph=atmosphericPresentation?atmosphericPresentation.capture(side,g):g;
      if(separateDecorations&&root.CurvatureMainCanvasRenderer.drawPresentationDecorations)
        root.CurvatureMainCanvasRenderer.drawPresentationDecorations(
          guideGraph.Canvas,m,result.decorationCamera);
      state.compareLast[side]=result;
      updateGeometryBackendStatus(result);
      if(state.compareEyeLevel&&guideGraph&&guideGraph.Canvas)drawCompareEyeLevel(guideGraph,m);
      if(effectiveOpticalQuality()==='fast'){
        var approximateHorizon=el('ModernHorizonStatus'+side);
        if(approximateHorizon)approximateHorizon.textContent='Exact horizon: disabled in Fast Preview';
      }else if(state.compareHorizon)drawCompareHorizon(side,guideGraph,m,options);
      else {var hr=el('ModernHorizonStatus'+side);if(hr)hr.textContent='Horizon guide hidden';}
      markHistoryRendered(side);
      scheduleShimmerFrame();
      var finishedAt=profileNow();
      if(renderProfiler)renderProfiler.recordRender({viewport:side,
        totalMs:finishedAt-startedAt,rendererMs:renderedAt-startedAt,
        overlayMs:finishedAt-renderedAt,stages:result.timings,
        backend:result.geometryBackend,cacheReused:result.cacheReused,
        opticalSample:state.opticalSample,opticalStages:result.opticalStages,
        opticalWork:result.opticalWork,fieldStats:result.fieldStats});
      var node=el('ModernCompareStatus'+side);
      if(node){
        node.textContent=(effectiveOpticalQuality()==='fast'?'Fast Preview · approximate':'Computed optics')+
          (result.cacheReused?' (cached)':'')+
          ' · '+result.drawn+' contours · '+result.fillTriangles+' fills · '+
          result.unresolved+' unresolved'+
          (result.previewLod?' · '+result.previewLod.selected+'/'+result.previewLod.original+' objects':'');
        node.classList.toggle('is-error',!!result.unresolved);
      }
    }catch(error){
      historyRenderedKeys[side]=null;state.compareLast[side]=null;
      if(effectiveOpticalQuality()==='fast')clearUnavailablePreview(g);
      updateOpticalQualityStatus(effectiveOpticalQuality()==='fast'?'Fast Preview: '+error.message:undefined);
      var status=el('ModernCompareStatus'+side);
      if(status){status.textContent='Physical model '+side+': '+error.message;status.classList.toggle('is-error',true);}
      if(root.console&&root.console.error)root.console.error('Modern Compare '+side+':',error);
    }
  }
  // Screen-space annotation only. The camera is observer-fixed in Compare;
  // the local horizontal direction projects using the same angular FOV.
  // This guide never enters optical shooting or the physical scene model.
  function drawCompareEyeLevel(g,m){
    var canvas=g.Canvas,ctx=canvas.getContext('2d');
    var width=canvas.width;
    var y=compareAngleY(g,m,0);
    if(y===null)return;
    ctx.save();
    try{
      ctx.setTransform(1,0,0,1,0,0);
      ctx.strokeStyle='#159447';ctx.fillStyle='#117b3b';ctx.lineWidth=Math.max(1,canvas.width/900);
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();
      ctx.font=Math.max(11,Math.round(width/65))+'px Arial, sans-serif';
      ctx.textBaseline=y<18?'top':'bottom';
      ctx.fillText('Eye level · 0°',8,y<18?y+3:y-4);
    }finally{ctx.restore();}
  }
  // The optical horizon is a *forward-RK4 first-ground-contact diagnostic*.
  // It is neither the renderer's guide clipping distance nor a ready-made
  // geometric horizon law. An unresolved angular boundary draws no line.
  function drawCompareHorizon(side,g,m,options){
    if(!g||!g.Canvas)return; // DOM-free renderer harnesses have no pixel overlay.
    var readout=el('ModernHorizonStatus'+side);
    var detector=root.CurvatureRayHorizon;
    if(!detector){if(readout)readout.textContent='Horizon: tracer unavailable';return;}
    var geometry=m.showModel===2?'flat':'globe';
    var traceKind=options.atmosphere;
    if(traceKind==='profile-transition'&&options.transitionProfile){
      if(options.transitionProfile.weight===0)traceKind=options.transitionProfile.source;
      else if(options.transitionProfile.weight===1)traceKind='exponential-occlusion';
    }
    var arguments_={geometry:geometry,radius:m.rEarth,observerHeight:m.Height,
      atmosphere:traceKind,profileOptions:traceKind==='temperature-lapse'?options.temperatureProfile:
        traceKind==='profile-transition'?{temperatureProfile:options.temperatureProfile,
          transitionProfile:options.transitionProfile,occlusionRadius:options.occlusionRadius}:
        traceKind==='inverse-temperature'?{temperatureProfile:options.temperatureProfile,
          inverseProfile:options.inverseProfile,occlusionRadius:options.occlusionRadius}:
        {occlusionRadius:options.occlusionRadius}};
    var key=JSON.stringify(arguments_),cached=state.horizonCache[side];
    if(!cached||cached.key!==key){
      var measured;
      try{measured=detector.diagnose(arguments_);}
      catch(error){measured={status:'unresolved',reason:error.message};}
      state.horizonCache[side]={key:key,result:measured};
    }
    var result=state.horizonCache[side].result;
    if(result.status!=='resolved'){
      if(readout){readout.textContent='Horizon: '+(result.status==='ambiguous'?'ambiguous':'unresolved')+
        ' (finite tangent not established)';readout.title=result.reason||'';}
      return;
    }
    var angle=result.angleDegrees;
    if(readout){readout.textContent='Horizon '+angle.toFixed(4)+'° · dip '+
      result.dipDegrees.toFixed(4)+'° · tangent ≈ '+
      (result.tangentDistance/1000).toFixed(2)+' km';
      readout.title='Forward RK4 first-contact diagnostic; 100 km search, angular bracket '+
        result.bracketDegrees.map(function(v){return v.toFixed(6)+'°';}).join(' to ')+
        '. Not a global uniqueness proof.';}
    if(m.Roll!==0){
      if(readout)readout.textContent+=' · overlay omitted for camera roll';
      return; // A rolled camera requires a sloped angle-isoline, not a flat stripe.
    }
    var y=compareAngleY(g,m,angle);
    if(y===null){if(readout)readout.textContent+=' · outside view';return;}
    var canvas=g.Canvas,ctx=canvas.getContext('2d');
    ctx.save();
    try{
      ctx.setTransform(1,0,0,1,0,0);
      ctx.strokeStyle='#d48313';ctx.fillStyle='#ad640a';ctx.lineWidth=Math.max(1,canvas.width/850);
      if(typeof ctx.setLineDash==='function')ctx.setLineDash([7,5]);
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();
      if(typeof ctx.setLineDash==='function')ctx.setLineDash([]);
      ctx.font=Math.max(11,Math.round(canvas.width/65))+'px Arial, sans-serif';
      ctx.textBaseline=y<18?'top':'bottom';
      ctx.fillText('Traced horizon · '+angle.toFixed(4)+'°',8,y<18?y+3:y-4);
    }finally{ctx.restore();}
  }
  function compareAngleY(g,m,elevationDegrees){
    var canvas=g.Canvas;
    if(!canvas||!(canvas.width>0&&canvas.height>0))return null;
    var aspect=Number(m.deviceRatio),diagonalFov=Number(m.camViewAngle);
    if(!(aspect>0&&diagonalFov>0))return null;
    var verticalHalfTan=Math.tan(diagonalFov/2)/Math.sqrt(1+aspect*aspect);
    var tilt=Number(m.Nick)*Math.PI/180;
    var aim=m.viewcenterHorizon===3?0:root.CurvaturePhysicalCamera.create(m).aimDip;
    // PhysicalCamera127 aims at elevation (Nick - aimDip). Positive ray
    // elevation projects UP in the painter, while Canvas y increases DOWN.
    // Thus a negative horizon elevation must land BELOW the 0° eye-level.
    var cameraElevation=tilt-aim;
    var relative=elevationDegrees*Math.PI/180-cameraElevation;
    var y=canvas.height/2-canvas.height*Math.tan(relative)/(2*verticalHalfTan);
    return Number.isFinite(y)&&y>=0&&y<=canvas.height?y:null;
  }
  function registerCompareGraph(side,g){
    if(side!=='A'&&side!=='B')throw RangeError('Invalid Compare side');
    state.compareGraphs[side]=g;
  }
  function prepareCompare(){
    if(!compareAdapter){updateStatus('Compare adapter is unavailable',true);return false;}
    if(compareState&&!state.compareConfig)
      state.compareConfig=compareState.initial(model,state.atmosphere,state.occlusionRadius,state.temperatureProfile,state.transitionProfile,state.inverseProfile);
    var result=compareState?compareState.pair(model,state.compareConfig,compareAdapter):compareAdapter.pair(model);
    if(!compareAdapter.invariant(result))throw Error('Compare shared-scene invariant failed');
    state.comparePair=result;
    var aLabel=el('ModernCompareLabelA'),bLabel=el('ModernCompareLabelB');
    if(compareState){
      if(aLabel)aLabel.textContent=compareState.label(state.compareConfig.A);
      if(bLabel)bLabel.textContent=compareState.label(state.compareConfig.B);
    }else{
      if(aLabel)aLabel.textContent=(result.A.showModel===2?'Exact flat':'R = '+(result.A.rEarth/1000).toLocaleString('en-US')+' km')+' · '+state.atmosphere;
      if(bLabel)bLabel.textContent='κ = 0 · '+state.atmosphere;
    }
    return true;
  }
  // Hidden legacy entries are revealed only when the current experiment uses
  // them. Old URLs/JSON/library entries remain editable and round-trippable.
  function showLegacyOption(selectId,value){
    var select=el(selectId);
    if(!select||!select.options)return;
    for(var i=0;i<select.options.length;i++){
      var option=select.options[i];
      if(option.value==='inverse-spherical'||option.value==='standard-inverse'||option.value==='flat-inverse'){
        var active=option.value===value;
        option.hidden=!active;
        option.disabled=!active;
      }
    }
  }
  function atmosphereDescription(kind){
    var info={
      vacuum:['Vacuum · idealized','n(h) = 1',
        'No atmospheric refraction; rays travel in straight lines in the chosen surface geometry.',
        'No refractive parameters.'],
      'temperature-lapse':['Temperature gradient · dry hydrostatic boundary layer','T(h) = T₀ + L × 1000 m × (1 − exp(−h / 1000 m))',
        'Ray tracing uses n(h) − 1 proportional to p(h)/T(h); pressure follows dry hydrostatic equilibrium. The surface gradient L relaxes exponentially rather than remaining linear to high altitudes.',
        'L is a local surface gradient in K/km. Fixed transition length 1000 m; no humidity or layered meteorology.'],
      standard:['Standard atmosphere · approximation','n(h) = 1 + 0.000293 × exp(−h / 7350 m)',
        'Simplified exponential decrease of refractivity with height; this is not a weather-dependent atmospheric model.',
        'Near-surface refractivity 293 ppm; scale height H = 7350 m.'],
      'profile-transition':['Profile transition · mathematical experiment',
        'n(h) = (1−w) n_start(h) + w exp(h/R)',
        'Interpolates refractive-index profiles, not meteorological parameters. This is NOT a physical evolution caused by a temperature gradient.',
        'Choose an exact Standard or temperature-dependent starting profile. 0% and 100% reproduce the chosen start and engineered exponential respectively.'],
      'inverse-temperature':['Inverse atmosphere · required T(h) and gradient',
        'dT/dh = −g/Rd − T d ln(n−1)/dh',
        'An exact hydrostatic inverse temperature is solved from a density-compatible index profile. The 0–100% control connects the starting air model to the engineered increasing exponential; the surface gradient input controls the same family.',
        'The legacy engineered n(0)=1 has zero surface refractivity. We rescale it to n(0)=1+N0, which leaves all ray trajectories unchanged. T(h) is invalid at and above zero Kelvin, while optical n(h) continues as a purely mathematical experiment.'],
      'exponential-occlusion':['Exponential refractive profile · hypothetical','n(h) = n₀ × exp(h / R)',
        'Engineered increasing refractive index; bends rays toward lower heights. Not an observed model of Earth’s atmosphere.',
        'R is the atmospheric comparison radius (metres), independent of the surface radius; n₀ = 1 in this UI.'],
      'inverse-spherical':['Inverse spherical · legacy experimental profile','n(h) = n₀ × √(1 + (1+h/R)⁴ − (1+h/R)²)',
        'An alternative inverse-optics construction retained to reproduce previously saved experiments; not offered for new selection.',
        'R is the atmospheric comparison radius (metres); n₀ = 1 in this UI.']
    }[kind];
    return info||null;
  }
  function renderAtmosphereDescription(id,kind){
    var node=newUiEl(id),info=atmosphereDescription(kind);
    if(!node||!info||typeof node.appendChild!=='function'||typeof document.createElement!=='function')return;
    // Use textContent instead of HTML interpolation for robustness.
    node.textContent='';
    var title=document.createElement('strong');title.textContent=info[0];node.appendChild(title);
    var formula=document.createElement('div');formula.className='modern-atmosphere-formula';
    // Fixed, code-owned markup only: no user-supplied text is interpreted as HTML.
    var formulas={
      vacuum:'<i>n</i>(<i>h</i>) = 1',
      standard:'<i>n</i>(<i>h</i>) = 1 + 0.000293 <i>e</i><sup>−<span class="math-frac"><span><i>h</i></span><span>7350 m</span></span></sup>',
      'temperature-lapse':'<i>T</i>(<i>h</i>) = <i>T</i><sub>0</sub> + <i>L</i> × 1000 m (1 − <i>e</i><sup>−<i>h</i>/1000 m</sup>)',
      'profile-transition':'<i>n</i>(<i>h</i>) = (1 − <i>w</i>) <i>n</i><sub>start</sub>(<i>h</i>) + <i>w</i> <i>e</i><sup><i>h</i>/<i>R</i></sup>',
      'inverse-temperature':'<span class="math-frac"><span>d<i>T</i></span><span>d<i>h</i></span></span> = −<i>g</i>/<i>R</i><sub>d</sub> − <i>T</i> d ln(<i>n</i>−1)/d<i>h</i>',
      'exponential-occlusion':'<i>n</i>(<i>h</i>) = <i>n</i><sub>0</sub> <i>e</i><sup><span class="math-frac"><span><i>h</i></span><span><i>R</i></span></span></sup>',
      'inverse-spherical':'<i>n</i>(<i>h</i>) = <i>n</i><sub>0</sub> √(1 + (1 + <i>h</i>/<i>R</i>)<sup>4</sup> − (1 + <i>h</i>/<i>R</i>)<sup>2</sup>)'
    };
    formula.innerHTML=formulas[kind];node.appendChild(formula);
    var details=document.createElement('div');details.textContent=info[2];node.appendChild(details);
    var note=document.createElement('div');note.className='modern-atmosphere-note';
    note.textContent=info[3];node.appendChild(note);
  }
  // Temperature is an optical-input profile, not a screen-space distortion.
  // Both viewports use the identical RayTracer temperature(h) sampler for the
  // legend; absolute scales are shared by all currently compared views.
  function temperatureColor(c,wide){
    var low=wide?-273.15:-40,high=60;
    var palette=[[35,79,181],[99,177,210],[225,229,195],[233,164,86],[191,53,57]];
    var t=Math.max(0,Math.min(3.999999,(c-low)/(high-low)*4)),i=Math.floor(t),f=t-i;
    var v=palette[i].map(function(a,j){return Math.round(a+(palette[i+1][j]-a)*f);});
    return 'rgb('+v.join(',')+')';
  }
  function syncTemperatureColumn(side,kind,profile,reserveStrip,transition,inverse,radius){
    var column=newUiEl('ModernTemperature'+side);
    if(!column)return;
    var visible=state.showTemperatureProfile&&(kind==='temperature-lapse'||
      (kind==='profile-transition'&&transition&&transition.source==='temperature-lapse')||
      kind==='inverse-temperature');
    column.hidden=!visible;
    // Reserve a real strip only for visible temperature-lapse columns.
    // GraphX3DX measures its own .JsGraph width, so an outside strip keeps
    // the camera angle unchanged while the graph is resized to fit.
    var host=column.parentElement;
    var previous=host&&host.getAttribute('data-temperature-placement');
    var placement=(visible||reserveStrip)?state.temperaturePlacement:'hidden';
    if(host)host.setAttribute('data-temperature-placement',placement);
    var outsideChanged=false;
    if(host){
      var wasOutside=previous==='outside-right'||previous==='outside-left';
      var nowOutside=placement==='outside-right'||placement==='outside-left';
      outsideChanged=wasOutside!==nowOutside;
    }
    if(!visible)return outsideChanged;
    var tracer=root.CurvatureRayTracer;
    if(!tracer||typeof tracer.atmosphere!=='function')return outsideChanged;
    var atmosphere=kind==='inverse-temperature'?tracer.atmosphere(kind,{temperatureProfile:profile,
      inverseProfile:inverse,occlusionRadius:radius}):tracer.atmosphere('temperature-lapse',profile),
      ramp=column.querySelector('.modern-temperature-ramp');
    if(!ramp)return outsideChanged;
    var wide=kind==='inverse-temperature'||(state.mode==='compare'&&state.compareConfig&&
      (state.compareConfig.A.atmosphere==='inverse-temperature'||state.compareConfig.B.atmosphere==='inverse-temperature'));
    var stops=[];
    for(var i=0;i<=12;i++){
      var height=2000*(1-i/12);
      var temperature=atmosphere.temperatureCAt(height);
      stops.push((Number.isFinite(temperature)?temperatureColor(temperature,wide):'#707780')+
        ' '+(100*i/12).toFixed(2)+'%');
    }
    ramp.style.background='linear-gradient(to bottom, '+stops.join(',')+')';
    var top=column.querySelector('.modern-temperature-top'),bottom=column.querySelector('.modern-temperature-bottom');
    if(top)top.textContent=Number.isFinite(atmosphere.temperatureCAt(2000))?
      atmosphere.temperatureCAt(2000).toFixed(1)+' °C':'invalid';
    var columnTitle=column.querySelector('strong');if(columnTitle)columnTitle.textContent=
      kind==='profile-transition'?'T start(h) · 2 km':'T(h) · 2 km';
    if(bottom)bottom.textContent=atmosphere.temperatureCAt(0).toFixed(1)+' °C';
    column.setAttribute('aria-label','Temperature from 0 to 2 km: '+
      atmosphere.temperatureCAt(0).toFixed(1)+' to '+
      (Number.isFinite(atmosphere.temperatureCAt(2000))?atmosphere.temperatureCAt(2000).toFixed(1):'invalid')+
      ' degrees Celsius'+(kind==='inverse-temperature'?' · below zero Kelvin beyond the validity limit':''));
    return outsideChanged;
  }
  // One readout for both the saved model and the lightweight slider draft.
  function showInverseReadout(prefix,result,draft){
    var field=newUiEl(prefix+'Gradient'),status=newUiEl(prefix+'Status');
    if(field){field.value=result.surfaceGradientKPerKm.toFixed(4);
      field.min=Math.min(result.initialGradientKPerKm,result.targetGradientKPerKm).toFixed(4);
      field.max=Math.max(result.initialGradientKPerKm,result.targetGradientKPerKm).toFixed(4);}
    function show(h){var temp=result.temperatureCAt(h),grad=result.gradientKPerKmAt(h);
      return h+' m: '+(Number.isFinite(temp)?temp.toFixed(1)+' °C; '+grad.toFixed(1)+' K/km':'invalid');}
    if(status)status.textContent=(draft?'Preview — release slider to trace rays\n':'')+
      'Surface: '+result.surfaceGradientKPerKm.toFixed(2)+' K/km\n'+
      show(500)+'\n'+show(1000)+'\n'+show(2000)+'\n'+
      (Number.isFinite(result.validUntilMetres)?'T = 0 K at '+(result.validUntilMetres/1000).toFixed(2)+' km':
        'No finite zero-K altitude in the checked range')+'.';
  }
  function syncTemperatureControls(){
    var compare=state.compareConfig&&state.compareConfig[state.compareSelected];
    [['Scene',state.temperatureProfile,state.atmosphere,state.transitionProfile,state.inverseProfile,state.occlusionRadius],
      ['Compare',compare&&compare.temperatureProfile,compare&&compare.atmosphere,compare&&compare.transitionProfile,
        compare&&compare.inverseProfile,compare&&compare.occlusionRadius]].forEach(function(row){
      var prefix='ModernTemperature'+row[0],p=row[1],kind=row[2],t=row[3],inverse=row[4],radius=row[5];
      if(!p)return;
      var fields={C:'temperatureC',Gradient:'gradientKPerKm',Pressure:'pressureHpa'};
      Object.keys(fields).forEach(function(suffix){var node=newUiEl(prefix+suffix);
        if(node)node.value=String(p[fields[suffix]]);});
      var wrap=newUiEl(prefix+'Fields');if(wrap)wrap.hidden=!(kind==='temperature-lapse'||
        (kind==='profile-transition'&&t.source==='temperature-lapse')||kind==='inverse-temperature');
      var tw=newUiEl('ModernTransition'+row[0]+'Fields');if(tw)tw.hidden=kind!=='profile-transition';
      var source=newUiEl('ModernTransition'+row[0]+'Source');if(source)source.value=t.source;
      var weight=newUiEl('ModernTransition'+row[0]+'Weight');if(weight)weight.value=String(100*t.weight);
      var weightValue=newUiEl('ModernTransition'+row[0]+'WeightValue');if(weightValue)weightValue.textContent=Math.round(100*t.weight)+'%';
      var iw=newUiEl('ModernInverse'+row[0]+'Fields');if(iw)iw.hidden=kind!=='inverse-temperature';
      var is=newUiEl('ModernInverse'+row[0]+'Source');if(is)is.value=inverse.source;
      var slider=newUiEl('ModernInverse'+row[0]+'Weight');if(slider)slider.value=String(100*inverse.weight);
      var value=newUiEl('ModernInverse'+row[0]+'WeightValue');if(value)value.textContent=(100*inverse.weight).toFixed(2)+'%';
      if(kind==='inverse-temperature'&&root.CurvatureRayTracer){
        var result=root.CurvatureRayTracer.atmosphere(kind,{temperatureProfile:p,inverseProfile:inverse,occlusionRadius:radius});
        showInverseReadout('ModernInverse'+row[0],result,false);
        var gradNode=newUiEl('ModernTemperature'+row[0]+'Gradient');
        if(gradNode&&gradNode.parentElement)gradNode.parentElement.hidden=inverse.source==='standard';
      }else{
        var oldGradient=newUiEl('ModernTemperature'+row[0]+'Gradient');
        if(oldGradient&&oldGradient.parentElement)oldGradient.parentElement.hidden=false;
      }
    });
    var show=newUiEl('ModernShowTemperatureProfile');if(show)show.checked=state.showTemperatureProfile;
    var select=newUiEl('ModernTemperaturePlacement');if(select)select.value=state.temperaturePlacement;
    var wrap=newUiEl('ModernTemperaturePlacementWrap');if(wrap)wrap.hidden=!state.showTemperatureProfile;
    var resize=!!syncTemperatureColumn('Scene',state.atmosphere,state.temperatureProfile,false,state.transitionProfile,state.inverseProfile,state.occlusionRadius);
    if(state.compareConfig){
      // Keep A/B Canvas dimensions identical even if only one atmosphere has
      // a temperature legend. The other viewport reserves a blank strip.
      var reserve=state.showTemperatureProfile&&state.temperaturePlacement.indexOf('outside-')===0&&
        ['A','B'].some(function(side){var p=state.compareConfig[side];
          return p.atmosphere==='temperature-lapse'||(p.atmosphere==='profile-transition'&&
            p.transitionProfile.source==='temperature-lapse')||p.atmosphere==='inverse-temperature';});
      resize=!!syncTemperatureColumn('A',state.compareConfig.A.atmosphere,state.compareConfig.A.temperatureProfile,reserve,state.compareConfig.A.transitionProfile,state.compareConfig.A.inverseProfile,state.compareConfig.A.occlusionRadius)||resize;
      resize=!!syncTemperatureColumn('B',state.compareConfig.B.atmosphere,state.compareConfig.B.temperatureProfile,reserve,state.compareConfig.B.transitionProfile,state.compareConfig.B.inverseProfile,state.compareConfig.B.occlusionRadius)||resize;
    }
    return resize;
  }
  function bindTemperatureControls(){
    [['Scene',false],['Compare',true]].forEach(function(row){
      var prefix='ModernTransition'+row[0],inCompare=row[1];
      function setTransition(field,value){
        var prev=inCompare?state.compareConfig[state.compareSelected].transitionProfile:state.transitionProfile;
        try{
          var next=Object.assign({},prev);next[field]=value;
          next=compareState.transitionProfile(next);
          if(inCompare)state.compareConfig=compareState.update(state.compareConfig,state.compareSelected,'transitionProfile',next);
          else{state.transitionProfile=next;markCustom();}
          var resized=syncTemperatureControls();
          redraw(null,inCompare&&!resized?state.compareSelected:null);
        }catch(error){updateStatus('Invalid transition profile: '+error.message,true);syncTemperatureControls();}
      }
      var source=newUiEl(prefix+'Source');if(source)source.addEventListener('change',function(){setTransition('source',source.value);});
      var weight=newUiEl(prefix+'Weight');
      if(weight){
        weight.addEventListener('input',function(){var out=newUiEl(prefix+'WeightValue');if(out)out.textContent=Number(weight.value).toFixed(2)+'%';});
        weight.addEventListener('change',function(){setTransition('weight',Number(weight.value)/100);});
      }
    });
    [['Scene',false],['Compare',true]].forEach(function(row){
      var suffix=row[0],inCompare=row[1],prefix='ModernInverse'+suffix;
      var commitTimer=null,pendingWeight=null,pendingSide=null;
      function setInverse(field,value,targetSide){
        try{
          var side=inCompare?(targetSide||state.compareSelected):null;
          var old=inCompare?state.compareConfig[side].inverseProfile:state.inverseProfile;
          var next=compareState.inverseProfile(Object.assign({},old,{[field]:value}));
          if(next.source===old.source&&next.weight===old.weight){syncTemperatureControls();return;}
          if(inCompare)state.compareConfig=compareState.update(state.compareConfig,side,'inverseProfile',next);
          else{state.inverseProfile=next;markCustom();}
          syncTemperatureControls();redraw(null,side);
        }catch(error){updateStatus('Invalid inverse profile: '+error.message,true);syncTemperatureControls();}
      }
      var source=newUiEl(prefix+'Source');if(source)source.addEventListener('change',function(){setInverse('source',source.value);});
      var weight=newUiEl(prefix+'Weight');
      if(weight){
        // Draft input is thermodynamic math and a CSS legend only. The costly
        // physical trace is committed once after release (or a keyboard pause).
        function previewWeight(){
          pendingWeight=Number(weight.value)/100;
          pendingSide=inCompare?state.compareSelected:null;
          var out=newUiEl(prefix+'WeightValue');
          if(out)out.textContent=Number(weight.value).toFixed(2)+'%';
          var config=inCompare?state.compareConfig[state.compareSelected]:state;
          if(!config||config.atmosphere!=='inverse-temperature')return;
          var draft=Object.assign({},config.inverseProfile,{weight:Number(weight.value)/100});
          try{
            var p=root.CurvatureRayTracer.atmosphere('inverse-temperature',{
              temperatureProfile:config.temperatureProfile,inverseProfile:draft,
              occlusionRadius:config.occlusionRadius});
            showInverseReadout(prefix,p,true);
            // This updates ONLY the 0–2 km CSS legend, never the physical graph.
            syncTemperatureColumn(inCompare?state.compareSelected:'Scene','inverse-temperature',
              config.temperatureProfile,false,config.transitionProfile,draft,config.occlusionRadius);
          }catch(error){updateStatus('Inverse preview: '+error.message,true);}
        }
        function commitWeight(){
          if(commitTimer!==null){clearTimeout(commitTimer);commitTimer=null;}
          var value=pendingWeight===null?Number(weight.value)/100:pendingWeight;
          var side=pendingSide;pendingWeight=null;pendingSide=null;
          setInverse('weight',value,side);
        }
        weight.addEventListener('input',previewWeight);
        // A range can emit change for every keyboard arrow in some browsers.
        // Coalesce those commits; mouse/touch release flushes immediately.
        weight.addEventListener('change',function(){
          if(pendingWeight===null){pendingWeight=Number(weight.value)/100;pendingSide=inCompare?state.compareSelected:null;}
          if(commitTimer!==null)clearTimeout(commitTimer);
          commitTimer=setTimeout(function(){commitTimer=null;commitWeight();},180);
        });
        weight.addEventListener('pointerup',commitWeight);
        weight.addEventListener('pointercancel',commitWeight);
        weight.addEventListener('keyup',function(event){
          if(['ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(event.key)){
            if(commitTimer!==null)clearTimeout(commitTimer);
            commitTimer=setTimeout(function(){commitTimer=null;commitWeight();},180);
          }
        });
      }
      var gradient=newUiEl(prefix+'Gradient');if(gradient)gradient.addEventListener('change',function(){
        var config=inCompare?state.compareConfig[state.compareSelected]:state;
        try{
          if(gradient.value.trim()==='')throw RangeError('Enter a finite gradient');
          var requested=Number(gradient.value),tracer=root.CurvatureRayTracer;
          var p=tracer.atmosphere('inverse-temperature',{temperatureProfile:config.temperatureProfile,
            inverseProfile:config.inverseProfile,occlusionRadius:config.occlusionRadius});
          var a=p.initialGradientKPerKm,b=p.targetGradientKPerKm;
          if(!Number.isFinite(requested)||requested<Math.min(a,b)-1e-8||requested>Math.max(a,b)+1e-8)
            throw RangeError('Surface gradient must be between '+a.toFixed(2)+' and '+b.toFixed(2)+' K/km');
          setInverse('weight',Math.max(0,Math.min(1,(requested-a)/(b-a))));
        }catch(error){updateStatus('Invalid required gradient: '+error.message,true);syncTemperatureControls();}
      });
    });
    [['Scene',false],['Compare',true]].forEach(function(row){
      var prefix='ModernTemperature'+row[0],inCompare=row[1];
      var fields={C:'temperatureC',Gradient:'gradientKPerKm',Pressure:'pressureHpa'};
      Object.keys(fields).forEach(function(suffix){
        var node=newUiEl(prefix+suffix);if(!node)return;
        node.addEventListener('change',function(){
          var old=inCompare?state.compareConfig[state.compareSelected].temperatureProfile:state.temperatureProfile;
          try{
            if(node.value.trim()==='')throw RangeError('A number is required');
            var next=Object.assign({},old);next[fields[suffix]]=Number(node.value);
            next=compareState.temperatureProfile(next);
            if(inCompare)state.compareConfig=compareState.update(state.compareConfig,state.compareSelected,'temperatureProfile',next);
            else{state.temperatureProfile=next;markCustom();}
            syncTemperatureControls();redraw(null,inCompare?state.compareSelected:null);
          }catch(error){updateStatus('Invalid temperature profile: '+error.message,true);syncTemperatureControls();}
        });
      });
    });
    var toggle=newUiEl('ModernShowTemperatureProfile');
    if(toggle)toggle.addEventListener('change',function(){
      state.showTemperatureProfile=toggle.checked;
      if(syncTemperatureControls())redraw();
      else scheduleExperimentSave();
    });
    var select=newUiEl('ModernTemperaturePlacement');
    if(select)select.addEventListener('change',function(){
      state.temperaturePlacement=select.value;
      if(syncTemperatureControls())redraw();
      else scheduleExperimentSave();
    });
  }
  function syncCompareEditor(){
    if(!compareState||!state.compareConfig)return;
    var spec=state.compareConfig[state.compareSelected];
    ['A','B'].forEach(function(side){
      var tab=el('ModernModelTab'+side);if(!tab)return;
      var active=state.compareSelected===side;
      tab.classList.toggle('is-active',active);
      tab.setAttribute('aria-pressed',String(active));
    });
    var pairPreset=el('ModernPairPreset');if(pairPreset){showLegacyOption('ModernPairPreset',state.compareConfig.preset);pairPreset.value=state.compareConfig.preset;}
    showLegacyOption('ModernModelAtmosphere',spec.atmosphere);
    renderAtmosphereDescription('ModernModelAtmosphereInfo',spec.atmosphere);
    updatePhysicsPanelPresentation(true);
    var fields={ModernModelRadius:'radiusKm',ModernModelAtmosphere:'atmosphere'};
    Object.keys(fields).forEach(function(id){var node=el(id);if(node)node.value=String(spec[fields[id]]);});
    var scale=el('ModernModelOcclusion');if(scale)scale.value=String(spec.occlusionRadius/1000);
    var wrap=el('ModernModelOcclusionWrap');if(wrap)
      wrap.hidden=!['inverse-spherical','exponential-occlusion','profile-transition','inverse-temperature'].includes(spec.atmosphere);
    syncShimmerControls();
    syncVisibilityControls();
    syncTemperatureControls();
    var radiusWrap=newUiEl('ModernModelRadiusWrap');
    if(radiusWrap)radiusWrap.hidden=spec.surface==='flat';
    var curvature=root.CurvaturePhysicalCurvature;
    var slider=el('ModernModelCurvature');
    var label=el('ModernModelCurvatureLabel');
    if(curvature){
      var geometry={showModel:spec.surface==='flat'?2:1,rEarth:spec.radiusKm*1000};
      if(slider)slider.value=String(curvature.modelStep(geometry));
      if(label)label.textContent=curvature.label(geometry);
    }
  }
  function scaleRadiusMetres(raw){
    if(typeof raw==='string'&&raw.trim()==='')throw RangeError('A number is required');
    var km=Number(raw);
    if(!Number.isFinite(km)||km<0.001||km>1e13)throw RangeError('Expected radius in [0.001, 1e13] km');
    return km*1000;
  }
  // Radius inputs are edited as a draft. A 420 ms typing pause is not a
  // physical-model commit: typing '10000' must never render at '1' or '10'.
  function radiusDraft(id,pending){
    var hint=newUiEl(id+'Draft');
    if(hint)hint.hidden=!pending;
  }
  function syncVisibilityControls(){
    [['ModernVisibility',state.visibility],
      ['ModernModelVisibility',state.compareConfig&&state.compareConfig.A]].forEach(function(row){
      var config=row[1]&&row[1].visibility||row[1],prefix=row[0];
      if(!config)return;
      var checkbox=newUiEl(prefix+'Enabled'),range=newUiEl(prefix+'Range'),options=newUiEl(prefix+'Options');
      if(checkbox)checkbox.checked=config.enabled;
      if(range)range.value=String(config.rangeKm);
      if(options)options.hidden=!config.enabled;
      var summary=newUiEl('ModernAtmosphere'+(prefix==='ModernVisibility'?'Scene':'Compare')+'VisibilitySummary');
      if(summary)summary.textContent=config.enabled?'On · '+config.rangeKm+' km':'Off';
    });
  }
  function bindVisibilityControls(){
    [['ModernVisibility',false],['ModernModelVisibility',true]].forEach(function(row){
      var prefix=row[0],compare=row[1];
      function change(field,value){
        try{
          var current=compare?state.compareConfig.A.visibility:state.visibility;
          var next=Object.assign({},current);next[field]=value;
          var validated=root.CurvatureAtmosphericVisibility.validate(next);
          if(compare)state.compareConfig=compareState.update(state.compareConfig,state.compareSelected,'visibility',validated);
          else state.visibility=validated;
          syncVisibilityControls();redraw();
        }catch(error){updateStatus('Invalid atmospheric visibility: '+error.message,true);syncVisibilityControls();}
      }
      var enabled=newUiEl(prefix+'Enabled'),range=newUiEl(prefix+'Range');
      if(enabled)enabled.addEventListener('change',function(){change('enabled',enabled.checked);});
      if(range)range.addEventListener('change',function(){change('rangeKm',Number(range.value));});
    });
  }
  function bindCompareEditor(){
    if(!compareState)return; // 132 compatibility (older isolated test harness)
    ['A','B'].forEach(function(side){
      var tab=el('ModernModelTab'+side);if(tab)tab.addEventListener('click',function(){
        // Do not leave a changed slider paired with the previous model's image.
        if(state.curvaturePending)redraw();
        cancelEdits();state.compareSelected=side;workspaceState.compareModel=side;
        syncCompareEditor();saveApplicationPreferences();scheduleExperimentSave();
      });
    });
    var preset=el('ModernPairPreset');if(preset)preset.addEventListener('change',function(){
      if(this.value==='custom')return;
      try{cancelEdits();state.compareConfig=compareState.preset(this.value);syncCompareEditor();redraw();}
      catch(error){updateStatus(error.message,true);syncCompareEditor();}
    });
    [['ModernModelAtmosphere','atmosphere']].forEach(function(row){
      var node=el(row[0]);if(!node)return;
      node.addEventListener('change',function(){
        try{state.compareConfig=compareState.update(state.compareConfig,state.compareSelected,row[1],node.value);
          syncCompareEditor();redraw();}
        catch(error){updateStatus(error.message,true);syncCompareEditor();}
      });
    });
    var curvature=root.CurvaturePhysicalCurvature;
    var slider=el('ModernModelCurvature');
    function commitCompareCurvature(){
      // Browser range controls may emit change on release, keyboard input, or
      // neither (some touch/embedded implementations). Commit exactly once.
      if(state.curvatureCommitTimer!==null){
        clearTimeout(state.curvatureCommitTimer);state.curvatureCommitTimer=null;
      }
      if(!state.curvaturePending)return;
      redraw();
    }
    function applyCompareCurvature(step){
      var selected=state.compareSelected;
      var spec=state.compareConfig[selected];
      var geometry={showModel:spec.surface==='flat'?2:1,rEarth:spec.radiusKm*1000};
      var result=curvature.applyStep(geometry,step);
      var nextSurface=result.showModel===2?'flat':'globe';
      var nextRadius=result.showModel===1?result.radius/1000:spec.radiusKm;
      if(spec.surface===nextSurface&&spec.radiusKm===nextRadius)return false;
      var config=compareState.update(state.compareConfig,selected,'surface',nextSurface);
      if(result.showModel===1)config=compareState.update(config,selected,'radiusKm',nextRadius);
      state.compareConfig=config;
      syncCompareEditor();
      state.curvaturePending=true;
      var status=el('ModernCompareStatus'+selected);
      if(status){status.textContent='Pending curvature change · release slider to render';
        status.classList.toggle('is-error',false);}
      return true;
    }
    if(slider&&curvature){
      slider.addEventListener('input',function(){
        if(!applyCompareCurvature(Number(slider.value)))return;
        // Fallback for browsers where a drag produces input but no final
        // change/pointerup. Never run a full trace for every intermediate step.
        if(state.curvatureCommitTimer!==null)clearTimeout(state.curvatureCommitTimer);
        state.curvatureCommitTimer=setTimeout(function(){
          state.curvatureCommitTimer=null;commitCompareCurvature();
        },700);
      });
      function finishSlider(){
        // Also works with keyboard-only changes that do not emit input.
        applyCompareCurvature(Number(slider.value));
        commitCompareCurvature();
      }
      slider.addEventListener('change',finishSlider);
      slider.addEventListener('pointerup',finishSlider);
      slider.addEventListener('pointercancel',finishSlider);
      slider.addEventListener('keyup',function(event){
        if(event.key==='ArrowLeft'||event.key==='ArrowRight'||
            event.key==='Home'||event.key==='End'||event.key==='PageUp'||
            event.key==='PageDown')finishSlider();
      });
    }
    var flatButton=el('ModernModelFlat');if(flatButton)flatButton.addEventListener('click',function(){
      applyCompareCurvature(1000);commitCompareCurvature();
    });
    var earthButton=el('ModernModelEarth');if(earthButton)earthButton.addEventListener('click',function(){
      var selected=state.compareSelected;
      var config=compareState.update(state.compareConfig,selected,'surface','globe');
      state.compareConfig=compareState.update(config,selected,'radiusKm',6371);
      syncCompareEditor();redraw();
    });
    [['ModernModelRadius','radiusKm'],['ModernModelOcclusion','occlusionRadius']].forEach(function(row){
      var node=el(row[0]);if(!node)return;
      function commit(){
        radiusDraft(row[0],false);
        try{
          var raw=row[1]==='occlusionRadius'?scaleRadiusMetres(node.value):node.value;
          var current=state.compareConfig[state.compareSelected][row[1]];
          // Enter followed by a native change event must not retrace twice.
          if(Number(raw)===current){syncCompareEditor();return;}
          state.compareConfig=compareState.update(state.compareConfig,state.compareSelected,row[1],raw);
          syncCompareEditor();redraw();
        }catch(error){updateStatus('Invalid '+row[1]+': '+error.message,true);syncCompareEditor();}
      }
      node.addEventListener('input',function(){radiusDraft(row[0],true);});
      node.addEventListener('change',commit); // blur, spinner commit or native Enter
      node.addEventListener('keydown',function(event){
        if(event.key==='Enter'){
          if(event.preventDefault)event.preventDefault();
          commit();
          if(typeof node.blur==='function')node.blur();
        }
      });
    });
    var eye=el('ModernCompareEyeLevel');if(eye){eye.checked=state.compareEyeLevel;eye.addEventListener('change',function(){
      state.compareEyeLevel=eye.checked;redraw();
    });}
    var horizon=el('ModernCompareHorizon');if(horizon){horizon.checked=state.compareHorizon;
      horizon.addEventListener('change',function(){state.compareHorizon=horizon.checked;redraw();});}
    var button=el('ModernRecalculateCompare');if(button)button.addEventListener('click',redraw);
  }
  function resizeGraph(g){
    if(g&&typeof g.UpdateCanvasSize==='function'){g.UpdateCanvasSize();}
  }
  var graph=root.NewGraphX3D({Id:'ModernSceneGraph',Width:'100%',Height:'66.67%',
    DrawFunc:draw,AutoReset:true,AutoClear:true,AutoScalePix:true});
  function cancelPending(){
    if(state.curvatureCommitTimer!==null){
      clearTimeout(state.curvatureCommitTimer);state.curvatureCommitTimer=null;
    }
    state.curvaturePending=false;
    if(state.timer!==null){clearTimeout(state.timer);state.timer=null;}
    if(state.frame!==null){cancelAnimationFrame(state.frame);state.frame=null;}
    pendingCompareScope=null;
  }
  // A stable, scene-derived navigation scale keeps world movement usable at
  // both near-field and kilometre-scale experiment distances. Mouse sensitivity
  // is calibrated once at the start of a drag, never changed mid-gesture.
  function cameraReferenceDistance(){
    var sum=0,weight=0;
    for(var i=0;i<2;i++){
      var count=model.NObjects[i];
      if(!(count>0))continue;
      var midpoint=model.ObjDist[i]+(count-1)*model.ObjDeltaDist[i]/2;
      if(!Number.isFinite(midpoint))continue;
      sum+=Math.max(1,midpoint)*count;weight+=count;
    }
    return Math.max(10,Math.min(1e6,weight?sum/weight:1000));
  }
  function checkedCameraPosition(position){
    var module=root.CurvatureCameraTranslation;
    if(module&&typeof module.frame==='function')module.frame(position.CameraEast,position.CameraNorth,
      position.Height===undefined?model.Height:position.Height,
      model.showModel===2?0:1/model.rEarth);
    else if(position.CameraEast!==0||position.CameraNorth!==0)
      throw Error('Camera translation geometry is unavailable');
    return position;
  }
  function cameraPositionText(){
    return 'East '+model.CameraEast.toFixed(2)+' m · North '+model.CameraNorth.toFixed(2)+' m';
  }
  function cameraMovePreview(sample){
    return sample&&sample.mode==='translate'?{mode:'translate',dx:-sample.dx,dy:-sample.dy}:sample;
  }
  var CAMERA_POSE_FIELDS=['Height','FocalLengthField','Pan','Nick','Roll',
    'CameraEast','CameraNorth','viewcenterHorizon','deviceRatio'];
  function captureCameraPose(){
    var pose={};CAMERA_POSE_FIELDS.forEach(function(field){pose[field]=model[field];});
    return pose;
  }
  function applyCameraPose(pose){
    if(!pose)return;
    stopCameraTransition(false,'Transition interrupted by camera restore',false);
    checkedCameraPosition(pose);
    stopCameraKeyboard(true);abortCameraDrag();cancelEdits();cancelPending();
    CAMERA_POSE_FIELDS.forEach(function(key){model[key]=pose[key];});
    model.Update();markCustom();syncNumericInputs();redraw();
  }
  // Playback is sampled from absolute elapsed time, not from the number of
  // optical frames. Fast frames may be skipped on a slow Scene/Compare render.
  function transitionPose(pose){
    CAMERA_POSE_FIELDS.forEach(function(key){model[key]=pose[key];});
  }
  function transitionInputPreview(){
    refreshNavigationCameraInputs();
    var ids={ModernFocal:'FocalLengthField',ModernRoll:'Roll'};
    Object.keys(ids).forEach(function(id){var node=newUiEl(id);if(node)node.value=String(model[ids[id]]);});
    var aim=newUiEl('ModernCameraAim');if(aim)aim.value=String(model.viewcenterHorizon);
    var fov=newUiEl('ModernViewAngle');
    if(fov&&root.CurvatureModernCameraInteraction&&root.CurvatureModernCameraInteraction.focalViewAngle)
      fov.value=String(Number(root.CurvatureModernCameraInteraction.focalViewAngle(model.FocalLengthField).toFixed(4)));
  }
  // Stop keeps the latest sampled pose. Cancel restores the pre-Play camera,
  // not necessarily the selected From position. A manual gesture can interrupt
  // silently and let its own final redraw happen later.
  function stopCameraTransition(restore,message,renderNow){
    var running=cameraTransition;
    if(!running)return false;
    cameraTransition=null;
    if(running.frame!==null)cancelAnimationFrame(running.frame);
    stopAutoCameraPreview();cancelPending();
    if(restore)transitionPose(running.original);
    markCustom();syncNumericInputs();sequenceControls();
    var stoppedMessage=message||(restore?'Animation cancelled; starting view restored':
      'Animation stopped at current camera position');
    sequenceStatus(stoppedMessage);
    if(renderNow)redraw();
    return true;
  }
  function cameraTransitionTick(now){
    var current=cameraTransition;
    if(!current)return;
    current.frame=null;
    var elapsed=Math.max(0,Number.isFinite(now)?now-current.startedAt:profileNow()-current.startedAt);
    try{
      transitionPose(cameraSequenceApi.cameraAt(current.sequence,elapsed));
      if(elapsed>=current.durationMs){
        // Drop stale Fast redraws before the authoritative final sample.
        stopCameraTransition(false,'Completed camera animation',true);
        return;
      }
      transitionInputPreview();
      sequenceStatus('Playing animation · '+Math.round(100*elapsed/current.durationMs)+'% · '+
        (elapsed/1000).toFixed(1)+' / '+(current.durationMs/1000).toFixed(1)+' s');
      requestAutoCameraPreview();
      current.frame=requestAnimationFrame(cameraTransitionTick);
    }catch(error){
      stopCameraTransition(false,'Animation failed: '+error.message,true);
      sequenceStatus('Animation failed: '+error.message,true);
    }
  }
  // Sequences own their keyframe snapshots. Camera Positions are only a convenient
  // source when adding/replacing a pose; no saved-position IDs are serialized.
  var cameraSequenceApi=root.CurvatureModernCameraSequence;
  function sequenceStatus(text,problem){
    var node=newUiEl('ModernSequenceStatus');
    if(node){node.textContent=text||'';node.classList.toggle('is-error',!!problem);}
  }
  function selectedSequenceIndex(){
    var list=newUiEl('ModernSequenceKeyframes');
    return list&&/^\d+$/.test(String(list.value))&&Number(list.value)<cameraSequence.length?
      Number(list.value):-1;
  }
  function sequenceControls(){
    var selected=selectedSequenceIndex(),playing=!!cameraTransition;
    var position=newUiEl('ModernSequencePosition');
    var hasPosition=!!position&&cameraPositions.some(function(p){return p.id===position.value;});
    var buttons={ModernSequenceAdd:!playing&&cameraSequence.length<20&&!!cameraSequenceApi,
      ModernSequenceAddSaved:!playing&&hasPosition&&cameraSequence.length<20&&!!cameraSequenceApi,
      ModernSequenceGo:!playing&&selected>=0,
      ModernSequenceReplace:!playing&&selected>=0,
      ModernSequenceUp:!playing&&selected>0,
      ModernSequenceDown:!playing&&selected>=0&&selected<cameraSequence.length-1,
      ModernSequenceRemove:!playing&&selected>=0,
      ModernSequenceClear:!playing&&cameraSequence.length>0,
      ModernSequencePlay:!playing&&cameraSequence.length>=2&&!!cameraSequenceApi&&!state.demosActive,
      ModernSequenceStop:playing,
      ModernSequenceCancel:playing};
    Object.keys(buttons).forEach(function(id){var button=newUiEl(id);if(button)button.disabled=!buttons[id];});
    ['ModernSequenceKeyframes','ModernSequencePosition','ModernSequenceName',
      'ModernSequenceTravel','ModernSequenceHold','ModernSequenceEasing'].forEach(function(id){
      var node=newUiEl(id);if(node)node.disabled=playing||selected<0&&id!=='ModernSequenceKeyframes'&&id!=='ModernSequencePosition';
    });
    var travel=newUiEl('ModernSequenceTravel');if(travel)travel.disabled=playing||selected<=0;
  }
  function renderCameraSequencePositions(){
    var list=newUiEl('ModernSequencePosition');
    if(!list||typeof list.appendChild!=='function')return;
    var previous=list.value;list.innerHTML='';
    cameraPositions.forEach(function(entry){
      var option=document.createElement('option');option.value=entry.id;
      option.textContent=entry.name;list.appendChild(option);
    });
    list.value=cameraPositions.some(function(p){return p.id===previous;})?previous:
      (cameraPositions[0]&&cameraPositions[0].id||'');
    sequenceControls();
  }
  function sequenceEditFields(index){
    var entry=cameraSequence[index];
    if(!entry)return;
    var fields={ModernSequenceName:entry.name,ModernSequenceTravel:entry.travelMs/1000,
      ModernSequenceHold:entry.holdMs/1000,ModernSequenceEasing:entry.easing};
    Object.keys(fields).forEach(function(id){var node=newUiEl(id);if(node)node.value=String(fields[id]);});
  }
  function renderCameraSequenceKeyframes(preferred){
    var list=newUiEl('ModernSequenceKeyframes');
    if(!list||typeof list.appendChild!=='function'||!cameraSequenceApi)return;
    var index=preferred===undefined?selectedSequenceIndex():preferred;
    list.innerHTML='';
    var moments=cameraSequenceApi.timeline(cameraSequence);
    cameraSequence.forEach(function(frame,i){
      var option=document.createElement('option');option.value=String(i);
      option.textContent=(i+1)+'. '+frame.name+(i===0?' · Start':' · → '+(frame.travelMs/1000).toFixed(1)+' s')+
        (frame.holdMs?' · Pause '+(frame.holdMs/1000).toFixed(1)+' s':'')+
        ' · at '+(moments[i].arrivalMs/1000).toFixed(1)+' s';
      list.appendChild(option);
    });
    index=index>=0&&index<cameraSequence.length?index:(cameraSequence.length?0:-1);
    list.value=index<0?'':String(index);
    if(index>=0)sequenceEditFields(index);
    var empty=newUiEl('ModernSequenceEmpty');if(empty)empty.hidden=cameraSequence.length>0;
    var summary=newUiEl('ModernCameraAnimationSummary');
    if(summary)summary.textContent=cameraSequence.length+' frames'+
      (cameraSequenceApi?' · '+(cameraSequenceApi.totalMs(cameraSequence)/1000).toFixed(1)+' s':'');
    if(!cameraTransition){
      var total=cameraSequenceApi.totalMs(cameraSequence);
      sequenceStatus(cameraSequence.length+' frame(s) · '+(total/1000).toFixed(1)+' s total'+
        (cameraSequence.length<2?' · add another view to play':''));
    }
    sequenceControls();
  }
  function sequenceInputMilliseconds(id,min,max){
    var node=newUiEl(id),raw=node?String(node.value).trim():'';
    var number=Number(raw);
    if(!raw||!Number.isFinite(number)||number<min||number>max)
      throw RangeError((id==='ModernSequenceHold'?'Pause':'Travel')+' must be between '+min+' and '+max+' seconds');
    return Math.round(number*1000);
  }
  function nextSequenceName(){
    var next=1;
    while(cameraSequence.some(function(frame){return frame.name==='Frame '+next;}))next++;
    return 'Frame '+next;
  }
  function newSequenceFrame(camera,name){
    var first=cameraSequence.length===0;
    return {name:name||nextSequenceName(),camera:Object.assign({},camera),
      travelMs:first?0:5000,holdMs:0,easing:'smoothstep'};
  }
  function editedSequenceFrame(frame,index){
    var nameField=newUiEl('ModernSequenceName');
    var name=String(nameField&&nameField.value||'').trim()||('Frame '+(index+1));
    if(name.length>80)throw RangeError('Frame name must be at most 80 characters');
    var ease=newUiEl('ModernSequenceEasing'),easing=ease&&ease.value||'smoothstep';
    if(!['linear','smoothstep'].includes(easing))throw RangeError('Invalid frame timing');
    return {name:name,camera:Object.assign({},frame.camera),
      travelMs:index===0?0:sequenceInputMilliseconds('ModernSequenceTravel',.2,120),
      holdMs:sequenceInputMilliseconds('ModernSequenceHold',0,120),easing:easing};
  }
  function commitCameraSequence(frames,index,message){
    if(!cameraSequenceApi)throw Error('Camera sequence module is unavailable');
    // Atomic validation: rejected edits must not mutate camera or persistence.
    var verified=cameraSequenceApi.validate(frames);
    cameraSequence=verified;renderCameraSequenceKeyframes(index);
    scheduleExperimentSave();sequenceStatus(message+' · '+(cameraSequenceApi.totalMs(verified)/1000).toFixed(1)+' s total');
  }
  function reindexSequence(frames){
    return frames.map(function(frame,i){
      return Object.assign({},frame,{travelMs:i===0?0:(frame.travelMs||5000)});
    });
  }
  function startCameraSequence(){
    if(!cameraSequenceApi)throw Error('Camera sequence module is unavailable');
    if(cameraTransition)throw RangeError('An animation is already playing');
    if(state.demosActive||state.mode==='demos')throw RangeError('Switch to Scene or Compare first');
    if(!autoPreviewSupported())throw RangeError('Fast Preview is unavailable for this atmosphere / surface combination');
    var frames=cameraSequenceApi.validate(cameraSequence);
    if(frames.length<2)throw RangeError('Add at least two keyframes');
    var duration=cameraSequenceApi.totalMs(frames);
    // Validate all segment midpoints and all arrivals before mutating any state.
    var timeline=cameraSequenceApi.timeline(frames);
    frames.forEach(function(frame,i){
      checkedCameraPosition(frame.camera);
      if(i>0){
        var half=timeline[i-1].departureMs+frame.travelMs/2;
        checkedCameraPosition(cameraSequenceApi.cameraAt(frames,half));
      }
    });
    stopCameraKeyboard(true);abortCameraDrag();cancelEdits();cancelPending();stopAutoCameraPreview();
    cameraTransition={original:captureCameraPose(),sequence:frames,
      startedAt:profileNow(),durationMs:duration,frame:null};
    transitionPose(frames[0].camera);transitionInputPreview();markCustom();sequenceControls();
    sequenceStatus('Playing camera sequence · 0%');
    requestAutoCameraPreview();
    cameraTransition.frame=requestAnimationFrame(cameraTransitionTick);
  }
  function bindCameraSequence(){
    var picker=newUiEl('ModernSequenceKeyframes');
    if(!picker||!cameraSequenceApi)return;
    function safely(action){return function(){
      try{action();}catch(error){sequenceStatus(error.message,true);}
    };}
    function ensureEditable(){if(cameraTransition)throw RangeError('Stop animation before editing');}
    picker.addEventListener('change',function(){
      sequenceEditFields(selectedSequenceIndex());sequenceControls();
    });
    var positionPicker=newUiEl('ModernSequencePosition');
    if(positionPicker)positionPicker.addEventListener('change',sequenceControls);
    // The primary workflow needs no name, saved position, or preconfigured duration.
    newUiEl('ModernSequenceAdd').addEventListener('click',safely(function(){
      ensureEditable();
      if(cameraSequence.length>=20)throw RangeError('Maximum 20 frames');
      var frame=newSequenceFrame(checkedCameraPosition(captureCameraPose()));
      commitCameraSequence(cameraSequence.concat([frame]),cameraSequence.length,'Added '+frame.name);
    }));
    newUiEl('ModernSequenceAddSaved').addEventListener('click',safely(function(){
      ensureEditable();
      if(cameraSequence.length>=20)throw RangeError('Maximum 20 frames');
      var position=cameraPositions.find(function(p){return p.id===positionPicker.value;});
      if(!position)throw RangeError('Choose a saved view');
      var frame=newSequenceFrame(position.camera,position.name);
      commitCameraSequence(cameraSequence.concat([frame]),cameraSequence.length,'Added saved view: '+frame.name);
    }));
    // The three time/name controls save their edits on change. Invalid values
    // leave the owned frame untouched and report an error.
    function editSelected(){
      ensureEditable();
      var index=selectedSequenceIndex();if(index<0)throw RangeError('Choose a frame');
      var updated=cameraSequence.slice();
      updated[index]=editedSequenceFrame(updated[index],index);
      commitCameraSequence(updated,index,'Frame updated: '+updated[index].name);
    }
    ['ModernSequenceName','ModernSequenceTravel','ModernSequenceHold','ModernSequenceEasing'].forEach(function(id){
      newUiEl(id).addEventListener('change',safely(editSelected));
    });
    newUiEl('ModernSequenceGo').addEventListener('click',safely(function(){
      ensureEditable();
      var index=selectedSequenceIndex();if(index<0)throw RangeError('Choose a frame');
      applyCameraPose(cameraSequence[index].camera);
      sequenceStatus('Showing '+cameraSequence[index].name+' · move the camera to create another view');
    }));
    newUiEl('ModernSequenceReplace').addEventListener('click',safely(function(){
      ensureEditable();
      var index=selectedSequenceIndex();if(index<0)throw RangeError('Choose a frame');
      var updated=cameraSequence.slice();
      updated[index]=Object.assign({},updated[index],{camera:checkedCameraPosition(captureCameraPose())});
      commitCameraSequence(updated,index,'Updated view for '+updated[index].name);
    }));
    [['ModernSequenceUp',-1],['ModernSequenceDown',1]].forEach(function(pair){
      newUiEl(pair[0]).addEventListener('click',safely(function(){
        ensureEditable();
        var index=selectedSequenceIndex(),other=index+pair[1];
        if(index<0||other<0||other>=cameraSequence.length)throw RangeError('Cannot move frame');
        var frames=cameraSequence.slice(),item=frames[index];frames[index]=frames[other];frames[other]=item;
        commitCameraSequence(reindexSequence(frames),other,'Frame reordered');
      }));
    });
    newUiEl('ModernSequenceRemove').addEventListener('click',safely(function(){
      ensureEditable();
      var index=selectedSequenceIndex();if(index<0)throw RangeError('Choose a frame');
      var frames=cameraSequence.filter(function(_,i){return i!==index;});
      commitCameraSequence(reindexSequence(frames),Math.min(index,frames.length-1),'Frame removed');
    }));
    newUiEl('ModernSequenceClear').addEventListener('click',safely(function(){
      ensureEditable();commitCameraSequence([],-1,'Animation cleared');
    }));
    newUiEl('ModernSequencePlay').addEventListener('click',safely(startCameraSequence));
    newUiEl('ModernSequenceStop').addEventListener('click',function(){
      stopCameraTransition(false,null,true);
    });
    newUiEl('ModernSequenceCancel').addEventListener('click',function(){
      stopCameraTransition(true,null,true);
    });
    if(root.addEventListener)root.addEventListener('blur',function(){
      stopCameraTransition(false,'Animation stopped when the window lost focus',true);
    });
    if(document.addEventListener)document.addEventListener('visibilitychange',function(){
      if(document.hidden)stopCameraTransition(false,'Animation stopped while the page is hidden',true);
    });
    renderCameraSequencePositions();renderCameraSequenceKeyframes(-1);
  }
  function cameraPositionStatus(message,problem){
    var element=newUiEl('ModernCameraPositionsStatus');
    if(element){element.textContent=message||'';element.classList.toggle('is-error',!!problem);}
  }
  function renderCameraPositions(preferred){
    var list=newUiEl('ModernCameraPositions');
    if(!list||typeof list.appendChild!=='function')return;
    var selected=preferred===undefined?list.value:preferred;
    list.innerHTML='';
    var placeholder=document.createElement('option');
    placeholder.value='';placeholder.textContent=cameraPositions.length?'Select a saved position':'No saved positions';
    list.appendChild(placeholder);
    cameraPositions.forEach(function(entry){
      var option=document.createElement('option');option.value=entry.id;
      option.textContent=entry.name;list.appendChild(option);
    });
    list.value=cameraPositions.some(function(entry){return entry.id===selected;})?selected:'';
    var disabled=!list.value;
    ['ModernCameraGo','ModernCameraUpdate','ModernCameraRename','ModernCameraDelete'].forEach(function(id){
      var button=newUiEl(id);if(button)button.disabled=disabled;
    });
    if(list.value){
      var chosen=cameraPositions.find(function(entry){return entry.id===list.value;});
      var name=newUiEl('ModernCameraPositionName');if(name&&chosen)name.value=chosen.name;
    }
    renderCameraSequencePositions();
  }
  function selectedCameraPosition(){
    var list=newUiEl('ModernCameraPositions');
    return list&&cameraPositions.find(function(entry){return entry.id===list.value;});
  }
  function nextCameraId(){
    var max=cameraPositions.reduce(function(prev,entry){
      var match=/^camera-(\d+)$/.exec(entry.id);
      return match?Math.max(prev,Number(match[1])):prev;
    },0);
    // IDs remain unique even if an old list contained externally authored IDs.
    var id;do{id='camera-'+(++max);}while(cameraPositions.some(function(entry){return entry.id===id;}));
    return id;
  }
  function commitCameraPositions(list,selected,message){
    stopCameraTransition(false,'Transition interrupted by position edit',false);
    cameraPositions=list;renderCameraPositions(selected);
    scheduleExperimentSave();cameraPositionStatus(message);
  }
  function bindCameraPositions(){
    var list=newUiEl('ModernCameraPositions'),name=newUiEl('ModernCameraPositionName');
    if(!list||!name||!experiments)return;
    function execute(fn){
      try{fn();}catch(error){cameraPositionStatus(error.message,true);}
    }
    function validated(list){
      var snapshot=experimentSnapshot();
      snapshot.cameraPositions=list;
      return experiments.validate(snapshot).cameraPositions||[];
    }
    function label(){return String(name.value||'').trim()||('View '+(cameraPositions.length+1));}
    list.addEventListener('change',function(){renderCameraPositions(list.value);});
    el('ModernCameraSave').addEventListener('click',function(){execute(function(){
      if(cameraPositions.length>=20)throw RangeError('Maximum 20 camera positions');
      var entry={id:nextCameraId(),name:label(),camera:captureCameraPose()};
      commitCameraPositions(validated(cameraPositions.concat([entry])),entry.id,'Saved: '+entry.name);
      name.value='';
    });});
    el('ModernCameraGo').addEventListener('click',function(){execute(function(){
      var entry=selectedCameraPosition();if(!entry)throw RangeError('Select a saved camera position');
      applyCameraPose(entry.camera);cameraPositionStatus('Restored: '+entry.name);
    });});
    el('ModernCameraUpdate').addEventListener('click',function(){execute(function(){
      var entry=selectedCameraPosition();if(!entry)throw RangeError('Select a saved camera position');
      var updated=cameraPositions.map(function(p){return p.id===entry.id?{
        id:p.id,name:p.name,camera:captureCameraPose()}:p;});
      commitCameraPositions(validated(updated),entry.id,'Updated: '+entry.name);
    });});
    el('ModernCameraRename').addEventListener('click',function(){execute(function(){
      var entry=selectedCameraPosition();if(!entry)throw RangeError('Select a saved camera position');
      var newName=label();
      var updated=cameraPositions.map(function(p){return p.id===entry.id?{
        id:p.id,name:newName,camera:p.camera}:p;});
      commitCameraPositions(validated(updated),entry.id,'Renamed: '+newName);
    });});
    el('ModernCameraDelete').addEventListener('click',function(){execute(function(){
      var entry=selectedCameraPosition();if(!entry)throw RangeError('Select a saved camera position');
      commitCameraPositions(validated(cameraPositions.filter(function(p){return p.id!==entry.id;})),
        '', 'Deleted: '+entry.name);
    });});
    el('ModernCameraReset').addEventListener('click',function(){execute(function(){
      if(initialCamera)applyCameraPose(initialCamera);
      cameraPositionStatus('Camera restored to the loaded experiment starting pose');
    });});
    renderCameraPositions('');
  }
  function updateNavigationPanelSummary(){
    var summary=newUiEl('ModernCameraNavigationSummary');
    if(summary)summary.textContent=navigationPrefs.speed+' m/s · '+navigationPrefs.turnRate+'°/s';
  }
  function saveNavigationPrefs(){
    updateNavigationPanelSummary();
    if(applicationPreferences){saveApplicationPreferences();return;}
    // Compatibility for embedded/older Modern hosts that omit preferences module.
    try{if(root.localStorage)root.localStorage.setItem(NAVIGATION_STORAGE_KEY,JSON.stringify(navigationPrefs));}
    catch(error){cameraPositionStatus('Navigation preferences not saved: '+error.message,true);}
  }
  function refreshNavigationCameraInputs(){
    var fields={ModernHeight:'Height',ModernPan:'Pan',ModernNick:'Nick',
      ModernCameraEast:'CameraEast',ModernCameraNorth:'CameraNorth'};
    Object.keys(fields).forEach(function(id){var input=newUiEl(id);if(input)input.value=String(model[fields[id]]);});
    var note=newUiEl('ModernCameraPositionInfo');if(note)note.textContent=cameraPositionText();
    var poseSummary=newUiEl('ModernCameraPoseSummary');
    if(poseSummary)poseSummary.textContent='Height '+Number(model.Height).toFixed(1)+' m';
  }
  function navigationKeyActive(){return Object.keys(navigationKeys).length>0;}
  function stopCameraKeyboard(deferRender){
    var wasPreviewing=autoCameraActive;
    stopAutoCameraPreview();
    if(navigationFrame!==null){cancelAnimationFrame(navigationFrame);navigationFrame=null;}
    Object.keys(navigationKeys).forEach(function(key){delete navigationKeys[key];});
    navigationStamp=null;navigationModifiers={fast:false,precise:false};
    if(navigationMoved){navigationMoved=false;markCustom();if(!deferRender)redraw();}
    else if(wasPreviewing&&!deferRender)redraw();
  }
  function navigationTick(now){
    navigationFrame=null;
    if(!navigationKeyActive()||!navigation)return;
    if(!Number.isFinite(now))now=profileNow();
    var elapsed=Math.min(.1,Math.max(0,(now-navigationStamp)/1000));
    navigationStamp=now;
    if(elapsed>0){
      var next=navigation.move(model,navigationKeys,elapsed,navigationPrefs,navigationModifiers);
      var changed=Object.keys(next).some(function(k){return next[k]!==model[k];});
      if(changed){
        try{checkedCameraPosition(next);}
        catch(error){updateStatus('Navigation limit: '+error.message,true);stopCameraKeyboard();return;}
        Object.keys(next).forEach(function(k){model[k]=next[k];});
        navigationMoved=true;refreshNavigationCameraInputs();
        if(!requestAutoCameraPreview())
          updateStatus('Moving camera · release keys to calculate physical optics');
      }
    }
    navigationFrame=requestAnimationFrame(navigationTick);
  }
  function keyboardAllowed(event){
    if(!event||event.altKey||event.metaKey||state.demosActive||activeCameraPointer)return false;
    var target=event.target||document.activeElement;
    if(target){
      var tag=String(target.tagName||'').toLowerCase();
      if(['input','select','textarea','button','a'].includes(tag)||target.isContentEditable)return false;
      if(tag==='canvas')return true;
    }
    return !document.activeElement||document.activeElement===document.body||
      document.activeElement===document.documentElement;
  }
  function bindCameraKeyboard(){
    if(!navigation||!root.addEventListener)return;
    var inputs=[['ModernCameraMoveSpeed','speed'],['ModernCameraTurnRate','turnRate'],
      ['ModernCameraWheelStep','wheelStep']];
    if(!applicationPreferences){
      try{
        if(root.localStorage){var saved=root.localStorage.getItem(NAVIGATION_STORAGE_KEY);
          if(saved)navigationPrefs=navigation.settings(JSON.parse(saved));}
      }catch(error){cameraPositionStatus('Cannot read navigation preferences: '+error.message,true);}
    }
    updateNavigationPanelSummary();
    inputs.forEach(function(pair){
      var node=newUiEl(pair[0]);if(!node)return;
      node.value=String(navigationPrefs[pair[1]]);
      node.addEventListener('change',function(){
        var value=pair[1]==='wheelStep'&&node.value==='auto'?'auto':Number(node.value);
        var edited=Object.assign({},navigationPrefs);edited[pair[1]]=value;
        navigationPrefs=navigation.settings(edited);node.value=String(navigationPrefs[pair[1]]);
        saveNavigationPrefs();
      });
    });
    root.addEventListener('keydown',function(event){
      var action=navigation.action(event.code);
      if(!action||!keyboardAllowed(event))return;
      if(event.preventDefault)event.preventDefault();
      if(navigationKeys[action])return;
      stopCameraTransition(false,'Transition interrupted by keyboard navigation',false);
      cancelEdits();cancelPending();
      navigationKeys[action]=true;
      navigationModifiers={fast:!!event.shiftKey,precise:!!event.ctrlKey};
      if(navigationFrame===null){navigationStamp=profileNow();navigationFrame=requestAnimationFrame(navigationTick);}
    });
    root.addEventListener('keyup',function(event){
      var action=navigation.action(event.code);
      if(!action||!navigationKeys[action])return;
      if(event.preventDefault)event.preventDefault();
      // Integrate the last fraction of a movement before stopping the gesture.
      if(navigationFrame!==null){cancelAnimationFrame(navigationFrame);navigationFrame=null;}
      navigationTick(profileNow());
      delete navigationKeys[action];
      if(navigationKeyActive()){
        navigationModifiers={fast:!!event.shiftKey,precise:!!event.ctrlKey};
      }else stopCameraKeyboard();
    });
    root.addEventListener('blur',function(){stopCameraKeyboard();});
    if(document.addEventListener)document.addEventListener('visibilitychange',function(){
      if(document.hidden)stopCameraKeyboard();
    });
  }
  // 137.2: the existing raster Canvas is compositor-translated during drag.
  // The shared physical model remains untouched until the final pointerup.
  var activeCameraPointer=null;
  function cameraViewport(view){
    if(view==='Scene')return graph;
    return state.compareGraphs[view];
  }
  function cameraDragHud(canvas){
    if(!canvas||!canvas.parentNode||typeof document.createElement!=='function')return null;
    var host=canvas.parentNode;
    if(typeof host.querySelector==='function'){
      var existing=host.querySelector('.modern-camera-drag-hud');
      if(existing)return existing;
    }
    var node=document.createElement('div');
    node.className='modern-camera-drag-hud';node.hidden=true;
    node.setAttribute('aria-hidden','true');
    host.appendChild(node);
    return node;
  }
  function cancelCameraDrag(keepPreview,sample){
    var active=activeCameraPointer;
    activeCameraPointer=null;
    if(cameraInteraction)cameraInteraction.cancel();
    if(cameraPreview){
      if(keepPreview===true)cameraPreview.hold(cameraMovePreview(sample));
      else cameraPreview.clear();
    }
    if(keepPreview!==true&&atmosphericPresentation){
      atmosphericPresentation.resume();
      if(atmosphericShimmer)atmosphericShimmer.resetClock();
      scheduleShimmerFrame();
    }
    if(!active)return;
    if(active.hud)active.hud.hidden=true;
    if(active.canvas&&typeof active.canvas.releasePointerCapture==='function'){
      try{if(!active.canvas.hasPointerCapture||active.canvas.hasPointerCapture(active.id))
        active.canvas.releasePointerCapture(active.id);}catch(ignore){}
    }
  }
  function bindCameraViewport(view){
    var g=cameraViewport(view),canvas=g&&g.Canvas;
    if(!cameraInteraction||!canvas||typeof canvas.addEventListener!=='function')return;
    var hud=cameraDragHud(canvas);
    canvas.classList&&canvas.classList.add('modern-camera-draggable');
    canvas.tabIndex=0;
    if(typeof canvas.setAttribute==='function')canvas.setAttribute('aria-label',
      'Camera viewport. Use W A S D, Q E and arrow keys for keyboard navigation.');
    // The CSS link may be stale in a long-running local session. Make the
    // effective pointer affordance explicit on each real Canvas as well.
    if(root.CurvatureModernCameraDragPreview&&root.CurvatureModernCameraDragPreview.setCursor)
      root.CurvatureModernCameraDragPreview.setCursor(canvas,'grab');
    // Middle-click normally starts Chromium/Opera autoscroll (the circle with
    // four arrows), which is not a camera-drag cursor and ignores CSS changes.
    // Prevent it only over the interactive camera viewport.
    function suppressMiddleClick(event){
      if(event.button===1&&event.preventDefault)event.preventDefault();
    }
    canvas.addEventListener('mousedown',suppressMiddleClick);
    canvas.addEventListener('auxclick',suppressMiddleClick);
    canvas.addEventListener('dragstart',function(event){
      if(event.preventDefault)event.preventDefault();
    });
    canvas.addEventListener('pointerdown',function(event){
      if(event.button===1){if(event.preventDefault)event.preventDefault();return;}
      if(activeCameraPointer||(cameraPreview&&cameraPreview.isHolding())||
        event.button!==0||event.isPrimary===false||
        (view==='Scene'&&state.mode!=='scene')||
        (view!=='Scene'&&state.mode!=='compare'))return;
      var rect=canvas.getBoundingClientRect&&canvas.getBoundingClientRect();
      if(!rect||!(rect.width>0&&rect.height>0))return;
      stopCameraTransition(false,'Transition interrupted by mouse navigation',false);
      try{
        if(typeof canvas.focus==='function')canvas.focus({preventScroll:true});
        cameraInteraction.begin({viewport:view,x:event.clientX,y:event.clientY,
          width:rect.width,height:rect.height,
          mode:event.shiftKey?'translate':'rotate',
          camera:{Pan:model.Pan,Nick:model.Nick,Roll:model.Roll,Height:model.Height,
            CameraEast:model.CameraEast,CameraNorth:model.CameraNorth},
          referenceDistance:cameraReferenceDistance(),
          fovRadians:model.camViewAngle,aspectRatio:model.deviceRatio});
        var liveCameraDrag=state.opticalQuality==='auto'&&autoPreviewSupported();
        if(liveCameraDrag)cancelPending();
        if(cameraPreview&&!liveCameraDrag){
          var sides=state.mode==='compare'?['A','B']:['Scene'];
          cameraPreview.begin({source:view,viewports:sides.map(function(side){
            var graph=cameraViewport(side);
            var physical=side==='Scene'?model:state.comparePair&&state.comparePair[side];
            var aim=0;
            if(physical&&root.CurvaturePhysicalCamera&&
              typeof root.CurvaturePhysicalCamera.create==='function')
              aim=root.CurvaturePhysicalCamera.create(physical).aimDip;
            return {name:side,canvas:graph&&graph.Canvas,
              camera:physical?{Pan:physical.Pan,Nick:physical.Nick,Roll:physical.Roll}:null,
              fovRadians:physical&&physical.camViewAngle,
              aspectRatio:physical&&physical.deviceRatio,aimRadians:aim};
          })});
        }
        if(atmosphericPresentation){stopShimmerFrame();atmosphericPresentation.suspend();}
        activeCameraPointer={canvas:canvas,id:event.pointerId,hud:hud,
          autoLive:liveCameraDrag,moved:false,startPose:liveCameraDrag?captureCameraPose():null};
        if(typeof canvas.setPointerCapture==='function')canvas.setPointerCapture(event.pointerId);
        if(event.preventDefault)event.preventDefault();
      }catch(error){cancelCameraDrag();updateStatus('Camera drag: '+error.message,true);}
    });
    canvas.addEventListener('pointermove',function(event){
      var active=activeCameraPointer;
      if(!active||active.canvas!==canvas||active.id!==event.pointerId)return;
      var sample=cameraInteraction.move({x:event.clientX,y:event.clientY});
      if(Math.hypot(sample.dx,sample.dy)<2)return;
      if(active.autoLive){
        try{
          var position=sample.mode==='translate'?checkedCameraPosition(
            root.CurvatureModernCameraInteraction.translate(sample)):
            root.CurvatureModernCameraInteraction.angles(sample);
          Object.keys(position).forEach(function(key){model[key]=position[key];});
          active.moved=true;refreshNavigationCameraInputs();
          requestAutoCameraPreview();
        }catch(error){updateStatus('Camera drag: '+error.message,true);return;}
      }else if(cameraPreview)cameraPreview.move(cameraMovePreview(sample));
      if(hud){
        if(sample.mode==='translate'){
          var position=root.CurvatureModernCameraInteraction.translate(sample);
          hud.textContent='Height '+position.Height.toFixed(2)+' m · East '+
            position.CameraEast.toFixed(2)+' m · North '+position.CameraNorth.toFixed(2)+' m';
        }else{
          var target=root.CurvatureModernCameraInteraction.angles(sample);
          hud.textContent='Pan '+target.Pan.toFixed(4)+'°  ·  Nick '+target.Nick.toFixed(4)+'°';
        }
        hud.hidden=false;
      }
      if(event.preventDefault)event.preventDefault();
    });
    canvas.addEventListener('pointerup',function(event){
      var active=activeCameraPointer;
      if(!active||active.canvas!==canvas||active.id!==event.pointerId)return;
      var sample=cameraInteraction.end({x:event.clientX,y:event.clientY});
      var changed=sample&&Math.hypot(sample.dx,sample.dy)>=2;
      if(active.autoLive){
        cancelCameraDrag();stopAutoCameraPreview();
        if(!changed&&!active.moved)return;
        try{
          var finalCamera=sample.mode==='translate'?checkedCameraPosition(
            root.CurvatureModernCameraInteraction.translate(sample)):
            root.CurvatureModernCameraInteraction.angles(sample);
          Object.keys(finalCamera).forEach(function(key){model[key]=finalCamera[key];});
          markCustom();syncNumericInputs();redraw();
        }catch(error){updateStatus('Camera drag: '+error.message,true);}
        if(event.preventDefault)event.preventDefault();
        return;
      }
      cancelCameraDrag(changed,sample);
      if(!changed)return;
      try{
        var next=sample.mode==='translate'?checkedCameraPosition(
          root.CurvatureModernCameraInteraction.translate(sample)):
          root.CurvatureModernCameraInteraction.angles(sample);
        if(sample.mode==='translate'?next.Height===model.Height&&
          next.CameraEast===model.CameraEast&&next.CameraNorth===model.CameraNorth:
          next.Pan===model.Pan&&next.Nick===model.Nick){
          if(cameraPreview)cameraPreview.clear();
          if(atmosphericPresentation){atmosphericPresentation.resume();scheduleShimmerFrame();}
          return;
        }
        cancelEdits();
        if(sample.mode==='translate'){
          model.Height=next.Height;model.CameraEast=next.CameraEast;model.CameraNorth=next.CameraNorth;
        }else if(adapter){adapter.setCamera(model,'Pan',next.Pan);adapter.setCamera(model,'Nick',next.Nick);}
        else{model.Pan=next.Pan;model.Nick=next.Nick;}
        markCustom();syncNumericInputs();redraw();
      }catch(error){
        if(cameraPreview)cameraPreview.clear();
        if(atmosphericPresentation){atmosphericPresentation.resume();scheduleShimmerFrame();}
        updateStatus('Camera drag: '+error.message,true);
      }
      if(event.preventDefault)event.preventDefault();
    });
    canvas.addEventListener('pointercancel',function(event){
      if(activeCameraPointer&&activeCameraPointer.canvas===canvas&&
        activeCameraPointer.id===event.pointerId)abortCameraDrag();
    });
    canvas.addEventListener('lostpointercapture',function(event){
      if(activeCameraPointer&&activeCameraPointer.canvas===canvas&&
        activeCameraPointer.id===event.pointerId)abortCameraDrag();
    });
  }
  // Shift+wheel zoom and Alt+wheel surface-parallel dolly are scoped to the
  // canvas under the pointer. Neither combination changes Pan/Nick/Roll.
  // No modifiers:
  // leave the browser's ordinary page scrolling entirely untouched.
  // Compare clones the common model in prepareCompare(), so one change here
  // always reaches A and B without changing either one's optical profile.
  function bindFocalWheel(view){
    var g=cameraViewport(view),canvas=g&&g.Canvas;
    var interaction=root.CurvatureModernCameraInteraction;
    if(!canvas||typeof canvas.addEventListener!=='function'||
       !interaction||typeof interaction.focalWheel!=='function')return;
    canvas.addEventListener('wheel',function(event){
      // Some Windows/Opera configurations remap Shift+vertical wheel to
      // horizontal deltaX. Accept that delta only if deltaY is zero.
      var delta=event.deltaY||event.deltaX||0;
      if((!event.shiftKey&&!event.altKey)||(event.shiftKey&&event.altKey)||
         event.ctrlKey||event.metaKey||
         delta===0||activeCameraPointer||
         (view==='Scene'&&state.mode!=='scene')||
         (view!=='Scene'&&state.mode!=='compare')||state.demosActive)return;
      stopCameraTransition(false,'Transition interrupted by wheel navigation',false);
      var next;
      try{
        if(event.altKey){
          next=checkedCameraPosition(Object.assign({Height:model.Height},
            interaction.dolly(model,delta,event.deltaMode,cameraReferenceDistance(),navigationPrefs.wheelStep)));
        }else next=interaction.focalWheel(model.FocalLengthField,delta,event.deltaMode);
      }catch(error){updateStatus('Camera movement: '+error.message,true);return;}
      if(event.preventDefault)event.preventDefault();
      if(event.altKey){
        if(next.CameraEast===model.CameraEast&&next.CameraNorth===model.CameraNorth)return;
        cancelEdits();model.CameraEast=next.CameraEast;model.CameraNorth=next.CameraNorth;
        markCustom();syncNumericInputs();scheduleCameraWheelRedraw();return;
      }
      if(next===model.FocalLengthField)return;
      cancelEdits();
      if(adapter)adapter.setCamera(model,'FocalLengthField',next);
      else model.FocalLengthField=next;
      markCustom();
      // Update the visible controls immediately, even when many wheel events
      // arrive before the deferred physical projection redraw.
      var input=el('ModernFocal');if(input)input.value=String(next);
      var fov=el('ModernViewAngle');
      if(fov&&interaction.focalViewAngle)
        fov.value=String(Number(interaction.focalViewAngle(next).toFixed(4)));
      scheduleCameraWheelRedraw();
    },{passive:false});
  }
  function scheduleCameraWheelRedraw(){
    if(state.opticalQuality==='auto'&&autoPreviewSupported()){
      requestAutoCameraPreview();
      clearAutoCameraSettle();
      autoCameraSettleTimer=setTimeout(function(){
        autoCameraSettleTimer=null;stopAutoCameraPreview();redraw();
      },AUTO_WHEEL_IDLE_MS);
      return;
    }
    cancelPending();
    // Coalesce bursts of wheel input; the authoritative renderer, optical
    // cache, shared Compare cameras and persistence all update in redraw().
    state.timer=setTimeout(function(){state.timer=null;redraw();},90);
  }
  function abortCameraDrag(){
    var active=activeCameraPointer;
    if(active&&active.autoLive&&active.startPose){
      CAMERA_POSE_FIELDS.forEach(function(field){model[field]=active.startPose[field];});
      stopAutoCameraPreview();
      cancelCameraDrag();
      syncNumericInputs();redraw();
    }else cancelCameraDrag();
  }
  function bindCameraDrag(){
    ['Scene','A','B'].forEach(bindCameraViewport);
    ['Scene','A','B'].forEach(bindFocalWheel);
    if(root.addEventListener)root.addEventListener('blur',abortCameraDrag);
    if(document.addEventListener)document.addEventListener('visibilitychange',function(){
      if(document.hidden)abortCameraDrag();
    });
  }
  var pendingCompareScope=null;
  function showComputeTiming(message){
    var status=newUiEl('ModernComputeTiming');
    if(status)status.textContent=message;
  }
  function measuredGraphRedraw(view){
    if(!view)return {};
    var start=profileNow();
    resizeGraph(view);
    var resized=profileNow();
    view.Redraw();
    var finished=profileNow();
    return {totalMs:finished-start,resizeMs:resized-start,
      redrawMs:finished-resized};
  }
  function redraw(opticalSampleMode,compareSide){
    // Ignore DOM events passed by ordinary change handlers: only the explicit
    // profiling actions can request a forced cold optical recomputation.
    var liveMotion=opticalSampleMode==='camera-motion';
    if(cameraTransition&&!liveMotion)stopCameraTransition(false,'Animation interrupted by redraw',false);
    var sample=opticalSampleMode==='cold'||opticalSampleMode==='warm';
    state.opticalSample=sample?opticalSampleMode:null;
    // A targeted physical-input edit cannot invalidate the other viewport.
    // However, pending shared/both changes must retain their full redraw.
    // No partial draws on first load, mode switch, or explicit cold/warm runs.
    var selected=(compareSide==='A'||compareSide==='B')&&state.mode==='compare'&&
      !sample&&state.compareLast.A&&state.compareLast.B?compareSide:null;
    if(selected&&pendingCompareScope&&pendingCompareScope!==selected)selected=null;
    if(selected&&state.timer!==null)selected=null;
    if(activeCameraPointer&&!liveMotion)cancelCameraDrag();
    var setupStartedAt=profileNow();
    cancelPending();
    if(adapter&&adapter.refreshDescription)adapter.refreshDescription(model);
    var liveDescription=el('ModernSceneDescription');
    if(liveDescription)liveDescription.textContent=model.Description||'Custom physical scene';
    model.Update();refreshLabels();
    if(!liveMotion)scheduleExperimentSave();
    if(state.mode==='compare'){
      if(!prepareCompare()){state.opticalSample=null;if(cameraPreview)cameraPreview.clear();return;}
      ['A','B'].forEach(function(side){
        var status=el('ModernCompareStatus'+side);
        if(status&&(!selected||side===selected))status.textContent='Rendering current model '+side+'…';
      });
      showComputeTiming(selected?'Model '+(selected==='A'?'B':'A')+' unchanged · rendering '+selected+'…':
        'Rendering both models…');
      var scheduledAt=profileNow();
      pendingCompareScope=selected||'both';
      state.frame=requestAnimationFrame(function(){
        state.frame=null;pendingCompareScope=null;
        var startedAt=profileNow();
        try{
          var previousA=state.compareLast.A,previousB=state.compareLast.B;
          var a=selected==='B'?null:measuredGraphRedraw(state.compareGraphs.A);
          var b=selected==='A'?null:measuredGraphRedraw(state.compareGraphs.B);
          var doneAt=profileNow();
          var active=selected||'B',last=state.compareLast[active];
          var stage=last&&last.timings||{};
          var activeMs=selected==='A'?(a&&a.totalMs):(b&&b.totalMs);
          var line=(selected?'Model '+(selected==='A'?'B':'A')+' unchanged · ':'A+B rendered · ')+
            (selected?active: 'total')+' '+Math.round(selected?activeMs:doneAt-startedAt)+' ms';
          if(Number.isFinite(stage.opticsMs))line+=' · '+active+' optics '+Math.round(stage.opticsMs)+' ms';
          if(Number.isFinite(stage.canvasMs))line+=' · Canvas '+Math.round(stage.canvasMs)+' ms';
          showComputeTiming(line);
          observePreviewFrame('compare',doneAt-startedAt,!selected);
          if(!liveMotion&&state.compareLast.A&&state.compareLast.B&&
              (selected==='A'?state.compareLast.A!==previousA:
                selected==='B'?state.compareLast.B!==previousB:
                state.compareLast.A!==previousA&&state.compareLast.B!==previousB))queueHistoryAuto();
          if(renderProfiler)renderProfiler.recordBatch({mode:'compare',
            setupMs:scheduledAt-setupStartedAt,queueMs:startedAt-scheduledAt,totalMs:doneAt-startedAt,
            A:a||undefined,B:b||undefined});
        }finally{
          if(state.opticalSample){
            var kind=state.opticalSample;
            refreshPerformanceReport('Status: recording · '+kind+' sample completed. '+
              'Check cold/warm groups below for actual cache hits or misses.');
          }
          state.opticalSample=null;
          if(cameraPreview)cameraPreview.clear();
        }
      });
    }else{
      var sceneScheduledAt=profileNow();
      state.frame=requestAnimationFrame(function(){
        state.frame=null;
        var startedAt=profileNow();
        try{
          var previousScene=state.last;
          var metrics=measuredGraphRedraw(graph);
          showComputeTiming('Scene rendered · '+Math.round(metrics.totalMs)+' ms');
          observePreviewFrame('Scene',metrics.totalMs,true);
          if(!liveMotion&&state.last&&state.last!==previousScene)queueHistoryAuto();
          if(renderProfiler)renderProfiler.recordBatch({mode:'scene',
            setupMs:sceneScheduledAt-setupStartedAt,queueMs:startedAt-sceneScheduledAt,totalMs:profileNow()-startedAt,Scene:metrics});
        }finally{
          if(state.opticalSample){
            var kind=state.opticalSample;
            refreshPerformanceReport('Status: recording · '+kind+' sample completed. '+
              'Check cold/warm groups below for actual cache hits or misses.');
          }
          state.opticalSample=null;
          if(cameraPreview)cameraPreview.clear();
        }
      });
    }
  }
  function scheduleRedraw(){
    updateSnapshotSaveAction();
    cancelPending();
    // A slider may be edited immediately before Refresh/pagehide, before the
    // deferred optics redraw occurs. Persist its live value in that case.
    scheduleExperimentSave();
    updateStatus('Updating physical optics after parameter change…');
    state.timer=setTimeout(function(){state.timer=null;redraw();},300);
  }
  function setMode(mode,remember){
    if(mode!=='animation'&&animationWorkspaceOpen){
      cancelStudioInitialPaint();stopStudioPlayback(false);
      if(studioPlayback)saveStudioDraft(false);
    }
    if(!['scene','compare','animation','demos'].includes(mode))
      throw RangeError('Invalid Modern UI mode');
    if(mode==='animation'){
      // A UI-only mode; physical state.mode is retained as Scene/Compare.
      // Never serialize 'animation' in an experiment or start optical redraws.
      stopCameraTransition(false,'Animation workspace opened',false);
      stopAutoCameraPreview();stopCameraKeyboard(true);abortCameraDrag();cancelEdits();
      if(persistence.dirty)flushWorkingSession();
      if(state.demosActive&&root.CurvatureModernDemos)root.CurvatureModernDemos.deactivate();
      state.demosActive=false;
      var demosPanel=newUiEl('ModernDemosPanel');if(demosPanel)demosPanel.hidden=true;
      var demosTab=newUiEl('ModernDemosTab');
      if(demosTab){demosTab.classList.remove('is-active');demosTab.setAttribute('aria-pressed','false');}
      ['ModernSceneTab','ModernCompareTab'].forEach(function(id){
        var tab=el(id);tab.classList.remove('is-active');tab.setAttribute('aria-pressed','false');
      });
      animationWorkspaceOpen=true;syncWorkspaceVisibility();
      if(studioPlayback)scheduleStudioInitialPaint('opened');
      if(remember!==false&&workspaceState.mode!=='animation'){
        workspaceState.mode='animation';saveApplicationPreferences();
      }
      if(experimentHistory)refreshHistoryList().catch(function(error){historyStatus(error.message,true);});
      return;
    }
    animationWorkspaceOpen=false;syncWorkspaceVisibility();
    if(state.mode!==mode)resetHistoryBaseline();
    if(remember!==false&&mode!==workspaceState.mode){workspaceState.mode=mode;saveApplicationPreferences();}
    stopCameraTransition(false,'Transition interrupted by workspace switch',false);
    stopAutoCameraPreview();
    if(mode!=='scene'&&mode!=='compare'&&mode!=='demos')throw RangeError('Invalid Modern UI mode');
    stopCameraKeyboard(true);abortCameraDrag();cancelEdits();stopShimmerFrame();
    if(atmosphericShimmer)atmosphericShimmer.resetClock();
    // Demos has no serializable experiment mode. Commit pending Scene/Compare
    // edits before switching there, rather than leaving an invalid checkpoint.
    if(mode==='demos'&&persistence.dirty)flushWorkingSession();
    var demos=root.CurvatureModernDemos;
    var demosActive=mode==='demos';
    var workspace=newUiEl('ModernWorkspace');
    if(workspace)workspace.classList.toggle('is-demos',demosActive);
    var demosPanel=newUiEl('ModernDemosPanel');if(demosPanel)demosPanel.hidden=!demosActive;
    var demosTab=newUiEl('ModernDemosTab');
    if(demosTab){demosTab.classList.toggle('is-active',demosActive);
      demosTab.setAttribute('aria-pressed',String(demosActive));}
    if(demosActive){
      if(newUiEl('ModernSnapshotSaveBar'))newUiEl('ModernSnapshotSaveBar').hidden=true;
      cancelPending();
      state.demosActive=true;
      el('ModernSceneTab').classList.remove('is-active');
      el('ModernCompareTab').classList.remove('is-active');
      el('ModernSceneTab').setAttribute('aria-pressed','false');
      el('ModernCompareTab').setAttribute('aria-pressed','false');
      if(demos)demos.activate();
      return; // Never serialize Demos as a physical Scene/Compare mode.
    }
    if(state.demosActive&&demos)demos.deactivate();
    state.demosActive=false;
    state.mode=mode;
    updateSnapshotSaveAction();
    resetHistoryBaseline();
    el('ModernSceneTab').classList.toggle('is-active',mode==='scene');
    el('ModernCompareTab').classList.toggle('is-active',mode==='compare');
    el('ModernSceneTab').setAttribute('aria-pressed',String(mode==='scene'));
    el('ModernCompareTab').setAttribute('aria-pressed',String(mode==='compare'));
    el('ModernCompareMessage').hidden=mode!=='compare';
    if(compareState){
      // One sidebar and one set of Camera/Objects/Display controls in both modes.
      // Surface/Atmosphere are the only panels that edit different physics.
      var pairSettings=el('ModernCompareSettings');
      if(pairSettings)pairSettings.hidden=mode!=='compare';
      var title=newUiEl('ModernSidebarTitle');if(title)title.textContent=mode==='compare'?'Compare settings':'Scene settings';
      var subtitle=newUiEl('ModernSidebarSubtitle');if(subtitle)subtitle.textContent=mode==='compare'?'Shared scene · independent physics':'Shared physical renderer';
      // The three Display controls are shared in Scene and Compare.
      var display=newUiEl('ModernCompareDisplayOptions');if(display)display.hidden=false;
      var aim=el('ModernCameraAim');if(aim)aim.disabled=mode==='compare';
      var aimNote=newUiEl('ModernCompareCameraAimNote');if(aimNote)aimNote.hidden=mode!=='compare';
      var sceneRender=el('ModernRender');if(sceneRender)sceneRender.hidden=mode==='compare';
      var compareRender=el('ModernRecalculateCompare');if(compareRender)compareRender.hidden=mode!=='compare';
      var sceneNote=newUiEl('ModernSceneEditNote');if(sceneNote)sceneNote.hidden=mode==='compare';
      var compareNote=newUiEl('ModernCompareEditNote');if(compareNote)compareNote.hidden=mode!=='compare';
    }
    if(mode==='compare'&&compareState){
      if(!state.compareConfig)
        state.compareConfig=compareState.initial(model,state.atmosphere,state.occlusionRadius,state.temperatureProfile,state.transitionProfile,state.inverseProfile);
      syncCompareEditor();
    }
    // Compare's source model retains Scene aiming for later, but the A/B clones
    // always use a common eye-level aim. Do not show a misleading Scene aim.
    var cameraAim=el('ModernCameraAim');
    if(cameraAim)cameraAim.value=mode==='compare'?'3':String(model.viewcenterHorizon);
    applyWorkspaceSections();
    if(typeof document.querySelector==='function')
      activateSettings(workspaceState[mode+'Tab']||'Camera',false,false);
    el('ModernGraphHost').closest('.modern-viewport-panel').hidden=mode==='compare';
    var views=el('ModernCompareViews');
    if(views){views.classList.toggle('is-active',mode==='compare');
      views.setAttribute('aria-hidden',String(mode!=='compare'));}
    refreshLabels();syncShimmerControls();
    redraw();
  }
  function markCustom(){
    var preset=el('ModernPreset');if(preset)preset.value='custom';
  }
  function applyField(action,raw,label){
    try{action(raw);markCustom();updateObjectGroupSummaries();redraw();return true;}
    catch(error){updateStatus('Invalid '+label+': '+error.message,true);return false;}
  }
  function cancelEdits(){
    Object.keys(state.editTimeouts).forEach(function(id){clearTimeout(state.editTimeouts[id]);});
    state.editTimeouts={};
  }
  function bindNumber(id,action,description,commitOnly,currentValue){
    var input=el(id);if(!input)return;
    function commit(){
      if(state.editTimeouts[id]!==undefined){clearTimeout(state.editTimeouts[id]);delete state.editTimeouts[id];}
      radiusDraft(id,false);
      var raw=input.value;
      // Enter + change should not retrace an unchanged physical radius.
      if(commitOnly&&typeof currentValue==='function'&&raw.trim()!==''&&
          Number.isFinite(Number(raw))&&Number(raw)===currentValue()){
        syncNumericInputs();return;
      }
      // Use the same validation for immediate and debounced changes.
      if(!adapter){
        var n=Number(raw);
        if(!Number.isFinite(n)||raw.trim()===''||
          (input.min!==''&&n<Number(input.min))||
          (input.max!==''&&n>Number(input.max))){
          updateStatus('Invalid value for '+(description||id),true);return;
        }
        action(n);redraw();return;
      }
      if(applyField(action,raw,description||id))syncNumericInputs();
    }
    input.addEventListener('input',function(){
      if(cameraTransition)stopCameraTransition(false,'Transition interrupted by camera editing',false);
      if(commitOnly){radiusDraft(id,true);return;}
      if(state.editTimeouts[id]!==undefined)clearTimeout(state.editTimeouts[id]);
      // Other controls retain the existing short debounce.
      state.editTimeouts[id]=setTimeout(commit,420);
    });
    input.addEventListener('change',commit);
    if(commitOnly)input.addEventListener('keydown',function(event){
      if(event.key==='Enter'){
        if(event.preventDefault)event.preventDefault();
        commit();
        if(typeof input.blur==='function')input.blur();
      }
    });
  }
  function syncNumericInputs(){
    var position=newUiEl('ModernCameraPositionInfo');
    if(position)position.textContent=cameraPositionText();
    var poseSummary=newUiEl('ModernCameraPoseSummary');
    if(poseSummary)poseSummary.textContent='Height '+Number(model.Height).toFixed(1)+' m';
    var pairs={ModernHeight:'Height',ModernFocal:'FocalLengthField',ModernPan:'Pan',
      ModernNick:'Nick',ModernRoll:'Roll'};
    Object.keys(pairs).forEach(function(id){var node=el(id);if(node)node.value=String(model[pairs[id]]);});
    if(typeof document.querySelector==='function')
      [['#ModernCameraEast','CameraEast'],['#ModernCameraNorth','CameraNorth']].forEach(function(pair){
        var node=document.querySelector(pair[0]);if(node)node.value=String(model[pair[1]]);
      });
    var aim=el('ModernCameraAim');if(aim)aim.value=String(model.viewcenterHorizon);
    var atmosphere=el('ModernAtmosphere');if(atmosphere){showLegacyOption('ModernAtmosphere',state.atmosphere);atmosphere.value=state.atmosphere;}
    renderAtmosphereDescription('ModernAtmosphereInfo',state.atmosphere);
    updatePhysicsPanelPresentation(false);
    var occlusion=el('ModernOcclusion');if(occlusion)occlusion.value=String(state.occlusionRadius/1000);
    syncVisibilityControls();
    syncTemperatureControls();
    var grid=el('ModernGrid');if(grid)grid.checked=model.showGrid!==0;
    var eye=newUiEl('ModernCompareEyeLevel');if(eye)eye.checked=state.compareEyeLevel;
    var horizon=newUiEl('ModernCompareHorizon');if(horizon)horizon.checked=state.compareHorizon;
    var title=el('ModernSceneTitle');if(title)title.textContent=model.DemoText||'Custom physical scene';
    if(adapter&&adapter.refreshDescription)adapter.refreshDescription(model);
    var description=el('ModernSceneDescription');if(description)description.textContent=model.Description||'Custom physical scene';
    for(var i=0;i<2;i++){
      Object.keys(adapter?adapter.OBJECT:{}).forEach(function(key){
        var node=el('ModernObject'+i+key);
        if(node)node.value=String(model[key][i]);
      });
    }
    refreshLabels();
  }
  // Labels are derived from the model, never from controls that may be hidden
  // by a native <details>. Collapsing sections does not change physical state.
  function updateObjectGroupSummaries(){
    var names={0:['Bedford marker','Bedford markers'],1:['measuring rod','measuring rods'],
      2:['ship','ships'],3:['transmission tower','transmission towers']};
    for(var i=0;i<2;i++){
      var count=Number(model.NObjects[i]);
      var types=names[model.ObjType[i]]||['object','objects'];
      var summary=newUiEl('ModernObjectGroupSummary'+i);
      if(summary)summary.textContent=count===0?'No objects':
        count+' '+types[count===1?0:1];
      var variations=newUiEl('ModernObjectVariationSummary'+i);
      if(variations){
        var side=Number(model.ObjSideVar[i])!==0,size=Number(model.ObjSizeVar[i])!==0;
        variations.textContent=side&&size?'Offset + size':side?'Offset varied':
          size?'Size varied':'No variation';
      }
    }
  }
  function objectFieldMarkup(i){
    var fields=[
      ['NObjects','Count','number',0,200,1],['ObjType','Object type','select'],
      ['ObjDist','Start distance (m)','number',0,10000000,'any'],
      ['ObjDeltaDist','Spacing (m)','number',0.001,10000000,'any'],
      ['ObjSidePos','Lateral offset (m)','number',-10000000,10000000,'any'],
      ['ObjSize','Height / size (m)','number',0.001,1000000,'any'],
      ['ObjSideType','Offset variation','select'],
      ['ObjSideVar','Offset amplitude (m)','number',-10000000,10000000,'any'],
      ['ObjSizeType','Size variation','select'],
      ['ObjSizeVar','Size amplitude (fraction)','number',-10000,10000,'any']
    ];
    var typeOptions=[['3','Transmission tower'],['2','Ship'],['1','Measuring rod'],['0','Bedford marker']];
    var variationOptions=[['0','Linear'],['1','Alternating'],['2','Random'],['3','Cosine'],['4','Sine']];
    function field(row){
      var key=row[0],id='ModernObject'+i+key;
      var inner=row[2]==='select'?'<select id="'+id+'" data-group="'+i+'" data-field="'+key+'">'+
        (key==='ObjType'?typeOptions:variationOptions).map(function(o){return '<option value="'+o[0]+'">'+o[1]+'</option>';}).join('')+'</select>':
        '<input id="'+id+'" data-group="'+i+'" data-field="'+key+'" type="number" min="'+row[3]+'" max="'+row[4]+'" step="'+row[5]+'">';
      return '<div class="modern-field"><label for="'+id+'">'+row[1]+'</label>'+inner+'</div>';
    }
    return '<div class="modern-object-grid">'+fields.slice(0,6).map(field).join('')+'</div>'+
      '<details class="modern-object-variations modern-workspace-fold" id="ModernObjectVariations'+i+'" data-workspace-section="objects.group'+(i+1)+'.variations">'+
        '<summary>Variations <span class="modern-fold-summary" id="ModernObjectVariationSummary'+i+'">No variation</span></summary>'+
        '<div class="modern-workspace-fold-content modern-object-grid">'+fields.slice(6).map(field).join('')+'</div>'+
      '</details>';
  }
  function bindObjectFields(){
    if(!adapter)return;
    for(var i=0;i<2;i++){
      var host=el('ModernObjectFields'+i);
      // Old 130 Node DOM fakes intentionally do not support querySelectorAll.
      if(!host||typeof host.querySelectorAll!=='function')continue;
      host.innerHTML=objectFieldMarkup(i);
      var fields=host.querySelectorAll('input,select');
      for(var j=0;j<fields.length;j++)(function(field){
        var group=Number(field.getAttribute('data-group'));
        var key=field.getAttribute('data-field');
        if(field.tagName.toLowerCase()==='select'){
          field.addEventListener('change',function(){applyField(function(v){adapter.setObject(model,group,key,v);},field.value,key);});
        }else{
          bindNumber(field.id,function(v){adapter.setObject(model,group,key,v);},key);
        }
      })(fields[j]);
    }
  }
  function selectPreset(id){
    if(!adapter)return;
    stopCameraTransition(false,'Transition interrupted by preset change',false);
    try{
      cancelEdits();
      adapter.applyPreset(model,id);
      state.preset=id;state.atmosphere='standard';state.occlusionRadius=6371000;
      state.temperatureProfile={temperatureC:15,pressureHpa:1013.25,gradientKPerKm:-6.5};
      state.transitionProfile={source:'standard',weight:0};
      state.inverseProfile={source:'temperature-lapse',weight:0};
      cameraPositions=[];cameraSequence=[];initialCamera=captureCameraPose();
      renderCameraPositions();renderCameraSequenceKeyframes(-1);model.Update();syncNumericInputs();
      var preset=el('ModernPreset');if(preset)preset.value=id;
      redraw();
    }catch(error){updateStatus(error.message,true);}
  }
  // Shared Scene/Compare tabs; only Surface and Atmosphere have model-specific panels.
  // Camera, Objects and Display keep the very same inputs and event handlers.
  var settingGroups=['Camera','Surface','Atmosphere','Objects','Display'];
  var activeSettings='Camera';
  function settingsPanel(group){
    if(state.mode==='compare'&&(group==='Surface'||group==='Atmosphere'))
      return 'ModernComparePanel'+group;
    return 'ModernPanel'+group;
  }
  function activateSettings(name,focus,remember){
    if(!settingGroups.includes(name))return;
    activeSettings=name;
    if(remember!==false){
      var tabKey=state.mode==='compare'?'compareTab':'sceneTab';
      if(workspaceState[tabKey]!==name){workspaceState[tabKey]=name;saveApplicationPreferences();}
    }
    settingGroups.forEach(function(group){
      var tab=el('ModernSettings'+group),scenePanel=el('ModernPanel'+group);
      if(!tab||!scenePanel)return;
      var comparePanel=(group==='Surface'||group==='Atmosphere')?
        el('ModernComparePanel'+group):null;
      var active=group===name,selectedId=settingsPanel(group);
      tab.classList.toggle('is-active',active);
      tab.setAttribute('aria-selected',String(active));
      tab.setAttribute('aria-controls',selectedId);
      tab.tabIndex=active?0:-1;
      scenePanel.hidden=!active||selectedId!==scenePanel.id;
      if(comparePanel)comparePanel.hidden=!active||selectedId!==comparePanel.id;
      if(active&&focus&&typeof tab.focus==='function')tab.focus();
    });
  }
  function bindSettingsTabs(){
    // The old 130/131 fake DOM has no querySelector; real documents do.
    if(typeof document.querySelector!=='function')return;
    settingGroups.forEach(function(group,index){
      var tab=el('ModernSettings'+group);if(!tab)return;
      tab.addEventListener('click',function(){activateSettings(group,false);});
      tab.addEventListener('keydown',function(event){
        var offset=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;
        if(event.key==='Home'){event.preventDefault();activateSettings(settingGroups[0],true);}
        else if(event.key==='End'){event.preventDefault();activateSettings(settingGroups[settingGroups.length-1],true);}
        else if(offset){event.preventDefault();activateSettings(settingGroups[(index+offset+settingGroups.length)%settingGroups.length],true);}
      });
    });
    activateSettings('Camera',false,false);
  }
  var fieldHelp={
    ModernHeight:'Observer height above the local surface, in metres. Does not move the towers.',
    ModernCameraEast:'Observer east-west surface-arc offset in metres from the scene origin. Objects stay fixed.',
    ModernCameraNorth:'Observer north-south surface-arc offset in metres from the scene origin. Objects stay fixed.',
    ModernFocal:'Camera focal length in millimetres. This and field of view describe the same camera zoom. Hold Shift and scroll over a Scene/Compare image to zoom both Compare models together.',
    ModernViewAngle:'Angular field of view in degrees, synchronized with focal length. Only the displayed number is rounded.',
    ModernPan:'Horizontal aiming angle in degrees. Changes the camera, not the object azimuths.',
    ModernNick:'Vertical camera pitch in degrees. Does not change observer height.',
    ModernRoll:'Rotation around the camera viewing axis, in degrees.',
    ModernCameraAim:'Scene can aim using geometric horizons. Compare always uses the common eye-level direction (0°) so both physical models share one camera.',
    ModernCurvature:'Surface curvature is κ = 1/R. The far-right endpoint is exactly flat (κ = 0), not merely a very large sphere.',
    ModernRadiusKm:'Physical surface radius in kilometres. Independent of any special atmospheric comparison radius.',
    ModernFlat:'Sets exact zero surface curvature. Camera and tower distances do not change.',
    ModernAtmosphere:'Controls how light propagates. Standard is a fixed exponential. Temperature gradient uses a dry hydrostatic boundary layer. Profile transition is a mathematical interpolation, not a temperature-driven physical transformation.',
    ModernOcclusion:'Refraction scale radius R in kilometres for the engineered n(h) profile. Independent of the geometric surface radius; stored internally in metres.',
    ModernModelCurvature:'Curvature of the selected Compare model only. A and B retain independent physical surfaces.',
    ModernModelRadius:'Radius of the selected Compare surface in kilometres; not the atmospheric refraction scale.',
    ModernModelAtmosphere:'Optical atmosphere for the selected Compare model only; the other model is unchanged.',
    ModernModelOcclusion:'Engineered refractive-index scale radius of the selected Compare model, independent of surface radius.',
    ModernTemperatureSceneC:'Surface air temperature in Celsius, used by the dry hydrostatic refractivity model.',
    ModernTemperatureSceneGradient:'Local surface temperature gradient in K/km; the gradient decays above the boundary layer.',
    ModernTemperatureScenePressure:'Surface air pressure in hectopascals. The optical calculation assumes dry air.',
    ModernTemperatureCompareC:'Surface temperature for the selected Compare model A or B.',
    ModernTemperatureCompareGradient:'Local surface gradient for the selected Compare model; not shared across A/B.',
    ModernTemperatureComparePressure:'Surface pressure of the selected Compare model; not shared across A/B.',
    ModernVisibilityRange:'Visibility range for the 5% contrast threshold; haze does not change ray paths.',
    ModernModelVisibilityRange:'Shared Compare haze visibility range, applied equally to A and B.'
  };
  var objectHelp={
    NObjects:'Number of objects in this group.',ObjType:'Selects the actual 3D object shape, not just its appearance: tower, ship, measuring rod or Bedford marker.',
    ObjDist:'Along-surface distance to the first object in metres.',
    ObjDeltaDist:'Along-surface separation of consecutive objects in metres.',
    ObjSidePos:'Lateral offset from the observation axis, in metres.',
    ObjSize:'Height or characteristic size of each object, in metres.',
    ObjSideType:'How lateral offset varies across the group.',
    ObjSideVar:'Magnitude of the lateral offset variation, in metres.',
    ObjSizeType:'How object size varies across the group.',
    ObjSizeVar:'Amplitude of object size variation relative to its baseline.'
  };
  function addHelpToLabel(label,message){
    if(!label||!message||label.querySelector('.modern-help'))return;
    var help=document.createElement('button');
    help.type='button';help.className='modern-help';help.textContent='?';
    help.setAttribute('aria-label','Help: '+label.textContent.trim());
    help.setAttribute('data-tip',message);
    help.addEventListener('click',function(){help.focus();});
    label.appendChild(help);
  }
  function bindHelp(){
    if(typeof document.querySelector!=='function'||typeof document.createElement!=='function')return;
    Object.keys(fieldHelp).forEach(function(id){
      var field=el(id);
      if(!field)return;
      var label=document.querySelector('label[for="'+id+'"]');
      if(label)addHelpToLabel(label,fieldHelp[id]);
    });
    for(var i=0;i<2;i++)Object.keys(objectHelp).forEach(function(key){
      var id='ModernObject'+i+key;
      var label=document.querySelector('label[for="'+id+'"]');
      if(label)addHelpToLabel(label,objectHelp[key]);
    });
  }
  function bind(){
    bindStudioDraftPersistence();
    bindStudioLibrary();
    bindStudioPlayback();
    bindCameraDrag();
    bindCameraKeyboard();
    bindCameraPositions();
    bindCameraSequence();
    bindObjectFields();
    bindSettingsTabs();
    bindHelp();
    bindDisplayPanels();
    bindCompareEditor();
    bindShimmerControls();
    bindVisibilityControls();
    bindTemperatureControls();
    bindGpuDiagnostics();
    bindPerformanceDiagnostics();
    bindGeometryBackend();
    bindOpticalQuality();
    bindPreviewDetail();
    bindApplicationPreferences();
    bindPersistence();
    bindNumber('ModernHeight',function(v){adapter?adapter.setCamera(model,'Height',v):model.Height=v;},'observer height');
    if(typeof document.querySelector==='function'&&document.querySelector('#ModernCameraEast'))
    bindNumber('ModernCameraEast',function(v){
      var next=Object.assign({},captureCameraPose(),{CameraEast:adapter?adapter.finiteNumber(v,-1e7,1e7):Number(v)});
      checkedCameraPosition(next);model.CameraEast=next.CameraEast;
    },'camera east');
    if(typeof document.querySelector==='function'&&document.querySelector('#ModernCameraNorth'))
    bindNumber('ModernCameraNorth',function(v){
      var next=Object.assign({},captureCameraPose(),{CameraNorth:adapter?adapter.finiteNumber(v,-1e7,1e7):Number(v)});
      checkedCameraPosition(next);model.CameraNorth=next.CameraNorth;
    },'camera north');
    bindNumber('ModernFocal',function(v){adapter?adapter.setCamera(model,'FocalLengthField',v):model.FocalLengthField=v;},'focal length');
    bindNumber('ModernPan',function(v){adapter?adapter.setCamera(model,'Pan',v):model.Pan=v;},'pan');
    bindNumber('ModernNick',function(v){adapter?adapter.setCamera(model,'Nick',v):model.Nick=v;},'nick');
    bindNumber('ModernRoll',function(v){adapter.setCamera(model,'Roll',v);},'roll');
    bindNumber('ModernViewAngle',function(v){adapter.setCamera(model,'ViewAngleField',v);},'field of view');
    bindNumber('ModernRadiusKm',function(v){adapter.setRadiusKm(model,v);},'radius',true,
      function(){return model.rEarth/1000;});
    bindNumber('ModernOcclusion',function(v){
      state.occlusionRadius=scaleRadiusMetres(v);
    },'refraction scale radius',true,function(){return state.occlusionRadius/1000;});
    var aim=el('ModernCameraAim');aim.addEventListener('change',function(){
      if(adapter)applyField(function(v){adapter.setAim(model,v);},this.value,'camera aim');
      else {model.viewcenterHorizon=Number(this.value);redraw();}
    });
    el('ModernAtmosphere').addEventListener('change',function(){
      state.atmosphere=this.value;markCustom();refreshLabels();redraw();
    });
    el('ModernGrid').addEventListener('change',function(){model.showGrid=this.checked?1:0;markCustom();redraw();});
    var curvature=root.CurvaturePhysicalCurvature;
    var slider=el('ModernCurvature');
    slider.value=String(curvature.modelStep(model));
    slider.addEventListener('input',function(){
      curvature.applyStep(model,Number(slider.value));markCustom();refreshLabels();scheduleRedraw();
    });
    slider.addEventListener('change',redraw);
    var flat=el('ModernFlat');if(flat)flat.addEventListener('change',function(){
      if(this.checked)model.showModel=2;
      else {model.showModel=1;if(!Number.isFinite(model.rEarth))model.rEarth=6371000;}
      markCustom();redraw();
    });
    el('ModernEarth').addEventListener('click',function(){
      curvature.resetEarth(model);markCustom();redraw();
    });
    var preset=el('ModernPreset');if(preset)preset.addEventListener('change',function(){
      if(this.value!=='custom')selectPreset(this.value);
    });
    var reset=el('ModernResetPreset');if(reset)reset.addEventListener('click',function(){selectPreset(state.preset);});
    el('ModernRender').addEventListener('click',redraw);
    el('ModernSceneTab').addEventListener('click',function(){setMode('scene');});
    el('ModernCompareTab').addEventListener('click',function(){setMode('compare');});
    var animationTab=newUiEl('ModernAnimationTab');
    if(animationTab)animationTab.addEventListener('click',function(){setMode('animation');});
    var chooseSnapshots=newUiEl('ModernAnimationChooseSnapshots');
    if(chooseSnapshots)chooseSnapshots.addEventListener('click',function(){toggleAnimationPicker(!studioPickerOpen);});
    var demosTab=newUiEl('ModernDemosTab');
    if(demosTab)demosTab.addEventListener('click',function(){setMode('demos');});
    el('ModernBackToScene').addEventListener('click',function(){setMode('scene');});
    bindHistory();
    if(root.CurvatureModernDemos)root.CurvatureModernDemos.init();
    function finishStartup(remoteRecord,remoteError){
      var restored=restoreExperiment(remoteRecord,remoteError);
      if(!initialCamera)initialCamera=captureCameraPose();
      syncNumericInputs();
      // Explicit shared URLs retain their Scene/Compare mode. Local working
      // sessions use the stored UI workspace choice independently of physics.
      var params=typeof URLSearchParams==='function'?
        new URLSearchParams(root.location&&root.location.search||''):{get:function(){return null;}};
      if(!persistence.explicitUrl){
        if(['scene','compare','demos'].includes(workspaceState.mode))state.mode=workspaceState.mode;
        if(workspaceState.compareModel)state.compareSelected=workspaceState.compareModel;
      }
      var explicitMode=params.get('mode'),explicitTab=params.get('tab'),explicitModel=params.get('model');
      if(['scene','compare','demos'].includes(explicitMode))state.mode=explicitMode;
      if(['A','B'].includes(explicitModel))state.compareSelected=explicitModel;
      if(settingGroups.includes(explicitTab))workspaceState[state.mode==='compare'?'compareTab':'sceneTab']=explicitTab;
      if(state.mode==='compare'||state.mode==='demos'||explicitMode==='scene')setMode(state.mode,false);
      else {applyWorkspaceSections();
        if(typeof document.querySelector==='function')activateSettings(workspaceState.sceneTab,false,false);
        redraw();}
      if(!persistence.explicitUrl&&workspaceState.mode==='animation')setMode('animation',false);
      if(restored||state.compareConfig)syncCompareEditor();
      // Only user edits after complete restore are eligible for autosave.
      // Initial model construction must not overwrite either storage copy.
      persistence.ready=true;
      updateSnapshotSaveAction();
      resetHistoryBaseline();
    }
    bindWorkingSessionLifecycle();
    if(sessionAutosave&&root.indexedDB&&!isExplicitSharedExperiment()){
      persistenceStatus('Restoring working session…');
      sessionAutosave.read(root.indexedDB).then(function(record){
        finishStartup(record,null);
      },function(error){finishStartup(null,error);});
    }else finishStartup(null,null);
  }
  if(typeof root.xOnLoad==='function')root.xOnLoad(bind);
  else root.addEventListener('load',bind);
  root.CurvatureModernApp={getModel:function(){return model;},getMode:function(){return state.demosActive?'demos':state.mode;},
    getWorkspaceMode:function(){return animationWorkspaceOpen?'animation':state.demosActive?'demos':state.mode;},
    getLastRender:function(){return state.last;},getPreset:function(){return state.preset;},
    registerCompareGraph:registerCompareGraph,drawCompare:drawCompare,
    getCompareModels:function(){return state.comparePair;},
    getCompareLast:function(){return state.compareLast;},
    getCompareConfig:function(){return state.compareConfig;},
    getRenderProfile:function(){return renderProfiler?renderProfiler.summary():null;},
    resetRenderProfile:function(){if(renderProfiler)renderProfiler.clear();},
    getPerformanceSnapshot:performanceSnapshot,
    getCameraInteraction:function(){return cameraInteraction;},
    getCameraPositions:function(){return cameraPositions.map(function(p){return {id:p.id,name:p.name,camera:Object.assign({},p.camera)};});},
    getCameraSequence:function(){return cameraSequenceApi?cameraSequenceApi.validate(cameraSequence):[];},
    getCameraAnimation:function(){return cameraTransition?{playing:true,durationMs:cameraTransition.durationMs}: {playing:false};},
    getCameraTransition:function(){return cameraTransition?{playing:true,durationMs:cameraTransition.durationMs}: {playing:false};},
    getNavigationPrefs:function(){return Object.assign({},navigationPrefs);},
    getHistoryStore:function(){return experimentHistory;},
    getStudioPlayback:function(){return studioPlayback?studioPlayback.status():null;},
    getAnimationStudioDraft:function(){return studioDraftAutosave&&studioDraft?
      studioDraftAutosave.checkpoint({draft:studioDraft,selectedKey:studioSelectedKey,
        quality:studioPlaybackQuality,prepared:!!studioPrepared,
        positionMs:studioPlayback?studioPlayback.status().positionMs:0},
        Math.max(1,studioDraftSavedAt||Date.now())):null;},
    getAnimationStudioProject:function(){return studioPrepared&&studioProjects?
      studioProjects.validate(studioPrepared):null;},
    getWorkspaceState:function(){return {mode:animationWorkspaceOpen?'animation':state.demosActive?'demos':state.mode,
      sceneTab:workspaceState.sceneTab,compareTab:workspaceState.compareTab,
      compareModel:state.compareSelected,sections:Object.assign({},workspaceState.sections)};},
    // Atmospheric presentation remains independently inspectable through DevTools.
    getAtmosphericPresentation:function(){return atmosphericPresentation;},
    // DevTools API remains available alongside the 138.3 Atmosphere controls.
    getAtmosphericShimmer:function(){return atmosphericShimmer;},
    getGpuCapabilities:function(){return gpuSnapshot;},
    getGeometryBackend:function(){return state.geometryBackend;},
    getOpticalQuality:function(){return state.opticalQuality;},
    getEffectiveOpticalQuality:effectiveOpticalQuality,
    getPreviewDetail:function(){return state.previewDetail;},
    getPreviewStride:function(scope){return previewStride(scope||'Scene');}};
}(window));

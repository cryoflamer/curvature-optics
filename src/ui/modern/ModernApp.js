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
  var persistence={ready:false,explicitUrl:false,timer:null};
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
  var displayPanels={advanced:false,diagnostics:false,gpu:false,profiler:false};
  function preferencesStorage(){
    try{return root.localStorage||null;}catch(error){return null;}
  }
  if(applicationPreferences){
    var remembered=applicationPreferences.read(preferencesStorage());
    state.opticalQuality=remembered.opticalQuality;
    state.previewDetail=remembered.previewDetail;
    state.geometryBackend=remembered.geometryBackend;
    displayPanels=Object.assign({},remembered.displayPanels);
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
        geometryBackend:state.geometryBackend,navigation:navigationPrefs,displayPanels:displayPanels
      }))preferencesStatus('Browser storage unavailable; changes will not survive reload.',true);
      else preferencesStatus('Application preferences saved in this browser.',false);
    }catch(error){preferencesStatus('Cannot save application preferences: '+error.message,true);}
  }
  function bindDisplayPanels(){
    var entries=[['advanced','ModernDisplayAdvanced'],
      ['diagnostics','ModernDisplayDiagnostics'],['gpu','ModernDisplayGpu'],
      ['profiler','ModernDisplayProfiler']];
    entries.forEach(function(entry){
      var node=geometryUi(entry[1]);if(!node)return;
      node.open=displayPanels[entry[0]]===true;
      node.addEventListener('toggle',function(){
        if(displayPanels[entry[0]]===node.open)return;
        displayPanels[entry[0]]=node.open;
        saveApplicationPreferences();
      });
    });
  }
  function bindApplicationPreferences(){
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
      navigationPrefs=navigation?navigation.settings(defaults.navigation):defaults.navigation;
      displayPanels=Object.assign({},defaults.displayPanels);
      [['advanced','ModernDisplayAdvanced'],['diagnostics','ModernDisplayDiagnostics'],
        ['gpu','ModernDisplayGpu'],['profiler','ModernDisplayProfiler']].forEach(function(entry){
        var node=geometryUi(entry[1]);if(node)node.open=false;
      });
      [['ModernOpticalQuality',state.opticalQuality],['ModernPreviewDetail',state.previewDetail],
        ['ModernGeometryBackend',state.geometryBackend],['ModernCameraMoveSpeed',navigationPrefs.speed],
        ['ModernCameraTurnRate',navigationPrefs.turnRate],['ModernCameraWheelStep',navigationPrefs.wheelStep]
      ].forEach(function(entry){var node=geometryUi(entry[0]);if(node)node.value=String(entry[1]);});
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
  function storeExperiment(){
    if(!persistence.ready||!experiments||!root.location)return;
    var current;
    try{current=experimentSnapshot();}
    catch(error){persistenceStatus('Cannot save experiment: '+error.message,true);return;}
    var errors=[],saved=false;
    try{
      if(root.localStorage){root.localStorage.setItem(experiments.STORAGE_KEY,JSON.stringify(current));saved=true;}
    }catch(error){errors.push('browser storage: '+error.message);}
    // Do not rewrite an explicitly shared URL: it remains the reproducible
    // incoming experiment until the user explicitly copies a new link.
    if(!persistence.explicitUrl&&root.history&&root.location.href){
      try{
        var url=new URL(root.location.href);
        if(!url.searchParams.has('state')){
          root.history.replaceState(root.history.state,'',experiments.urlWithExperiment(url.href,current));
        }
      }catch(error){errors.push('URL: '+error.message);}
    }
    if(errors.length)persistenceStatus('Partial save: '+errors.join('; '),true);
    else if(saved)persistenceStatus('Experiment saved locally');
  }
  function scheduleExperimentSave(){
    if(!persistence.ready||!experiments||!root.location)return;
    if(persistence.timer!==null)clearTimeout(persistence.timer);
    persistence.timer=setTimeout(function(){persistence.timer=null;storeExperiment();},550);
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
  function restoreExperiment(){
    if(!experiments||!root.location)return false;
    var params=new URLSearchParams(root.location.search||'');
    persistence.explicitUrl=params.has(experiments.PARAM);
    var data=null,source='';
    try{
      if(persistence.explicitUrl){data=experiments.readUrl(root.location.search);source='URL';}
      else if(root.localStorage){
        var saved=root.localStorage.getItem(experiments.STORAGE_KEY);
        if(saved){data=experiments.validate(JSON.parse(saved));source='local storage';}
      }
      if(!data)return false;
      applyExperiment(data);
      persistenceStatus('Restored experiment from '+source);
      return true;
    }catch(error){
      // In particular, a broken explicit URL must never load an unrelated
      // local experiment: the visible scene stays at the documented default.
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
    if(persistence.timer!==null){clearTimeout(persistence.timer);persistence.timer=null;}
    try{if(root.localStorage)root.localStorage.removeItem(experiments.STORAGE_KEY);}
    catch(error){persistenceStatus('Could not clear saved experiment: '+error.message,true);return;}
    if(root.location&&root.location.href){
      var url=new URL(root.location.href);
      url.searchParams.delete(experiments.PARAM);url.searchParams.delete('state');
      url.searchParams.set('ui','modern');
      if(typeof root.location.assign==='function')root.location.assign(url.href);
      else persistenceStatus('Reload this page to restore the default experiment');
    }
  }
  function bindPersistence(){
    if(!experiments)return;
    var copy=el('ModernCopyExperiment');if(copy)copy.addEventListener('click',copyExperimentUrl);
    var reset=el('ModernResetExperiment');if(reset)reset.addEventListener('click',resetExperiment);
  }
  function bindLibrary(){
    var library=root.CurvatureModernExperimentLibrary;
    if(!library)return;
    var panel=el('ModernExperimentLibraryPanel'),select=el('ModernLibrarySelect');
    var name=el('ModernLibraryName'),file=el('ModernLibraryFile');
    function status(message,error){var node=el('ModernLibraryStatus');if(node){node.textContent=message;node.classList.toggle('is-error',!!error);}}
    function execute(action){try{action();}catch(error){status(error.message,true);}}
    function refresh(selected){
      var entries=library.read(root.localStorage);
      select.textContent='';
      var placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose saved experiment';select.appendChild(placeholder);
      entries.forEach(function(entry){var option=document.createElement('option');option.value=entry.name;option.textContent=entry.name;select.appendChild(option);});
      if(selected&&entries.some(function(e){return e.name===selected;}))select.value=selected;
      return entries;
    }
    el('ModernLibraryToggle').addEventListener('click',function(){
      panel.hidden=!panel.hidden;this.setAttribute('aria-expanded',String(!panel.hidden));
      if(!panel.hidden)execute(function(){refresh();});
    });
    el('ModernLibraryClose').addEventListener('click',function(){panel.hidden=true;el('ModernLibraryToggle').setAttribute('aria-expanded','false');});
    select.addEventListener('change',function(){if(select.value)name.value=select.value;});
    el('ModernLibrarySave').addEventListener('click',function(){execute(function(){
      cancelEdits();var current=experimentSnapshot(),label=library.nameOf(name.value);
      var existing=library.read(root.localStorage).some(function(e){return e.name.toLocaleLowerCase()===label.toLocaleLowerCase();});
      if(existing&&(!root.confirm||!root.confirm('Replace saved experiment "'+label+'"?')))return;
      library.save(root.localStorage,label,current);refresh(label);status('Saved: '+label);
    });});
    el('ModernLibraryLoad').addEventListener('click',function(){execute(function(){
      var entry=library.read(root.localStorage).find(function(e){return e.name===select.value;});
      if(!entry)throw RangeError('Select an experiment to load');
      cancelEdits();cancelPending();applyExperiment(entry.experiment);
      syncNumericInputs();syncCompareEditor();setMode(state.mode);
      scheduleExperimentSave();status('Loaded: '+entry.name);
    });});
    el('ModernLibraryDelete').addEventListener('click',function(){execute(function(){
      if(!select.value)throw RangeError('Select an experiment to delete');
      var label=select.value;
      if(!root.confirm||!root.confirm('Delete saved experiment "'+label+'"?'))return;
      library.remove(root.localStorage,label);refresh();status('Deleted: '+label);
    });});
    el('ModernLibraryExport').addEventListener('click',function(){execute(function(){
      cancelEdits();var data=library.exportJson(experimentSnapshot());
      var url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
      var anchor=document.createElement('a');anchor.href=url;anchor.download='curvature-experiment.json';
      document.body.appendChild(anchor);anchor.click();anchor.remove();
      setTimeout(function(){URL.revokeObjectURL(url);},1000);status('Current experiment exported as JSON');
    });});
    el('ModernLibraryImport').addEventListener('click',function(){file.value='';file.click();});
    file.addEventListener('change',function(){
      var picked=file.files&&file.files[0];if(!picked)return;
      if(picked.size>200000){status('JSON file too large',true);return;}
      picked.text().then(function(text){execute(function(){
        var experiment=library.importJson(text);
        // Import applies after full validation, but does not silently overwrite named entries.
        cancelEdits();cancelPending();applyExperiment(experiment);syncNumericInputs();syncCompareEditor();setMode(state.mode);
        scheduleExperimentSave();status('Imported JSON into current experiment; save it with a name to keep it');
      });},function(error){status('Cannot read JSON: '+error.message,true);});
    });
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
    var wrap=el('ModernOcclusionWrap');
    if(wrap)wrap.hidden=!['inverse-spherical','exponential-occlusion','profile-transition','inverse-temperature'].includes(state.atmosphere);
    showLegacyOption('ModernAtmosphere',state.atmosphere);
    renderAtmosphereDescription('ModernAtmosphereInfo',state.atmosphere);
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
      state.last=null;
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
      state.compareLast[side]=null;
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
        cancelEdits();state.compareSelected=side;syncCompareEditor();scheduleExperimentSave();
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
  function saveNavigationPrefs(){
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
          var metrics=measuredGraphRedraw(graph);
          showComputeTiming('Scene rendered · '+Math.round(metrics.totalMs)+' ms');
          observePreviewFrame('Scene',metrics.totalMs,true);
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
    cancelPending();
    updateStatus('Updating physical optics after parameter change…');
    state.timer=setTimeout(function(){state.timer=null;redraw();},300);
  }
  function setMode(mode){
    stopCameraTransition(false,'Transition interrupted by workspace switch',false);
    stopAutoCameraPreview();
    if(mode!=='scene'&&mode!=='compare'&&mode!=='demos')throw RangeError('Invalid Modern UI mode');
    stopCameraKeyboard(true);abortCameraDrag();cancelEdits();stopShimmerFrame();
    if(atmosphericShimmer)atmosphericShimmer.resetClock();
    var demos=root.CurvatureModernDemos;
    var demosActive=mode==='demos';
    var workspace=newUiEl('ModernWorkspace');
    if(workspace)workspace.classList.toggle('is-demos',demosActive);
    var demosPanel=newUiEl('ModernDemosPanel');if(demosPanel)demosPanel.hidden=!demosActive;
    var demosTab=newUiEl('ModernDemosTab');
    if(demosTab){demosTab.classList.toggle('is-active',demosActive);
      demosTab.setAttribute('aria-pressed',String(demosActive));}
    if(demosActive){
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
    if(typeof document.querySelector==='function')activateSettings(activeSettings,false);
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
    try{action(raw);markCustom();redraw();return true;}
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
  function objectFieldMarkup(i){
    var fields=[
      ['NObjects','Count','number',0,200,1],['ObjType','Object type','select'],
      ['ObjDist','Start distance (m)','number',0,10000000,'any'],
      ['ObjDeltaDist','Spacing (m)','number',0.001,10000000,'any'],
      ['ObjSidePos','Lateral offset (m)','number',-10000000,10000000,'any'],
      ['ObjSize','Object height / size (m)','number',0.001,1000000,'any'],
      ['ObjSideType','Offset variation','select'],
      ['ObjSideVar','Offset variation amplitude (m)','number',-10000000,10000000,'any'],
      ['ObjSizeType','Size variation','select'],
      ['ObjSizeVar','Size variation amplitude (fraction)','number',-10000,10000,'any']
    ];
    var typeOptions=[['3','Transmission tower'],['2','Ship'],['1','Measuring rod'],['0','Bedford marker']];
    var variationOptions=[['0','Linear'],['1','Alternating'],['2','Random'],['3','Cosine'],['4','Sine']];
    return '<div class="modern-object-grid">'+fields.map(function(row){
      var key=row[0],id='ModernObject'+i+key;
      var inner=row[2]==='select'?'<select id="'+id+'" data-group="'+i+'" data-field="'+key+'">'+
        (key==='ObjType'?typeOptions:variationOptions).map(function(o){return '<option value="'+o[0]+'">'+o[1]+'</option>';}).join('')+'</select>':
        '<input id="'+id+'" data-group="'+i+'" data-field="'+key+'" type="number" min="'+row[3]+'" max="'+row[4]+'" step="'+row[5]+'">';
      return '<div class="modern-field"><label for="'+id+'">'+row[1]+'</label>'+inner+'</div>';
    }).join('')+'</div>';
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
  function activateSettings(name,focus){
    if(!settingGroups.includes(name))return;
    activeSettings=name;
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
    activateSettings('Camera',false);
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
    ModernOcclusion:'Refraction scale radius R in kilometres for the engineered n(h) profile. Independent of the geometric surface radius; stored internally in metres.'
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
    var demosTab=newUiEl('ModernDemosTab');
    if(demosTab)demosTab.addEventListener('click',function(){setMode('demos');});
    el('ModernBackToScene').addEventListener('click',function(){setMode('scene');});
    bindLibrary();
    if(root.CurvatureModernDemos)root.CurvatureModernDemos.init();
    var restored=restoreExperiment();
    if(!initialCamera)initialCamera=captureCameraPose();
    syncNumericInputs();
    if(restored){
      // Apply the restored workspace without touching the physics itself.
      if(state.mode==='compare')setMode('compare');
      else redraw();
      syncCompareEditor();
    }else redraw();
    persistence.ready=true;
  }
  if(typeof root.xOnLoad==='function')root.xOnLoad(bind);
  else root.addEventListener('load',bind);
  root.CurvatureModernApp={getModel:function(){return model;},getMode:function(){return state.demosActive?'demos':state.mode;},
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

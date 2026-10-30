/* Modern UI: separate HTML shell over one CurveAppClass and one shared Physical
 * renderer. Scene controls (131) never read/drive the Legacy DOM.
 * GraphX3DX is created at the parser's document.write position.
 */
(function(root){
  'use strict';
  var state={mode:'scene',atmosphere:'standard',occlusionRadius:6371000,
    preset:'pontchartrain',timer:null,frame:null,graph:null,last:null,editTimeouts:{},
    curvatureCommitTimer:null,curvaturePending:false,
    compareGraphs:{A:null,B:null},comparePair:null,compareLast:{A:null,B:null},
    geometryBackend:'canvas',opticalSample:null,compareEyeLevel:false,compareHorizon:true,horizonCache:{Scene:null,A:null,B:null},compareConfig:null,compareSelected:'A',compareCache:{A:null,B:null},
    compareGpuProbe:false,probeGeneration:0,probeBusy:false,probeLast:null,
    probeField:null,probeFrameLast:null,probeCapture:null,probeCapturedResults:null,
    probeForceColdA:false};
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
  function bindGeometryBackend(){
    var select=geometryUi('ModernGeometryBackend');
    if(!select)return;
    select.value=state.geometryBackend;
    select.addEventListener('change',function(){
      state.geometryBackend=select.value==='webgl2'?'webgl2':'canvas';
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
  var model=new root.CurveAppClass();
  Object.assign(model,{
    DemoText:'Lake Pontchartrain Transmission Line',Description:'85 transmission towers across Lake Pontchartrain',
    Height:15,FocalLengthField:2000,Roll:0,Nick:0.0121,Pan:0.0464,
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
    var config=state.compareConfig||compareState.initial(model,state.atmosphere,state.occlusionRadius);
    return experiments.capture(model,{
      atmosphere:state.atmosphere,occlusionRadius:state.occlusionRadius,
      preset:(el('ModernPreset')&&el('ModernPreset').value)||state.preset,
      resetPreset:state.preset
    },config,{mode:state.mode,eyeLevel:state.compareEyeLevel,
      horizon:state.compareHorizon,selected:state.compareSelected,
      gpuProbe:state.compareGpuProbe,probeTargets:Number((probeUi('ModernGpuProbeCount')||{}).value)||256});
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
    var data=experiments.validate(experiment),scene=data.scene;
    // All values are prevalidated as one transaction before touching CurveApp.
    Object.keys(scene.camera).forEach(function(key){model[key]=scene.camera[key];});
    Object.keys(scene.objects).forEach(function(key){model[key]=scene.objects[key].slice();});
    model.showModel=scene.surface.showModel;model.rEarth=scene.surface.rEarth;
    model.showGrid=scene.showGrid?1:0;
    model.DemoText=scene.title;model.Description=scene.description;
    state.atmosphere=scene.atmosphere;state.occlusionRadius=scene.occlusionRadius;
    state.preset=scene.resetPreset;
    state.compareConfig={A:data.compare.A,B:data.compare.B,preset:data.compare.preset};
    state.compareSelected=data.compare.selected;
    state.compareEyeLevel=data.display.eyeLevel;state.compareHorizon=data.display.horizon;
    state.mode=data.display.mode;
    state.compareGpuProbe=data.display.gpuProbe;
    var kind=probeUi('ModernCompareKind');if(kind)kind.value=state.compareGpuProbe?'gpu-probe':'models';
    var probeGroup=probeUi('ModernGpuCompareProbe');if(probeGroup)probeGroup.hidden=!state.compareGpuProbe;
    var count=probeUi('ModernGpuProbeCount');if(count)count.value=String(data.display.probeTargets);
    var bTab=probeUi('ModernModelTabB');if(bTab)bTab.disabled=state.compareGpuProbe;
    var pairPreset=probeUi('ModernPairPreset');if(pairPreset)pairPreset.disabled=state.compareGpuProbe;
    if(state.compareGpuProbe)state.compareSelected='A';
    state.probeLast=null;state.probeField=null;state.probeFrameLast=null;
    state.probeGeneration++;
    model.Update();
    var select=el('ModernPreset');if(select)select.value=scene.preset;
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
    if(wrap)wrap.hidden=!['inverse-spherical','exponential-occlusion'].includes(state.atmosphere);
    showLegacyOption('ModernAtmosphere',state.atmosphere);
    renderAtmosphereDescription('ModernAtmosphereInfo',state.atmosphere);
    var fov=el('ModernViewAngle');if(fov&&Number.isFinite(model.ViewAngle))
      fov.value=String(Number(model.ViewAngle.toFixed(4)));
  }
  function draw(g){
    if(state.mode!=='scene')return;
    try{
      var startedAt=profileNow();
      var separateDecorations=!!(atmosphericPresentation&&atmosphericPresentation.enabled('Scene'));
      var result=root.CurvatureMainCanvasRenderer.renderPhysical(g,model,{
        atmosphere:state.atmosphere,occlusionRadius:state.occlusionRadius,interactive:false,
        deferDecorations:separateDecorations,geometryBackend:state.geometryBackend,
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
      var sceneOptions={atmosphere:state.atmosphere,occlusionRadius:state.occlusionRadius};
      if(state.compareEyeLevel&&guideGraph&&guideGraph.Canvas)drawCompareEyeLevel(guideGraph,model);
      if(state.compareHorizon)drawCompareHorizon('Scene',guideGraph,model,sceneOptions);
      scheduleShimmerFrame();
      var finishedAt=profileNow();
      if(renderProfiler)renderProfiler.recordRender({viewport:'Scene',
        totalMs:finishedAt-startedAt,rendererMs:renderedAt-startedAt,
        overlayMs:finishedAt-renderedAt,stages:result.timings,
        backend:result.geometryBackend,cacheReused:result.cacheReused,
        opticalSample:state.opticalSample,opticalStages:result.opticalStages,
        opticalWork:result.opticalWork,fieldStats:result.fieldStats});
      var fullStatus=(result.cacheReused?'Cached optics':'Physical optics')+
        ' · '+result.drawn+' outline pieces · '+result.fillTriangles+
        ' fill triangles · '+result.unresolved+' unresolved · '+(result.geometryBackend||'Canvas 2D')+
        (result.geometryFallback?' (GPU fallback: '+result.geometryFallback+')':'')+
        (result.timings?' · '+Math.round(result.timings.totalMs)+' ms':'');
      var statusNode=el('ModernStatus');if(statusNode)statusNode.title=fullStatus;
      updateStatus(fullStatus,result.unresolved>0);
    }catch(error){
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
      var spec=state.compareConfig&&(state.compareGpuProbe?state.compareConfig.A:state.compareConfig[side]);
      var options={atmosphere:spec?spec.atmosphere:state.atmosphere,
        occlusionRadius:spec?spec.occlusionRadius:state.occlusionRadius,interactive:false,
        geometryBackend:state.geometryBackend,forceColdOptics:state.opticalSample==='cold'||
          (state.probeForceColdA&&side==='A')};
      // Separate optical sessions prevent A and B from evicting each other's
      // keyed ray fields as two viewports are rendered in succession.
      if(state.compareCache[side])options.cacheSession=state.compareCache[side];
      if(state.compareGpuProbe&&side==='A'&&state.probeCapture){
        options.onExactTarget=function(d,h){state.probeCapture.push([d,h]);};
        options.onExactResult=function(d,h,result){
          if(state.probeCapturedResults)state.probeCapturedResults.push({d:d,h:h,result:result});
        };
      }
      if(state.compareGpuProbe&&side==='B'&&state.probeField)
        options.experimentalRayField=state.probeField;
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
      if(state.compareHorizon)drawCompareHorizon(side,guideGraph,m,options);
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
        var gpuCounts=result.fieldStats&&result.fieldStats.experimentalGpu;
        var replayControl=state.probeField&&state.probeField.kind==='cpu-replay-control';
        var firstGrid=state.probeField&&state.probeField.fullCoverageGrid;
        node.textContent=(replayControl?'CPU replay control':firstGrid?'GPU-first approximate optics':
          gpuCounts?'GPU-assisted optics':'Computed optics')+
          (result.cacheReused?' (cached)':'')+' · '+result.drawn+
          ' contours · '+result.fillTriangles+' fills · '+result.unresolved+' unresolved'+
          (gpuCounts?' · '+(replayControl?gpuCounts.replayHits+' CPU replay lookups':gpuCounts.gpuHits+' GPU lookups')+
            ' / '+gpuCounts.cpuFallbackRequests+' CPU fallbacks':'');
        node.classList.toggle('is-error',!!result.unresolved);
      }
    }catch(error){
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
    var arguments_={geometry:geometry,radius:m.rEarth,observerHeight:m.Height,
      atmosphere:options.atmosphere,profileOptions:{occlusionRadius:options.occlusionRadius}};
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
  // Explicit Compare-only diagnostic: both real full frames remain CPU. The
  // WebGPU path supplies angular point samples, not a painter or silhouette.
  function probeUi(id){return typeof document.querySelector==='function'?document.querySelector('#'+id):null;}
  function probeStatus(message){var node=probeUi('ModernGpuProbeStatus');if(node)node.textContent=message;}
  function probeCanvas(which,rows,model){
    var canvas=probeUi('ModernGpuProbeCanvas'+which);
    if(!canvas||!canvas.getContext)return;
    var ctx=canvas.getContext('2d');if(!ctx)return;
    var width=canvas.width,height=canvas.height;
    ctx.clearRect(0,0,width,height);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
    ctx.strokeStyle='#e6edf5';ctx.beginPath();ctx.moveTo(width/2,0);ctx.lineTo(width/2,height);
    ctx.moveTo(0,height/2);ctx.lineTo(width,height/2);ctx.stroke();
    var fov=model.camViewAngle,aspect=model.deviceRatio;
    var halfV=Math.tan(fov/2)/Math.sqrt(1+aspect*aspect);
    var halfH=halfV*aspect;
    var pan=model.Pan*Math.PI/180,nick=model.Nick*Math.PI/180;
    rows.forEach(function(row){
      var angle=which==='CPU'?row.cpuAngle:row.gpuAngle;
      var status=which==='CPU'?row.cpu:row.gpu;
      if(!Number.isFinite(angle)||!Number.isFinite(row.azimuth))return;
      var x=width/2+(width/2)*Math.tan(row.azimuth-pan)/halfH;
      var y=height/2-(height/2)*Math.tan(angle-nick)/halfV;
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=width||y>=height)return;
      ctx.beginPath();ctx.arc(x,y,2,0,2*Math.PI);
      ctx.fillStyle=status==='visible'?'#16754a':status==='blocked'?'#8a9bae':'#d39427';ctx.fill();
      if(row.cpu!==row.gpu){ctx.strokeStyle='#ce3c40';ctx.lineWidth=1.4;ctx.stroke();}
    });
  }
  async function runCompareGpuProbe(){
    if(state.probeBusy||state.mode!=='compare'||!state.compareGpuProbe)return;
    var button=probeUi('ModernGpuProbeRun');
    var generation=state.probeGeneration;
    var spec=state.compareConfig&&state.compareConfig.A;
    if(!spec||spec.atmosphere!=='standard'){
      probeStatus('Unavailable: this research shader currently supports Compare probes only for the standard atmosphere.');return;
    }
    var gpu=root.CurvatureWebGPUBatchShooting1412,contract=root.CurvatureOpticalBatchContract1411;
    if(!gpu||!contract||!root.navigator||!root.navigator.gpu){
      probeStatus('WebGPU unavailable; regular CPU Compare remains unchanged.');return;
    }
    var session=null;state.probeBusy=true;
    if(button)button.disabled=true;
    probeStatus('Sampling current physical scene…');
    try{
      var count=Number(probeUi('ModernGpuProbeCount').value);
      var points=compareAdapter.probeTargets(state.comparePair.A,{count:count,atmosphere:spec.atmosphere},{
        composition:root.CurvatureIndependentComposition,
        silhouette:root.CurvatureOpticalTowerSilhouette,surfaces:root.CurvatureSurfaceGeometry});
      if(points.points.length<8)throw Error('At least eight usable physical object vertices are required');
      var request={branch:contract.BRANCH,geometry:points.geometry,radius:points.radius,
        observerHeight:points.observerHeight,atmosphere:points.atmosphere,
        controls:{step:50,targetTolerance:0.005,eventSubsteps:8},
        targets:points.points.map(function(p){return p.target;})};
      gpu.checked(request);
      // CPU timings cover the exact same targets as the GPU, not the physical
      // frame's adaptive ray field. GPU includes readback; setup is separate.
      var began=profileNow(),cpu=await contract.solveCpuBatch(request),cpuMs=profileNow()-began;
      session=await gpu.createSession(request.targets.length,null,{refinement:'residual-stop'});
      var result=await session.solve(request,{warmRepeats:2});
      if(generation!==state.probeGeneration||state.mode!=='compare'||!state.compareGpuProbe)return;
      var report=compareAdapter.probeReport(points.points,cpu,result.response,1080);
      // Independent f64 ground-event replay runs AFTER GPU measurement. It
      // must never be included in the GPU speedup or treated as a frame diff.
      var groundReview=compareAdapter.probeGroundReview(request,cpu,result.response,
        root.CurvatureRayTracer,64);
      state.probeLast={version:'140.12.8',source:'current Compare model A physical object vertices',
        reference:'CPU f64',candidate:'experimental GPU f32',geometry:points.geometry,
        atmosphere:spec.atmosphere,sourcePointCount:points.sourcePointCount,
        samples:report.count,cpuMs:cpuMs,gpuSetupMs:session.setupMs,
        cpuRenderedFrameAms:state.compareLast.A&&state.compareLast.A.timings&&state.compareLast.A.timings.totalMs,
        cpuRenderedFrameBms:!state.probeField&&state.compareLast.B&&state.compareLast.B.timings&&state.compareLast.B.timings.totalMs||null,
        gpuAssistedFrameBms:state.probeField&&state.compareLast.B&&state.compareLast.B.timings&&state.compareLast.B.timings.totalMs||null,
        gpuWarmMedianMs:result.timing.gpuWarmMedianMs,gpuFirstBatchMs:result.timing.gpuUploadToReadbackMs,
        sampleReport:report,groundReview:groundReview,actualRenderedImageCompared:false,productionAuthorized:false};
      probeCanvas('CPU',report.rows,state.comparePair.A);
      probeCanvas('GPU',report.rows,state.comparePair.A);
      var warm=result.timing.gpuWarmMedianMs;
      probeStatus(report.count+' physical edge/vertex points · CPU '+cpuMs.toFixed(1)+' ms · WebGPU warm '+
        (warm===null?'not measured':warm.toFixed(1)+' ms')+' · GPU setup '+session.setupMs.toFixed(1)+' ms');
      var metrics=probeUi('ModernGpuProbeMetrics');
      if(metrics)metrics.textContent='Status disagreements: '+report.statusMismatches+
        ' · unresolved: '+report.uncertain+' · angular proxy > 1 px: '+report.overOnePixel+
        ' · independent ground replays: '+groundReview.reviews.filter(function(r){return r.groundReplay.status==='measured';}).length+'/'+groundReview.disagreements+
        ' · max angular proxy shift: '+report.maxAngleProxyShiftPx.toFixed(3)+
        ' px (illustrative 1080px / 45°). Red outlines = status disagreements. '+
        'Not actual raster pixel or silhouette parity. This does not measure full-frame GPU rendering.';
    }catch(error){
      if(generation===state.probeGeneration)probeStatus('Probe unavailable: '+String(error.message||error));
    }finally{
      if(session)session.close();state.probeBusy=false;
      if(button)button.disabled=false;
    }
  }
  // #140.12.10: this is a real B-frame re-render with GPU-sourced optical
  // field values, not a GPU painter. The CPU A frame discovers the adaptive
  // oracle requests; only a bounded subset can be seeded by async WebGPU.
  async function runCompareGpuField(){
    if(state.probeBusy||state.mode!=='compare'||!state.compareGpuProbe)return;
    var spec=state.compareConfig&&state.compareConfig.A;
    if(!spec||spec.atmosphere!=='standard'){
      probeStatus('GPU ray field needs the standard atmosphere. CPU Compare is unchanged.');return;
    }
    var gpu=root.CurvatureWebGPUBatchShooting1412,contract=root.CurvatureOpticalBatchContract1411;
    if(!gpu||!contract||!root.navigator||!root.navigator.gpu||
       !root.CurvatureSurfaceGeometry||!compareAdapter||!compareAdapter.gpuFieldRequest){
      probeStatus('GPU ray field dependencies or WebGPU unavailable. CPU Compare remains active.');return;
    }
    var generation=state.probeGeneration,button=probeUi('ModernGpuFrameRun'),
      probeButton=probeUi('ModernGpuProbeRun'),session=null;
    state.probeBusy=true;
    if(button)button.disabled=true;
    if(probeButton)probeButton.disabled=true;
    state.probeField=null;state.probeFrameLast=null;
    try{
      if(!state.compareGraphs.A||!state.compareGraphs.B)throw Error('Compare canvases unavailable');
      probeStatus('Collecting real adaptive CPU ray-field requests for model A…');
      state.probeCapture=[];
      state.probeCapturedResults=[];
      var started=profileNow();
      // The capture is camera-independent and CPU-only. The cache is bypassed
      // while capturing, so a previously painted A frame cannot hide solves.
      state.compareGraphs.A.Redraw();
      var collected=state.probeCapture;
      var cpuRecords=state.probeCapturedResults;
      state.probeCapture=null;state.probeCapturedResults=null;
      var discoverMs=profileNow()-started;
      if(generation!==state.probeGeneration||state.mode!=='compare'||!state.compareGpuProbe)return;
      var count=Number(probeUi('ModernGpuProbeCount').value);
      var bundle=compareAdapter.gpuFieldRequest(state.comparePair.A,collected,count,
        root.CurvatureSurfaceGeometry,contract.BRANCH);
      if(!bundle.selected.length)throw Error('No usable adaptive ray targets were recorded');
      gpu.checked(bundle.request);
      probeStatus('Computing '+bundle.selected.length+' actual optical field requests asynchronously on WebGPU…');
      session=await gpu.createSession(bundle.selected.length,null,{refinement:'residual-stop'});
      var gpuResult=await session.solve(bundle.request,{warmRepeats:1});
      if(generation!==state.probeGeneration||state.mode!=='compare'||!state.compareGpuProbe)return;
      // Controlled replay: first render B using CPU f64 answers captured
      // during A discovery, but through the identical seeded-field interface.
      // The replay frame is compared to A BEFORE GPU can affect B.
      var cpuReplay=compareAdapter.cpuReplayField(bundle,cpuRecords);
      state.probeField=cpuReplay;
      var replayLabel=el('ModernCompareLabelB');
      if(replayLabel)replayLabel.textContent='CPU f64 · replay control';
      if(state.compareCache.B)state.compareCache.B.clearCache();
      state.compareLast.B=null;
      var replayStarted=profileNow();
      state.compareGraphs.B.Redraw();
      var replayMs=profileNow()-replayStarted;
      if(!state.compareLast.B||!state.compareLast.B.fieldStats||
         !state.compareLast.B.fieldStats.experimentalGpu)
        throw Error('CPU replay B frame did not complete');
      var replayRender=state.compareLast.B;
      var replayStats=cpuReplay.stats();
      if(!replayStats.replayHits)throw Error('No CPU replay seeds were consumed');
      var replayFrameDiff=compareAdapter.compareFramePixels(
        state.compareGraphs.A.Canvas,state.compareGraphs.B.Canvas);
      if(generation!==state.probeGeneration||state.mode!=='compare'||!state.compareGpuProbe)return;
      state.probeField=compareAdapter.gpuRayField(bundle,gpuResult.response);
      var labelB=el('ModernCompareLabelB');
      if(labelB)labelB.textContent='GPU-assisted · physical frame';
      if(state.compareCache.B)state.compareCache.B.clearCache();
      state.compareLast.B=null;
      var paintStarted=profileNow();
      state.compareGraphs.B.Redraw();
      var paintElapsed=profileNow()-paintStarted;
      if(!state.compareLast.B||!state.compareLast.B.fieldStats||
         !state.compareLast.B.fieldStats.experimentalGpu)
        throw Error('GPU-assisted B frame did not complete; CPU rendering is retained');
      var gpuStats=state.probeField.stats();
      if(!gpuStats.gpuHits)throw Error('No selected GPU ray was consumed by the physical B frame');
      var aCanvas=state.compareGraphs.A.Canvas,bCanvas=state.compareGraphs.B.Canvas;
      var frameDiff=compareAdapter.compareFramePixels(aCanvas,bCanvas);
      var referenceCounts=compareAdapter.frameControlCounts(state.compareLast.A,replayRender);
      var controlIdentical=replayFrameDiff.status==='measured'?
        replayFrameDiff.strictPixels===0&&referenceCounts.sameCounts&&replayStats.missingCpuSeeds===0:null;
      state.probeFrameLast={version:'140.12.11',kind:'CPU replay control and GPU-seeded physical Compare frame',
        cpuReplayControl:{renderMs:replayMs,stats:replayStats,
          rendererCounts:referenceCounts,frameDiff:replayFrameDiff,identical:controlIdentical,
          actualRenderedImageCompared:replayFrameDiff.status==='measured'},
        geometry:bundle.request.geometry,atmosphere:bundle.request.atmosphere,
        discoveredCpuRayRequests:bundle.discovered,qualifiedCpuRayTargets:bundle.qualified,
        gpuAttemptedTargets:bundle.selected.length,gpuStats:gpuStats,
        gpuSetupMs:session.setupMs,gpuFirstBatchMs:gpuResult.timing.gpuUploadToReadbackMs,
        gpuWarmMedianMs:gpuResult.timing.gpuWarmMedianMs,
        cpuDiscoveryAndFrameMs:discoverMs,gpuAssistedBFrameMs:paintElapsed,
        cpuAFrameMs:state.compareLast.A&&state.compareLast.A.timings&&state.compareLast.A.timings.totalMs,
        gpuAssistedBRendererMs:state.compareLast.B&&state.compareLast.B.timings&&state.compareLast.B.timings.totalMs,
        frameDiff:frameDiff,
        gpuRendererCounts:compareAdapter.frameControlCounts(state.compareLast.A,state.compareLast.B),
        actualRenderedImageCompared:frameDiff.status==='measured',
        // This is a mixed ray field, not an all-GPU optical renderer.
        gpuOnlyRayField:false,productionAuthorized:false,visualEquivalenceProven:false};
      probeStatus('CPU replay control '+(controlIdentical===true?'identical':
        controlIdentical===false?'different':'inconclusive')+
        ' · GPU-assisted B frame built · '+gpuStats.gpuHits+' GPU lookups · '+
        gpuStats.cpuFallbackRequests+' CPU fallbacks · '+gpuStats.seeds+' valid GPU seeds');
      var line=probeUi('ModernGpuFrameMetrics');
      if(line)line.textContent='CPU replay control '+replayMs.toFixed(1)+' ms · '+
        (replayFrameDiff.status==='measured'?replayFrameDiff.strictPixels+' strict / '+
          replayFrameDiff.significantPixels+' significant pixels vs A':'pixel comparison unavailable')+
        ' · '+replayStats.replayHits+' replay hits / '+replayStats.cpuFallbackRequests+' fallbacks'+
        (replayStats.missingCpuSeeds?' · '+replayStats.missingCpuSeeds+' missing CPU seeds':'')+
        ' · CPU discovery/A frame '+discoverMs.toFixed(1)+' ms · GPU setup '+
        session.setupMs.toFixed(1)+' ms · GPU batch '+gpuResult.timing.gpuUploadToReadbackMs.toFixed(1)+
        ' ms · assisted B frame '+paintElapsed.toFixed(1)+' ms · '+
        (frameDiff.status==='measured'?frameDiff.significantPixels+'/'+frameDiff.totalPixels+
          ' pixels differ by >8/255 per channel':'pixel readback unavailable: '+frameDiff.reason)+
        '. This includes CPU fallback and does NOT establish GPU-only rendering or 1px silhouette parity.';
    }catch(error){
      state.probeField=null;state.probeFrameLast=null;
      var resetLabel=el('ModernCompareLabelB');
      if(resetLabel)resetLabel.textContent='CPU f64 · after failed control/GPU run';
      if(generation===state.probeGeneration){
        probeStatus('GPU-assisted frame unavailable: '+String(error.message||error));
        if(state.compareGraphs.B)state.compareGraphs.B.Redraw();
      }
    }finally{
      state.probeCapture=null;state.probeCapturedResults=null;
      if(session)session.close();
      state.probeBusy=false;
      if(button)button.disabled=false;
      if(probeButton)probeButton.disabled=false;
    }
  }
  // #140.12.12: no CPU optical-frame discovery or CPU shooting fallback.
  // A bounded grid is authored directly from scene geometry, solved in one
  // WebGPU batch, then consumed by the ordinary physical B-frame painter.
  // CPU A is cold-rendered only AFTER the GPU frame, for a separate fair
  // timing reference and pixel comparison; it is not an input to GPU work.
  async function runCompareGpuFirst(fast){
    fast=fast===true;
    if(state.probeBusy||state.mode!=='compare'||!state.compareGpuProbe)return;
    var spec=state.compareConfig&&state.compareConfig.A;
    if(!spec||spec.atmosphere!=='standard'){
      probeStatus('GPU-first currently supports standard atmosphere only.');return;
    }
    var gpu=root.CurvatureWebGPUBatchShooting1412,contract=root.CurvatureOpticalBatchContract1411;
    if(!gpu||!contract||!root.navigator||!root.navigator.gpu||!compareAdapter||
       !compareAdapter.gpuFirstGrid||!compareAdapter.gpuFirstBatchRequests||!root.CurvatureIndependentComposition||
       !root.CurvatureOpticalTowerSilhouette||!root.CurvatureSurfaceGeometry){
      probeStatus('GPU-first WebGPU / physical scene dependencies unavailable.');return;
    }
    if(!state.compareGraphs.A||!state.compareGraphs.B){
      probeStatus('GPU-first needs both Compare canvases.');return;
    }
    var generation=state.probeGeneration,session=null,
      firstButton=probeUi('ModernGpuFirstRun'),sampleButton=probeUi('ModernGpuProbeRun'),
      replayButton=probeUi('ModernGpuFrameRun'),fastButton=probeUi('ModernGpuFastRun'),
      nearButton=probeUi('ModernGpuNearRun');
    state.probeBusy=true;state.probeField=null;state.probeFrameLast=null;
    [firstButton,sampleButton,replayButton,fastButton,nearButton].forEach(function(b){if(b)b.disabled=true;});
    try{
      var totalStarted=profileNow(),count=Number(probeUi(fast?'ModernGpuFastGridCount':'ModernGpuProbeCount').value);
      probeStatus((fast?'GPU predictor':'GPU-first')+': preparing scene grid WITHOUT CPU ray discovery…');
      var grid=compareAdapter.gpuFirstGrid(state.comparePair.A,count,{
        composition:root.CurvatureIndependentComposition,
        silhouette:root.CurvatureOpticalTowerSilhouette,
        surfaces:root.CurvatureSurfaceGeometry,branch:contract.BRANCH});
      // Unlike #140.12.12, the fast option uses the CPU-inspired predictor
      // on a 500 m integration step. More than 1024 grid nodes are divided
      // into bounded GPU batches and reunited in their original order.
      var requests=compareAdapter.gpuFirstBatchRequests(grid,1024);
      if(fast)requests.forEach(function(request){request.controls.step=500;});
      requests.forEach(gpu.checked);
      var gridPreparedAt=profileNow();
      session=await gpu.createSession(requests[0].targets.length,null,
        {algorithm:fast?'predictor':'sweep',refinement:'residual-stop'});
      if(generation!==state.probeGeneration||state.mode!=='compare'||!state.compareGpuProbe)return;
      var batchResults=[],batchTimes=[],accepted=0,fallbacks=0;
      for(var batchIndex=0;batchIndex<requests.length;batchIndex++){
        probeStatus('GPU-'+(fast?'predictor':'sweep')+': batch '+(batchIndex+1)+'/'+requests.length+'…');
        var batch=await session.solve(requests[batchIndex],{warmRepeats:0});
        if(generation!==state.probeGeneration||state.mode!=='compare'||!state.compareGpuProbe)return;
        batchResults.push.apply(batchResults,batch.response.results);
        batchTimes.push(batch.timing.gpuUploadToReadbackMs);
        if(fast){accepted+=batch.algorithm.predictorAccepted;
          fallbacks+=batch.algorithm.predictorFallbacks;}
      }
      var gpuResolvedAt=profileNow();
      var fastField=compareAdapter.gpuFirstRayField(grid,
        {results:batchResults},root.CurvatureSurfaceGeometry);
      state.probeField=fastField;
      var labelB=el('ModernCompareLabelB');
      if(labelB)labelB.textContent=fast?'GPU predictor · approximate physical frame':
        'GPU-first grid · approximate physical frame';
      if(state.compareCache.B)state.compareCache.B.clearCache();
      state.compareLast.B=null;
      probeStatus((fast?'GPU predictor':'GPU-first')+': painting frame B from the GPU grid…');
      var renderStarted=profileNow();
      state.compareGraphs.B.Redraw();
      var renderFinished=profileNow();
      if(!state.compareLast.B||!state.compareLast.B.fieldStats||
         !state.compareLast.B.fieldStats.experimentalGpu||
         state.compareLast.B.fieldStats.experimentalGpu.kind!=='gpu-first-grid')
        throw Error('GPU-first grid did not reach the physical renderer');
      var fullGpuMs=renderFinished-totalStarted,gpuStats=fastField.stats().experimentalGpu;
      // #140.12.15: second complete GPU-field + cold B-paint measurement
      // reuses the already-compiled session, but regenerates scene grid and
      // batches and clears the render cache. Unlike batch-only numbers, this
      // includes the real Canvas frame. It is NOT added to cold fullGpuMs.
      var warmFrameMs=null,warmBatchTimes=[],warmGridMs=null,warmPaintMs=null;
      if(fast){
        var warmStarted=profileNow();
        var warmGrid=compareAdapter.gpuFirstGrid(state.comparePair.A,count,{
          composition:root.CurvatureIndependentComposition,
          silhouette:root.CurvatureOpticalTowerSilhouette,
          surfaces:root.CurvatureSurfaceGeometry,branch:contract.BRANCH});
        var warmRequests=compareAdapter.gpuFirstBatchRequests(warmGrid,1024);
        warmRequests.forEach(function(request){request.controls.step=500;});
        warmGridMs=profileNow()-warmStarted;
        var warmResults=[];
        for(var wi=0;wi<warmRequests.length;wi++){
          var warmBatch=await session.solve(warmRequests[wi],{warmRepeats:0});
          if(generation!==state.probeGeneration||state.mode!=='compare'||!state.compareGpuProbe)return;
          warmResults.push.apply(warmResults,warmBatch.response.results);
          warmBatchTimes.push(warmBatch.timing.gpuUploadToReadbackMs);
        }
        state.probeField=compareAdapter.gpuFirstRayField(warmGrid,
          {results:warmResults},root.CurvatureSurfaceGeometry);
        if(state.compareCache.B)state.compareCache.B.clearCache();
        state.compareLast.B=null;
        var warmPaintStarted=profileNow();
        state.compareGraphs.B.Redraw();
        warmPaintMs=profileNow()-warmPaintStarted;
        if(!state.compareLast.B||!state.compareLast.B.fieldStats||
           !state.compareLast.B.fieldStats.experimentalGpu||
           state.compareLast.B.fieldStats.experimentalGpu.kind!=='gpu-first-grid')
          throw Error('Warm GPU predictor grid did not reach the physical renderer');
        warmFrameMs=profileNow()-warmStarted;
        gpuStats=state.probeField.stats().experimentalGpu;
      }
      // This is an independently timed CPU reference, never CPU discovery for
      // the WebGPU path. Force cold optics so cached CPU pixels cannot turn a
      // hot repaint into a misleading throughput reference.
      if(generation!==state.probeGeneration||state.mode!=='compare'||!state.compareGpuProbe)return;
      probeStatus('GPU-first frame complete; measuring separate cold CPU reference A…');
      state.probeForceColdA=true;
      var cpuStarted=profileNow();
      try{state.compareGraphs.A.Redraw();}finally{state.probeForceColdA=false;}
      var cpuMs=profileNow()-cpuStarted;
      if(generation!==state.probeGeneration||state.mode!=='compare'||!state.compareGpuProbe)return;
      if(!state.compareLast.A)throw Error('CPU reference frame failed to render');
      var diff=compareAdapter.compareFramePixels(state.compareGraphs.A.Canvas,
        state.compareGraphs.B.Canvas);
      var counts=compareAdapter.frameControlCounts(state.compareLast.A,state.compareLast.B);
      var speedup=cpuMs/fullGpuMs;
      var faster=fullGpuMs<cpuMs;
      var verdict=faster?'GPU_FIRST_FASTER_BUT_VISUAL_UNQUALIFIED':'NO_END_TO_END_GPU_SPEEDUP';
      state.probeFrameLast={version:fast?'140.12.15':'140.12.12',
        kind:fast?'Fast GPU predictor physical-grid full-frame speed/visual experiment':
          'GPU-first geometry-grid full-frame speed gate',
        gpuAlgorithm:fast?'predictor':'sweep',gpuRK4StepMetres:fast?500:50,
        gpuBatchCount:requests.length,gpuBatchReadbackTimesMs:batchTimes,
        gpuWarmBatchReadbackTimesMs:fast?warmBatchTimes:null,
        gpuWarmGridPrepareMs:warmGridMs,gpuWarmFramePaintMs:warmPaintMs,
        gpuWarmFrameEndToEndMs:warmFrameMs,
        warmSpeedupCpuOverGpu:warmFrameMs?cpuMs/warmFrameMs:null,
        gpuBatchReadbackSumMs:batchTimes.reduce(function(a,b){return a+b;},0),
        gpuPredictorAccepted:fast?accepted:null,gpuPredictorFallbacks:fast?fallbacks:null,
        geometry:grid.request.geometry,atmosphere:grid.request.atmosphere,
        gpuGrid:{columns:grid.columns,rows:grid.rows,points:grid.request.targets.length,
          objectVertices:grid.objectVertices,objectDistanceRange:grid.objectDistanceRange,
          maxHeight:grid.maxHeight,method:grid.method,cpuOracleDiscovery:false},
        gpuStats:gpuStats,gpuSetupMs:session.setupMs,
        gridPrepareMs:gridPreparedAt-totalStarted,
        gpuBatchMs:gpuResolvedAt-gridPreparedAt-session.setupMs,
        gpuFieldSetupAndBatchMs:gpuResolvedAt-totalStarted,
        gpuFrameRenderMs:renderFinished-renderStarted,
        gpuFirstEndToEndMs:fullGpuMs,cpuColdReferenceMs:cpuMs,
        predictorFrameEndToEndMs:fast?fullGpuMs:null,
        cpuFrameColdCacheReused:state.compareLast.A.cacheReused,
        speedupCpuOverGpu:speedup,beatCpuColdReference:faster,
        beatCpuWithWarmPipeline:warmFrameMs?warmFrameMs<cpuMs:null,
        frameDiff:diff,rendererCounts:counts,
        gpuOnlyOpticalSamples:true,gpuOnlyRasterization:false,
        interpolationApproximate:true,visualEquivalenceProven:false,
        productionAuthorized:false,verdict:verdict};
      probeStatus((fast?'GPU predictor':'GPU-first')+' '+fullGpuMs.toFixed(1)+' ms vs cold CPU '+
        cpuMs.toFixed(1)+' ms · '+speedup.toFixed(2)+'× CPU/GPU'+
        (faster?' · cold speed win':' · cold NO SPEED WIN')+
        (warmFrameMs?' · pipeline-warm frame '+warmFrameMs.toFixed(1)+' ms · '+
          (cpuMs/warmFrameMs).toFixed(2)+'× CPU/GPU':'')+' · visual approval NOT established');
      var line=probeUi('ModernGpuFrameMetrics');
      if(line)line.textContent=grid.request.targets.length+' GPU grid rays · '+
        gpuStats.gpuHits+' optical lookups · '+gpuStats.cpuFallbackRequests+
        ' CPU shooting fallbacks · '+gpuStats.failedGpuNodes+' failed grid nodes · '+
        gpuStats.mixedStatusLookups+' mixed-status lookups · '+
        gpuStats.extrapolatedLookups+' extrapolated lookups · '+
        (fast?'GPU predictor':'GPU-first')+' cold full frame '+
        fullGpuMs.toFixed(1)+' ms including grid, WebGPU setup/readback and B painting'+
        ' · '+requests.length+' GPU batches'+(fast?' · '+accepted+' predictor accepted · '+
          fallbacks+' sweep fallback · pipeline-warm full frame '+warmFrameMs.toFixed(1)+' ms':'')+
        ' · separate CPU cold frame '+cpuMs.toFixed(1)+' ms · '+
        (diff.status==='measured'?diff.significantPixels+'/'+diff.totalPixels+
          ' significantly different pixels ('+(100*diff.significantPixels/diff.totalPixels).toFixed(2)+
          '%)':'pixel comparison unavailable: '+diff.reason)+
        ' · '+counts.reference.contours+'/'+counts.replay.contours+' contours · '+
        'experimental interpolation, NO certified occlusion/silhouette parity.';
    }catch(error){
      if(generation===state.probeGeneration){
        state.probeField=null;state.probeFrameLast=null;
        var resetLabel=el('ModernCompareLabelB');
        if(resetLabel)resetLabel.textContent='CPU f64 · GPU experiment failed';
        probeStatus((fast?'GPU predictor':'GPU-first')+' unavailable: '+String(error.message||error));
        if(state.compareCache.B)state.compareCache.B.clearCache();
        state.compareGraphs.B.Redraw();
      }
    }finally{
      state.probeForceColdA=false;
      if(session)session.close();
      state.probeBusy=false;
      [firstButton,sampleButton,replayButton,fastButton,nearButton,probeUi('ModernGpuGridABCRun'),probeUi('ModernGpuAdaptiveRun')].forEach(function(b){if(b)b.disabled=false;});
    }
  }
  // #140.12.16: compare two equal-budget layouts on the real physical frame.
  // The CPU reference is rendered only after both layouts; it NEVER supplies
  // target discovery, shooting or a decision to refine one grid rather than
  // the other. An alternating A/B/A/B order reduces ordering bias; timings
  // remain wall-clock estimates (not GPU kernel timestamps).
  async function runCompareGpuLocalAB(){
    if(state.probeBusy||state.mode!=='compare'||!state.compareGpuProbe)return;
    var spec=state.compareConfig&&state.compareConfig.A;
    if(!spec||spec.atmosphere!=='standard'){
      probeStatus('Near-ground A/B currently supports standard atmosphere only.');return;
    }
    var gpu=root.CurvatureWebGPUBatchShooting1412,
      contract=root.CurvatureOpticalBatchContract1411;
    if(!gpu||!contract||!root.navigator||!root.navigator.gpu||!compareAdapter||
       !compareAdapter.gpuFirstGrid||!compareAdapter.gpuFirstBatchRequests||
       !compareAdapter.compareFramePixels||!root.CurvatureIndependentComposition||
       !root.CurvatureOpticalTowerSilhouette||!root.CurvatureSurfaceGeometry||
       !state.compareGraphs.A||!state.compareGraphs.B){
      probeStatus('Near-ground A/B WebGPU / physical scene dependencies unavailable.');return;
    }
    var generation=state.probeGeneration,session=null,
      ids=['ModernGpuFirstRun','ModernGpuProbeRun','ModernGpuFrameRun',
        'ModernGpuFastRun','ModernGpuNearRun'],
      buttons=ids.map(probeUi);
    state.probeBusy=true;state.probeField=null;state.probeFrameLast=null;
    buttons.forEach(function(button){if(button)button.disabled=true;});
    try{
      var count=Number(probeUi('ModernGpuFastGridCount').value),
        deps={composition:root.CurvatureIndependentComposition,
          silhouette:root.CurvatureOpticalTowerSilhouette,
          surfaces:root.CurvatureSurfaceGeometry,branch:contract.BRANCH};
      var runs={uniform:[],local:[]},captures={},counts={},lastFields={};
      function cancelled(){return generation!==state.probeGeneration||
        state.mode!=='compare'||!state.compareGpuProbe;}
      // Both layouts use the SAME GPU pipeline, node count and batch size.
      // Compilation is reported separately and not attributed to either.
      probeStatus('Near-ground A/B: compiling shared predictor pipeline…');
      session=await gpu.createSession(Math.min(count,1024),null,
        {algorithm:'predictor',refinement:'residual-stop'});
      if(cancelled())return;
      var order=['uniform','local','uniform','local'];
      for(var round=0;round<order.length;round++){
        var layout=order[round],variant=layout==='local'?'near-ground':'uniform';
        probeStatus('Near-ground A/B: '+variant+' · frame '+(round+1)+'/4…');
        var started=profileNow(),grid=compareAdapter.gpuFirstGrid(state.comparePair.A,
          count,deps,{layout:variant});
        var requests=compareAdapter.gpuFirstBatchRequests(grid,1024);
        requests.forEach(function(request){request.controls.step=500;gpu.checked(request);});
        var prepared=profileNow(),results=[],batchTimes=[],accepted=0,fallbacks=0;
        for(var b=0;b<requests.length;b++){
          var batch=await session.solve(requests[b],{warmRepeats:0});
          if(cancelled())return;
          results.push.apply(results,batch.response.results);
          batchTimes.push(batch.timing.gpuUploadToReadbackMs);
          accepted+=batch.algorithm.predictorAccepted;
          fallbacks+=batch.algorithm.predictorFallbacks;
        }
        var resolved=profileNow();
        var field=compareAdapter.gpuFirstRayField(grid,
          {results:results},root.CurvatureSurfaceGeometry);
        state.probeField=field;
        if(state.compareCache.B)state.compareCache.B.clearCache();
        state.compareLast.B=null;
        var paintedAt=profileNow();
        state.compareGraphs.B.Redraw();
        var completed=profileNow();
        if(!state.compareLast.B||!state.compareLast.B.fieldStats||
           !state.compareLast.B.fieldStats.experimentalGpu||
           state.compareLast.B.fieldStats.experimentalGpu.kind!=='gpu-first-grid')
          throw Error('Near-ground A/B grid did not reach the physical renderer');
        var canvas=state.compareGraphs.B.Canvas;
        var copy=document.createElement('canvas');
        copy.width=canvas.width;copy.height=canvas.height;
        var ctx=copy.getContext&&copy.getContext('2d');
        if(!ctx||typeof ctx.drawImage!=='function')
          throw Error('Near-ground A/B Canvas snapshot unavailable');
        ctx.drawImage(canvas,0,0);
        captures[layout]=copy;
        counts[layout]={contours:state.compareLast.B.drawn,
          fillTriangles:state.compareLast.B.fillTriangles,
          unresolved:state.compareLast.B.unresolved};
        lastFields[layout]=field;
        runs[layout].push({sequenceIndex:round,gridPrepareMs:prepared-started,
          gpuBatchWallMs:resolved-prepared,paintMs:completed-paintedAt,
          frameEndToEndMs:completed-started,
          gpuBatchReadbackTimesMs:batchTimes,predictorAccepted:accepted,
          predictorFallbacks:fallbacks,fieldStats:field.stats().experimentalGpu});
      }
      if(cancelled())return;
      // Last frame B is the local near-ground variant. Preserve both B
      // snapshots so CPU pixels are compared against EXACTLY those frames.
      if(el('ModernCompareLabelB'))el('ModernCompareLabelB').textContent=
        'GPU predictor · near-ground grid (approximate)';
      probeStatus('Near-ground A/B: measuring independent cold CPU A…');
      state.probeForceColdA=true;
      var cpuStart=profileNow();
      try{state.compareGraphs.A.Redraw();}finally{state.probeForceColdA=false;}
      var cpuMs=profileNow()-cpuStart;
      if(cancelled())return;
      if(!state.compareLast.A)throw Error('Near-ground A/B CPU reference missing');
      var cpuCanvas=state.compareGraphs.A.Canvas;
      var roi={x:0,y:0.55,width:0.55,height:0.45};
      var reference={contours:state.compareLast.A.drawn,
        fillTriangles:state.compareLast.A.fillTriangles,
        unresolved:state.compareLast.A.unresolved};
      var variants={};
      ['uniform','local'].forEach(function(layout){
        var measured=runs[layout];
        variants[layout]={layout:layout==='local'?'near-ground':'uniform',
          points:count,batches:Math.ceil(count/1024),
          firstRun:measured[0],warmRun:measured[1],
          fullFrameDiff:compareAdapter.compareFramePixels(cpuCanvas,captures[layout]),
          nearLeftLowerFrameDiff:compareAdapter.compareFramePixels(cpuCanvas,captures[layout],roi),
          rendererCounts:counts[layout]};
      });
      var a=variants.uniform,b=variants.local;
      var fullA=a.fullFrameDiff,fullB=b.fullFrameDiff,
        nearA=a.nearLeftLowerFrameDiff,nearB=b.nearLeftLowerFrameDiff;
      var comparable=fullA.status==='measured'&&fullB.status==='measured'&&
        nearA.status==='measured'&&nearB.status==='measured';
      state.probeFrameLast={version:'140.12.16',
        kind:'Equal-budget uniform vs local near-ground GPU predictor physical-frame A/B',
        geometry:state.comparePair.A.showModel===2?'flat':'globe',
        atmosphere:'standard',gpuAlgorithm:'predictor',gpuRK4StepMetres:500,
        gpuSetupMs:session.setupMs,pointsPerLayout:count,layoutOrder:order,
        cpuColdReferenceMs:cpuMs,cpuReferenceCounts:reference,
        region:roi,variants:variants,
        nearLeftLowerSignificantPixelDelta:comparable?
          nearB.significantPixels-nearA.significantPixels:null,
        fullFrameSignificantPixelDelta:comparable?
          fullB.significantPixels-fullA.significantPixels:null,
        warmFrameTimeDeltaMs:b.warmRun.frameEndToEndMs-a.warmRun.frameEndToEndMs,
        sameRayBudget:true,sharedGpuSession:true,fullFrameCompared:comparable,
        cpuOracleDiscovery:false,cpuShootingFallback:false,
        regionIsUserObservedApproximation:true,visualEquivalenceProven:false,
        productionAuthorized:false,
        verdict:comparable?(nearB.significantPixels<nearA.significantPixels?
          'NEAR_LEFT_LOWER_PIXEL_DIFF_IMPROVED_NOT_CERTIFIED':
          'NEAR_LEFT_LOWER_PIXEL_DIFF_NOT_IMPROVED'):'PIXEL_READBACK_UNAVAILABLE'};
      var fmt=function(n){return Number.isFinite(n)?n.toFixed(1):'n/a';};
      var roiInfo=comparable?(nearA.significantPixels+' → '+nearB.significantPixels+
        ' significant pixels in lower-left ROI'):'pixel readback unavailable';
      probeStatus('Near-ground A/B (4096-style equal budget): '+roiInfo+
        ' · warm full frame '+fmt(a.warmRun.frameEndToEndMs)+' → '+
        fmt(b.warmRun.frameEndToEndMs)+' ms · no visual approval');
      var line=probeUi('ModernGpuFrameMetrics');
      if(line)line.textContent=count+' rays per variant · '+roiInfo+
        ' · full-frame significant pixels '+
        (comparable?fullA.significantPixels+' → '+fullB.significantPixels:'unavailable')+
        ' · unresolved '+a.rendererCounts.unresolved+' → '+b.rendererCounts.unresolved+
        ' · shared GPU pipeline setup '+fmt(session.setupMs)+' ms (excluded from A/B frames)'+
        ' · cold CPU '+fmt(cpuMs)+' ms · Export JSON for full per-run breakdown.';
    }catch(error){
      if(generation===state.probeGeneration){
        state.probeField=null;state.probeFrameLast=null;
        probeStatus('Near-ground A/B unavailable: '+String(error.message||error));
        if(state.compareCache.B)state.compareCache.B.clearCache();
        state.compareGraphs.B.Redraw();
      }
    }finally{
      state.probeForceColdA=false;
      if(session)session.close();
      state.probeBusy=false;
      buttons.forEach(function(button){if(button)button.disabled=false;});
    }
  }
  // #140.12.17: fixed 4096-ray A/B/C. The affected region is lower-RIGHT,
  // corrected from the lower-left ROI used by #140.12.16. The three layouts
  // use the same physical scene, predictor shader, RK4 step, ray budget and
  // reusable GPU session. CPU is a post-hoc frame reference ONLY.
  async function runCompareGpuGridABC(){
    if(state.probeBusy||state.mode!=='compare'||!state.compareGpuProbe)return;
    var spec=state.compareConfig&&state.compareConfig.A;
    if(!spec||spec.atmosphere!=='standard'){
      probeStatus('GPU grid A/B/C currently supports standard atmosphere only.');return;
    }
    var gpu=root.CurvatureWebGPUBatchShooting1412,
      contract=root.CurvatureOpticalBatchContract1411;
    if(!gpu||!contract||!root.navigator||!root.navigator.gpu||!compareAdapter||
       !compareAdapter.gpuFirstGrid||!compareAdapter.gpuFirstBatchRequests||
       !compareAdapter.gpuFirstRayField||!compareAdapter.compareFramePixels||
       !root.CurvatureIndependentComposition||!root.CurvatureOpticalTowerSilhouette||
       !root.CurvatureSurfaceGeometry||!state.compareGraphs.A||!state.compareGraphs.B){
      probeStatus('GPU grid A/B/C WebGPU / physical scene dependencies unavailable.');return;
    }
    var generation=state.probeGeneration,session=null,
      buttonIds=['ModernGpuFirstRun','ModernGpuProbeRun','ModernGpuFrameRun',
        'ModernGpuFastRun','ModernGpuNearRun','ModernGpuGridABCRun','ModernGpuAdaptiveRun'],
      buttons=buttonIds.map(probeUi),count=4096;
    state.probeBusy=true;state.probeField=null;state.probeFrameLast=null;
    buttons.forEach(function(button){if(button)button.disabled=true;});
    try{
      var deps={composition:root.CurvatureIndependentComposition,
        silhouette:root.CurvatureOpticalTowerSilhouette,
        surfaces:root.CurvatureSurfaceGeometry,branch:contract.BRANCH};
      var layouts={nearGround256x16:'near-ground',vertical128x32:'vertical-32',
        nearDistance256x16:'distance-focused'};
      var order=['nearGround256x16','vertical128x32','nearDistance256x16',
        'nearDistance256x16','vertical128x32','nearGround256x16'];
      var runs={nearGround256x16:[],vertical128x32:[],nearDistance256x16:[]};
      var captures={},counts={},grids={},lastFields={};
      function cancelled(){return generation!==state.probeGeneration||
        state.mode!=='compare'||!state.compareGpuProbe;}
      probeStatus('GPU grid A/B/C: preparing shared GPU predictor pipeline…');
      session=await gpu.createSession(1024,null,
        {algorithm:'predictor',refinement:'residual-stop'});
      if(cancelled())return;
      for(var round=0;round<order.length;round++){
        var key=order[round],layout=layouts[key];
        probeStatus('GPU grid A/B/C: '+key+' · frame '+(round+1)+'/6…');
        var started=profileNow();
        var grid=compareAdapter.gpuFirstGrid(state.comparePair.A,count,deps,{layout:layout});
        if(grid.request.targets.length!==count||grid.columns*grid.rows!==count)
          throw Error('GPU grid A/B/C ray budgets do not match');
        var requests=compareAdapter.gpuFirstBatchRequests(grid,1024);
        requests.forEach(function(request){request.controls.step=500;gpu.checked(request);});
        var prepared=profileNow(),results=[],batchTimes=[],accepted=0,fallbacks=0;
        for(var b=0;b<requests.length;b++){
          var batch=await session.solve(requests[b],{warmRepeats:0});
          if(cancelled())return;
          results.push.apply(results,batch.response.results);
          batchTimes.push(batch.timing.gpuUploadToReadbackMs);
          accepted+=batch.algorithm.predictorAccepted;
          fallbacks+=batch.algorithm.predictorFallbacks;
        }
        var resolved=profileNow();
        var field=compareAdapter.gpuFirstRayField(grid,
          {results:results},root.CurvatureSurfaceGeometry);
        state.probeField=field;
        if(state.compareCache.B)state.compareCache.B.clearCache();
        state.compareLast.B=null;
        var paintedAt=profileNow();
        state.compareGraphs.B.Redraw();
        var completed=profileNow();
        if(!state.compareLast.B||!state.compareLast.B.fieldStats||
           !state.compareLast.B.fieldStats.experimentalGpu||
           state.compareLast.B.fieldStats.experimentalGpu.kind!=='gpu-first-grid')
          throw Error('GPU grid A/B/C field did not reach the physical renderer');
        var canvas=state.compareGraphs.B.Canvas;
        var copy=document.createElement('canvas');
        copy.width=canvas.width;copy.height=canvas.height;
        var ctx=copy.getContext&&copy.getContext('2d');
        if(!ctx||typeof ctx.drawImage!=='function')
          throw Error('GPU grid A/B/C Canvas snapshot unavailable');
        ctx.drawImage(canvas,0,0);
        captures[key]=copy;
        grids[key]={layout:layout,columns:grid.columns,rows:grid.rows,
          points:grid.request.targets.length,
          nearColumnsUnder6Km:grid.distances.filter(function(d){return d<=6000;}).length,
          objectDistanceRange:grid.objectDistanceRange};
        counts[key]={contours:state.compareLast.B.drawn,
          fillTriangles:state.compareLast.B.fillTriangles,
          unresolved:state.compareLast.B.unresolved};
        lastFields[key]=field;
        runs[key].push({sequenceIndex:round,gridPrepareMs:prepared-started,
          gpuBatchWallMs:resolved-prepared,paintMs:completed-paintedAt,
          frameEndToEndMs:completed-started,
          gpuBatchReadbackTimesMs:batchTimes,predictorAccepted:accepted,
          predictorFallbacks:fallbacks,fieldStats:field.stats().experimentalGpu});
      }
      if(cancelled())return;
      probeStatus('GPU grid A/B/C: measuring independent cold CPU A…');
      state.probeForceColdA=true;
      var cpuStart=profileNow();
      try{state.compareGraphs.A.Redraw();}finally{state.probeForceColdA=false;}
      var cpuMs=profileNow()-cpuStart;
      if(cancelled())return;
      if(!state.compareLast.A)throw Error('GPU grid A/B/C CPU reference missing');
      var cpuCanvas=state.compareGraphs.A.Canvas;
      // Lower right 45% × 45%, NOT the lower-left ROI from #140.12.16.
      var roi={x:0.55,y:0.55,width:0.45,height:0.45};
      var reference={contours:state.compareLast.A.drawn,
        fillTriangles:state.compareLast.A.fillTriangles,
        unresolved:state.compareLast.A.unresolved};
      var variants={};
      Object.keys(layouts).forEach(function(key){
        variants[key]=Object.assign({},grids[key],{
          batches:Math.ceil(count/1024),
          firstRun:runs[key][0],warmRun:runs[key][1],
          fullFrameDiff:compareAdapter.compareFramePixels(cpuCanvas,captures[key]),
          lowerRightFrameDiff:compareAdapter.compareFramePixels(cpuCanvas,captures[key],roi),
          rendererCounts:counts[key]});
      });
      var base=variants.nearGround256x16,vertical=variants.vertical128x32,
        focused=variants.nearDistance256x16;
      var comparable=Object.keys(variants).every(function(key){
        return variants[key].fullFrameDiff.status==='measured'&&
          variants[key].lowerRightFrameDiff.status==='measured';
      });
      function delta(other,field){return comparable?
        other[field].significantPixels-base[field].significantPixels:null;}
      state.probeFrameLast={version:'140.12.17',
        kind:'Equal-budget near-ground 256x16 vs vertical 128x32 vs near-distance 256x16 physical-frame A/B/C',
        geometry:state.comparePair.A.showModel===2?'flat':'globe',
        atmosphere:'standard',gpuAlgorithm:'predictor',gpuRK4StepMetres:500,
        gpuSetupMs:session.setupMs,pointsPerLayout:count,layoutOrder:order,
        cpuColdReferenceMs:cpuMs,cpuReferenceCounts:reference,
        lowerRightRegion:roi,variants:variants,
        significantPixelDeltasVsNearGround:{
          lowerRight:{vertical128x32:delta(vertical,'lowerRightFrameDiff'),
            nearDistance256x16:delta(focused,'lowerRightFrameDiff')},
          fullFrame:{vertical128x32:delta(vertical,'fullFrameDiff'),
            nearDistance256x16:delta(focused,'fullFrameDiff')}},
        sameRayBudget:true,sharedGpuSession:true,fullFrameCompared:comparable,
        cpuOracleDiscovery:false,cpuShootingFallback:false,
        regionIsUserObservedApproximation:true,visualEquivalenceProven:false,
        productionAuthorized:false,
        verdict:comparable?'MEASURED_VISUAL_REVIEW_REQUIRED':'PIXEL_READBACK_UNAVAILABLE'};
      // Display the near-distance variant after measurement. No GPU shooting or
      // CPU oracle selection occurs here, and this repaint is excluded from A/B/C.
      state.probeField=lastFields.nearDistance256x16;
      if(state.compareCache.B)state.compareCache.B.clearCache();
      state.compareGraphs.B.Redraw();
      if(el('ModernCompareLabelB'))el('ModernCompareLabelB').textContent=
        'GPU predictor · near-distance grid (approximate)';
      var fmt=function(n){return Number.isFinite(n)?n.toFixed(1):'n/a';};
      var roiInfo=comparable?Object.keys(variants).map(function(key){
        return key+': '+variants[key].lowerRightFrameDiff.significantPixels;
      }).join(' / '):'pixel readback unavailable';
      probeStatus('GPU grid A/B/C · lower-RIGHT significant pixels '+roiInfo+
        ' · warm full frames '+Object.keys(variants).map(function(key){
          return key+' '+fmt(variants[key].warmRun.frameEndToEndMs)+' ms';
        }).join(' / ')+' · visual approval NOT established');
      var line=probeUi('ModernGpuFrameMetrics');
      if(line)line.textContent='4096 GPU rays per layout · lower-RIGHT ROI '+roiInfo+
        ' · full-frame differences '+Object.keys(variants).map(function(key){
          return key+': '+variants[key].fullFrameDiff.significantPixels;
        }).join(' / ')+' · unresolved '+Object.keys(variants).map(function(key){
          return key+': '+variants[key].rendererCounts.unresolved;
        }).join(' / ')+' · CPU cold '+fmt(cpuMs)+' ms · Export JSON for all timings and node distributions.';
    }catch(error){
      if(generation===state.probeGeneration){
        state.probeField=null;state.probeFrameLast=null;
        probeStatus('GPU grid A/B/C unavailable: '+String(error.message||error));
        if(state.compareCache.B)state.compareCache.B.clearCache();
        state.compareGraphs.B.Redraw();
      }
    }finally{
      state.probeForceColdA=false;
      if(session)session.close();
      state.probeBusy=false;
      buttons.forEach(function(button){if(button)button.disabled=false;});
    }
  }
  // #140.12.18: GPU-only adaptive refinement against a density-matched
  // 4608-node control. CPU A is painted only AFTER all GPU variants, and
  // neither CPU pixels nor CPU ray solves contribute any refinement targets.
  function paintGpuDifferenceHeatmap(id,tiles,sharedPeak){
    var canvas=probeUi(id);
    if(!canvas||!canvas.getContext)return;
    var ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(!tiles||tiles.status!=='measured')return;
    var tileW=canvas.width/tiles.columns,tileH=canvas.height/tiles.rows;
    // Relative *density* per tile; adjust edge tiles by their actual area.
    var maximum=0,densities=[];
    for(var row=0;row<tiles.rows;row++)for(var col=0;col<tiles.columns;col++){
      var x0=Math.ceil(col*tiles.width/tiles.columns),x1=Math.ceil((col+1)*tiles.width/tiles.columns);
      var y0=Math.ceil(row*tiles.height/tiles.rows),y1=Math.ceil((row+1)*tiles.height/tiles.rows);
      var density=tiles.tileCounts[row*tiles.columns+col]/Math.max(1,(x1-x0)*(y1-y0));
      densities.push(density);maximum=Math.max(maximum,density);
    }
    if(sharedPeak>0){
      var nominalArea=tiles.width*tiles.height/(tiles.columns*tiles.rows);
      maximum=sharedPeak/nominalArea;
    }
    densities.forEach(function(density,i){
      var intensity=maximum?Math.sqrt(Math.min(1,density/maximum)):0;
      var red=Math.round(255-42*intensity),green=Math.round(252-215*intensity),
        blue=Math.round(250-228*intensity);
      ctx.fillStyle='rgb('+red+','+green+','+blue+')';
      ctx.fillRect((i%tiles.columns)*tileW,Math.floor(i/tiles.columns)*tileH,
        Math.ceil(tileW+0.1),Math.ceil(tileH+0.1));
    });
    ctx.strokeStyle='#64748b';ctx.lineWidth=1;
    ctx.strokeRect(0.5,0.5,canvas.width-1,canvas.height-1);
    ctx.strokeStyle='#334155';ctx.lineWidth=2;
    ctx.strokeRect(0.55*canvas.width,0.55*canvas.height,
      0.45*canvas.width,0.45*canvas.height);
  }
  async function runCompareGpuAdaptive141218(){
    if(state.probeBusy||state.mode!=='compare'||!state.compareGpuProbe)return;
    var spec=state.compareConfig&&state.compareConfig.A;
    if(!spec||spec.atmosphere!=='standard'){
      probeStatus('Adaptive GPU experiment supports standard atmosphere only.');return;
    }
    var gpu=root.CurvatureWebGPUBatchShooting1412,
      contract=root.CurvatureOpticalBatchContract1411;
    if(!gpu||!contract||!root.navigator||!root.navigator.gpu||!compareAdapter||
       !compareAdapter.gpuFirstGrid||!compareAdapter.gpuFirstBatchRequests||
       !compareAdapter.gpuFirstRayField||!compareAdapter.compareFramePixels||
       !compareAdapter.frameDifferenceTiles||!root.CurvatureIndependentComposition||
       !root.CurvatureOpticalTowerSilhouette||!root.CurvatureSurfaceGeometry||
       !state.compareGraphs.A||!state.compareGraphs.B){
      probeStatus('Adaptive GPU experiment WebGPU / Compare dependencies unavailable.');return;
    }
    var generation=state.probeGeneration,session=null,
      ids=['ModernGpuFirstRun','ModernGpuProbeRun','ModernGpuFrameRun',
        'ModernGpuFastRun','ModernGpuNearRun','ModernGpuGridABCRun','ModernGpuAdaptiveRun'],
      buttons=ids.map(probeUi);
    state.probeBusy=true;state.probeField=null;state.probeFrameLast=null;
    var mapGroup=probeUi('ModernGpuDiffMaps');if(mapGroup)mapGroup.hidden=true;
    buttons.forEach(function(button){if(button)button.disabled=true;});
    try{
      var deps={composition:root.CurvatureIndependentComposition,
        silhouette:root.CurvatureOpticalTowerSilhouette,
        surfaces:root.CurvatureSurfaceGeometry,branch:contract.BRANCH};
      var baseCount=4096,extraBudget=512,roi={x:0.55,y:0.55,width:0.45,height:0.45};
      var grids={},snapshots={},counts={},timing={};
      function cancelled(){return generation!==state.probeGeneration||
        state.mode!=='compare'||!state.compareGpuProbe;}
      function snapshot(key){
        var canvas=state.compareGraphs.B.Canvas,copy=document.createElement('canvas');
        copy.width=canvas.width;copy.height=canvas.height;
        var ctx=copy.getContext&&copy.getContext('2d');
        if(!ctx||!ctx.drawImage)throw Error('Adaptive GPU Canvas snapshot unavailable');
        ctx.drawImage(canvas,0,0);snapshots[key]=copy;
        if(!state.compareLast.B||!state.compareLast.B.fieldStats||
            !state.compareLast.B.fieldStats.experimentalGpu||
            state.compareLast.B.fieldStats.experimentalGpu.kind!=='gpu-first-grid')
          throw Error('Adaptive GPU field did not reach the physical renderer');
        counts[key]={contours:state.compareLast.B.drawn,
          fillTriangles:state.compareLast.B.fillTriangles,
          unresolved:state.compareLast.B.unresolved,
          fieldStats:state.compareLast.B.fieldStats.experimentalGpu};
      }
      function paint(field,key){
        state.probeField=field;
        if(state.compareCache.B)state.compareCache.B.clearCache();
        state.compareLast.B=null;
        var at=profileNow();state.compareGraphs.B.Redraw();
        var duration=profileNow()-at;snapshot(key);return duration;
      }
      async function shoot(grid){
        var requests=compareAdapter.gpuFirstBatchRequests(grid,1024),results=[],times=[];
        for(var request of requests){
          request.controls.step=500;gpu.checked(request);
          var batch=await session.solve(request,{warmRepeats:0});
          if(cancelled())return null;
          results.push.apply(results,batch.response.results);
          times.push(batch.timing.gpuUploadToReadbackMs);
        }
        return {results:results,times:times};
      }
      probeStatus('Adaptive GPU: creating one shared predictor pipeline…');
      session=await gpu.createSession(1024,null,
        {algorithm:'predictor',refinement:'residual-stop'});
      if(cancelled())return;
      var baseStart=profileNow();
      var baseGrid=compareAdapter.gpuFirstGrid(state.comparePair.A,baseCount,deps,
        {layout:'distance-focused'});
      var basePrepared=profileNow(),baseResponse=await shoot(baseGrid);
      if(cancelled()||!baseResponse)return;
      var baseSolved=profileNow(),baseField=compareAdapter.gpuFirstRayField(
        baseGrid,baseResponse,root.CurvatureSurfaceGeometry,{collectCandidates:true});
      var basePaintMs=paint(baseField,'base4096');
      var baseFinished=profileNow();
      timing.base4096={gridPrepareMs:basePrepared-baseStart,
        gpuBatchWallMs:baseSolved-basePrepared,paintMs:basePaintMs,
        frameEndToEndMs:baseFinished-baseStart,
        gpuBatchReadbackTimesMs:baseResponse.times};
      var candidates=baseField.refinementCandidates(extraBudget);
      var reasonCounts={};candidates.forEach(function(c){c.causes.forEach(function(reason){
        reasonCounts[reason]=(reasonCounts[reason]||0)+1;
      });});
      probeStatus('Adaptive GPU: '+candidates.length+' risky renderer queries · GPU refinement…');
      var refinementStart=profileNow(),refinements=[],refineBatchTimes=[];
      if(candidates.length){
        var metric=root.CurvatureSurfaceGeometry.createFromCurvature(
          baseGrid.request.geometry==='globe'?1/baseGrid.request.radius:0);
        var request=Object.assign({},baseGrid.request,{controls:Object.assign({},baseGrid.request.controls,
          {step:500}),targets:candidates.map(function(c){return metric.surfacePoint2(c.d,c.h);})});
        gpu.checked(request);
        var refined=await session.solve(request,{warmRepeats:0});
        if(cancelled())return;
        refineBatchTimes.push(refined.timing.gpuUploadToReadbackMs);
        if(refined.response.results.length!==candidates.length)
          throw Error('Adaptive GPU refinement response count mismatch');
        refinements=candidates.map(function(c,i){return {d:c.d,h:c.h,
          result:refined.response.results[i]};});
      }
      var refinementSolved=profileNow();
      var adaptiveField=compareAdapter.gpuFirstRayField(baseGrid,baseResponse,
        root.CurvatureSurfaceGeometry,{refinements:refinements});
      var adaptivePaintMs=paint(adaptiveField,'adaptive4608');
      timing.adaptive4608={refinementGpuWallMs:refinementSolved-refinementStart,
        refineBatchReadbackTimesMs:refineBatchTimes,
        paintMs:adaptivePaintMs,frameEndToEndMs:profileNow()-baseStart,
        includesBaseDiscoveryPaint:true};
      var denseStart=profileNow();
      var denseGrid=compareAdapter.gpuFirstGrid(state.comparePair.A,
        baseCount+extraBudget,deps,{layout:'distance-focused'});
      var densePrepared=profileNow(),denseResponse=await shoot(denseGrid);
      if(cancelled()||!denseResponse)return;
      var denseSolved=profileNow(),denseField=compareAdapter.gpuFirstRayField(
        denseGrid,denseResponse,root.CurvatureSurfaceGeometry);
      var densePaintMs=paint(denseField,'dense4608');
      timing.dense4608={gridPrepareMs:densePrepared-denseStart,
        gpuBatchWallMs:denseSolved-densePrepared,paintMs:densePaintMs,
        frameEndToEndMs:profileNow()-denseStart,
        gpuBatchReadbackTimesMs:denseResponse.times};
      if(cancelled())return;
      probeStatus('Adaptive GPU: measuring independent cold CPU A and diff maps…');
      state.probeForceColdA=true;
      var cpuStart=profileNow();
      try{state.compareGraphs.A.Redraw();}finally{state.probeForceColdA=false;}
      var cpuMs=profileNow()-cpuStart;
      if(cancelled()||!state.compareLast.A)throw Error('Adaptive GPU CPU reference missing');
      var referenceCanvas=state.compareGraphs.A.Canvas,variants={};
      ['base4096','adaptive4608','dense4608'].forEach(function(key){
        variants[key]={rayBudget:key==='base4096'?baseCount:baseCount+extraBudget,
          timings:timing[key],rendererCounts:counts[key],
          fullFrameDiff:compareAdapter.compareFramePixels(referenceCanvas,snapshots[key]),
          lowerRightFrameDiff:compareAdapter.compareFramePixels(referenceCanvas,snapshots[key],roi),
          pixelHeatmap:compareAdapter.frameDifferenceTiles(referenceCanvas,snapshots[key],16,12)};
      });
      var measured=Object.keys(variants).every(function(key){
        return variants[key].fullFrameDiff.status==='measured'&&
          variants[key].lowerRightFrameDiff.status==='measured'&&
          variants[key].pixelHeatmap.status==='measured';});
      // The overlay result is displayed after measurement. This untimed
      // repaint is not used for choosing refinement points or comparisons.
      state.probeField=adaptiveField;
      if(state.compareCache.B)state.compareCache.B.clearCache();
      state.compareGraphs.B.Redraw();
      if(el('ModernCompareLabelB'))el('ModernCompareLabelB').textContent=
        'GPU predictor · sparse adaptive 4096+512 (approximate)';
      var sharedPeak=Math.max(variants.adaptive4608.pixelHeatmap.maxTileCount||0,
        variants.dense4608.pixelHeatmap.maxTileCount||0);
      paintGpuDifferenceHeatmap('ModernGpuAdaptiveHeatmap',variants.adaptive4608.pixelHeatmap,sharedPeak);
      paintGpuDifferenceHeatmap('ModernGpuDenseHeatmap',variants.dense4608.pixelHeatmap,sharedPeak);
      if(mapGroup)mapGroup.hidden=!measured;
      state.probeFrameLast={version:'140.12.18',
        kind:'GPU-query-selected sparse refinement vs equal-ray dense distance grid',
        geometry:baseGrid.request.geometry,atmosphere:'standard',gpuAlgorithm:'predictor',
        gpuRK4StepMetres:500,gpuSetupMs:session.setupMs,baseRays:baseCount,
        extraRayBudget:extraBudget,actualRefinementRays:candidates.length,
        adaptiveTotalRays:baseCount+candidates.length,denseTotalRays:baseCount+extraBudget,
        refinementReasons:reasonCounts,refinementSelection:'GPU B renderer queries only',
        cpuColdReferenceMs:cpuMs,lowerRightRegion:roi,variants:variants,
        sameRayBudget:candidates.length===extraBudget,sharedGpuSession:true,
        cpuOracleDiscovery:false,cpuShootingFallback:false,
        includesDiscoveryFrameInAdaptiveTime:true,
        displayVariant:'adaptive4608',productionAuthorized:false,
        visualEquivalenceProven:false,
        verdict:measured?'MEASURED_VISUAL_REVIEW_REQUIRED':'PIXEL_READBACK_UNAVAILABLE'};
      var roiInfo=Object.keys(variants).map(function(key){return key+': '+
        variants[key].lowerRightFrameDiff.significantPixels;}).join(' / ');
      var fmt=function(n){return Number.isFinite(n)?n.toFixed(1):'n/a';};
      probeStatus('Adaptive GPU vs dense · lower-right significant pixels '+roiInfo+
        ' · adaptive inclusive '+fmt(timing.adaptive4608.frameEndToEndMs)+
        ' ms / dense '+fmt(timing.dense4608.frameEndToEndMs)+
        ' ms · CPU cold '+fmt(cpuMs)+' ms · visual approval NOT established');
      var line=probeUi('ModernGpuFrameMetrics');
      if(line)line.textContent='GPU refinement '+candidates.length+'/'+extraBudget+
        ' · lower-right '+roiInfo+' · full-frame '+Object.keys(variants).map(function(key){
          return key+': '+variants[key].fullFrameDiff.significantPixels;
        }).join(' / ')+' · see two spatial pixel-difference maps below; Export JSON.';
    }catch(error){
      if(generation===state.probeGeneration){
        state.probeField=null;state.probeFrameLast=null;
        probeStatus('Adaptive GPU experiment unavailable: '+String(error.message||error));
        if(state.compareCache.B)state.compareCache.B.clearCache();
        state.compareGraphs.B.Redraw();
      }
    }finally{
      state.probeForceColdA=false;
      if(session)session.close();
      state.probeBusy=false;
      buttons.forEach(function(button){if(button)button.disabled=false;});
    }
  }
  // #140.12.19: controlled near-geometry hypothesis test, not a new
  // production renderer. GPU predictor samples are reused for all variants;
  // switching the FIRST 1.5 / 3 / 6 km to the existing analytic vacuum
  // projection makes it possible to locate near-tower errors separately
  // from far refractive shooting. CPU A is measured only afterwards.
  async function runCompareNearGeometry141219(){
    if(state.probeBusy||state.mode!=='compare'||!state.compareGpuProbe)return;
    var spec=state.compareConfig&&state.compareConfig.A;
    if(!spec||spec.atmosphere!=='standard'){
      probeStatus('Near-geometry experiment supports standard atmosphere only.');return;
    }
    var gpu=root.CurvatureWebGPUBatchShooting1412,
      contract=root.CurvatureOpticalBatchContract1411,
      physical=root.CurvaturePhysicalSceneOptics;
    if(!gpu||!contract||!root.navigator||!root.navigator.gpu||!compareAdapter||
        !compareAdapter.nearGeometricField||!compareAdapter.gpuFirstGrid||
        !compareAdapter.gpuFirstBatchRequests||!compareAdapter.gpuFirstRayField||
        !compareAdapter.compareFramePixels||!physical||!physical.vacuumSample||
        !root.CurvatureIndependentComposition||!root.CurvatureOpticalTowerSilhouette||
        !root.CurvatureSurfaceGeometry||!state.compareGraphs.A||!state.compareGraphs.B){
      probeStatus('Near-geometry experiment dependencies unavailable.');return;
    }
    var generation=state.probeGeneration,session=null,
      ids=['ModernGpuFirstRun','ModernGpuProbeRun','ModernGpuFrameRun',
        'ModernGpuFastRun','ModernGpuNearRun','ModernGpuGridABCRun',
        'ModernGpuAdaptiveRun','ModernGpuNearGeometryRun'],
      buttons=ids.map(probeUi),roi={x:0.55,y:0.55,width:0.45,height:0.45},
      budgets=[1500,3000,6000],snapshots={},variants={},fields={};
    state.probeBusy=true;state.probeField=null;state.probeFrameLast=null;
    var maps=probeUi('ModernGpuDiffMaps');if(maps)maps.hidden=true;
    buttons.forEach(function(b){if(b)b.disabled=true;});
    function cancelled(){return generation!==state.probeGeneration||
      state.mode!=='compare'||!state.compareGpuProbe;}
    function paint(key,field){
      state.probeField=field;
      if(state.compareCache.B)state.compareCache.B.clearCache();
      state.compareLast.B=null;
      var started=profileNow();state.compareGraphs.B.Redraw();
      var elapsed=profileNow()-started,source=state.compareGraphs.B.Canvas,
        copy=document.createElement('canvas');
      copy.width=source.width;copy.height=source.height;
      var ctx=copy.getContext&&copy.getContext('2d');
      if(!ctx||!ctx.drawImage)throw Error('Near-geometry Canvas snapshot unavailable');
      ctx.drawImage(source,0,0);
      if(!state.compareLast.B||!state.compareLast.B.fieldStats||
          !state.compareLast.B.fieldStats.experimentalGpu||
          state.compareLast.B.fieldStats.experimentalGpu.kind!=='gpu-first-grid')
        throw Error('Near-geometry field did not reach the physical renderer');
      snapshots[key]=copy;
      variants[key]={paintMs:elapsed,
        rendererCounts:{contours:state.compareLast.B.drawn,
          fillTriangles:state.compareLast.B.fillTriangles,
          unresolved:state.compareLast.B.unresolved},
        fieldStats:state.compareLast.B.fieldStats.experimentalGpu};
    }
    try{
      var deps={composition:root.CurvatureIndependentComposition,
        silhouette:root.CurvatureOpticalTowerSilhouette,
        surfaces:root.CurvatureSurfaceGeometry,branch:contract.BRANCH};
      probeStatus('Near geometry: preparing shared 4096-ray WebGPU predictor…');
      session=await gpu.createSession(1024,null,
        {algorithm:'predictor',refinement:'residual-stop'});
      if(cancelled())return;
      var gpuStart=profileNow(),grid=compareAdapter.gpuFirstGrid(
        state.comparePair.A,4096,deps,{layout:'distance-focused'});
      var prepared=profileNow(),requests=compareAdapter.gpuFirstBatchRequests(grid,1024),
        responses=[],batchTimes=[];
      for(var request of requests){
        request.controls.step=500;gpu.checked(request);
        var batch=await session.solve(request,{warmRepeats:0});
        if(cancelled())return;
        responses.push.apply(responses,batch.response.results);
        batchTimes.push(batch.timing.gpuUploadToReadbackMs);
      }
      var completed=profileNow(),sharedResponse={results:responses};
      fields.base4096=compareAdapter.gpuFirstRayField(grid,sharedResponse,deps.surfaces);
      paint('base4096',fields.base4096);
      if(cancelled())return;
      for(var limit of budgets){
        var key='geometric'+limit;
        fields[key]=compareAdapter.nearGeometricField(fields.base4096,
          state.comparePair.A,deps.surfaces,physical.vacuumSample,limit);
        probeStatus('Near geometry: painting direct projections through '+limit+' m…');
        paint(key,fields[key]);
        if(cancelled())return;
        variants[key].nearGeometryAudit=fields[key].nearAudit();
      }
      probeStatus('Near geometry: calculating independent CPU f64 reference…');
      state.probeForceColdA=true;
      var cpuStart=profileNow();
      try{state.compareGraphs.A.Redraw();}finally{state.probeForceColdA=false;}
      var cpuMs=profileNow()-cpuStart;
      if(cancelled()||!state.compareLast.A)throw Error('Near-geometry CPU reference missing');
      var cpuCanvas=state.compareGraphs.A.Canvas;
      ['base4096','geometric1500','geometric3000','geometric6000'].forEach(function(key){
        variants[key].fullFrameDiff=compareAdapter.compareFramePixels(cpuCanvas,snapshots[key]);
        variants[key].lowerRightFrameDiff=compareAdapter.compareFramePixels(
          cpuCanvas,snapshots[key],roi);
        if(key!=='base4096'){
          variants[key].deltaFromGpuBaseline={
            fullFrameSignificantPixels:variants[key].fullFrameDiff.significantPixels-
              variants.base4096.fullFrameDiff.significantPixels,
            lowerRightSignificantPixels:variants[key].lowerRightFrameDiff.significantPixels-
              variants.base4096.lowerRightFrameDiff.significantPixels};
          variants[key].pixelsChangedFromGpuBaseline=compareAdapter.compareFramePixels(
            snapshots.base4096,snapshots[key]);
        }
      });
      var measured=Object.keys(variants).every(function(key){return variants[key].fullFrameDiff.status==='measured'&&
        variants[key].lowerRightFrameDiff.status==='measured';});
      // Display the central 3 km hypothesis; do not select a winner with CPU.
      state.probeField=fields.geometric3000;
      if(state.compareCache.B)state.compareCache.B.clearCache();
      state.compareGraphs.B.Redraw();
      if(el('ModernCompareLabelB'))el('ModernCompareLabelB').textContent=
        'GPU predictor + geometric near ≤ 3 km · diagnostic only';
      state.probeFrameLast={version:'140.12.19',
        kind:'Shared-GPU near-tower analytic geometric projection vs refracted GPU and CPU f64',
        geometry:grid.request.geometry,atmosphere:'standard',
        gpuAlgorithm:'predictor',gpuRK4StepMetres:500,
        gpuSetupMs:session.setupMs,gpuGridLayout:'distance-focused',
        gpuSeedRays:4096,gpuBatchReadbackTimesMs:batchTimes,
        sharedGridPrepareMs:prepared-gpuStart,sharedGpuBatchWallMs:completed-prepared,
        cpuColdReferenceMs:cpuMs,nearGeometricLimitsMetres:budgets,
        nearGeometryModel:'analytic vacuum with physical spherical horizon',
        geometryAppliedToNearGroundGuides:true,
        sameSharedGpuSamples:true,noExtraGpuRays:true,
        cpuOracleDiscovery:false,cpuShootingFallback:false,
        regionIsUserObservedApproximation:true,lowerRightRegion:roi,
        variants:variants,displayVariant:'geometric3000',
        productionAuthorized:false,visualEquivalenceProven:false,
        verdict:measured?'MEASURED_VISUAL_REVIEW_REQUIRED':'PIXEL_READBACK_UNAVAILABLE'};
      var line=probeUi('ModernGpuFrameMetrics'),fmt=function(x){return Number.isFinite(x)?x.toFixed(1):'n/a';};
      var summary=Object.keys(variants).map(function(key){return key+' '+
        variants[key].lowerRightFrameDiff.significantPixels;}).join(' / ');
      if(line)line.textContent='Near geometry · lower-right significant pixels '+summary+
        ' · shared GPU '+fmt(completed-gpuStart)+' ms · CPU cold '+fmt(cpuMs)+
        ' ms · detailed direct/GPU angular disagreement in Export JSON.';
      probeStatus('Near geometry · lower-right '+summary+
        ' · CPU f64 reference '+fmt(cpuMs)+' ms · no production approval · Export JSON');
    }catch(error){
      if(generation===state.probeGeneration){
        state.probeField=null;state.probeFrameLast=null;
        probeStatus('Near-geometry experiment unavailable: '+String(error.message||error));
        if(state.compareCache.B)state.compareCache.B.clearCache();
        state.compareGraphs.B.Redraw();
      }
    }finally{
      state.probeForceColdA=false;
      if(session)session.close();
      state.probeBusy=false;
      buttons.forEach(function(b){if(b)b.disabled=false;});
    }
  }
  // #140.12.20: isolate *which* visibility decision loses lower geometry.
  // Only the original GPU B frame discovers targets. Exact CPU f64 is run
  // AFTER both grid interpolation and direct GPU shooting, never as fallback.
  async function runCompareRendererVisibility141220(){
    if(state.probeBusy||state.mode!=='compare'||!state.compareGpuProbe)return;
    var spec=state.compareConfig&&state.compareConfig.A;
    if(!spec||spec.atmosphere!=='standard'){
      probeStatus('Renderer visibility audit supports standard atmosphere only.');return;
    }
    var gpu=root.CurvatureWebGPUBatchShooting1412,
      contract=root.CurvatureOpticalBatchContract1411;
    if(!gpu||!contract||!root.navigator||!root.navigator.gpu||!compareAdapter||
        !compareAdapter.gpuFirstGrid||!compareAdapter.gpuFirstBatchRequests||
        !compareAdapter.gpuFirstRayField||!compareAdapter.captureGpuRendererQueries||
        !compareAdapter.compareRendererVisibility||!root.CurvatureIndependentComposition||
        !root.CurvatureOpticalTowerSilhouette||!root.CurvatureSurfaceGeometry||
        !state.compareGraphs.A||!state.compareGraphs.B){
      probeStatus('Renderer visibility audit WebGPU / Compare dependencies unavailable.');return;
    }
    var generation=state.probeGeneration,session=null,
      ids=['ModernGpuFirstRun','ModernGpuProbeRun','ModernGpuFrameRun',
        'ModernGpuFastRun','ModernGpuNearRun','ModernGpuGridABCRun',
        'ModernGpuAdaptiveRun','ModernGpuNearGeometryRun','ModernGpuRendererVisibilityRun'],
      buttons=ids.map(probeUi),targetBudget=128,
      roi={x:0.55,y:0.55,width:0.45,height:0.45};
    state.probeBusy=true;state.probeField=null;state.probeFrameLast=null;
    var maps=probeUi('ModernGpuDiffMaps');if(maps)maps.hidden=true;
    buttons.forEach(function(b){if(b)b.disabled=true;});
    function cancelled(){return generation!==state.probeGeneration||
      state.mode!=='compare'||!state.compareGpuProbe;}
    try{
      var deps={composition:root.CurvatureIndependentComposition,
        silhouette:root.CurvatureOpticalTowerSilhouette,
        surfaces:root.CurvatureSurfaceGeometry,branch:contract.BRANCH};
      probeStatus('Visibility audit: preparing shared 4096-ray GPU grid…');
      session=await gpu.createSession(1024,null,
        {algorithm:'predictor',refinement:'residual-stop'});
      if(cancelled())return;
      var begun=profileNow(),grid=compareAdapter.gpuFirstGrid(state.comparePair.A,
        4096,deps,{layout:'distance-focused'}),responses=[],batchTimes=[];
      var gridPrepared=profileNow();
      for(var request of compareAdapter.gpuFirstBatchRequests(grid,1024)){
        request.controls.step=500;gpu.checked(request);
        var batch=await session.solve(request,{warmRepeats:0});
        if(cancelled())return;
        responses.push.apply(responses,batch.response.results);
        batchTimes.push(batch.timing.gpuUploadToReadbackMs);
      }
      var gridSolved=profileNow(),field=compareAdapter.gpuFirstRayField(grid,
        {results:responses},deps.surfaces),captured=compareAdapter.captureGpuRendererQueries(field,
          {maximumDistance:6000,maximumHeight:20});
      state.probeField=captured;
      if(state.compareCache.B)state.compareCache.B.clearCache();
      state.compareLast.B=null;
      var paintBegin=profileNow();state.compareGraphs.B.Redraw();
      var gpuPaintMs=profileNow()-paintBegin,gridAndPaintMs=profileNow()-begun;
      if(cancelled()||!state.compareLast.B||!state.compareLast.B.fieldStats||
          !state.compareLast.B.fieldStats.experimentalGpu)
        throw Error('Visibility audit GPU field did not reach physical renderer');
      var snapshot=document.createElement('canvas'),canvas=state.compareGraphs.B.Canvas;
      snapshot.width=canvas.width;snapshot.height=canvas.height;
      var ctx=snapshot.getContext&&snapshot.getContext('2d');
      if(!ctx||!ctx.drawImage)throw Error('Visibility audit Canvas snapshot unavailable');
      ctx.drawImage(canvas,0,0);
      var capturedCounts={contours:state.compareLast.B.drawn,
        fillTriangles:state.compareLast.B.fillTriangles,
        unresolved:state.compareLast.B.unresolved},
        rendererCapture=captured.audit(),selected=captured.select(targetBudget);
      if(!selected.length)throw Error('No lower-object-height renderer queries were captured');
      // The GPU predictor and CPU oracle receive precisely the same target
      // coordinates. The only intentional difference is their integration
      // tolerance/step; report both explicitly rather than claiming identity.
      var metric=deps.surfaces.createFromCurvature(
        grid.request.geometry==='globe'?1/grid.request.radius:0);
      var targets=selected.map(function(row){return metric.surfacePoint2(row.d,row.h);});
      var exactRequest=Object.assign({},grid.request,{controls:Object.assign({},
        grid.request.controls,{step:500}),targets:targets});
      gpu.checked(exactRequest);
      probeStatus('Visibility audit: '+selected.length+' real renderer targets · direct GPU predictor…');
      var directBegin=profileNow(),directBatch=await session.solve(exactRequest,{warmRepeats:0});
      if(cancelled())return;
      var directGpuMs=profileNow()-directBegin;
      // CPU reference uses the physical renderer's standard-atmosphere step
      // policy, not GPU f32 numbers. Its exhaustive f64 shooting does NOT
      // change the B frame or any chosen target.
      var physicalCpuStep=Math.max(20,Math.min(2000,grid.request.radius/3000));
      var cpuRequest=Object.assign({},exactRequest,{controls:Object.assign({},
        exactRequest.controls,{step:physicalCpuStep,targetTolerance:1e-6})});
      probeStatus('Visibility audit: independent CPU f64 shooting for '+selected.length+' targets…');
      var cpuBegin=profileNow(),reference=await contract.solveCpuBatch(cpuRequest),
        cpuTargetMs=profileNow()-cpuBegin;
      if(cancelled())return;
      var comparison=compareAdapter.compareRendererVisibility(selected,reference,
        directBatch.response);
      probeStatus('Visibility audit: independent CPU f64 image and pixel difference…');
      state.probeForceColdA=true;
      var imageCpuBegin=profileNow();
      try{state.compareGraphs.A.Redraw();}finally{state.probeForceColdA=false;}
      var cpuFrameMs=profileNow()-imageCpuBegin;
      if(cancelled()||!state.compareLast.A)throw Error('Visibility audit CPU frame unavailable');
      var fullDiff=compareAdapter.compareFramePixels(state.compareGraphs.A.Canvas,snapshot),
        lowerDiff=compareAdapter.compareFramePixels(state.compareGraphs.A.Canvas,snapshot,roi);
      // Restore the untouched grid field (not a new CPU-guided GPU hybrid).
      state.probeField=field;
      if(state.compareCache.B)state.compareCache.B.clearCache();
      state.compareGraphs.B.Redraw();
      if(el('ModernCompareLabelB'))el('ModernCompareLabelB').textContent=
        'GPU predictor · 4096 grid (visibility audit only)';
      state.probeFrameLast={version:'140.12.20',
        kind:'Same-renderer-target CPU f64 vs interpolated GPU vs direct GPU visibility audit',
        geometry:grid.request.geometry,atmosphere:'standard',
        gpuAlgorithm:'predictor',gpuRK4StepMetres:500,
        gridRays:4096,directTargetBudget:targetBudget,directTargets:selected.length,
        gpuSetupMs:session.setupMs,gridPrepareMs:gridPrepared-begun,
        gridGpuBatchWallMs:gridSolved-gridPrepared,
        gridGpuReadbackTimesMs:batchTimes,gpuFramePaintMs:gpuPaintMs,
        gridAndPaintMs:gridAndPaintMs,
        directGpuWallMs:directGpuMs,
        directGpuBatchReadbackMs:directBatch.timing.gpuUploadToReadbackMs,
        cpuF64TargetWallMs:cpuTargetMs,cpuF64FrameWallMs:cpuFrameMs,
        cpuF64TargetStepMetres:physicalCpuStep,
        cpuF64TargetToleranceMetres:1e-6,
        gpuDirectTargetToleranceMetres:exactRequest.controls.targetTolerance,
        rendererCapture:rendererCapture,rendererCounts:capturedCounts,
        statusAudit:comparison.summary,perTargetResults:comparison.rows,
        fullFrameDiff:fullDiff,lowerRightFrameDiff:lowerDiff,
        lowerRightRegion:roi,
        targetSelection:'GPU B physical renderer requests only, d <= 6 km, 0 <= h <= 20 m, stratified',
        cpuOracleDiscovery:false,cpuShootingFallback:false,
        directGpuAnswersNotInjectedIntoFrame:true,
        originalGpuFramePreserved:true,productionAuthorized:false,
        visualEquivalenceProven:false,
        verdict:'DIAGNOSTIC_STATUS_COMPARISON_ONLY'};
      var summary=comparison.summary,metricLine=probeUi('ModernGpuFrameMetrics');
      if(metricLine)metricLine.textContent='Visibility audit '+selected.length+
        ' renderer targets · status mismatches vs CPU: grid '+
        summary.gridVsCpuMismatches+' / direct GPU '+summary.directGpuVsCpuMismatches+
        ' · CPU-visible rejected: grid '+summary.cpuVisibleGridNonvisible+
        ' / direct '+summary.cpuVisibleDirectNonvisible+
        ' · pixel differences bottom-right '+lowerDiff.significantPixels+
        ' · Export JSON for ground contacts and per-target angles.';
      probeStatus('Visibility audit · '+selected.length+' targets · grid/CPU '+
        summary.gridVsCpuMismatches+' mismatches · directGPU/CPU '+
        summary.directGpuVsCpuMismatches+' · original B frame unchanged · Export JSON');
    }catch(error){
      if(generation===state.probeGeneration){
        state.probeField=null;state.probeFrameLast=null;
        probeStatus('Visibility audit unavailable: '+String(error.message||error));
        if(state.compareCache.B)state.compareCache.B.clearCache();
        state.compareGraphs.B.Redraw();
      }
    }finally{
      state.probeForceColdA=false;
      if(session)session.close();
      state.probeBusy=false;buttons.forEach(function(b){if(b)b.disabled=false;});
    }
  }
  // #140.12.21: independent status-only GPU experiments. CPU f64 is used
  // for reference AFTER all B variants; it neither selects nor fixes targets.
  // This is intentionally a two-paint diagnostic, NOT an optimized frame path.
  async function runGpuStatusQualification141221(){
    if(state.probeBusy||state.mode!=='compare'||!state.compareGpuProbe)return;
    var spec=state.compareConfig&&state.compareConfig.A;
    if(!spec||spec.atmosphere!=='standard'){
      probeStatus('Status qualification supports standard atmosphere only.');return;
    }
    var gpu=root.CurvatureWebGPUBatchShooting1412,
      contract=root.CurvatureOpticalBatchContract1411;
    if(!gpu||!contract||!root.navigator||!root.navigator.gpu||!compareAdapter||
        !compareAdapter.gpuFirstGrid||!compareAdapter.gpuFirstBatchRequests||
        !compareAdapter.gpuFirstRayField||!compareAdapter.captureGpuRendererQueries||
        !compareAdapter.selectIndeterminateRendererTargets||
        !compareAdapter.gpuStatusQualificationField||!root.CurvatureIndependentComposition||
        !root.CurvatureOpticalTowerSilhouette||!root.CurvatureSurfaceGeometry||
        !state.compareGraphs.A||!state.compareGraphs.B){
      probeStatus('GPU status qualification dependencies unavailable.');return;
    }
    var directToggle=probeUi('ModernGpuStatusDirectToggle'),
      contactToggle=probeUi('ModernGpuContactQualificationToggle'),
      useDirect=!!directToggle&&directToggle.checked,
      useFine=!!contactToggle&&contactToggle.checked;
    if(!useDirect&&!useFine){probeStatus('Select at least one GPU status experiment.');return;}
    var generation=state.probeGeneration,session=null,
      ids=['ModernGpuFirstRun','ModernGpuProbeRun','ModernGpuFrameRun',
        'ModernGpuFastRun','ModernGpuNearRun','ModernGpuGridABCRun',
        'ModernGpuAdaptiveRun','ModernGpuNearGeometryRun','ModernGpuRendererVisibilityRun',
        'ModernGpuStatusQualificationRun'],buttons=ids.map(probeUi),
      targetBudget=128,roi={x:0.55,y:0.55,width:0.45,height:0.45};
    state.probeBusy=true;state.probeField=null;state.probeFrameLast=null;
    buttons.forEach(function(b){if(b)b.disabled=true;});
    if(directToggle)directToggle.disabled=true;
    if(contactToggle)contactToggle.disabled=true;
    var maps=probeUi('ModernGpuDiffMaps');if(maps)maps.hidden=true;
    function cancelled(){return generation!==state.probeGeneration||
      state.mode!=='compare'||!state.compareGpuProbe;}
    function snapshot(){
      var canvas=state.compareGraphs.B.Canvas,copy=document.createElement('canvas');
      copy.width=canvas.width;copy.height=canvas.height;
      var ctx=copy.getContext&&copy.getContext('2d');
      if(!ctx||!ctx.drawImage)throw Error('Status qualification Canvas snapshot unavailable');
      ctx.drawImage(canvas,0,0);return copy;
    }
    try{
      var deps={composition:root.CurvatureIndependentComposition,
        silhouette:root.CurvatureOpticalTowerSilhouette,
        surfaces:root.CurvatureSurfaceGeometry,branch:contract.BRANCH};
      probeStatus('GPU status experiment: preparing 4096 near-distance rays…');
      session=await gpu.createSession(1024,null,
        {algorithm:'predictor',refinement:'residual-stop'});
      if(cancelled())return;
      var start=profileNow(),grid=compareAdapter.gpuFirstGrid(state.comparePair.A,
        4096,deps,{layout:'distance-focused'}),gridPrepared=profileNow(),responses=[];
      for(var request of compareAdapter.gpuFirstBatchRequests(grid,1024)){
        request.controls.step=500;gpu.checked(request);
        var batch=await session.solve(request,{warmRepeats:0});
        if(cancelled())return;
        responses.push.apply(responses,batch.response.results);
      }
      var gridDone=profileNow(),base=compareAdapter.gpuFirstRayField(grid,
        {results:responses},deps.surfaces),capture=compareAdapter.captureGpuRendererQueries(base,
          {maximumDistance:6000,maximumHeight:20}),variants={},snapshots={};
      function paint(key,field){
        state.probeField=field;
        if(state.compareCache.B)state.compareCache.B.clearCache();
        state.compareLast.B=null;
        var begun=profileNow();state.compareGraphs.B.Redraw();
        if(!state.compareLast.B||!state.compareLast.B.fieldStats||
            !state.compareLast.B.fieldStats.experimentalGpu)
          throw Error('GPU status qualification field did not reach physical renderer');
        variants[key]={paintMs:profileNow()-begun,
          rendererCounts:{contours:state.compareLast.B.drawn,
            fillTriangles:state.compareLast.B.fillTriangles,
            unresolved:state.compareLast.B.unresolved},
          fieldStats:state.compareLast.B.fieldStats.experimentalGpu};
        snapshots[key]=snapshot();
      }
      paint('base4096',capture);
      if(cancelled())return;
      var rendererCapture=capture.audit(),selected=
        compareAdapter.selectIndeterminateRendererTargets(capture,targetBudget);
      if(!selected.length)throw Error('No indeterminate renderer targets within 6 km / 20 m');
      var metric=deps.surfaces.createFromCurvature(
        grid.request.geometry==='globe'?1/grid.request.radius:0),
        targets=selected.map(function(row){return metric.surfacePoint2(row.d,row.h);}),
        directRequest=Object.assign({},grid.request,{controls:Object.assign({},
          grid.request.controls,{step:500}),targets:targets});
      gpu.checked(directRequest);
      probeStatus('GPU status experiment: '+selected.length+' uncertain targets · direct GPU 500 m…');
      var directStart=profileNow(),directBatch=await session.solve(directRequest,{warmRepeats:0}),
        directMs=profileNow()-directStart;
      if(cancelled())return;
      var fineResults=[],fineMs=0,fineBatchTimes=[],fineRequest=null,
        fineRows=[];
      if(useFine){
        fineRows=selected.filter(function(row,i){
          return directBatch.response.results[i].status==='indeterminate';
        });
        if(fineRows.length){
          fineRequest=Object.assign({},directRequest,{controls:Object.assign({},
            directRequest.controls,{step:50}),targets:fineRows.map(function(row){
              return metric.surfacePoint2(row.d,row.h);
            })});
          gpu.checked(fineRequest);
          probeStatus('GPU contact qualification: '+fineRows.length+' still-uncertain rays · 50 m RK4…');
          var fineStart=profileNow();
          var fineBatch=await session.solve(fineRequest,{warmRepeats:0});
          fineMs=profileNow()-fineStart;
          fineBatchTimes.push(fineBatch.timing.gpuUploadToReadbackMs);
          fineResults=fineRows.map(function(row,i){return {sample:row,
            result:fineBatch.response.results[i]};});
        }
      }
      if(cancelled())return;
      var audit={direct500:{visible:0,blocked:0,indeterminate:0,solver_failed:0},
        fine50:{visible:0,blocked:0,indeterminate:0,solver_failed:0},
        groundContacts500:{crossing:0,grazing:0,none:0},
        groundContacts50:{crossing:0,grazing:0,none:0},
        directIndeterminateToFineVisible:0,directIndeterminateToFineBlocked:0};
      function tally(result,field,contacts){
        audit[field][result.status]++;
        var event=result.ground&&result.ground.event;
        audit[contacts][event?event.contact:'none']++;
      }
      directBatch.response.results.forEach(function(item){tally(item,'direct500','groundContacts500');});
      fineResults.forEach(function(item){
        tally(item.result,'fine50','groundContacts50');
        if(item.result.status==='visible')audit.directIndeterminateToFineVisible++;
        if(item.result.status==='blocked')audit.directIndeterminateToFineBlocked++;
      });
      var combinations=[['directOnly',true,false],['fineOnly',false,true],
        ['combined',true,true]].filter(function(row){
          return (row[1]&&useDirect&&!row[2])||
            (row[2]&&useFine&&!row[1])||
            (row[1]&&row[2]&&useDirect&&useFine);
        }),fields={};
      combinations.forEach(function(row){
        var field=compareAdapter.gpuStatusQualificationField(base,selected,
          directBatch.response,{useDirect:row[1],useFine:row[2],
            fineResults:fineResults,surfaces:deps.surfaces});
        fields[row[0]]=field;
        probeStatus('GPU status experiment: painting '+row[0]+'…');
        paint(row[0],field);
        variants[row[0]].qualification=field.qualificationAudit();
      });
      if(cancelled())return;
      // Independent f64 samples are also acquired only after ALL GPU B
      // variants have been selected and painted. They cannot guide repair.
      var cpuTargetRequest=Object.assign({},directRequest,{controls:Object.assign({},
        directRequest.controls,{step:Math.max(20,Math.min(2000,
          grid.request.radius/3000)),targetTolerance:1e-6})});
      var cpuTargetStart=profileNow(),cpuTargetBatch=await contract.solveCpuBatch(cpuTargetRequest),
        cpuTargetsMs=profileNow()-cpuTargetStart;
      if(cancelled())return;
      var cpuTargetAudit=compareAdapter.compareRendererVisibility(selected,
        cpuTargetBatch,directBatch.response),fineByKey=new Map();
      fineResults.forEach(function(item){fineByKey.set(item.sample.d+','+item.sample.h,item.result);});
      var fineCpuMismatches=0,directCpuMismatches=0,fineResolvedCpuVisible=0;
      var perTargetResults=selected.map(function(row,i){
        var d=directBatch.response.results[i],c=cpuTargetBatch.results[i],
          f=fineByKey.get(row.d+','+row.h)||null;
        if(c.status!==d.status)directCpuMismatches++;
        if(f&&f.status!==c.status)fineCpuMismatches++;
        if(f&&c.status==='visible'&&d.status==='indeterminate'&&f.status==='visible')
          fineResolvedCpuVisible++;
        function contact(result){
          var event=result&&result.ground&&result.ground.event;
          return {status:result?result.status:null,
            contact:event?event.contact:null,
            hitGround:result&&result.ground?result.ground.hitGround:null,
            contactDistanceBeforeEndMetres:event&&Number.isFinite(result.pathLength)?
              result.pathLength-event.pathLength:null,
            residualMetres:result&&Number.isFinite(result.residual)?result.residual:null};
        }
        return {d:row.d,h:row.h,gridStatus:row.gridStatus,
          cpuStatus:c.status,direct500:contact(d),fine50:contact(f)};
      });
      // Reference rendering is deliberately last: no CPU value can influence
      // target selection, status upgrades, or the B frame variants above.
      probeStatus('GPU status experiment: cold independent CPU f64 frame…');
      state.probeForceColdA=true;
      var cpuStart=profileNow();
      try{state.compareGraphs.A.Redraw();}finally{state.probeForceColdA=false;}
      var cpuMs=profileNow()-cpuStart;
      if(cancelled()||!state.compareLast.A)throw Error('CPU reference missing');
      Object.keys(variants).forEach(function(key){
        variants[key].fullFrameDiff=compareAdapter.compareFramePixels(
          state.compareGraphs.A.Canvas,snapshots[key]);
        variants[key].lowerRightFrameDiff=compareAdapter.compareFramePixels(
          state.compareGraphs.A.Canvas,snapshots[key],roi);
        if(key!=='base4096'){
          variants[key].changedFromBase=compareAdapter.compareFramePixels(
            snapshots.base4096,snapshots[key]);
          variants[key].deltaSignificantPixels={
            fullFrame:variants[key].fullFrameDiff.significantPixels-
              variants.base4096.fullFrameDiff.significantPixels,
            lowerRight:variants[key].lowerRightFrameDiff.significantPixels-
              variants.base4096.lowerRightFrameDiff.significantPixels};
        }
      });
      // Keep the combined variant visible when both switches were selected.
      var shown=useDirect&&useFine?'combined':useDirect?'directOnly':'fineOnly';
      state.probeField=fields[shown];
      if(state.compareCache.B)state.compareCache.B.clearCache();
      state.compareGraphs.B.Redraw();
      if(el('ModernCompareLabelB'))el('ModernCompareLabelB').textContent=
        'GPU status-only '+shown+' (diagnostic, 4096 + '+selected.length+' rays)';
      var measured=Object.keys(variants).every(function(key){
        return variants[key].fullFrameDiff.status==='measured'&&
          variants[key].lowerRightFrameDiff.status==='measured';
      });
      var gpuExperimentMs=profileNow()-start;
      state.probeFrameLast={version:'140.12.21',
        kind:'Independent GPU grid-status repair and finer-step contact qualification',
        geometry:grid.request.geometry,atmosphere:'standard',gpuAlgorithm:'predictor',
        baseGridRays:4096,directTargetBudget:targetBudget,directTargets:selected.length,
        fineTargets:fineRows.length,originalRK4StepMetres:500,
        fineContactRK4StepMetres:50,
        toggles:{useDirectStatus:useDirect,useFineContact:useFine},
        timings:{gpuSetupMs:session.setupMs,gpuExperimentWallMs:gpuExperimentMs,
          gridPrepareMs:gridPrepared-start,
          gridGpuWallMs:gridDone-gridPrepared,firstPaintMs:variants.base4096.paintMs,
          directGpuWallMs:directMs,fineGpuWallMs:fineMs,
          cpuF64ReferenceMs:cpuMs},
        fineGpuReadbackTimesMs:fineBatchTimes,
        cpuTargetAudit:cpuTargetAudit.summary,cpuF64TargetStepMetres:cpuTargetRequest.controls.step,
        cpuTargetWallMs:cpuTargetsMs,
        cpuStatusComparisons:{directVsCpuMismatches:directCpuMismatches,
          fineVsCpuMismatches:fineCpuMismatches,
          fineResolvedCpuVisible:fineResolvedCpuVisible},
        perTargetResults:perTargetResults,
        rendererCapture:rendererCapture,contactAudit:audit,
        variants:variants,displayVariant:shown,
        targetSelection:'Actual GPU B renderer indeterminate queries only; <=6km, <=20m',
        statusOnlyNoAngleReplacement:true,originalNonindeterminateGridStatusesPreserved:true,
        noCpuOracleTargetSelection:true,cpuShootingFallback:false,
        cpuAnswersNotInjectedIntoGPU:true,productionAuthorized:false,
        visualEquivalenceProven:false,
        verdict:measured?'DIAGNOSTIC_VISUAL_REVIEW_REQUIRED':'PIXEL_READBACK_UNAVAILABLE'};
      var metricLine=probeUi('ModernGpuFrameMetrics'),fmt=function(v){return Number.isFinite(v)?v.toFixed(1):'n/a';};
      if(metricLine)metricLine.textContent='GPU status experiments: '+selected.length+
        ' uncertain targets · fine contact '+fineRows.length+
        ' · direct 500m '+fmt(directMs)+'ms / fine 50m '+fmt(fineMs)+
        'ms · lower-right significant pixels: '+Object.keys(variants).map(function(key){
          return key+' '+variants[key].lowerRightFrameDiff.significantPixels;
        }).join(' · ')+' · CPU reference '+fmt(cpuMs)+'ms';
      probeStatus('GPU status qualification measured · '+Object.keys(variants).join(', ')+
        ' · both switches independent · no CPU fallback · Export JSON');
    }catch(error){
      if(generation===state.probeGeneration){
        state.probeField=null;state.probeFrameLast=null;
        probeStatus('GPU status qualification unavailable: '+String(error.message||error));
        if(state.compareCache.B)state.compareCache.B.clearCache();
        state.compareGraphs.B.Redraw();
      }
    }finally{
      state.probeForceColdA=false;
      if(session)session.close();
      state.probeBusy=false;
      buttons.forEach(function(b){if(b)b.disabled=false;});
      if(directToggle)directToggle.disabled=false;
      if(contactToggle)contactToggle.disabled=false;
    }
  }
  // #140.12.22: fixed near-surface / upper-tower precision ladder. No repaint,
  // CPU-guided target selection, GPU fallback, or production solver modification.
  async function runGpuPrecisionAudit141222(){
    if(state.probeBusy||state.mode!=='compare'||!state.compareGpuProbe)return;
    var gpu=root.CurvatureWebGPUBatchShooting1412,
      contract=root.CurvatureOpticalBatchContract1411,
      precision=root.CurvatureGpuPrecisionAudit141222,
      surfaces=root.CurvatureSurfaceGeometry,
      model=state.comparePair&&state.comparePair.A;
    if(!gpu||!contract||!precision||!surfaces||!model||
        !root.navigator||!root.navigator.gpu){
      probeStatus('GPU precision audit dependencies unavailable.');return;
    }
    var config=state.compareConfig&&state.compareConfig.A;
    if(!config||config.atmosphere!=='standard'){
      probeStatus('GPU precision audit requires standard atmosphere in A.');return;
    }
    var generation=state.probeGeneration,session=null,
      ids=['ModernGpuProbeRun','ModernGpuFrameRun','ModernGpuFirstRun',
        'ModernGpuFastRun','ModernGpuNearRun','ModernGpuGridABCRun',
        'ModernGpuAdaptiveRun','ModernGpuNearGeometryRun',
        'ModernGpuRendererVisibilityRun','ModernGpuStatusQualificationRun',
        'ModernGpuPrecisionAuditRun'],buttons=ids.map(probeUi),
      gpuResults={},gpuTimes={},cpuTimes={};
    function cancelled(){return generation!==state.probeGeneration||
      state.mode!=='compare'||!state.compareGpuProbe;}
    state.probeBusy=true;state.probeLast=null;state.probeFrameLast=null;
    buttons.forEach(function(b){if(b)b.disabled=true;});
    try{
      var ladder=precision.createLadder({branch:contract.BRANCH,
          geometry:model.showModel===2?'flat':'globe',radius:model.rEarth,
          observerHeight:model.Height},surfaces),runs=precision.stages(ladder);
      Object.keys(runs).forEach(function(key){gpu.checked(runs[key]);});
      probeStatus('GPU precision: initializing '+ladder.targetsCount+
        ' targets · 500 m / 50 m / strict 0.1 mm tolerance…');
      session=await gpu.createSession(ladder.targetsCount,null,
        {algorithm:'predictor',refinement:'residual-stop'});
      if(cancelled())return;
      for(var key of Object.keys(runs)){
        probeStatus('GPU precision: '+key+' · '+ladder.targetsCount+' targets…');
        var started=profileNow(),batch=await session.solve(runs[key],{warmRepeats:0});
        if(cancelled())return;
        gpuResults[key]=batch.response;
        gpuTimes[key]={wallMs:profileNow()-started,
          uploadToReadbackMs:batch.timing.gpuUploadToReadbackMs,
          predictorAccepted:batch.algorithm.predictorAccepted,
          predictorFallbacks:batch.algorithm.predictorFallbacks};
      }
      // Neither CPU batch can affect the already executed GPU workloads.
      probeStatus('GPU precision: GPU batches finished · independent CPU f64 reference…');
      var cpuResults={};
      for(var atmosphere of ['standard','vacuum']){
        var refRequest=Object.assign({},runs[atmosphere==='standard'?'standard500':'vacuum500'],
          {controls:{step:2000,targetTolerance:0.000001,eventSubsteps:8}});
        var cpuStart=profileNow();
        cpuResults[atmosphere]=await contract.solveCpuBatch(refRequest);
        cpuTimes[atmosphere]=profileNow()-cpuStart;
        if(cancelled())return;
      }
      var report=precision.audit(ladder,gpuResults,cpuResults);
      report.gpuAlgorithm='predictor';report.gpuArithmetic='f32, compensated RK4';
      report.geometry=ladder.request.geometry;
      report.atmosphere='standard with vacuum control';
      report.gpuSetupMs=session.setupMs;
      report.gpuRuns=gpuTimes;report.cpuF64ReferenceTimesMs=cpuTimes;
      report.cpuF64TargetStepMetres=2000;
      report.cpuOracleDiscovery=false;report.cpuAnswersNotInjectedIntoGPU=true;
      report.framePaintingChanged=false;
      report.verdict='MEASURED_NUMERIC_REVIEW_REQUIRED';
      state.probeFrameLast=report;
      var fmt=function(n){return Number.isFinite(n)?n.toFixed(2):'n/a';};
      var line=probeUi('ModernGpuFrameMetrics');
      if(line)line.textContent='GPU f32 precision ('+ladder.targetsCount+' targets): '+
        Object.keys(report.variants).map(function(k){var v=report.variants[k];
          return k+': '+v.statusMismatches+' status mismatches, '+
            fmt(v.upperHeightMeanAbsoluteAngleDeltaArcsec)+' arcsec upper-height mean';
        }).join(' · ')+' · CPU reference only · Export JSON';
      probeStatus('GPU precision ladder measured · 5 mm vs 0.1 mm tolerance, '+
        '500 m vs 50 m integration, vacuum control · no frame modifications · Export JSON');
    }catch(error){
      if(!cancelled()){
        state.probeFrameLast=null;
        probeStatus('GPU precision audit failed: '+String(error&&error.message||error));
      }
    }finally{
      if(session)session.close();state.probeBusy=false;
      buttons.forEach(function(b){if(b)b.disabled=false;});
    }
  }
  function bindCompareGpuProbe(){
    var kind=probeUi('ModernCompareKind'),run=probeUi('ModernGpuProbeRun');
    if(!kind||!run)return;
    kind.addEventListener('change',function(){
      state.compareGpuProbe=kind.value==='gpu-probe';
      var group=probeUi('ModernGpuCompareProbe');if(group)group.hidden=!state.compareGpuProbe;
      state.probeLast=null;state.probeField=null;state.probeFrameLast=null;
      state.probeGeneration++;
      var frameMetrics=probeUi('ModernGpuFrameMetrics');if(frameMetrics)frameMetrics.textContent='';
      var maps=probeUi('ModernGpuDiffMaps');if(maps)maps.hidden=true;
      if(state.compareGpuProbe){state.compareSelected='A';syncCompareEditor();}
      var bTab=probeUi('ModernModelTabB');if(bTab)bTab.disabled=state.compareGpuProbe;
      var preset=probeUi('ModernPairPreset');if(preset)preset.disabled=state.compareGpuProbe;
      probeStatus('Select Run to measure current scene.');
      redraw();
    });
    var countSelect=probeUi('ModernGpuProbeCount');
    if(countSelect)countSelect.addEventListener('change',function(){
      state.probeLast=null;state.probeField=null;state.probeFrameLast=null;
      state.probeGeneration++;
      probeStatus('Target count changed · rerun the CPU/GPU comparison.');
      // A stale GPU-painted image must not remain visible when target count
      // changes: repaint B with the regular CPU field immediately.
      redraw();
    });
    var gridSelect=probeUi('ModernGpuFastGridCount');
    if(gridSelect)gridSelect.addEventListener('change',function(){
      state.probeField=null;state.probeFrameLast=null;state.probeGeneration++;
      probeStatus('Fast GPU grid density changed · rerun the frame benchmark.');
      var label=el('ModernCompareLabelB');if(label)label.textContent='CPU f64 · GPU grid reset';
      var metrics=probeUi('ModernGpuFrameMetrics');if(metrics)metrics.textContent='';
      redraw();
    });
    run.addEventListener('click',runCompareGpuProbe);
    var frameButton=probeUi('ModernGpuFrameRun');
    if(frameButton)frameButton.addEventListener('click',runCompareGpuField);
    var firstButton=probeUi('ModernGpuFirstRun');
    if(firstButton)firstButton.addEventListener('click',function(){return runCompareGpuFirst(false);});
    var fastButton=probeUi('ModernGpuFastRun');
    if(fastButton)fastButton.addEventListener('click',function(){return runCompareGpuFirst(true);});
    var nearButton=probeUi('ModernGpuNearRun');
    if(nearButton)nearButton.addEventListener('click',runCompareGpuLocalAB);
    var abcButton=probeUi('ModernGpuGridABCRun');
    if(abcButton)abcButton.addEventListener('click',runCompareGpuGridABC);
    var adaptiveButton=probeUi('ModernGpuAdaptiveRun');
    if(adaptiveButton)adaptiveButton.addEventListener('click',runCompareGpuAdaptive141218);
    var precisionButton=probeUi('ModernGpuPrecisionAuditRun');
    if(precisionButton)precisionButton.addEventListener('click',runGpuPrecisionAudit141222);
    var qualificationButton=probeUi('ModernGpuStatusQualificationRun');
    if(qualificationButton)qualificationButton.addEventListener('click',runGpuStatusQualification141221);
    var visibilityButton=probeUi('ModernGpuRendererVisibilityRun');
    if(visibilityButton)visibilityButton.addEventListener('click',runCompareRendererVisibility141220);
    var nearGeometryButton=probeUi('ModernGpuNearGeometryRun');
    if(nearGeometryButton)nearGeometryButton.addEventListener('click',runCompareNearGeometry141219);
    ['ModernGpuProbeRun','ModernGpuFrameRun','ModernGpuFirstRun','ModernGpuFastRun',
      'ModernGpuNearRun','ModernGpuGridABCRun','ModernGpuNearGeometryRun',
      'ModernGpuRendererVisibilityRun','ModernGpuStatusQualificationRun',
      'ModernGpuPrecisionAuditRun'].forEach(function(id){
      var button=probeUi(id);if(button)button.addEventListener('click',function(){
        var maps=probeUi('ModernGpuDiffMaps');if(maps)maps.hidden=true;
      });
    });
    var exportButton=probeUi('ModernGpuProbeExport');
    if(exportButton)exportButton.addEventListener('click',function(){
      if(!state.probeLast&&!state.probeFrameLast){
        probeStatus('Run the CPU/GPU probe or build the replay/GPU frames before exporting.');return;
      }
      if(!root.Blob||!root.URL||!root.URL.createObjectURL){
        probeStatus('JSON export unavailable in this browser.');return;
      }
      var exportVersion=state.probeFrameLast&&state.probeFrameLast.version||'140.12.11';
      var report=state.probeLast?Object.assign({},state.probeLast,{version:exportVersion,
        sampleProbeVersion:state.probeLast.version,gpuAssistedFrame:state.probeFrameLast}):
        {version:exportVersion,gpuAssistedFrame:state.probeFrameLast};
      var blob=new root.Blob([JSON.stringify(report,null,2)],{type:'application/json'});
      var url=root.URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=exportVersion==='140.12.22'?
        'curvature-compare-140.12.22-gpu-f32-precision.json':
        exportVersion==='140.12.21'?
        'curvature-compare-140.12.21-gpu-status-qualification.json':
        exportVersion==='140.12.20'?
        'curvature-compare-140.12.20-renderer-visibility.json':
        exportVersion==='140.12.19'?
        'curvature-compare-140.12.19-near-geometric-projection.json':
        exportVersion==='140.12.18'?
        'curvature-compare-140.12.18-adaptive-vs-dense.json':
        exportVersion==='140.12.17'?
        'curvature-compare-140.12.17-grid-abc-lower-right.json':
        exportVersion==='140.12.16'?
        'curvature-compare-140.12.16-near-ground-ab.json':
        exportVersion==='140.12.15'?
        'curvature-compare-140.12.15-fast-predictor-frame.json':
        exportVersion==='140.12.12'?
        'curvature-compare-140.12.12-gpu-first-frame.json':
        'curvature-compare-140.12.11-cpu-replay-gpu-frame.json';
      try{link.click();}finally{
        if(typeof root.setTimeout==='function')root.setTimeout(function(){root.URL.revokeObjectURL(url);},1000);
        else root.URL.revokeObjectURL(url);
      }
    });
  }
  function prepareCompare(){
    if(!compareAdapter){updateStatus('Compare adapter is unavailable',true);return false;}
    if(compareState&&!state.compareConfig)
      state.compareConfig=compareState.initial(model,state.atmosphere,state.occlusionRadius);
    var result=compareState?compareState.pair(model,state.compareConfig,compareAdapter):compareAdapter.pair(model);
    if(!compareAdapter.invariant(result))throw Error('Compare shared-scene invariant failed');
    if(state.compareGpuProbe){
      // Matching physical models for CPU/GPU samples; neither canvas switches
      // its full-frame solver. Keep independent A/B user settings untouched.
      result.B=compareAdapter.clone(result.A);
    }
    state.comparePair=result;
    var aLabel=el('ModernCompareLabelA'),bLabel=el('ModernCompareLabelB');
    if(compareState){
      if(aLabel)aLabel.textContent=compareState.label(state.compareConfig.A);
      if(bLabel)bLabel.textContent=compareState.label(state.compareConfig.B);
    }else{
      if(aLabel)aLabel.textContent=(result.A.showModel===2?'Exact flat':'R = '+(result.A.rEarth/1000).toLocaleString('en-US')+' km')+' · '+state.atmosphere;
      if(bLabel)bLabel.textContent='κ = 0 · '+state.atmosphere;
    }
    if(state.compareGpuProbe){
      if(aLabel)aLabel.textContent='CPU f64 · physical frame';
      if(bLabel)bLabel.textContent=state.probeField?
        (state.probeField.fullCoverageGrid?'GPU-first grid · approximate physical frame':'GPU-assisted · physical frame'):
        'CPU f64 · before GPU-assisted render';
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
      standard:['Standard atmosphere · approximation','n(h) = 1 + 0.000293 × exp(−h / 7350 m)',
        'Simplified exponential decrease of refractivity with height; this is not a weather-dependent atmospheric model.',
        'Near-surface refractivity 293 ppm; scale height H = 7350 m.'],
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
      'exponential-occlusion':'<i>n</i>(<i>h</i>) = <i>n</i><sub>0</sub> <i>e</i><sup><span class="math-frac"><span><i>h</i></span><span><i>R</i></span></span></sup>',
      'inverse-spherical':'<i>n</i>(<i>h</i>) = <i>n</i><sub>0</sub> √(1 + (1 + <i>h</i>/<i>R</i>)<sup>4</sup> − (1 + <i>h</i>/<i>R</i>)<sup>2</sup>)'
    };
    formula.innerHTML=formulas[kind];node.appendChild(formula);
    var details=document.createElement('div');details.textContent=info[2];node.appendChild(details);
    var note=document.createElement('div');note.className='modern-atmosphere-note';
    note.textContent=info[3];node.appendChild(note);
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
      wrap.hidden=!['inverse-spherical','exponential-occlusion'].includes(spec.atmosphere);
    syncShimmerControls();
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
  state.graph=graph;
  function cancelPending(){
    if(state.curvatureCommitTimer!==null){
      clearTimeout(state.curvatureCommitTimer);state.curvatureCommitTimer=null;
    }
    state.curvaturePending=false;
    if(state.timer!==null){clearTimeout(state.timer);state.timer=null;}
    if(state.frame!==null){cancelAnimationFrame(state.frame);state.frame=null;}
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
      if(keepPreview===true)cameraPreview.hold(sample);
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
      try{
        cameraInteraction.begin({viewport:view,x:event.clientX,y:event.clientY,
          width:rect.width,height:rect.height,
          camera:{Pan:model.Pan,Nick:model.Nick,Roll:model.Roll},
          fovRadians:model.camViewAngle,aspectRatio:model.deviceRatio});
        if(cameraPreview){
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
        activeCameraPointer={canvas:canvas,id:event.pointerId,hud:hud};
        if(typeof canvas.setPointerCapture==='function')canvas.setPointerCapture(event.pointerId);
        if(event.preventDefault)event.preventDefault();
      }catch(error){cancelCameraDrag();updateStatus('Camera drag: '+error.message,true);}
    });
    canvas.addEventListener('pointermove',function(event){
      var active=activeCameraPointer;
      if(!active||active.canvas!==canvas||active.id!==event.pointerId)return;
      var sample=cameraInteraction.move({x:event.clientX,y:event.clientY});
      if(Math.hypot(sample.dx,sample.dy)<2)return;
      if(cameraPreview)cameraPreview.move(sample);
      if(hud){
        var target=root.CurvatureModernCameraInteraction.angles(sample);
        hud.textContent='Pan '+target.Pan.toFixed(4)+'°  ·  Nick '+target.Nick.toFixed(4)+'°';
        hud.hidden=false;
      }
      if(event.preventDefault)event.preventDefault();
    });
    canvas.addEventListener('pointerup',function(event){
      var active=activeCameraPointer;
      if(!active||active.canvas!==canvas||active.id!==event.pointerId)return;
      var sample=cameraInteraction.end({x:event.clientX,y:event.clientY});
      var changed=sample&&Math.hypot(sample.dx,sample.dy)>=2;
      cancelCameraDrag(changed,sample);
      if(!changed)return;
      try{
        var next=root.CurvatureModernCameraInteraction.angles(sample);
        if(next.Pan===model.Pan&&next.Nick===model.Nick){
          if(cameraPreview)cameraPreview.clear();
          if(atmosphericPresentation){atmosphericPresentation.resume();scheduleShimmerFrame();}
          return;
        }
        cancelEdits();
        if(adapter){adapter.setCamera(model,'Pan',next.Pan);adapter.setCamera(model,'Nick',next.Nick);}
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
        activeCameraPointer.id===event.pointerId)cancelCameraDrag();
    });
    canvas.addEventListener('lostpointercapture',function(event){
      if(activeCameraPointer&&activeCameraPointer.canvas===canvas&&
        activeCameraPointer.id===event.pointerId)cancelCameraDrag();
    });
  }
  function bindCameraDrag(){
    ['Scene','A','B'].forEach(bindCameraViewport);
    if(root.addEventListener)root.addEventListener('blur',cancelCameraDrag);
    if(document.addEventListener)document.addEventListener('visibilitychange',function(){
      if(document.hidden)cancelCameraDrag();
    });
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
  function redraw(opticalSampleMode){
    state.probeGeneration++;
    if(state.compareGpuProbe&&state.mode==='compare'){
      state.probeLast=null;state.probeField=null;state.probeFrameLast=null;
      probeStatus('Scene changed · rerun the CPU/GPU comparison.');
      var metrics=probeUi('ModernGpuProbeMetrics');if(metrics)metrics.textContent='';
      var frameMetrics=probeUi('ModernGpuFrameMetrics');if(frameMetrics)frameMetrics.textContent='';
      var maps=probeUi('ModernGpuDiffMaps');if(maps)maps.hidden=true;
    }
    // Ignore DOM events passed by ordinary change handlers: only the explicit
    // profiling actions can request a forced cold optical recomputation.
    state.opticalSample=opticalSampleMode==='cold'||opticalSampleMode==='warm'?
      opticalSampleMode:null;
    if(activeCameraPointer)cancelCameraDrag();
    var setupStartedAt=profileNow();
    cancelPending();
    model.Update();refreshLabels();
    scheduleExperimentSave();
    if(state.mode==='compare'){
      if(!prepareCompare()){state.opticalSample=null;if(cameraPreview)cameraPreview.clear();return;}
      ['A','B'].forEach(function(side){
        var status=el('ModernCompareStatus'+side);
        if(status)status.textContent='Rendering current model '+side+'…';
      });
      var scheduledAt=profileNow();
      state.frame=requestAnimationFrame(function(){
        state.frame=null;
        var startedAt=profileNow();
        try{
          var a=measuredGraphRedraw(state.compareGraphs.A);
          var b=measuredGraphRedraw(state.compareGraphs.B);
          if(renderProfiler)renderProfiler.recordBatch({mode:'compare',
            setupMs:scheduledAt-setupStartedAt,queueMs:startedAt-scheduledAt,totalMs:profileNow()-startedAt,A:a,B:b});
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
    if(mode!=='scene'&&mode!=='compare')throw RangeError('Invalid Modern UI mode');
    cancelCameraDrag();cancelEdits();stopShimmerFrame();
    if(atmosphericShimmer)atmosphericShimmer.resetClock();
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
        state.compareConfig=compareState.initial(model,state.atmosphere,state.occlusionRadius);
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
    var pairs={ModernHeight:'Height',ModernFocal:'FocalLengthField',ModernPan:'Pan',
      ModernNick:'Nick',ModernRoll:'Roll'};
    Object.keys(pairs).forEach(function(id){var node=el(id);if(node)node.value=String(model[pairs[id]]);});
    var aim=el('ModernCameraAim');if(aim)aim.value=String(model.viewcenterHorizon);
    var atmosphere=el('ModernAtmosphere');if(atmosphere){showLegacyOption('ModernAtmosphere',state.atmosphere);atmosphere.value=state.atmosphere;}
    renderAtmosphereDescription('ModernAtmosphereInfo',state.atmosphere);
    var occlusion=el('ModernOcclusion');if(occlusion)occlusion.value=String(state.occlusionRadius/1000);
    var grid=el('ModernGrid');if(grid)grid.checked=model.showGrid!==0;
    var eye=newUiEl('ModernCompareEyeLevel');if(eye)eye.checked=state.compareEyeLevel;
    var horizon=newUiEl('ModernCompareHorizon');if(horizon)horizon.checked=state.compareHorizon;
    var title=el('ModernSceneTitle');if(title)title.textContent=model.DemoText||'Custom physical scene';
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
    try{
      cancelEdits();
      adapter.applyPreset(model,id);
      state.preset=id;state.atmosphere='standard';state.occlusionRadius=6371000;
      model.Update();syncNumericInputs();
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
    ModernFocal:'Camera focal length in millimetres. This and field of view describe the same camera zoom.',
    ModernViewAngle:'Angular field of view in degrees, synchronized with focal length. Only the displayed number is rounded.',
    ModernPan:'Horizontal aiming angle in degrees. Changes the camera, not the object azimuths.',
    ModernNick:'Vertical camera pitch in degrees. Does not change observer height.',
    ModernRoll:'Rotation around the camera viewing axis, in degrees.',
    ModernCameraAim:'Scene can aim using geometric horizons. Compare always uses the common eye-level direction (0°) so both physical models share one camera.',
    ModernCurvature:'Surface curvature is κ = 1/R. The far-right endpoint is exactly flat (κ = 0), not merely a very large sphere.',
    ModernRadiusKm:'Physical surface radius in kilometres. Independent of any special atmospheric comparison radius.',
    ModernFlat:'Sets exact zero surface curvature. Camera and tower distances do not change.',
    ModernAtmosphere:'Controls how light propagates. Vacuum has straight rays; Standard refracts; engineered profiles have separate parameters.',
    ModernOcclusion:'Refraction scale radius R in kilometres for the engineered n(h) profile. Independent of the geometric surface radius; stored internally in metres.',
    ModernGrid:'Metric guide lines are measured along the actual surface and do not determine the optical horizon.'
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
    bindObjectFields();
    bindSettingsTabs();
    bindHelp();
    bindCompareEditor();
    bindShimmerControls();
    bindGpuDiagnostics();
    bindPerformanceDiagnostics();
    bindGeometryBackend();
    bindPersistence();
    bindNumber('ModernHeight',function(v){adapter?adapter.setCamera(model,'Height',v):model.Height=v;},'observer height');
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
    el('ModernBackToScene').addEventListener('click',function(){setMode('scene');});
    bindLibrary();
    bindCompareGpuProbe();
    var restored=restoreExperiment();
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
  root.CurvatureModernApp={getModel:function(){return model;},getMode:function(){return state.mode;},
    getLastRender:function(){return state.last;},getPreset:function(){return state.preset;},
    registerCompareGraph:registerCompareGraph,drawCompare:drawCompare,
    getCompareModels:function(){return state.comparePair;},
    getCompareLast:function(){return state.compareLast;},
    getCompareConfig:function(){return state.compareConfig;},
    getCompareGpuProbe:function(){return state.probeLast;},
    getRenderProfile:function(){return renderProfiler?renderProfiler.summary():null;},
    resetRenderProfile:function(){if(renderProfiler)renderProfiler.clear();},
    getPerformanceSnapshot:performanceSnapshot,
    getCameraInteraction:function(){return cameraInteraction;},
    // Atmospheric presentation remains independently inspectable through DevTools.
    getAtmosphericPresentation:function(){return atmosphericPresentation;},
    // DevTools API remains available alongside the 138.3 Atmosphere controls.
    getAtmosphericShimmer:function(){return atmosphericShimmer;},
    getGpuCapabilities:function(){return gpuSnapshot;},
    getGeometryBackend:function(){return state.geometryBackend;}};
}(window));

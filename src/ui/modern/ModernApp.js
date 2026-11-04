/* Modern UI: separate HTML shell over one CurveAppClass and one shared Physical
 * renderer. Scene controls (131) never read/drive the Legacy DOM.
 * GraphX3DX is created at the parser's document.write position.
 */
(function(root){
  'use strict';
  var state={mode:'scene',atmosphere:'standard',occlusionRadius:6371000,
    preset:'pontchartrain',timer:null,frame:null,last:null,editTimeouts:{},
    curvatureCommitTimer:null,curvaturePending:false,
    compareGraphs:{A:null,B:null},comparePair:null,compareLast:{A:null,B:null},
    geometryBackend:'canvas',opticalSample:null,compareEyeLevel:false,compareHorizon:true,horizonCache:{Scene:null,A:null,B:null},compareConfig:null,compareSelected:'A',compareCache:{A:null,B:null},
    probeGeneration:0,probeBusy:false,conformalCompareB:false};
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
      gpuProbe:false,probeTargets:256}); // Keep legacy schema; never re-enable retired WebGPU.
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
    // Older saved experiments may contain display.gpuProbe=true. The mode is
    // retired: load their A/B physical settings without invoking WebGPU.
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
      var spec=state.compareConfig&&state.compareConfig[side];
      var options={atmosphere:spec?spec.atmosphere:state.atmosphere,
        occlusionRadius:spec?spec.occlusionRadius:state.occlusionRadius,interactive:false,
        geometryBackend:state.geometryBackend,forceColdOptics:state.opticalSample==='cold'};
      // Separate optical sessions prevent A and B from evicting each other's
      // keyed ray fields as two viewports are rendered in succession.
      // #140.12.45: explicit, off-by-default production-oracle experiment.
      // Never layer it on a GPU-seeded field or use it for non-Globe profiles.
      if(side==='B'&&state.conformalCompareB&&
          m.showModel===1&&options.atmosphere==='standard')
        options.settings={shootingOptimization:'conformal-experimental'};
      if(state.compareCache[side])options.cacheSession=state.compareCache[side];
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
        node.textContent='Computed optics'+(result.cacheReused?' (cached)':'')+
          ' · '+result.drawn+' contours · '+result.fillTriangles+' fills · '+
          result.unresolved+' unresolved';
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
  function probeStatus(message){var node=probeUi('ModernCpuResearchStatus');if(node)node.textContent=message;}
  // Export failure evidence from retained CPU diagnostics only. Retired WebGPU
  // success exporters and their version-specific filenames are not UI routes.
  function downloadNumericAuditError(failure){
    if(!failure||!root.Blob||!root.URL||!root.URL.createObjectURL)return false;
    var version=String(failure.version||'unknown');
    var filename='curvature-compare-'+version+'-diagnostic-error.json';
    var url=root.URL.createObjectURL(new root.Blob([JSON.stringify(failure,null,2)],
      {type:'application/json'}));
    var link=document.createElement('a');link.href=url;link.download=filename;
    try{link.click();return true;}catch(error){return false;}finally{
      if(typeof root.setTimeout==='function')root.setTimeout(function(){root.URL.revokeObjectURL(url);},1000);
      else root.URL.revokeObjectURL(url);
    }
  }
  function numericAuditFailed(version,stage,error,details){
    var failure={version:version,kind:'numerical-audit-error',ok:false,stage:stage,
      message:String(error&&error.message||error),
      stack:error&&error.stack?String(error.stack):null,timestamp:new Date().toISOString()};
    if(details)failure.details=details;
    if(!downloadNumericAuditError(failure))
      probeStatus('Diagnostic JSON download failed; check browser download permissions.');
  }

  function bindCpuResearch(){
    [
      ['ModernCameraFirstOracleRun',runCameraFirstOracle141238],
      ['ModernCameraFirstObjectsRun',runCameraFirstObjects141239],
      ['ModernCpuQuadratureRun',runCpuQuadratureBenchmark141242],
      ['ModernCpuConformalRun',runCpuConformalBenchmark141243],
      ['ModernCpuAdaptiveConformalRun',runCpuAdaptiveConformalBenchmark141244],
      ['ModernConformalFrameParityRun',runConformalFrameParity141245],
      ['ModernConformalProfile141246Run',runConformalFrameProfile141246],
      ['ModernHybridShooting141247Run',runHybridShootingAudit141247],
      ['ModernTraceOptimize141248Run',runTraceOptimizationAudit141248],
      ['ModernFusedProductionGate141249Run',runFusedProductionGate141249]
    ].forEach(function(pair){
      var button=probeUi(pair[0]);
      if(button)button.addEventListener('click',pair[1]);
    });
    var toggle=probeUi('ModernConformalProductionToggle');
    if(toggle){
      toggle.checked=false;
      toggle.addEventListener('change',function(){
        state.conformalCompareB=!!toggle.checked;
        if(state.compareCache.B)state.compareCache.B.clearCache();
        probeStatus(state.conformalCompareB?
          'Experimental CPU conformal predictor enabled for standard Globe Compare B.':
          'Standard CPU RK4 Compare B restored.');
        redraw();
      });
    }
  }
  function prepareCompare(){
    if(!compareAdapter){updateStatus('Compare adapter is unavailable',true);return false;}
    if(compareState&&!state.compareConfig)
      state.compareConfig=compareState.initial(model,state.atmosphere,state.occlusionRadius);
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
  // #140.12.31: fixed-angle comparison of a preserved f32 quadrature
  // control with DS log-invariant / integrand / accumulation at three node counts.
  async function runConformalFrameProfile141246(){
    var button=probeUi('ModernConformalProfile141246Run'),zipWriter=root.GeometryDiagnosticsZip,
      renderer=root.CurvatureMainCanvasRenderer,optics=root.CurvaturePhysicalSceneOptics,
      profiler=root.CurvatureConformalProfile141246,
      source=state.comparePair&&state.comparePair.A,graphs=state.compareGraphs,
      started=profileNow(),phase='input';
    if(state.probeBusy)return;
    if(!button||!zipWriter||!renderer||!optics||!profiler||!compareAdapter||
        !source||!graphs.A||!graphs.B||!graphs.A.Canvas||!graphs.B.Canvas){
      probeStatus('Conformal profiler: missing Compare A/B, physical renderer, or profiler module');return;
    }
    var spec=state.compareConfig&&state.compareConfig.A;
    if(source.showModel!==1||!(source.Height>0)||
        (spec&&spec.atmosphere!=='standard')){
      probeStatus('Conformal profiler needs standard Globe Compare A and positive eye height');return;
    }
    var generation=state.probeGeneration,original=state.comparePair.A,
      modes=['baseline','reference','gradient','fast'],
      settings={reference:'conformal-reference',gradient:'conformal-gradient',fast:'conformal-experimental'},
      rounds=8,warmups=1,captured=[],runs={baseline:[],reference:[],gradient:[],fast:[]},
      last={},images={},orderLog=[],common={atmosphere:'standard',geometryBackend:'canvas',
        interactive:false,deferDecorations:true,forceColdOptics:true};
    function interrupted(){return generation!==state.probeGeneration||state.mode!=='compare'||
      state.comparePair.A!==original;}
    function snapshot(canvas){
      var out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height;
      var ctx=out.getContext('2d');if(!ctx)throw Error('Canvas snapshot unavailable');
      ctx.drawImage(canvas,0,0);return out;
    }
    function pngBytes(canvas){
      var url=canvas.toDataURL('image/png');
      if(!url.startsWith('data:image/png;base64,'))throw Error('PNG encoder unavailable');
      var raw=root.atob(url.substring(url.indexOf(',')+1)),data=new Uint8Array(raw.length);
      for(var i=0;i<raw.length;i++)data[i]=raw.charCodeAt(i);
      return data;
    }
    function pixelDiff(a,b){
      var out=document.createElement('canvas');out.width=a.width;out.height=a.height;
      var ctx=out.getContext('2d'),pixels=ctx.createImageData(a.width,a.height),
        aa=a.getContext('2d').getImageData(0,0,a.width,a.height).data,
        bb=b.getContext('2d').getImageData(0,0,b.width,b.height).data;
      for(var i=0;i<aa.length;i+=4){
        var delta=Math.max(Math.abs(aa[i]-bb[i]),Math.abs(aa[i+1]-bb[i+1]),
          Math.abs(aa[i+2]-bb[i+2]),Math.abs(aa[i+3]-bb[i+3]));
        pixels.data[i]=delta>8?255:0;pixels.data[i+1]=delta>8?40:0;
        pixels.data[i+2]=delta>8?40:0;pixels.data[i+3]=255;
      }
      ctx.putImageData(pixels,0,0);return out;
    }
    function median(values){var v=values.slice().sort(function(a,b){return a-b;}),n=v.length;
      return n?(v[(n-1)>>1]+v[n>>1])/2:null;}
    function metric(mode,path){return median(runs[mode].map(function(run){return path(run);}));}
    var countKeys=['drawn','fillTriangles','fillUnresolved','fillHidden','unresolved',
      'guideSegments','guideSolves','towerSolves','primitiveCount'];
    function details(result){
      var stats=result.fieldStats||{},times=result.timings||{};
      return {totalMs:times.totalMs,exactSolveMs:stats.exactSolveMs,
        predictionMs:stats.conformalPredictionMs||0,
        rk4Calls:stats.shootRK4Calls||0,gradientCalls:stats.conformalGradientCalls||0,
        shootingEvaluations:stats.shootEvaluations||0,
        warmAccepted:stats.conformalWarmAccepted||0,
        warmFallbacks:stats.conformalFallbacks||0,
        levels:stats.conformalStepsHistogram||{},
        structural:Object.fromEntries(countKeys.map(function(key){return [key,result[key]];}))};
    }
    function frame(mode,collect){
      var args=Object.assign({},common,{cacheSession:optics.create()});
      if(settings[mode])args.settings={shootingOptimization:settings[mode]};
      if(collect)args.onExactTarget=function(d,h){captured.push([d,h]);};
      var canvas=mode==='baseline'?graphs.A.Canvas:graphs.B.Canvas;
      var result=renderer.renderPhysical(mode==='baseline'?graphs.A:graphs.B,
        compareAdapter.clone(source),args);
      return {result:result,canvas:canvas};
    }
    state.probeBusy=true;button.disabled=true;
    try{
      // Warm-ups build JIT code but never count as measured frames. Capture
      // exact ray requests on the original untouched physical scene only.
      for(var w=0;w<warmups;w++)for(var i=0;i<modes.length;i++){
        if(interrupted())return;
        phase='warm-up '+modes[i];probeStatus('Conformal profile: warming '+modes[i]);
        await new Promise(function(resolve){root.setTimeout(resolve,0);});
        frame(modes[i],modes[i]==='baseline');
      }
      for(var round=0;round<rounds;round++){
        var shift=round%modes.length,
          order=modes.slice(shift).concat(modes.slice(0,shift));
        orderLog.push(order.slice());
        for(var j=0;j<order.length;j++){
          if(interrupted())return;
          var mode=order[j];phase='measured '+mode+' round '+(round+1);
          probeStatus('Conformal profiler: '+(round+1)+'/'+rounds+' · '+mode);
          await new Promise(function(resolve){root.setTimeout(resolve,0);});
          var render=frame(mode,false),info=details(render.result);
          runs[mode].push(info);
          last[mode]=info;images[mode]=snapshot(render.canvas);
        }
      }
      if(interrupted())return;
      phase='pixel and topology parity';
      var pixels={},structural={},allParity=true;
      ['reference','gradient','fast'].forEach(function(mode){
        pixels[mode]=compareAdapter.compareFramePixels(images.baseline,images[mode]);
        structural[mode]={};countKeys.forEach(function(key){
          structural[mode][key]={baseline:last.baseline.structural[key],
            variant:last[mode].structural[key],
            equal:JSON.stringify(last.baseline.structural[key])===
              JSON.stringify(last[mode].structural[key])};
        });
        if(pixels[mode].status!=='measured'||pixels[mode].strictPixels!==0||
            !countKeys.every(function(k){return structural[mode][k].equal;}))allParity=false;
      });
      pixels.fastVsReference=compareAdapter.compareFramePixels(images.reference,images.fast);
      if(pixels.fastVsReference.status!=='measured'||pixels.fastVsReference.strictPixels!==0)
        allParity=false;
      phase='predictor microprofile on captured scene requests';
      probeStatus('Conformal profiler: profiling exact-target sample and preparing ZIP');
      await new Promise(function(resolve){root.setTimeout(resolve,0);});
      if(interrupted())return;
      var micro=profiler.benchmark(captured,{radius:source.rEarth,
        observerHeight:source.Height,sampleLimit:256,rounds:5,iterations:10});
      var summary={};modes.forEach(function(mode){
        summary[mode]={medianTotalMs:metric(mode,function(r){return r.totalMs;}),
          medianExactSolveMs:metric(mode,function(r){return r.exactSolveMs;}),
          medianPredictionMs:metric(mode,function(r){return r.predictionMs;}),
          medianRK4Calls:metric(mode,function(r){return r.rk4Calls;}),
          medianGradientCalls:metric(mode,function(r){return r.gradientCalls;})};
      });
      var report={version:'140.12.46',kind:'hot-order-rotated full-frame CPU f64 conformal profiler',
        source:'actual Compare A scene rendered with original physical painter',
        comparison:'baseline; old array RK4; optimized gradient; optimized scalar RK4',
        atmosphere:'standard',geometry:'globe',
        defaultShootingUnchanged:true,experimentalOnly:true,
        framesPerMode:rounds,warmupsPerMode:warmups,
        orderRotation:orderLog,allExactFieldsCold:true,
        timingScope:'Each measurement independently rebuilds optical rays; JS/JIT warmed; no session cache reused',
        browserElapsedMs:profileNow()-started,
        summary:summary,runs:runs,lastFrame:{pixels:pixels,counts:structural},
        strictParityOnLastFrame:allParity,microprofile:micro,
        limitations:'One scene/camera, non-isolated browser CPU timings. Last frame pixel parity only; ' +
          'not a proof of multi-branch equivalence or all possible contact events. ' +
          'One report cannot justify enabling production by default.'};
      var files=[{name:'results.json',data:JSON.stringify(report,null,2)},
        {name:'baseline-real-frame.png',data:pngBytes(images.baseline)},
        {name:'reference-real-frame.png',data:pngBytes(images.reference)},
        {name:'gradient-real-frame.png',data:pngBytes(images.gradient)},
        {name:'fast-real-frame.png',data:pngBytes(images.fast)},
        {name:'baseline-vs-fast-diff.png',data:pngBytes(pixelDiff(images.baseline,images.fast))},
        {name:'reference-vs-fast-diff.png',data:pngBytes(pixelDiff(images.reference,images.fast))},
        {name:'README.txt',data:'#140.12.46 · Hot full-frame audit + exact-target profiler\n'+
          'Four actual physical Canvas frames per round, 1 warm-up + 8 measured rounds each.\n'+
          'Execution order rotated by round; optical field is cold and independent in EVERY frame.\n'+
          'Microprofile uses 256 evenly selected actual exact targets captured in the warm baseline.\n'+
          'All angles remain subject to original RK4 contact, residual and visibility checks.\n'+
          'PNG difference images mark channel deltas >8; strict pixel delta is in results.json.\n'}];
      phase='ZIP export';
      var blob=zipWriter.build(files),url=root.URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='curvature-compare-140.12.46-conformal-production-profile.zip';
      try{a.click();}finally{root.setTimeout(function(){root.URL.revokeObjectURL(url);},1000);}
      var view=probeUi('ModernCpuResearchMetrics');
      if(view)view.textContent='Conformal hot frame · baseline '+summary.baseline.medianTotalMs.toFixed(1)+
        ' / old '+summary.reference.medianTotalMs.toFixed(1)+' / scalar '+
        summary.fast.medianTotalMs.toFixed(1)+' ms · strict parity '+
        (allParity?'PASS':'FAIL')+' · ZIP exported';
      probeStatus('Conformal profile ZIP exported · strict last-frame parity: '+
        (allParity?'PASS':'FAIL')+' · 8 timed rounds per mode');
    }catch(error){if(!interrupted()){
      probeStatus('Conformal profile failed ('+phase+'): '+String(error.message||error));
      if(root.console&&root.console.error)root.console.error('Conformal profile:',error);
    }}finally{
      state.probeBusy=false;button.disabled=false;
      if(!interrupted()){if(graphs.A&&graphs.A.Redraw)graphs.A.Redraw();
        if(graphs.B&&graphs.B.Redraw)graphs.B.Redraw();}
    }
  }
  // #140.12.47: Compare the real baseline, lazy hybrid and always-conformal
  // field using independent hot, cold-optics Canvas frames. No toggle or
  // production default is changed by this diagnostic button.
  async function runHybridShootingAudit141247(){
    var button=probeUi('ModernHybridShooting141247Run'),zip=root.GeometryDiagnosticsZip,
      renderer=root.CurvatureMainCanvasRenderer,optics=root.CurvaturePhysicalSceneOptics,
      source=state.comparePair&&state.comparePair.A,graphs=state.compareGraphs,
      phase='input',started=profileNow();
    if(state.probeBusy)return;
    if(!button||!zip||!renderer||!optics||!compareAdapter||!source||!graphs||
        !graphs.A||!graphs.B||!graphs.A.Canvas||!graphs.B.Canvas){
      probeStatus('Hybrid shooting audit: missing Compare A/B or renderer');return;
    }
    var spec=state.compareConfig&&state.compareConfig.A;
    if(source.showModel!==1||!(source.Height>0)||spec&&spec.atmosphere!=='standard'){
      probeStatus('Hybrid shooting audit requires standard Globe Compare A with positive eye height');return;
    }
    var generation=state.probeGeneration,original=source,
      modes=['baseline','hybrid','conformal'],modeSettings={hybrid:'conformal-hybrid',
        conformal:'conformal-experimental'},rounds=8,warmups=1,
      runs={baseline:[],hybrid:[],conformal:[]},last={},frames={},orderLog=[],
      common={atmosphere:'standard',geometryBackend:'canvas',interactive:false,
        deferDecorations:true,forceColdOptics:true};
    function interrupted(){return generation!==state.probeGeneration||state.mode!=='compare'||
      state.comparePair.A!==original;}
    function median(items){var v=items.slice().sort(function(a,b){return a-b;}),n=v.length;
      return n?(v[(n-1)>>1]+v[n>>1])/2:null;}
    function screenshot(canvas){
      var c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height;
      var ctx=c.getContext('2d');if(!ctx)throw Error('Hybrid audit canvas unavailable');
      ctx.drawImage(canvas,0,0);return c;
    }
    function png(c){var url=c.toDataURL('image/png');
      if(!url.startsWith('data:image/png;base64,'))throw Error('PNG encoder unavailable');
      var raw=root.atob(url.slice(url.indexOf(',')+1)),buf=new Uint8Array(raw.length);
      for(var i=0;i<raw.length;i++)buf[i]=raw.charCodeAt(i);
      return buf;
    }
    function diff(a,b){
      var c=document.createElement('canvas');c.width=a.width;c.height=a.height;
      var ctx=c.getContext('2d'),pixels=ctx.createImageData(c.width,c.height),
        x=a.getContext('2d').getImageData(0,0,c.width,c.height).data,
        y=b.getContext('2d').getImageData(0,0,c.width,c.height).data;
      for(var i=0;i<x.length;i+=4){
        var max=Math.max(Math.abs(x[i]-y[i]),Math.abs(x[i+1]-y[i+1]),
          Math.abs(x[i+2]-y[i+2]),Math.abs(x[i+3]-y[i+3]));
        pixels.data[i]=max>8?255:0;pixels.data[i+1]=max>8?40:0;
        pixels.data[i+2]=max>8?40:0;pixels.data[i+3]=255;
      }
      ctx.putImageData(pixels,0,0);return c;
    }
    var countKeys=['drawn','fillTriangles','fillUnresolved','fillHidden','unresolved',
      'guideSegments','guideSolves','towerSolves','primitiveCount'];
    function detail(result){var stats=result.fieldStats||{},times=result.timings||{};
      return {totalMs:times.totalMs,exactSolveMs:stats.exactSolveMs||0,
        conformalPredictionMs:stats.conformalPredictionMs||0,
        shootRK4Calls:stats.shootRK4Calls||0,shootEvaluations:stats.shootEvaluations||0,
        predictorAttempts:stats.predictorAttempts||0,predictorAccepted:stats.predictorAccepted||0,
        predictorFallbacks:stats.predictorFallbacks||0,
        warmStartAccepted:stats.warmStartAccepted||0,
        conformalAttempts:stats.conformalAttempts||0,
        conformalWarmAccepted:stats.conformalWarmAccepted||0,
        conformalFallbacks:stats.conformalFallbacks||0,
        hybridBaselineSolved:stats.hybridBaselineSolved||0,
        hybridLateAttempts:stats.hybridLateAttempts||0,
        hybridLateAccepted:stats.hybridLateAccepted||0,
        conformalStepsHistogram:stats.conformalStepsHistogram||{},
        stageMs:stats.shootingStageMs||{},stageRK4:stats.shootingStageRK4||{},
        stageEvaluations:stats.shootingStageEvaluations||{},
        structural:Object.fromEntries(countKeys.map(function(k){return [k,result[k]];}))};
    }
    function frame(mode){
      var settings={profileShootingStages:true};
      if(modeSettings[mode])settings.shootingOptimization=modeSettings[mode];
      var args=Object.assign({},common,{cacheSession:optics.create(),settings:settings}),
        canvas=mode==='baseline'?graphs.A.Canvas:graphs.B.Canvas,
        graph=mode==='baseline'?graphs.A:graphs.B,
        result=renderer.renderPhysical(graph,compareAdapter.clone(source),args);
      return {result:result,canvas:canvas};
    }
    state.probeBusy=true;button.disabled=true;
    try{
      for(var w=0;w<warmups;w++)for(var i=0;i<modes.length;i++){
        if(interrupted())return;
        phase='warm-up '+modes[i];probeStatus('Hybrid shooting: warming '+modes[i]);
        await new Promise(function(done){root.setTimeout(done,0);});frame(modes[i]);
      }
      for(var r=0;r<rounds;r++){
        var shift=r%modes.length,order=modes.slice(shift).concat(modes.slice(0,shift));
        orderLog.push(order.slice());
        for(var j=0;j<order.length;j++){
          if(interrupted())return;
          var mode=order[j];phase='round '+(r+1)+' '+mode;
          probeStatus('Hybrid shooting: '+(r+1)+'/'+rounds+' · '+mode);
          await new Promise(function(done){root.setTimeout(done,0);});
          var rendered=frame(mode),info=detail(rendered.result);
          runs[mode].push(info);last[mode]=info;frames[mode]=screenshot(rendered.canvas);
        }
      }
      if(interrupted())return;
      phase='frame parity and ZIP';
      var pixels={},structural={},allParity=true;
      ['hybrid','conformal'].forEach(function(mode){
        pixels[mode]=compareAdapter.compareFramePixels(frames.baseline,frames[mode]);
        structural[mode]={};countKeys.forEach(function(k){
          structural[mode][k]={baseline:last.baseline.structural[k],
            variant:last[mode].structural[k],equal:JSON.stringify(last.baseline.structural[k])===
              JSON.stringify(last[mode].structural[k])};
        });
        if(pixels[mode].status!=='measured'||pixels[mode].strictPixels!==0||
            !countKeys.every(function(k){return structural[mode][k].equal;}))allParity=false;
      });
      pixels.hybridVsConformal=compareAdapter.compareFramePixels(frames.hybrid,frames.conformal);
      var summary={};modes.forEach(function(mode){
        var values=runs[mode];summary[mode]={};
        ['totalMs','exactSolveMs','conformalPredictionMs','shootRK4Calls',
          'shootEvaluations','predictorAttempts','predictorFallbacks',
          'conformalAttempts','hybridLateAttempts','hybridLateAccepted'].forEach(function(k){
          summary[mode]['median'+k[0].toUpperCase()+k.slice(1)]=
            median(values.map(function(v){return v[k];}));
        });
        ['stageMs','stageRK4','stageEvaluations'].forEach(function(k){
          summary[mode][k]={};var keys={};values.forEach(function(v){
            Object.keys(v[k]).forEach(function(name){keys[name]=true;});
          });
          Object.keys(keys).forEach(function(name){summary[mode][k][name]=
            median(values.map(function(v){return v[k][name]||0;}));});
        });
      });
      var report={version:'140.12.47',kind:'lazy hybrid conformal full-frame shooting attribution',
        source:'actual Compare A Globe standard scene; independent cold optical sessions',
        experimentalOnly:true,productionDefaultUnchanged:true,
        modes:modes,framesPerMode:rounds,warmupsPerMode:warmups,
        orderRotation:orderLog,timingScope:'8 warm JS rounds; independent cold optics every render',
        browserElapsedMs:profileNow()-started,summary:summary,runs:runs,
        lastFrame:{pixels:pixels,structural:structural},strictParityOnLastFrame:allParity,
        limitations:'Stage timings measure per-shot RK4 and ray trace plus separate candidate cost, not every overhead. '+
          'A late proposal is integrated and residual-checked by original RK4 before unchanged bracket/ground verification. '+
          'One camera, strict last-frame pixels, no global branch equivalence; timings are non-isolated browser CPU.'};
      var archive=zip.build([{name:'results.json',data:JSON.stringify(report,null,2)},
        {name:'baseline-real-frame.png',data:png(frames.baseline)},
        {name:'hybrid-real-frame.png',data:png(frames.hybrid)},
        {name:'conformal-real-frame.png',data:png(frames.conformal)},
        {name:'baseline-vs-hybrid-diff.png',data:png(diff(frames.baseline,frames.hybrid))},
        {name:'baseline-vs-conformal-diff.png',data:png(diff(frames.baseline,frames.conformal))},
        {name:'README.txt',data:'#140.12.47 · Lazy hybrid shooting A/B audit\n'+
          '8 order-rotated hot Canvas frames per mode; cold independent optical fields.\n'+
          'Hybrid runs original cheap shooting predictor first; only failures invoke expensive conformal angle.\n'+
          'All rays retain original RK4 and ground/contact certification.\n'+
          'Pixel differences >8 shown red; exact strict pixel metrics are in results.json.\n'}]);
      var url=root.URL.createObjectURL(archive),a=document.createElement('a');
      a.href=url;a.download='curvature-compare-140.12.47-hybrid-production-shooting.zip';
      try{a.click();}finally{root.setTimeout(function(){root.URL.revokeObjectURL(url);},1000);}
      var view=probeUi('ModernCpuResearchMetrics');
      if(view)view.textContent='Hybrid hot frames · baseline '+summary.baseline.medianTotalMs.toFixed(1)+
        ' / hybrid '+summary.hybrid.medianTotalMs.toFixed(1)+
        ' / conformal '+summary.conformal.medianTotalMs.toFixed(1)+
        ' ms · strict parity '+(allParity?'PASS':'FAIL')+' · ZIP exported';
      probeStatus('Hybrid shooting ZIP exported · parity '+(allParity?'PASS':'FAIL')+
        ' · 8 hot rounds / mode');
    }catch(error){if(!interrupted()){
      probeStatus('Hybrid shooting failed ('+phase+'): '+String(error.message||error));
      if(root.console&&root.console.error)root.console.error('Hybrid shooting:',error);
    }}finally{state.probeBusy=false;button.disabled=false;
      if(!interrupted()){if(graphs.A&&graphs.A.Redraw)graphs.A.Redraw();
        if(graphs.B&&graphs.B.Redraw)graphs.B.Redraw();}
    }
  }
  // #140.12.48: independent 8-round hot full-frame attribution for the
  // *existing* production RK4 path. Only experiments with gradient reuse and
  // proven-clear first-event checks; the default trace is never changed.
  // #140.12.49: candidate-promotion gate for the bitwise-equivalent common
  // exponential. This deliberately DOES NOT promote an unverified browser
  // optimisation to the default production setting. Compare four independently
  // rendered Globe scenes with no shared optical cache and equal painter inputs.
  async function runFusedProductionGate141249(){
    var button=probeUi('ModernFusedProductionGate141249Run'),zip=root.GeometryDiagnosticsZip,
      renderer=root.CurvatureMainCanvasRenderer,optics=root.CurvaturePhysicalSceneOptics,
      graphs=state.compareGraphs,source=state.comparePair&&state.comparePair.A,
      phase='input',started=profileNow();
    if(state.probeBusy)return;
    if(!button||!zip||!renderer||!optics||!compareAdapter||!source||!graphs||
        !graphs.A||!graphs.B||!graphs.A.Canvas||!graphs.B.Canvas){
      probeStatus('Fused gate: Compare A/B Canvas and physical renderer are required');return;
    }
    var spec=state.compareConfig&&state.compareConfig.A;
    if(source.showModel!==1||!(source.Height>0)||spec&&spec.atmosphere!=='standard'){
      probeStatus('Fused gate: select standard atmosphere and Globe in Compare A');return;
    }
    var generation=state.probeGeneration,original=source,rounds=4,warmups=1,
      structuralKeys=['drawn','fillTriangles','fillUnresolved','fillHidden','unresolved',
        'guideSegments','guideSolves','towerSolves','primitiveCount'],
      common={atmosphere:'standard',geometryBackend:'canvas',interactive:false,
        deferDecorations:true,forceColdOptics:true};
    // Clones only: never mutate Compare A, its nested object arrays, or camera.
    // Distances change both groups of real tower foundations; they are not
    // artificial target samples or an approximate image-space substitute.
    var cases=[
      {id:'authored',label:'Unmodified authored Globe camera',adjust:function(){}},
      {id:'near-ground',label:'Eye 2 m, tower foundations 50 m and 3.5 km',
        adjust:function(m){m.Height=2;m.ObjDist=[50,3500];m.ObjDeltaDist=[300,400];}},
      {id:'horizon',label:'Eye 15 m, foundations 9 km and 22 km',
        adjust:function(m){m.Height=15;m.ObjDist=[9000,22000];m.ObjDeltaDist=[700,850];}},
      {id:'far-field',label:'Eye 100 m, foundations 25 km and 65 km',
        adjust:function(m){m.Height=100;m.ObjDist=[25000,65000];m.ObjDeltaDist=[750,900];}}
    ];
    function interrupted(){return generation!==state.probeGeneration||state.mode!=='compare'||
      state.comparePair.A!==original;}
    function median(items){var a=items.slice().sort(function(x,y){return x-y;}),n=a.length;
      return n?(a[(n-1)>>1]+a[n>>1])/2:null;}
    function copy(canvas){var c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height;
      var ctx=c.getContext('2d');if(!ctx)throw Error('Fused gate: no Canvas 2D context');
      ctx.drawImage(canvas,0,0);return c;}
    function png(canvas){var url=canvas.toDataURL('image/png');
      if(!url.startsWith('data:image/png;base64,'))throw Error('Fused gate: PNG unavailable');
      var raw=root.atob(url.substring(url.indexOf(',')+1)),bytes=new Uint8Array(raw.length);
      for(var i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
      return bytes;}
    function diff(a,b){var c=document.createElement('canvas');c.width=a.width;c.height=a.height;
      var ctx=c.getContext('2d'),out=ctx.createImageData(c.width,c.height),
        aa=a.getContext('2d').getImageData(0,0,c.width,c.height).data,
        bb=b.getContext('2d').getImageData(0,0,c.width,c.height).data;
      for(var i=0;i<aa.length;i+=4){var difference=Math.max(Math.abs(aa[i]-bb[i]),
        Math.abs(aa[i+1]-bb[i+1]),Math.abs(aa[i+2]-bb[i+2]),Math.abs(aa[i+3]-bb[i+3]));
        out.data[i]=difference>0?255:0;out.data[i+1]=0;
        out.data[i+2]=difference>0?255:0;out.data[i+3]=255;}
      ctx.putImageData(out,0,0);return c;}
    function render(model,mode){var graph=mode==='baseline'?graphs.A:graphs.B,
      args=Object.assign({},common,{cacheSession:optics.create(),
        settings:{profileShootingStages:true}});
      // Since #140.12.50, the implicit standard kernel is fused. Preserve an
      // actual legacy reference rather than comparing fused against itself.
      args.settings.traceOptimization=mode==='baseline'?'legacy':'fused-gradient';
      var result=renderer.renderPhysical(graph,compareAdapter.clone(model),args),
        stats=result.fieldStats||{},timings=result.timings||{};
      if(stats.traceOptimizationApplied!==args.settings.traceOptimization)
        throw Error('RK4 audit: requested kernel was not used');
      return {canvas:graph.Canvas,detail:{totalMs:timings.totalMs,
        exactSolveMs:stats.exactSolveMs||0,shootRK4Calls:stats.shootRK4Calls||0,
        shootEvaluations:stats.shootEvaluations||0,
        traceOptimizationApplied:stats.traceOptimizationApplied||'not-reported',
        stageMs:stats.shootingStageMs||{},
        structural:Object.fromEntries(structuralKeys.map(function(k){return [k,result[k]];}))}};
    }
    state.probeBusy=true;button.disabled=true;
    try{
      var outcomes=[],files=[],allParity=true;
      for(var c=0;c<cases.length;c++){
        var scenario=cases[c],model=compareAdapter.clone(source);
        scenario.adjust(model);
        if(!Number.isFinite(model.Height)||!(model.Height>0)||model.showModel!==1)
          throw Error('Fused gate: invalid Globe scene '+scenario.id);
        var runs={baseline:[],fused:[]},orders=[],frames={},last={};
        for(var w=0;w<warmups;w++)for(var m=0;m<2;m++){
          if(interrupted())return;
          phase=scenario.id+' warm-up';probeStatus('Fused gate: warming '+scenario.id);
          await new Promise(function(done){root.setTimeout(done,0);});
          render(model,m===0?'baseline':'fused');
        }
        for(var r=0;r<rounds;r++){
          var order=r%2===0?['baseline','fused']:['fused','baseline'];orders.push(order.slice());
          for(var j=0;j<order.length;j++){
            if(interrupted())return;
            var mode=order[j];phase=scenario.id+' round '+(r+1)+' '+mode;
            probeStatus('Fused gate: '+(c+1)+'/'+cases.length+' '+scenario.id+' · '+
              (r+1)+'/'+rounds+' '+mode);
            await new Promise(function(done){root.setTimeout(done,0);});
            var current=render(model,mode);
            runs[mode].push(current.detail);last[mode]=current.detail;
            frames[mode]=copy(current.canvas);
          }
        }
        if(interrupted())return;
        phase=scenario.id+' strict pixel and structure parity';
        var pixels=compareAdapter.compareFramePixels(frames.baseline,frames.fused),
          structural={},structureEqual=true;
        structuralKeys.forEach(function(k){
          var a=last.baseline.structural[k],b=last.fused.structural[k];
          structural[k]={baseline:a,fused:b,equal:JSON.stringify(a)===JSON.stringify(b)};
          if(!structural[k].equal)structureEqual=false;
        });
        var parity=pixels.status==='measured'&&pixels.strictPixels===0&&structureEqual;
        if(!parity)allParity=false;
        function summarize(mode){var samples=runs[mode];return {
          medianTotalMs:median(samples.map(function(s){return s.totalMs;})),
          medianExactSolveMs:median(samples.map(function(s){return s.exactSolveMs;})),
          medianRK4Calls:median(samples.map(function(s){return s.shootRK4Calls;})),
          medianEvaluations:median(samples.map(function(s){return s.shootEvaluations;})),
          medianTraceStageMs:median(samples.map(function(s){return s.stageMs.trace||0;}))};}
        outcomes.push({id:scenario.id,label:scenario.label,
          observerHeight:model.Height,objectDistances:model.ObjDist.slice(),
          iterationsPerMode:rounds,orderRotation:orders,
          baseline:summarize('baseline'),fused:summarize('fused'),
          pixels:pixels,structural:structural,strictParity:parity,runs:runs});
        files.push({name:scenario.id+'-baseline.png',data:png(frames.baseline)},
          {name:scenario.id+'-fused.png',data:png(frames.fused)},
          {name:scenario.id+'-strict-diff.png',data:png(diff(frames.baseline,frames.fused))});
      }
      if(interrupted())return;
      var report={version:'140.12.49',kind:'fused standard RK4 multi-scene production gate',
        source:'actual Globe Canvas scenes, same authored model and varied cameras/ranges',
        productionDefaultUnchanged:false,candidateOnly:false,
        baselineTraceOptimization:'legacy',fusedTraceOptimization:'fused-gradient',
        roundsPerModePerScene:rounds,warmupsPerModePerScene:warmups,
        timingScope:'rotated hot Canvas renders with separate cold optical sessions',
        browserElapsedMs:profileNow()-started,scenes:outcomes,
        strictParityAcrossScenes:allParity,
        limitations:'Only these four finite first-contact Globe scenes were tested; '+
          'custom profiles, multiple ray branches and other viewports are not certified. '+
          'Shooting stage instrumentation adds measurement overhead. No automatic promotion.'};
      files.unshift({name:'results.json',data:JSON.stringify(report,null,2)});
      files.push({name:'README.txt',data:'#140.12.49 fused-gradient multi-scene gate\n'+
        'All PNGs are real independently rendered Globe Canvas frames.\n'+
        'Strict diffs are magenta for any nonzero RGBA channel difference.\n'+
        'Each case alternates baseline/fused order, independent optical caches.\n'+
        'After #140.12.50, production defaults to fused for built-in standard; baseline explicitly uses legacy.\n'});
      phase='ZIP export';var blob=zip.build(files),url=root.URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='curvature-compare-140.12.49-fused-production-gate.zip';
      try{a.click();}finally{root.setTimeout(function(){root.URL.revokeObjectURL(url);},1000);}
      var view=probeUi('ModernCpuResearchMetrics');
      if(view)view.textContent='Fused standard RK4 gate · '+outcomes.length+' scenes · '+
        (allParity?'strict pixel+structure PASS':'parity FAILED')+' · ZIP exported';
      probeStatus('Fused gate ZIP exported · '+(allParity?'all scenes match':'one or more scenes differ'));
    }catch(error){if(!interrupted()){
      probeStatus('Fused gate failed ('+phase+'): '+String(error.message||error));
      if(root.console&&root.console.error)root.console.error('Fused gate:',error);
    }}finally{state.probeBusy=false;button.disabled=false;
      if(!interrupted()){if(graphs.A&&graphs.A.Redraw)graphs.A.Redraw();
        if(graphs.B&&graphs.B.Redraw)graphs.B.Redraw();}}
  }

  async function runTraceOptimizationAudit141248(){
    var button=probeUi('ModernTraceOptimize141248Run'),zip=root.GeometryDiagnosticsZip,
      renderer=root.CurvatureMainCanvasRenderer,optics=root.CurvaturePhysicalSceneOptics,
      source=state.comparePair&&state.comparePair.A,graphs=state.compareGraphs,
      started=profileNow(),phase='input';
    if(state.probeBusy)return;
    if(!button||!zip||!renderer||!optics||!compareAdapter||!source||
        !graphs||!graphs.A||!graphs.B||!graphs.A.Canvas||!graphs.B.Canvas){
      probeStatus('Trace RK4 audit: Compare A/B Canvas or renderer missing');return;
    }
    var spec=state.compareConfig&&state.compareConfig.A;
    if(source.showModel!==1||!(source.Height>0)||spec&&spec.atmosphere!=='standard'){
      probeStatus('Trace RK4 audit needs standard Globe Compare A and positive observer height');return;
    }
    var generation=state.probeGeneration,original=source,
      modes=['baseline','fused','preflight','scalar'],
      settingsByMode={baseline:{traceOptimization:'legacy'},fused:{traceOptimization:'fused-gradient'},
        preflight:{traceOptimization:'fused-preflight'},
        scalar:{traceOptimization:'scalar-rk4'}},
      rounds=8,warmups=1,runs={baseline:[],fused:[],preflight:[],scalar:[]},
      frames={},last={},orders=[],common={atmosphere:'standard',geometryBackend:'canvas',
        interactive:false,deferDecorations:true,forceColdOptics:true},
      keys=['drawn','fillTriangles','fillUnresolved','fillHidden','unresolved',
        'guideSegments','guideSolves','towerSolves','primitiveCount'];
    function interrupted(){return generation!==state.probeGeneration||state.mode!=='compare'||
      state.comparePair.A!==original;}
    function median(items){var a=items.slice().sort(function(x,y){return x-y;}),n=a.length;
      return n?(a[(n-1)>>1]+a[n>>1])/2:null;}
    function copy(canvas){var c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height;
      var ctx=c.getContext('2d');if(!ctx)throw Error('Trace audit: Canvas context missing');
      ctx.drawImage(canvas,0,0);return c;}
    function png(canvas){var url=canvas.toDataURL('image/png');
      if(!url.startsWith('data:image/png;base64,'))throw Error('Trace audit: PNG unavailable');
      var str=root.atob(url.substring(url.indexOf(',')+1)),result=new Uint8Array(str.length);
      for(var i=0;i<str.length;i++)result[i]=str.charCodeAt(i);
      return result;}
    function diff(a,b){var c=document.createElement('canvas');c.width=a.width;c.height=a.height;
      var ctx=c.getContext('2d'),out=ctx.createImageData(c.width,c.height),
        aa=a.getContext('2d').getImageData(0,0,c.width,c.height).data,
        bb=b.getContext('2d').getImageData(0,0,c.width,c.height).data;
      for(var i=0;i<aa.length;i+=4){var d=Math.max(Math.abs(aa[i]-bb[i]),
          Math.abs(aa[i+1]-bb[i+1]),Math.abs(aa[i+2]-bb[i+2]),Math.abs(aa[i+3]-bb[i+3]));
        out.data[i]=d>8?255:0;out.data[i+1]=d>8?40:0;
        out.data[i+2]=d>8?40:0;out.data[i+3]=255;}
      ctx.putImageData(out,0,0);return c;}
    function frame(mode){var args=Object.assign({},common,{cacheSession:optics.create(),
        settings:Object.assign({profileShootingStages:true},settingsByMode[mode])}),
        graph=mode==='baseline'?graphs.A:graphs.B,
        result=renderer.renderPhysical(graph,compareAdapter.clone(source),args),
        stats=result.fieldStats||{},timings=result.timings||{};
      if(stats.traceOptimizationApplied!==args.settings.traceOptimization)
        throw Error('RK4 audit: requested kernel was not used');
      return {canvas:graph.Canvas,detail:{totalMs:timings.totalMs,
        exactSolveMs:stats.exactSolveMs||0,shootRK4Calls:stats.shootRK4Calls||0,
        shootEvaluations:stats.shootEvaluations||0,
        traceOptimizationApplied:stats.traceOptimizationApplied||'not-reported',
        clearGroundSteps:stats.clearGroundSteps||0,
        fullGroundEventSteps:stats.fullGroundEventSteps||0,
        preflightGroundSteps:stats.preflightGroundSteps||0,
        stageMs:stats.shootingStageMs||{},stageRK4:stats.shootingStageRK4||{},
        structural:Object.fromEntries(keys.map(function(k){return [k,result[k]];}))}};}
    state.probeBusy=true;button.disabled=true;
    try{
      for(var w=0;w<warmups;w++)for(var i=0;i<modes.length;i++){
        if(interrupted())return;
        phase='warm-up '+modes[i];probeStatus('Trace RK4 audit: warming '+modes[i]);
        await new Promise(function(done){root.setTimeout(done,0);});frame(modes[i]);
      }
      for(var r=0;r<rounds;r++){
        var order=modes.slice(r%modes.length).concat(modes.slice(0,r%modes.length));
        orders.push(order.slice());
        for(var j=0;j<order.length;j++){
          if(interrupted())return;
          var mode=order[j];phase='round '+(r+1)+' '+mode;
          probeStatus('Trace RK4: '+(r+1)+'/'+rounds+' · '+mode);
          await new Promise(function(done){root.setTimeout(done,0);});
          var current=frame(mode);
          runs[mode].push(current.detail);last[mode]=current.detail;
          frames[mode]=copy(current.canvas);
        }
      }
      if(interrupted())return;
      phase='pixel parity';var pixels={},structural={},allParity=true;
      ['fused','preflight','scalar'].forEach(function(mode){
        pixels[mode]=compareAdapter.compareFramePixels(frames.baseline,frames[mode]);
        structural[mode]={};keys.forEach(function(k){
          structural[mode][k]={baseline:last.baseline.structural[k],variant:last[mode].structural[k],
            equal:JSON.stringify(last.baseline.structural[k])===JSON.stringify(last[mode].structural[k])};
        });
        if(pixels[mode].status!=='measured'||pixels[mode].strictPixels!==0||
            !keys.every(function(k){return structural[mode][k].equal;}))allParity=false;
      });
      var summary={};modes.forEach(function(mode){var values=runs[mode];summary[mode]={};
        ['totalMs','exactSolveMs','shootRK4Calls','shootEvaluations',
          'clearGroundSteps','fullGroundEventSteps','preflightGroundSteps'].forEach(function(k){
          summary[mode]['median'+k[0].toUpperCase()+k.slice(1)]=
            median(values.map(function(v){return v[k];}));
        });
        ['stageMs','stageRK4'].forEach(function(k){var names={};
          values.forEach(function(v){Object.keys(v[k]).forEach(function(name){names[name]=true;});});
          summary[mode][k]={};Object.keys(names).forEach(function(name){
            summary[mode][k][name]=median(values.map(function(v){return v[k][name]||0;}));
          });
        });
      });
      var report={version:'140.12.48',kind:'production RK4 gradient and ground-clearance audit',
        source:'actual standard Globe Compare A, independent cold optical sessions',
        productionDefaultUnchanged:false,experimentalOnly:true,modes:modes,
        baselineTraceOptimization:'legacy',
        framesPerMode:rounds,warmupsPerMode:warmups,orderRotation:orders,
        timingScope:'8 warmed order-rotated Canvas frames; independent cold ray fields',
        browserElapsedMs:profileNow()-started,summary:summary,runs:runs,
        lastFrames:last,pixels:pixels,structural:structural,strictParityOnLastFrame:allParity,
        limitations:'One camera, finite-sampled first-contact detection. This is not a proof of global ' +
          'multipath correctness. Stage timing instrumentation affects measured durations.'};
      phase='ZIP export';var files=[
        {name:'results.json',data:JSON.stringify(report,null,2)},
        {name:'baseline-real-frame.png',data:png(frames.baseline)},
        {name:'fused-real-frame.png',data:png(frames.fused)},
        {name:'preflight-real-frame.png',data:png(frames.preflight)},
        {name:'scalar-real-frame.png',data:png(frames.scalar)},
        {name:'baseline-vs-fused-diff.png',data:png(diff(frames.baseline,frames.fused))},
        {name:'baseline-vs-preflight-diff.png',data:png(diff(frames.baseline,frames.preflight))},
        {name:'baseline-vs-scalar-diff.png',data:png(diff(frames.baseline,frames.scalar))},
        {name:'README.txt',data:'#140.12.48 · Trace RK4 optimisation audit\n'+
          'Baseline, fused standard gradient, fused + clearance preflight, scalar standard RK4.\n'+
          '8 hot Canvas frames per mode; cold independent ray fields, rotating execution order.\n'+
          'Ground and shooting certifications remain unchanged; trace fast proof is opt-in.\n'+
          'Red diff marks channel differences >8; strict pixel counts are in results.json.\n'}];
      var blob=zip.build(files),url=root.URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='curvature-compare-140.12.48-trace-production-profile.zip';
      try{a.click();}finally{root.setTimeout(function(){root.URL.revokeObjectURL(url);},1000);}
      var view=probeUi('ModernCpuResearchMetrics');
      if(view)view.textContent='Trace RK4 hot frames · baseline '+summary.baseline.medianTotalMs.toFixed(1)+
        ' / fused '+summary.fused.medianTotalMs.toFixed(1)+
        ' / preflight '+summary.preflight.medianTotalMs.toFixed(1)+
        ' / scalar '+summary.scalar.medianTotalMs.toFixed(1)+
        ' ms · strict parity '+(allParity?'PASS':'FAIL')+' · ZIP exported';
      probeStatus('Trace RK4 ZIP exported · strict last-frame parity '+(allParity?'PASS':'FAIL'));
    }catch(error){if(!interrupted()){
      probeStatus('Trace RK4 audit failed ('+phase+'): '+String(error.message||error));
      if(root.console&&root.console.error)root.console.error('Trace RK4 audit:',error);
    }}finally{state.probeBusy=false;button.disabled=false;
      if(!interrupted()){if(graphs.A&&graphs.A.Redraw)graphs.A.Redraw();
        if(graphs.B&&graphs.B.Redraw)graphs.B.Redraw();}
    }
  }

  async function runConformalFrameParity141245(){
    var button=probeUi('ModernConformalFrameParityRun'),zipWriter=root.GeometryDiagnosticsZip,
      renderer=root.CurvatureMainCanvasRenderer,optics=root.CurvaturePhysicalSceneOptics,
      graphs=state.compareGraphs,source=state.comparePair&&state.comparePair.A,
      phase='checking input',started=profileNow();
    if(state.probeBusy)return;
    if(!zipWriter||!renderer||!optics||!compareAdapter||!source||
        !graphs.A||!graphs.B||!graphs.A.Canvas||!graphs.B.Canvas){
      probeStatus('Conformal frame audit needs Compare A/B canvases and physical renderer.');return;
    }
    var spec=state.compareConfig&&state.compareConfig.A;
    if(source.showModel!==1||!(source.Height>0)||
        (spec&&spec.atmosphere!=='standard')){
      probeStatus('Conformal frame audit requires Compare A: Globe, standard atmosphere, positive eye height.');return;
    }
    var generation=state.probeGeneration,original=state.comparePair.A;
    function interrupted(){return generation!==state.probeGeneration||state.mode!=='compare'||
      state.comparePair.A!==original;}
    function snapshot(canvas){
      var copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
      var ctx=copy.getContext('2d');if(!ctx)throw Error('Canvas snapshot context unavailable');
      ctx.drawImage(canvas,0,0);return copy;
    }
    function pngBytes(canvas){
      var url=canvas.toDataURL('image/png');
      if(!url.startsWith('data:image/png;base64,'))throw Error('PNG encoder unavailable');
      var raw=root.atob(url.substring(url.indexOf(',')+1)),data=new Uint8Array(raw.length);
      for(var i=0;i<raw.length;i++)data[i]=raw.charCodeAt(i);
      return data;
    }
    function diffImage(a,b){
      var canvas=document.createElement('canvas');canvas.width=a.width;canvas.height=a.height;
      var ctx=canvas.getContext('2d'),out=ctx.createImageData(a.width,a.height),
        aa=a.getContext('2d').getImageData(0,0,a.width,a.height).data,
        bb=b.getContext('2d').getImageData(0,0,b.width,b.height).data;
      for(var i=0;i<aa.length;i+=4){
        var d=Math.max(Math.abs(aa[i]-bb[i]),Math.abs(aa[i+1]-bb[i+1]),
          Math.abs(aa[i+2]-bb[i+2]),Math.abs(aa[i+3]-bb[i+3]));
        out.data[i]=d>8?255:0;out.data[i+1]=d>8?40:0;
        out.data[i+2]=d>8?40:0;out.data[i+3]=255;
      }ctx.putImageData(out,0,0);return canvas;
    }
    function exportZip(files,name){
      var blob=zipWriter.build(files),url=root.URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=name;
      try{link.click();}finally{root.setTimeout(function(){root.URL.revokeObjectURL(url);},1000);}
    }
    state.probeBusy=true;if(button)button.disabled=true;
    try{
      var model=compareAdapter.clone(source),atmosphere='standard',
        baselineSession=optics.create(),experimentalSession=optics.create(),
        settings={shootingOptimization:'conformal-experimental'},
        common={atmosphere:atmosphere,geometryBackend:'canvas',interactive:false,
          deferDecorations:true,forceColdOptics:true};
      // Both independently rendered frames receive the identical physical model.
      // No atmospheric display overlays, captions or GPU render backend.
      phase='cold baseline physical frame';
      probeStatus('Conformal frame: cold original Globe RK4 + existing predictor…');
      await new Promise(function(resolve){root.setTimeout(resolve,0);});
      if(interrupted())return;
      var base=renderer.renderPhysical(graphs.A,model,Object.assign({},common,
        {cacheSession:baselineSession})),imageA=snapshot(graphs.A.Canvas);
      if(interrupted())return;
      phase='cold experimental physical frame';
      probeStatus('Conformal frame: cold adaptive predictor + strict Globe RK4…');
      await new Promise(function(resolve){root.setTimeout(resolve,0);});
      if(interrupted())return;
      var variant=renderer.renderPhysical(graphs.B,model,Object.assign({},common,
        {cacheSession:experimentalSession,settings:settings})),imageB=snapshot(graphs.B.Canvas);
      phase='pixel and topology comparison';
      if(interrupted())return;
      var pixels=compareAdapter.compareFramePixels(imageA,imageB);
      if(pixels.status!=='measured')throw Error('Pixel comparison unavailable: '+pixels.reason);
      var keys=['drawn','fillTriangles','fillUnresolved','fillHidden','unresolved',
        'guideSegments','guideSolves','towerSolves','primitiveCount'],counts={};
      keys.forEach(function(key){counts[key]={baseline:base[key],conformal:variant[key],
        equal:JSON.stringify(base[key])===JSON.stringify(variant[key])};});
      var report={version:'140.12.45',kind:'Full-frame CPU f64 conformal production-oracle audit',
        scene:'actual Compare A physical model cloned identically for A/B',
        atmosphere:atmosphere,geometry:'globe',camera:'same model, same painter, same viewport settings',
        canvas:{width:imageA.width,height:imageA.height},
        experimentalSetting:settings,baselineSetting:'default (existing shooting predictor)',
        singleColdFramePerMode:true,notAMedianBenchmark:true,
        baseline:{timings:base.timings,fieldStats:base.fieldStats,opticalWork:base.opticalWork,
          unresolvedReasons:base.unresolvedReasons,fillUnresolvedReasons:base.fillUnresolvedReasons},
        conformal:{timings:variant.timings,fieldStats:variant.fieldStats,opticalWork:variant.opticalWork,
          unresolvedReasons:variant.unresolvedReasons,fillUnresolvedReasons:variant.fillUnresolvedReasons},
        pixels:pixels,counts:counts,
        parity:{allCountsEqual:keys.every(function(k){return counts[k].equal;}),
          exactlyIdenticalPixels:pixels.strictPixels===0},
        limitations:'One camera/scene; no global multipath proof; painter does not have a full Z-buffer. ' +
          'Identical pixels do not prove all other scenes or contacts.'};
      phase='PNG/JSON ZIP export';
      exportZip([{name:'results.json',data:JSON.stringify(report,null,2)},
        {name:'baseline-real-frame.png',data:pngBytes(imageA)},
        {name:'conformal-real-frame.png',data:pngBytes(imageB)},
        {name:'pixel-difference.png',data:pngBytes(diffImage(imageA,imageB))},
        {name:'README.txt',data:'#140.12.45 · Full CPU Canvas frame comparison\n'+
          'Actual physical frames, same model and camera. Original baseline versus opt-in conformal predictor.\n'+
          'Every candidate receives the original Globe RK4 shooting and ground-event certification.\n'+
          'Both timings are single cold frames, not statistical speedup claims.\n'+
          'Pixel-difference.png: red marks channel differences >8/255.\n'}],
        'curvature-compare-140.12.45-conformal-production-frame.zip');
      var metric=probeUi('ModernCpuResearchMetrics');
      if(metric)metric.textContent='Conformal cold frames · baseline '+base.timings.totalMs.toFixed(1)+
        ' / experimental '+variant.timings.totalMs.toFixed(1)+' ms · strict pixel changes '+
        pixels.strictPixels+' / '+pixels.totalPixels+' · ZIP exported';
      probeStatus('Conformal full-frame ZIP exported · strict changed pixels: '+pixels.strictPixels);
    }catch(error){if(!interrupted()){
      probeStatus('Conformal full-frame audit failed ('+phase+'): '+String(error.message||error));
      if(root.console&&root.console.error)root.console.error('Conformal frame audit:',error);
    }}finally{
      state.probeBusy=false;if(button)button.disabled=false;
      // Restore the interactive Compare views (including current A/B settings).
      if(!interrupted()){if(graphs.A&&graphs.A.Redraw)graphs.A.Redraw();
        if(graphs.B&&graphs.B.Redraw)graphs.B.Redraw();}
    }
  }
  async function runCpuAdaptiveConformalBenchmark141244(){
    if(state.probeBusy||state.mode!=='compare')return;
    var adaptive=root.CurvatureCpuAdaptiveConformal141244,
      gate=root.CurvatureGpuDsPainterGate141240,
      composition=root.CurvatureIndependentComposition,
      zipWriter=root.GeometryDiagnosticsZip,
      source=state.comparePair&&state.comparePair.A,
      button=probeUi('ModernCpuAdaptiveConformalRun'),phase='preparing',
      generation=state.probeGeneration,started=profileNow();
    if(!adaptive||!gate||!composition||!zipWriter||!source){
      probeStatus('Adaptive conformal benchmark: missing diagnostic modules or Compare A');return;
    }
    if(state.compareConfig&&state.compareConfig.A&&state.compareConfig.A.atmosphere!=='standard'){
      probeStatus('Adaptive conformal benchmark requires the standard atmosphere in Compare A');return;
    }
    if(!(source.Height>0&&source.Height<=147&&source.rEarth>=1e5)){
      probeStatus('Adaptive conformal benchmark requires positive observer altitude and Earth radius');return;
    }
    function interrupted(){return generation!==state.probeGeneration||state.mode!=='compare';}
    function download(files,name){
      var blob=zipWriter.build(files),url=root.URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=name;
      try{link.click();}finally{if(root.setTimeout)root.setTimeout(function(){root.URL.revokeObjectURL(url);},1000);
        else root.URL.revokeObjectURL(url);}
    }
    function csv(report,eye){
      var fields=['observerHeight','index','target','altitudeMetres','cpuStatus','cpuAngleRadians',
        'cpuGroundHit','cpuRK4Calls'];
      ['fixed2','adaptive','richardson'].forEach(function(mode){
        ['Status','Reason','AngleRadians','ErrorArcseconds','Steps','Levels',
          'EstimatedMetres','ExtrapolationRadians','GradientCalls','WarmAccepted',
          'Fallback','RK4Calls','CertifiedStatus','Parity'].forEach(function(suffix){fields.push(mode+suffix);});
      });
      function cell(value){
        if(value===null||value===undefined)return '';
        var str=typeof value==='object'?JSON.stringify(value):String(value);
        return /[,"\n]/.test(str)?'"'+str.replace(/"/g,'""')+'"':str;
      }
      return fields.join(',')+'\n'+report.rows.map(function(row){
        return fields.map(function(f){return cell(f==='observerHeight'?eye:row[f]);}).join(',');
      }).join('\n')+'\n';
    }
    function chart(report){
      var values=[{name:'Existing predictor',ms:report.mediansMs.baselineTotalMs},
        {name:'Fixed 2-step',ms:report.mediansMs.fixed2TotalMs},
        {name:'Adaptive 2/4/8/16',ms:report.mediansMs.adaptiveTotalMs},
        {name:'Adaptive + Richardson',ms:report.mediansMs.richardsonTotalMs}],
        max=Math.max.apply(null,values.map(function(x){return x.ms;}).concat([0.001]));
      var svg=['<svg xmlns="http://www.w3.org/2000/svg" width="780" height="250" viewBox="0 0 780 250">',
        '<rect width="780" height="250" fill="white"/>',
        '<text x="18" y="28" font-family="sans-serif" font-size="16" font-weight="bold">#140.12.44 Globe CPU f64 · full shooting median ms</text>'];
      values.forEach(function(v,i){var y=47+i*45,w=420*v.ms/max;
        svg.push('<text x="18" y="'+(y+14)+'" font-family="sans-serif" font-size="12">'+v.name+'</text>');
        svg.push('<rect x="245" y="'+y+'" width="'+w.toFixed(2)+'" height="22" fill="'+(i===3?'#27846e':i===2?'#589ba5':i===1?'#b08d51':'#64748b')+'"/>');
        svg.push('<text x="'+(251+w).toFixed(2)+'" y="'+(y+15)+'" font-family="sans-serif" font-size="12">'+v.ms.toFixed(3)+' ms</text>');
      });svg.push('</svg>');return svg.join('');
    }
    state.probeBusy=true;if(button)button.disabled=true;
    try{
      var model=Object.assign({},source,{showModel:1,geometryRadius:source.rEarth}),
        composed=composition.composeOpticalMain(model,true,{physicalWorld:true}),
        inputs=gate.requestFromScene(composed,model),R=model.rEarth,
        targets=inputs.selected.map(function(s){return s.target.slice();}),
        sceneSignature=JSON.stringify(targets),controls=inputs.request.controls;
      if(targets.length!==48)throw Error('Expected 48 real authored targets; got '+targets.length);
      var request={geometry:'globe',radius:R,observerHeight:model.Height,
        atmosphere:'standard',targets:targets,controls:controls};
      phase='48 real authored targets';
      probeStatus('Globe adaptive conformal: existing predictor vs fixed 2 vs adaptive vs Richardson…');
      await new Promise(function(resolve){root.setTimeout(resolve,0);});
      if(interrupted())return;
      var main=adaptive.experiment(request,{repeats:5});
      phase='ground and equal-height stress';
      var stress=adaptive.experiment(Object.assign({},request,
        {targets:adaptive.stressTargets(R,model.Height)}),{repeats:1});
      phase='extended distance and altitude envelope';
      var envelope=[15,100].map(function(eye){return {observerHeight:eye,
        report:adaptive.experiment(Object.assign({},request,
          {observerHeight:eye,targets:adaptive.envelopeTargets(R)}),{repeats:3})};});
      if(interrupted())return;
      phase='confirming scene and exporting ZIP';
      if(state.comparePair.A!==source)throw Error('Compare A changed during benchmark');
      var fresh=composition.composeOpticalMain(Object.assign({},source,
        {showModel:1,geometryRadius:source.rEarth}),true,{physicalWorld:true});
      if(JSON.stringify(gate.requestFromScene(fresh,model).selected.map(function(s){return s.target;}))!==sceneSignature)
        throw Error('Authored physical targets changed during benchmark');
      var report={version:'140.12.44',kind:'Adaptive conformal Globe CPU f64 shooting benchmark',
        productionUnchanged:true,experimentalOnly:true,elapsedMs:profileNow()-started,
        source:'48 actual authored Compare A physical targets; 8 separate stress; 20 per extended-altitude observer set',
        main:main,stress:stress,envelope:envelope,
        timingScope:'medians from 5 warmed rounds for main, 3 for each envelope; each total includes prediction + strict RK4 checks/fallback',
        verificationScope:'All classification and ground contact from unchanged Globe RK4. No global multipath or full-frame pixel parity proven.'};
      var guide=['#140.12.44 · CPU f64 Adaptive Conformal Globe Shooting',
        'Diagnostic only. Does not modify production shooting, renderer, polygon filling or WebGPU.',
        'Four compared pipelines: original CPU RK4 + predictor, fixed 2-step conformal, '+
        'adaptive 2/4/8/16-step conformal, and adaptive + local Richardson angle extrapolation.',
        'All candidate angles are untrusted. Existing OpticalTargetProjection.solve integrates and checks each candidate at the original strict residual/ground tolerance and falls back unchanged.',
        'Adaptive selection uses 4th-order step-doubling angle differences and a heuristic angular-to-height error threshold. Short paths keep the fast fixed two-step path; near-surface cases are more conservative.',
        'Richardson correction estimates the local step-size error as (angle_fine-angle_coarse)/15. It is NOT itself a strict RK4 certificate.',
        '48 authored object-edge targets (five warmed timed rounds). 8 ground/equal-height stress targets. Two 20-target envelopes at 15 m and 100 m observer height (three rounds each).',
        'Extended envelope times are NOT mixed into the 48-target timing medians.',
        'Per-target CSV exposes all acceptance/fallback flags, RK4 calls, status/ground parity, chosen steps and candidate-angle errors.',
        'No proof of all optical branches, no pixel-parity claim, no production promotion.'];
      download([{name:'results.json',data:JSON.stringify(report,null,2)},
        {name:'authored-globe.csv',data:csv(main,model.Height)},
        {name:'stress-globe.csv',data:csv(stress,model.Height)},
        {name:'envelope-eye-15m.csv',data:csv(envelope[0].report,15)},
        {name:'envelope-eye-100m.csv',data:csv(envelope[1].report,100)},
        {name:'performance.svg',data:chart(main)},
        {name:'README.txt',data:guide.join('\n')+'\n'}],
        'curvature-compare-140.12.44-cpu-f64-adaptive-conformal.zip');
      var metric=probeUi('ModernCpuResearchMetrics');
      if(metric)metric.textContent='Globe f64 · predictor '+main.mediansMs.baselineTotalMs.toFixed(2)+
        ' / fixed '+main.mediansMs.fixed2TotalMs.toFixed(2)+
        ' / adaptive '+main.mediansMs.adaptiveTotalMs.toFixed(2)+
        ' / refined '+main.mediansMs.richardsonTotalMs.toFixed(2)+' ms · warm starts '+
        main.summary.richardson.warmAccepted+'/48 · ZIP exported';
      probeStatus('Globe adaptive conformal benchmark exported · production renderer unchanged');
    }catch(error){if(!interrupted()){
      numericAuditFailed('140.12.44','runCpuAdaptiveConformalBenchmark141244',error,
        {phase:phase,elapsedMs:profileNow()-started});
      try{download([{name:'error.json',data:JSON.stringify({version:'140.12.44',phase:phase,
        message:String(error&&error.message||error)},null,2)}],
        'curvature-compare-140.12.44-cpu-f64-adaptive-conformal-error.zip');}catch(_){/* original error shown */}
      probeStatus('Adaptive conformal benchmark failed ('+phase+'): '+String(error&&error.message||error));
    }}finally{state.probeBusy=false;if(button)button.disabled=false;}
  }
  // #140.12.43 — Strict Globe RK4 remains the only source of visibility,
  // ground-contact and shooting decisions. This is a diagnostic benchmark of
  // surface-matched inverse exponential vs exact-conformal coarse predictors.
  async function runCpuConformalBenchmark141243(){
    if(state.probeBusy||state.mode!=='compare')return;
    var conformal=root.CurvatureCpuConformalGlobe141243,
      gate=root.CurvatureGpuDsPainterGate141240,
      composition=root.CurvatureIndependentComposition,
      zipWriter=root.GeometryDiagnosticsZip,
      source=state.comparePair&&state.comparePair.A,
      button=probeUi('ModernCpuConformalRun'),phase='preparing',
      started=profileNow(),generation=state.probeGeneration;
    if(!conformal||!gate||!composition||!zipWriter||!source){
      probeStatus('Conformal Globe benchmark: missing diagnostic dependencies or Compare A');return;
    }
    if(state.compareConfig&&state.compareConfig.A&&state.compareConfig.A.atmosphere!=='standard'){
      probeStatus('Conformal benchmark requires the standard exponential atmosphere in Compare A');return;
    }
    if(!(source.Height>0&&source.Height<=147&&source.rEarth>=1e5)){
      probeStatus('Conformal benchmark requires positive eye altitude and a finite Earth radius');return;
    }
    function interrupted(){return generation!==state.probeGeneration||state.mode!=='compare';}
    function download(files,name){
      var blob=zipWriter.build(files),url=root.URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=name;
      try{link.click();}finally{
        if(root.setTimeout)root.setTimeout(function(){root.URL.revokeObjectURL(url);},1000);
        else root.URL.revokeObjectURL(url);
      }
    }
    function csv(report,eye){
      var fields=['observerHeight','index','target','altitudeMetres','cpuStatus','cpuAngleRadians',
        'cpuResidualMetres','cpuGroundHit','inverseAngleRadians','inverseErrorRadians',
        'inverseErrorArcseconds','classicErrorArcseconds','conformalAngleRadians',
        'conformalErrorRadians','conformalErrorArcseconds','conformalReason',
        'conformalGradientCalls','analyticWarmAccepted','conformalWarmAccepted',
        'analyticFallback','conformalFallback','analyticCertifiedStatus','conformalCertifiedStatus',
        'cpuRK4Calls','analyticRK4Calls','conformalRK4Calls',
        'analyticParity','conformalParity'];
      function cell(value){
        if(value===null||value===undefined)return '';
        var str=typeof value==='object'?JSON.stringify(value):String(value);
        return /[,"\n]/.test(str)?'"'+str.replace(/"/g,'""')+'"':str;
      }
      return fields.join(',')+'\n'+report.rows.map(function(row){
        return fields.map(function(f){return cell(f==='observerHeight'?eye:row[f]);}).join(',');
      }).join('\n')+'\n';
    }
    function chart(report){
      var values=[{label:'Existing RK4 + predictor',value:report.mediansMs.predictorOnlyMs},
        {label:'Inverse exponential + RK4',value:report.mediansMs.analyticTotalMs},
        {label:'Conformal coarse + RK4',value:report.mediansMs.conformalTotalMs}],
        limit=Math.max.apply(null,values.map(function(x){return x.value;}).concat([0.001]));
      var out=['<svg xmlns="http://www.w3.org/2000/svg" width="760" height="185" viewBox="0 0 760 185">',
        '<rect width="760" height="185" fill="white"/>',
        '<text x="20" y="25" font-size="16" font-weight="bold" font-family="sans-serif">Globe CPU f64 certified shooting · median ms</text>'];
      values.forEach(function(v,i){
        var y=47+i*43,w=420*v.value/limit;
        out.push('<text x="20" y="'+(y+14)+'" font-size="12" font-family="sans-serif">'+v.label+'</text>');
        out.push('<rect x="230" y="'+y+'" height="20" width="'+w.toFixed(2)+'" fill="'+(i===2?'#25856d':i===1?'#bd874e':'#64748b')+'"/>');
        out.push('<text x="'+(236+w).toFixed(2)+'" y="'+(y+14)+'" font-size="12" font-family="sans-serif">'+v.value.toFixed(3)+' ms</text>');
      });out.push('</svg>');return out.join('');
    }
    state.probeBusy=true;if(button)button.disabled=true;
    try{
      var model=Object.assign({},source,{showModel:1,geometryRadius:source.rEarth}),
        composed=composition.composeOpticalMain(model,true,{physicalWorld:true}),
        inputs=gate.requestFromScene(composed,model),R=model.rEarth,
        targets=inputs.selected.map(function(s){return s.target.slice();}),
        sceneSignature=JSON.stringify(targets),controls=inputs.request.controls;
      if(targets.length!==48)throw Error('Expected 48 real authored physical targets; got '+targets.length);
      phase='48 authored Globe targets';
      probeStatus('Globe conformal: original predictor, inverse exponential, coarse conformal + strict RK4…');
      await new Promise(function(resolve){root.setTimeout(resolve,0);});
      if(interrupted())return;
      var request={geometry:'globe',radius:R,observerHeight:model.Height,
        atmosphere:'standard',targets:targets,controls:controls};
      var main=conformal.experiment(request,{steps:2,corrections:2,repeats:5});
      phase='surface and equal-height stress targets';
      var stress=conformal.experiment(Object.assign({},request,
        {targets:conformal.stressTargets(R,model.Height)}),
        {steps:2,corrections:2,repeats:1});
      phase='accuracy envelope: 1-100 km, observer 15m/100m, 0-500m target altitude';
      var envelope=[15,100].map(function(eye){
        return {observerHeight:eye,report:conformal.experiment(Object.assign({},request,
          {observerHeight:eye,targets:conformal.envelopeTargets(R)}),
          {steps:2,corrections:2,repeats:1})};
      });
      if(interrupted())return;
      phase='confirming scene and preparing ZIP';
      if(state.comparePair.A!==source)throw Error('Compare A scene changed during benchmark');
      var fresh=composition.composeOpticalMain(Object.assign({},source,
        {showModel:1,geometryRadius:source.rEarth}),true,{physicalWorld:true});
      if(JSON.stringify(gate.requestFromScene(fresh,model).selected.map(function(s){return s.target;}))!==sceneSignature)
        throw Error('Authored physical scene targets changed during benchmark');
      var result={version:'140.12.43',kind:'Globe CPU f64 conformal shooting feasibility',
        source:'48 actual authored object-edge targets from Compare A; no synthetic timing replacements',
        model:'n(h)=1+N exp(-h/H); x=R phi, u=R ln(r/R), m(u)=(r/R)n(h)',
        inverseApproximation:'m_inv(u)=(1+N)exp(u/R_eff); 1/R_eff=1/R-N/(H(1+N))',
        productionUnchanged:true,experimentalOnly:true,elapsedMs:profileNow()-started,
        main:main,stress:stress,envelope:envelope,
        timingScope:'48-target warm main-thread JS only; stress/envelope NOT included in main medians',
        verificationScope:'Only existing Globe RK4 checks target residual and first-ground event. Candidate angles alone have no visibility claim.'};
      var guide=['CPU f64 Conformal Globe Shooting #140.12.43',
        'Same 48 authored real-world Globe targets as #140.12.42; 5 warmed rounds.',
        'Three timed pipelines: existing RK4 predictor; surface-matched inverse exponential + strict RK4; exact-conformal coarse RK4 (2 x steps, 2 Newton corrections) + strict Globe RK4.',
        'Each total includes prediction cost and original RK4 warm-start checking/fallback.',
        'The inverse exponential is only an approximate angle and cannot determine visibility or ground contact.',
        'The conformally transformed medium is mathematically exact, but coarse two-step integration and Newton shooting are approximations; the unchanged Globe RK4 certifies final status.',
        'stress: 8 surface/equal-height targets at 1/3/10/20 km. envelope: 40 cases, eyes 15m and 100m, target altitudes 0/15/100/500m at 1/10/25/50/100km.',
        'Stress and envelope are excluded from the 48-target performance medians.',
        'No renderer frame, pixel parity, global multipath completeness, or browser GPU run is claimed.',
        'Surface-matched effective radius is profile-dependent; 4R/3 is shown as a separate comparator.',
        'NO production shooting/painter changes.'];
      download([{name:'results.json',data:JSON.stringify(result,null,2)},
        {name:'authored-globe.csv',data:csv(main,model.Height)},
        {name:'stress-globe.csv',data:csv(stress,model.Height)},
        {name:'envelope-eye-15m.csv',data:csv(envelope[0].report,15)},
        {name:'envelope-eye-100m.csv',data:csv(envelope[1].report,100)},
        {name:'performance.svg',data:chart(main)},
        {name:'README.txt',data:guide.join('\n')+'\n'}],
        'curvature-compare-140.12.43-cpu-f64-conformal-globe.zip');
      var metric=probeUi('ModernCpuResearchMetrics');
      if(metric)metric.textContent='CPU f64 Globe · existing predictor '+main.mediansMs.predictorOnlyMs.toFixed(2)+
        ' ms / inverse exponential '+main.mediansMs.analyticTotalMs.toFixed(2)+
        ' ms / conformal '+main.mediansMs.conformalTotalMs.toFixed(2)+' ms · strict warm starts '+
        main.summary.conformalWarmAccepted+'/48 · ZIP exported';
      probeStatus('Globe conformal + effective-radius benchmark exported · production renderer unchanged');
    }catch(error){if(!interrupted()){
      numericAuditFailed('140.12.43','runCpuConformalBenchmark141243',error,
        {phase:phase,elapsedMs:profileNow()-started});
      try{download([{name:'error.json',data:JSON.stringify({version:'140.12.43',
        phase:phase,message:String(error&&error.message||error)},null,2)}],
        'curvature-compare-140.12.43-cpu-f64-conformal-globe-error.zip');}catch(_){/* original error shown */}
      probeStatus('Conformal Globe benchmark failed ('+phase+'): '+String(error&&error.message||error));
    }}finally{state.probeBusy=false;if(button)button.disabled=false;}
  }
  // #140.12.42: no WebGPU, no renderer mutation. Two invariant quadratures
  // use equivalent physical heights from original authored edges; each hybrid
  // result still follows the existing RK4 ground-contact path. No production
  // promotion can follow from the monotone-branch benchmark alone.
  async function runCpuQuadratureBenchmark141242(){
    if(state.probeBusy||state.mode!=='compare')return;
    var quadrature=root.CurvatureCpuQuadratureFeasibility141242,
      gate=root.CurvatureGpuDsPainterGate141240,
      composition=root.CurvatureIndependentComposition,
      zipWriter=root.GeometryDiagnosticsZip,
      source=state.comparePair&&state.comparePair.A,
      button=probeUi('ModernCpuQuadratureRun'),started=profileNow(),phase='preparing',
      generation=state.probeGeneration;
    if(!quadrature||!gate||!composition||!zipWriter||!source){
      probeStatus('CPU quadrature benchmark: missing modules or Compare A');return;
    }
    if(state.compareConfig&&state.compareConfig.A&&
        state.compareConfig.A.atmosphere!=='standard'){
      probeStatus('CPU quadrature benchmark uses Compare A standard atmosphere (Flat and Globe both audited).');return;
    }
    if(!(source.Height>0&&source.Height<=147)||!(source.rEarth>=1e5)){
      probeStatus('CPU quadrature benchmark needs a positive observer height and finite radius');return;
    }
    function interrupted(){return generation!==state.probeGeneration||state.mode!=='compare';}
    function download(files,name){
      var blob=zipWriter.build(files),url=root.URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=name;
      try{link.click();}finally{
        if(root.setTimeout)root.setTimeout(function(){root.URL.revokeObjectURL(url);},1000);
        else root.URL.revokeObjectURL(url);
      }
    }
    state.probeBusy=true;if(button)button.disabled=true;
    try{
      // The previous DS gate is only a deterministic object-edge sampler.
      // It is NOT used for DS shooting or for any GPU operation here.
      var model=Object.assign({},source,{showModel:1,geometryRadius:source.rEarth}),
        composed=composition.composeOpticalMain(model,true,{physicalWorld:true}),
        inputs=gate.requestFromScene(composed,model),R=model.rEarth,
        originalTargets=inputs.selected.map(function(s){return s.target.slice();}),
        surfaceTargets=inputs.selected.map(function(s){return [s.target[0],s.heightMetres];}),
        flatTargets=surfaceTargets.map(function(t){return t.slice();}),
        sceneSignature=JSON.stringify(originalTargets),controls=inputs.request.controls;
      phase='running CPU f64 Flat and Globe benchmarks';
      probeStatus('CPU f64 quadrature: RK4, predictor-only, integral, seeded RK4 · Flat + Globe…');
      // Yield a UI frame before synchronous CPU timings. Neither mode may
      // borrow roots or results from the other.
      await new Promise(function(resolve){root.setTimeout(resolve,0);});
      if(interrupted())return;
      var flat=quadrature.experiment({geometry:'flat',radius:R,observerHeight:model.Height,
        atmosphere:'standard',targets:flatTargets,controls:controls},{nodes:64,repeats:5});
      var globe=quadrature.experiment({geometry:'globe',radius:R,observerHeight:model.Height,
        atmosphere:'standard',targets:originalTargets,controls:controls},{nodes:64,repeats:5});
      // Additional edge cases are audited separately from the 48-target timing
      // population, so difficult/unsupported paths cannot improve its median.
      function stressTargets(kind){
        var xs=[1000,3000,10000,20000],heights=[0,model.Height];
        return xs.reduce(function(out,x){heights.forEach(function(h){
          var z=kind==='flat'?h:h-x*x/(Math.sqrt((R+h)*(R+h)-x*x)+R+h);
          out.push([x,z]);
        });return out;},[]);
      }
      phase='auditing equal-height and ground-endpoint cases';
      var flatStress=quadrature.experiment({geometry:'flat',radius:R,observerHeight:model.Height,
        atmosphere:'standard',targets:stressTargets('flat'),controls:controls},{nodes:64,repeats:1});
      var globeStress=quadrature.experiment({geometry:'globe',radius:R,observerHeight:model.Height,
        atmosphere:'standard',targets:stressTargets('globe'),controls:controls},{nodes:64,repeats:1});
      if(interrupted())return;
      phase='verifying scene identity and exporting ZIP';
      if(state.comparePair.A!==source)throw Error('Compare A scene changed during benchmark');
      var fresh=composition.composeOpticalMain(Object.assign({},source,
        {showModel:1,geometryRadius:source.rEarth}),true,{physicalWorld:true});
      if(JSON.stringify(gate.requestFromScene(fresh,model).selected.map(function(p){return p.target;}))!==sceneSignature)
        throw Error('Authored physical targets changed during benchmark');
      var result={version:'140.12.42',kind:'CPU f64 quadrature feasibility',
        source:'same 48 authored metric scene contour samples as #140.12.40',
        conversion:'Globe: original [x,z]; Flat: same authored horizontal x and physical altitude h',
        experimentalOnly:true,productionUnchanged:true,elapsedMs:profileNow()-started,
        flat:flat,globe:globe,stress:{flat:flatStress,globe:globeStress,
          note:'8 extra targets per geometry: 1/3/10/20 km at surface and same height as observer; excluded from performance medians'}};
      var summary=['CPU f64 Quadrature Feasibility #140.12.42',
        'The 48 targets come from actual authored object edges, not a synthetic ray grid.',
        'Flat has the same horizontal distance and physical height as Globe.',
        'Quadrature only supports ONE monotone-height leg; turning rays and equal-height targets are unsupported.',
        'Unresolved candidates remain unsupported; no invisible status is invented.',
        'Hybrid is quadratic-angle warm-start into existing RK4, preserving original residual, ground detection and fallback.',
        'Predictor-only RK4 is measured separately, so a predictor speed gain is not credited to quadrature.',
        'Medians are warmed JavaScript main-thread timings, not full-frame speedups.',
        'Separate stress cases cover surface endpoints and equal-height rays at four distances; NOT included in 48-target medians.',
        'Neither a ground-parity proof nor a production frame is provided.'];
      function csv(report){
        var columns=['index','target','heightMetres','cpuStatus','cpuAngleRadians',
          'quadratureStatus','quadratureReason','quadratureAngleRadians','angularDifferenceRadians',
          'quadratureIntegrals','quadratureSamples','cpuRK4Calls','predictorOnlyRK4Calls',
          'hybridStatus','hybridRK4Calls','hybridWarmStartAccepted','hybridFallback',
          'hybridStatusMismatch','hybridAngleMismatch','hybridGroundHitMismatch'];
        function cell(v){if(v===undefined||v===null)return '';var text=Array.isArray(v)?v.join('|'):String(v);
          return /[,"\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;}
        return columns.join(',')+'\n'+report.rows.map(function(row){return columns.map(function(k){return cell(row[k]);}).join(',');}).join('\n')+'\n';
      }
      function svgBars(){
        var modes=[{name:'RK4',key:'rk4Ms'},
          {name:'RK4 predictor only',key:'predictorOnlyMs'},
          {name:'Quadrature only',key:'quadratureMs'},
          {name:'Quadrature + RK4',key:'hybridTotalMs'}],
          values=[flat,globe].reduce(function(out,item){modes.forEach(function(m){out.push(item.mediansMs[m.key]);});return out;},[]),
          max=Math.max.apply(null,values.concat([.001])),scale=420/max;
        var lines=['<svg xmlns="http://www.w3.org/2000/svg" width="780" height="310" viewBox="0 0 780 310">',
          '<rect width="780" height="310" fill="white"/>',
          '<text x="20" y="25" font-family="sans-serif" font-weight="bold" font-size="17">CPU f64 median timings · 48 physical targets</text>'];
        [flat,globe].forEach(function(item,g){
          lines.push('<text x="20" y="'+(50+g*128)+'" font-size="14" font-family="sans-serif">'+item.geometry+'</text>');
          modes.forEach(function(m,i){
            var ms=item.mediansMs[m.key],y=58+g*128+i*27,width=Math.max(.5,ms*scale),color=i===3?'#b87834':i===1?'#5c91a1':'#64748b';
            lines.push('<text x="20" y="'+(y+14)+'" font-size="11" font-family="sans-serif">'+m.name+'</text>');
            lines.push('<rect x="165" y="'+y+'" width="'+width.toFixed(2)+'" height="17" fill="'+color+'"/>');
            lines.push('<text x="'+(170+width).toFixed(2)+'" y="'+(y+13)+'" font-size="12" font-family="sans-serif">'+ms.toFixed(3)+' ms</text>');
          });
        });
        lines.push('</svg>');return lines.join('');
      }
      download([{name:'results.json',data:JSON.stringify(result,null,2)},
        {name:'flat-targets.csv',data:csv(flat)},
        {name:'globe-targets.csv',data:csv(globe)},
        {name:'stress-flat.csv',data:csv(flatStress)},
        {name:'stress-globe.csv',data:csv(globeStress)},
        {name:'performance.svg',data:svgBars()},
        {name:'README.txt',data:summary.join('\n')+'\n'}],
        'curvature-compare-140.12.42-cpu-f64-quadrature-feasibility.zip');
      var metric=probeUi('ModernCpuResearchMetrics');
      if(metric)metric.textContent='CPU f64 quadrature · Flat '+flat.summary.quadratureCandidates+'/48 · '+
        flat.mediansMs.hybridTotalMs.toFixed(1)+' ms hybrid / '+flat.mediansMs.rk4Ms.toFixed(1)+' ms RK4; Globe '+
        globe.summary.quadratureCandidates+'/48 · '+globe.mediansMs.hybridTotalMs.toFixed(1)+
        ' ms hybrid / '+globe.mediansMs.rk4Ms.toFixed(1)+' ms RK4 · ZIP exported';
      probeStatus('CPU f64 quadrature Flat + Globe benchmark exported · no renderer changes');
    }catch(error){if(!interrupted()){
      numericAuditFailed('140.12.42','runCpuQuadratureBenchmark141242',error,
        {phase:phase,elapsedMs:profileNow()-started});
      try{download([{name:'error.json',data:JSON.stringify({version:'140.12.42',
        phase:phase,message:String(error&&error.message||error)},null,2)}],
        'curvature-compare-140.12.42-cpu-f64-quadrature-feasibility-error.zip');}
      catch(_){/* original diagnostic error reported below */}
      probeStatus('CPU quadrature benchmark failed ('+phase+'): '+String(error&&error.message||error));
    }}finally{state.probeBusy=false;if(button)button.disabled=false;}
  }
  // #140.12.40: isolate real-scene GPU DS ray samples BEFORE any attempt to
  // inject them into the existing CPU painter. The current DS GPU kernel is a
  // bounded radial Bouguer root, NOT the CPU RK4 algorithm. Never fabricate
  // a GPU DS painted frame or claim CPU-equivalent visibility from this gate.
  // #140.12.41: true independent GPU DS RK4 shooting and sampled ground-event
  // research gate. Only the 48 authored geometry samples are transferred;
  // original adaptive polygon construction and Canvas painter remain untouched.
  async function runCameraFirstOracle141238(){
    if(state.probeBusy||state.mode!=='compare')return;
    var oracle=root.CurvatureCameraFirstOracle141238,
      pixelAudit=root.CurvatureGpuPixelSpaceAudit141233,
      visual=root.CurvatureAttributionVisualZip141236,
      zipWriter=root.GeometryDiagnosticsZip,
      pair=state.comparePair,source=pair&&pair.A,
      graph=state.compareGraphs&&state.compareGraphs.A,
      button=probeUi('ModernCameraFirstOracleRun'),
      generation=state.probeGeneration,phase='initial camera';
    if(!oracle||!pixelAudit||!visual||!zipWriter||!source||!graph){
      probeStatus('Camera-first CPU oracle unavailable: missing physical modules / Compare A.');return;
    }
    if(state.compareConfig&&state.compareConfig.A&&
        (state.compareConfig.A.surface!=='globe'||state.compareConfig.A.atmosphere!=='standard')){
      probeStatus('Camera-first oracle requires Compare A Globe and standard atmosphere.');return;
    }
    if(source.showModel===2||!(source.Height>0)){
      probeStatus('Camera-first oracle requires Globe and positive eye height.');return;
    }
    var interrupted=function(){return state.probeGeneration!==generation||
      state.mode!=='compare';};
    var started=profileNow();state.probeBusy=true;if(button)button.disabled=true;
    try{
      var camera=pixelAudit.capture(source,graph),config={model:source,snapshot:camera};
      oracle.check(config);
      var vacuum=[],standard=[],modes=['vacuum','standard'];
      for(var m=0;m<modes.length;m++){
        var name=modes[m],rows=name==='vacuum'?vacuum:standard;
        for(var row=0;row<oracle.SIZE;row++){
          if(interrupted())return;
          phase=name+' row '+row;
          rows.push(oracle.sampleRow(config,row,name));
          if(row%4===3){
            probeStatus('Camera-first CPU f64 '+name+': '+(row+1)+'/64 rows…');
            await new Promise(function(resolve){root.setTimeout(resolve,0);});
          }
        }
      }
      if(interrupted())return;
      phase='horizon convergence sweep';
      probeStatus('Camera-first: 41 same-angle standard-atmosphere RK4 convergence rays…');
      var sweep=oracle.horizonSweep(config);
      if(interrupted())return;
      phase='report and PNG ZIP';
      var report=oracle.report(config,vacuum,standard,sweep);
      report.wallTimeMs=profileNow()-started;
      var entries=oracle.entries(config,report,vacuum,standard,document,visual),
        zip=zipWriter.build(entries),url=root.URL.createObjectURL(zip),
        link=document.createElement('a');
      link.href=url;link.download='curvature-compare-140.12.38-camera-first-cpu-oracle.zip';
      try{link.click();}finally{
        if(typeof root.setTimeout==='function')root.setTimeout(function(){root.URL.revokeObjectURL(url);},1000);
        else root.URL.revokeObjectURL(url);
      }
      var metrics=probeUi('ModernCpuResearchMetrics');
      if(metrics)metrics.textContent='Camera-first CPU ground-only: vacuum analytic disagreements '+
        report.vacuum.analyticDisagreements+'/4096 · 41-ray standard convergence status changes '+
        sweep.sameAngleClassificationDisagreements+' · ZIP exported';
      probeStatus('Camera-first CPU f64 ground-only diagnostic complete · 64×64 vacuum and standard, horizon sweep · ZIP exported');
    }catch(error){if(!interrupted()){
      numericAuditFailed('140.12.38','runCameraFirstOracle141238',error,
        {phase:phase,elapsedMs:profileNow()-started});
      probeStatus('Camera-first CPU oracle failed: '+String(error&&error.message||error));
    }}finally{state.probeBusy=false;if(button)button.disabled=false;}
  }
  // #140.12.39: opt-in direct CPU f64 first opaque-world-polygon / Earth hit.
  // Reuses the #140.12.38 camera direction convention, not target shooting,
  // optical polygon projection, GPU field, or screen-space z-depth.
  async function runCameraFirstObjects141239(){
    if(state.probeBusy||state.mode!=='compare')return;
    var objects=root.CurvatureCameraFirstObjects141239,
      oracle=root.CurvatureCameraFirstOracle141238,
      pixelAudit=root.CurvatureGpuPixelSpaceAudit141233,
      composition=root.CurvatureIndependentComposition,
      parity=root.CurvatureGpuFullFrameParity141234,
      visual=root.CurvatureAttributionVisualZip141236,
      zipWriter=root.GeometryDiagnosticsZip,
      source=state.comparePair&&state.comparePair.A,
      graph=state.compareGraphs&&state.compareGraphs.A,
      button=probeUi('ModernCameraFirstObjectsRun'),
      generation=state.probeGeneration,phase='capturing camera and physical scene';
    if(!objects||!oracle||!pixelAudit||!composition||!parity||!visual||!zipWriter||!source||!graph){
      probeStatus('Camera-first objects unavailable: missing source scene or diagnostic module.');return;
    }
    if((state.compareConfig&&state.compareConfig.A&&
        (state.compareConfig.A.surface!=='globe'||state.compareConfig.A.atmosphere!=='standard'))||
        source.showModel!==1||!(source.Height>0)){
      probeStatus('Camera-first object audit requires Compare A Globe, standard atmosphere and positive eye height.');return;
    }
    var interrupted=function(){return state.probeGeneration!==generation||
      state.mode!=='compare';};
    var started=profileNow();state.probeBusy=true;if(button)button.disabled=true;
    try{
      var camera=pixelAudit.capture(source,graph),
        captured=parity.canvasCapture(graph.Canvas),
        model=Object.assign({},source,{geometryRadius:source.rEarth}),
        composed=composition.composeOpticalMain(model,true,{physicalWorld:true}),
        mesh=objects.prepare(composed),config={model:source,snapshot:camera},rows=[];
      oracle.check(config);
      if(!mesh.triangles.length&&!mesh.proxyTriangles.length)throw Error('No authored object polygons in Compare A physical scene');
      for(var row=0;row<objects.SIZE;row++){
        if(interrupted())return;
        phase='integrating object and Earth intersections, row '+row;
        rows.push(objects.sampleRow(config,mesh,row,'standard',objects.STEP));
        if(row%2===1){
          probeStatus('Camera-first first-object/Earth f64: '+(row+1)+'/64 rows…');
          await new Promise(function(resolve){root.setTimeout(resolve,0);});
        }
      }
      if(interrupted())return;
      phase='selecting and tracing focused physical-object ROI';
      var roi=objects.focusedRoi(config,composed),roiRows=[];
      if(roi){
        for(var focusRow=0;focusRow<objects.SIZE;focusRow++){
          if(interrupted())return;
          phase='focused ROI '+(focusRow+1)+'/64';
          roiRows.push(objects.sampleRow(roi.config,mesh,focusRow,'standard',objects.STEP));
          if(focusRow%2===1){
            probeStatus('Camera-first focused object ROI: '+(focusRow+1)+'/64 rows…');
            await new Promise(function(resolve){root.setTimeout(resolve,0);});
          }
        }
      }
      if(interrupted())return;
      phase='same-pixel 100m / 50m RK4-chord first-hit convergence';
      var convergence=objects.convergence(roi?roi.config:config,mesh,roi?roiRows:rows,128);
      if(interrupted())return;
      phase='rendering diagnostic PNG and ZIP';
      var report={version:objects.VERSION,kind:'camera-first-first-opaque-object-or-ground',
        title:'Independent camera-first CPU f64 object/Earth first-hit investigation',
        method:'authored physical metric 3D opaque polygon triangulation; radial ray meridian RK4; 3D integrated-segment chord intersections',
        camera:camera,rayGrid:{width:64,height:64,maxDistanceMetres:objects.MAX_DISTANCE,
          stepMetres:objects.STEP},
        scene:{composition:composed.scene.metadata.composition,
          physicalMetricWorld:composed.scene.metadata.physicalMetricWorld,
          sourceObjectLayers:composed.ranges.filter(function(r){return r.role==='objects';}).map(function(r){return {name:r.name,count:r.count};})},
        summary:objects.summary(rows,mesh),samples:rows.flat(),
        focusedRoi:roi?{bounds:roi.bounds,chosenObject:roi.chosenObject,warning:roi.warning,
          summary:objects.summary(roiRows,mesh),samples:roiRows.flat()}:null,
        refinement:convergence,wallTimeMs:profileNow()-started,
        limitations:[
          'This is a separate camera-first OBJECT diagnostic; it uses the same physical RK4 kernel as #140.12.38, not an independent integrator.',
          'A curved path is intersected using 100m straight chords. Small/grazing polygon hits are not certified; a later convergence audit must bracket them.',
          'Unfilled tower outlines are also examined as a separate hypothetical opaque-silhouette proxy, not a physical visibility result.',
          'The focused ROI is chosen from vacuum object projections purely for sampling placement; it does not change physical tracing.',
          'Only authored opaque filled polygons are intersected; thin lines, outline-only objects, alpha and textures are not reproduced.',
          'Original physical object polygons share their triangulation helper with the existing geometry pipeline; their OPTICALLY PROJECTED triangles are not used.',
          'First-hit uses integrated path ordering; no screen-space z-buffer, inverse target shooting or GPU fields.',
          'A downsample of the production CPU Canvas is provided only as a visual reference; colours/guides/strokes are not semantic hit labels.',
          'No contact by 30km does not imply infinite-distance visibility or exclude farther objects.',
          'No changes to production CPU/GPU painting, WebGPU, shader or optics solver.'
        ]};
      var files=objects.entries(rows,report,captured,document,visual,roiRows,roi),
        zip=zipWriter.build(files),url=root.URL.createObjectURL(zip),
        link=document.createElement('a');
      link.href=url;
      link.download='curvature-compare-140.12.39-camera-first-objects.zip';
      try{link.click();}finally{
        if(typeof root.setTimeout==='function')root.setTimeout(function(){root.URL.revokeObjectURL(url);},1000);
        else root.URL.revokeObjectURL(url);
      }
      var metrics=probeUi('ModernCpuResearchMetrics');
      if(metrics)metrics.textContent='Camera-first 64×64 f64: '+report.summary.counts.object+
        ' object / '+report.summary.counts.ground+' Earth / '+report.summary.counts.range+
        ' range · ZIP exported';
      probeStatus('Camera-first object/Earth diagnostic exported · '+report.summary.counts.object+
        ' object hits / 4096 rays · ZIP');
    }catch(error){if(!interrupted()){
      numericAuditFailed('140.12.39','runCameraFirstObjects141239',error,
        {phase:phase,elapsedMs:profileNow()-started});
      probeStatus('Camera-first object audit failed: '+String(error&&error.message||error));
    }}finally{state.probeBusy=false;if(button)button.disabled=false;}
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
    bindCpuResearch();
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

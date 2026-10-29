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
    compareEyeLevel:false,compareHorizon:true,horizonCache:{Scene:null,A:null,B:null},compareConfig:null,compareSelected:'A',compareCache:{A:null,B:null}};
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
  var renderProfiler=root.CurvatureModernRenderProfiler?
    root.CurvatureModernRenderProfiler.create():null;
  // 138.2: the shimmer is a screen-space visual approximation, NOT an
  // atmosphere-derived C_n^2 prediction. Disabled means no extra RAF or GPU.
  var atmosphericShimmer=root.CurvatureModernAtmosphericShimmer?
    root.CurvatureModernAtmosphericShimmer.create():null;
  var atmosphericPresentation=root.CurvatureModernAtmosphericPresentation?
    root.CurvatureModernAtmosphericPresentation.create({document:document,
      present:atmosphericShimmer?function(source,target,name,meta){
        try{return atmosphericShimmer.present(source,target,name,meta);}
        catch(error){atmosphericShimmer.noteError(name,error);throw error;}
      }:undefined,
      onRemove:atmosphericShimmer?atmosphericShimmer.dispose:undefined}):null;
  var shimmerFrame=null;
  var shimmerPaused={Scene:false,A:false,B:false};
  function shimmerAnimating(name){return !shimmerPaused[name]&&atmosphericPresentation.ready(name);}
  function shimmerViews(){return state.mode==='compare'?['A','B']:['Scene'];}
  function scheduleShimmerFrame(){
    if(shimmerFrame!==null||!atmosphericShimmer||!atmosphericPresentation||document.hidden)return;
    if(!shimmerViews().some(shimmerAnimating))return;
    shimmerFrame=requestAnimationFrame(function(timestamp){
      shimmerFrame=null;
      shimmerViews().forEach(function(name){if(shimmerAnimating(name))
        atmosphericPresentation.frame(name,timestamp);});
      scheduleShimmerFrame();
    });
  }
  function stopShimmerFrame(){
    if(shimmerFrame!==null){cancelAnimationFrame(shimmerFrame);shimmerFrame=null;}
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
            // A paused viewport can preview a setting change without advancing time.
            if(atmosphericPresentation.ready(name))atmosphericPresentation.frame(name);
            syncShimmerControls();scheduleShimmerFrame();
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
      horizon:state.compareHorizon,selected:state.compareSelected});
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
        deferDecorations:separateDecorations
      });
      var renderedAt=profileNow();
      var guideGraph=atmosphericPresentation?atmosphericPresentation.capture('Scene',g):g;
      // drawPresentationDecorations also handles WebGL-unavailable fallback:
      // if capture failed, the original Canvas receives its captions again.
      if(separateDecorations&&root.CurvatureMainCanvasRenderer.drawPresentationDecorations)
        root.CurvatureMainCanvasRenderer.drawPresentationDecorations(
          guideGraph.Canvas,model,result.decorationCamera);
      state.last=result;
      var sceneOptions={atmosphere:state.atmosphere,occlusionRadius:state.occlusionRadius};
      if(state.compareEyeLevel&&guideGraph&&guideGraph.Canvas)drawCompareEyeLevel(guideGraph,model);
      if(state.compareHorizon)drawCompareHorizon('Scene',guideGraph,model,sceneOptions);
      scheduleShimmerFrame();
      var finishedAt=profileNow();
      if(renderProfiler)renderProfiler.recordRender({viewport:'Scene',
        totalMs:finishedAt-startedAt,rendererMs:renderedAt-startedAt,
        overlayMs:finishedAt-renderedAt,stages:result.timings,cacheReused:result.cacheReused});
      var fullStatus=(result.cacheReused?'Cached optics':'Physical optics')+
        ' · '+result.drawn+' outline pieces · '+result.fillTriangles+
        ' fill triangles · '+result.unresolved+' unresolved'+
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
        occlusionRadius:spec?spec.occlusionRadius:state.occlusionRadius,interactive:false};
      // Separate optical sessions prevent A and B from evicting each other's
      // keyed ray fields as two viewports are rendered in succession.
      if(state.compareCache[side])options.cacheSession=state.compareCache[side];
      var separateDecorations=!!(atmosphericPresentation&&atmosphericPresentation.enabled(side));
      if(separateDecorations)options.deferDecorations=true;
      var result=root.CurvatureMainCanvasRenderer.renderPhysical(g,m,options);
      var renderedAt=profileNow();
      var guideGraph=atmosphericPresentation?atmosphericPresentation.capture(side,g):g;
      if(separateDecorations&&root.CurvatureMainCanvasRenderer.drawPresentationDecorations)
        root.CurvatureMainCanvasRenderer.drawPresentationDecorations(
          guideGraph.Canvas,m,result.decorationCamera);
      state.compareLast[side]=result;
      if(state.compareEyeLevel&&guideGraph&&guideGraph.Canvas)drawCompareEyeLevel(guideGraph,m);
      if(state.compareHorizon)drawCompareHorizon(side,guideGraph,m,options);
      else {var hr=el('ModernHorizonStatus'+side);if(hr)hr.textContent='Horizon guide hidden';}
      scheduleShimmerFrame();
      var finishedAt=profileNow();
      if(renderProfiler)renderProfiler.recordRender({viewport:side,
        totalMs:finishedAt-startedAt,rendererMs:renderedAt-startedAt,
        overlayMs:finishedAt-renderedAt,stages:result.timings,cacheReused:result.cacheReused});
      var node=el('ModernCompareStatus'+side);
      if(node){
        node.textContent=(result.cacheReused?'Repainted (cached rays)':'Computed optics')+' · '+result.drawn+
          ' contours · '+result.fillTriangles+' fills · '+result.unresolved+' unresolved';
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
      atmosphericPresentation.resume();scheduleShimmerFrame();
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
  function redraw(){
    if(activeCameraPointer)cancelCameraDrag();
    var setupStartedAt=profileNow();
    cancelPending();
    model.Update();refreshLabels();
    scheduleExperimentSave();
    if(state.mode==='compare'){
      if(!prepareCompare()){if(cameraPreview)cameraPreview.clear();return;}
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
        }finally{if(cameraPreview)cameraPreview.clear();}
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
        }finally{if(cameraPreview)cameraPreview.clear();}
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
    getCameraInteraction:function(){return cameraInteraction;},
    // Atmospheric presentation remains independently inspectable through DevTools.
    getAtmosphericPresentation:function(){return atmosphericPresentation;},
    // DevTools API remains available alongside the 138.3 Atmosphere controls.
    getAtmosphericShimmer:function(){return atmosphericShimmer;}};
}(window));

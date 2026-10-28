/* Modern UI: separate HTML shell over one CurveAppClass and one shared Physical
 * renderer. Scene controls (131) never read/drive the Legacy DOM.
 * GraphX3DX is created at the parser's document.write position.
 */
(function(root){
  'use strict';
  var state={mode:'scene',atmosphere:'standard',occlusionRadius:6371000,
    preset:'pontchartrain',timer:null,frame:null,graph:null,last:null,editTimeouts:{},
    compareGraphs:{A:null,B:null},comparePair:null,compareLast:{A:null,B:null},
    compareEyeLevel:false,compareHorizon:true,horizonCache:{A:null,B:null},compareConfig:null,compareSelected:'A',compareCache:{A:null,B:null}};
  var adapter=root.CurvatureModernSceneState131;
  var compareAdapter=root.CurvatureModernCompareModel132;
  var compareState=root.CurvatureModernCompareState133;
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
  function updateStatus(text,isError){
    var node=el('ModernStatus');
    if(node){node.textContent=text;node.classList.toggle('is-error',!!isError);}
  }
  function refreshLabels(){
    var curvature=root.CurvaturePhysicalCurvature127;
    var output=el('ModernCurvatureLabel');
    if(output)output.textContent=curvature.label(model);
    var slider=el('ModernCurvature');
    if(slider)slider.value=String(curvature.modelStep(model));
    var flat=el('ModernFlat');if(flat)flat.checked=model.showModel===2;
    var radius=el('ModernRadiusKm');
    if(radius){radius.disabled=model.showModel===2;
      if(model.showModel===1)radius.value=String(Number((model.rEarth/1000).toPrecision(12)));}
    var mode=el('ModernViewInfo');
    if(mode)mode.textContent=(model.viewcenterHorizon===3?'Eye level':'Camera aim '+model.viewcenterHorizon)+
      ' · '+(model.showModel===2?'Flat surface':'Globe');
    var pill=el('ModernModePill');if(pill)pill.textContent=state.mode.toUpperCase();
    var wrap=el('ModernOcclusionWrap');
    if(wrap)wrap.hidden=!['inverse-spherical','exponential-occlusion'].includes(state.atmosphere);
    var fov=el('ModernViewAngle');if(fov&&Number.isFinite(model.ViewAngle))
      fov.value=String(Number(model.ViewAngle.toFixed(4)));
  }
  function draw(g){
    if(state.mode!=='scene')return;
    try{
      var result=root.CurvatureMainCanvasRenderer.renderPhysical(g,model,{
        atmosphere:state.atmosphere,occlusionRadius:state.occlusionRadius,interactive:false
      });
      state.last=result;
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
      // A and B invoke the actual Physical renderer separately, not copied pixels.
      var spec=state.compareConfig&&state.compareConfig[side];
      var options={atmosphere:spec?spec.atmosphere:state.atmosphere,
        occlusionRadius:spec?spec.occlusionRadius:state.occlusionRadius,interactive:false};
      // Separate optical sessions prevent A and B from evicting each other's
      // keyed ray fields as two viewports are rendered in succession.
      if(state.compareCache[side])options.cacheSession=state.compareCache[side];
      var result=root.CurvatureMainCanvasRenderer.renderPhysical(g,m,options);
      state.compareLast[side]=result;
      if(state.compareEyeLevel)drawCompareEyeLevel(g,m);
      if(state.compareHorizon)drawCompareHorizon(side,g,m,options);
      else {var hr=el('ModernHorizonStatus'+side);if(hr)hr.textContent='Horizon guide hidden';}
      var node=el('ModernCompareStatus'+side);
      if(node){
        node.textContent=(result.cacheReused?'Cached':'Computed')+' · '+result.drawn+
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
    var detector=root.CurvatureRayHorizon1332;
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
    var aim=m.viewcenterHorizon===3?0:root.CurvaturePhysicalCamera127.create(m).aimDip;
    var relative=aim-tilt-elevationDegrees*Math.PI/180;
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
  function syncCompareEditor(){
    if(!compareState||!state.compareConfig)return;
    var spec=state.compareConfig[state.compareSelected];
    ['A','B'].forEach(function(side){
      var tab=el('ModernModelTab'+side);if(!tab)return;
      var active=state.compareSelected===side;
      tab.classList.toggle('is-active',active);
      tab.setAttribute('aria-pressed',String(active));
    });
    var pairPreset=el('ModernPairPreset');if(pairPreset)pairPreset.value=state.compareConfig.preset;
    var fields={ModernModelSurface:'surface',ModernModelRadius:'radiusKm',
      ModernModelAtmosphere:'atmosphere',ModernModelOcclusion:'occlusionRadius'};
    Object.keys(fields).forEach(function(id){var node=el(id);if(node)node.value=String(spec[fields[id]]);});
    var wrap=el('ModernModelOcclusionWrap');if(wrap)
      wrap.hidden=!['inverse-spherical','exponential-occlusion'].includes(spec.atmosphere);
  }
  function bindCompareEditor(){
    if(!compareState)return; // 132 compatibility (older isolated test harness)
    ['A','B'].forEach(function(side){
      var tab=el('ModernModelTab'+side);if(tab)tab.addEventListener('click',function(){
        cancelEdits();state.compareSelected=side;syncCompareEditor();
      });
    });
    var preset=el('ModernPairPreset');if(preset)preset.addEventListener('change',function(){
      if(this.value==='custom')return;
      try{cancelEdits();state.compareConfig=compareState.preset(this.value);syncCompareEditor();redraw();}
      catch(error){updateStatus(error.message,true);syncCompareEditor();}
    });
    [['ModernModelSurface','surface'],['ModernModelAtmosphere','atmosphere']].forEach(function(row){
      var node=el(row[0]);if(!node)return;
      node.addEventListener('change',function(){
        try{state.compareConfig=compareState.update(state.compareConfig,state.compareSelected,row[1],node.value);
          syncCompareEditor();redraw();}
        catch(error){updateStatus(error.message,true);syncCompareEditor();}
      });
    });
    [['ModernModelRadius','radiusKm'],['ModernModelOcclusion','occlusionRadius']].forEach(function(row){
      var node=el(row[0]);if(!node)return;
      function commit(){
        if(state.editTimeouts[row[0]]!==undefined){clearTimeout(state.editTimeouts[row[0]]);delete state.editTimeouts[row[0]];}
        try{state.compareConfig=compareState.update(state.compareConfig,state.compareSelected,row[1],node.value);
          syncCompareEditor();redraw();}
        catch(error){updateStatus('Invalid '+row[1]+': '+error.message,true);syncCompareEditor();}
      }
      node.addEventListener('input',function(){
        if(state.editTimeouts[row[0]]!==undefined)clearTimeout(state.editTimeouts[row[0]]);
        state.editTimeouts[row[0]]=setTimeout(commit,420);
      });
      node.addEventListener('change',commit);
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
    if(state.timer!==null){clearTimeout(state.timer);state.timer=null;}
    if(state.frame!==null){cancelAnimationFrame(state.frame);state.frame=null;}
  }
  function redraw(){
    cancelPending();
    model.Update();refreshLabels();
    if(state.mode==='compare'){
      if(!prepareCompare())return;
      state.frame=requestAnimationFrame(function(){
        state.frame=null;
        ['A','B'].forEach(function(side){
          var view=state.compareGraphs[side];
          if(view){resizeGraph(view);view.Redraw();}
        });
      });
    }else{
      state.frame=requestAnimationFrame(function(){state.frame=null;resizeGraph(graph);graph.Redraw();});
    }
  }
  function scheduleRedraw(){
    cancelPending();
    updateStatus('Updating physical optics after parameter change…');
    state.timer=setTimeout(function(){state.timer=null;redraw();},300);
  }
  function setMode(mode){
    if(mode!=='scene'&&mode!=='compare')throw RangeError('Invalid Modern UI mode');
    cancelEdits();state.mode=mode;
    el('ModernSceneTab').classList.toggle('is-active',mode==='scene');
    el('ModernCompareTab').classList.toggle('is-active',mode==='compare');
    el('ModernSceneTab').setAttribute('aria-pressed',String(mode==='scene'));
    el('ModernCompareTab').setAttribute('aria-pressed',String(mode==='compare'));
    el('ModernCompareMessage').hidden=mode!=='compare';
    if(compareState){
      var sceneSettings=el('ModernSceneSettings'),compareSettings=el('ModernCompareSettings');
      if(sceneSettings)sceneSettings.hidden=mode==='compare';
      if(compareSettings)compareSettings.hidden=mode!=='compare';
    }
    if(mode==='compare'&&compareState){
      if(!state.compareConfig)
        state.compareConfig=compareState.initial(model,state.atmosphere,state.occlusionRadius);
      syncCompareEditor();
    }
    el('ModernGraphHost').closest('.modern-viewport-panel').hidden=mode==='compare';
    var views=el('ModernCompareViews');
    if(views){views.classList.toggle('is-active',mode==='compare');
      views.setAttribute('aria-hidden',String(mode!=='compare'));}
    refreshLabels();
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
  function bindNumber(id,action,description){
    var input=el(id);if(!input)return;
    function commit(){
      if(state.editTimeouts[id]!==undefined){clearTimeout(state.editTimeouts[id]);delete state.editTimeouts[id];}
      var raw=input.value;
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
      if(state.editTimeouts[id]!==undefined)clearTimeout(state.editTimeouts[id]);
      // Wait for intermediate values such as '-' or '1.'.
      state.editTimeouts[id]=setTimeout(commit,420);
    });
    input.addEventListener('change',commit);
  }
  function syncNumericInputs(){
    var pairs={ModernHeight:'Height',ModernFocal:'FocalLengthField',ModernPan:'Pan',
      ModernNick:'Nick',ModernRoll:'Roll'};
    Object.keys(pairs).forEach(function(id){var node=el(id);if(node)node.value=String(model[pairs[id]]);});
    var aim=el('ModernCameraAim');if(aim)aim.value=String(model.viewcenterHorizon);
    var atmosphere=el('ModernAtmosphere');if(atmosphere)atmosphere.value=state.atmosphere;
    var occlusion=el('ModernOcclusion');if(occlusion)occlusion.value=String(state.occlusionRadius);
    var grid=el('ModernGrid');if(grid)grid.checked=model.showGrid!==0;
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
  // 131.1: Presentation-only tabs and accessible contextual explanations.
  // Neither control identifiers nor physics/model state are duplicated here.
  var settingGroups=['Camera','Surface','Atmosphere','Objects','Display'];
  function activateSettings(name,focus){
    settingGroups.forEach(function(group){
      var tab=el('ModernSettings'+group),panel=el('ModernPanel'+group);
      if(!tab||!panel)return;
      var active=group===name;
      tab.classList.toggle('is-active',active);
      tab.setAttribute('aria-selected',String(active));
      tab.tabIndex=active?0:-1;
      panel.hidden=!active;
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
    ModernCameraAim:'Eye level holds a common local direction for comparisons. Horizon modes intentionally move their aim when curvature changes.',
    ModernCurvature:'Surface curvature is κ = 1/R. The far-right endpoint is exactly flat (κ = 0), not merely a very large sphere.',
    ModernRadiusKm:'Physical surface radius in kilometres. Independent of any special atmospheric comparison radius.',
    ModernFlat:'Sets exact zero surface curvature. Camera and tower distances do not change.',
    ModernAtmosphere:'Controls how light propagates. Vacuum has straight rays; Standard refracts; engineered profiles have separate parameters.',
    ModernOcclusion:'Parameter of the engineered atmosphere in metres, distinct from the surface radius.',
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
    bindObjectFields();
    bindSettingsTabs();
    bindHelp();
    bindCompareEditor();
    bindNumber('ModernHeight',function(v){adapter?adapter.setCamera(model,'Height',v):model.Height=v;},'observer height');
    bindNumber('ModernFocal',function(v){adapter?adapter.setCamera(model,'FocalLengthField',v):model.FocalLengthField=v;},'focal length');
    bindNumber('ModernPan',function(v){adapter?adapter.setCamera(model,'Pan',v):model.Pan=v;},'pan');
    bindNumber('ModernNick',function(v){adapter?adapter.setCamera(model,'Nick',v):model.Nick=v;},'nick');
    bindNumber('ModernRoll',function(v){adapter.setCamera(model,'Roll',v);},'roll');
    bindNumber('ModernViewAngle',function(v){adapter.setCamera(model,'ViewAngleField',v);},'field of view');
    bindNumber('ModernRadiusKm',function(v){adapter.setRadiusKm(model,v);},'radius');
    bindNumber('ModernOcclusion',function(v){
      state.occlusionRadius=adapter?adapter.finiteNumber(v,1,1e16):v;
    },'comparison radius');
    var aim=el('ModernCameraAim');aim.addEventListener('change',function(){
      if(adapter)applyField(function(v){adapter.setAim(model,v);},this.value,'camera aim');
      else {model.viewcenterHorizon=Number(this.value);redraw();}
    });
    el('ModernAtmosphere').addEventListener('change',function(){
      state.atmosphere=this.value;markCustom();redraw();
    });
    el('ModernGrid').addEventListener('change',function(){model.showGrid=this.checked?1:0;markCustom();redraw();});
    var curvature=root.CurvaturePhysicalCurvature127;
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
    syncNumericInputs();
    redraw();
  }
  if(typeof root.xOnLoad==='function')root.xOnLoad(bind);
  else root.addEventListener('load',bind);
  root.CurvatureModernApp130={getModel:function(){return model;},getMode:function(){return state.mode;},
    getLastRender:function(){return state.last;},getPreset:function(){return state.preset;},
    registerCompareGraph:registerCompareGraph,drawCompare:drawCompare,
    getCompareModels:function(){return state.comparePair;},
    getCompareLast:function(){return state.compareLast;},
    getCompareConfig:function(){return state.compareConfig;}};
}(window));

/* Modern UI bootstrap. This is an independent HTML shell over the existing
 * CurveAppClass and CurvatureMainCanvasRenderer: no legacy DOM/controls,
 * animation controller or duplicated optical solver is instantiated here.
 * The graph is created synchronously at its document.write parser location.
 */
(function(root){
  'use strict';
  var state={mode:'scene',atmosphere:'standard',occlusionRadius:6371000,
    timer:null,frame:null,graph:null,last:null};
  var model=new root.CurveAppClass();
  // A deterministic opening scene derived from the original Transmission Line
  // demo. Other demos and state transfer belong to later patches.
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
  function el(id){return document.getElementById(id);}
  function updateStatus(text,isError){
    var node=el('ModernStatus');
    if(node){node.textContent=text;node.classList.toggle('is-error',!!isError);}
  }
  function refreshLabels(){
    var curvature=root.CurvaturePhysicalCurvature127;
    var output=el('ModernCurvatureLabel');
    if(output)output.textContent=curvature.label(model);
    var mode=el('ModernViewInfo');
    if(mode)mode.textContent=(model.viewcenterHorizon===3?'Eye level':'Horizon')+
      ' · '+(model.showModel===2?'Flat surface':'Globe');
    var pill=el('ModernModePill');if(pill)pill.textContent=state.mode.toUpperCase();
    var wrap=el('ModernOcclusionWrap');
    if(wrap)wrap.hidden=!['inverse-spherical','exponential-occlusion'].includes(state.atmosphere);
  }
  function draw(g){
    if(state.mode!=='scene')return;
    try{
      var result=root.CurvatureMainCanvasRenderer.renderPhysical(g,model,{
        atmosphere:state.atmosphere,occlusionRadius:state.occlusionRadius,interactive:false
      });
      state.last=result;
      updateStatus((result.cacheReused?'Cached optics':'Physical optics')+
        ' · '+result.drawn+' outline pieces · '+result.fillTriangles+
        ' fill triangles · '+result.unresolved+' unresolved'+
        (result.timings?' · '+Math.round(result.timings.totalMs)+' ms':''),
        result.unresolved>0);
    }catch(error){
      updateStatus('Physical renderer: '+error.message,true);
      if(root.console&&root.console.error)root.console.error('Modern Scene render:',error);
    }
  }
  // GraphX3DX remains the Canvas/viewport adapter; its DrawFunc uses exactly
  // the same Physical scene renderer as the legacy UI, not DrawModel.
  var graph=root.NewGraphX3D({Id:'ModernSceneGraph',Width:'100%',Height:'66.67%',
    DrawFunc:draw,AutoReset:true,AutoClear:true,AutoScalePix:true});
  state.graph=graph;
  function redraw(){
    if(state.timer!==null){clearTimeout(state.timer);state.timer=null;}
    if(state.frame!==null){cancelAnimationFrame(state.frame);state.frame=null;}
    model.Update();refreshLabels();
    state.frame=requestAnimationFrame(function(){state.frame=null;graph.Redraw();});
  }
  function scheduleRedraw(){
    if(state.timer!==null)clearTimeout(state.timer);
    if(state.frame!==null){cancelAnimationFrame(state.frame);state.frame=null;}
    updateStatus('Updating physical optics after parameter change…');
    state.timer=setTimeout(function(){state.timer=null;redraw();},250);
  }
  function setMode(mode){
    if(mode!=='scene'&&mode!=='compare')throw RangeError('Invalid Modern UI mode');
    state.mode=mode;
    el('ModernSceneTab').classList.toggle('is-active',mode==='scene');
    el('ModernCompareTab').classList.toggle('is-active',mode==='compare');
    el('ModernSceneTab').setAttribute('aria-pressed',String(mode==='scene'));
    el('ModernCompareTab').setAttribute('aria-pressed',String(mode==='compare'));
    el('ModernCompareMessage').hidden=mode!=='compare';
    // The Compare tab is intentionally a labeled placeholder, not two
    // screenshots or an unrelated legacy Globe+FE composition.
    el('ModernGraphHost').closest('.modern-viewport-panel').hidden=mode==='compare';
    refreshLabels();
    if(mode==='scene')redraw();
  }
  function bindNumber(id,apply){
    var input=el(id);
    input.addEventListener('change',function(){
      var value=Number(input.value);
      if(!Number.isFinite(value)||input.value.trim()===''||
         (input.min!==''&&value<Number(input.min))||
         (input.max!==''&&value>Number(input.max))){
        updateStatus('Invalid value for '+input.previousElementSibling.textContent,true);return;
      }
      apply(value);redraw();
    });
  }
  function bind(){
    bindNumber('ModernHeight',function(v){model.Height=v;});
    bindNumber('ModernFocal',function(v){model.FocalLengthField=v;});
    bindNumber('ModernPan',function(v){model.Pan=v;});
    bindNumber('ModernNick',function(v){model.Nick=v;});
    bindNumber('ModernOcclusion',function(v){state.occlusionRadius=v;});
    el('ModernCameraAim').addEventListener('change',function(){model.viewcenterHorizon=Number(this.value);redraw();});
    el('ModernAtmosphere').addEventListener('change',function(){state.atmosphere=this.value;redraw();});
    el('ModernGrid').addEventListener('change',function(){model.showGrid=this.checked?1:0;redraw();});
    var curvature=root.CurvaturePhysicalCurvature127;
    var slider=el('ModernCurvature');
    slider.value=String(curvature.modelStep(model));
    slider.addEventListener('input',function(){curvature.applyStep(model,Number(slider.value));model.Update();refreshLabels();scheduleRedraw();});
    slider.addEventListener('change',redraw);
    el('ModernEarth').addEventListener('click',function(){curvature.resetEarth(model);slider.value=String(curvature.modelStep(model));redraw();});
    el('ModernRender').addEventListener('click',redraw);
    el('ModernSceneTab').addEventListener('click',function(){setMode('scene');});
    el('ModernCompareTab').addEventListener('click',function(){setMode('compare');});
    el('ModernBackToScene').addEventListener('click',function(){setMode('scene');});
    refreshLabels();
    // xOnLoad fires after the full panel and initial Graph canvas exist.
    redraw();
  }
  if(typeof root.xOnLoad==='function')root.xOnLoad(bind);
  else root.addEventListener('load',bind);
  root.CurvatureModernApp130={getModel:function(){return model;},
    getMode:function(){return state.mode;},getLastRender:function(){return state.last;}};
}(window));

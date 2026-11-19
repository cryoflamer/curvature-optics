/* Dedicated optical viewport renderer for sampled animation experiments.
 * All models, horizon diagnostics and optical cache sessions belong to this
 * instance, never to the live Scene / Compare workspace. The same production
 * physical painter is used; screen-only guides are composed afterwards.
 */
(function(root,factory){
  var experiment=root.CurvatureModernExperimentState;
  var horizon=root.CurvatureRayHorizon,screenGuides=root.CurvatureScreenSpaceGuides;
  var fastField=root.CurvatureOpticalFastRayField,previewLod=root.CurvatureOpticalPreviewLod;
  var effectiveRadius=root.CurvatureOpticalEffectiveRadiusPreview;
  if(typeof module==='object'&&module.exports){
    experiment=require('../ui/modern/ModernExperimentState');
    horizon=require('../optics/OpticalRayHorizon');
    screenGuides=require('../renderers/CurvatureScreenSpaceGuides');
    fastField=require('../optics/OpticalFastRayField');
    previewLod=require('../optics/OpticalPreviewLod');
    effectiveRadius=require('../optics/OpticalEffectiveRadiusPreview');
  }
  var api=factory(experiment,horizon,screenGuides,fastField,previewLod,effectiveRadius);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationPreview=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(experiment,horizon,screenGuides,fastField,previewLod,effectiveRadius){
  'use strict';
  var OBJECTS=['ObjType','NObjects','ObjDist','ObjDeltaDist','ObjSideType','ObjSidePos',
    'ObjSideVar','ObjSizeType','ObjSize','ObjSizeVar'];
  // Named atmosphere eligibility is shared with Scene/Compare and the
  // production optical adapter. Per-scene and per-ray limits remain separate.
  function fastEligible(spec){
    return !!spec&&!!fastField&&fastField.supportsAtmosphere(spec.atmosphere);
  }
  function opticalQuality(spec,choice,animationMode){
    if(!['auto','fast','accurate','effective-radius','canvas-direct'].includes(choice))throw RangeError('Invalid animation optics choice');
    if(choice==='effective-radius'||choice==='canvas-direct')return choice;
    if(choice==='accurate'||(choice==='auto'&&animationMode==='physical'))return 'accurate';
    return fastEligible(spec)?'fast':'accurate';
  }
  // Project the observer-fixed direction through the exact camera and backing
  // pixel transform used by the physical painter, not a second FOV formula.
  function angleY(graph,model,camera,degrees){
    var canvas=graph.Canvas;
    if(!camera||!canvas||!(canvas.width>0&&canvas.height>0))return null;
    var pan=model.Pan*Math.PI/180,angle=degrees*Math.PI/180;
    var direction=[Math.sin(pan)*Math.cos(angle),Math.cos(pan)*Math.cos(angle),Math.sin(angle)];
    var point=camera.pos.map(function(v,i){return v+1000*direction[i];});
    var pixel=screenGuides.projector(camera,canvas.width,canvas.height)(point).pixel;
    var y=pixel&&pixel[1];
    return Number.isFinite(y)&&y>=0&&y<=canvas.height?y:null;
  }
  function line(graph,model,camera,degrees,color,label,dashed){
    var y=angleY(graph,model,camera,degrees);
    if(y===null)return false;
    var canvas=graph.Canvas,ctx=canvas.getContext('2d');
    ctx.save();
    try{
      ctx.setTransform(1,0,0,1,0,0);
      ctx.strokeStyle=color.stroke;ctx.fillStyle=color.text;
      ctx.lineWidth=Math.max(1,canvas.width/(dashed?850:900));
      if(dashed&&ctx.setLineDash)ctx.setLineDash([7,5]);
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();
      if(dashed&&ctx.setLineDash)ctx.setLineDash([]);
      ctx.font=Math.max(11,Math.round(canvas.width/65))+'px Arial, sans-serif';
      ctx.textBaseline=y<18?'top':'bottom';
      ctx.fillText(label,8,y<18?y+3:y-4);
    }finally{ctx.restore();}
    return true;
  }
  function horizonOptions(model,spec){
    var atmosphere=spec.atmosphere;
    if(atmosphere==='profile-transition'&&spec.transitionProfile){
      if(spec.transitionProfile.weight===0)atmosphere=spec.transitionProfile.source;
      else if(spec.transitionProfile.weight===1)atmosphere='exponential-occlusion';
    }
    return {geometry:model.showModel===2?'flat':'globe',radius:model.rEarth,
      observerHeight:model.Height,atmosphere:atmosphere,
      profileOptions:atmosphere==='temperature-lapse'?spec.temperatureProfile:
        atmosphere==='profile-transition'?{temperatureProfile:spec.temperatureProfile,
          transitionProfile:spec.transitionProfile,occlusionRadius:spec.occlusionRadius}:
        atmosphere==='inverse-temperature'?{temperatureProfile:spec.temperatureProfile,
          inverseProfile:spec.inverseProfile,occlusionRadius:spec.occlusionRadius}:
        {occlusionRadius:spec.occlusionRadius}};
  }
  function create(dependencies){
    if(!dependencies||typeof dependencies.Model!=='function'||
      !dependencies.renderer||typeof dependencies.renderer.renderPhysical!=='function')
      throw TypeError('Independent model and Physical renderer are required');
    var renderer=dependencies.renderer,optics=dependencies.optics||null;
    var detector=dependencies.horizon||horizon;
    var fastQualifier=dependencies.fastField||fastField;
    var sessions={A:optics&&optics.create?optics.create():null,
      B:optics&&optics.create?optics.create():null};
    var models={A:new dependencies.Model(),B:new dependencies.Model()};
    var horizons={A:null,B:null};
    // A Fast field's qualification may depend on curvature and observer height,
    // not merely atmosphere + Globe/Flat. Never let a rejected near-flat Globe
    // sample disable Fast for the original (smaller-radius) Globe state.
    var fastUnsupported=new Set(),fallbackCount=0;
    function fastKey(config){
      var spec=config.spec,model=config.model;
      return JSON.stringify([model.showModel,model.rEarth,model.Height,spec.atmosphere,
        spec.occlusionRadius,spec.temperatureProfile,spec.transitionProfile,
        spec.inverseProfile]);
    }
    function resetFastFailures(){fastUnsupported.clear();fallbackCount=0;}
    function markFastUnsupported(key){
      // A continuously changing physical parameter must not grow an unlimited
      // collection of failed frame-specific probes.
      if(fastUnsupported.size>=64)fastUnsupported.delete(fastUnsupported.values().next().value);
      fastUnsupported.add(key);
    }
    function fastQualifiedForSample(config){
      // The production Fast field itself defines which Globe radii admit the
      // standard local-gradient approximation. Probe that cheap qualification
      // before constructing and painting the (much more costly) scene.
      if(config.quality!=='fast'||config.model.showModel!==1||
        config.spec.atmosphere!=='standard'||!fastQualifier)return true;
      if(typeof fastQualifier.inspectPreview==='function'){
        return fastQualifier.inspectPreview({geometry:'globe',radius:config.model.rEarth,
          observerHeight:config.model.Height,atmosphere:'standard',
          profileOptions:{occlusionRadius:config.spec.occlusionRadius}}).supported;
      }
      // Compatibility with injected legacy test doubles; production always
      // uses the shared inspector above.
      if(typeof fastQualifier.create!=='function')return true;
      return fastQualifier.create({geometry:'globe',radius:config.model.rEarth,
        observerHeight:config.model.Height,atmosphere:'standard',
        profileOptions:{occlusionRadius:config.spec.occlusionRadius}}).mode!=='unsupported';
    }
    function isFastUnsupported(error){
      return error instanceof RangeError &&
        /^Fast Preview is unavailable for .+ on (?:flat|globe); select Accurate \(RK4\)\.$/.test(error.message);
    }
    function build(data,side,options){
      options=options||{};
      var validated=experiment.validate(data),scene=validated.scene;
      var compare=validated.display.mode==='compare';
      if(!['A','B'].includes(side))throw RangeError('Invalid preview side');
      var model=models[side],spec=compare?validated.compare[side]:scene;
      Object.keys(scene.camera).forEach(function(key){model[key]=scene.camera[key];});
      OBJECTS.forEach(function(key){model[key]=scene.objects[key].slice();});
      model.DemoText=scene.title;model.Description=scene.description;
      model.showGrid=scene.showGrid?1:0;
      model.viewcenterHorizon=compare?3:scene.camera.viewcenterHorizon;
      model.showModel=compare?(spec.surface==='flat'?2:1):scene.surface.showModel;
      model.rEarth=compare?spec.radiusKm*1000:scene.surface.rEarth;
      model.Update();
      var geometry=model.showModel===2?'flat':'globe';
      var requested=options.quality||'auto',mode=options.animationMode||'camera';
      // Scene detail is a preview preference, not part of an experiment or
      // animation project. A missing choice preserves the old Fast stride=4.
      var detail=options.sceneDetail===undefined?'performance':options.sceneDetail;
      var detailStride=previewLod.sceneDetailStride(detail);
      var quality=opticalQuality(Object.assign({},spec,{surface:geometry}),requested,mode);
      return {model:model,spec:spec,display:validated.display,quality:quality,
        requestedQuality:requested,options:{atmosphere:spec.atmosphere,
        occlusionRadius:spec.occlusionRadius,visibility:spec.visibility,
        temperatureProfile:spec.temperatureProfile,transitionProfile:spec.transitionProfile,
        inverseProfile:spec.inverseProfile,interactive:false,geometryBackend:'canvas',
        opticalQuality:quality,showCaptions:options.showCaptions!==false,canvasDirectOptions:options.canvasDirectOptions,
        previewLod:{stride:quality==='fast'||quality==='effective-radius'?detailStride:1},
        cacheSession:sessions[side]||undefined}};
    }
    function guides(config,side,graph,camera){
      var display=config.display,canvas=graph.Canvas;
      // Synthetic graph harnesses do not have a Canvas 2D context.
      if(!canvas||typeof canvas.getContext!=='function'||!canvas.getContext('2d'))
        return {eyeLevel:'unavailable',horizon:'unavailable'};
      var eye='disabled',traced='disabled';
      if(display.eyeLevel){
        eye=line(graph,config.model,camera,0,{stroke:'#159447',text:'#117b3b'},'Eye level · 0°',false)?
          'drawn':'outside view';
      }
      if(display.horizon){
        if(config.quality!=='accurate')traced=config.quality==='fast'?
          'disabled in Fast Preview':config.quality==='effective-radius'?
          'disabled in Effective Radius Preview':'disabled in Canvas Direct Preview';
        else if(!detector||typeof detector.diagnose!=='function')traced='tracer unavailable';
        else{
          var params=horizonOptions(config.model,config.spec),key=JSON.stringify(params);
          if(!horizons[side]||horizons[side].key!==key){
            var measured;
            try{measured=detector.diagnose(params);}
            catch(error){measured={status:'unresolved',reason:error.message};}
            horizons[side]={key:key,result:measured};
          }
          var result=horizons[side].result;
          if(result.status!=='resolved')traced=result.status+' (no certified finite tangent)';
          else if(config.model.Roll!==0)traced='omitted for camera roll';
          else traced=line(graph,config.model,camera,result.angleDegrees,
            {stroke:'#d48313',text:'#ad640a'},
            'Traced horizon · '+result.angleDegrees.toFixed(4)+'°',true)?
            'drawn · '+result.angleDegrees.toFixed(4)+'°':'outside view';
        }
      }
      return {eyeLevel:eye,horizon:traced};
    }
    function render(data,side,graph,options){
      if(!graph||!graph.Canvas)throw TypeError('Independent preview Canvas required');
      var config=build(data,side,options);
      config.options.captureProjection=true;
      if(typeof graph.UpdateCanvasSize==='function')graph.UpdateCanvasSize();
      var key=fastKey(config),reason=null,result;
      if(config.quality==='canvas-direct'){
        if(!effectiveRadius||typeof effectiveRadius.canvasDirectSupport!=='function')
          throw Error('Canvas Direct eligibility checker is unavailable');
        var support=effectiveRadius.canvasDirectSupport(config.model,config.options);
        if(!support.supported){
          config.quality='accurate';config.options.opticalQuality='accurate';
          config.options.previewLod={stride:1};
          reason='Canvas Direct unavailable: '+support.reason;
        }
      }
      if(config.quality==='fast'&&fastUnsupported.has(key)){
        config.quality='accurate';config.options.opticalQuality='accurate';
        config.options.previewLod={stride:1};
        reason='Fast Preview was rejected for these exact physical parameters';
      }else if(config.quality==='fast'&&!fastQualifiedForSample(config)){
        config.quality='accurate';config.options.opticalQuality='accurate';
        config.options.previewLod={stride:1};
        reason='Fast standard-Globe approximation is unavailable at this curvature';
      }
      try{result=renderer.renderPhysical(graph,config.model,config.options);}
      catch(error){
        // Retry only a declared capability rejection, including a Flat mesh
        // vertex outside the local embedding. Unexpected errors remain visible.
        var directRejected=config.quality==='canvas-direct'&&effectiveRadius.isCanvasDirectUnsupported(error);
        var fastRejected=config.quality==='fast'&&isFastUnsupported(error);
        if(!directRejected&&!fastRejected)throw error;
        if(fastRejected){markFastUnsupported(key);fallbackCount++;}
        config.quality='accurate';config.options.opticalQuality='accurate';
        config.options.previewLod={stride:1};
        reason=directRejected?'Canvas Direct unavailable: '+error.message:error.message;
        result=renderer.renderPhysical(graph,config.model,config.options);
      }
      var overlays=guides(config,side,graph,result.projectionCamera);
      return {quality:config.quality,requestedQuality:config.requestedQuality,
        fallback:reason,fallbackCount:fallbackCount,
        overlays:overlays,result:result,cameraModel:config.model};
    }
    return Object.freeze({build:build,render:render,resetFastFailures:resetFastFailures});
  }
  return Object.freeze({create:create,fastEligible:fastEligible,opticalQuality:opticalQuality});
}));

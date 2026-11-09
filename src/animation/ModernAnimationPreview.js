/* Dedicated optical viewport renderer for sampled animation experiments.
 * All models and optical cache sessions belong to this instance, not ModernApp.
 * The existing production Physical renderer remains the single painter.
 */
(function(root,factory){
  var experiment=root.CurvatureModernExperimentState;
  if(typeof module==='object'&&module.exports)experiment=require('../ui/modern/ModernExperimentState');
  var api=factory(experiment);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationPreview=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(experiment){
  'use strict';
  var OBJECTS=['ObjType','NObjects','ObjDist','ObjDeltaDist','ObjSideType','ObjSidePos',
    'ObjSideVar','ObjSizeType','ObjSize','ObjSizeVar'];
  function fastEligible(spec){
    return spec.atmosphere==='vacuum'||spec.atmosphere==='standard'||
      (spec.surface==='flat'&&(spec.atmosphere==='exponential-occlusion'||
      (spec.atmosphere==='inverse-temperature'&&spec.inverseProfile.weight===1)));
  }
  function create(dependencies){
    if(!dependencies||typeof dependencies.Model!=='function'||
      !dependencies.renderer||typeof dependencies.renderer.renderPhysical!=='function')
      throw TypeError('Independent model and Physical renderer are required');
    var renderer=dependencies.renderer,optics=dependencies.optics||null;
    var sessions={A:optics&&optics.create?optics.create():null,
      B:optics&&optics.create?optics.create():null};
    var models={A:new dependencies.Model(),B:new dependencies.Model()};
    function build(data,side){
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
      return {model:model,options:{atmosphere:spec.atmosphere,
        occlusionRadius:spec.occlusionRadius,visibility:spec.visibility,
        temperatureProfile:spec.temperatureProfile,transitionProfile:spec.transitionProfile,
        inverseProfile:spec.inverseProfile,interactive:false,geometryBackend:'canvas',
        opticalQuality:fastEligible(Object.assign({},spec,{surface:geometry}))?'fast':'accurate',
        previewLod:{stride:4},cacheSession:sessions[side]||undefined}};
    }
    function render(data,side,graph){
      if(!graph||!graph.Canvas)throw TypeError('Independent preview Canvas required');
      var config=build(data,side);
      if(typeof graph.UpdateCanvasSize==='function')graph.UpdateCanvasSize();
      var result=renderer.renderPhysical(graph,config.model,config.options);
      return {quality:config.options.opticalQuality,result:result};
    }
    return Object.freeze({build:build,render:render});
  }
  return Object.freeze({create:create,fastEligible:fastEligible});
}));

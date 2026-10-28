/* Patch 133: independent physical A/B options. The Scene remains the only
 * author of the observer, camera, objects and presentation. No optics here.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernCompareState133=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var ATMOSPHERES=['vacuum','standard','inverse-spherical','exponential-occlusion'];
  var PRESETS=Object.freeze({
    'globe-flat-vacuum':{name:'Globe vacuum / Flat vacuum',
      A:{surface:'globe',radiusKm:6371,atmosphere:'vacuum',occlusionRadius:6371000},
      B:{surface:'flat',radiusKm:6371,atmosphere:'vacuum',occlusionRadius:6371000}},
    'standard-vacuum':{name:'Globe standard / Globe vacuum',
      A:{surface:'globe',radiusKm:6371,atmosphere:'standard',occlusionRadius:6371000},
      B:{surface:'globe',radiusKm:6371,atmosphere:'vacuum',occlusionRadius:6371000}},
    'standard-inverse':{name:'Globe standard / Globe inverse spherical',
      A:{surface:'globe',radiusKm:6371,atmosphere:'standard',occlusionRadius:6371000},
      B:{surface:'globe',radiusKm:6371,atmosphere:'inverse-spherical',occlusionRadius:6371000}},
    'flat-inverse':{name:'Globe standard / Flat inverse spherical',
      A:{surface:'globe',radiusKm:6371,atmosphere:'standard',occlusionRadius:6371000},
      B:{surface:'flat',radiusKm:6371,atmosphere:'inverse-spherical',occlusionRadius:6371000}}
  });
  function finite(raw,min,max){
    if(typeof raw==='string'&&raw.trim()==='')throw RangeError('A number is required');
    var n=Number(raw);
    if(!Number.isFinite(n)||n<min||n>max)throw RangeError('Expected number in ['+min+', '+max+']');
    return n;
  }
  function validate(spec){
    if(!spec||!['globe','flat'].includes(spec.surface))throw RangeError('Choose globe or exact flat');
    if(!ATMOSPHERES.includes(spec.atmosphere))throw RangeError('Unknown atmosphere');
    return {surface:spec.surface,radiusKm:finite(spec.radiusKm,100,1e13),
      atmosphere:spec.atmosphere,occlusionRadius:finite(spec.occlusionRadius,1,1e16)};
  }
  function fromScene(model,atmosphere,occlusionRadius){
    return validate({surface:model.showModel===2?'flat':'globe',radiusKm:model.rEarth/1000,
      atmosphere:atmosphere,occlusionRadius:occlusionRadius});
  }
  function initial(model,atmosphere,occlusionRadius){
    var base=fromScene(model,atmosphere,occlusionRadius);
    return {A:Object.assign({},base),B:Object.assign({},base,{surface:'flat'}),preset:'custom'};
  }
  function preset(id){
    var p=PRESETS[id];if(!p)throw RangeError('Unknown Compare preset');
    return {A:validate(p.A),B:validate(p.B),preset:id};
  }
  function update(current,side,field,raw){
    if(!current||!['A','B'].includes(side)||!['surface','radiusKm','atmosphere','occlusionRadius'].includes(field))
      throw RangeError('Unknown comparison field');
    var next=Object.assign({},current[side]);next[field]=raw;
    var result=Object.assign({},current);result[side]=validate(next);result.preset='custom';
    return result;
  }
  function pair(scene,config,base){
    if(!base||typeof base.clone!=='function')throw TypeError('Physical clone adapter required');
    var result={};
    ['A','B'].forEach(function(side){
      var spec=validate(config[side]);
      var m=base.clone(scene);
      m.viewcenterHorizon=3; // same observer-fixed camera regardless of surface
      m.showModel=spec.surface==='flat'?2:1;
      m.rEarth=spec.radiusKm*1000; // flat still needs a finite reference radius for integrator
      m.Update();
      result[side]=m;
    });
    if(!base.invariant(result))throw Error('A/B shared camera/object invariant failed');
    return result;
  }
  function label(spec){
    return (spec.surface==='flat'?'Exact flat (κ = 0)':'R = '+spec.radiusKm.toLocaleString('en-US')+' km')+
      ' · '+spec.atmosphere;
  }
  return Object.freeze({ATMOSPHERES:ATMOSPHERES,PRESETS:PRESETS,
    finite:finite,validate:validate,fromScene:fromScene,initial:initial,
    preset:preset,update:update,pair:pair,label:label});
}));

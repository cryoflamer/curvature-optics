/* Canonical active-physics features for history search and future storyboards.
 * No DOM, persistence, or rendering. Inactive controls cannot cause false A/B
 * differences (e.g. radius on Flat or gradient in Vacuum).
 */
(function(root,factory){
  var state=root.CurvatureModernExperimentState;
  if(!state&&typeof module==='object'&&module.exports)state=require('./ModernExperimentState');
  var api=factory(state);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernExperimentFingerprint=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(state){
  'use strict';
  function valid(input){if(!state)throw Error('Experiment validator unavailable');return state.validate(input);}
  function canonical(value){return JSON.stringify(value);}
  function surface(type,radius){return type==='flat'?{kind:'flat'}:{kind:'globe',radiusKm:radius};}
  function refraction(p){
    var result={kind:p.atmosphere};
    if(['temperature-lapse','profile-transition','inverse-temperature','exponential-occlusion'].includes(p.atmosphere))
      result.temperatureProfile=p.temperatureProfile;
    if(p.atmosphere==='profile-transition')result.transitionProfile=p.transitionProfile;
    if(p.atmosphere==='inverse-temperature')result.inverseProfile=p.inverseProfile;
    if(['profile-transition','inverse-temperature','inverse-spherical','exponential-occlusion'].includes(p.atmosphere))
      result.occlusionRadius=p.occlusionRadius;
    // Visibility is a shared display effect, not a refractive-index law.
    return result;
  }
  function view(p){return {geometry:surface(p.surface,p.radiusKm),refraction:refraction(p)};}
  function active(s){
    var p={surface:s.surface.showModel===2?'flat':'globe',radiusKm:s.surface.rEarth/1000,
      atmosphere:s.atmosphere,occlusionRadius:s.occlusionRadius,
      temperatureProfile:s.temperatureProfile,transitionProfile:s.transitionProfile,
      inverseProfile:s.inverseProfile};
    return view(p);
  }
  function featuresOf(input){
    var e=valid(input),mode=e.display.mode;
    var a=view(e.compare.A),b=view(e.compare.B);
    return {
      mode:mode,scene:active(e.scene),compare:{A:a,B:b},
      relations:{geometrySame:canonical(a.geometry)===canonical(b.geometry),
        atmosphereSame:e.compare.A.atmosphere===e.compare.B.atmosphere,
        refractionSame:canonical(a.refraction)===canonical(b.refraction),
        physicsSame:canonical(a)===canonical(b)}
    };
  }
  // Only active physical inputs change auto-history. Camera motion, workspace
  // tabs, the selected A/B editor and Camera Animation playback never do.
  function activeVisibility(value){
    return value.enabled?{enabled:true,rangeKm:value.rangeKm}:{enabled:false};
  }
  function physicalSignature(input){
    var e=valid(input),f=featuresOf(e),objects=e.scene.objects;
    var shared={objects:objects,grid:e.scene.showGrid};
    if(e.display.mode==='compare')return canonical({mode:'compare',shared:shared,
      A:f.compare.A,B:f.compare.B,visibility:activeVisibility(e.compare.A.visibility)});
    return canonical({mode:'scene',shared:shared,scene:f.scene,
      visibility:activeVisibility(e.scene.visibility)});
  }
  function exactSignature(input){
    var e=valid(input);
    // The selected Compare editor is workspace presentation, not a new state.
    e.compare.selected='A';
    return canonical(e);
  }
  return Object.freeze({features:featuresOf,physicalSignature:physicalSignature,
    exactSignature:exactSignature});
}));

/* Opt-in, independent low-cost optical preview; no shooting, RK4 or Canvas.
 * Coordinates match OpticalSharedRayField: horizontal distance (flat) or
 * surface-arc distance (globe), altitude above the surface, metres.
 * Only vacuum and flat exponential endpoints are exact physical models.
 * The standard profile uses a LOCAL constant conformal log-gradient and
 * MUST NOT be treated as an authoritative visibility/ground oracle.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./OpticalRayTracer'):root.CurvatureRayTracer);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureOpticalFastRayField=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(tracer){
  'use strict';
  var HALF_PI=Math.PI/2;
  function create(options){
    options=options||{};
    var geometry=options.geometry,atmosphere=options.atmosphere,
      radius=options.radius===undefined?6371000:options.radius,
      eye=options.observerHeight;
    if(geometry!=='flat'&&geometry!=='globe')throw RangeError('Fast field requires flat or globe geometry');
    if(!Number.isFinite(radius)||radius<=0||!Number.isFinite(eye)||eye<0)
      throw RangeError('Invalid fast-field radius or observer height');
    if(options.profile!==undefined)throw RangeError('Custom optical profiles are not preview-qualified');
    if(options.curvature!==undefined && (!Number.isFinite(options.curvature)||
        options.curvature<0||(geometry==='flat'&&options.curvature!==0)||
        (geometry==='globe'&&Math.abs(options.curvature*radius-1)>1e-9)))
      throw RangeError('Fast-field curvature contradicts geometry/radius');
    if(typeof atmosphere!=='string')throw RangeError('Fast field requires an explicit atmosphere');
    var supported=atmosphere==='vacuum'||atmosphere==='standard'||
      (geometry==='flat'&&atmosphere==='exponential-occlusion')||
      (geometry==='flat'&&atmosphere==='inverse-temperature'&&
        options.profileOptions&&options.profileOptions.inverseProfile&&
        options.profileOptions.inverseProfile.weight===1);
    // Even if the preview does not model a profile, return an explicit
    // unsupported result: callers must never interpret it as clear air.
    var mode=supported?(atmosphere==='standard'?'local-conformal-gradient':'analytic'):'unsupported';
    var profile=supported?tracer.atmosphere(atmosphere,options.profileOptions):null;
    var gradient=null,eyeU=eye;
    if(supported){
      var n=profile.n(eye),dn=profile.dn(eye);
      if(!(n>0)||!Number.isFinite(n)||!Number.isFinite(dn))
        throw RangeError('Invalid near-observer refractive index');
      if(geometry==='globe'){
        eyeU=radius*Math.log1p(eye/radius);
        // Conformal surface coordinates X=R*longitude, u=R*ln(1+h/R).
        // Effective index m(u) = (1+h/R)*n(h); g=d(ln m)/du.
        gradient=1/radius+(1+eye/radius)*dn/n;
      }else gradient=dn/n;
      if(!Number.isFinite(gradient))throw RangeError('Invalid fast-field gradient');
      // Positive effective curvature is needed for a single, conventional
      // standard-Globe surrogate. Strong ducting is NOT a safe approximation.
      if(atmosphere==='standard'&&geometry==='globe'&&!(gradient>0))mode='unsupported';
    }
    var exact=mode==='analytic',contactMargin=options.contactMarginMeters===undefined?
      (exact?1e-6:3):options.contactMarginMeters;
    if(!Number.isFinite(contactMargin)||contactMargin<=0||contactMargin>100)
      throw RangeError('Invalid preview contact margin');
    var counters={samples:0,visible:0,blocked:0,indeterminate:0,unsupported:0};
    function report(status,angle,clearance,reason){
      counters.samples++;
      counters[status]++;
      return {status:status,angle:angle,residual:null,
        method:mode==='analytic'?'fast-analytic':'fast-local-conformal-gradient',
        accuracy:exact?'exact-model':'approximation',
        minClearanceMeters:clearance,reason:reason||null};
    }
    function sample(distance,height){
      if(!Number.isFinite(distance)||!(distance>0)||!Number.isFinite(height)||height<0)
        throw RangeError('Invalid fast-field target coordinates');
      if(geometry==='globe'&&distance>=radius*Math.PI/2)
        return report('unsupported',null,null,'Outside forward Globe surface-arc scope');
      if(mode==='unsupported')
        return report('unsupported',null,null,'Atmosphere/geometry not preview-qualified');
      var targetU=geometry==='globe'?radius*Math.log1p(height/radius):height,
        du=targetU-eyeU,q=gradient*distance,angle;
      if(!Number.isFinite(targetU)||!Number.isFinite(q)||Math.abs(q)>1.4)
        return report('unsupported',null,null,'Outside forward single-ray approximation');
      if(gradient===0){angle=Math.atan2(du,distance);}
      else{
        // cos(q)-exp(-g*du) with cancellation removed for small distances.
        var numerator=-2*Math.sin(q/2)*Math.sin(q/2)-Math.expm1(-gradient*du),
          denominator=Math.sin(q);
        if(!Number.isFinite(numerator)||denominator===0)
          return report('unsupported',null,null,'Non-finite analytic angle');
        angle=Math.atan(numerator/denominator);
      }
      var ending=angle+q;
      if(!Number.isFinite(angle)||Math.abs(angle)>=HALF_PI-1e-5||
        Math.abs(ending)>=HALF_PI-1e-5)
        return report('unsupported',null,null,'Ray has no valid forward-x branch');
      // A ground-level endpoint is allowed. Only an INTERIOR minimum
      // can establish an early obstruction or an uncertain grazing contact.
      var minimum=Math.min(eyeU,targetU),interior=false;
      if(gradient>0&&angle<0&&ending>0){
        interior=true;
        // min u = u_eye + ln(cos(angle))/gradient. The log1p form
        // resolves sub-millimetre minima at very shallow angles.
        var s=Math.sin(angle/2);
        minimum=eyeU+Math.log1p(-2*s*s)/gradient;
      }
      var clearance=geometry==='globe'?radius*Math.expm1(minimum/radius):minimum;
      if(!Number.isFinite(clearance))
        return report('unsupported',null,null,'Unbounded preview clearance');
      if(interior&&Math.abs(clearance)<=contactMargin)
        return report('indeterminate',angle,clearance,
          exact?'Near-ground contact in analytic model':'Near predicted ground contact; RK4 required');
      if(interior&&clearance< -contactMargin)
        return report('blocked',angle,clearance,
          exact?'Analytic first-ground intersection':'Approximate first-ground intersection only');
      return report('visible',angle,clearance,null);
    }
    function stats(){return Object.assign({geometry:geometry,atmosphere:atmosphere,
      mode:mode,gradient:mode==='unsupported'?null:gradient,
      contactMarginMeters:contactMargin,shootRK4Calls:0,
      solves:counters.samples,hits:0,exactSolveMs:0},counters);}
    return {sample:sample,stats:stats,mode:mode};
  }
  return {create:create};
}));

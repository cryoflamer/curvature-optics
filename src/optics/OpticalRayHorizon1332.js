/* 133.2: finite first-ground-contact horizon from the shared forward RK4 tracer.
 * A horizon is reported only when a ground-hit launch direction is bracketed
 * by a ray that approaches the ground, passes an INTERIOR altitude minimum,
 * and subsequently escapes upward within the integration range. Merely
 * reaching the finite range limit is never evidence of a horizon.
 *
 * This is a first-contact, single-branch diagnostic, not a proof of global
 * visibility or uniqueness for arbitrary refractive profiles/multipath.
 * No analytical horizon angle/distance enters the search.
 */
(function(root,factory){
  var api=factory(root.CurvatureRayTracer||(typeof require==='function'?require('./OpticalRayTracer'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureRayHorizon1332=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(tracer){
  'use strict';
  if(!tracer||typeof tracer.trace!=='function')throw Error('Physical ray tracer is required');
  var DEG=Math.PI/180;
  var SCAN_DEGREES=[-60,-40,-25,-15,-10,-5,-3,-2,-1,-.5,-.25,-.125,-.0625,
    -.03125,-.015625,0,.015625,.03125,.0625,.125,.25,.5,1,2,5];
  function diagnose(options){
    options=options||{};
    var radius=options.radius,eye=options.observerHeight;
    if(!(Number.isFinite(radius)&&radius>0&&Number.isFinite(eye)&&eye>0))
      throw RangeError('Finite horizon search requires positive radius and eye height');
    if(options.geometry!=='globe'&&options.geometry!=='flat')
      throw RangeError('Unknown surface geometry');
    var length=options.maxDistance===undefined?100000:options.maxDistance;
    var step=options.step===undefined?200:options.step;
    if(!Number.isFinite(length)||length<=0||length>500000||
       !Number.isFinite(step)||step<10||step>1000)
      throw RangeError('Invalid finite ray search bounds');
    var geometry=tracer.resolveGeometry({geometry:options.geometry,radius:radius}).surface;
    var base={geometry:options.geometry,radius:radius,observerHeight:eye,
      atmosphere:options.atmosphere||'vacuum',profileOptions:options.profileOptions,
      length:length,step:step,collect:true};
    var evaluations=0;
    function evaluate(degrees){
      evaluations++;
      var ray=tracer.trace(Object.assign({},base,{angle:degrees*DEG}));
      if(ray.hitGround)return {kind:'hit',angle:degrees,ray:ray};
      var pts=ray.points,min=Infinity,index=-1;
      for(var i=0;i<pts.length;i++){
        var h=geometry.height2(pts[i][0],pts[i][1]);
        if(!Number.isFinite(h))return {kind:'unknown',angle:degrees};
        if(h<min){min=h;index=i;}
      }
      // A finite tangent boundary must have an interior turning minimum.
      // Neither a ray still descending at the range cutoff nor an ascending
      // ray whose nearest point is the observer qualifies as an escape side.
      var interior=index>=2&&index<pts.length-2;
      var recovered=pts.length>=5&&geometry.height2(pts[pts.length-1][0],
        pts[pts.length-1][1])>min+Math.max(.01,eye*1e-4);
      var approached=min<eye-Math.max(.01,eye*1e-4);
      return {kind:interior&&recovered&&approached?'clear':'unknown',
        angle:degrees,minHeight:min,minDistance:pts[index]&&pts[index][0],ray:ray};
    }
    var previousHit=null,brackets=[],seenClear=false;
    for(var s=0;s<SCAN_DEGREES.length;s++){
      var result=evaluate(SCAN_DEGREES[s]);
      if(result.kind==='hit'){
        if(seenClear)return {status:'ambiguous',reason:'Multiple ground-contact branches in scan',
          evaluations:evaluations,maxDistance:length};
        previousHit=result;
      }else if(result.kind==='clear'){
        seenClear=true;
        if(previousHit&&brackets.length===0)brackets.push([previousHit,result]);
      }
    }
    if(brackets.length!==1)return {status:'unresolved',
      reason:'No certified finite hit/escape bracket (range limit is not a horizon)',
      evaluations:evaluations,maxDistance:length};
    var low=brackets[0][0],high=brackets[0][1];
    if(high.angle-low.angle>2)return {status:'unresolved',
      reason:'Ground-contact bracket is too broad',evaluations:evaluations,maxDistance:length};
    for(var j=0;j<24&&high.angle-low.angle>0.00005;j++){
      var mid=evaluate((low.angle+high.angle)/2);
      if(mid.kind==='hit')low=mid;
      else if(mid.kind==='clear')high=mid;
      else return {status:'unresolved',reason:'Grazing direction not numerically classified',
        evaluations:evaluations,maxDistance:length};
    }
    if(high.angle-low.angle>0.00005)return {status:'unresolved',
      reason:'Angular bracket did not converge',evaluations:evaluations,maxDistance:length};
    // Position estimated independently of the drawing/grid extent, from the
    // integrated closest approach on the escaping side of the bracket.
    return {status:'resolved',angleDegrees:(low.angle+high.angle)/2,
      dipDegrees:-(low.angle+high.angle)/2,
      tangentDistance:high.minDistance,minimumClearance:high.minHeight,
      bracketDegrees:[low.angle,high.angle],evaluations:evaluations,
      maxDistance:length,step:step,
      interpretation:'Finite first-contact tangent, within sampled range and angular resolution'};
  }
  return {diagnose:diagnose};
}));

/* Exact flat limit and numerically stable spherical-surface geometry.
 * Units: metres and inverse metres. Coordinates are local ENU with the
 * reference surface point at (0,0,0) and its outward normal along +z.
 * 2D: [horizontal,z]; 3D: [east,north,z].
 *
 * Independent mathematical kernel: intentionally NOT wired to legacy
 * geometry, physical ray tracing, camera, or the current ground grid in #124.
 */
(function(root, factory) {
  var api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  root.CurvatureSurfaceGeometry=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var DEFAULT_RADIUS=6371000;

  function finite(value,name){
    if(typeof value!=='number'||!Number.isFinite(value))
      throw new RangeError(name+' must be a finite number');
    return value;
  }
  function finiteResult(value,name){
    if(!Number.isFinite(value))throw new RangeError(name+' is outside the finite coordinate range');
    return value;
  }
  // sin(x)/x is even and analytic at zero. The polynomial avoids computing
  // sin(x)/x in the small-angle regime and in particular handles x=0.
  function sinc(x){
    finite(x,'angle');
    var a=Math.abs(x);
    if(a<0.001){
      var t=x*x;
      return 1+t*(-1/6+t*(1/120+t*(-1/5040+t/362880)));
    }
    return Math.sin(x)/x;
  }
  function curvatureFromRadius(radius){
    if(radius===Infinity)return 0;
    finite(radius,'radius');
    if(!(radius>0))throw new RangeError('radius must be positive');
    var k=1/radius;
    if(!Number.isFinite(k)||k===0)
      throw new RangeError('radius cannot be represented by a finite positive curvature');
    return k;
  }
  function radiusFromCurvature(k){
    finite(k,'curvature');
    if(k<0)throw new RangeError('curvature must be non-negative');
    if(k===0)return Infinity;
    var radius=1/k;
    if(!Number.isFinite(radius))
      throw new RangeError('radius exceeds the finite range; use curvature directly');
    return radius;
  }
  function createFromCurvature(curvature){
    finite(curvature,'curvature');
    if(curvature<0)throw new RangeError('curvature must be non-negative');
    var k=curvature,flat=k===0;

    // d is signed surface arc length (2D) or a non-negative radial ground
    // distance (3D), NOT the horizontal chord length. h is radial altitude.
    // Stable sag = (1+k*h)*k*d^2/2*sinc(k*d/2)^2, avoiding R*(cos(d/R)-1).
    function scaledPoint(distance,h){
      finite(distance,'surface distance');finite(h,'surface altitude');
      if(flat)return [distance,h];
      var angle=finiteResult(k*distance,'surface central angle');
      var stretch=finiteResult(1+k*h,'surface radial factor');
      if(!(stretch>0))throw new RangeError('altitude must be above the sphere centre');
      var x=finiteResult(distance*stretch*sinc(angle),'surface horizontal coordinate');
      var sag=finiteResult(0.5*k*distance*distance*stretch*Math.pow(sinc(angle/2),2),'surface sagitta');
      return [x,finiteResult(h-sag,'surface vertical coordinate')];
    }
    function surfacePoint2(distance,h){return scaledPoint(distance,h===undefined?0:h);}
    function surfacePoint3(east,north,h){
      finite(east,'east surface distance');finite(north,'north surface distance');
      h=h===undefined?0:h;
      finite(h,'surface altitude');
      if(flat)return [east,north,h];
      var d=finiteResult(Math.hypot(east,north),'surface distance');
      var angle=finiteResult(k*d,'surface central angle');
      var stretch=finiteResult(1+k*h,'surface radial factor');
      if(!(stretch>0))throw new RangeError('altitude must be above the sphere centre');
      var scale=finiteResult(stretch*sinc(angle),'surface lateral scale');
      var sag=finiteResult(0.5*k*d*d*stretch*Math.pow(sinc(angle/2),2),'surface sagitta');
      return [finiteResult(east*scale,'surface east coordinate'),
        finiteResult(north*scale,'surface north coordinate'),
        finiteResult(h-sag,'surface vertical coordinate')];
    }
    // The centre of the sphere is (0,0,-1/k). Scale BEFORE the hypot
    // so no subtraction of a large radius is needed for small altitudes.
    function scaledNormal(x,y,z){
      finite(x,'east');finite(y,'north');finite(z,'vertical');
      if(flat)return [0,0,1];
      var a=finiteResult(1+k*z,'scaled radial vertical');
      var bx=finiteResult(k*x,'scaled radial east');
      var by=finiteResult(k*y,'scaled radial north');
      var length=finiteResult(Math.hypot(bx,by,a),'scaled radial length');
      if(length===0)throw new RangeError('surface normal is undefined at the sphere centre');
      return [bx/length,by/length,a/length];
    }
    function altitude(x,y,z){
      finite(x,'east');finite(y,'north');finite(z,'vertical');
      if(flat)return z;
      var a=finiteResult(1+k*z,'scaled radial vertical');
      var bx=finiteResult(k*x,'scaled radial east');
      var by=finiteResult(k*y,'scaled radial north');
      var length=finiteResult(Math.hypot(bx,by,a),'scaled radial length');
      // For points on the observer-facing hemisphere, rationalize the
      // difference hypot(x,y,z+R)-R, avoiding cancellation of ~R terms.
      // On the opposite hemisphere use (L^2-1)/(k*(L+1)); the first
      // rationalization would have a zero denominator on the rear axis.
      if(length===0)return finiteResult(-1/k,'surface altitude at the sphere centre');
      var radial2=finiteResult(x*x+y*y,'lateral squared distance');
      var h;
      if(a>=0){
        h=z+k*radial2/(length+a);
      }else{
        h=(2*z+k*(radial2+z*z))/(length+1);
      }
      return finiteResult(h,'surface altitude');
    }
    // A joint altitude/normal sample avoids two radial hypot() operations per
    // RK4 derivative stage. The plane is exact, not a very large sphere.
    // Output is [physical altitude, horizontal normal, vertical normal].
    function metric2(x,z){
      finite(x,'horizontal coordinate');finite(z,'vertical coordinate');
      if(flat)return [z,0,1];
      var a=finiteResult(1+k*z,'scaled radial vertical');
      var b=finiteResult(k*x,'scaled radial horizontal');
      var length=finiteResult(Math.hypot(b,a),'scaled radial length');
      if(length===0)throw new RangeError('surface normal is undefined at the sphere centre');
      var h=a>=0?z+k*x*x/(length+a):
        (2*z+k*(x*x+z*z))/(length+1);
      return [finiteResult(h,'surface altitude'),b/length,a/length];
    }
    function height2(x,z){return altitude(x,0,z);}
    function height3(x,y,z){return altitude(x,y,z);}
    function normal2(x,z){var n=scaledNormal(x,0,z);return [n[0],n[2]];}
    function normal3(x,y,z){return scaledNormal(x,y,z);}
    function surfaceNormal2(distance){
      finite(distance,'surface distance');
      if(flat)return [0,1];
      var angle=finiteResult(k*distance,'surface central angle');
      return [Math.sin(angle),Math.cos(angle)];
    }
    function surfaceNormal3(east,north){
      finite(east,'east surface distance');finite(north,'north surface distance');
      if(flat)return [0,0,1];
      var d=finiteResult(Math.hypot(east,north),'surface distance');
      if(d===0)return [0,0,1];
      var angle=finiteResult(k*d,'surface central angle');
      var sin=Math.sin(angle)/d;
      return [east*sin,north*sin,Math.cos(angle)];
    }
    function geometricHorizon(observerHeight){
      finite(observerHeight,'observer height');
      if(observerHeight<0)throw new RangeError('observer height must be non-negative');
      if(flat)return {exists:false,dipAngle:0,arcDistance:Infinity,
        straightDistance:Infinity};
      if(observerHeight===0)return {exists:true,dipAngle:0,arcDistance:0,
        straightDistance:0};
      var t=finiteResult(k*observerHeight,'scaled observer height');
      var dip=Math.atan(Math.sqrt(t)*Math.sqrt(2+t));
      // sqrt(H)*sqrt(R)*sqrt(2+kH) stays finite for extremely large R
      // even when the intermediate 2*R would overflow.
      var chord=Math.sqrt(observerHeight)*Math.sqrt(1/k)*Math.sqrt(2+t);
      return {exists:true,dipAngle:dip,arcDistance:dip/k,
        straightDistance:chord};
    }
    return Object.freeze({curvature:k,flat:flat,
      surfacePoint2:surfacePoint2,surfacePoint3:surfacePoint3,
      height2:height2,height3:height3,normal2:normal2,normal3:normal3,metric2:metric2,
      surfaceNormal2:surfaceNormal2,surfaceNormal3:surfaceNormal3,
      geometricHorizon:geometricHorizon});
  }
  function createFromRadius(radius){return createFromCurvature(curvatureFromRadius(radius));}
  return Object.freeze({DEFAULT_RADIUS:DEFAULT_RADIUS,sinc:sinc,
    curvatureFromRadius:curvatureFromRadius,radiusFromCurvature:radiusFromCurvature,
    createFromCurvature:createFromCurvature,createFromRadius:createFromRadius});
}));

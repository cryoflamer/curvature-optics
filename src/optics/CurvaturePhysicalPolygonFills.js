/* Project authored fill polygons through the SAME physical point oracle as tower
 * outlines. Plane-space ear clipping precedes adaptive ground-visible triangle
 * projection. No Canvas, horizon mask or new renderer is introduced.
 *
 * Contract: emitted triangles are certified at vertices, edge midpoints and
 * centroid. This is a sampled bound, not exhaustive multipath visibility or
 * z-buffered mutual occlusion. Uncertain triangles are never filled.
 */
(function(root,factory){
  var api=factory(root.CurvatureOpticalTowerSilhouette||
    (typeof require==='function'?require('./OpticalTowerSilhouette'):null),
    root.CurvatureEarClip||
    (typeof require==='function'?require('../geometry/CurvatureEarClip'):null),
    root.CurvatureSurfaceGeometry||(typeof require==='function'?require('../geometry/CurvatureSurfaceGeometry'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvaturePhysicalPolygonFills=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(silhouette,earClip,surfaceApi){
  'use strict';
  if(!silhouette||!earClip)throw Error('Physical coordinate and triangulator required');
  function requireSurface(geometry,radius){
    if(!surfaceApi)throw Error('Surface geometry required for physical polygons');
    return surfaceApi.createFromCurvature(geometry==='globe'?1/radius:0);
  }
  function difference(a,b){return a.map(function(v,i){return v-b[i];});}
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function norm(a){return Math.hypot(a[0],a[1],a[2]);}
  function interpolate(a,b){return a.map(function(v,i){return (v+b[i])/2;});}
  function centroid(a,b,c){return a.map(function(v,i){return (v+b[i]+c[i])/3;});}
  function delta(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
  function arrival(a){var z=Math.cos(a.angle),r=1000;
    return [r*Math.sin(a.azimuth)*z,r*Math.cos(a.azimuth)*z,r*Math.sin(a.angle)];}
  function planeTriangles(raw){
    var points=raw.slice();
    if(points.length>3&&norm(difference(points[0],points[points.length-1]))<1e-8)points.pop();
    if(points.length<3)return {triangles:[],reason:'degenerate-ring'};
    // Select the most stable available normal, then drop its dominant axis.
    var best=[0,0,0],base=points[0];
    for(var i=1;i<points.length-1;i++)for(var j=i+1;j<points.length;j++){
      var n=cross(difference(points[i],base),difference(points[j],base));
      if(norm(n)>norm(best))best=n;
    }
    if(!(norm(best)>1e-9))return {triangles:[],reason:'degenerate-ring'};
    var dropped=norm(best)>0?[0,1,2].reduce(function(a,b){return Math.abs(best[b])>Math.abs(best[a])?b:a;},0):2;
    var keep=[0,1,2].filter(function(k){return k!==dropped;});
    var projected=points.map(function(p,index){return [p[keep[0]],p[keep[1]],index];});
    var mesh=earClip.triangulate(projected);
    return {triangles:mesh.triangles.map(function(t){return t.map(function(v){return points[v[2]];});}),
      reason:mesh.reason};
  }
  function project(options){
    options=options||{};
    var polygons=options.polygons,field=options.field,geometry=options.geometry,
      radius=options.radius,eye=options.observerHeight,
      angularTolerance=options.angularTolerance===undefined?2e-5:options.angularTolerance,
      maxDepth=options.maximumDepth===undefined?7:options.maximumDepth,
      maxSamples=options.maxSamples===undefined?20000:options.maxSamples,
      boundaryTolerance=options.boundaryTolerance===undefined?0.15:options.boundaryTolerance;
    if(!Array.isArray(polygons)||!field||typeof field.sample!=='function'||
        !['flat','globe'].includes(geometry)||!(radius>0)||!(eye>=0)||
        !(angularTolerance>0)||!Number.isInteger(maxDepth)||maxDepth<0||maxDepth>12||
        !Number.isInteger(maxSamples)||maxSamples<1||!(boundaryTolerance>0))
      throw TypeError('Invalid physical fill options');
    var primitives=[],stats={sourcePolygons:0,triangulated:0,fillTriangles:0,
      hiddenTriangles:0,unresolvedTriangles:0,unresolvedReasons:{},samples:0,
      subdivisions:0,interpolated:0,exact:0};
    var metric=options.physicalSurface?requireSurface(geometry,radius):null;
    var samples=new Map();
    function sample(world){
      var key=world.join(',');
      if(samples.has(key))return samples.get(key);
      var q=silhouette.coordinate(world,geometry,radius,eye,metric),result={world:world,status:'solver_failed',reason:'sample-budget'};
      if(stats.samples<maxSamples){
        stats.samples++;
        if(q.height< -1e-6){result.status='blocked';result.reason='under-ground';}
        else if(q.distance>0&&(geometry==='flat'||q.distance<radius*Math.PI/2)){
          var projection=null;
          try{projection=field.sample(q.distance,Math.max(0,q.height));}catch(_error){}
          if(projection&&['visible','blocked','indeterminate','solver_failed'].includes(projection.status)){
            result.status=projection.status;result.reason=projection.reason||null;
            if(projection.status==='visible'&&Number.isFinite(projection.angle)){
              result.azimuth=q.azimuth;result.angle=projection.angle;
              if(projection.method==='interpolated')stats.interpolated++;else stats.exact++;
            }else if(projection.status==='visible'){
              result.status='solver_failed';result.reason='nonfinite-angle';
            }
          }
        }else{result.reason='unsupported-range';}
      }
      samples.set(key,result);
      return result;
    }
    function error(a,b,mid){
      return Math.max(Math.abs(mid.angle-(a.angle+b.angle)/2),
        Math.abs(delta(mid.azimuth,a.azimuth+delta(b.azimuth,a.azimuth)/2)));
    }
    function unresolved(reason){stats.unresolvedTriangles++;
      stats.unresolvedReasons[reason]=(stats.unresolvedReasons[reason]||0)+1;}
    polygons.forEach(function(poly,polygonIndex){
      if(!poly||poly.type!=='polygon'||!(poly.mode&2))return;
      stats.sourcePolygons++;
      var mesh=planeTriangles(poly.points);
      if(mesh.reason){unresolved('triangulation-'+mesh.reason);return;}
      stats.triangulated+=mesh.triangles.length;
      function emitTriangle(a,b,c){
        primitives.push({type:'polygon',mode:2,points:[a,b,c].map(arrival),
          style:Object.assign({},poly.style),metadata:{kind:'physical-object-fill',
            opticalSourceIndex:poly.commandIndex,objectLayer:options.layer||null,
            sourcePolygon:polygonIndex}});
        stats.fillTriangles++;
      }
      // First-visible boundary on a straight world-space edge. Bracketing
      // never treats a failed or grazing shot as proof of visibility.
      function crossing(visible,other){
        var lo=visible.world,hi=other.world,v=visible;
        for(var step=0;step<18&&norm(difference(lo,hi))>boundaryTolerance;step++){
          var middle=interpolate(lo,hi),m=sample(middle);
          if(m.status==='visible'){lo=middle;v=m;}else hi=middle;
          if(stats.samples>=maxSamples)break;
        }
        return v;
      }
      function visit(a,b,c,depth){
        var edges=[a,b,c],v=edges.map(sample);
        var ab=interpolate(a,b),bc=interpolate(b,c),ca=interpolate(c,a),center=centroid(a,b,c);
        var probes=[ab,bc,ca,center].map(sample);
        var all=v.concat(probes),visible=all.every(function(q){return q.status==='visible';}),
          blocked=all.every(function(q){return q.status==='blocked';});
        var refined=depth<maxDepth&&stats.samples<maxSamples&&
          Math.max(norm(difference(a,b)),norm(difference(b,c)),norm(difference(c,a)))>boundaryTolerance;
        var smooth=visible&&Math.max(error(v[0],v[1],probes[0]),error(v[1],v[2],probes[1]),
          error(v[2],v[0],probes[2]),
          Math.abs(probes[3].angle-(v[0].angle+v[1].angle+v[2].angle)/3),
          Math.abs(delta(probes[3].azimuth,v[0].azimuth+
            (delta(v[1].azimuth,v[0].azimuth)+delta(v[2].azimuth,v[0].azimuth))/3)))<=angularTolerance;
        if(smooth){emitTriangle(v[0],v[1],v[2]);return;}
        if(blocked){stats.hiddenTriangles++;return;}
        // Common near-horizon case: the visibility transition crosses the
        // triangle edges once. Clip its visible portion, rather than refining
        // all four quadrants repeatedly and exhausting the shooting budget.
        var seen=v.filter(function(q){return q.status==='visible';}).length;
        var uncertain=all.some(function(q){return q.status==='solver_failed';});
        if(seen>0&&seen<3&&!uncertain){
          var ring=[];
          for(var i=0;i<3;i++){
            var cur=v[i],next=v[(i+1)%3],cvis=cur.status==='visible',nvis=next.status==='visible';
            if(cvis)ring.push(cur);
            if(cvis!==nvis)ring.push(cvis?crossing(cur,next):crossing(next,cur));
          }
          // Each clipped facet is checked at interior and edge midpoints;
          // do not fill across a hidden island or uncertain interior.
          var valid=ring.length>=3;
          for(var j=1;valid&&j<ring.length-1;j++){
            var r0=ring[0],r1=ring[j],r2=ring[j+1];
            var checked=[interpolate(r0.world,r1.world),interpolate(r1.world,r2.world),
              interpolate(r2.world,r0.world),centroid(r0.world,r1.world,r2.world)].map(sample);
            if(!checked.every(function(q){return q.status==='visible';}) ||
                Math.max(error(r0,r1,checked[0]),error(r1,r2,checked[1]),
                  error(r2,r0,checked[2]))>angularTolerance)valid=false;
          }
          if(valid){
            for(var k=1;k<ring.length-1;k++)emitTriangle(ring[0],ring[k],ring[k+1]);
            return;
          }
        }
        if(!refined){
          unresolved(uncertain?'optical-solver':
            all.some(function(q){return q.status==='indeterminate';})?'grazing-uncertainty':
            visible?'projection-curvature':'visibility-boundary');return;
        }
        stats.subdivisions++;
        visit(a,ab,ca,depth+1);
        visit(ab,b,bc,depth+1);
        visit(ca,bc,c,depth+1);
        visit(ab,bc,ca,depth+1);
      }
      mesh.triangles.forEach(function(t){visit(t[0],t[1],t[2],0);});
    });
    return {primitives:primitives,stats:stats,
      scope:'Sample-qualified opaque fills only; no mutual mesh occlusion or multipath'};
  }
  return {project:project,planeTriangles:planeTriangles};
}));

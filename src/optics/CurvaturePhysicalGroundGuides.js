/* Ground-surface guides transformed by the same optical point solver as objects.
 * No geometric tangent circle is reused as a physical horizon. Ray directions
 * are radial in a vertically stratified atmosphere, so a one-dimensional
 * radial sample table serves every azimuth of the ground grid.
 */
(function(root,factory){
  var api=factory(root.CurvatureTargetProjection||(typeof require==='function'?require('./OpticalTargetProjection'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvaturePhysicalGroundGuides=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(project){
  'use strict';
  if(!project)throw Error('Optical target projection required');
  function make(options){
    var m=options.model,kind=options.atmosphere,globe=options.geometry==='globe';
    var R=m.rEarth,eye=m.Height;
    var profile=kind==='inverse-spherical'||kind==='exponential-occlusion'?{occlusionRadius:options.occlusionRadius}:undefined;
    var step=options.step||1000;
    // Rendering extent, NOT a physical horizon. Flat surfaces have no finite
    // horizon in vacuum/standard; unbounded legacy grid geometry must never
    // trigger unbounded target shooting.
    var guideExtent=Math.min(100000,options.maxDistance===undefined?100000:options.maxDistance);
    if(!Number.isFinite(guideExtent)||guideExtent<=0)throw RangeError('Invalid ground guide rendering extent');
    var calls=0,clippedEdges=0,skippedEdges=0;
    function shoot(d){
      if(!(d>0))return {status:'visible',angle:-Math.PI/2};
      if(kind==='vacuum'){
        if(!globe)return {status:'visible',angle:Math.atan2(-eye,d)};
        var angle=d/R,x=R*Math.sin(angle),z=R*Math.cos(angle)-R-eye;
        var horizon=R*Math.acos(R/(R+eye));
        return {status:d>=horizon?'blocked':'visible',angle:Math.atan2(z,x)};
      }
      calls++;
      return project.solve({geometry:options.geometry,radius:R,observerHeight:eye,
        target:globe?[R*Math.sin(d/R),R*Math.cos(d/R)-R]:[d,0],
        atmosphere:kind,profileOptions:profile,step:step});
    }
    // A finite ground horizon exists on the globe and for engineered Flat
    // profiles. For Flat vacuum/standard we do not infer a finite horizon.
    var finite=globe||kind==='inverse-spherical'||kind==='exponential-occlusion';
    var upper=globe?Math.min(R*.1,Math.max(100,8*Math.sqrt(2*R*eye))):
      Math.min(options.occlusionRadius*.1,Math.max(100,8*Math.sqrt(2*options.occlusionRadius*eye)));
    var lastVisible=0,firstHidden=null;
    if(finite){
      var lower=Math.max(.01,Math.min(100,Math.sqrt(Math.max(1,2*R*eye))/8));
      for(var i=0;i<28;i++){
        var probe=shoot(lower);
        if(probe.status==='visible')lastVisible=lower;
        else {firstHidden=lower;break;}
        lower*=1.55;
        if(lower>upper)break;
      }
      if(firstHidden!==null){
        for(var j=0;j<24;j++){
          var mid=(lastVisible+firstHidden)/2,s=shoot(mid);
          if(s.status==='visible')lastVisible=mid;
          else firstHidden=mid;
        }
      }
    }
    var horizon=firstHidden!==null?(lastVisible+firstHidden)/2:null;
    // A null horizon here is NOT a proof that an arbitrary Flat profile has no horizon.
    var maxRadius=horizon===null?guideExtent:horizon;
    var radial=[],N=32;
    for(var t=0;t<=N;t++){
      var d=Math.max(.01,maxRadius*(t+.001)/(N+.001));
      if(horizon!==null)d=Math.min(d,Math.max(.01,lastVisible*.999));
      var value=shoot(d);
      if(value.status==='visible'&&Number.isFinite(value.angle))radial.push({d:d,angle:value.angle});
    }
    function angleAt(d){
      if(horizon!==null && d>=horizon)return null;
      if(d<=0)return -Math.PI/2;
      if(radial.length<2)return null;
      if(d>=radial[radial.length-1].d){
        // Never extrapolate through a physical horizon. For a Flat profile
        // with no resolved horizon, the table endpoint is only the guide
        // drawing limit; it is not a physical visibility judgement.
        if(horizon===null && d>guideExtent+1e-7)return null;
        var exact=shoot(d);
        return exact.status==='visible'&&Number.isFinite(exact.angle)?exact.angle:null;
      }
      var lo=0,hi=radial.length-1;
      while(hi-lo>1){var mid=(lo+hi)>>1;if(radial[mid].d<d)lo=mid;else hi=mid;}
      var a=radial[lo],b=radial[hi];
      return a.angle+(b.angle-a.angle)*(d-a.d)/(b.d-a.d);
    }
    function arrival(az,el){var r=1000,c=Math.cos(el);return [r*Math.sin(az)*c,r*Math.cos(az)*c,r*Math.sin(el)];}
    function guidePoint(world){
      var x=world[0],y=world[1],d=Math.hypot(x,y);
      if(globe){var radialZ=world[2]+R+eye;d=R*Math.atan2(d,radialZ);}
      var a=angleAt(d);
      return a===null?null:arrival(Math.atan2(x,y),a);
    }
    // Clip source edges in the ground plane BEFORE shooting. This works for
    // rays as well as circular polygon chords whose endpoints lie outside the
    // drawing disk. Clipping is only presentation culling, not ground occlusion.
    function clipFlat(a,b){
      var dx=b[0]-a[0],dy=b[1]-a[1],aa=dx*dx+dy*dy;
      var cut=[0,1],limit=guideExtent*guideExtent;
      if(aa>0){
        var bb=2*(a[0]*dx+a[1]*dy),cc=a[0]*a[0]+a[1]*a[1]-limit;
        var disc=bb*bb-4*aa*cc;
        if(disc>=0){
          var q=Math.sqrt(disc),r1=(-bb-q)/(2*aa),r2=(-bb+q)/(2*aa);
          if(r1>0&&r1<1)cut.push(r1);
          if(r2>0&&r2<1)cut.push(r2);
        }
      }
      cut.sort(function(x,y){return x-y;});
      var ranges=[];
      for(var j=1;j<cut.length;j++){
        var t0=cut[j-1],t1=cut[j];
        if(t1-t0<1e-12)continue;
        var tm=(t0+t1)/2,x=a[0]+tm*dx,y=a[1]+tm*dy;
        if(x*x+y*y<=limit*(1+1e-12))ranges.push([t0,t1]);
      }
      return ranges;
    }
    function transform(guidePrimitives){
      var result=[];
      function emit(a,b,style,meta){if(a&&b)result.push({type:'line',mode:1,points:[a,b],
        style:Object.assign({},style),metadata:Object.assign({},meta,{physicalGround:true})});}
      guidePrimitives.forEach(function(p){
        // The alternative flat comparison grid on a Globe is NOT the ground.
        if(p.metadata&&p.metadata.projection==='plane')return;
        if(p.metadata&&/horizon|tangent/.test(p.metadata.kind||''))return;
        var points=p.points,n=points.length;
        if(n<2)return;
        for(var k=0;k<(p.type==='polygon'?n:n-1);k++){
          var from=points[k],to=points[(k+1)%n];
          // Clip infinite-scale Flat guides in WORLD space. Do not use the
          // clipping extent to infer an optical horizon or block objects.
          var ranges=globe?[[0,1]]:clipFlat(from,to);
          if(!ranges.length){skippedEdges++;continue;}
          if(!globe&&(ranges.length!==1||ranges[0][0]!==0||ranges[0][1]!==1))clippedEdges++;
          ranges.forEach(function(interval){
            var length=Math.hypot((to[0]-from[0])*(interval[1]-interval[0]),
              (to[1]-from[1])*(interval[1]-interval[0]));
            // Retain the original Globe subdivision. On Flat, use few
            // segments for small, nearly straight screen-space guides; bound
            // refinement to avoid tens of thousands of identical ray queries.
            var pieces=globe?6:Math.max(1,Math.min(6,Math.ceil(length/3000)));
            var prev=null;
            for(var j=0;j<=pieces;j++){
              var t=interval[0]+(interval[1]-interval[0])*j/pieces;
              var world=from.map(function(v,i){return v+(to[i]-v)*t;});
              var current=guidePoint(world);
              if(j)emit(prev,current,p.style,p.metadata);
              prev=current;
            }
          });
        }
      });
      if(horizon!==null&&radial.length){
        var dipAngle=angleAt(Math.max(.01,lastVisible*.999));
        if(dipAngle!==null){
          var style={stroke:m.GlobeGridCol||m.FEGridCol||'blue',lineWidth:1.5,alpha:1};
          for(var i=0;i<128;i++){
            var a=2*Math.PI*i/128,b=2*Math.PI*(i+1)/128;
            emit(arrival(a,dipAngle),arrival(b,dipAngle),style,{kind:'physical-horizon'});
          }
        }
      }
      return result;
    }
    return {transform:transform,horizonDistance:horizon,solves:function(){return calls;},
      radialSamples:radial.length,renderExtent:guideExtent,
      cullingStats:function(){return {clippedEdges:clippedEdges,skippedEdges:skippedEdges};}};
  }
  return {create:make};
}));

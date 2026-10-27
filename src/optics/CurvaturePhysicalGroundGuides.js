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
    var calls=0;
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
    var maxRadius=horizon===null?Math.min(options.maxDistance||50000,100000):horizon;
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
          // Sample the underlying world edge, not an image-space straight line.
          var prev=null;
          var pieces=6;
          for(var j=0;j<=pieces;j++){
            var t=j/pieces,world=from.map(function(v,i){return v+(to[i]-v)*t;});
            var current=guidePoint(world);
            if(j)emit(prev,current,p.style,p.metadata);
            prev=current;
          }
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
      radialSamples:radial.length};
  }
  return {create:make};
}));

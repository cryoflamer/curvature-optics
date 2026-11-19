/* Interactive Canvas Direct painter: signed effective curvature + straight-line
 * projection of authored world polygons directly to Canvas 2D. No optical ray
 * sampling, SceneFrame, ear clipping or Legacy/GraphX3DX drawing routines.
 * Horizon masking is intentionally the approximate Legacy painter convention.
 */
(function(root,factory){
  var api=factory(
    root.CurvatureGeometryEngine||(typeof require==='function'?require('../geometry/CurvatureGeometryEngine'):null),
    root.CurvatureOpticalEffectiveRadiusPreview||(typeof require==='function'?require('../optics/OpticalEffectiveRadiusPreview'):null),
    root.CurvatureCameraTranslation||(typeof require==='function'?require('../geometry/CurvatureCameraTranslation'):null),
    root.CurvatureCanvasProjection||(typeof require==='function'?require('./CurvatureCanvasProjection'):null),
    root.CurvaturePhysicalWorldGeometry||(typeof require==='function'?require('../geometry/CurvaturePhysicalWorldGeometry'):null),
    root.CurvatureAtmosphericVisibility||(typeof require==='function'?require('./CurvatureAtmosphericVisibility'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureCanvasDirectPreview=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(geometry,effective,translation,viewport,physicalWorld,visibility){
  'use strict';
  if(!geometry||!effective||!translation||!viewport||!physicalWorld||!visibility)
    throw Error('Canvas Direct requires Modern geometry, effective radius, translation, projection, metric landmarks and atmospheric visibility');
  function clock(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function unit(v){var n=Math.hypot(v[0],v[1],v[2]);if(!(n>0))throw RangeError('Degenerate camera');return v.map(function(x){return x/n;});}
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function subtract(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
  // GraphX3DX clipped its 2D paths to the viewport before asking Canvas to
  // paint them. The direct painter must do the same: a horizon disk straddling
  // the camera's near plane can otherwise project vertices to ~10^12 pixels.
  // Browsers need not rasterize such enormous paths consistently.
  function clipScreenPolygon(points,width,height){
    var xmin=-2,ymin=-2,xmax=width+2,ymax=height+2;
    var outside=false;
    for(var i=0;i<points.length;i++){
      var p=points[i];
      if(p[0]<xmin||p[0]>xmax||p[1]<ymin||p[1]>ymax){outside=true;break;}
    }
    if(!outside)return points;
    var poly=points;
    function boundary(axis,limit,keepGreater){
      if(!poly.length)return;
      var next=[],prev=poly[poly.length-1];
      var prevIn=keepGreater?prev[axis]>=limit:prev[axis]<=limit;
      for(var j=0;j<poly.length;j++){
        var cur=poly[j],curIn=keepGreater?cur[axis]>=limit:cur[axis]<=limit;
        if(curIn!==prevIn){
          var t=(limit-prev[axis])/(cur[axis]-prev[axis]);
          next.push([prev[0]+t*(cur[0]-prev[0]),prev[1]+t*(cur[1]-prev[1])]);
        }
        if(curIn)next.push(cur);
        prev=cur;prevIn=curIn;
      }
      poly=next;
    }
    boundary(0,xmin,true);boundary(0,xmax,false);
    boundary(1,ymin,true);boundary(1,ymax,false);
    return poly.length>=3?poly:null;
  }
  function clipScreenSegment(a,b,width,height){
    var xmin=-2,ymin=-2,xmax=width+2,ymax=height+2;
    if(a[0]>=xmin&&a[0]<=xmax&&b[0]>=xmin&&b[0]<=xmax&&
       a[1]>=ymin&&a[1]<=ymax&&b[1]>=ymin&&b[1]<=ymax)return [a,b];
    var dx=b[0]-a[0],dy=b[1]-a[1],t0=0,t1=1;
    var p=[-dx,dx,-dy,dy],q=[a[0]-xmin,xmax-a[0],a[1]-ymin,ymax-a[1]];
    for(var i=0;i<4;i++){
      if(p[i]===0){if(q[i]<0)return null;continue;}
      var t=q[i]/p[i];
      if(p[i]<0)t0=Math.max(t0,t);
      else t1=Math.min(t1,t);
      if(t0>t1)return null;
    }
    return [[a[0]+t0*dx,a[1]+t0*dy],[a[0]+t1*dx,a[1]+t1*dy]];
  }
  function cameraProjection(camera,width,height){
    var back=unit(subtract(camera.pos,camera.center)),right=unit(cross(unit(camera.up),back)),up=unit(cross(back,right));
    var distance=Math.hypot.apply(null,subtract(camera.center,camera.pos));
    var focal=camera.sceneSize!==0?camera.screenSize/camera.sceneSize*(distance-camera.objectZExtend):1;
    var window=viewport.resolve(camera,width,height);
    if(!(camera.screenSize>0)||!Number.isFinite(focal)||!(camera.zoom>0))throw RangeError('Invalid Canvas Direct camera');
    return {back:back,right:right,up:up,window:window,scale:focal*camera.zoom,
      near:camera.near>0?camera.near:1e-6,pos:camera.pos};
  }
  // Signed effective surface embedding in the observer's local tangent frame.
  // Flat with downward-bent rays is represented by an upward-bowed virtual
  // surface (negative curvature). This is preview-only: physical Flat source
  // geometry, camera data and accurate RK4 are not modified.
  function flatRefractionPoint(east,north,height,eye,curvature){
    var distance=Math.hypot(east,north),angle=curvature*distance;
    if(!Number.isFinite(angle)||Math.abs(angle)>=Math.PI/2)
      throw effective.canvasDirectUnsupported('Flat effective curvature exceeds local preview range');
    var stretch=1+curvature*height;
    if(!(stretch>0)||!Number.isFinite(stretch))
      throw effective.canvasDirectUnsupported('Flat effective surface height is unsupported');
    // Stable for tiny curvature and exactly identical to the vacuum plane
    // when curvature is zero (no subtraction of enormous virtual radii).
    var sinc=angle===0?1:Math.sin(angle)/angle;
    var half=angle===0?1:Math.sin(angle/2)/(angle/2);
    var sag=0.5*curvature*distance*distance*stretch*half*half;
    return [east*stretch*sinc,north*stretch*sinc,height-eye-sag];
  }
  // Source geometry is authored at Height=0 and can be reused as the camera
  // moves. Height is subtracted at projection time, not stored in the mesh.
  function geometricModel(model,params){
    var R=params.effectiveRadius,H=model.Height;
    if(params.geometry!=='globe')return Object.assign({},model,{Height:0});
    var ratio=R/(R+H),dip=Math.acos(ratio);
    return Object.assign({},model,{geometryRadius:R,Height:H,
      hDip:R*(1-ratio),hDisk:R*ratio,zDisk:R+H-R*ratio,
      rDisk:R*Math.sqrt(Math.max(0,1-ratio*ratio)),aDip:dip,
      aDelta:model.aDelta*(model.geometryRadius/R)});
  }
  // A fixed model's local bridge meshes depend on curvature and object layout,
  // not on Height, Pan/Nick/Roll or CameraEast/North. Never persist the cache
  // across different authoring parameters or effective radii.
  function geometryKey(model,params){return JSON.stringify([params.geometry,params.effectiveRadius,
    model.geometryRadius,model.ObjType,model.NObjects,model.ObjDist,model.ObjDeltaDist,model.ObjSideType,
    model.ObjSidePos,model.ObjSideVar,model.ObjSizeType,model.ObjSize,model.ObjSizeVar]);}
  function objectIdentityColor(bank,index){
    return identityColor(index*2+bank+1);
  }
  function identityColor(n){
    if(!Number.isInteger(n)||n<1||n>65535)return '#000000';
    var r=n&255,g=(n>>>8)&255,b=1+((r*31+g*17)%254);
    return 'rgb('+r+','+g+','+b+')';
  }
  // Crop in source projection pixels, retaining the original optical camera,
  // source viewport clipping, painter order, labels and stroke policy.
  function cropTransform(region,sourceWidth,sourceHeight,width,height){
    if(!region||![sourceWidth,sourceHeight,width,height].every(v=>Number.isInteger(v)&&v>0)||
       ![region.x,region.y,region.width,region.height].every(Number.isFinite)||
       !(region.width>0&&region.height>0)||region.x<0||region.y<0||
       region.x+region.width>sourceWidth+1e-8||region.y+region.height>sourceHeight+1e-8)
      throw RangeError('Invalid magnifier region');
    var scale=Math.min(width/region.width,height/region.height);
    var w=region.width*scale,h=region.height*scale,x=(width-w)/2,y=(height-h)/2;
    return {scale:scale,x:x,y:y,width:w,height:h,offsetX:x-region.x*scale,offsetY:y-region.y*scale};
  }
  function create(){
    var cachedKey=null,cached=null;
    function objects(model,params){
      var key=geometryKey(model,params);
      if(cached&&key===cachedKey)return {banks:cached,reused:true};
      var source=Object.assign({},model,{Height:0,
        geometryRadius:params.geometry==='globe'?params.effectiveRadius:model.geometryRadius});
      var first=model.ObjDist[0]>model.ObjDist[1]?0:1;
      var order=[first,1-first].filter(function(i){return model.NObjects[i]>0;});
      var banks=order.map(function(index){
        // The accurate physical renderer authors Flat objects with the
        // continuous east/north basis (physicalSurface + zero curvature).
        // Legacy Flat placement instead mirrors the lateral object axis.
        // Reuse the physical basis here; the signed refraction embedding below
        // changes elevation, never east/west handedness during camera drag.
        var physicalFlat=params.geometry==='flat';
        var scene=geometry.createObjectSequenceScene(source,index,!physicalFlat,
          physicalFlat?{opticsNeutral:true,physicalSurface:true,curvature:0}:
            {opticsNeutral:true});
        var groups=[];
        scene.primitives.forEach(function(p){
          var i=p.metadata&&p.metadata.placedObjectIndex;
          if(!Number.isInteger(i))throw Error('Canvas Direct needs source object identity');
          if(!groups[i])groups[i]={index:i,primitives:[],anchor:null,center:[0,0,0],vertices:0};
          var group=groups[i];
          group.primitives.push(p);
          if(!group.anchor)group.anchor=p.points[0];
          // An object's atmospheric range is independent of Pan/Nick/Roll.
          // Cache one representative centre for all its authored vertices;
          // recenter it cheaply against the current observer on each frame.
          p.points.forEach(function(point){for(var axis=0;axis<3;axis++)group.center[axis]+=point[axis];group.vertices++;});
        });
        return {index:index,groups:groups.filter(Boolean).map(function(group){
          group.center=group.center.map(function(v){return v/group.vertices;});
          delete group.vertices;return group;
        })};
      });
      cachedKey=key;cached=banks;
      return {banks:banks,reused:false};
    }
    function paint(canvas,camera,model,options){
      options=options||{};
      // Reuse the exact 5%-contrast transmission law and color semantics from
      // the accurate physical presentation. Haze changes only painted object
      // colors, never the optical geometry, metric grid, masks or labels.
      var haze=visibility.validate(options.visibility);
      var ownerPass=!!(options.canvasDirectOptions&&options.canvasDirectOptions.landmarkOwnerPass);
      var identityPass=ownerPass||!!(options.canvasDirectOptions&&options.canvasDirectOptions.objectIdentityPass);
      var began=clock(),params=effective.canvasDirectParameters(model,options);
      var geom=geometricModel(model,params),source=objects(model,params),geometryAt=clock();
      var R=params.effectiveRadius,H=model.Height,globe=params.geometry==='globe';
      // Only positive effective curvature has a virtual ground tangent.
      // For Flat the authored coordinates are still planar arc distances;
      // compute the tangent disk in the SAME local embedding as its objects.
      // Stable formulas avoid cancellation in R - R*R/(R+H).
      var flatMask=!globe&&params.effectiveCurvature>0&&Number.isFinite(R);
      var ratio=flatMask?H/R:0;
      var disk=globe?geom:flatMask?{
        rDisk:Math.sqrt(H)*Math.sqrt(R)*Math.sqrt(2+ratio)/(1+ratio),
        zDisk:H*(2+ratio)/(1+ratio)}:null;
      var horizon=globe?(H>0?R*Math.acos(R/(R+H)):0):flatMask?
        R*Math.atan2(disk.rDisk,R/(1+ratio)):Infinity;
      var east=model.CameraEast||0,north=model.CameraNorth||0;
      var observer=translation.frame(east,north,H,globe?1/R:0);
      var c=cameraProjection(camera,canvas.width,canvas.height);
      // Compose the rigid observer transform with the camera matrix once.
      var axes=[observer.right,observer.forward,observer.up];
      function rebaseAxis(axis){return [0,1,2].map(function(i){return axis[0]*axes[0][i]+
        axis[1]*axes[1][i]+axis[2]*axes[2][i];});}
      var bx=rebaseAxis(c.right),by=rebaseAxis(c.up),bz=rebaseAxis(c.back).map(function(v){return -v;});
      var origin=[observer.origin[0],observer.origin[1],observer.origin[2]+H];
      var off=[dot(c.right,c.pos),dot(c.up,c.pos),-dot(c.back,c.pos)];
      var ctx=canvas.getContext('2d');
      if(!ctx||typeof ctx.beginPath!=='function'||typeof ctx.fill!=='function')throw TypeError('Canvas Direct needs Canvas 2D');
      function cameraPoint(point,local){
        if(!local&&!globe&&params.effectiveCurvature!==0){
          var vFlat=flatRefractionPoint(point[0]-east,point[1]-north,point[2],H,
            params.effectiveCurvature);
          return {x:dot(vFlat,c.right)-off[0],y:dot(vFlat,c.up)-off[1],
            z:-dot(vFlat,c.back)-off[2]};
        }
        var v=local?point:[point[0]-origin[0],point[1]-origin[1],point[2]-origin[2]];
        // Ground guides/masks are observer-local: they are not transformed by
        // the moving object's rigid frame.
        if(local)return {x:dot(v,c.right)-off[0],y:dot(v,c.up)-off[1],z:-dot(v,c.back)-off[2]};
        return {x:dot(v,bx)-off[0],y:dot(v,by)-off[1],z:dot(v,bz)-off[2]};
      }
      function screen(p){var s=c.scale/p.z,w=c.window;
        return [w.offsetX+w.scaleX*p.x*s,w.offsetY+w.scaleY*p.y*s];}
      function nearPolygon(points){
        var result=[],near=c.near;
        for(var i=0;i<points.length;i++){
          var a=points[i],b=points[(i+1)%points.length],aIn=a.z>near,bIn=b.z>near;
          if(aIn)result.push(a);
          if(aIn!==bIn){var t=(near-a.z)/(b.z-a.z);
            result.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:near});}
        }
        return result;
      }
      // Display-only cap in backing-store pixels; authored scene data stays intact.
      var thinOutlines=!!(options.canvasDirectOptions&&options.canvasDirectOptions.thinOutlines);
      var projected=0,drawn=0,strokes=0,fillCalls=0,masked=0;
      var projectionMs=0,canvasMs=0;
      function drawPrimitive(p,role,far,tint){
        var start=clock(),style=p.style||{},mode=p.type==='line'?1:(p.mode==null?1:p.mode);
        var sourcePoints=p.points,local=role!=='objects';
        var pts=sourcePoints.map(function(point){return cameraPoint(point,local);});
        var polygon=p.type==='polygon';
        // Many authored rectangles explicitly repeat their first vertex.
        // Canvas closePath() supplies that edge already; retaining the extra
        // endpoint creates a zero-length stroke at every repeated corner.
        if(polygon&&pts.length>1){
          var first=pts[0],last=pts[pts.length-1];
          if(first.x===last.x&&first.y===last.y&&first.z===last.z)pts.pop();
        }
        var fillPoints=polygon&&(mode&2)?nearPolygon(pts):null;
        var fillPixels=fillPoints&&fillPoints.length>=3?
          clipScreenPolygon(fillPoints.map(screen),canvas.width,canvas.height):null;
        // Object outlines retain their original edges; near-plane closing
        // edges created for a filled polygon are never invented as strokes.
        var lines=[];
        if(mode&1){var count=polygon?pts.length:pts.length-1;
          for(var j=0;j<count;j++){
            var a=pts[j],b=pts[(j+1)%pts.length];
            if(a.z<=c.near&&b.z<=c.near)continue;
            if(a.z<=c.near){var t=(c.near-a.z)/(b.z-a.z);a={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:c.near};}
            if(b.z<=c.near){var t2=(c.near-b.z)/(a.z-b.z);b={x:b.x+(a.x-b.x)*t2,y:b.y+(a.y-b.y)*t2,z:c.near};}
            var ap=screen(a),bp=screen(b);
            // A clipped segment can collapse to the same canvas pixel;
            // avoid a degenerate path (and isolated cap-shaped speckles).
            if(Math.abs(ap[0]-bp[0])+Math.abs(ap[1]-bp[1])>1e-5){
              var clipped=clipScreenSegment(ap,bp,canvas.width,canvas.height);
              if(clipped&&Math.abs(clipped[0][0]-clipped[1][0])+
                 Math.abs(clipped[0][1]-clipped[1][1])>1e-5)lines.push(clipped);
            }
          }
        }
        projectionMs+=clock()-start;
        if(!fillPixels&&!lines.length)return;
        start=clock();
        var alpha=identityPass?1:style.alpha==null?1:style.alpha;
        if(fillPixels){
          ctx.globalAlpha=alpha;
          var fillColor=style.fill||'white';
          ctx.fillStyle=identityPass&&role!=='objects'?'#000000':tint?tint(fillColor):fillColor;
          ctx.beginPath();
          ctx.moveTo(fillPixels[0][0],fillPixels[0][1]);
          for(var k=1;k<fillPixels.length;k++){
            ctx.lineTo(fillPixels[k][0],fillPixels[k][1]);
          }
          ctx.closePath();
          ctx.fill();fillCalls++;
        }
        if(lines.length){
          ctx.globalAlpha=alpha;
          var strokeColor=style.stroke||(far?'#666':'black');
          ctx.strokeStyle=identityPass&&role!=='objects'?'#000000':tint?tint(strokeColor):strokeColor;
          var width=viewport.lineWidth(style.lineWidth,camera);
          ctx.lineWidth=thinOutlines?Math.min(width,1):width;
          ctx.beginPath();
          for(var e=0;e<lines.length;e++){
            ctx.moveTo(lines[e][0][0],lines[e][0][1]);
            ctx.lineTo(lines[e][1][0],lines[e][1][1]);
          }
          ctx.stroke();strokes++;
        }
        ctx.globalAlpha=1;canvasMs+=clock()-start;
        projected+=pts.length;drawn+=lines.length;
      }
      // These are the SAME metric landmarks/extent as the physical ground grid,
      // but projected through the local effective-curvature approximation. Do
      // not ask the RK4 ground sampler or report a certified optical horizon.
      // Surface guides are observer-centred, as in the physical renderer; the
      // authored object meshes above retain their separate world placement.
      function drawMetricGrid(){
        if(!(model.showGrid&1))return {rings:0,spokes:0,labels:0,segments:0,extentMeters:0};
        var extent=physicalWorld.guideExtent(model),radii=physicalWorld.RINGS.filter(function(r){return r<=extent;});
        if(!radii.length||radii[radii.length-1]<extent)radii.push(extent);
        // A Flat local-gradient preview may have a finite embedding domain;
        // reaching that limit is NOT a certified optical or ground horizon.
        var domain=!globe&&params.effectiveCurvature!==0?
          (Math.PI/2-1e-3)/Math.abs(params.effectiveCurvature):Infinity;
        var distances=radii.filter(function(d){return d<=Math.min(horizon,domain)+1e-8;});
        if(disk&&horizon>0&&horizon<Math.min(extent,domain)&&distances[distances.length-1]!==horizon)
          distances.push(horizon);
        function point(d,az){
          var e=d*Math.sin(az),n=d*Math.cos(az);
          if(!globe)return flatRefractionPoint(e,n,0,H,params.effectiveCurvature);
          var t=d/R,stretch=t===0?1:Math.sin(t)/t;
          return [e*stretch,n*stretch,-2*R*Math.sin(t/2)**2-H];
        }
        function segment(d0,a0,d1,a1){
          var p=cameraPoint(point(d0,a0),true),q=cameraPoint(point(d1,a1),true);
          if(p.z<=c.near&&q.z<=c.near)return false;
          if(p.z<=c.near){var t=(c.near-p.z)/(q.z-p.z);
            p={x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t,z:c.near};}
          if(q.z<=c.near){var u=(c.near-q.z)/(p.z-q.z);
            q={x:q.x+(p.x-q.x)*u,y:q.y+(p.y-q.y)*u,z:c.near};}
          var clipped=clipScreenSegment(screen(p),screen(q),canvas.width,canvas.height);
          if(!clipped||Math.hypot(clipped[0][0]-clipped[1][0],clipped[0][1]-clipped[1][1])<1e-5)
            return false;
          ctx.moveTo(clipped[0][0],clipped[0][1]);ctx.lineTo(clipped[1][0],clipped[1][1]);
          return true;
        }
        var result={rings:0,spokes:0,labels:0,segments:0,extentMeters:extent,
          rangeLimited:domain<extent};
        if(!distances.length)return result;
        var started=clock(),pixel=camera.pixelTransform&&camera.pixelTransform.contextScale||1;
        ctx.save();
        try{
          // Physical Scene/Compare uses GlobeGridCol for BOTH surfaces.
          // FEGridCol is a separate Legacy Flat palette (black by default).
          ctx.strokeStyle=model.GlobeGridCol||model.FEGridCol||'blue';
          ctx.globalAlpha=.7;ctx.lineWidth=thinOutlines?1:viewport.lineWidth(1,camera);
          ctx.beginPath();
          // Ring polygon chords and 24 radial spokes match the physical grid
          // source topology; a final clipped spoke endpoint is not a horizon
          // diagnosis. Keep the entire path batched to avoid thousands of
          // Canvas stroke calls at interactive frame rates.
          distances.forEach(function(d){
            if(d===horizon&&disk)return; // clipping boundary, not an authored ring
            result.rings++;
            for(var i=0;i<64;i++)if(segment(d,i*2*Math.PI/64,d,(i+1)*2*Math.PI/64))result.segments++;
          });
          for(var a=0;a<24;a++){
            var az=a*2*Math.PI/24,from=0;
            distances.forEach(function(d){
              if(d>from&&segment(from,az,d,az))result.segments++;
              from=d;
            });
            if(from>0)result.spokes++;
          }
          if(result.segments){ctx.stroke();strokes++;drawn+=result.segments;}
          // Camera-aligned supplementary spokes/labels are the same sort of
          // annotation as the physical metricGridOverlay, not surface geometry.
          var heading=Math.atan2(camera.center[0]-camera.pos[0],camera.center[1]-camera.pos[1]);
          var fov=Number.isFinite(model.camViewAngle)&&model.camViewAngle>0?
            model.camViewAngle:Math.PI/6;
          var separation=Math.min(.07,Math.max(.004,fov/10));
          ctx.strokeStyle='#345ab4';ctx.globalAlpha=.42;
          if(typeof ctx.setLineDash==='function')ctx.setLineDash([3*pixel,5*pixel]);
          ctx.beginPath();var overlaySegments=0;
          for(var offset=-3;offset<=3;offset++){
            var az=heading+offset*separation,prev=0;
            distances.forEach(function(d){
              if(d>prev&&segment(prev,az,d,az))overlaySegments++;
              prev=d;
            });
          }
          if(overlaySegments){ctx.stroke();strokes++;drawn+=overlaySegments;}
          if(typeof ctx.setLineDash==='function')ctx.setLineDash([]);
          result.segments+=overlaySegments;
          if(typeof ctx.fillText==='function'){
            var marks=radii.filter(function(d){return d>=1000&&d!==7500&&d!==12500&&
              d<=Math.min(horizon,domain);});
            var candidates=marks.map(function(d){var p=cameraPoint(point(d,heading+2*separation),true);
              return p.z>c.near?{radius:d,xy:screen(p)}:null;
            }).filter(Boolean).sort(function(a,b){return b.radius-a.radius;});
            var shown=[],right=canvas.width-58*pixel;
            ctx.font=Math.max(10,11*pixel)+'px Arial';ctx.textAlign='left';ctx.textBaseline='middle';
            candidates.forEach(function(v){
              var x=v.xy[0],y=v.xy[1];
              if(y<75*pixel||y>canvas.height-30*pixel||x<5*pixel||x>right||
                shown.some(function(mark){return Math.abs(y-mark)<19*pixel;}))return;
              var label=(v.radius/1000)+' km';
              var width=typeof ctx.measureText==='function'?ctx.measureText(label).width:label.length*7*pixel;
              if(x+width+8*pixel>canvas.width)return;
              ctx.globalAlpha=.83;ctx.fillStyle='#fff';
              if(typeof ctx.fillRect==='function')ctx.fillRect(x+2*pixel,y-8*pixel,width+6*pixel,16*pixel);
              ctx.globalAlpha=1;ctx.fillStyle='#34509e';ctx.fillText(label,x+5*pixel,y);
              shown.push(y);result.labels++;
            });
          }
        }finally{ctx.restore();}
        canvasMs+=clock()-started;
        return result;
      }
      function mask(){
        var points=[];
        for(var i=0;i<192;i++){var t=i*2*Math.PI/192;
          points.push([disk.rDisk*Math.cos(t),disk.rDisk*Math.sin(t),-disk.zDisk]);}
        drawPrimitive({type:'polygon',mode:2,points:points,style:{fill:'white'}},'occlusion',false);
        masked++;
      }
      // The Legacy approximation classifies *whole object packages* behind
      // the horizon. Their heights can remain visible above the white disk.
      function partition(bank){
        var far=[],near=[];
        bank.groups.forEach(function(group){
          // Camera-space axes rotate but preserve horizontal distance: use
          // the observer-local world frame instead of the optical camera basis.
          var q=[group.anchor[0]-origin[0],group.anchor[1]-origin[1],group.anchor[2]-origin[2]];
          var x=dot(q,observer.right),y=dot(q,observer.forward);
          // On Flat, x/y are unwarped planar distances, not the
          // tangent disk's chord radius. Recompute after camera translation.
          var beyond=disk&&Math.hypot(x,y)>(globe?disk.rDisk:horizon);
          (beyond?far:near).push(group);
        });
        return {index:bank.index,far:far,near:near};
      }
      var layers=source.banks.map(partition),groups=source.banks.reduce(function(s,b){return s+b.groups.length;},0);
      function paintGroup(group,far,bank){
        var tint=null;
        if(identityPass){var identity=objectIdentityColor(bank,group.index);tint=function(){return identity;};}
        else if(haze.enabled){
          var relative=translation.pointAt(group.center,observer);
          var distance=Math.hypot(relative[0],relative[1]);
          var colors=new Map();
          // Tall/dense object banks reuse a handful of palette entries.
          // Avoid redoing exp() and hex decoding for every polygon in a RAF.
          tint=function(color){
            if(!colors.has(color))colors.set(color,visibility.blend(color,distance,haze.rangeKm));
            return colors.get(color);
          };
        }
        group.primitives.forEach(function(p){
          var color=ownerPass?identityColor(geometry.landmarkOwnerKey(bank,group.index,p.metadata&&p.metadata.landmarkOwner)):null;
          drawPrimitive(p,'objects',far,ownerPass?function(){return color;}:tint);
        });
      }
      // Painter order: far objects, one white disk, surface/horizon guides,
      // then near objects. Guides are never occlusion masks.
      var setupEnd=clock();
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle=identityPass?'#000000':'white';ctx.fillRect(0,0,canvas.width,canvas.height);
      // Reset state after other renderers use this Canvas.
      ctx.lineJoin='round';ctx.lineCap='butt';
      layers.forEach(function(layer){layer.far.forEach(function(group){paintGroup(group,true,layer.index);});});
      if(disk&&layers.some(function(layer){return layer.far.length;}))mask();
      var metricGrid=identityPass?{rings:0,spokes:0,labels:0,segments:0,extentMeters:0}:drawMetricGrid();
      if(!identityPass&&globe&&(geom.showTangent||geom.showData)){
        geometry.globeHorizonGuides(geom,{segments:192}).primitives.forEach(function(p){drawPrimitive(p,'visual-aid',false);});
      }
      layers.forEach(function(layer){layer.near.forEach(function(group){paintGroup(group,false,layer.index);});});
      var end=clock();
      return {opticalQuality:'canvas-direct',refractionK:params.k,effectiveRadius:params.effectiveRadius,
        sourceObjects:groups,visibleSegments:drawn,primitivesProjected:projected,metricGrid:metricGrid,
        fillCalls:fillCalls,strokeCalls:strokes,horizonMasks:masked,geometryReused:source.reused,
        timings:{totalMs:end-began,geometryMs:geometryAt-began,setupMs:setupEnd-geometryAt,
          projectionMs:projectionMs,canvasMs:canvasMs,otherMs:end-setupEnd-projectionMs-canvasMs},
        limitations:['Legacy-style whole-object horizon masking, not physical visibility',
          'No mutual depth test; painter ordering is approximate']};
    }
    function paintCrop(canvas,camera,model,options,sourceWidth,sourceHeight,region){
      var t=cropTransform(region,sourceWidth,sourceHeight,canvas.width,canvas.height);
      var ctx=canvas.getContext('2d');
      // Replay vector paths into the destination directly. The logical
      // canvas supplies original projection dimensions; the native CTM
      // supplies the crop/zoom. No source bitmap or oversized intermediate.
      ctx.save();
      try{
        ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle='#e8eef4';ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.beginPath();ctx.rect(t.x,t.y,t.width,t.height);ctx.clip();
        ctx.setTransform(t.scale,0,0,t.scale,t.offsetX,t.offsetY);
        var stats=paint({width:sourceWidth,height:sourceHeight,getContext:function(){return ctx;}},camera,model,options);
        return {transform:t,stats:stats};
      }finally{ctx.restore();}
    }
    return Object.freeze({paint:paint,paintCrop:paintCrop,clearCache:function(){cachedKey=null;cached=null;}});
  }
  return Object.freeze({create:create,cropTransform:cropTransform,objectIdentityColor:objectIdentityColor,identityColor:identityColor,geometricModel:geometricModel,
    flatRefractionPoint:flatRefractionPoint});
}));

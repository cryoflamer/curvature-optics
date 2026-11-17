/* Experimental Animation Studio painter: effective sphere + straight-line
 * projection of authored world polygons directly to Canvas 2D. No optical ray
 * sampling, SceneFrame, ear clipping or Legacy/GraphX3DX drawing routines.
 * Horizon masking is intentionally the approximate Legacy painter convention.
 */
(function(root,factory){
  var api=factory(
    root.CurvatureGeometryEngine||(typeof require==='function'?require('../geometry/CurvatureGeometryEngine'):null),
    root.CurvatureOpticalEffectiveRadiusPreview||(typeof require==='function'?require('../optics/OpticalEffectiveRadiusPreview'):null),
    root.CurvatureCameraTranslation||(typeof require==='function'?require('../geometry/CurvatureCameraTranslation'):null),
    root.CurvatureCanvasProjection||(typeof require==='function'?require('./CurvatureCanvasProjection'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureCanvasDirectPreview=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(geometry,effective,translation,viewport){
  'use strict';
  if(!geometry||!effective||!translation||!viewport)
    throw Error('Canvas Direct requires independent Modern geometry, effective radius, translation and projection');
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
        var scene=geometry.createObjectSequenceScene(source,index,params.geometry==='globe',
          {opticsNeutral:true});
        var groups=[];
        scene.primitives.forEach(function(p){
          var i=p.metadata&&p.metadata.placedObjectIndex;
          if(!Number.isInteger(i))throw Error('Canvas Direct needs source object identity');
          if(!groups[i])groups[i]={index:i,primitives:[],anchor:null};
          groups[i].primitives.push(p);
          if(!groups[i].anchor)groups[i].anchor=p.points[0];
        });
        return {index:index,groups:groups.filter(Boolean)};
      });
      cachedKey=key;cached=banks;
      return {banks:banks,reused:false};
    }
    function paint(canvas,camera,model,options){
      options=options||{};
      var began=clock(),params=effective.parameters(model,options);
      var geom=geometricModel(model,params),source=objects(model,params),geometryAt=clock();
      var R=params.effectiveRadius,H=model.Height,globe=params.geometry==='globe';
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
      // Diagnostics affect only Canvas Direct presentation; no scene state is changed.
      var diagnostic=options.canvasDirectDiagnostics||{};
      var drawFills=diagnostic.fills!==false;
      var drawStrokes=diagnostic.strokes!==false;
      var drawMask=diagnostic.horizonMask!==false;
      var projected=0,drawn=0,strokes=0,fillCalls=0,masked=0;
      var projectionMs=0,canvasMs=0;
      function drawPrimitive(p,role,far){
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
        var fillPoints=(drawFills||role==='occlusion')&&polygon&&(mode&2)?nearPolygon(pts):null;
        var fillPixels=fillPoints&&fillPoints.length>=3?
          clipScreenPolygon(fillPoints.map(screen),canvas.width,canvas.height):null;
        // Object outlines retain their original edges; near-plane closing
        // edges created for a filled polygon are never invented as strokes.
        var lines=[];
        if(drawStrokes&&(mode&1)){var count=polygon?pts.length:pts.length-1;
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
        ctx.globalAlpha=style.alpha==null?1:style.alpha;
        if(fillPixels){ctx.fillStyle=style.fill||'white';ctx.beginPath();
          ctx.moveTo(fillPixels[0][0],fillPixels[0][1]);
          for(var k=1;k<fillPixels.length;k++)ctx.lineTo(fillPixels[k][0],fillPixels[k][1]);
          ctx.closePath();ctx.fill();fillCalls++;
        }
        if(lines.length){ctx.strokeStyle=style.stroke||(far?'#666':'black');
          ctx.lineWidth=viewport.lineWidth(style.lineWidth,camera);
          ctx.beginPath();for(var e=0;e<lines.length;e++){
            ctx.moveTo(lines[e][0][0],lines[e][0][1]);ctx.lineTo(lines[e][1][0],lines[e][1][1]);
          }ctx.stroke();strokes++;
        }
        ctx.globalAlpha=1;canvasMs+=clock()-start;
        projected+=pts.length;drawn+=lines.length;
      }
      function mask(){
        var points=[];
        for(var i=0;i<192;i++){var t=i*2*Math.PI/192;
          points.push([geom.rDisk*Math.cos(t),geom.rDisk*Math.sin(t),-geom.zDisk]);}
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
          (globe&&Math.hypot(x,y)>geom.rDisk?far:near).push(group);
        });
        return {far:far,near:near};
      }
      var layers=source.banks.map(partition),groups=source.banks.reduce(function(s,b){return s+b.groups.length;},0);
      // Painter order: far objects, one white disk, surface/horizon guides,
      // then near objects. Guides are never occlusion masks.
      var setupEnd=clock();
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.lineJoin='round';ctx.lineCap='butt';
      layers.forEach(function(layer){layer.far.forEach(function(group){group.primitives.forEach(function(p){drawPrimitive(p,'objects',true);});});});
      if(drawMask&&globe&&layers.some(function(layer){return layer.far.length;}))mask();
      // Metric guide rings replace the very dense legacy latitude/longitude
      // grid in this *preview only*. They are not physical surfaces or masks.
      // A handful of 1/2/3/5/10 km circles preserves distance context and
      // avoids projecting ~13,000 grid vertices per animation frame.
      if(geom.showGrid&&H>0){
        [1000,2000,3000,5000,10000].forEach(function(d){
          if(globe&&d>R*Math.acos(R/(R+H))+1)return;
          var ring=[];
          for(var k=0;k<96;k++){
            var a=k*2*Math.PI/96,t=globe?d/R:0,r=globe?R*Math.sin(t):d;
            ring.push([r*Math.cos(a),r*Math.sin(a),globe?R*(Math.cos(t)-1)-H:-H]);
          }
          drawPrimitive({type:'polygon',mode:1,points:ring,
            style:{stroke:globe?geom.GlobeGridCol:geom.FEGridCol,alpha:.7}},'visual-aid',false);
        });
      }
      if(globe&&(geom.showTangent||geom.showData)){
        geometry.globeHorizonGuides(geom,{segments:192}).primitives.forEach(function(p){drawPrimitive(p,'visual-aid',false);});
      }
      layers.forEach(function(layer){layer.near.forEach(function(group){group.primitives.forEach(function(p){drawPrimitive(p,'objects',false);});});});
      var end=clock();
      return {opticalQuality:'canvas-direct',refractionK:params.k,effectiveRadius:params.effectiveRadius,
        sourceObjects:groups,visibleSegments:drawn,primitivesProjected:projected,
        fillCalls:fillCalls,strokeCalls:strokes,horizonMasks:masked,geometryReused:source.reused,
        diagnostics:{fills:drawFills,strokes:drawStrokes,horizonMask:drawMask},
        timings:{totalMs:end-began,geometryMs:geometryAt-began,setupMs:setupEnd-geometryAt,
          projectionMs:projectionMs,canvasMs:canvasMs,otherMs:end-setupEnd-projectionMs-canvasMs},
        limitations:['Legacy-style whole-object horizon masking, not physical visibility',
          'No mutual depth test; painter ordering is approximate']};
    }
    return Object.freeze({paint:paint,clearCache:function(){cachedKey=null;cached=null;}});
  }
  return Object.freeze({create:create,geometricModel:geometricModel});
}));

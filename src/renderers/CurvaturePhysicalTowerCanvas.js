/* Opt-in, ground-only physical tower outline Canvas preview.
 * Uses the shared refracted-angle field and the independent geometry engine.
 * No legacy horizon disk, object painter mask, or Camera.Trans() ray shortcut.
 */
(function(root,factory){
  var api=factory(
    root.CurvatureGeometryEngine||(typeof require==='function'?require('../geometry/CurvatureGeometryEngine'):null),
    root.CurvatureSharedRayField||(typeof require==='function'?require('../optics/OpticalSharedRayField'):null),
    root.CurvatureOpticalTowerSilhouette||(typeof require==='function'?require('../optics/OpticalTowerSilhouette'):null),
    root.CurvatureCanvasProjection||(typeof require==='function'?require('./CurvatureCanvasProjection'):null),
    root.CurvaturePerspectivePreview||(typeof require==='function'?require('./CurvaturePerspectivePreview'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvaturePhysicalTowerCanvas=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(engine,fields,silhouette,canvasProjection,perspective){
  'use strict';
  if(!engine||!fields||!silhouette||!canvasProjection||!perspective)
    throw Error('Independent optical Canvas dependencies required');
  var KINDS=['vacuum','standard','exponential-occlusion','inverse-spherical'];
  function vec(a,b){return a.map(function(v,i){return v-b[i];});}
  function dot(a,b){return a.reduce(function(s,v,i){return s+v*b[i];},0);}
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function unit(a){var n=Math.hypot.apply(null,a);if(!(n>0))throw RangeError('Degenerate optical camera');return a.map(function(v){return v/n;});}
  function cameraBasis(camera){
    var c=camera.pos?camera:perspective.snapshot(camera);
    if(!Array.isArray(c.pos)||!c.pos.every(Number.isFinite)||Math.hypot.apply(null,c.pos)>1e-7)
      throw RangeError('Physical optics requires camera at the physical observer origin');
    var back=unit(vec(c.pos,c.center)),right=unit(cross(unit(c.up),back)),up=unit(cross(back,right));
    var cameraDistance=Math.hypot.apply(null,vec(c.center,c.pos));
    var focal=c.sceneSize!==0?c.screenSize/c.sceneSize*(cameraDistance-c.objectZExtend):1;
    if(!(focal>0)&&!(c.sceneSize===0&&focal===1))throw RangeError('Invalid physical camera focal distance');
    if(!(c.screenSize>0)||!(c.zoom>0))throw RangeError('Invalid physical camera scale');
    return {camera:c,back:back,right:right,up:up,focal:focal*c.zoom};
  }
  function pixelSegments(outlines,camera,width,height){
    if(!outlines||!Array.isArray(outlines.segments)||!(width>0&&height>0))
      throw TypeError('Visible angular outlines and Canvas size required');
    var basis=cameraBasis(camera),pixels=canvasProjection.resolve(basis.camera,width,height);
    var near=basis.camera.near>0?basis.camera.near:1e-6;
    var projected=[],behind=0,outside=0,nearClips=0,viewportClips=0;
    function local(angle){
      var az=angle[0],el=angle[1];
      if(!Number.isFinite(az)||!Number.isFinite(el))throw TypeError('Finite optical angles required');
      var dir=[Math.sin(az)*Math.cos(el),Math.cos(az)*Math.cos(el),Math.sin(el)];
      return {x:dot(dir,basis.right),y:dot(dir,basis.up),z:-dot(dir,basis.back)};
    }
    function interp(a,b,t){return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};}
    outlines.segments.forEach(function(segment){
      if(segment.visibility!=='visible')throw Error('Non-visible optical segment must not be painted');
      var a=local(segment.points[0]),b=local(segment.points[1]);
      if(a.z<=near&&b.z<=near){behind++;return;}
      if(a.z<=near){a=interp(a,b,(near-a.z)/(b.z-a.z));nearClips++;}
      if(b.z<=near){b=interp(b,a,(near-b.z)/(a.z-b.z));nearClips++;}
      var first=canvasProjection.point(pixels,basis.focal*a.x/a.z,basis.focal*a.y/a.z);
      var second=canvasProjection.point(pixels,basis.focal*b.x/b.z,basis.focal*b.y/b.z);
      if(!first.every(Number.isFinite)||!second.every(Number.isFinite)){outside++;return;}
      var clipped=perspective.clipViewport(first,second,width,height);
      if(!clipped){outside++;return;}
      if(clipped.some(function(p,i){return Math.hypot(p[0]-[first,second][i][0],p[1]-[first,second][i][1])>1e-7;}))viewportClips++;
      projected.push({points:clipped,source:segment.source});
    });
    return {segments:projected,statistics:{drawn:projected.length,behindCamera:behind,
      outsideViewport:outside,nearClips:nearClips,viewportClips:viewportClips}};
  }
  function paint(canvas,camera,outlines){
    if(!canvas||typeof canvas.getContext!=='function')throw TypeError('Canvas required');
    var ctx=canvas.getContext('2d');
    if(!ctx||typeof ctx.fillRect!=='function'||typeof ctx.beginPath!=='function')throw TypeError('2D Canvas context required');
    var projected=pixelSegments(outlines,camera,canvas.width,canvas.height);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle='#111';ctx.lineWidth=1;
    projected.segments.forEach(function(segment){
      ctx.beginPath();ctx.moveTo(segment.points[0][0],segment.points[0][1]);
      ctx.lineTo(segment.points[1][0],segment.points[1][1]);ctx.stroke();
    });
    return projected;
  }
  function availability(model){
    if(!model||![1,2].includes(model.showModel))
      return {supported:false,reason:'Physical preview supports Globe or Flat separately (not Both).'};
    if(!Number.isFinite(model.rEarth)||!(model.rEarth>0)||!Number.isFinite(model.Height)||model.Height<0)
      return {supported:false,reason:'Invalid physical Earth radius or observer height.'};
    for(var i=0;i<2;i++)if(model.NObjects[i]>0&&model.ObjType[i]!==3)
      return {supported:false,reason:'Physical preview supports only tower object groups; group '+(i+1)+' is not a tower.'};
    return {supported:true,reason:''};
  }
  function optionsProfile(options){
    var kind=options&&options.atmosphere||'vacuum';
    if(!KINDS.includes(kind))throw RangeError('Unsupported physical atmospheric profile');
    var R=options&&options.occlusionRadius===undefined?6371000:options.occlusionRadius;
    if(!Number.isFinite(R)||!(R>0))throw RangeError('Invalid optical occlusion radius');
    return {kind:kind,occlusionRadius:R};
  }
  function create(){
    var cached=null;
    function geometryData(model,geometry){
      var primitives=[],towers=0;
      [0,1].forEach(function(bank){if(model.NObjects[bank]>0){
        engine.towerSequence(model,bank,geometry==='globe').forEach(function(entry){
          towers++;
          entry.scene.primitives.forEach(function(p){
            primitives.push(Object.assign({},p,{tower:{bank:bank,
              sequenceIndex:entry.scene.metadata.sequenceIndex,
              column:entry.scene.metadata.column}}));
          });
        });
      }});
      return {primitives:primitives,towers:towers};
    }
    function bounds(primitives,geometry,radius,observerHeight){
      var count=0,minD=Infinity,maxD=0,minH=Infinity,maxH=0;
      primitives.forEach(function(p){p.points.forEach(function(world){
        var c=silhouette.coordinate(world,geometry,radius,observerHeight);
        if(c.distance>0 && (geometry==='flat'||c.distance<radius*Math.PI/2) && c.height>=-1e-6){
          count++;minD=Math.min(minD,c.distance);maxD=Math.max(maxD,c.distance);
          minH=Math.min(minH,Math.max(0,c.height));maxH=Math.max(maxH,Math.max(0,c.height));
        }
      });});
      if(!count)return null;
      var d0=Math.max(0.001,minD-1);
      var d1=Math.max(d0+1,maxD+1);
      if(geometry==='globe')d1=Math.min(d1,radius*Math.PI/2-1);
      var h0=Math.max(0,minH-1);
      var h1=Math.max(h0+1,maxH+1);
      // Log range spacing resolves nearby high-perspective-curvature towers
      // without a dense uniform grid covering the entire causeway.
      var distances=[],heights=[],nd=12,nh=3;
      for(var i=0;i<=nd;i++)distances.push(d0*Math.pow(d1/d0,i/nd));
      for(var j=0;j<=nh;j++)heights.push(h0+(h1-h0)*j/nh);
      return {distances:distances,heights:heights};
    }
    function geometryModel(model){
      // The physical preview never uses legacy refractionRadius geometry.
      return Object.assign({},model,{geometryRadius:model.rEarth});
    }
    function sceneKey(model,geometry,profile,settings){
      // Camera pan/nick/roll/zoom are intentionally excluded: the optical
      // field is view-independent and may be painted from any origin camera.
      return JSON.stringify([geometry,model.rEarth,model.Height,model.ObjType,
        model.NObjects,model.ObjDist,model.ObjDeltaDist,model.ObjSidePos,
        model.ObjSideVar,model.ObjSideType,model.ObjSize,model.ObjSizeVar,
        model.ObjSizeType,profile.kind,profile.occlusionRadius,settings]);
    }
    function outlines(model,options){
      var available=availability(model);
      if(!available.supported)throw RangeError(available.reason);
      var settings=Object.assign({step:200,fieldTolerance:1e-5,
        angularTolerance:2e-5,minimumDepth:1,maximumDepth:10,maxSamples:10000,
        maxBuildMs:3500},options&&options.settings||{});
      if(!Number.isFinite(settings.maxBuildMs)||settings.maxBuildMs<0)
        throw RangeError('Invalid physical preview time budget');
      var profile=optionsProfile(options),geometry=model.showModel===1?'globe':'flat';
      var key=sceneKey(model,geometry,profile,settings);
      if(cached&&cached.key===key)return {data:cached.data,reused:true};
      var start=Date.now();
      var physical=geometryModel(model),scene=geometryData(physical,geometry),range=bounds(scene.primitives,geometry,physical.rEarth,physical.Height);
      var result;
      if(!range)result={segments:[],unresolved:[],stats:{evaluations:0},towers:scene.towers,primitives:scene.primitives.length};
      else {
        var field=fields.create({geometry:geometry,radius:physical.rEarth,
          observerHeight:physical.Height,atmosphere:profile.kind,
          profileOptions:profile.kind==='exponential-occlusion'||profile.kind==='inverse-spherical'?{
            occlusionRadius:profile.occlusionRadius}:undefined,
          distances:range.distances,heights:range.heights,
          angleTolerance:settings.fieldTolerance,step:settings.step});
        // Browser redraw must not launch unbounded atmospheric shooting on
        // hundreds of tower edges. Never infer visibility from budget exhaustion.
        var deadline=Date.now()+settings.maxBuildMs,budgetExceeded=false;
        var limitedField={sample:function(d,h){
          if(Date.now()>=deadline){budgetExceeded=true;return {status:'solver_failed',reason:'preview-time-budget'};}
          return field.sample(d,h);
        }};
        result=silhouette.projectPrimitives({primitives:scene.primitives,field:limitedField,
          geometry:geometry,radius:physical.rEarth,observerHeight:physical.Height,
          angularTolerance:settings.angularTolerance,minimumDepth:settings.minimumDepth,maximumDepth:settings.maximumDepth,
          maxSamples:settings.maxSamples});
        result.budgetExceeded=budgetExceeded;
        result.fieldStats=field.stats();
        result.towers=scene.towers;result.primitives=scene.primitives.length;
      }
      result.buildMs=Date.now()-start;
      cached={key:key,data:result};
      return {data:result,reused:false};
    }
    function render(canvas,camera,model,options){
      // Reject unsupported cameras before expensive physical shooting.
      cameraBasis(camera);
      var prepared=outlines(model,options);
      var projected=paint(canvas,camera,prepared.data);
      return {mode:'physical-outlines',drawn:projected.statistics.drawn,
        projectionStats:projected.statistics,physStats:prepared.data.stats,
        towers:prepared.data.towers,primitives:prepared.data.primitives,
        unresolved:prepared.data.unresolved.length,
        fieldStats:prepared.data.fieldStats||null,buildMs:prepared.data.buildMs,
        cacheReused:prepared.reused,budgetExceeded:!!prepared.data.budgetExceeded,
        warning:'Physical ground-occluded outlines only: no fills, terrain surface or mutual tower occlusion.' +
          (prepared.data.unresolved.length || prepared.data.budgetExceeded ? ' Incomplete preview: uncertain or budget-limited edges omitted.' : '')};
    }
    return {render:render,outlines:outlines,clearCache:function(){cached=null;}};
  }
  return {create:create,availability:availability,pixelSegments:pixelSegments,
    paint:paint,cameraBasis:cameraBasis};
}));

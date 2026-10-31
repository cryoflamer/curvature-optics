/* #140.12.39: Camera-first, CPU f64 first-hit audit of authored opaque object
 * polygons and Earth. Not a target-point solver, rasterized z-buffer or renderer.
 * The physical RK4 path is shared with #140.12.38; object intersections are
 * evaluated against world-space triangles, never optically projected polygons.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?require('./CurvatureCameraFirstOracle141238'):root.CurvatureCameraFirstOracle141238,
    typeof module==='object'&&module.exports?require('../optics/OpticalRayTracer'):root.CurvatureRayTracer,
    typeof module==='object'&&module.exports?require('../optics/CurvaturePhysicalPolygonFills'):root.CurvaturePhysicalPolygonFills,
    typeof module==='object'&&module.exports?require('../app/CurvaturePhysicalCamera'):root.CurvaturePhysicalCamera);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureCameraFirstObjects141239=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(oracle,tracer,fills,camera){
'use strict';
if(!oracle||!tracer||!fills||!camera)throw Error('Camera-first objects require physical tracer, camera, oracle and authored triangulator');
var VERSION='140.12.39',STEP=100,SIZE=64,MAX_DISTANCE=30000;
function sub(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function finite3(p){return Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);}
function prepare(composed){
  if(!composed||!composed.scene||!Array.isArray(composed.ranges)||
      composed.scene.metadata.composition!=='optics-neutral-main'||
      composed.scene.metadata.physicalMetricWorld!==true)
    throw TypeError('Metric optics-neutral authored scene required');
  var polygons=0,lines=0,proxyPolygons=0,transparent=0,failed=[],triangles=[],proxyTriangles=[];
  composed.ranges.filter(function(r){return r.role==='objects';}).forEach(function(r){
    for(var i=r.start;i<r.end;i++){
      var p=composed.scene.primitives[i],style=p.style||{};
      if(!p||!Array.isArray(p.points)||!p.points.every(finite3))throw TypeError('Invalid authored object');
      if(p.type==='line'){lines++;continue;}
      if(style.alpha!==undefined&&style.alpha<1){transparent++;continue;}
      var proxy=!(p.mode&2)&&!!(p.mode&1);
      if(!proxy&&!(p.mode&2)){lines++;continue;}
      if(proxy)proxyPolygons++;else polygons++;
      var t=fills.planeTriangles(p.points);
      if(t.reason){failed.push({sourceIndex:p.commandIndex,reason:t.reason});continue;}
      t.triangles.forEach(function(v,j){
        var e1=sub(v[1],v[0]),e2=sub(v[2],v[0]),normal=cross(e1,e2);
        if(!(Math.hypot.apply(null,normal)>1e-10)){
          failed.push({sourceIndex:p.commandIndex,reason:'degenerate-triangle'});return;
        }
        (proxy?proxyTriangles:triangles).push({a:v[0],b:v[1],c:v[2],e1:e1,e2:e2,
          maxRadius:Math.max.apply(null,v.map(function(x){return Math.hypot(x[0],x[1]);})),
          zmin:Math.min(v[0][2],v[1][2],v[2][2]),zmax:Math.max(v[0][2],v[1][2],v[2][2]),
          sourceIndex:p.commandIndex,placedObjectIndex:p.metadata&&p.metadata.placedObjectIndex,
          sourceLayer:r.name,triangleIndex:j,fill:style.fill||'#b88750'});
      });
    }
  });
  return {triangles:triangles,proxyTriangles:proxyTriangles,counts:{sourceOpaquePolygons:polygons,
    sourceOutlineOnlyPolygons:proxyPolygons,sourceLineSegments:lines,
    excludedTransparentPolygons:transparent,opaqueTriangles:triangles.length,
    outlineProxyTriangles:proxyTriangles.length,failedTriangulations:failed}};
}
// Select a physically authored object in the live camera view for a second,
// denser 64x64 sample. Vacuum forward projection is ONLY an ROI locator; it
// never supplies optical visibility or ray intersection answers.
function focusedRoi(config,composed){
  oracle.check(config);
  var m=config.model,s=config.snapshot,v=camera.create(m),
    forward=v.center.map(function(x,i){return x-v.pos[i];}),
    up=v.up,right=cross(forward,up),fn=Math.hypot.apply(null,forward),
    rn=Math.hypot.apply(null,right);
  forward=forward.map(function(x){return x/fn;});
  right=right.map(function(x){return x/rn;});
  up=cross(right,forward);
  var candidates=[];
  composed.ranges.filter(function(r){return r.role==='objects';}).forEach(function(r){
    var grouped=new Map();
    for(var i=r.start;i<r.end;i++){
      var p=composed.scene.primitives[i],id=p.metadata&&p.metadata.placedObjectIndex;
      if(!grouped.has(id))grouped.set(id,[]);
      grouped.get(id).push(p);
    }
    grouped.forEach(function(primitives,id){
      var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,count=0;
      primitives.forEach(function(p){p.points.forEach(function(pt){
        var depth=dot(pt,forward);if(depth<=0)return;
        var x=s.pixelOffsetX+s.imagePlaneFocal*s.pixelScaleX*dot(pt,right)/depth,
          y=s.pixelOffsetY+s.imagePlaneFocal*s.pixelScaleY*dot(pt,up)/depth;
        if(!Number.isFinite(x)||!Number.isFinite(y))return;
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);
        minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;
      });});
      if(!count||maxX<0||minX>=s.widthPx||maxY<0||minY>=s.heightPx)return;
      var centreX=(minX+maxX)/2,centreY=(minY+maxY)/2,
        area=Math.max(1,maxX-minX)*Math.max(1,maxY-minY);
      candidates.push({id:id,sourceLayer:r.name,centreX:centreX,centreY:centreY,
        projectedBounds:[minX,minY,maxX,maxY],area:area});
    });
  });
  candidates.sort(function(a,b){return b.area-a.area;});
  if(!candidates.length)return null;
  var target=candidates[0],w=Math.max(64,Math.min(240,Math.ceil((target.projectedBounds[2]-target.projectedBounds[0])*3+40))),
    h=Math.max(64,Math.min(240,Math.ceil((target.projectedBounds[3]-target.projectedBounds[1])*3+40)));
  w=Math.min(w,s.widthPx);h=Math.min(h,s.heightPx);
  var x=Math.max(0,Math.min(s.widthPx-w,Math.round(target.centreX-w/2))),
    y=Math.max(0,Math.min(s.heightPx-h,Math.round(target.centreY-h/2))),
    snap=Object.assign({},s,{widthPx:w,heightPx:h,
      pixelOffsetX:s.pixelOffsetX-x,pixelOffsetY:s.pixelOffsetY-y});
  return {config:{model:m,snapshot:snap},bounds:{x:x,y:y,width:w,height:h},
    chosenObject:{id:target.id,layer:target.sourceLayer,
      vacuumProjectedBoundsPx:target.projectedBounds},
    warning:'ROI placement uses approximate straight-line object projection; each pixel is independently traced in the full physical atmosphere.'};
}
// Moller-Trumbore, two-sided. t is a fraction of ONE integrated 3D ray chord.
// This is an approximation to the curved segment, not certified intersection.
function chordTriangle(a,b,tri){
  var d=sub(b,a),p=cross(d,tri.e2),det=dot(tri.e1,p);
  if(Math.abs(det)<=1e-12*Math.max(1,Math.hypot.apply(null,d)*Math.hypot.apply(null,tri.e1)*Math.hypot.apply(null,tri.e2)))return null;
  var inv=1/det,tvec=sub(a,tri.a),u=dot(tvec,p)*inv;
  if(u<-1e-10||u>1+1e-10)return null;
  var q=cross(tvec,tri.e1),v=dot(d,q)*inv;
  if(v<-1e-10||u+v>1+1e-10)return null;
  var t=dot(tri.e2,q)*inv;
  return t>=0&&t<=1?t:null;
}
function azimuthCandidates(mesh,azimuth,proxy){
  var dx=Math.sin(azimuth),dy=Math.cos(azimuth);
  return (proxy?mesh.proxyTriangles:mesh.triangles).filter(function(t){
    if(t.maxRadius<=0)return false;
    // A physical radial ray stays in this vertical plane by spherical symmetry.
    // A triangle entirely to one side cannot intersect that ray (safe broadphase).
    var a=t.a[0]*dy-t.a[1]*dx,b=t.b[0]*dy-t.b[1]*dx,c=t.c[0]*dy-t.c[1]*dx;
    var eps=1e-10*Math.max(1,t.maxRadius);
    return Math.min(a,b,c)<=eps&&Math.max(a,b,c)>=-eps;
  });
}
function firstHitFromPoints(points,azimuth,groundDistance,candidates){
  if(!Array.isArray(points)||points.length<2)throw TypeError('Integrated ray points required');
  var sine=Math.sin(azimuth),cosine=Math.cos(azimuth),best=null,path=0;
  for(var i=1;i<points.length;i++){
    var p=points[i-1],q=points[i],a=[p[0]*sine,p[0]*cosine,p[1]],
      b=[q[0]*sine,q[0]*cosine,q[1]],segment=Math.hypot(q[0]-p[0],q[1]-p[1]);
    for(var j=0;j<candidates.length;j++){
      var t=candidates[j];
      if(Math.max(p[0],q[0])<0||Math.min(p[0],q[0])>t.maxRadius+1e-7||
        Math.max(p[1],q[1])<t.zmin-1e-7||Math.min(p[1],q[1])>t.zmax+1e-7)continue;
      var fraction=chordTriangle(a,b,t);
      if(fraction===null)continue;
      var distance=path+fraction*segment;
      if(best===null||distance<best.distance){best={kind:'object',distance:distance,
        sourceIndex:t.sourceIndex,placedObjectIndex:t.placedObjectIndex,
        sourceLayer:t.sourceLayer,triangleIndex:t.triangleIndex,fill:t.fill};}
    }
    path+=segment;
    if(best&&path>best.distance+segment)break;
  }
  // A genuine grazing ground event is not a certified opaque hit. Keep its
  // classification even if a candidate object is absent.
  if(best&&(groundDistance===null||best.distance<groundDistance-1e-6))return best;
  return groundDistance===null?{kind:'range',distance:null}: {kind:'ground',distance:groundDistance};
}
function solvePixel(config,mesh,col,row,atmosphere,step){
  var angle=oracle.pixelRay(config.model,config.snapshot,col,row),
    ray=tracer.trace({geometry:'globe',radius:config.model.rEarth,
      observerHeight:config.model.Height,atmosphere:atmosphere,
      angle:angle.angleRadians,length:MAX_DISTANCE,step:step,
      collect:true,fastClearGround:atmosphere==='standard',
      eventSubsteps:8,contactTolerance:1e-6}),
    candidates=azimuthCandidates(mesh,angle.azimuthRadians),
    ground=ray.hitGround?ray.travelled:null,
    hit=firstHitFromPoints(ray.points,angle.azimuthRadians,ground,candidates),
    proxyCandidates=azimuthCandidates(mesh,angle.azimuthRadians,true),
    proxyHit=firstHitFromPoints(ray.points,angle.azimuthRadians,ground,candidates.concat(proxyCandidates));
  if(hit.kind==='ground'&&ray.event&&ray.event.contact==='grazing')hit.kind='grazing';
  if(proxyHit.kind==='ground'&&ray.event&&ray.event.contact==='grazing')proxyHit.kind='grazing';
  return {row:row,column:col,angleRadians:angle.angleRadians,
    azimuthRadians:angle.azimuthRadians,kind:hit.kind,distanceMetres:hit.distance,
    sourceIndex:hit.sourceIndex===undefined?null:hit.sourceIndex,
    placedObjectIndex:hit.placedObjectIndex===undefined?null:hit.placedObjectIndex,
    sourceLayer:hit.sourceLayer||null,triangleIndex:hit.triangleIndex===undefined?null:hit.triangleIndex,
    fill:hit.fill||null,groundDistanceMetres:ground,candidateTriangles:candidates.length,
    proxyKind:proxyHit.kind,proxySourceIndex:proxyHit.sourceIndex===undefined?null:proxyHit.sourceIndex,
    proxyCandidateTriangles:proxyCandidates.length};
}
function checked(config,mesh,atmosphere,step){
  oracle.check(config);
  if(!mesh||!Array.isArray(mesh.triangles)||!Array.isArray(mesh.proxyTriangles)||
    !['standard','vacuum'].includes(atmosphere)||!(step>0&&step<=250))
    throw TypeError('Invalid camera-first object request');
}
function samplePixel(config,mesh,col,row,atmosphere,step){
  checked(config,mesh,atmosphere,step);
  if(!Number.isInteger(col)||col<0||col>=SIZE||!Number.isInteger(row)||row<0||row>=SIZE)
    throw RangeError('Invalid camera-first pixel index');
  return solvePixel(config,mesh,col,row,atmosphere,step);
}
function sampleRow(config,mesh,row,atmosphere,step){
  checked(config,mesh,atmosphere,step);
  if(!Number.isInteger(row)||row<0||row>=SIZE)throw RangeError('Invalid camera-first row');
  var out=[];
  for(var col=0;col<SIZE;col++)out.push(solvePixel(config,mesh,col,row,atmosphere,step));
  return out;
}
// Same-ray 100m vs 50m check, favouring observed object/proxy hits and their
// nearest neighbours. No claims for untouched pixels or continuous curves.
function refinementTargets(rows,limit){
  if(rows.length!==SIZE||rows.some(function(r){return r.length!==SIZE;}))throw Error('Incomplete object frame');
  var seen=new Set(),out=[];
  function add(x,y){
    if(x<0||x>=SIZE||y<0||y>=SIZE||out.length>=limit)return;
    var key=y*SIZE+x;if(!seen.has(key)){seen.add(key);out.push([x,y]);}
  }
  for(var y=0;y<SIZE;y++)for(var x=0;x<SIZE;x++){
    var p=rows[y][x];
    if(p.kind==='object'||p.proxyKind==='object'){
      add(x,y);add(x+1,y);add(x-1,y);add(x,y+1);add(x,y-1);
    }
  }
  return out;
}
function convergence(config,mesh,rows,limit){
  var targets=refinementTargets(rows,limit||128),wrong=0,proxyWrong=0,maxDistanceDelta=0,
    sameObject=0,examples=[];
  targets.forEach(function(v){
    var original=rows[v[1]][v[0]],fine=samplePixel(config,mesh,v[0],v[1],'standard',50);
    if(original.kind!==fine.kind||original.sourceIndex!==fine.sourceIndex){
      wrong++;if(examples.length<20)examples.push({column:v[0],row:v[1],coarse:original.kind,
        fine:fine.kind,coarseSource:original.sourceIndex,fineSource:fine.sourceIndex});
    }
    if(original.proxyKind!==fine.proxyKind||original.proxySourceIndex!==fine.proxySourceIndex)proxyWrong++;
    if(original.kind==='object'&&fine.kind==='object'&&original.sourceIndex===fine.sourceIndex){
      sameObject++;maxDistanceDelta=Math.max(maxDistanceDelta,Math.abs(original.distanceMetres-fine.distanceMetres));
    }
  });
  return {coarseStepMetres:100,fineStepMetres:50,checkedSamples:targets.length,
    changedOpaqueFirstHits:wrong,changedOutlineProxyFirstHits:proxyWrong,
    comparableOpaqueObjectContacts:sameObject,maximumOpaqueContactDeltaMetres:maxDistanceDelta,
    examples:examples,limitation:'Target selection is bounded to object/proxy-hit pixels and neighbours; no exhaustive convergence guarantee.'};
}
function summary(rows,mesh){
  if(rows.length!==SIZE||rows.some(function(r){return r.length!==SIZE;}))throw Error('Incomplete camera-first object frame');
  var counts={object:0,ground:0,grazing:0,range:0},proxyCounts={object:0,ground:0,grazing:0,range:0},
    bySource={},groundOccludedByObject=0,proxyExtraPixels=0;
  rows.forEach(function(row){row.forEach(function(p){
    counts[p.kind]++;proxyCounts[p.proxyKind]++;
    if(p.proxyKind==='object'&&p.kind!=='object')proxyExtraPixels++;
    if(p.kind==='object'){
      var key=String(p.sourceIndex);bySource[key]=(bySource[key]||0)+1;
      if(p.groundDistanceMetres!==null)groundOccludedByObject++;
    }
  });});
  return {counts:counts,proxyCounts:proxyCounts,proxyExtraPixels:proxyExtraPixels,
    total:SIZE*SIZE,bySourceIndex:bySource,
    objectInFrontOfGroundPixels:groundOccludedByObject,mesh:mesh.counts,
    tracedStepMetres:STEP};
}
function frame(rows,mode){
  if(rows.length!==SIZE||rows.some(function(r){return r.length!==SIZE;}))throw Error('Incomplete camera-first object frame');
  var scale=8,width=SIZE*scale,data=new Uint8ClampedArray(width*width*4);
  for(var y=0;y<SIZE;y++)for(var x=0;x<SIZE;x++){
    var p=rows[y][x],kind=mode==='proxy'?p.proxyKind:p.kind,
      rgb=kind==='object'?[218,140,59]:kind==='ground'?[51,139,115]:
      kind==='grazing'?[247,170,35]:[45,68,109];
    if(mode==='source'&&p.kind==='object'){
      var hash=(Number(p.sourceIndex)*2654435761)>>>0;
      rgb=[70+hash%160,60+(hash>>>9)%150,65+(hash>>>18)%140];
    }
    if(mode==='objects-only'&&p.kind!=='object')rgb=[28,33,42];
    for(var dy=0;dy<scale;dy++)for(var dx=0;dx<scale;dx++){
      var i=((y*scale+dy)*width+x*scale+dx)*4;
      data.set([rgb[0],rgb[1],rgb[2],255],i);
    }
  }
  return {width:width,height:width,rgba:data};
}
function downsample(frame,roi){
  if(!frame||!Number.isInteger(frame.width)||!Number.isInteger(frame.height)||
    !frame.rgba||frame.rgba.length!==frame.width*frame.height*4)throw Error('Valid CPU canvas capture required');
  roi=roi||{x:0,y:0,width:frame.width,height:frame.height};
  if(roi.x<0||roi.y<0||roi.width<=0||roi.height<=0||roi.x+roi.width>frame.width||roi.y+roi.height>frame.height)
    throw RangeError('Invalid CPU image ROI');
  var out=new Uint8ClampedArray(512*512*4);
  for(var y=0;y<64;y++)for(var x=0;x<64;x++){
    var ox=Math.min(frame.width-1,Math.floor(roi.x+(x+.5)*roi.width/64)),
      oy=Math.min(frame.height-1,Math.floor(roi.y+(y+.5)*roi.height/64)),
      source=(oy*frame.width+ox)*4;
    for(var dy=0;dy<8;dy++)for(var dx=0;dx<8;dx++){
      var dest=((y*8+dy)*512+x*8+dx)*4;
      out.set(frame.rgba.subarray(source,source+4),dest);
    }
  }
  return {width:512,height:512,rgba:out};
}
function entries(rows,report,cpuFrame,doc,visual,roiRows,roi){
  var result=[{name:'camera-first-objects/report.json',data:JSON.stringify(report,null,2)},
    {name:'camera-first-objects/first-hit-mask.png',data:visual.png(frame(rows),doc)},
    {name:'camera-first-objects/object-source-indices.png',data:visual.png(frame(rows,'source'),doc)},
    {name:'camera-first-objects/objects-only.png',data:visual.png(frame(rows,'objects-only'),doc)},
    {name:'camera-first-objects/outline-as-opaque-proxy.png',data:visual.png(frame(rows,'proxy'),doc)}];
  if(cpuFrame)result.push({name:'camera-first-objects/production-cpu-sampled.png',
    data:visual.png(downsample(cpuFrame),doc)});
  if(roi&&roiRows){
    result.push({name:'camera-first-objects/focused-first-hit-mask.png',data:visual.png(frame(roiRows),doc)});
    result.push({name:'camera-first-objects/focused-outline-proxy.png',data:visual.png(frame(roiRows,'proxy'),doc)});
    if(cpuFrame)result.push({name:'camera-first-objects/focused-production-cpu-sampled.png',
      data:visual.png(downsample(cpuFrame,roi.bounds),doc)});
  }
  result.push({name:'camera-first-objects/README.txt',data:[
    'Curvature #140.12.39: camera-first f64 first opaque object or Earth contact',
    'Grid: 64x64 actual Compare A centre directions, enlarged nearest-neighbour 8x.',
    'First-hit mask: orange=opaque object, green=Earth, amber=grazing Earth, navy=no contact before 30km.',
    'Object-source map: each differently coloured object polygon is an authored sourceIndex, NOT a real texture.',
    'Outline-as-opaque-proxy: separately triangulated UNFILLED outline polygons treated as hypothetical solid surfaces.',
    'THE PROXY IS NOT PHYSICALLY AUTHORED OPAQUE GEOMETRY. Compare separately; never use it as certified visibility.',
    'The optional production-cpu-sampled image comes from the existing Compare A Canvas at matching pixel centres.',
    'Focused ROI is chosen from the largest visible vacuum-projected authored object bounds; the ACTUAL optical rays are traced normally.',
    'It includes guides, outlines, colours and other drawing effects; it is NOT a semantic ground-truth classification.',
    'Object intersections use straight chords of 100m CPU f64 RK4 steps (approximation, NOT certified continuous curves).',
    'Physical objects are unprojected world-space authored polygons from metric composeOpticalMain().',
    'Shared authored polygon ear-clip triangulation. Primary result includes opaque fills only; no thin strokes, transparent compositing or textures.',
    'First-hit order is path length along the integrated ray, NOT screen-space 1/z.',
    'Range = nothing before 30km, not guaranteed visibility to infinity.',
    'Near tangent/edge intersections can be missed or ambiguous: run step-convergence study before declaring correctness.',
    'No GPU, target shooting, interpolated fields, projected triangle reconstruction or production renderer changes.',
    ''
  ].join('\n')});
  return result;
}
return Object.freeze({VERSION:VERSION,SIZE:SIZE,STEP:STEP,MAX_DISTANCE:MAX_DISTANCE,
  prepare:prepare,focusedRoi:focusedRoi,chordTriangle:chordTriangle,azimuthCandidates:azimuthCandidates,
  firstHitFromPoints:firstHitFromPoints,samplePixel:samplePixel,sampleRow:sampleRow,
  refinementTargets:refinementTargets,convergence:convergence,summary:summary,
  frame:frame,downsample:downsample,entries:entries});
}));

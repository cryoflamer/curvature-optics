/* #140.12.38: camera-first CPU f64 first-ground-contact diagnostic.
 * Does not use target-point shooting, field interpolation, geometry projection,
 * object meshes, screen z-buffer, GPU, or change production rendering.
 * Physical 2D ray tracing is applied per pixel in its radial meridian plane:
 * valid for radially symmetric globe/atmosphere, not a general 3D medium.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?require('../optics/OpticalRayTracer'):root.CurvatureRayTracer,
    typeof module==='object'&&module.exports?require('../app/CurvaturePhysicalCamera'):root.CurvaturePhysicalCamera);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureCameraFirstOracle141238=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(tracer,physicalCamera){
'use strict';
if(!tracer||!physicalCamera)throw Error('Camera-first requires physical ray tracer and camera');
var VERSION='140.12.38',SIZE=64,MAX_DISTANCE=30000,STEP=250;
function check(config){
  if(!config||!config.model||!config.snapshot)throw TypeError('Physical model and captured camera required');
  var m=config.model,s=config.snapshot;
  if(m.showModel===2||!(m.rEarth>0)||!(m.Height>0)||
      !Number.isFinite(m.rEarth)||!Number.isFinite(m.Height)||
      !Number.isInteger(s.widthPx)||!Number.isInteger(s.heightPx)||
      !(s.widthPx>0&&s.heightPx>0)||
      ![s.imagePlaneFocal,s.pixelScaleX,s.pixelScaleY,s.pixelOffsetX,s.pixelOffsetY].every(Number.isFinite)||
      !(s.imagePlaneFocal>0&&s.pixelScaleX!==0&&s.pixelScaleY!==0))
    throw RangeError('Valid Globe/physical camera and positive observer height required');
  if(config.maximumDistance!==undefined&&config.maximumDistance!==MAX_DISTANCE)
    throw RangeError('Camera-first comparison distance is fixed to 30 km');
  if(config.step!==undefined&&config.step!==STEP)
    throw RangeError('Camera-first coarse RK4 step is fixed to 250 m');
}
function unit(v){var n=Math.hypot(v[0],v[1],v[2]);if(!(n>0))throw Error('Invalid direction');return v.map(function(x){return x/n;});}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function cameraBasis(model){
  var c=physicalCamera.create(model),forward=unit(c.center.map(function(v,i){return v-c.pos[i];})),
    up=unit(c.up),right=unit(cross(forward,up));
  return {forward:forward,up:up,right:right};
}
function pixelRay(model,snapshot,column,row){
  if(!Number.isInteger(column)||column<0||column>=SIZE||!Number.isInteger(row)||row<0||row>=SIZE)
    throw RangeError('Invalid 64x64 camera pixel');
  var b=cameraBasis(model),x=(column+.5)*snapshot.widthPx/SIZE,
    y=(row+.5)*snapshot.heightPx/SIZE,
    u=(x-snapshot.pixelOffsetX)/(snapshot.pixelScaleX*snapshot.imagePlaneFocal),
    v=(y-snapshot.pixelOffsetY)/(snapshot.pixelScaleY*snapshot.imagePlaneFocal),
    d=unit(b.forward.map(function(f,i){return f+u*b.right[i]+v*b.up[i];}));
  // Spherical symmetry rotates each spatial ray into its own radial meridian.
  var horizontal=Math.hypot(d[0],d[1]);
  return {angleRadians:Math.atan2(d[2],horizontal),azimuthRadians:Math.atan2(d[0],d[1]),
    initialDirection:d};
}
function analyticVacuumGround(angle,eye,radius,maxDistance){
  if(![angle,eye,radius,maxDistance].every(Number.isFinite)||!(eye>0&&radius>0&&maxDistance>0))
    throw RangeError('Invalid analytic vacuum sphere parameters');
  var b=(radius+eye)*Math.sin(angle),c=eye*(2*radius+eye),disc=b*b-c;
  // At tangent the root has multiplicity two; no negative discriminant can hit.
  if(!(b<0)||disc<0)return {kind:'range',distance:null,discriminant:disc};
  var first=c/(-b+Math.sqrt(disc)); // stable near the near-side sphere root
  if(first>maxDistance)return {kind:'range',distance:null,discriminant:disc};
  return {kind:disc===0?'grazing':'ground',distance:first,discriminant:disc};
}
function rayOptions(config,atmosphere,angle,step,collect){return {
  geometry:'globe',radius:config.model.rEarth,observerHeight:config.model.Height,
  atmosphere:atmosphere,angle:angle,length:MAX_DISTANCE,step:step,
  collect:!!collect,fastClearGround:atmosphere==='standard',
  eventSubsteps:8,contactTolerance:1e-6
};}
function traceRay(config,angle,atmosphere,step,collect){
  var ray=tracer.trace(rayOptions(config,atmosphere,angle,step||STEP,collect));
  return {kind:ray.hitGround?(ray.event.contact==='grazing'?'grazing':'ground'):'range',
    distance:ray.hitGround?ray.travelled:null,termination:ray.termination,
    contact:ray.event&&ray.event.contact||null,
    finalAltitude:ray.height,finalX:ray.x,finalZ:ray.z,
    steps:Math.ceil(ray.travelled/(step||STEP)),points:collect?ray.points:undefined};
}
function samplePixel(config,column,row,atmosphere){
  var ray=pixelRay(config.model,config.snapshot,column,row),
    result=traceRay(config,ray.angleRadians,atmosphere,STEP,false);
  var entry={column:column,row:row,angleRadians:ray.angleRadians,
    azimuthRadians:ray.azimuthRadians,kind:result.kind,
    firstContactMetres:result.distance,termination:result.termination,
    contact:result.contact};
  if(atmosphere==='vacuum'){
    var exact=analyticVacuumGround(ray.angleRadians,config.model.Height,config.model.rEarth,MAX_DISTANCE);
    entry.analytic={kind:exact.kind,firstContactMetres:exact.distance};
    entry.vacuumStatusAgree=(result.kind==='ground'||result.kind==='grazing')===
      (exact.kind==='ground'||exact.kind==='grazing');
    entry.contactErrorMetres=result.distance!==null&&exact.distance!==null?
      Math.abs(result.distance-exact.distance):null;
  }
  return entry;
}
function sampleRow(config,row,atmosphere){
  check(config);
  if(!Number.isInteger(row)||row<0||row>=SIZE||!['vacuum','standard'].includes(atmosphere))
    throw RangeError('Invalid row or atmosphere');
  var out=[];for(var c=0;c<SIZE;c++)out.push(samplePixel(config,c,row,atmosphere));return out;
}
function summary(rows,atmosphere){
  if(rows.length!==SIZE||rows.some(function(row){return row.length!==SIZE;}))throw Error('Incomplete 64x64 frame');
  var counts={ground:0,grazing:0,range:0},analyticDisagreements=0,maxContactErrorMetres=0,
    matchedContacts=0,disagreementExamples=[];
  rows.forEach(function(row){row.forEach(function(p){counts[p.kind]++;
    if(atmosphere==='vacuum'){
      if(!p.vacuumStatusAgree){analyticDisagreements++;if(disagreementExamples.length<20)
        disagreementExamples.push({column:p.column,row:p.row,angleRadians:p.angleRadians,
          numerical:p.kind,analytic:p.analytic.kind});}
      if(p.contactErrorMetres!==null){matchedContacts++;maxContactErrorMetres=Math.max(maxContactErrorMetres,p.contactErrorMetres);}
    }
  });});
  return {counts:counts,total:SIZE*SIZE,analyticDisagreements:atmosphere==='vacuum'?analyticDisagreements:null,
    matchedContacts:atmosphere==='vacuum'?matchedContacts:null,
    maximumContactErrorMetres:atmosphere==='vacuum'?maxContactErrorMetres:null,
    disagreementExamples:disagreementExamples};
}
function horizonSweep(config){
  check(config);
  var eye=config.model.Height,R=config.model.rEarth,
    dip=-Math.acos(R/(R+eye)),n=41,points=[],mismatches=0,maximumDistanceDelta=0,comparedContacts=0;
  for(var i=0;i<n;i++){
    var angle=dip+(i-(n-1)/2)*(.7*Math.PI/180)/(n-1),
      coarse=traceRay(config,angle,'standard',250,false),
      fine=traceRay(config,angle,'standard',100,false),
      same=coarse.kind===fine.kind;
    if(!same)mismatches++;
    var delta=coarse.distance!==null&&fine.distance!==null?
      Math.abs(coarse.distance-fine.distance):null;
    if(delta!==null){maximumDistanceDelta=Math.max(maximumDistanceDelta,delta);comparedContacts++;}
    points.push({angleDegrees:angle*180/Math.PI,coarse:coarse.kind,
      fine:fine.kind,coarseContactMetres:coarse.distance,fineContactMetres:fine.distance,
      contactDisplacementMetres:delta});
  }
  var selected=[0,10,20,30,40].map(function(index){
    var row=points[index],angle=row.angleDegrees*Math.PI/180;
    return {angleDegrees:row.angleDegrees,coarse:row.coarse,fine:row.fine,
      trajectory:traceRay(config,angle,'standard',100,true)};
  });
  return {geometricVacuumHorizonDegrees:dip*180/Math.PI,
    rangeDegrees:[points[0].angleDegrees,points[n-1].angleDegrees],
    coarseStepMetres:250,fineStepMetres:100,
    sameAngleClassificationDisagreements:mismatches,
    comparedContactDistances:comparedContacts,maximumContactDistanceDeltaMetres:maximumDistanceDelta,
    samples:points,trajectories:selected};
}
function report(config,vacuum,standard,sweep){
  check(config);var v=summary(vacuum,'vacuum'),s=summary(standard,'standard');
  return {version:VERSION,kind:'camera-first-f64-first-ground-contact',
    title:'Independent camera-first CPU f64 oracle (ground only)',
    camera:{widthPx:config.snapshot.widthPx,heightPx:config.snapshot.heightPx,
      panDegrees:config.model.Pan,nickDegrees:config.model.Nick,rollDegrees:config.model.Roll,
      diagonalFovRadians:config.model.camViewAngle,
      observerHeightMetres:config.model.Height,radiusMetres:config.model.rEarth,
      pixelTransform:{scaleX:config.snapshot.pixelScaleX,scaleY:config.snapshot.pixelScaleY,
        offsetX:config.snapshot.pixelOffsetX,offsetY:config.snapshot.pixelOffsetY,
        focal:config.snapshot.imagePlaneFocal}},
    rayGrid:{width:SIZE,height:SIZE,maxDistanceMetres:MAX_DISTANCE,stepMetres:STEP,
      perPixelDirection:'Actual Compare A captured physical camera and Canvas projection; sampled at the centre of each 64x64 tile'},
    vacuum:v,standard:s,horizonSweep:sweep,
    samples:{vacuum:vacuum.flat(),standard:standard.flat()},
    limitations:[
      'Ground-only: objects, tower triangles, clouds, texture, and normal production scene painting are NOT tested.',
      'Ray tracing is independent of target shooting, GPU grid interpolation, polygon reconstruction and screen z-buffer, but reuses the physical tracer RK4 kernel and atmosphere model.',
      '3D camera rays are rotated into their 2D radial meridian. This is valid for spherically symmetric ground/atmosphere only.',
      'Range means no certified FIRST ground contact by 30 km, NOT proof of infinite sky visibility or of no later impact.',
      'Grazing classification is tolerance-dependent; a near-tangent discrepancy cannot alone establish a physics bug.',
      'Standard atmosphere convergence compares 250 m versus 100 m steps at the SAME 41 directions; matching coarse/fine is not proof of exact physics.',
      'Vacuum external analytic control is a straight line / sphere intersection independent of RK4.',
      'The 64x64 map is a coarse sampled ground-contact mask, NOT a 64x64 render of actual 3D objects.',
      'No GPU, double-single, new WGSL or primary renderer modifications.'
    ]};
}
function pixelFrame(rows,atmosphere,other){
  if(rows.length!==SIZE||rows.some(function(r){return r.length!==SIZE;}))throw Error('Incomplete frame');
  if(other&&(other.length!==SIZE||other.some(function(r){return r.length!==SIZE;})))
    throw Error('Incomplete comparison');
  var scale=8,width=SIZE*scale,rgba=new Uint8ClampedArray(width*width*4);
  for(var y=0;y<SIZE;y++)for(var x=0;x<SIZE;x++){
    var p=rows[y][x],color;
    if(other){
      var o=other[y][x],hit=(p.kind==='ground'||p.kind==='grazing'),
        otherHit=(o.kind==='ground'||o.kind==='grazing');
      color=hit===otherHit?[45,49,58]:hit?[210,62,73]:[63,131,230];
    }else{
      color=p.kind==='ground'?[51,139,115]:p.kind==='grazing'?[247,170,35]:[45,68,109];
      if(atmosphere==='vacuum'&&!p.vacuumStatusAgree)color=[229,52,62];
    }
    for(var dy=0;dy<scale;dy++)for(var dx=0;dx<scale;dx++){
      var i=((y*scale+dy)*width+x*scale+dx)*4;
      rgba.set([color[0],color[1],color[2],255],i);
    }
  }
  return {width:width,height:width,rgba:rgba};
}
function canvasPng(canvas){
  var uri=canvas.toDataURL('image/png');
  if(!uri.startsWith('data:image/png;base64,'))throw Error('PNG canvas export unavailable');
  var raw=atob(uri.slice('data:image/png;base64,'.length)),out=new Uint8Array(raw.length);
  for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
  return out;
}
function trajectoryPng(config,sweep,doc){
  var canvas=doc.createElement('canvas');canvas.width=900;canvas.height=460;
  var ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas 2D required for trajectory plot');
  var W=canvas.width,H=canvas.height,left=80,right=W-24,top=42,bottom=H-70,
    minZ=-90,maxZ=115,R=config.model.rEarth;
  function X(x){return left+(right-left)*x/MAX_DISTANCE;}
  function Y(z){return bottom-(bottom-top)*(z-minZ)/(maxZ-minZ);}
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#cbd5e1';ctx.lineWidth=1;
  ctx.strokeRect(left,top,right-left,bottom-top);
  ctx.font='14px sans-serif';ctx.fillStyle='#253040';
  ctx.fillText('CPU f64 camera-first · 2D radial meridian trajectories, standard atmosphere',left,25);
  ctx.fillText('Horizontal tangent distance (km)',W/2-105,H-22);
  ctx.fillText('Tangent z (m)',5,30);
  for(var j=0;j<=6;j++){
    var x=j*5000;ctx.fillStyle='#52616d';ctx.fillText(String(x/1000),X(x)-7,bottom+22);
  }
  for(var k=-75;k<=100;k+=25){
    ctx.fillStyle='#52616d';ctx.fillText(String(k),left-40,Y(k)+4);
  }
  // Real globe surface in tangent coordinates, stable against R cancellation.
  ctx.beginPath();ctx.strokeStyle='#246b52';ctx.lineWidth=3;
  for(var t=0;t<=300;t++){
    var d=MAX_DISTANCE*t/300,
      s=-d*d/(R+Math.sqrt(R*R-d*d));
    if(t===0)ctx.moveTo(X(d),Y(s));else ctx.lineTo(X(d),Y(s));
  }
  ctx.stroke();
  var colors=['#a4277e','#bf6c18','#aa2639','#2054bf','#108979'];
  sweep.trajectories.forEach(function(row,index){
    ctx.beginPath();ctx.strokeStyle=colors[index];ctx.lineWidth=2;
    row.trajectory.points.forEach(function(p,i){if(i===0)ctx.moveTo(X(p[0]),Y(p[1]));else ctx.lineTo(X(p[0]),Y(p[1]));});
    ctx.stroke();ctx.fillStyle=colors[index];ctx.fillRect(100+index*155,H-50,12,10);
    ctx.font='12px sans-serif';ctx.fillText(row.angleDegrees.toFixed(3)+'°',116+index*155,H-40);
  });
  ctx.fillStyle='#111';ctx.fillText('z exaggerated; clipped to [-90, 115] m. Earth: green.',left,H-7);
  return canvasPng(canvas);
}
function convergencePng(sweep,doc){
  var canvas=doc.createElement('canvas');canvas.width=900;canvas.height=320;
  var ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas 2D required for convergence plot');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,900,320);ctx.font='15px sans-serif';ctx.fillStyle='#1f2937';
  ctx.fillText('Standard atmosphere · first-ground contact · same-angle RK4 convergence',32,27);
  ctx.font='13px sans-serif';ctx.fillText('250 m RK4',25,104);ctx.fillText('100 m RK4',25,175);
  var left=145,cell=17.6;
  sweep.samples.forEach(function(p,i){
    [p.coarse,p.fine].forEach(function(k,j){
      ctx.fillStyle=k==='ground'?'#338b73':k==='grazing'?'#f7aa23':'#2d446d';
      ctx.fillRect(left+i*cell,72+j*70,cell-2,48);
      if(p.coarse!==p.fine){ctx.strokeStyle='#e33443';ctx.lineWidth=2;
        ctx.strokeRect(left+i*cell,72+j*70,cell-2,48);}
    });
  });
  ctx.fillStyle='#344054';ctx.fillText(sweep.rangeDegrees[0].toFixed(3)+'°',left,235);
  ctx.fillText(sweep.rangeDegrees[1].toFixed(3)+'°',left+35*cell,235);
  ctx.fillText('Turquoise: ground · amber: grazing · navy: no contact by 30 km · red borders: disagreement',32,278);
  return canvasPng(canvas);
}
function entries(config,report,vacuum,standard,doc,visualZip){
  var files=[{name:'camera-first/report.json',data:JSON.stringify(report,null,2)},
    {name:'camera-first/vacuum-ground-mask.png',data:visualZip.png(pixelFrame(vacuum,'vacuum'),doc)},
    {name:'camera-first/standard-ground-mask.png',data:visualZip.png(pixelFrame(standard,'standard'),doc)},
    {name:'camera-first/vacuum-vs-standard.png',data:visualZip.png(pixelFrame(standard,'standard',vacuum),doc)},
    {name:'camera-first/horizon-convergence.png',data:convergencePng(report.horizonSweep,doc)},
    {name:'camera-first/sample-trajectories.png',data:trajectoryPng(config,report.horizonSweep,doc)}],
    readme=[
      'Curvature #140.12.38: independent camera-first CPU f64 ground contact',
      '64x64 camera directions, each enlarged into an 8x8 block (512x512 PNG) with NEAREST-NEIGHBOR.',
      'Turquoise = first Earth ground crossing; amber = tolerance-classified grazing;',
      'navy = no ground hit within fixed 30 km (NOT certified sky); red = vacuum vs analytic hit/miss mismatch.',
      'vacuum-vs-standard.png: red = hit only in standard; blue = hit only in vacuum; gray = same hit/no-contact.',
      'Vacuum reference: independent analytic straight-ray/sphere first contact.',
      'Standard sweep: 41 launch directions around the geometric vacuum horizon, 250 m vs 100 m RK4.',
      'Camera direction is from the physical camera and its captured real Canvas window transform.',
      'Physics: 2D radial ray plane from each 3D pixel direction, valid for spherical symmetry.',
      'Trajectory data include 5 sampled 2D meridian paths around geometric horizon; trajectory PNG has exaggerated z and a CLIPPED -90..115 m vertical range.',
      'This is NOT a complete object renderer or an independent RK4 integrator.',
      'There is no shooting, GPU grid, polygon reconstruction, screen z or WebGPU.',
      'Read report.limitations and do not interpret 30 km range as proof of visibility.',
      ''
    ];
  files.push({name:'camera-first/README.txt',data:readme.join('\n')});
  return files;
}
return Object.freeze({VERSION:VERSION,SIZE:SIZE,MAX_DISTANCE:MAX_DISTANCE,STEP:STEP,
  check:check,pixelRay:pixelRay,analyticVacuumGround:analyticVacuumGround,
  traceRay:traceRay,sampleRow:sampleRow,summary:summary,horizonSweep:horizonSweep,
  report:report,frame:pixelFrame,entries:entries});
}));

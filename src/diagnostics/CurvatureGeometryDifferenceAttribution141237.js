/* #140.12.37: diagnostic-only source-linked geometry / rejected-leaf evidence.
 * Reads the actual optical scene handed to the Canvas painter. Compares
 * angular vertex signatures as a heuristic, NOT geometric-set equality.
 * Optical uncertainty without an arrival angle has no certified pixel site.
 */
(function(root,factory){
  var api=factory(root.CurvaturePerspectivePreview||
    (typeof module==='object'&&module.exports?require('../renderers/CurvaturePerspectivePreview'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGeometryDifferenceAttribution141237=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(perspective){
'use strict';
var VERSION='140.12.37',MAX_REJECTED=500,QUANTUM=2e-6;
function kind(p){var m=p.metadata||{};return m.kind==='physical-object-fill'?'fill':
  m.kind==='physical-object-stroke'?'outline':null;}
function sourceKey(p){var m=p.metadata||{};return String(m.objectLayer||'unknown')+'#'+String(m.opticalSourceIndex);}
function collector(id,variant){
  var scene=null,camera=null,width=0,height=0,rejected=[],rejectedTotal=0,rejectedBySource={};
  return {
    onCamera:function(c,w,h){camera=c;width=w;height=h;},
    onScene:function(s){scene=s;},
    onUnresolved:function(event){
      if(!event||!['outline','fill'].includes(event.phase))throw TypeError('Malformed unresolved leaf');
      rejectedTotal++;
      var key=String(event.objectLayer||'unknown')+'#'+String(event.sourceId),
        phase=event.phase,entry=rejectedBySource[key]||(rejectedBySource[key]={outline:0,fill:0,reasons:{}});
      entry[phase]++;
      entry.reasons[event.reason]=(entry.reasons[event.reason]||0)+1;
      if(rejected.length<MAX_REJECTED)rejected.push({source:key,phase:phase,
        reason:event.reason,depth:event.depth==null?null:event.depth,
        edgeIndex:event.source&&event.source.edgeIndex,
        queries:(event.queries||[]).map(function(q){return {
          distance:q.distance,height:q.height,azimuth:q.azimuth,
          status:q.status,reason:q.reason||null,angle:q.angle,fieldQueried:!!q.fieldQueried,
          world:q.world};})});
    },
    result:function(){
      if(!scene||!camera||!(width>0&&height>0))throw Error('Optical geometry/camera was not captured');
      var objects=scene.primitives.filter(kind).map(function(p){return {
        type:p.type,kind:kind(p),source:sourceKey(p),
        points:p.points.map(function(q){return q.slice();})};});
      return {id:id,variant:variant,width:width,height:height,camera:camera,
        objects:objects,rejected:rejected,rejectedTotal:rejectedTotal,
        rejectedTruncated:rejectedTotal>rejected.length,
        rejectedBySource:rejectedBySource};
    }
  };
}
function signature(p){
  var angles=p.points.map(function(q){var norm=Math.hypot(q[0],q[1],q[2]);
    return Math.round(Math.atan2(q[0],q[1])/QUANTUM)+','+
      Math.round(Math.asin(Math.max(-1,Math.min(1,q[2]/norm)))/QUANTUM);
  }).sort();
  return p.kind+'|'+angles.join('|');
}
function summary(capture){
  var result={},keys=new Map();
  capture.objects.forEach(function(p){
    var group=result[p.source]||(result[p.source]={outline:0,fill:0,signatures:{},rejected:{outline:0,fill:0}});
    group[p.kind]++;
    var s=signature(p);group.signatures[s]=(group.signatures[s]||0)+1;
  });
  Object.keys(capture.rejectedBySource).forEach(function(k){
    var r=result[k]||(result[k]={outline:0,fill:0,signatures:{},rejected:{outline:0,fill:0}});
    r.rejected={outline:capture.rejectedBySource[k].outline,fill:capture.rejectedBySource[k].fill};
  });
  return result;
}
function comparePair(cpu,gpu){
  var a=summary(cpu),b=summary(gpu),all=new Set(Object.keys(a).concat(Object.keys(b)));
  var sources=[],totals={cpuOnlySignatures:0,gpuOnlySignatures:0,
    cpuOutlines:0,gpuOutlines:0,cpuFills:0,gpuFills:0,
    cpuUnresolved:cpu.rejectedTotal,gpuUnresolved:gpu.rejectedTotal};
  all.forEach(function(k){
    var x=a[k]||{outline:0,fill:0,signatures:{},rejected:{outline:0,fill:0}},
      y=b[k]||{outline:0,fill:0,signatures:{},rejected:{outline:0,fill:0}};
    var distinct=new Set(Object.keys(x.signatures).concat(Object.keys(y.signatures))),cpuOnly=0,gpuOnly=0;
    distinct.forEach(function(sig){var u=x.signatures[sig]||0,v=y.signatures[sig]||0;
      cpuOnly+=Math.max(0,u-v);gpuOnly+=Math.max(0,v-u);});
    totals.cpuOutlines+=x.outline;totals.gpuOutlines+=y.outline;
    totals.cpuFills+=x.fill;totals.gpuFills+=y.fill;
    totals.cpuOnlySignatures+=cpuOnly;totals.gpuOnlySignatures+=gpuOnly;
    sources.push({source:k,cpuOutlines:x.outline,gpuOutlines:y.outline,
      cpuFills:x.fill,gpuFills:y.fill,cpuUnresolved:x.rejected,
      gpuUnresolved:y.rejected,cpuOnlyAngularSignatures:cpuOnly,
      gpuOnlyAngularSignatures:gpuOnly});
  });
  sources.sort(function(x,y){return y.cpuOnlyAngularSignatures+y.gpuOnlyAngularSignatures-
    x.cpuOnlyAngularSignatures-x.gpuOnlyAngularSignatures||x.source.localeCompare(y.source);});
  return {totals:totals,bySource:sources,mostDivergentSources:sources.slice(0,20)};
}
function footprints(capture){
  var result={};projected(capture).forEach(function(segment){
    var p=result[segment.source]||(result[segment.source]={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});
    segment.points.forEach(function(pt){p.minX=Math.min(p.minX,pt[0]);
      p.maxX=Math.max(p.maxX,pt[0]);p.minY=Math.min(p.minY,pt[1]);
      p.maxY=Math.max(p.maxY,pt[1]);});
  });return result;
}
function spatialize(comparison,cpu,candidate,sourceBoxes,targetBoxes,tiles){
  comparison.bySource.forEach(function(item){
    var left=sourceBoxes[item.source]||null,right=targetBoxes[item.source]||null;
    item.screenFootprint={cpu:left,gpu:right};
    var b=left&&right?{minX:Math.min(left.minX,right.minX),
      maxX:Math.max(left.maxX,right.maxX),minY:Math.min(left.minY,right.minY),
      maxY:Math.max(left.maxY,right.maxY)}:left||right;
    item.intersectedHotTiles=b?tiles.filter(function(t){
      if(!t.significantPixels)return false;
      var x0=t.column*cpu.width/4,x1=(t.column+1)*cpu.width/4,
        y0=t.row*cpu.height/3,y1=(t.row+1)*cpu.height/3;
      return b.maxX>=x0&&b.minX<=x1&&b.maxY>=y0&&b.minY<=y1;
    }).map(function(t){return {column:t.column,row:t.row,
      significantPixelsInWholeTile:t.significantPixels};}):[];
  });
  return comparison;
}
function compareAll(captures,pixelCases){
  if(!Array.isArray(captures)||captures.length!==4||!Array.isArray(pixelCases)||pixelCases.length!==4)
    throw TypeError('Four same-camera geometry and pixel comparisons required');
  var cases=captures.map(function(item,i){
    if(item.id!==pixelCases[i].id||!item.variants||!item.variants.cpu)
      throw Error('Unaligned CPU geometry and pixel camera');
    var v=item.variants,cpu=v.cpu;
    for(var name of ['baseline','strict','strictDirect']){
      if(!v[name]||v[name].width!==cpu.width||v[name].height!==cpu.height)
        throw Error('Incomplete / mismatched candidate geometry');
    }
    var footprintsByMode={};['cpu','baseline','strict','strictDirect'].forEach(function(mode){
      footprintsByMode[mode]=footprints(v[mode]);
    });
    var comparisons={};['baseline','strict','strictDirect'].forEach(function(mode){
      comparisons[mode]=spatialize(comparePair(cpu,v[mode]),cpu,v[mode],
        footprintsByMode.cpu,footprintsByMode[mode],pixelCases[i].variants[mode].pixelDiff.tiles);
    });
    return {id:item.id,pixelHotspots:{baseline:pixelCases[i].variants.baseline.pixelDiff.tiles,
      strictDirect:pixelCases[i].variants.strictDirect.pixelDiff.tiles},
      comparisons:comparisons,
      rejectedCaptures:Object.fromEntries(['cpu','baseline','strict','strictDirect'].map(function(k){
        return [k,{total:v[k].rejectedTotal,exported:v[k].rejected.length,
          truncated:v[k].rejectedTruncated,perSource:v[k].rejectedBySource}];}))};
  });
  return {version:VERSION,kind:'Optical source-linked geometry difference attribution',
    scope:'Actual projected optical outlines and qualified fill triangles before Canvas painting',
    comparisonQuantumRadians:QUANTUM,cases:cases,
    limitations:[
      'Angular vertex signatures quantized at 2e-6 rad are heuristic matches, not triangle intersection, topological equivalence, or exact pixel coverage.',
      'A CPU-only signature can be a slightly moved/subdivided triangle, not necessarily an absent surface; compare overlay PNGs and per-source counts.',
      'Rejected-leaf coordinates are real field queries. Indeterminate rays usually have NO arrival angle, hence no certified screen pixel for an unresolved triangle.',
      'Projected edge diagrams show pre-painter line segments / fill triangle edges; painter ordering, stroke widths, and occlusion may differ.',
      'Sampled rejected leaves are capped at 500 per render; total and per-source reason counts are not capped.',
      'Per-source screen footprints are BOUNDING BOXES of visible projected edges, not masks. Hot-tile intersections are correlations, not error attribution or additive counts.',
      'CPU and GPU geometries share source indices, not individual adaptive triangle IDs. Source counts are not independent causal attribution.',
      'No GPU numerical algorithm or production rendering path was modified.'
    ]};
}
function projected(capture){
  if(!perspective)throw Error('Perspective module missing');
  // The diagnostic projection exposes edges of fills; the physical painter
  // uses mode=2 for fills, which intentionally does not emit these as strokes.
  var origins=[],primitives=capture.objects.map(function(p,i){
    origins.push({source:p.source,kind:p.kind});
    return {type:p.type,mode:p.type==='polygon'?5:1,points:p.points,commandIndex:i};
  });
  var view=perspective.project({primitives:primitives,metadata:{}},capture.camera,
    capture.width,capture.height);
  return view.segments.map(function(s){return {kind:origins[s.commandIndex].kind,
    source:origins[s.commandIndex].source,points:s.points};});
}
function renderEdges(a,b,doc,visualZip){
  if(a.width!==b.width||a.height!==b.height)throw Error('Geometry camera mismatch');
  var canvas=doc.createElement('canvas');canvas.width=a.width;canvas.height=a.height;
  var ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas 2D required');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,a.width,a.height);
  function paint(capture,color){
    var segments=projected(capture);
    ctx.strokeStyle=color;ctx.lineWidth=0.75;
    ctx.globalAlpha=0.52;
    segments.forEach(function(s){ctx.beginPath();ctx.moveTo(s.points[0][0],s.points[0][1]);
      ctx.lineTo(s.points[1][0],s.points[1][1]);ctx.stroke();});
    ctx.globalAlpha=1;
  }
  paint(a,'#e83b34');paint(b,'#165dff');
  // Canvas-backed PNG is an independent geometry projection, not RGBA diff.
  var url=canvas.toDataURL('image/png');
  if(!url.startsWith('data:image/png;base64,'))throw Error('Geometry PNG unavailable');
  var binary=atob(url.slice('data:image/png;base64,'.length)),bytes=new Uint8Array(binary.length);
  for(var i=0;i<bytes.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}
function entries(captures,doc){
  var files=[],readme=[
    'Curvature #140.12.37: optical source-linked geometry attribution',
    'Red: CPU f64 projected outline/triangle edges; blue: GPU projected edges.',
    'Where overdrawn, both colors may blend. This is NOT a pixel difference image.',
    'All reported source IDs are authored opticalSourceIndex and objectLayer.',
    'Rejected-leaf query coordinates are physical ray d/h, not proven screen pixels.',
    'Triangle-edge projections ignore fill painting and painter z-order.',
    'Compare the existing visual difference PNGs alongside these diagrams.',
    ''
  ];
  captures.forEach(function(item){
    var v=item.variants;
    files.push({name:'geometry/'+item.id+'/cpu-vs-baseline-edges.png',
      data:renderEdges(v.cpu,v.baseline,doc)});
    files.push({name:'geometry/'+item.id+'/cpu-vs-strictDirect-edges.png',
      data:renderEdges(v.cpu,v.strictDirect,doc)});
    var sampled={id:item.id,variants:{}};
    ['cpu','baseline','strict','strictDirect'].forEach(function(k){
      sampled.variants[k]={rejectedTotal:v[k].rejectedTotal,
        rejectedTruncated:v[k].rejectedTruncated,rejectedQueries:v[k].rejected};
    });
    files.push({name:'geometry/'+item.id+'/unresolved-queries.json',data:JSON.stringify(sampled,null,2)});
  });
  files.push({name:'geometry/README.txt',data:readme.join('\n')});return files;
}
return Object.freeze({VERSION:VERSION,collector:collector,signature:signature,
  comparePair:comparePair,compareAll:compareAll,projected:projected,entries:entries});
}));

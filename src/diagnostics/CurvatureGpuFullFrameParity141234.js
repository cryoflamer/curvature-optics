/* #140.12.34: REAL, independently painted CPU / GPU-predictor Canvas parity.
 * This measures RGBA frames, not the 48-ray DS shooting positions. The current
 * GPU-first painter consumes an interpolated f32 predictor field (NOT DS).
 * Edge/painted-background metrics are visual proxies, not semantic sky/ground.
 * No optical oracle data from A enters B and no production backend changes.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGpuFullFrameParity141234=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var VERSION='140.12.34',CHANNEL_TOLERANCE=8,EDGE_TOLERANCE=3,EDGE_CONTRAST=32;
  function canvasCapture(canvas){
    if(!canvas||!Number.isInteger(canvas.width)||!Number.isInteger(canvas.height)||
       canvas.width<2||canvas.height<2||typeof canvas.getContext!=='function')
      throw RangeError('Actual readable Canvas with nonzero backing dimensions required');
    var ctx=canvas.getContext('2d');
    if(!ctx||typeof ctx.getImageData!=='function')throw Error('Canvas 2D readback unavailable');
    var bytes=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    if(bytes.length!==canvas.width*canvas.height*4)throw Error('Truncated Canvas readback');
    return {width:canvas.width,height:canvas.height,rgba:new Uint8ClampedArray(bytes)};
  }
  function validFrame(frame){
    if(!frame||!Number.isInteger(frame.width)||!Number.isInteger(frame.height)||
       frame.width<2||frame.height<2||!frame.rgba||frame.rgba.length!==frame.width*frame.height*4)
      throw TypeError('Invalid RGBA Canvas snapshot');
  }
  function pixels(frame){return frame.width*frame.height;}
  function channel(v,k,c){var alpha=v[k+3]/255;return 255*(1-alpha)+alpha*v[k+c];}
  function intensity(v,k){
    var alpha=v[k+3]/255;
    return 255*(1-alpha)+alpha*(v[k]*.2126+v[k+1]*.7152+v[k+2]*.0722);
  }
  // Visually nonwhite, not the physical sky/terrain object classification.
  function painted(v,k){
    var alpha=v[k+3]/255;
    return (255-Math.min(v[k],v[k+1],v[k+2]))*alpha>CHANNEL_TOLERANCE;
  }
  function luminanceEdges(frame,y0,y1){
    var w=frame.width,h=frame.height,data=frame.rgba,columns=[];
    for(var x=0;x<w;x++){
      var edges=[];
      for(var y=Math.max(1,y0);y<Math.min(h-1,y1);y++){
        var below=(y*w+x)*4,above=((y-1)*w+x)*4;
        if(Math.abs(intensity(data,below)-intensity(data,above))>=EDGE_CONTRAST)edges.push(y);
      }
      columns.push(edges);
    }
    return columns;
  }
  function boundaryProxy(a,b,start,end){
    var aa=luminanceEdges(a,start,end),bb=luminanceEdges(b,start,end),matched=0,
      refCount=0,candCount=0,offsets=[],unmatchedColumns=0,comparedColumns=0;
    for(var x=0;x<a.width;x++){
      var lhs=aa[x],rhs=bb[x];refCount+=lhs.length;candCount+=rhs.length;
      if(!lhs.length&&!rhs.length)continue;
      comparedColumns++;
      var columnMatched=0;
      lhs.forEach(function(y){
        var best=Infinity,signed=0;
        rhs.forEach(function(yy){if(Math.abs(yy-y)<best){best=Math.abs(yy-y);signed=yy-y;}});
        if(best<=EDGE_TOLERANCE){matched++;columnMatched++;offsets.push(signed);}
      });
      if(columnMatched!==lhs.length||!rhs.length)unmatchedColumns++;
    }
    var meanAbsolute=offsets.length?offsets.reduce(function(sum,d){return sum+Math.abs(d);},0)/offsets.length:null;
    return {bandRows:[start,end],referenceEdges:refCount,candidateEdges:candCount,
      referenceMatchedWithin3px:matched,referenceUnmatched:refCount-matched,
      columnsWithEdges:comparedColumns,columnsWithUnmatchedReferenceEdge:unmatchedColumns,
      meanAbsoluteMatchedEdgeOffsetPx:meanAbsolute,
      maxAbsoluteMatchedEdgeOffsetPx:offsets.length?Math.max.apply(null,offsets.map(Math.abs)):null,
      meaning:'Strong vertical-luminance transitions near zero-elevation row; NOT a certified Earth horizon or terrain boundary'};
  }
  function analyze(a,b,options){
    validFrame(a);validFrame(b);
    if(a.width!==b.width||a.height!==b.height)throw RangeError('CPU and GPU frames differ in backing dimensions');
    options=options||{};
    var w=a.width,h=a.height,n=pixels(a),ref=a.rgba,cand=b.rgba,
      center=options.zeroElevationRowPx;
    if(!Number.isFinite(center))throw RangeError('Finite actual-camera zero elevation row required');
    var bandRadius=Math.max(16,Math.round(h*.15)),bandStart=Math.max(0,Math.floor(center-bandRadius)),
      bandEnd=Math.min(h,Math.ceil(center+bandRadius));
    var bandValid=bandEnd>bandStart;
    var exact=0,significant=0,channelSum=0,maxDelta=0,maxRawDelta=0,
      refOnlyPainted=0,candidateOnlyPainted=0,bothPainted=0,bothBackground=0,
      bandSignificant=0,bandPixels=0,lowerRightSignificant=0,lowerRightPixels=0,
      rows=new Uint32Array(h),columns=new Uint32Array(w),tiles=[];
    for(var i=0;i<12;i++)tiles.push({column:i%4,row:Math.floor(i/4),significantPixels:0,pixels:0});
    for(var y=0;y<h;y++)for(var x=0;x<w;x++){
      var k=(y*w+x)*4,delta=0,absolute=0;
      for(var c=0;c<4;c++){
        var raw=Math.abs(ref[k+c]-cand[k+c]);maxRawDelta=Math.max(maxRawDelta,raw);
        if(c<3){var d=Math.abs(channel(ref,k,c)-channel(cand,k,c));
          delta=Math.max(delta,d);absolute+=d;}
      }
      channelSum+=absolute;maxDelta=Math.max(maxDelta,delta);
      if(ref[k]===cand[k]&&ref[k+1]===cand[k+1]&&
         ref[k+2]===cand[k+2]&&ref[k+3]===cand[k+3])exact++;
      var tile=tiles[Math.min(2,Math.floor(y*3/h))*4+Math.min(3,Math.floor(x*4/w))];tile.pixels++;
      if(delta>CHANNEL_TOLERANCE){
        significant++;rows[y]++;columns[x]++;tile.significantPixels++;
        if(bandValid&&y>=bandStart&&y<bandEnd)bandSignificant++;
        if(x>=Math.floor(w*.55)&&y>=Math.floor(h*.55))lowerRightSignificant++;
      }
      if(bandValid&&y>=bandStart&&y<bandEnd)bandPixels++;
      if(x>=Math.floor(w*.55)&&y>=Math.floor(h*.55))lowerRightPixels++;
      var p=painted(ref,k),q=painted(cand,k);
      if(p&&q)bothPainted++;
      else if(p)refOnlyPainted++;
      else if(q)candidateOnlyPainted++;
      else bothBackground++;
    }
    var worstColumns=Array.from(columns).map(function(count,index){return {x:index,significantPixels:count};})
      .sort(function(x,y){return y.significantPixels-x.significantPixels||x.x-y.x;}).slice(0,10);
    var worstRows=Array.from(rows).map(function(count,index){return {y:index,significantPixels:count};})
      .sort(function(x,y){return y.significantPixels-x.significantPixels||x.y-y.y;}).slice(0,10);
    return {width:w,height:h,totalPixels:n,exactRgbaPixels:exact,
      changedRgbaPixels:n-exact,significantPixels:significant,
      significantFraction:significant/n,rgbMeanAbsoluteChannelDelta:channelSum/(n*3),
      maxCompositedChannelDelta:maxDelta,maxRawRgbaChannelDelta:maxRawDelta,
      significantThresholdWhiteCompositedRgb:CHANNEL_TOLERANCE,
      coverageProxy:{referenceOnlyPainted:refOnlyPainted,candidateOnlyPainted:candidateOnlyPainted,
        bothPainted:bothPainted,bothBackground:bothBackground,
        meaning:'Visible painted-vs-white occupancy; NOT semantic sky/ground'},
      eyeLevelBand:{centerRowPx:center,rowStart:bandValid?bandStart:null,rowEnd:bandValid?bandEnd:null,
        pixels:bandPixels,significantPixels:bandSignificant,
        edgeProxy:bandValid?boundaryProxy(a,b,bandStart,bandEnd):null,
        meaning:'±15% frame-height around camera zero-elevation; not an extracted physical horizon'},
      lowerRight45pct:{pixels:lowerRightPixels,significantPixels:lowerRightSignificant},
      worstColumns:worstColumns,worstRows:worstRows,tiles:tiles};
  }
  function diffHeatmap(a,b){
    validFrame(a);validFrame(b);
    if(a.width!==b.width||a.height!==b.height)throw RangeError('Frame sizes differ');
    var rgba=new Uint8ClampedArray(a.rgba.length);
    for(var k=0;k<rgba.length;k+=4){
      var ref=a.rgba,cand=b.rgba,delta=0;
      for(var j=0;j<3;j++)delta=Math.max(delta,Math.abs(channel(ref,k,j)-channel(cand,k,j)));
      var px=painted(ref,k),py=painted(cand,k);
      var color=delta<=CHANNEL_TOLERANCE?[242,246,249]:px!==py?[140,45,192]:[225,65,60];
      rgba[k]=color[0];rgba[k+1]=color[1];rgba[k+2]=color[2];rgba[k+3]=255;
    }
    return {width:a.width,height:a.height,rgba:rgba};
  }
  function report(cases,metadata){
    if(!Array.isArray(cases)||cases.length!==4||cases.some(function(c){return !c||!c.pixelDiff||!c.camera;}))
      throw RangeError('Four measured camera cases required');
    return {version:VERSION,kind:'real Canvas full-frame CPU f64 vs GPU f32 predictor pixel parity audit',
      actualRenderedImageCompared:true,fullFramePixelDifferencesMeasured:true,
      gpuAlgorithm:'f32 RK4 predictor, 500m integration step; interpolated scene-derived grid',
      gpuDoubleSingleShootingUsed:false,dsFullFrameParityEstablished:false,
      independentCpuReference:true,productionAuthorized:false,cases:cases,setup:metadata,
      limitations:[
        'GPU runs optical predictor samples; CPU Canvas 2D paints the interpolated GPU field, not GPU rasterization',
        'This is NOT a double-single GPU shooting frame. 140.12.32/33 DS results remain isolated ray diagnostics',
        'Background/painted and strong-contrast edges are raster proxies, not a certified sky/ground segmentation',
        'Zero-elevation ROI can miss the refracted horizon; compare edge proxy does not identify unique horizon',
        'Significant diffs compare white-composited RGB (>8/255); exact RGBA is reported separately, including invisible transparent color differences',
        'Pixel diffs include interpolation error, numerical shooting error, painter behavior and anti-aliasing',
        'Same scene/model and camera, four real redraws. One GPU field is reused across camera cases',
        'No automatic production acceptance or visual-equivalence certification']};
  }
  return Object.freeze({VERSION:VERSION,canvasCapture:canvasCapture,analyze:analyze,diffHeatmap:diffHeatmap,report:report});
}));

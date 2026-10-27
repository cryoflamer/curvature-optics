/* Diagnostic comparison of foreground geometry, independent of RGB styling. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CurvaturePixelComparison=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function compare(reference,candidate,width,height,threshold){
 if(!reference||!candidate||reference.length!==width*height*4||candidate.length!==reference.length)throw Error('RGBA dimensions mismatch');
 threshold=threshold==null?45:threshold;
 var map=new Uint8ClampedArray(reference.length),counts={referenceForeground:0,candidateForeground:0,both:0,referenceOnly:0,candidateOnly:0,neither:0};
 function fg(p,i){return p[i+3]>16&&Math.max(255-p[i],255-p[i+1],255-p[i+2])>=threshold;}
 for(var i=0;i<reference.length;i+=4){var a=fg(reference,i),b=fg(candidate,i),key=a?(b?'both':'referenceOnly'):(b?'candidateOnly':'neither');counts[key]++;if(a)counts.referenceForeground++;if(b)counts.candidateForeground++;
 var color=key==='both'?[50,130,80]:key==='referenceOnly'?[220,55,55]:key==='candidateOnly'?[45,95,230]:[255,255,255];map.set([...color,255],i);}
 counts.intersectionOverUnion=counts.both/(counts.both+counts.referenceOnly+counts.candidateOnly||1);
 return {rgba:map,statistics:Object.assign(counts,{width,height,threshold,referenceMeaning:'dark pixels in legacy Canvas',candidateMeaning:'dark pixels in independent combined preview',caveats:['Only comparable when camera framing and viewport dimensions match','Dark-pixel threshold ignores stroke style but does not normalize thickness or antialiasing','Green: overlap; red: legacy only; blue: independent only']})};
}
function compareEdges(a,b,w,h,options){
 if(!a||!b||a.length!==w*h*4||b.length!==a.length)throw Error('RGBA dimensions mismatch');
 options=options||{};var threshold=options.threshold??55,tolerance=options.tolerance??2,inset=options.inset??8,top=options.top??Math.max(inset,Math.round(h*.09)),bottom=options.bottom??Math.max(inset,Math.round(h*.06));
 var n=w*h,ref=new Uint8Array(n),cand=new Uint8Array(n),roi=new Uint8Array(n);
 function luminance(src,k){var alpha=src[k+3]/255,light=(src[k]*77+src[k+1]*150+src[k+2]*29)/256;return 255*(1-alpha)+light*alpha;}
 function edge(src,out){for(var y=Math.max(1,top);y<h-Math.max(1,bottom);y++)for(var x=Math.max(1,inset);x<w-Math.max(1,inset);x++){var p=y*w+x,k=p*4;roi[p]=1;var v=luminance(src,k);var kr=k+4,kd=k+w*4;var vr=luminance(src,kr),vd=luminance(src,kd);if(Math.max(Math.abs(v-vr),Math.abs(v-vd))>=threshold)out[p]=1;}}
 edge(a,ref);edge(b,cand);
 function matched(mask,p){var x=p%w,y=Math.floor(p/w);for(var dy=-tolerance;dy<=tolerance;dy++)for(var dx=-tolerance;dx<=tolerance;dx++){if(dx*dx+dy*dy>tolerance*tolerance)continue;var xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[yy*w+xx])return true;}return false;}
 var rgba=new Uint8ClampedArray(n*4),stats={width:w,height:h,threshold,tolerance,roi:{left:inset,right:inset,top,bottom},roiPixels:0,referenceEdges:0,candidateEdges:0,referenceMatched:0,candidateMatched:0,referenceUnmatched:0,candidateUnmatched:0};
 for(var p=0;p<n;p++){var color=[245,245,245];if(roi[p]){stats.roiPixels++;var ra=!!ref[p],cb=!!cand[p],rm=ra&&matched(cand,p),cm=cb&&matched(ref,p);if(ra){stats.referenceEdges++;stats[rm?'referenceMatched':'referenceUnmatched']++;}if(cb){stats.candidateEdges++;stats[cm?'candidateMatched':'candidateUnmatched']++;}color=ra&&cb?[45,130,75]:ra?(rm?[90,175,110]:[225,55,55]):cb?(cm?[90,175,110]:[45,95,230]):[255,255,255];}rgba.set([...color,255],p*4);}
 stats.referenceRecall=stats.referenceMatched/(stats.referenceEdges||1);stats.candidatePrecision=stats.candidateMatched/(stats.candidateEdges||1);stats.f1=stats.referenceRecall+stats.candidatePrecision?2*stats.referenceRecall*stats.candidatePrecision/(stats.referenceRecall+stats.candidatePrecision):0;
 stats.alphaNormalization='RGBA composited over white before luminance edges';stats.caveats=['Local edges only; not a proof of geometry or depth equivalence','ROI suppresses some annotations, not all','Tolerance matches nearby edges regardless of color'];return {rgba,statistics:stats};
}
function compareRgba(reference,candidate,width,height){
 if(!reference||!candidate||reference.length!==width*height*4||reference.length!==candidate.length)throw Error('RGBA dimensions mismatch');
 var count=width*height,exact=0,alphaExact=0,alphaAbs=0,rgbAbs=0,compositedAbs=0;
 for(var i=0;i<reference.length;i+=4){
  var ra=reference[i+3]/255,ca=candidate[i+3]/255;
  if(reference[i+3]===candidate[i+3])alphaExact++;
  alphaAbs+=Math.abs(reference[i+3]-candidate[i+3]);
  var match=true;for(var j=0;j<4;j++)if(reference[i+j]!==candidate[i+j])match=false;
  if(match)exact++;
  for(var j=0;j<3;j++){
   rgbAbs+=Math.abs(reference[i+j]-candidate[i+j]);
   compositedAbs+=Math.abs(255*(1-ra)+reference[i+j]*ra-(255*(1-ca)+candidate[i+j]*ca));
  }
 }
 return {width,height,pixels:count,exactRgbaPixels:exact,exactRgbaFraction:exact/count,exactAlphaPixels:alphaExact,alphaMae:alphaAbs/count,rgbMae:rgbAbs/(count*3),compositedWhiteRgbMae:compositedAbs/(count*3),caveats:['RGB values of transparent pixels are implementation-dependent; compare compositedWhiteRgbMae for displayed colors','Antialiasing, clipping and painter-order versus depth-test can still differ']};
}
function localizeUnmatchedEdges(edgeRgba,candidate,width,height,columns,rows){
 if(!edgeRgba||!candidate||edgeRgba.length!==width*height*4||candidate.length!==edgeRgba.length)throw Error('RGBA dimensions mismatch');
 columns=columns||4;rows=rows||3;
 if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1)throw Error('Invalid tile grid');
 var tiles=[];for(var ty=0;ty<rows;ty++)for(var tx=0;tx<columns;tx++)tiles.push({column:tx,row:ty,x0:Math.floor(tx*width/columns),y0:Math.floor(ty*height/rows),x1:Math.floor((tx+1)*width/columns),y1:Math.floor((ty+1)*height/rows),unmatchedCandidateEdges:0,strokeNearby:0,fillNearby:0,unclassified:0});
 var total=0,stroke=0,fill=0,other=0;
 function kind(x,y){var off=(y*width+x)*4;var r=candidate[off],g=candidate[off+1],b=candidate[off+2];if(r===48&&g===67&&b===90)return 1;if(r===168&&g===184&&b===199)return 2;return 0;}
 for(var y=0;y<height;y++)for(var x=0;x<width;x++){
  var i=(y*width+x)*4;
  if(edgeRgba[i]!==45||edgeRgba[i+1]!==95||edgeRgba[i+2]!==230)continue;
  var tile=tiles[Math.min(rows-1,Math.floor(y*rows/height))*columns+Math.min(columns-1,Math.floor(x*columns/width))];tile.unmatchedCandidateEdges++;total++;
  var classification=kind(x,y);
  if(!classification)for(var dy=-1;dy<=1&&!classification;dy++)for(var dx=-1;dx<=1&&!classification;dx++)if(x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height)classification=kind(x+dx,y+dy);
  if(classification===1){tile.strokeNearby++;stroke++;}else if(classification===2){tile.fillNearby++;fill++;}else{tile.unclassified++;other++;}
 }
 return {columns,rows,totalUnmatchedCandidateEdges:total,strokeNearby:stroke,fillNearby:fill,unclassified:other,tiles:tiles,classification:'Unmatched candidate edge pixels are identified by blue edge-diff color; candidate raster colors are inspected within one pixel',caveats:['Approximate pixel-color attribution, not primitive-level provenance','Stroke takes precedence when nearby fill and stroke pixels coexist','Edge pixels outside the diagnostic ROI are excluded','No inference about depth ordering or correctness']};
}
return {compare,compareEdges,compareRgba,localizeUnmatchedEdges};
});

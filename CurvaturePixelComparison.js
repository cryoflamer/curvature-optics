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
 function edge(src,out){for(var y=Math.max(1,top);y<h-Math.max(1,bottom);y++)for(var x=Math.max(1,inset);x<w-Math.max(1,inset);x++){var p=y*w+x,k=p*4;roi[p]=1;var v=(src[k]*77+src[k+1]*150+src[k+2]*29)/256;var kr=k+4,kd=k+w*4;var vr=(src[kr]*77+src[kr+1]*150+src[kr+2]*29)/256,vd=(src[kd]*77+src[kd+1]*150+src[kd+2]*29)/256;if(Math.max(Math.abs(v-vr),Math.abs(v-vd))>=threshold)out[p]=1;}}
 edge(a,ref);edge(b,cand);
 function matched(mask,p){var x=p%w,y=Math.floor(p/w);for(var dy=-tolerance;dy<=tolerance;dy++)for(var dx=-tolerance;dx<=tolerance;dx++){if(dx*dx+dy*dy>tolerance*tolerance)continue;var xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[yy*w+xx])return true;}return false;}
 var rgba=new Uint8ClampedArray(n*4),stats={width:w,height:h,threshold,tolerance,roi:{left:inset,right:inset,top,bottom},roiPixels:0,referenceEdges:0,candidateEdges:0,referenceMatched:0,candidateMatched:0,referenceUnmatched:0,candidateUnmatched:0};
 for(var p=0;p<n;p++){var color=[245,245,245];if(roi[p]){stats.roiPixels++;var ra=!!ref[p],cb=!!cand[p],rm=ra&&matched(cand,p),cm=cb&&matched(ref,p);if(ra){stats.referenceEdges++;stats[rm?'referenceMatched':'referenceUnmatched']++;}if(cb){stats.candidateEdges++;stats[cm?'candidateMatched':'candidateUnmatched']++;}color=ra&&cb?[45,130,75]:ra?(rm?[90,175,110]:[225,55,55]):cb?(cm?[90,175,110]:[45,95,230]):[255,255,255];}rgba.set([...color,255],p*4);}
 stats.referenceRecall=stats.referenceMatched/(stats.referenceEdges||1);stats.candidatePrecision=stats.candidateMatched/(stats.candidateEdges||1);stats.f1=stats.referenceRecall+stats.candidatePrecision?2*stats.referenceRecall*stats.candidatePrecision/(stats.referenceRecall+stats.candidatePrecision):0;
 stats.caveats=['Local edges only; not a proof of geometry or depth equivalence','ROI suppresses some annotations, not all','Tolerance matches nearby edges regardless of color'];return {rgba,statistics:stats};
}
return {compare,compareEdges};
});

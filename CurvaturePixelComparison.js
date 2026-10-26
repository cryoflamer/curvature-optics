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
return {compare};
});

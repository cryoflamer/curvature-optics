/* Foreground parity after explicitly excluding known, non-geometric legacy
 * decorations. Source images are untouched; unmasked full metrics are reported
 * alongside this supplementary geometry-focused measurement.
 */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CurvatureRegionComparison=api;}(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function compare(reference,candidate,width,height,rects,threshold){
  if(!Number.isInteger(width)||width<=0||!Number.isInteger(height)||height<=0||
    !reference||!candidate||reference.length!==width*height*4||candidate.length!==reference.length)
   throw new RangeError('Matching RGBA frames required');
  if(!Array.isArray(rects))throw new TypeError('Exclusion rectangles required');
  threshold=threshold==null?45:threshold;
  var excluded=new Uint8Array(width*height);
  rects.forEach(function(rect){
   if(!rect||![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||rect.width<0||rect.height<0)
    throw new RangeError('Finite positive exclusion rectangles required');
   var x0=Math.max(0,Math.floor(rect.x)),x1=Math.min(width,Math.ceil(rect.x+rect.width)),
       y0=Math.max(0,Math.floor(rect.y)),y1=Math.min(height,Math.ceil(rect.y+rect.height));
   for(var y=y0;y<y1;y++)for(var x=x0;x<x1;x++)excluded[y*width+x]=1;
  });
  var counts={referenceForeground:0,candidateForeground:0,both:0,referenceOnly:0,candidateOnly:0,
    comparedPixels:0,excludedPixels:0};
  function dark(buf,k){return buf[k+3]>16&&255-Math.min(buf[k],buf[k+1],buf[k+2])>=threshold;}
  for(var i=0;i<excluded.length;i++){
   if(excluded[i]){counts.excludedPixels++;continue;}
   counts.comparedPixels++;
   var a=dark(reference,i*4),b=dark(candidate,i*4);
   if(a)counts.referenceForeground++;
   if(b)counts.candidateForeground++;
   if(a&&b)counts.both++;
   else if(a)counts.referenceOnly++;
   else if(b)counts.candidateOnly++;
  }
  counts.intersectionOverUnion=counts.both/(counts.both+counts.referenceOnly+counts.candidateOnly||1);
  return Object.assign(counts,{width:width,height:height,threshold:threshold,
   exclusions:rects.map(function(r){return {kind:r.kind||'decorative',x:r.x,y:r.y,width:r.width,height:r.height};}),
   caveats:['This is a supplemental masked metric, not full-frame parity',
     'Exclusions suppress annotated rectangles in both frames, even if physical geometry intersects them',
     'The same dark-pixel threshold is used as for the unmasked IoU']});
 }
 return {compare:compare};
}));

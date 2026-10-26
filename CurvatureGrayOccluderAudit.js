/* Diagnose reference gray regions against independently triangulated fill coverage. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CurvatureGrayOccluderAudit=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function analyze(original,owner,triangles,width,height){
 if(!original||original.length!==width*height*4||!owner||owner.length!==width*height)throw TypeError('Mismatched pixel buffers');
 var rgba=new Uint8ClampedArray(original.length),gray=0,covered=0,uncovered=0,bounds=[width,height,-1,-1],commands=new Map(),rows=new Array(height).fill(0);
 for(var y=0;y<height;y++)for(var x=0;x<width;x++){
  var i=y*width+x,o=i*4,r=original[o],g=original[o+1],b=original[o+2],a=original[o+3];
  // Neutral mid-gray reference regions; exclude black sky, white ground, tan objects and blue grid.
  var isGray=a>=250&&r>=85&&r<=190&&Math.max(r,g,b)-Math.min(r,g,b)<=8;
  rgba[o+3]=255;
  if(!isGray){rgba[o]=rgba[o+1]=rgba[o+2]=255;continue;}
  gray++;rows[y]++;bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);
  var index=owner[i];if(index>=0){covered++;rgba[o]=30;rgba[o+1]=160;rgba[o+2]=80;var t=triangles[index];if(t){var key=String(t.commandIndex);commands.set(key,(commands.get(key)||0)+1);}}
  else{uncovered++;rgba[o]=220;rgba[o+1]=45;rgba[o+2]=45;}
 }
 var top=Array.from(commands,([commandIndex,pixels])=>({commandIndex:Number(commandIndex),pixels})).sort((a,b)=>b.pixels-a.pixels).slice(0,15);
 return {rgba,statistics:{method:'Neutral reference pixels (RGB channels within 8, values 85..190) versus ear-clipped depth owner; not proof of occlusion semantics',referenceGrayPixels:gray,coveredByIndependentFill:covered,missingIndependentFill:uncovered,coverageRatio:gray?covered/gray:null,referenceGrayBounds:gray?bounds:null,topCoveringFillCommands:top,rowsWithGray:rows.filter(x=>x>0).length,image:'camera-gray-fill-coverage.png'}};
}
return {analyze};
});

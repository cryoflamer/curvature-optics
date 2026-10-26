/* Controlled sphere visibility: analytical camera rays are compared with the
 * independent triangle/depth rasterizer, not with the legacy painter. */
(function(root,factory){var api=factory(root.CurvatureZBufferPreview||(typeof require==='function'?require('./CurvatureZBufferPreview'):null),root.CurvatureEarClip||(typeof require==='function'?require('./CurvatureEarClip'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.CurvatureVisibilityOracle=api;})(typeof globalThis!=='undefined'?globalThis:this,function(zbuffer,ear){
'use strict';
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function intersect(o,d,c,r){var q=[o[0]-c[0],o[1]-c[1],o[2]-c[2]],a=dot(d,d),b=2*dot(q,d),cc=dot(q,q)-r*r,disc=b*b-4*a*cc;if(disc<0)return null;var t=(-b-Math.sqrt(disc))/(2*a);return t>=0?t:null;}
function sphere(center,radius,latitudes,longitudes){var primitives=[],idx=0;
 function at(i,j){var theta=Math.PI*i/latitudes,phi=2*Math.PI*j/longitudes,s=Math.sin(theta);return [center[0]+radius*s*Math.cos(phi),center[1]+radius*s*Math.sin(phi),center[2]+radius*Math.cos(theta)];}
 for(var i=0;i<latitudes;i++)for(var j=0;j<longitudes;j++){
  var a=at(i,j),b=at(i+1,j),c=at(i+1,j+1),d=at(i,j+1);
  if(i>0)primitives.push({type:'polygon',mode:2,commandIndex:idx++,points:[a,b,d]});
  if(i<latitudes-1)primitives.push({type:'polygon',mode:2,commandIndex:idx++,points:[b,c,d]});
 }return {primitives,metadata:{cameraNear:0.001}};
}
function check(config){var width=160,height=160,center=config.center,radius=config.radius;
 var camera={pos:[0,0,0],center:[0,0,10],up:[0,1,0],sceneSize:10,screenSize:2,objectZExtend:0,zoom:1,near:0.001};
 var built=zbuffer.build(sphere(center,radius,32,64),camera,width,height,ear.triangulate),r=zbuffer.rasterize(built.triangles,width,height);
 // The image-plane basis of this camera points left along world X.
 var scale=height/camera.screenSize,focal=2,inside=0,outside=0,mismatch=0,uncertain=0;
 for(var y=0;y<height;y++)for(var x=0;x<width;x++){
  var dx=-(x+0.5-width/2)/scale/focal,dy=(height/2-y-0.5)/scale/focal,d=[dx,dy,1],t=intersect([0,0,0],d,center,radius),expected=t!==null&&t<10;
  // Ignore only pixels within two pixels of the analytic silhouette. This
  // accounts for the deliberate finite tessellation, not arbitrary image F1.
  var neighborsAgree=true;
  for(var oy=-2;oy<=2&&neighborsAgree;oy+=2)for(var ox=-2;ox<=2;ox+=2){var dd=[-(x+0.5+ox-width/2)/scale/focal,(height/2-y-0.5-oy)/scale/focal,1],tt=intersect([0,0,0],dd,center,radius);if((tt!==null&&tt<10)!==expected){neighborsAgree=false;break;}}
  if(!neighborsAgree){uncertain++;continue;}
  var actual=r.owner[y*width+x]>=0;if(expected)inside++;else outside++;if(actual!==expected)mismatch++;
 }
 return {name:config.name,center,radius,passed:mismatch===0,interiorSamples:inside,exteriorSamples:outside,excludedSilhouettePixels:uncertain,mismatches:mismatch,triangles:built.triangles.length};
}
function run(){var cases=[{name:'centered sphere',center:[0,0,6],radius:1.5},{name:'off-axis sphere',center:[0.65,0.3,6],radius:1.2},{name:'distant sphere',center:[-0.4,-0.3,8],radius:1.4}].map(check);return {passed:cases.every(c=>c.passed),cases,method:'Analytic ray/sphere intersection versus independent tessellated sphere Z-buffer; 2px silhouette exclusion',scope:'Controlled opaque sphere scenes; not a proof for arbitrary meshes, alpha or legacy rendering'};}
return {run,check};
});

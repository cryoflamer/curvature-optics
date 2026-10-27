/* Depth-tested diagnostic with captured paint attributes. Painter-order remains
 * the reference for horizon overpainting; this view tests physical occlusion. */
(function(root,factory){var api=factory(root.CurvatureZBufferPreview||(typeof require==='function'?require('./CurvatureZBufferPreview'):null),root.CurvatureStrokePreview||(typeof require==='function'?require('./CurvatureStrokePreview'):null),root.CurvatureCanvasProjection||(typeof require==='function'?require('./CurvatureCanvasProjection'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.CurvatureStyledCombinedPreview=api;})(typeof globalThis!=='undefined'?globalThis:this,function(zbuffer,strokes,canvasProjection){
'use strict';
function color(value){
 var v=typeof value==='string'?value.trim().toLowerCase():'',hex;
 if(v==='white')return [255,255,255,1];if(v==='black')return [0,0,0,1];if(v==='blue')return [0,0,255,1];
 if(v==='transparent')return [0,0,0,0];
 if((hex=/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v))){var h=hex[1];if(h.length<=4)h=h.split('').map(c=>c+c).join('');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),h.length===8?parseInt(h.slice(6,8),16)/255:1];}
 var m=/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v);
 if(m)return [Math.min(255,+m[1]),Math.min(255,+m[2]),Math.min(255,+m[3]),m[4]===undefined?1:Math.max(0,Math.min(1,+m[4]))];
 return null;
}
function draw(canvas,scene,camera,triangles){
 var width=canvas.width,height=canvas.height,fill=zbuffer.rasterize(triangles,width,height),out=new Uint8ClampedArray(width*height*4),unparsed=new Set();
 function brush(style,key,fallback){var spec=style&&style[key]||fallback,c=color(spec);if(!c){unparsed.add(spec);return color(fallback);}return c;}
 function paint(off,c,alpha){var a=Math.max(0,Math.min(1,alpha*c[3])),i=off*4,old=out[i+3]/255,combined=a+old*(1-a);if(combined<=0)return;for(var j=0;j<3;j++)out[i+j]=(c[j]*a+out[i+j]*old*(1-a))/combined;out[i+3]=Math.round(combined*255);}
 for(var p=0;p<width*height;p++){var i=p*4;out[i]=out[i+1]=out[i+2]=0;out[i+3]=0;var owner=fill.owner[p];if(owner<0)continue;var style=triangles[owner].style,c=brush(style,'fill','#a8b8c7');paint(p,c,style&&style.alpha!=null?style.alpha:1);}
 var lines=strokes.build(scene,camera,width,height),depth=Float64Array.from(fill.depth),strokePixels=0;
 for(var s of lines.segments){var a=s.points[0],b=s.points[1],dx=b[0]-a[0],dy=b[1]-a[1],steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy)))),style=s.style,c=brush(style,'stroke','#30435a'),alpha=style&&style.alpha!=null?style.alpha:1,strokeWidth=canvasProjection.lineWidth(style&&style.lineWidth,camera);
  // Keep diagnostics finite for pathological style widths; joins/caps are approximate.
  var radius=Math.max(.5,Math.min(8,strokeWidth/2)),rad=Math.ceil(radius);
  for(var k=0;k<=steps;k++){var t=k/steps,x=a[0]+dx*t,y=a[1]+dy*t,inv=(1-t)/a[2]+t/b[2];
   for(var iy=Math.floor(y)-rad;iy<=Math.floor(y)+rad;iy++)for(var ix=Math.floor(x)-rad;ix<=Math.floor(x)+rad;ix++){
    if(ix<0||ix>=width||iy<0||iy>=height)continue;
    if(Math.hypot(ix+.5-x,iy+.5-y)>radius+.1)continue;
    var off=iy*width+ix;if(inv<depth[off]-1e-10)continue;
    depth[off]=Math.max(depth[off],inv);paint(off,c,alpha);strokePixels++;
   }
  }
 }
 var ctx=canvas.getContext('2d'),img=ctx.createImageData(width,height);img.data.set(out);ctx.putImageData(img,0,0);
 return {statistics:{filledPixels:fill.owner.reduce((n,o)=>n+(o>=0),0),strokeSamples:strokePixels,segmentCount:lines.segments.length,unparsedStyles:Array.from(unparsed),nearPlane:lines.statistics.nearPlane,limitations:['Approximate stroke widths, joins, and caps','Z-buffer visibility differs from original painter-order overpainting','Transparent background retained; no browser-native antialiasing parity']}};
}
return {draw,color};
});

/* #140.12.36: Visual evidence from the exact RGBA frames used for attribution. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CurvatureAttributionVisualZip141236=api;}(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function check(frame){if(!frame||!Number.isInteger(frame.width)||!Number.isInteger(frame.height)||!frame.rgba||frame.rgba.length!==frame.width*frame.height*4)throw Error('Invalid frame');}
function compare(a,b){check(a);check(b);if(a.width!==b.width||a.height!==b.height)throw Error('Frame dimensions differ');}
function composite(v,i,k){return 255*(1-v[i+3]/255)+v[i+k]*v[i+3]/255;}
function visual(a,b,mode){compare(a,b);var out=new Uint8ClampedArray(a.rgba.length);for(var i=0;i<out.length;i+=4){
  if(mode==='overlay'){for(var c=0;c<3;c++)out[i+c]=Math.round((composite(a.rgba,i,c)+composite(b.rgba,i,c))/2);}
  else if(mode==='difference'){
    var d=0,aw=0,bw=0;for(var c=0;c<3;c++){var av=composite(a.rgba,i,c),bv=composite(b.rgba,i,c);d=Math.max(d,Math.abs(av-bv));aw=Math.max(aw,255-av);bw=Math.max(bw,255-bv);}
    // Red: CPU-only coverage, blue: GPU-only coverage, yellow: both painted but different.
    if(aw>8&&bw<=8){out[i]=255;out[i+1]=35;out[i+2]=35;}
    else if(bw>8&&aw<=8){out[i]=35;out[i+1]=100;out[i+2]=255;}
    else if(d>8){out[i]=255;out[i+1]=Math.max(60,255-Math.round(d));out[i+2]=0;}
    else {out[i]=0;out[i+1]=0;out[i+2]=0;}
  }else throw Error('Unknown visualization');out[i+3]=255;
}return {width:a.width,height:a.height,rgba:out};}
function png(frame,doc){check(frame);var canvas=doc.createElement('canvas');canvas.width=frame.width;canvas.height=frame.height;var ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas 2D unavailable');var data=ctx.createImageData(frame.width,frame.height);data.data.set(frame.rgba);ctx.putImageData(data,0,0);var url=canvas.toDataURL('image/png');if(!url.startsWith('data:image/png;base64,'))throw Error('PNG encoding unavailable');var binary=atob(url.slice('data:image/png;base64,'.length)),bytes=new Uint8Array(binary.length);for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
function entries(cases,report,doc){var files=[{name:'algorithm-attribution.json',data:JSON.stringify(report,null,2)}],readme=['Curvature #140.12.36 visual attribution','All PNGs are snapshots from the same RGBA buffers used for the JSON metrics.','Difference legend: red = CPU-only painted, blue = GPU-only painted, yellow = both painted with RGB difference > 8; black = no significant difference.','Overlay: 50% CPU + 50% candidate on white.','Differences use white-composited RGB, not semantic sky/ground.',''];
cases.forEach(function(item){var f=item.frames,id=item.id;['cpu','baseline','strict','strictDirect'].forEach(function(k){files.push({name:id+'/'+k+'.png',data:png(f[k],doc)});});['baseline','strict','strictDirect'].forEach(function(k){files.push({name:id+'/cpu-vs-'+k+'-overlay.png',data:png(visual(f.cpu,f[k],'overlay'),doc)});files.push({name:id+'/cpu-vs-'+k+'-difference.png',data:png(visual(f.cpu,f[k],'difference'),doc)});});files.push({name:id+'/baseline-vs-strictDirect-difference.png',data:png(visual(f.baseline,f.strictDirect,'difference'),doc)});});files.push({name:'README.txt',data:readme.join('\n')});return files;}
return Object.freeze({visual:visual,entries:entries,png:png});
}));

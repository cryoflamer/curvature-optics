/* Diagnostic contour views for rejected projected polygons; never changes rendering. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CurvatureContourDiagnostics=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function select(scene,failures,indices){
 var ids=new Set(failures.map(x=>x.commandIndex)),wanted=indices||[61,62];
 return wanted.map(id=>{var p=scene.primitives.find(p=>p.type==='polygon'&&p.commandIndex===id&&ids.has(id));
  return p?{commandIndex:id,mode:p.mode,sourceCommandIndices:p.sourceCommandIndices||[],points:p.points.map(v=>v.slice())}:null;}).filter(Boolean);
}
function project(points){
 if(points.length<3)return [];
 var sub=(a,b)=>a.map((x,i)=>x-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(...a);
 var o=points[0],axis=null,normal=null;
 for(var i=1;i<points.length&&!normal;i++)for(var j=i+1;j<points.length;j++){
  var a=sub(points[i],o),n=cross(a,sub(points[j],o)),len=norm(n);
  if(len>1e-12){axis=a.map(x=>x/norm(a));normal=n.map(x=>x/len);break;}
 }
 if(!normal)return [];
 var v=cross(normal,axis);return points.map(p=>{var d=sub(p,o);return [d.reduce((s,x,i)=>s+x*axis[i],0),d.reduce((s,x,i)=>s+x*v[i],0)];});
}
function render(canvas,entry){
 var ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,points=project(entry.points);
 ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.fillStyle='#222';ctx.font='18px sans-serif';ctx.fillText('Command '+entry.commandIndex+' | mode '+entry.mode+' | '+entry.points.length+' vertices',20,28);
 if(points.length<3)return {rendered:false,reason:'degenerate-plane'};
 var xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
 var span=Math.max(xmax-xmin,ymax-ymin,1e-12),scale=Math.min((w-110)/span,(h-130)/span),cx=(xmin+xmax)/2,cy=(ymin+ymax)/2;
 var pix=p=>[w/2+(p[0]-cx)*scale,h/2-(p[1]-cy)*scale];
 ctx.lineWidth=2;ctx.strokeStyle='#1764aa';ctx.beginPath();points.forEach((p,i)=>{var q=pix(p);if(i===0)ctx.moveTo(...q);else ctx.lineTo(...q);});ctx.closePath();ctx.stroke();
 points.forEach((p,i)=>{var q=pix(p);ctx.beginPath();ctx.arc(q[0],q[1],3,0,2*Math.PI);ctx.fillStyle='#c13c25';ctx.fill();ctx.font='12px sans-serif';ctx.fillStyle='#111';ctx.fillText(String(i),q[0]+5,q[1]-5);});
 ctx.font='13px sans-serif';ctx.fillStyle='#555';ctx.fillText('Blue: ordered closed contour. Red: vertices. Numbers: original indices.',20,h-15);
 return {rendered:true,vertices:points.length};
}
return {select,project,render};
});

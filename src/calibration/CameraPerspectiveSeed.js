/* Perspective initialization only. Right-handed world XYZ, image x right/y down,
 * world-to-camera rotation rows, positive camera depth, focal length in pixels.
 * No refraction, occlusion, lens distortion or physical camera conversion. */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureCameraPerspectiveSeed=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
  const add=(a,b)=>a.map((x,i)=>x+b[i]);
  const sub=(a,b)=>a.map((x,i)=>x-b[i]);
  const mul=(a,s)=>a.map(x=>x*s);
  const norm=a=>Math.hypot(...a);
  const unit=a=>mul(a,1/norm(a));
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const mean=rows=>mul(rows.reduce(add,rows[0].map(()=>0)),1/rows.length);
  const finite=(p,n)=>Array.isArray(p)&&p.length===n&&p.every(Number.isFinite);
  // One-sided Jacobi SVD: work directly on design columns, not A^T A.
  function svd(rows){
    const n=rows[0].length,c=Array.from({length:n},(_,j)=>rows.map(r=>r[j]));
    const v=Array.from({length:n},(_,j)=>Array.from({length:n},(_,i)=>i===j?1:0));
    let converged=false;
    for(let sweep=0;sweep<100;sweep++){
      let changed=false;
      for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
        const a=dot(c[i],c[i]),b=dot(c[j],c[j]),g=dot(c[i],c[j]);
        if(Math.abs(g)<=1e-13*Math.sqrt(a*b)||Math.min(a,b)<1e-30)continue;
        const tau=(b-a)/(2*g),t=(tau<0?-1:1)/(Math.abs(tau)+Math.hypot(1,tau)),cs=1/Math.hypot(1,t),sn=cs*t;
        for(const cols of [c,v]){const x=cols[i],y=cols[j];cols[i]=sub(mul(x,cs),mul(y,sn));cols[j]=add(mul(x,sn),mul(y,cs));}
        changed=true;
      }
      if(!changed){converged=true;break;}
    }
    const order=c.map((x,i)=>({s:norm(x),v:v[i]})).sort((a,b)=>b.s-a.s);
    return {converged,values:order.map(x=>x.s),vectors:order.map(x=>x.v)};
  }
  function initialize(observations,options){
    options=options||{};
    const width=options.width,height=options.height;
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||!Array.isArray(observations)||
      observations.some(o=>!o||!finite(o.world,3)||!finite(o.pixel,2)))throw TypeError('Invalid perspective observations or raster');
    const min=options.minFocalPx===undefined?1:options.minFocalPx,max=options.maxFocalPx===undefined?1e7:options.maxFocalPx;
    if(!Number.isFinite(min)||!Number.isFinite(max)||!(min>0&&max>=min))throw RangeError('Invalid focal bounds');
    const result=(status,reason,candidates=[],diagnostics={})=>({status,reason,candidates,diagnostics,complete:false});
    if(observations.length<4)return result('insufficient_points','At least four correspondences required');
    const world=observations.map(o=>o.world),origin=mean(world),delta=world.map(p=>sub(p,origin));
    const scale=Math.sqrt(delta.reduce((s,p)=>s+dot(p,p),0)/world.length);
    if(!(scale>0&&Number.isFinite(scale)))return result('degenerate','Coincident world points');
    const x=delta.map(p=>mul(p,1/scale)),shape=svd(x),[a,b,c]=shape.values;
    const diagnostics={worldSingularValues:shape.values};
    if(!shape.converged)return result('failed','World SVD did not converge',[],diagnostics);
    if(b<=a*1e-9)return result('degenerate','Collinear world points',[],diagnostics);
    const planar=c<=a*1e-9;
    diagnostics.branch=planar?'planar-homography':'spatial-dlt';
    if(!planar&&world.length<6)return result('insufficient_points','Spatial DLT requires six correspondences',[],diagnostics);
    const center=[width/2,height/2],image=observations.map(o=>sub(o.pixel,center));
    const imageScale=Math.sqrt(image.reduce((s,p)=>s+dot(p,p),0)/image.length);
    if(!(imageScale>0&&Number.isFinite(imageScale)))return result('degenerate','Coincident image points',[],diagnostics);
    const axes=shape.vectors.slice(0,2);axes.push(cross(axes[0],axes[1]));
    const design=[];
    x.forEach((p,i)=>{
      const q=planar?[dot(p,axes[0]),dot(p,axes[1]),1]:[...p,1],z=q.map(()=>0),[u,v]=mul(image[i],1/imageScale);
      design.push([...q,...z,...mul(q,-u)],[...z,...q,...mul(q,-v)]);
    });
    const s=svd(design),n=design[0].length;
    diagnostics.designSingularValues=s.values;
    if(!s.converged)return result('failed','Design SVD did not converge',[],diagnostics);
    if(s.values[n-2]<=s.values[0]*1e-10)return result('degenerate','Design has multiple null directions',[],diagnostics);
    const raw=s.vectors[n-1],stride=planar?3:4,rows=Array.from({length:3},(_,i)=>raw.slice(i*stride,(i+1)*stride));
    const candidates=[];
    for(const sign of [1,-1]){
      const r=rows.map(p=>mul(p,sign));let R,t,f;
      if(planar){
        const h1=r.map(p=>p[0]),h2=r.map(p=>p[1]);
        const aa=h1[0]*h2[0]+h1[1]*h2[1],bb=h1[2]*h2[2];
        const cc=h1[0]**2+h1[1]**2-h2[0]**2-h2[1]**2,dd=h1[2]**2-h2[2]**2;
        if(Math.hypot(bb,dd)<=1e-10*(dot(h1,h1)+dot(h2,h2)))return result('degenerate','Frontal plane: distance and focal length unresolved',[],diagnostics);
        f=Math.sqrt(-(aa*bb+cc*dd)/(bb*bb+dd*dd));
        if(!(f>0&&Number.isFinite(f)))continue;
        const uncal=h=>[h[0]/f,h[1]/f,h[2]],u=uncal(h1),v=uncal(h2),k=(norm(u)+norm(v))/2;
        const e1=unit(u),e2=unit(sub(v,mul(e1,dot(v,e1)))),e3=cross(e1,e2);
        R=e1.map((_,i)=>axes[0].map((__,j)=>e1[i]*axes[0][j]+e2[i]*axes[1][j]+e3[i]*axes[2][j]));
        t=mul(uncal(r.map(p=>p[2])),1/k);
      }else{
        const k=norm(r[2].slice(0,3));if(!(k>0))continue;
        const z=mul(r[2].slice(0,3),1/k),u=mul(r[0].slice(0,3),1/k),v=mul(r[1].slice(0,3),1/k);
        const xx=unit(sub(u,mul(z,dot(u,z)))),yy=cross(z,xx);
        f=(dot(u,xx)+dot(v,yy))/2;if(!(dot(v,yy)>0&&f>0))continue;
        R=[xx,yy,z];t=[r[0][3]/(k*f),r[1][3]/(k*f),r[2][3]/k];
      }
      const focalPx=f*imageScale;if(!(focalPx>=min&&focalPx<=max))continue;
      const position=sub(origin,mul(R[0].map((_,j)=>R.reduce((sum,row,i)=>sum+row[j]*t[i],0)),scale));
      if(!finite(position,3)||!R.every(p=>finite(p,3)))continue;
      let sum=0,valid=true;
      for(const o of observations){const p=R.map(row=>dot(row,sub(o.world,position)));if(!(p[2]>0)){valid=false;break;}
        const residual=sub(add(center,[focalPx*p[0]/p[2],focalPx*p[1]/p[2]]),o.pixel);sum+=dot(residual,residual);}
      if(valid&&Number.isFinite(sum))candidates.push({position,rotation:R,focalPx,rmsPx:Math.sqrt(sum/world.length),method:diagnostics.branch});
    }
    candidates.sort((a,b)=>a.rmsPx-b.rmsPx);
    return result(candidates.length?'candidates':'failed',candidates.length?null:'No positive-depth candidate within focal bounds',candidates,diagnostics);
  }
  return Object.freeze({initialize});
}));

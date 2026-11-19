/* Perspective seeds from calibrated three-point distance equations at sampled
 * focal lengths. World XYZ is Cartesian metres; image x right, y down.
 * Finite search, no refraction, no claim of exhaustive PnPf recovery. */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureCameraFocalSweep=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]);
  const mul=(a,s)=>a.map(x=>x*s),norm=a=>Math.hypot(...a),unit=a=>mul(a,1/norm(a));
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const finite=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(Number.isFinite);
  const plus=(a,b)=>Array.from({length:Math.max(a.length,b.length)},(_,i)=>(a[i]||0)+(b[i]||0));
  function product(a,b){const p=Array(a.length+b.length-1).fill(0);a.forEach((x,i)=>b.forEach((y,j)=>p[i+j]+=x*y));return p;}
  function evaluate(p,x){return p.reduceRight((s,v)=>s*x+v,0);}
  // Isolate real roots using derivative critical points and a finite root bound.
  // Recheck the original distance equations; elimination can introduce roots.
  function roots(p){
    const scale=Math.max(...p.map(Math.abs));if(!(scale>0&&Number.isFinite(scale)))return [];
    p=mul(p,1/scale);while(p.length>1&&Math.abs(p[p.length-1])<1e-14)p.pop();
    const n=p.length-1;if(n===0)return [];if(n===1)return [-p[0]/p[1]];
    const bound=1+Math.max(...p.slice(0,-1).map(x=>Math.abs(x/p[n])));
    const edges=[-bound,...roots(p.slice(1).map((x,i)=>x*(i+1))).filter(x=>Math.abs(x)<bound),bound].sort((a,b)=>a-b),out=[];
    function append(x){if(Number.isFinite(x)&&!out.some(y=>Math.abs(x-y)<=1e-9*Math.max(1,Math.abs(x))))out.push(x);}
    for(const x of edges){const error=p.reduce((s,v,i)=>s+Math.abs(v)*Math.abs(x)**i,0);if(Math.abs(evaluate(p,x))<=1e-12*error)append(x);}
    for(let i=1;i<edges.length;i++){
      let a=edges[i-1],b=edges[i],fa=evaluate(p,a),fb=evaluate(p,b);
      if(Math.sign(fa)===Math.sign(fb)||fa===0||fb===0)continue;
      for(let j=0;j<100;j++){const m=(a+b)/2,f=evaluate(p,m);if(f===0||b-a<=1e-13*Math.max(1,Math.abs(m))){a=b=m;break;}
        if(Math.sign(f)===Math.sign(fa)){a=m;fa=f;}else b=m;}
      append((a+b)/2);
    }
    return out.sort((a,b)=>a-b);
  }
  function basis(points){const u=unit(sub(points[1],points[0])),v=unit(cross(u,sub(points[2],points[0])));return [u,cross(v,u),v];}
  function poses(world,bearings){
    const [p1,p2,p3]=world,[b1,b2,b3]=bearings;
    const A=norm(sub(p1,p2))**2,B=norm(sub(p1,p3))**2/A,C=norm(sub(p2,p3))**2/A;
    const du=norm(sub(b1,b2)),dv=norm(sub(b1,b3)),dw=norm(sub(b2,b3)),alpha=Math.max(du,dv,dw);
    if(!(alpha>1e-12&&A>0&&Number.isFinite(B+C)))return [];
    // x=d2/d1=1+alpha*t, y=d3/d1=1+alpha*q. Scaling the
    // differences avoids subtracting nearly equal cosines for telephoto rays.
    const U=(du/alpha)**2,V=(dv/alpha)**2,W=(dw/alpha)**2;
    const D=[U,alpha*U,1],K=[W-V,alpha*W];
    const N=plus(plus(mul(D,C-B),[0,0,-1]),mul(K,-1));
    const L=plus([0,-2],mul(K,alpha));
    const Q=plus([V],mul(D,-B));
    const poly=plus(plus(product(N,N),mul(product(N,L),alpha*V)),product(Q,product(L,L)));
    const wb=basis(world),out=[];
    for(const t of roots(poly)){
      const den=evaluate(L,t),num=evaluate(N,t),qs=[];
      if(Math.abs(den)>1e-9*Math.max(1,Math.abs(t)))qs.push(num/den);
      else {const disc=(alpha*V)**2-4*evaluate(Q,t);if(disc>=0)qs.push((-alpha*V+Math.sqrt(disc))/2,(-alpha*V-Math.sqrt(disc))/2);}
      for(const q of qs){
        const x=1+alpha*t,y=1+alpha*q,d=evaluate(D,t);
        if(!(x>0&&y>0&&d>0))continue;
        const e1=q*q+V*y-B*d,e2=(t-q)**2+W*x*y-C*d;
        if(Math.max(Math.abs(e1),Math.abs(e2))>1e-7*Math.max(d,B*d,C*d,1e-12))continue;
        const range=Math.sqrt(A/d)/alpha,cam=[mul(b1,range),mul(b2,range*x),mul(b3,range*y)],cb=basis(cam);
        const rotation=cb[0].map((_,i)=>wb[0].map((__,j)=>wb.reduce((s,a,k)=>s+cb[k][i]*a[j],0)));
        const position=p1.map((v,j)=>v-rotation.reduce((s,r,i)=>s+r[j]*cam[0][i],0));
        if(finite(position,3)&&rotation.every(r=>finite(r,3)))out.push({position,rotation});
      }
    }
    return out;
  }
  function initialize(observations,options){
    options=options||{};const {width,height}=options;
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||!Array.isArray(observations)||
      observations.some(o=>!o||!finite(o.world,3)||!finite(o.pixel,2)))throw TypeError('Invalid perspective observations or raster');
    const diag=Math.hypot(width,height),min=options.minFocalPx??diag/4,max=options.maxFocalPx??diag*128,samples=options.samples??33;
    if(!Number.isFinite(min)||!Number.isFinite(max)||!(min>0&&max>=min)||!Number.isInteger(samples)||samples<2||samples>129)throw RangeError('Invalid focal sweep bounds or sample count');
    const diagnostics={minFocalPx:min,maxFocalPx:max,samples,triangles:[],evaluatedFocals:0};
    const result=(status,reason,candidates=[])=>({status,reason,candidates,diagnostics,complete:false});
    if(observations.length<4)return result('insufficient_points','At least four correspondences required');
    // Deterministic farthest pair + up to three largest-area third points.
    // Restrict pair selection to 64 evenly spaced inputs; score every input.
    const indices=Array.from({length:Math.min(64,observations.length)},(_,i)=>Math.round(i*(observations.length-1)/(Math.min(64,observations.length)-1)));
    const world=observations.map(o=>o.world),pixels=observations.map(o=>sub(o.pixel,[width/2,height/2]));
    let pair=[],length=0;
    for(const i of indices)for(const j of indices)if(j>i){const d=norm(sub(world[i],world[j]));if(d>length){pair=[i,j];length=d;}}
    if(!(length>0&&Number.isFinite(length)))return result('degenerate','Coincident world points');
    const [i,j]=pair,axis=mul(sub(world[j],world[i]),1/length);
    const ranked=world.map((p,k)=>({k,area:norm(cross(axis,mul(sub(p,world[i]),1/length)))})).filter(o=>o.k!==i&&o.k!==j&&o.area>1e-9).sort((a,b)=>b.area-a.area||a.k-b.k);
    if(!ranked.length)return result('degenerate','Collinear world points');
    diagnostics.triangles=ranked.slice(0,3).map(o=>[i,j,o.k]);
    const candidates=[];
    function scan(focalPx){
      diagnostics.evaluatedFocals++;let best=Infinity;
      const bearings=pixels.map(p=>unit([p[0]/focalPx,p[1]/focalPx,1]));
      for(const ids of diagnostics.triangles)for(const pose of poses(ids.map(k=>world[k]),ids.map(k=>bearings[k]))){
        let sum=0,valid=true;
        for(let k=0;k<world.length;k++){
          const c=pose.rotation.map(row=>dot(row,sub(world[k],pose.position)));
          if(!(c[2]>0)){valid=false;break;}
          sum+=(focalPx*c[0]/c[2]-pixels[k][0])**2+(focalPx*c[1]/c[2]-pixels[k][1])**2;
        }
        if(!valid||!Number.isFinite(sum))continue;
        const rmsPx=Math.sqrt(sum/world.length);best=Math.min(best,rmsPx);
        if(!candidates.some(c=>c.focalPx===focalPx&&norm(sub(c.position,pose.position))<=length*1e-8&&
          c.rotation.every((r,n)=>norm(sub(r,pose.rotation[n]))<=1e-8)))candidates.push({...pose,focalPx,rmsPx,method:'focal-sweep-p3p',triangle:ids.slice()});
      }
      return best;
    }
    const grid=Array.from({length:samples},(_,k)=>k===0?min:k===samples-1?max:Math.exp(Math.log(min)+(Math.log(max)-Math.log(min))*k/(samples-1))).filter((v,k,a)=>k===0||v!==a[k-1]);
    const scored=grid.map(f=>({f,error:scan(f)}));
    // Refine up to three distinct sampled minima; do not hide other branches.
    const minima=scored.map((v,k)=>({...v,k})).filter(v=>Number.isFinite(v.error)&&v.error<=(scored[v.k-1]?.error??Infinity)&&v.error<=(scored[v.k+1]?.error??Infinity)).sort((a,b)=>a.error-b.error||a.k-b.k).slice(0,3);
    const golden=(Math.sqrt(5)-1)/2;
    for(const m of minima){let lo=Math.log(grid[Math.max(0,m.k-1)]),hi=Math.log(grid[Math.min(grid.length-1,m.k+1)]);if(hi===lo)continue;
      let a=hi-golden*(hi-lo),b=lo+golden*(hi-lo),fa=scan(Math.exp(a)),fb=scan(Math.exp(b));
      for(let k=0;k<24;k++)if(fa<=fb){hi=b;b=a;fb=fa;a=hi-golden*(hi-lo);fa=scan(Math.exp(a));}else{lo=a;a=b;fa=fb;b=lo+golden*(hi-lo);fb=scan(Math.exp(b));}
    }
    candidates.sort((a,b)=>a.rmsPx-b.rmsPx||a.focalPx-b.focalPx);
    return result(candidates.length?'candidates':'failed',candidates.length?null:'No positive-depth candidate found in finite sweep',candidates);
  }
  return Object.freeze({initialize});
}));

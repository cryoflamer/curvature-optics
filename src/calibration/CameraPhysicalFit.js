/* Local, bounded physical reprojection least squares. All observations remain
 * in the objective. Centered photo raster and fixed physical hypothesis.
 * Scaled finite differences and damped QR; no identifiability certificate. */
(function(root,factory){
  var api=factory(root.CurvatureCameraPhysicalPose||require('./CameraPhysicalPose'),
    root.CurvatureCameraLandmarkProjection||require('./CameraLandmarkProjection'));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureCameraPhysicalFit=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(bridge,projection){
  'use strict';
  const fields=['CameraEast','CameraNorth','Height','Pan','Nick','Roll','FocalLengthField'];
  const focal='FocalLengthField',rad=Math.PI/180;
  const limits={CameraEast:[-1e7,1e7],CameraNorth:[-1e7,1e7],Height:[.001,1e9],
    Pan:[-180,180],Nick:[-85,45],Roll:[-180,180],
    FocalLengthField:[43.2/(2*Math.tan(80*rad)),43.2/(2*Math.tan(.05*rad))]};
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  const norm=a=>a.reduce((s,v)=>Math.hypot(s,v),0);
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function number(v,min,max,name){if(!Number.isFinite(v)||v<min||v>max)throw RangeError('Invalid '+name);return v;}
  function controls(options){
    const {width,height}=options,method=options.method??'accurate',atmosphere=options.atmosphere??'vacuum';
    if(!Number.isInteger(width)||width<1||!Number.isInteger(height)||height<1)throw RangeError('Invalid raster dimensions');
    if(!['accurate','canvas-direct'].includes(method)||!['vacuum','standard','temperature-lapse'].includes(atmosphere))throw RangeError('Unsupported method or atmosphere');
    if(options.step!==undefined)number(options.step,Number.MIN_VALUE,Infinity,'RK4 step');
    return {width,height,method,atmosphere,step:options.step,temperatureProfile:options.temperatureProfile};
  }
  function observations(input){
    if(!Array.isArray(input)||!input.length)throw TypeError('Calibration observations required');
    const seen=new Set();
    return input.map(o=>{
      if(!o||!o.landmark||typeof o.landmark.id!=='string'||!o.landmark.id.trim()||seen.has(o.landmark.id)||
         !Array.isArray(o.pixel)||o.pixel.length!==2||!o.pixel.every(Number.isFinite))throw TypeError('Invalid or duplicate calibration observation');
      const kind=o.kind??'metric',p=o.landmark;
      if(kind==='metric'?(![p.east,p.north,p.height].every(Number.isFinite)||p.height<0):
        kind==='vertex'?(![p.bank,p.objectType,p.primitive,p.vertex].every(Number.isInteger)||![0,1].includes(p.bank)||p.primitive<0||p.vertex<0):true)
        throw TypeError('Invalid calibration landmark');
      seen.add(p.id);return {kind,landmark:{...p},pixel:o.pixel.slice(),weight:number(o.weight??1,Number.MIN_VALUE,Infinity,'weight')};
    });
  }
  function poseOf(p,opts){
    if(!p||fields.some(k=>!Number.isFinite(p[k])))throw TypeError('Complete finite initial pose required');
    return {...Object.fromEntries(fields.map(k=>[k,p[k]])),deviceRatio:opts.width/opts.height,viewcenterHorizon:3};
  }
  function evaluator(model,obs,opts){
    if(!model||![1,2].includes(model.showModel)||!(model.rEarth>0)||!Number.isFinite(model.rEarth)||!(model.rFEarth>0)||!Number.isFinite(model.rFEarth))throw RangeError('Invalid physical model');
    const weightSum=obs.reduce((s,o)=>s+o.weight,0);if(!Number.isFinite(weightSum))throw RangeError('Invalid total weight');
    return pose=>{
      const m={...model,...pose};let session;
      try{session=projection.create(m,bridge.photoCamera(m,opts.width,opts.height),opts.width,opts.height,opts);}
      catch(e){if(!(e instanceof RangeError))throw e;return {valid:false,reason:e.message,rmsPx:null,weightedRmsPx:null,cost:null,residuals:null,points:[]};}
      let sum=0,cost=0;const residuals=[],points=[];
      for(const o of obs){
        const q=session[o.kind](o.landmark),valid=['visible','out_of_frame'].includes(q.status)&&q.pixel&&q.pixel.every(Number.isFinite);
        const residual=valid?q.pixel.map((v,i)=>v-o.pixel[i]):null;
        points.push({id:o.landmark.id,status:q.status,predicted:q.pixel,observed:o.pixel.slice(),residual,weight:o.weight,reason:q.reason});
        if(residual){const s=dot(residual,residual);sum+=s;cost+=o.weight*s;residuals.push(...residual.map(v=>v*Math.sqrt(o.weight)));}
      }
      if(points.some(p=>p.residual===null)||!Number.isFinite(cost)||!Number.isFinite(sum))return {valid:false,reason:'At least one observation lacks a usable physical projection',rmsPx:null,weightedRmsPx:null,cost:null,residuals:null,points};
      return {valid:true,reason:null,rmsPx:Math.sqrt(sum/obs.length),weightedRmsPx:Math.sqrt(cost/weightSum),cost:cost/2,residuals,points};
    };
  }
  function evaluate(model,pose,input,options){const opts=controls(options||{});return evaluator(model,observations(input),opts)(poseOf(pose,opts));}
  // Givens QR on the augmented least-squares system [J; sqrt(lambda)D].
  // Avoid normal equations, including for weakly determined directions.
  function solve(columns,residual,lambda){
    const n=columns.length,m=residual.length,A=Array.from({length:m+n},(_,i)=>Array.from({length:n},(_,j)=>i<m?columns[j][i]:i-m===j?Math.sqrt(lambda)*Math.max(1,norm(columns[j])):0));
    const b=residual.map(v=>-v).concat(Array(n).fill(0));
    for(let j=0;j<n;j++)for(let i=j+1;i<A.length;i++){
      const a=A[j][j],d=A[i][j];if(d===0)continue;const r=Math.hypot(a,d),c=a/r,s=d/r;
      for(let k=j;k<n;k++){const x=A[j][k],y=A[i][k];A[j][k]=c*x+s*y;A[i][k]=-s*x+c*y;}
      const x=b[j],y=b[i];b[j]=c*x+s*y;b[i]=-s*x+c*y;
    }
    const step=Array(n).fill(0);
    for(let j=n-1;j>=0;j--){let v=b[j];for(let k=j+1;k<n;k++)v-=A[j][k]*step[k];step[j]=v/A[j][j];}
    return step.every(Number.isFinite)?step:null;
  }
  function fit(model,initial,input,options){
    options=options||{};const opts=controls(options),obs=observations(input),base=poseOf(initial,opts);
    const free=options.freeParameters??fields.slice(),bounds=options.bounds??{},scales=options.scales??{};
    if(!Array.isArray(free)||new Set(free).size!==free.length||free.some(k=>!fields.includes(k)))throw RangeError('Invalid free parameters');
    if(!bounds||typeof bounds!=='object'||Array.isArray(bounds)||!scales||typeof scales!=='object'||Array.isArray(scales)||[...Object.keys(bounds),...Object.keys(scales)].some(k=>!fields.includes(k)))throw RangeError('Invalid bounds or scales');
    const maxIterations=number(options.maxIterations??80,0,500,'iteration limit'),epsilon=number(options.differenceStep??1e-4,1e-8,.01,'difference step');
    if(!Number.isInteger(maxIterations))throw RangeError('Invalid iteration limit');
    const gradientTolerance=number(options.gradientTolerance??1e-8,0,Infinity,'gradient tolerance'),stepTolerance=number(options.stepTolerance??1e-9,0,Infinity,'step tolerance');
    const distances=obs.filter(o=>o.kind==='metric').map(o=>Math.hypot(o.landmark.east-base.CameraEast,o.landmark.north-base.CameraNorth)).sort((a,b)=>a-b);
    const range=distances.length?distances[Math.floor(distances.length/2)]:Math.hypot(base.CameraEast,base.CameraNorth);
    const defaults={CameraEast:Math.max(1,range*.1),CameraNorth:Math.max(1,range*.1),Height:Math.max(1,Math.min(1000,base.Height*.2)),Pan:1,Nick:1,Roll:1,FocalLengthField:.1};
    const specs=fields.map(k=>{
      const [a,b]=limits[k],user=bounds[k]??[a,b];
      if(!Array.isArray(user)||user.length!==2||!user.every(Number.isFinite)||user[0]>user[1])throw RangeError('Invalid bounds for '+k);
      const lo=Math.max(a,user[0]),hi=Math.min(b,user[1]);number(base[k],lo,hi,k+' initial value');
      if(free.includes(k)&&lo===hi)throw RangeError('Fixed bound requires locked parameter '+k);
      const scale=number(scales[k]??defaults[k],Number.MIN_VALUE,Infinity,k+' scale');
      const encode=v=>k===focal?Math.log(v/base[k])/scale:(v-base[k])/scale;
      const decode=v=>clamp(v===0?base[k]:k===focal?base[k]*Math.exp(v*scale):base[k]+v*scale,lo,hi);
      const left=encode(lo),right=encode(hi);
      if(!Number.isFinite(left)||!Number.isFinite(right))throw RangeError('Unrepresentable scaled bounds for '+k);
      return {k,lo:left,hi:right,decode};
    }).filter(s=>free.includes(s.k));
    const objective=evaluator(model,obs,opts),decode=x=>({...base,...Object.fromEntries(specs.map((s,i)=>[s.k,s.decode(x[i])]))});
    let evaluations=0,iterations=0,acceptedSteps=0,lambda=1e-3,x=specs.map(()=>0);
    const at=x=>{evaluations++;return objective(decode(x));};
    let current=at(x);const initialRmsPx=current.rmsPx;
    const finish=(status,reason)=>({status,reason,pose:decode(x),method:opts.method,atmosphere:opts.atmosphere,initialRmsPx,
      evaluation:current,iterations,evaluations,acceptedSteps,freeParameters:specs.map(s=>s.k),complete:false});
    if(!current.valid)return finish('invalid_initial',current.reason);
    if(!specs.length)return finish('fixed','No free parameters');
    if(2*obs.length<specs.length)return finish('underdetermined','Fewer scalar observations than free parameters');
    for(;iterations<maxIterations;iterations++){
      const columns=[];
      for(let j=0;j<x.length;j++){
        const s=specs[j],a=x.slice(),b=x.slice();a[j]=Math.max(s.lo,x[j]-epsilon);b[j]=Math.min(s.hi,x[j]+epsilon);
        const left=a[j]===x[j]?current:at(a),right=b[j]===x[j]?current:at(b);
        if(left.valid&&right.valid&&b[j]>a[j])columns.push(right.residuals.map((v,i)=>(v-left.residuals[i])/(b[j]-a[j])));
        else if(right.valid&&b[j]>x[j])columns.push(right.residuals.map((v,i)=>(v-current.residuals[i])/(b[j]-x[j])));
        else if(left.valid&&a[j]<x[j])columns.push(current.residuals.map((v,i)=>(v-left.residuals[i])/(x[j]-a[j])));
        else return finish('stalled','Physical Jacobian unavailable at '+s.k);
      }
      if(columns.some(c=>!c.every(Number.isFinite)))return finish('stalled','Nonfinite physical Jacobian');
      const g=columns.map(c=>dot(c,current.residuals)),active=g.map((v,i)=>(x[i]<=specs[i].lo&&v>0)||(x[i]>=specs[i].hi&&v<0));
      const movable=active.map((v,i)=>v?-1:i).filter(i=>i>=0);
      if(movable.every(i=>Math.abs(g[i])<=gradientTolerance))return finish('converged','Projected gradient tolerance');
      let accepted=false;
      for(let trial=0;trial<16;trial++){
        const step=solve(movable.map(i=>columns[i]),current.residuals,lambda);
        if(!step){lambda*=10;continue;}
        const factor=Math.min(1,4/Math.max(norm(step),Number.MIN_VALUE)),candidate=x.slice();
        movable.forEach((j,i)=>candidate[j]=clamp(x[j]+step[i]*factor,specs[j].lo,specs[j].hi));
        if(norm(candidate.map((v,i)=>v-x[i]))<=stepTolerance)return finish('stalled','Step tolerance without projected gradient convergence');
        const next=at(candidate);
        if(next.valid&&next.cost<current.cost){x=candidate;current=next;lambda=Math.max(1e-12,lambda/3);acceptedSteps++;accepted=true;break;}
        lambda*=10;
      }
      if(!accepted)return finish('stalled','No decreasing valid damped step');
    }
    return finish('iteration_limit','Iteration limit reached');
  }
  return Object.freeze({evaluate,fit,fields:Object.freeze(fields.slice())});
}));

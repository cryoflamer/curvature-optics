/* Bounded multi-seed calibration. The final score is always Accurate;
 * approximate projection is only a proposal, never an acceptance criterion. */
(function(root,factory){
  const api=factory(root.CurvatureCameraPerspectiveSeed||require('./CameraPerspectiveSeed'),
    root.CurvatureCameraFocalSweep||require('./CameraFocalSweep'),
    root.CurvatureCameraPhysicalPose||require('./CameraPhysicalPose'),
    root.CurvatureCameraPhysicalFit||require('./CameraPhysicalFit'),
    root.CurvatureSurfaceGeometry||require('../geometry/CurvatureSurfaceGeometry'),
    root.CurvatureGeometryEngine||require('../geometry/CurvatureGeometryEngine'));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureCameraCalibration=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(dlt,sweep,bridge,physical,surfaces,engine){
  'use strict';
  const fields=physical.fields, focal='FocalLengthField';
  const finite=v=>Number.isFinite(v);
  function integer(v,min,max,name){if(!Number.isInteger(v)||v<min||v>max)throw RangeError('Invalid '+name);return v;}
  function records(input,seen){
    if(!Array.isArray(input))throw TypeError('Observations must be an array');
    return input.map(o=>{
      const p=o&&o.landmark,kind=o?.kind??'metric';
      if(!p||typeof p.id!=='string'||!p.id.trim()||seen.has(p.id)||!Array.isArray(o.pixel)||o.pixel.length!==2||!o.pixel.every(finite)||
        !finite(o.weight??1)||(o.weight??1)<=0)throw TypeError('Invalid or duplicate observation');
      if(kind==='metric'?(![p.east,p.north,p.height].every(finite)||p.height<0):
        kind==='vertex'?(![p.bank,p.objectType,p.primitive,p.vertex].every(Number.isInteger)||![0,1].includes(p.bank)||p.primitive<0||p.vertex<0):true)throw TypeError('Invalid landmark');
      seen.add(p.id);return {...o,kind,landmark:{...p},pixel:o.pixel.slice()};
    });
  }
  // Exactly the Accurate optics-neutral mesh authoring, at zero observer
  // height, before recentering. Never use a screen location as a world point.
  function cartesian(model,obs){
    const globe=model.showModel===1,k=globe?1/model.rEarth:0,s=surfaces.createFromCurvature(k),banks=new Map();
    return obs.map(o=>{
      const p=o.landmark;let world;
      if(o.kind==='metric'){
        if(globe&&Math.hypot(p.east,p.north)*k>=Math.PI/2)throw RangeError('Landmark outside local Globe domain');
        world=s.surfacePoint3(p.east,p.north,p.height);
      }else{
        if(!banks.has(p.bank)){
          const scene=engine.createObjectSequenceScene({...model,Height:0,geometryRadius:model.rEarth},p.bank,globe,{opticsNeutral:true,physicalSurface:true,curvature:k});
          if(scene.metadata.objectCount!==model.NObjects[p.bank]*(model.ObjSideType[p.bank]===1?2:1))throw RangeError('Truncated landmark topology');
          banks.set(p.bank,scene.primitives);
        }
        if(p.objectType!==model.ObjType[p.bank]||!banks.get(p.bank)[p.primitive]?.points[p.vertex])throw RangeError('Invalid landmark topology');
        world=banks.get(p.bank)[p.primitive].points[p.vertex].slice();
      }
      return {world,pixel:o.pixel.slice()};
    });
  }
  function distance(a,b,span){
    const angle=(x,y)=>Math.abs(((x-y+540)%360)-180);
    return Math.max(Math.hypot(a.CameraEast-b.CameraEast,a.CameraNorth-b.CameraNorth,a.Height-b.Height)/Math.max(1,span*.02),
      angle(a.Pan,b.Pan)/2,Math.abs(a.Nick-b.Nick)/2,angle(a.Roll,b.Roll)/2,Math.abs(Math.log(a[focal]/b[focal]))/.1);
  }
  function brief(r){return {status:r.status,reason:r.reason,rmsPx:r.evaluation.rmsPx,weightedRmsPx:r.evaluation.weightedRmsPx,iterations:r.iterations,evaluations:r.evaluations};}
  function calibrate(model,input,options){
    options=options||{};const {width,height}=options;
    if(!model||![1,2].includes(model.showModel)||!finite(model.rEarth)||model.rEarth<=0||!finite(model.rFEarth)||model.rFEarth<=0)throw RangeError('Invalid physical model');
    integer(width,1,Number.MAX_SAFE_INTEGER,'raster width');integer(height,1,Number.MAX_SAFE_INTEGER,'raster height');
    const budget=integer(options.maxCandidates??8,1,32,'candidate budget'),approx=options.useApproximate??true;
    if(typeof approx!=='boolean')throw TypeError('Invalid useApproximate');
    if(options.method!==undefined&&options.method!=='accurate')throw RangeError('Final method must be Accurate');
    if(options.maxIterations!==undefined)integer(options.maxIterations,0,500,'iteration limit');
    if(options.step!==undefined&&(!finite(options.step)||options.step<=0))throw RangeError('Invalid RK4 step');
    if(options.scales!==undefined&&(!options.scales||typeof options.scales!=='object'||Array.isArray(options.scales)||Object.entries(options.scales).some(([k,v])=>!fields.includes(k)||!finite(v)||v<=0)))throw RangeError('Invalid scales');
    const atmosphere=options.atmosphere??'vacuum';
    if(!['vacuum','standard','temperature-lapse'].includes(atmosphere))throw RangeError('Unsupported atmosphere');
    const seen=new Set(),obs=records(input,seen),held=records(options.validation??[],seen);
    if(!obs.length)throw TypeError('Calibration observations required');
    const free=options.freeParameters??fields.slice(),fixed=options.fixedParameters??{},bounds=options.bounds??{};
    if(!Array.isArray(free)||new Set(free).size!==free.length||free.some(k=>!fields.includes(k))||!fixed||typeof fixed!=='object'||Array.isArray(fixed)||!bounds||typeof bounds!=='object'||Array.isArray(bounds))throw RangeError('Invalid physical constraints');
    if(Object.keys(fixed).some(k=>!fields.includes(k)||free.includes(k))||fields.some(k=>!free.includes(k)&&!finite(fixed[k])))throw RangeError('Explicit fixed values required for every locked parameter');
    for(const [k,b] of Object.entries(bounds))if(!fields.includes(k)||!Array.isArray(b)||b.length!==2||!b.every(finite)||b[0]>b[1]||(free.includes(k)&&b[0]===b[1])||(!free.includes(k)&&(fixed[k]<b[0]||fixed[k]>b[1])))throw RangeError('Invalid bounds for '+k);
    const exactOptions={width,height,atmosphere,temperatureProfile:options.temperatureProfile,step:options.step,freeParameters:free,bounds,scales:options.scales,maxIterations:options.maxIterations,method:'accurate'};
    const fastOptions={...exactOptions,method:'canvas-direct'};
    const world=cartesian(model,obs);cartesian(model,held); // validate identity without using validation pixels
    const ext=[0,1,2].map(j=>world.reduce(([a,b],o)=>[Math.min(a,o.world[j]),Math.max(b,o.world[j])],[Infinity,-Infinity]));
    const span=Math.hypot(...ext.map(([a,b])=>b-a));
    const diagonal=Math.hypot(width,height),seedOptions={width,height,minFocalPx:options.minFocalPx??diagonal/4,maxFocalPx:options.maxFocalPx??diagonal*128,samples:options.samples??33};
    const sources=[dlt.initialize(world,seedOptions),sweep.initialize(world,seedOptions)];
    const diagnostics={generators:sources.map((s,i)=>({method:i?'focal-sweep-p3p':'dlt-or-homography',status:s.status,reason:s.reason,generated:s.candidates.length})),rejected:{},eligible:0,selected:0,omitted:0};
    const reject=reason=>{diagnostics.rejected[reason]=(diagnostics.rejected[reason]||0)+1;};
    const pools=[[],[],[]];
    function add(p,source,seedRmsPx,pool){
      if(!p||fields.some(k=>!finite(p[k])))throw TypeError('Complete initial pose required');
      const pose={...Object.fromEntries(fields.map(k=>[k,p[k]])),...fixed,deviceRatio:width/height,viewcenterHorizon:3};
      if(Object.entries(bounds).some(([k,b])=>pose[k]<b[0]||pose[k]>b[1])){reject('outside user bounds');return;}
      try{bridge.photoCamera({...model,...pose},width,height);}catch(e){if(!(e instanceof RangeError))throw e;reject(e.message);return;}
      pool.push({pose,source,seedRmsPx});
    }
    const initial=options.initialPoses??[];
    if(!Array.isArray(initial)||initial.length>32)throw RangeError('Invalid initial poses');
    if(!free.length)add(fixed,'fixed',null,pools[0]);
    initial.forEach(p=>add(p,'user',null,pools[0]));
    for(let i=0;i<sources.length;i++)for(const s of sources[i].candidates){
      let p;try{p=bridge.fromPerspective(s,model,width,height).pose;}catch(e){if(!(e instanceof RangeError))throw e;reject(e.message);continue;}
      add(p,s.method,s.rmsPx,pools[i+1]);
    }
    diagnostics.eligible=pools.reduce((n,p)=>n+p.length,0);
    // Reserve a slot for each source when possible. Then take the lowest-error
    // substantially different seeds across pools before filling unused slots.
    const selected=[],all=pools.flat();
    const distinct=(a,threshold)=>selected.every(b=>distance(a.pose,b.pose,span)>threshold);
    function take(a){selected.push(a);}
    for(const pool of pools)if(selected.length<budget&&pool.length&&distinct(pool[0],1e-7))take(pool[0]);
    const ordered=all.slice().sort((a,b)=>(a.seedRmsPx??-1)-(b.seedRmsPx??-1));
    for(const threshold of [1,.0000001])for(const a of ordered){if(selected.length>=budget)break;if(distinct(a,threshold))take(a);}
    diagnostics.selected=selected.length;diagnostics.omitted=diagnostics.eligible-selected.length;
    const attempts=[],candidates=[];
    for(const s of selected){
      const baseline=physical.evaluate(model,s.pose,obs,exactOptions);
      let bestPose=s.pose,best=baseline,approximate=null,refined=null;
      if(approx&&atmosphere!=='vacuum'){
        let fast;
        try{fast=physical.fit(model,s.pose,obs,fastOptions);approximate=brief(fast);}
        catch(e){if(!(e instanceof RangeError))throw e;approximate={status:'unavailable',reason:e.message,rmsPx:null,weightedRmsPx:null};}
        if(fast?.evaluation.valid){const check=physical.evaluate(model,fast.pose,obs,exactOptions);approximate.accurateRmsPx=check.rmsPx;approximate.accurateValid=check.valid;
          if(check.valid&&(!best.valid||check.cost<best.cost)){best=check;bestPose=fast.pose;}}
      }
      if(best.valid){const r=physical.fit(model,bestPose,obs,exactOptions);refined=brief(r);
        if(r.evaluation.valid&&r.evaluation.cost<=best.cost){best=r.evaluation;bestPose=r.pose;}}
      const attempt={source:s.source,seedPose:s.pose,seedRmsPx:s.seedRmsPx,initialAccurateRmsPx:baseline.rmsPx,approximate,refined,valid:best.valid,reason:best.reason};
      attempts.push(attempt);
      if(best.valid)candidates.push({source:s.source,pose:bestPose,evaluation:best,attempt:attempts.length-1,termination:refined?.status??'not_refined'});
    }
    candidates.sort((a,b)=>a.evaluation.cost-b.evaluation.cost||a.attempt-b.attempt);
    // Do not use held-out observations for candidate selection or seed generation.
    for(const candidate of candidates)candidate.validation=held.length?physical.evaluate(model,candidate.pose,held,exactOptions):null;
    return {status:candidates.length?'candidates':selected.length?'no_valid_fit':'no_seed',complete:false,method:'accurate',atmosphere,diagnostics,attempts,candidates};
  }
  return Object.freeze({calibrate});
}));

/* Immutable, content-bound calibration result. No DOM, storage or Scene mutation.
 * Reuse the portable experiment validator; keep evidence bytes in the image library.
 */
(function(root,factory){
  const api=factory(
    root.CurvatureModernPhotoCalibrationEditor||require('./ModernPhotoCalibrationEditor'),
    root.CurvatureModernReferenceImage||require('../../animation/ModernReferenceImage'),
    root.CurvatureModernReferenceImageImport||require('./ModernReferenceImageImport'),
    root.CurvatureCameraMaterialAnchorResolver||require('../../calibration/CameraMaterialAnchorResolver'),
    root.CurvatureCameraPhysicalPose||require('../../calibration/CameraPhysicalPose'));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernCalibrationResult=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(editor,images,importer,resolver,physicalPose){
  'use strict';
  const FORMAT='curvature-calibration-result',VERSION=1;
  const CAMERA=['CameraEast','CameraNorth','Height','Pan','Nick','Roll','FocalLengthField'];
  const PROFILE=['temperatureC','pressureHpa','gradientKPerKm'];
  const STATUSES=['converged','stalled','iteration_limit','fixed','underdetermined','stopped','interrupted','candidate'];
  const ATTRIBUTION=['title','description','author','sourceUrl','license','cameraMetadata','notes'];
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const object=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
  function fail(message){throw RangeError(message);}
  function shape(o,required,optional=[]){
    if(!object(o)||required.some(k=>!own(o,k))||Object.keys(o).some(k=>!required.includes(k)&&!optional.includes(k)))
      fail('Invalid calibration result fields');
  }
  function note(v,max=1000){
    if(typeof v!=='string'||v.length>max)fail('Invalid calibration result text');
    return v;
  }
  function pick(o,keys){
    return Object.fromEntries(keys.filter(k=>own(o,k)).map(k=>[k,o[k]]));
  }
  function count(n){
    if(!Number.isSafeInteger(n)||n<0)fail('Invalid calibration result counter');
    return n;
  }
  function canonical(v){
    if(v===null||typeof v==='boolean'||typeof v==='string')return JSON.stringify(v);
    if(typeof v==='number'){if(!Number.isFinite(v))fail('Nonfinite calibration result value');return JSON.stringify(v);}
    if(Array.isArray(v)){
      if(Array.from(v).some(x=>x===undefined))fail('Sparse calibration result array');
      return '['+v.map(canonical).join(',')+']';
    }
    if(object(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
    fail('Invalid calibration result value');
  }
  // Versioned sorted-key JSON, ASCII escaping every non-ASCII UTF-16 code
  // unit; hashing uses the tested SHA-256 implementation for bank signatures.
  function canonicalContent(payload){
    const json=canonical(payload).replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
    if(json.length>16*1024*1024)fail('Calibration result exceeds size limit');
    return 'curvature-calibration-result:v1\n'+json;
  }
  function freeze(v){
    if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}
    return v;
  }
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function provenance(reference,source,projectId){
    const attribution=images.validateAttribution(pick(reference,ATTRIBUTION));
    let context=null;
    if(source!==null&&source!==undefined){
      if(!object(source)||!Array.isArray(source.links)||source.links.length>256)fail('Invalid calibration source provenance');
      context={links:source.links.map(v=>note(v,1000))};
      for(const k of ['source','id','demoId','key']){
        if(source[k]!==undefined&&source[k]!==null)context[k]=note(source[k],1000);
      }
      if(source.imported===true)context.imported=true;
    }
    if(projectId!==null&&projectId!==undefined&&
      (typeof projectId!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(projectId)))fail('Invalid calibration project ID');
    return {attribution,referenceAlias:images.validId(reference.id),source:context,projectId:projectId??null};
  }
  function sceneOf(data){
    const m=data.scene.model,p=data.scene.physics;
    const model=pick(m,['showModel','rEarth','rFEarth',...CAMERA,...resolver.LAYOUT]);
    model.viewcenterHorizon=3;
    if(own(m,'deviceRatio')){
      if(!Number.isFinite(m.deviceRatio)||m.deviceRatio<=0)fail('Invalid captured display aspect');
      model.deviceRatio=m.deviceRatio;
    }
    const physics={atmosphere:p.atmosphere};
    if(p.temperatureProfile!==undefined&&p.temperatureProfile!==null){
      if(!object(p.temperatureProfile))fail('Invalid captured temperature profile');
      physics.temperatureProfile=pick(p.temperatureProfile,PROFILE);
      if(Object.values(physics.temperatureProfile).some(v=>!Number.isFinite(v)))fail('Invalid captured temperature profile');
    }
    return {model,physics};
  }
  function close(a,b){
    return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));
  }
  function candidateOf(data,scene,rows,identity){
    const fit=data.fit,r=fit.result;
    if(fit.running)fail('Stop the running calibration before archiving');
    if(!r)fail('A valid calibration result is required');
    const fitRows=editor.fitRows(rows);
    if(!fitRows.length)fail('Calibration result requires Fit observations');
    if(r.method!==undefined&&r.method!==fit.method||
       r.atmosphere!==undefined&&r.atmosphere!==scene.physics.atmosphere||
       r.freeParameters!==undefined&&canonical(r.freeParameters)!==canonical(fit.freeParameters))
      fail('Stored fit configuration mismatch');
    const pose=pick(r.pose,CAMERA),model=scene.model,w=identity.width,h=identity.height;
    physicalPose.photoCamera(model,w,h);
    physicalPose.photoCamera({...model,...pose},w,h);
    let status=r.status??'candidate';
    // The progress object has no terminal status. Preserve an explicit
    // stopped/interrupted draft without inferring numerical convergence.
    if(/^Stopped\b/i.test(fit.status))status='stopped';
    else if(/^Imported interrupted fit\b/i.test(fit.status))status='interrupted';
    if(!STATUSES.includes(status))fail('Invalid stored calibration status');
    const evaluation=r.evaluation;
    let sum=0,weighted=0,weights=0;
    const points=evaluation.points.map((p,i)=>{
      const row=fitRows[i],residual=p.predicted.map((v,j)=>v-row.pixel[j]);
      const square=residual[0]*residual[0]+residual[1]*residual[1];
      sum+=square;weighted+=row.weight*square;weights+=row.weight;
      const state=p.status??'unknown';
      if(!['visible','out_of_frame','unknown'].includes(state))fail('Invalid valid-fit point status');
      if(p.residual!==undefined&&(!Array.isArray(p.residual)||p.residual.length!==2||
        p.residual.some((v,j)=>!close(v,residual[j]))))fail('Stored fit residual mismatch');
      return {id:row.landmark.id,status:state,observed:row.pixel.slice(),
        predicted:p.predicted.slice(),residual,weight:row.weight};
    });
    if(!close(evaluation.rmsPx,Math.sqrt(sum/points.length))||
       !close(evaluation.weightedRmsPx,Math.sqrt(weighted/weights))||
       !close(evaluation.cost,weighted/2))fail('Stored fit evaluation metrics mismatch');
    const out={status,reason:r.reason==null?null:note(r.reason),pose,
      method:fit.method,atmosphere:scene.physics.atmosphere,initialRmsPx:r.initialRmsPx,
      evaluations:count(r.evaluations),acceptedSteps:count(r.acceptedSteps),
      freeParameters:fit.freeParameters.slice(),evaluation:{valid:true,rmsPx:evaluation.rmsPx,
        weightedRmsPx:evaluation.weightedRmsPx,cost:evaluation.cost,points}};
    if(r.iterations!==undefined)out.iterations=count(r.iterations);
    if(r.materialBinding!==undefined)out.materialBinding=r.materialBinding;
    return out;
  }
  function payloadOf(data,identity){
    const scene=sceneOf(data),topology=resolver.create(scene.model);
    const observations=data.observations.map(row=>{
      const landmark=own(row.landmark,'anchor')?row.landmark:
        pick(row.landmark,['id','bank','objectType','primitive','vertex']);
      if(!own(landmark,'anchor')){
        if(landmark.id!=='b'+landmark.bank+':p'+landmark.primitive+':v'+landmark.vertex)
          fail('Legacy vertex identity mismatch');
        topology.upgradeLegacy(landmark);
      }
      return {kind:row.kind,landmark,pixel:row.pixel.slice(),weight:row.weight,included:row.included};
    });
    return {photo:identity,scene,observations,fit:{method:data.fit.method,maxIterations:data.fit.maxIterations,
      freeParameters:data.fit.freeParameters.slice(),result:candidateOf(data,scene,observations,identity)}};
  }
  function recordOf(payload,source){
    const digest=resolver.sha256Ascii(canonicalContent(payload));
    return freeze({format:FORMAT,version:VERSION,id:'calibration-result-v1-'+digest,digest,payload,provenance:source});
  }
  async function create(input,env,{projectId=null}={}){
    // Capture and validate all scientific input before the asynchronous image
    // decode/hash. Neither subsequent draft edits nor alias changes can
    // mutate the captured result.
    const data=editor.validateExperiment(input,images.validate);
    if(data.fit.running||!data.fit.result)fail('Stop calibration and retain a valid candidate before archiving');
    const source=provenance(data.referenceImage,data.referenceSource,projectId);
    const identity=await importer.identify(data.referenceImage,env);
    return recordOf(payloadOf(data,identity),source);
  }
  function validate(record){
    shape(record,['format','version','id','digest','payload','provenance']);
    if(record.format!==FORMAT||record.version!==VERSION)fail('Unsupported calibration result format/version');
    const p=record.payload,s=record.provenance;
    shape(p,['photo','scene','observations','fit']);
    shape(s,['attribution','referenceAlias','source','projectId']);
    const photo=images.validateIdentity(p.photo);
    // Reuse existing scene/observation/result checks without synthesizing
    // image bytes. Resolving the original is a separate verified operation.
    const data=editor.validateExperiment({format:'curvature-photo-calibration',version:3,
      scene:p.scene,referenceImage:{original:{width:photo.width,height:photo.height}},
      observations:p.observations,fit:{...p.fit,status:p.fit?.result?.status,running:false}},x=>x);
    const normalized=payloadOf(data,photo);
    const source=provenance({...images.validateAttribution(s.attribution),id:s.referenceAlias},s.source,s.projectId);
    if(canonical(p)!==canonical(normalized)||canonical(s)!==canonical(source))fail('Noncanonical calibration result');
    const expected=recordOf(normalized,source);
    if(record.id!==expected.id||record.digest!==expected.digest)fail('Calibration result digest mismatch');
    return expected;
  }
  function sameContent(a,b){
    const left=validate(a),right=validate(b);
    return left.id===right.id&&canonicalContent(left.payload)===canonicalContent(right.payload);
  }
  function summary(record){
    const {payload:p,id,digest}=validate(record),r=p.fit.result;
    const fitCount=editor.fitRows(p.observations).length;
    return freeze({id,digest,photo:p.photo,method:p.fit.method,status:r.status,
      fitCount,validationCount:p.observations.length-fitCount,rmsPx:r.evaluation.rmsPx,
      weightedRmsPx:r.evaluation.weightedRmsPx,initialRmsPx:r.initialRmsPx});
  }
  // Created from the full validated result, never from current live inputs.
  // Target is the historical application association, not the selected editor.
  function origin(record,target){
    if(!['Scene','A','B'].includes(target))fail('Invalid calibration origin target');
    const validated=validate(record),p=validated.payload,r=p.fit.result;
    const fitCount=editor.fitRows(p.observations).length;
    return freeze({version:1,target,resultId:validated.id,resultDigest:validated.digest,photo:p.photo,
      baselineCamera:{...r.pose,viewcenterHorizon:3},historicalFit:{method:p.fit.method,status:r.status,
        fitCount,validationCount:p.observations.length-fitCount,rmsPx:r.evaluation.rmsPx,
        weightedRmsPx:r.evaluation.weightedRmsPx,initialRmsPx:r.initialRmsPx}});
  }
  return Object.freeze({FORMAT,VERSION,create,validate,sameContent,summary,origin,canonicalContent});
}));

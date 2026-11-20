/* Photo-free Calibration Project checkpoints. Pure extraction plus verified
 * Reference Image Library hydration; no editor or History mutation here.
 */
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(
    node?require('./ModernCalibrationProject'):root.CurvatureModernCalibrationProject,
    node?require('../../animation/ModernReferenceImage'):root.CurvatureModernReferenceImage,
    node?require('../../animation/ModernReferenceImageLibrary'):root.CurvatureModernReferenceImageLibrary,
    node?require('./ModernReferenceImageImport'):root.CurvatureModernReferenceImageImport,
    node?require('./ModernPhotoCalibrationEditor'):root.CurvatureModernPhotoCalibrationEditor);
  if(node)module.exports=api;
  root.CurvatureModernCalibrationProjectCheckpoint=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(projects,images,library,importer,editor){
  'use strict';
  const VERSION=1;
  const CAMERA=['CameraEast','CameraNorth','Height','Pan','Nick','Roll','FocalLengthField'];
  const DRAFT_FIELDS=['version','scene','record','activeSource','rows','pending',
    'pendingModel','activePair','editing','explicitAdd','view','physicalSessionId',
    'undoStack','redoStack','selectedOwner','weight','freeParameters','fitBest',
    'fitStatus','viewBest','stage','resultCamera','resultViews','residualMode'];
  function object(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
  function fields(v,keys){
    if(!object(v)||Object.keys(v).some(k=>!keys.includes(k))||
       keys.some(k=>!Object.prototype.hasOwnProperty.call(v,k)))
      throw RangeError('Invalid calibration checkpoint fields');
  }
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function view(v){
    if(v===null)return null;
    if(!object(v)||Object.keys(v).some(k=>!['scale','x','y'].includes(k))||
       !Number.isFinite(v.scale)||v.scale<=0||!Number.isFinite(v.x)||!Number.isFinite(v.y))
      throw RangeError('Invalid saved calibration viewport');
    return {scale:v.scale,x:v.x,y:v.y};
  }
  function recordMetadata(record){
    if(!record)return null;
    const out={};
    for(const [k,v] of Object.entries(images.validate(record))){
      if(!['original','thumbnail'].includes(k))out[k]=copy(v);
    }
    return out;
  }
  function checkSession(inline,draft){
    if(inline===null)return null;
    fields(inline,['id','photo','sessions']);
    if(typeof inline.id!=='string'||inline.id!==draft.physicalSessionId||
       inline.photo!==(draft.record?.id||null)||!object(inline.sessions)||
       Object.keys(inline.sessions).some(k=>k!=='initial'))
      throw RangeError('Calibration inline session does not match the draft');
    const initial=inline.sessions.initial;
    if(initial!==null){
      fields(initial,['source','session']);
      if(typeof initial.source!=='string'||!object(initial.session))
        throw RangeError('Invalid calibration inline session');
    }
    return copy(inline);
  }
  function validateDraft(d,inline){
    fields(d,DRAFT_FIELDS);
    if(d.version!==2)throw RangeError('Unsupported calibration draft version');
    if(!object(d.scene)||!object(d.scene.model)||!object(d.scene.physics))
      throw RangeError('Invalid calibration draft scene');
    const m=d.scene.model,physics=d.scene.physics;
    if(m.showModel===2)throw Error('Unsupported Flat calibration draft; preserve legacy for recovery');
    if(m.showModel!==1||!Number.isFinite(m.rEarth)||m.rEarth<=0||
       !Number.isFinite(m.rFEarth)||m.rFEarth<=0||
       CAMERA.some(k=>!Number.isFinite(m[k]))||
       !['vacuum','standard','temperature-lapse'].includes(physics.atmosphere))
      throw RangeError('Invalid calibration draft physical scene');
    const record=d.record===null?null:images.validate(d.record);
    if(!Array.isArray(d.rows)||d.rows.length>10000||!Array.isArray(d.undoStack)||
       !Array.isArray(d.redoStack)||d.undoStack.length>50||d.redoStack.length>50||
       !Array.isArray(d.freeParameters)||new Set(d.freeParameters).size!==d.freeParameters.length||
       d.freeParameters.some(x=>!CAMERA.includes(x)))
      throw RangeError('Invalid calibration correspondence or history collection');
    if(d.activeSource!==null&&(!object(d.activeSource)||
       (d.activeSource.links!==undefined&&(!Array.isArray(d.activeSource.links)||
         d.activeSource.links.some(x=>typeof x!=='string')))))
      throw RangeError('Invalid calibration photo source');
    if(typeof d.physicalSessionId!=='string'||!d.physicalSessionId||
       d.physicalSessionId.length>160)
      throw RangeError('Invalid calibration physical session');
    if(typeof d.weight!=='string'||!Number.isFinite(Number(d.weight))||Number(d.weight)<=0||
       typeof d.fitStatus!=='string'||d.fitStatus.length>4000||
       !['correspondences','calibration','result'].includes(d.stage)||
       !['initial','best'].includes(d.resultCamera)||
       !['best','initial','off'].includes(d.residualMode)||
       typeof d.viewBest!=='boolean'||typeof d.explicitAdd!=='boolean'||
       !object(d.resultViews)||Object.keys(d.resultViews).some(x=>!['initial','best'].includes(x))||
       !['initial','best'].every(x=>Object.prototype.hasOwnProperty.call(d.resultViews,x)))
      throw RangeError('Invalid calibration editor checkpoint controls');
    view(d.view);view(d.resultViews.initial);view(d.resultViews.best);
    if(d.activePair!==null&&typeof d.activePair!=='string')throw RangeError('Invalid active calibration pair');
    if(d.editing!==null&&typeof d.editing!=='string')throw RangeError('Invalid editing calibration pair');
    if(d.pending!==null&&(!Array.isArray(d.pending)||d.pending.length!==2||
       d.pending.some(x=>!Number.isFinite(x))))
      throw RangeError('Invalid pending calibration pixel');
    if(d.pendingModel!==null&&!object(d.pendingModel))
      throw RangeError('Invalid pending model correspondence');
    if(d.selectedOwner!==null&&!object(d.selectedOwner))
      throw RangeError('Invalid selected model owner');
    const width=record?.original.width,height=record?.original.height;
    if(record){
      const calibrated=editor.validateExperiment({format:'curvature-photo-calibration',
        version:3,scene:d.scene,referenceImage:record,referenceSource:d.activeSource,
        observations:d.rows,fit:{method:'canvas-direct',maxIterations:80,
          freeParameters:d.freeParameters,result:d.fitBest,status:d.fitStatus,running:false}},
      images.validate);
      if(calibrated.observations.length!==d.rows.length)throw Error('Calibration observation loss');
      if(d.pending&&(d.pending[0]<0||d.pending[0]>=width||
                     d.pending[1]<0||d.pending[1]>=height))
        throw RangeError('Pending photo pixel outside original image');
      if(d.activePair!==null&&!d.rows.some(row=>row.landmark.id===d.activePair))
        throw RangeError('Active calibration pair missing');
      if(d.editing!==null&&!d.rows.some(row=>row.landmark.id===d.editing))
        throw RangeError('Editing calibration pair missing');
      function history(entries){
        for(const item of entries){
          if(!object(item)||!Array.isArray(item.rows)||item.rows.length>10000||
             (item.activePair!==null&&typeof item.activePair!=='string'))
            throw RangeError('Invalid calibration history entry');
          const rows=editor.observationRows(item.rows,width,height,true,m);
          if(item.activePair!==null&&!rows.some(row=>row.landmark.id===item.activePair))
            throw RangeError('Invalid calibration history active pair');
        }
      }
      history(d.undoStack);history(d.redoStack);
    }else{
      if(d.rows.length||d.pending||d.pendingModel||d.fitBest||
         d.undoStack.length||d.redoStack.length)
        throw RangeError('No-photo calibration project cannot contain image correspondences');
    }
    checkSession(inline,d);
    return d;
  }
  function extract(draft,inline,identity){
    const d=copy(draft);
    validateDraft(d,inline);
    if(d.record){
      const checked=images.validateIdentity(identity);
      if(checked.width!==d.record.original.width||
         checked.height!==d.record.original.height)
        throw Error('Photo identity dimensions do not match captured draft');
    }else if(identity!==null)throw RangeError('No-photo project must not claim a photo');
    const source=d.activeSource,sourceKind=source?.imported?'imported':
      ['demo','library','local'].includes(source?.source)?source.source:'unknown';
    const key=typeof source?.key==='string'&&source.key.length<=160&&source.key?
      source.key:null;
    const photo=d.record?{identity,aliasId:d.record.id,source:{kind:sourceKind,key}}:null;
    const metadata=recordMetadata(d.record);
    d.record=null;
    const checkpoint={version:VERSION,payload:{draft:d,recordMetadata:metadata,
      inline:checkSession(inline,draft)}};
    const overview={stage:d.stage,rowCount:d.rows.length,
      fitStatus:d.fitStatus.slice(0,160),fitRmsPx:d.fitBest?.evaluation?.valid&&
        Number.isFinite(d.fitBest.evaluation.rmsPx)?d.fitBest.evaluation.rmsPx:null};
    const id='calibration-project-v1-'+'0'.repeat(32);
    const valid=projects.fresh({id,now:1,photo,checkpoint,overview});
    return {photo:valid.photo,checkpoint:valid.checkpoint,overview:valid.overview};
  }
  async function captureVerified(draft,inline,env,adapter=library,decoder=importer){
    const d=copy(draft);
    validateDraft(d,inline);
    if(!d.record)return extract(d,inline,null);
    if(!env?.crypto||!env?.indexedDB)throw Error('Photo verification needs crypto and Library storage');
    // Asset-first: a durable original may remain after a failed subsequent
    // project save, but no project is ever linked to an unverified image.
    const saved=await adapter.ensureOriginal(env.indexedDB,d.record,env.crypto,
      record=>decoder.verifyOriginal(record,env));
    return extract(d,inline,saved.identity);
  }
  function payloadOf(project){
    const p=projects.normalize(project);
    if(!p.checkpoint)return {project:p,draft:null,inline:null,metadata:null};
    if(p.checkpoint.version!==VERSION)throw RangeError('Unsupported project checkpoint');
    const body=p.checkpoint.payload;
    fields(body,['draft','recordMetadata','inline']);
    const d=body.draft;
    fields(d,DRAFT_FIELDS);
    if(d.record!==null)throw Error('Project checkpoint contains embedded reference photo');
    if(p.photo===null&&body.recordMetadata!==null||
       p.photo!==null&&body.recordMetadata===null)
      throw RangeError('Project photo metadata does not match checkpoint');
    const inline=checkSession(body.inline,{...d,record:p.photo?{id:p.photo.aliasId}:null});
    if(body.recordMetadata!==null){
      const meta=body.recordMetadata;
      if(!object(meta)||Object.keys(meta).some(k=>![
        'version','id','title','description','author','sourceUrl','license','cameraMetadata','notes'
      ].includes(k))||meta.id!==p.photo.aliasId||meta.version!==1||
         typeof meta.title!=='string')
        throw RangeError('Invalid photo attribution in calibration project');
    }
    return {project:p,draft:d,inline,metadata:body.recordMetadata};
  }
  async function prepare(project,env,adapter=library,decoder=importer){
    const {project:p,draft,inline,metadata}=payloadOf(project);
    if(!draft)return Object.freeze({project:p,draft:null,inline:null,photo:null});
    let record=null;
    if(p.photo){
      if(!env?.crypto||!env?.indexedDB)
        throw Error('Photo hydration requires crypto and Library storage');
      const found=await adapter.findOriginal(env.indexedDB,p.photo.identity,env.crypto,
        candidate=>decoder.verifyOriginal(candidate,env));
      if(!found)throw Error('Verified original photograph unavailable; project was not changed');
      // Keep the original draft's attribution/alias independently of the
      // content-addressed Library row's mutable title or local ID.
      record=images.validate({...metadata,original:found.record.original,
        ...(found.record.thumbnail?{thumbnail:found.record.thumbnail}:{})});
      if(record.original.width!==p.photo.identity.width||
         record.original.height!==p.photo.identity.height)
        throw Error('Hydrated original dimensions changed');
      await decoder.verifyOriginal(record,env);
    }
    const restored={...copy(draft),record};
    validateDraft(restored,inline);
    if(restored.rows.length!==p.overview.rowCount||
       restored.stage!==p.overview.stage||
       (restored.fitBest?.evaluation?.rmsPx??null)!==p.overview.fitRmsPx)
      throw Error('Project checkpoint and list overview disagree');
    // Fully prepared, verified, and still not applied to any editor.
    // Stage 8F.7p.5 owns generation-guarded activation.
    return Object.freeze({project:p,draft:restored,inline:copy(inline),photo:record});
  }
  return Object.freeze({VERSION,DRAFT_FIELDS,validateDraft,extract,captureVerified,
    payloadOf,prepare});
}));

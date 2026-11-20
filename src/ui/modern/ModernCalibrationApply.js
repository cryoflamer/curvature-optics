/* Protected Scene / Compare A / Compare B application transaction.
 * Host supplies live snapshot,
 * editor generation/navigation guard, durable storage and synchronous commit.
 * No DOM or renderer access here. Explicit Save Snapshot remains separate.
 */
(function(root,factory){
  const api=factory(
    root.CurvatureModernExperimentState||require('./ModernExperimentState'),
    root.CurvatureModernExperimentFingerprint||require('./ModernExperimentFingerprint'),
    root.CurvatureModernCalibrationTransfer||require('./ModernCalibrationTransfer'),
    root.CurvatureModernCalibrationResult||require('./ModernCalibrationResult'));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernCalibrationApply=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(state,fingerprint,transfer,results){
  'use strict';
  const copy=v=>JSON.parse(JSON.stringify(v));
  function failure(phase,cause,committed=false,rollbackError=null){
    const error=Error(String(cause?.message||cause));
    error.phase=phase;error.committed=committed;error.rollbackError=rollbackError;
    return error;
  }
  function create(host){
    for(const k of ['candidate','snapshot','revision','archive','protect','commit','rollback','present'])
      if(typeof host?.[k]!=='function')throw TypeError('Missing calibration Apply host '+k);
    // A mutable destination selector is optional. If supplied, it must
    // agree with the explicit request for its entire pre-commit lifetime.
    // The host revision also covers destination ABA changes (A -> B -> A).
    if(host.target!==undefined&&typeof host.target!=='function')
      throw TypeError('Invalid calibration Apply host target');
    let busy=false;
    async function apply(target='Scene'){
      if(busy){
        const error=failure('busy','Calibration Apply already in progress');
        if(['Scene','A','B'].includes(target))error.target=target;
        throw error;
      }
      busy=true;
      let phase='prepare',committed=false;
      try{
        // Own the portable candidate before the first await. Check again
        // after every external async step; host revision covers navigation
        // away and back and other operations that restore identical values.
        if(!['Scene','A','B'].includes(target))
          throw Error('Explicit calibration Apply target must be Scene, A or B');
        if(host.target&&host.target()!==target)
          throw Error('Calibration Apply destination does not match the selected target');
        const revision=host.revision(),candidate=copy(host.candidate());
        if(!candidate?.fit?.result||candidate.fit.running)
          throw Error('Stop calibration and retain a valid best camera first');
        const before=state.validate(host.snapshot());
        const candidateStamp=JSON.stringify(candidate),beforeStamp=JSON.stringify(before);
        function current(){
          if((host.target&&host.target()!==target)||host.revision()!==revision||
             JSON.stringify(host.candidate())!==candidateStamp||
             JSON.stringify(state.validate(host.snapshot()))!==beforeStamp)
            throw Error('Calibration draft, experiment, workspace or destination changed; apply again');
        }
        current();
        phase='archive';
        // archiveExperiment must durably resolve original then immutable
        // result; it must reject on failure. No live mutation has occurred.
        const saved=await host.archive(candidate);
        const record=results.validate(saved?.row?.record);
        if(saved.row.id!==record.id||typeof saved.photoId!=='string'||!saved.photoId)
          throw Error('Invalid durable calibration acknowledgement');
        phase='stale';current();
        phase='transfer';
        const next=transfer.transfer(record,before,target);
        phase='recovery';
        const backup=await host.protect(state.validate(before));
        if(!backup?.entry?.pinned||!Number.isSafeInteger(backup.entry.id)||backup.entry.id<1||
           fingerprint.exactSignature(backup.entry.experiment)!==fingerprint.exactSignature(before))
          throw Error('Outgoing experiment was not protected in History');
        phase='stale';current();
        // No await between final validation and physical mutation. Host must
        // synchronously update canonical model only, without navigation or
        // render. A partial commit failure restores the outgoing experiment.
        phase='commit';
        try{
          host.commit(state.validate(next),target);
          committed=true;
        }catch(error){
          let rollbackError=null;
          try{host.rollback(state.validate(before),target);}
          catch(e){rollbackError=String(e?.message||e);}
          throw failure('commit',error,false,rollbackError);
        }
        // Once committed, presentation/render failure is NOT an unapplied
        // calibration. Recovery ID and immutable result remain available.
        phase='present';
        try{
          await host.present({recoveryId:backup.entry.id,resultId:record.id,target});
        }catch(error){
          const e=failure('present',error,true);
          e.recoveryId=backup.entry.id;e.resultId=record.id;throw e;
        }
        return Object.freeze({target,resultId:record.id,photoId:saved.photoId,
          recoveryId:backup.entry.id,reused:saved.reused===true});
      }catch(error){
        const e=error?.phase===phase&&typeof error.committed==='boolean'?
          error:failure(phase,error,committed);
        if(['Scene','A','B'].includes(target))e.target=target;
        throw e;
      }finally{busy=false;}
    }
    return Object.freeze({apply,isBusy:()=>busy});
  }
  return Object.freeze({create});
}));

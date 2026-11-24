/* Headless, generation-bound Calibration Project persistence coordinator.
 * No editor/DOM mutation and no localStorage fallback for photo bytes.
 * Stage 8F.7p.5 owns guarded activation of prepared projects in the editor.
 */
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(
    node?require('./ModernCalibrationProject'):root.CurvatureModernCalibrationProject,
    node?require('./ModernCalibrationProjectStore'):root.CurvatureModernCalibrationProjectStore,
    node?require('./ModernCalibrationProjectCheckpoint'):root.CurvatureModernCalibrationProjectCheckpoint);
  if(node)module.exports=api;
  root.CurvatureModernCalibrationProjectPersistence=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(model,store,checkpoint){
  'use strict';
  function copy(value){return JSON.parse(JSON.stringify(value));}
  function projectReference(project){
    const value=model.normalize(project);
    return Object.freeze({id:value.id,revision:'rev:'+value.revision,recovery:null});
  }
  // One verified domain preflight for both ordinary Open and shared-session
  // selection. A matching revision alone is insufficient if bytes changed.
  async function prepareExact(env,id,{storage=store,adapter,decoder,
    expectedRevision=null,guard=()=>true,requireCheckpoint=false}={}){
    model.id(id);
    if(typeof guard!=='function')throw TypeError('Invalid project activation guard');
    function current(){
      if(guard()!==true)throw Error('Stale or unsaved calibration activation; active editor was not changed');
    }
    current();
    const before=await storage.get(env.indexedDB,id);current();
    if(!before)throw Error('Calibration project missing; active editor was not changed');
    if(expectedRevision!==null&&projectReference(before).revision!==expectedRevision)
      throw Error('Calibration project revision changed; active editor was not changed');
    const prepared=await checkpoint.prepare(before,env,adapter,decoder);current();
    if(requireCheckpoint&&!prepared.draft)
      throw Error('Calibration project has no verified editor checkpoint');
    const after=await storage.get(env.indexedDB,id);current();
    if(!after||JSON.stringify(model.normalize(after))!==JSON.stringify(model.normalize(before)))
      throw Error('Calibration project changed during activation preparation');
    return prepared;
  }
  async function prepareSharedSelection(env,reference,options={}){
    if(!reference||Object.keys(reference).length!==3||reference.recovery!==null||
       typeof reference.revision!=='string'||!/^rev:[1-9][0-9]*$/.test(reference.revision))
      throw Error('Unsupported Calibration selection or recovery reference');
    return prepareExact(env,reference.id,{...options,expectedRevision:reference.revision,requireCheckpoint:true});
  }
  function sharedDocumentReader(env,options={}){
    return async function(kind,id){
      if(kind!=='calibration')throw Error('Unsupported auxiliary document kind: '+kind);
      const prepared=await prepareExact(env,id,{...options,requireCheckpoint:true});
      const reference=projectReference(prepared.project);
      return {kind,id:reference.id,revision:reference.revision};
    };
  }
  function create(env,{adapter,decoder,storage=store,clock=()=>Date.now(),onChange=null,
    sharedSelection=null}={}){
    if(!env?.indexedDB||!env?.crypto)
      throw Error('Calibration Project persistence requires IndexedDB and crypto');
    if(typeof clock!=='function'||(onChange!==null&&typeof onChange!=='function'))
      throw TypeError('Invalid Calibration Project persistence callback');
    if(sharedSelection&&(!sharedSelection.lease||sharedSelection.lease.sessionId!=='shared'||
       typeof sharedSelection.lease.check!=='function'||typeof sharedSelection.lease.track!=='function'||
       typeof sharedSelection.acknowledge!=='function'))
      throw TypeError('Invalid shared Calibration selection coordinator');
    function checkLifetime(){if(sharedSelection)sharedSelection.lease.check(true);}
    let active=null,epoch=0,sequence=0,tail=Promise.resolve();
    function state(){
      return Object.freeze({projectId:active?.project.id??null,
        revision:active?.project.revision??null,generation:active?.generation??epoch,
        pending:active?.pending??0,unsaved:!!active?.latest,
        recoverable:!!active?.latest,error:active?.error??null,
        lastAck:active?.lastAck??null,
        ...(sharedSelection?{selectionPending:active?.selectionPending?
          {previous:projectReference(active.selectionPending.previous),
            current:projectReference(active.selectionPending.project),
            status:active.selectionPending.status}:null}:{})});
    }
    function notify(){
      // Observation must never turn an acknowledged IndexedDB commit into a failure.
      if(onChange)try{onChange(state());}catch(_ignored){}
    }
    function bind(project){
      checkLifetime();
      if(active&&(active.pending||active.latest||active.selectionPending))
        throw Error('Unsaved or pending calibration work must be resolved before switching projects');
      const validated=model.normalize(project);
      active={project:validated,generation:++epoch,pending:0,
        latest:null,error:null,lastAck:null,selectionPending:null,tasks:new Map()};
      notify();return state();
    }
    function mark(draft,inline=null,changes={}){
      checkLifetime();
      if(!active)throw Error('No bound Calibration Project');
      if(!changes||typeof changes!=='object'||Array.isArray(changes)||
         Object.keys(changes).some(k=>!['title','resultIds'].includes(k)))
        throw RangeError('Invalid Calibration Project working metadata');
      checkpoint.validateDraft(draft,inline);
      const title=changes.title??active.project.title;
      const resultIds=changes.resultIds??active.project.resultIds;
      // Validate title and links before we replace the recoverable snapshot.
      model.fresh({id:active.project.id,now:active.project.createdAt,title,resultIds});
      const captured={projectId:active.project.id,generation:active.generation,
        sequence:++sequence,draft:copy(draft),inline:inline===null?null:copy(inline),
        title,resultIds:copy(resultIds)};
      active.latest=captured;active.error=null;
      notify();return state();
    }
    async function finishSelection(owner){
      const receipt=owner.selectionPending;
      if(!receipt)return null;
      checkLifetime();
      if(owner!==active)throw Error('Stale calibration selection generation');
      // The domain transaction already committed. Retrying this step must
      // never save/fork the project a second time or infer a new CAS base.
      await sharedSelection.acknowledge(Object.freeze({
        previous:projectReference(receipt.previous),current:projectReference(receipt.project),
        status:receipt.status,generation:owner.generation}));
      checkLifetime();
      if(owner!==active)throw Error('Stale calibration selection generation');
      owner.selectionPending=null;
      owner.lastAck={status:receipt.status,id:receipt.project.id,revision:receipt.project.revision};
      if(owner.latest?.sequence===receipt.sequence)owner.latest=null;
      owner.error=null;
      return receipt;
    }
    function save(retrying=false){
      if(!active)throw Error('No bound Calibration Project');
      const owner=active,captured=owner.latest;
      if(!captured)return Promise.resolve({status:'clean',project:model.normalize(owner.project),current:true});
      const running=owner.tasks.get(captured.sequence);
      if(running)return running;
      owner.pending++;notify();
      const work=tail.then(async()=>{
        if(owner.generation!==captured.generation||owner!==active)
          throw Error('Stale calibration generation; save was not redirected');
        checkLifetime();
        if(owner.selectionPending){
          if(!retrying)throw Error('Shared Calibration selection acknowledgement pending; explicit retry required');
          const receipt=await finishSelection(owner);
          if(receipt.sequence===captured.sequence)return {
            status:receipt.status,project:model.normalize(receipt.project),current:true};
        }
        // Verified original is staged before the project transaction.
        // Captured draft, including both views and pending Undo/Redo, is immutable
        // with respect to subsequent editor events and another tab's selection.
        const parts=await checkpoint.captureVerified(captured.draft,captured.inline,
          env,adapter,decoder);
        checkLifetime();
        const expected=owner.project;
        const changes={title:captured.title,photo:parts.photo,
          checkpoint:parts.checkpoint,overview:parts.overview,resultIds:captured.resultIds};
        const forkId=model.createId(env.crypto);
        // Resolves only after the atomic record+summary IDB transaction commits.
        const result=await storage.saveOrFork(env.indexedDB,expected.id,expected.revision,
          changes,forkId,clock(),sharedSelection?.lease??null);
        const durable=model.normalize(result.project);
        if(!['updated','forked'].includes(result.status))
          throw Error('Unknown calibration storage acknowledgement');
        if(owner===active&&owner.generation===captured.generation){
          owner.project=durable;
          if(sharedSelection){
            owner.selectionPending={status:result.status,previous:expected,project:durable,
              sequence:captured.sequence};
            await finishSelection(owner);
          }else{
            owner.lastAck={status:result.status,id:durable.id,revision:durable.revision};
            if(owner.latest?.sequence===captured.sequence)owner.latest=null;
            owner.error=null;
          }
        }
        return {status:result.status,project:durable,
          current:owner===active&&owner.generation===captured.generation};
      }).catch(error=>{
        if(owner===active&&owner.generation===captured.generation){
          owner.error=String(error.message||error);
          // Keep latest raw draft for explicit retry/export, never put it in localStorage.
        }
        throw error;
      }).finally(()=>{
        owner.pending--;owner.tasks.delete(captured.sequence);notify();
      });
      owner.tasks.set(captured.sequence,work);
      tail=work.catch(()=>{});
      return work;
    }
    // Side-effect-free incoming activation preflight. Callers must still
    // synchronously recheck their editor generation and commit only after
    // the existing editor has durably saved its outgoing checkpoint.
    async function prepareOpen(id,guard=()=>true){
      model.id(id);
      if(typeof guard!=='function')throw TypeError('Invalid project activation guard');
      const owner=active,expectedEpoch=epoch,expectedSequence=sequence;
      function assertCurrent(){
        if(active!==owner||epoch!==expectedEpoch||sequence!==expectedSequence||
           active&&(active.pending||active.latest||active.selectionPending)||guard()!==true)
          throw Error('Stale or unsaved calibration activation; active editor was not changed');
      }
      assertCurrent();
      return prepareExact(env,id,{storage,adapter,decoder,guard:()=>{assertCurrent();return true;}});
    }
    function discard(){
      if(!active)throw Error('No bound Calibration Project');
      if(active.pending||active.selectionPending)
        throw Error('Cannot discard calibration edits during a pending save or selection acknowledgement');
      active.latest=null;active.error=null;notify();return state();
    }
    // Bind an immutable archived result to one guarded project generation.
    // Save failure retains the full checkpoint for explicit retry or export.
    function linkResult(resultId,draft,inline,expected){
      const selected=state(),owner=active;
      if(!expected||!owner||selected.projectId!==expected.projectId||
         selected.generation!==expected.generation||selected.pending||selected.unsaved)
        throw Error('Calibration Project changed or has unsaved work; archived result was not linked');
      const ids=owner.project.resultIds;
      const linked=ids.includes(resultId)?ids:ids.concat(resultId);
      model.fresh({id:owner.project.id,now:owner.project.createdAt,resultIds:linked});
      if(ids.includes(resultId))
        return Promise.resolve({status:'already-linked',project:model.normalize(owner.project),current:true});
      mark(draft,inline,{resultIds:linked});
      return save().then(outcome=>{
        if(owner!==active||owner.generation!==expected.generation||!outcome.current||
           !outcome.project.resultIds.includes(resultId))
          throw Error('Archived result was saved, but the editor generation changed');
        return outcome;
      });
    }
    function recovery(){
      if(!active?.latest)return null;
      const v=active.latest;
      // User-invoked raw recovery; may contain the original photo bytes.
      // Never automatically store this JSON in localStorage or any other cache.
      return JSON.stringify({version:1,projectId:v.projectId,
        revision:active.project.revision,generation:v.generation,
        draft:v.draft,inline:v.inline,title:v.title,resultIds:v.resultIds,
        ...(sharedSelection?{selectionPending:state().selectionPending}:{})});
    }
    function project(){return active?model.normalize(active.project):null;}
    return Object.freeze({bind,mark,save,retry:()=>save(true),linkResult,prepareOpen,discard,recovery,project,state});
  }
  return Object.freeze({create,projectReference,prepareSharedSelection,sharedDocumentReader});
}));

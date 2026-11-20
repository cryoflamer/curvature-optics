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
  function create(env,{adapter,decoder,storage=store,clock=()=>Date.now(),onChange=null}={}){
    if(!env?.indexedDB||!env?.crypto)
      throw Error('Calibration Project persistence requires IndexedDB and crypto');
    if(typeof clock!=='function'||(onChange!==null&&typeof onChange!=='function'))
      throw TypeError('Invalid Calibration Project persistence callback');
    let active=null,epoch=0,sequence=0,tail=Promise.resolve();
    function state(){
      return Object.freeze({projectId:active?.project.id??null,
        revision:active?.project.revision??null,generation:active?.generation??epoch,
        pending:active?.pending??0,unsaved:!!active?.latest,
        recoverable:!!active?.latest,error:active?.error??null,
        lastAck:active?.lastAck??null});
    }
    function notify(){
      // Observation must never turn an acknowledged IndexedDB commit into a failure.
      if(onChange)try{onChange(state());}catch(_ignored){}
    }
    function bind(project){
      if(active&&(active.pending||active.latest))
        throw Error('Unsaved or pending calibration work must be resolved before switching projects');
      const validated=model.normalize(project);
      active={project:validated,generation:++epoch,pending:0,
        latest:null,error:null,lastAck:null,tasks:new Map()};
      notify();return state();
    }
    function mark(draft,inline=null,changes={}){
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
    function save(){
      if(!active)throw Error('No bound Calibration Project');
      const owner=active,captured=owner.latest;
      if(!captured)return Promise.resolve({status:'clean',project:model.normalize(owner.project),current:true});
      const running=owner.tasks.get(captured.sequence);
      if(running)return running;
      owner.pending++;notify();
      const work=tail.then(async()=>{
        if(owner.generation!==captured.generation||owner!==active)
          throw Error('Stale calibration generation; save was not redirected');
        // Verified original is staged before the project transaction.
        // Captured draft, including both views and pending Undo/Redo, is immutable
        // with respect to subsequent editor events and another tab's selection.
        const parts=await checkpoint.captureVerified(captured.draft,captured.inline,
          env,adapter,decoder);
        const expected=owner.project;
        const changes={title:captured.title,photo:parts.photo,
          checkpoint:parts.checkpoint,overview:parts.overview,resultIds:captured.resultIds};
        const forkId=model.createId(env.crypto);
        // Resolves only after the atomic record+summary IDB transaction commits.
        const result=await storage.saveOrFork(env.indexedDB,expected.id,expected.revision,
          changes,forkId,clock());
        const durable=model.normalize(result.project);
        if(!['updated','forked'].includes(result.status))
          throw Error('Unknown calibration storage acknowledgement');
        if(owner===active&&owner.generation===captured.generation){
          owner.project=durable;
          owner.lastAck={status:result.status,id:durable.id,revision:durable.revision};
          if(owner.latest?.sequence===captured.sequence)owner.latest=null;
          owner.error=null;
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
    function discard(){
      if(!active)throw Error('No bound Calibration Project');
      if(active.pending)throw Error('Cannot discard calibration edits during a pending save');
      active.latest=null;active.error=null;notify();return state();
    }
    function recovery(){
      if(!active?.latest)return null;
      const v=active.latest;
      // User-invoked raw recovery; may contain the original photo bytes.
      // Never automatically store this JSON in localStorage or any other cache.
      return JSON.stringify({version:1,projectId:v.projectId,
        revision:active.project.revision,generation:v.generation,
        draft:v.draft,inline:v.inline,title:v.title,resultIds:v.resultIds});
    }
    function project(){return active?model.normalize(active.project):null;}
    return Object.freeze({bind,mark,save,retry:save,discard,recovery,project,state});
  }
  return Object.freeze({create});
}));

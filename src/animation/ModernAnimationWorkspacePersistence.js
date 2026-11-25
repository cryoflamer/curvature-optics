/* Animation Workspace durable persistence coordinator.
 * A tab stages synchronous session backups before calling this writer. Writes
 * are serialized and atomically reconciled against the latest IndexedDB
 * collection; the UI retains ownership of live editor state and presentation.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationWorkspacePersistence=api;
}(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function create(options){
    if(!options||!options.autosave||typeof options.getCollection!=='function'||
       typeof options.getGeneration!=='function'||typeof options.onFork!=='function')
      throw TypeError('Animation workspace persistence requires collection, generation and fork handlers');
    var autosave=options.autosave,writeQueue=Promise.resolve();
    function persist(settings){
      var requireDurable=!!(settings&&settings.requireDurable);
      var current=options.getCollection(),atGeneration=options.getGeneration();
      var unchangedDraft=settings&&settings.unchangedDraft||null;
      if(!current)return Promise.resolve(false);
      var indexedDB=options.indexedDB();
      if(!indexedDB)return Promise.resolve(!requireDurable&&!!options.localSaved());
      // Keep the snapshot fixed for this write, but read the previous durable
      // baseline only when the queued operation starts (after earlier writes).
      var attempt=writeQueue.catch(function(){return false;}).then(function(){
        return autosave.writeCollectionMerged(indexedDB,current,
          options.getBaseline(),options.crypto(),unchangedDraft).then(function(result){
          if(result.staleWorkspace){
            // Do not replace this tab's optimistic baseline with the changed
            // remote: the next ordinary edit must still fork instead of
            // overwriting another tab's project.
            options.status('Keyframe Apply blocked: the working project was changed in another tab.',true);
            return false;
          }
          options.setBaseline(result.collection);
          autosave.pruneSessionLocals(options.storage(),result.collection,options.sessionId());
          if(atGeneration===options.getGeneration()){
            options.setCollection(result.collection);
            var conflict=result.conflicts.find(function(item){
              return item.id===options.workspaceId();
            });
            if(conflict){
              var message='This workspace was changed in another tab. Your edits were '+
                'preserved as a separate draft; save it as a new Library project.';
              options.onFork(conflict.forkId,message);
              options.status(message,true);
            }else if(result.protectedDeletes.length){
              options.status('A draft was changed in another tab and was not deleted.',true);
            }
            // An inaccessible localStorage must not invalidate a successful
            // IndexedDB commit; the durable database remains authoritative.
            try{options.setLocalSaved(autosave.writeSessionLocal(options.storage(),
              options.getCollection(),options.sessionId()));}
            catch(error){options.setLocalSaved(false);}
            if(conflict)options.renderLibrary();
          }else{
            // New edits arrived while the transaction ran. Preserve the live
            // editor, recover unrelated remote drafts, and re-checkpoint later.
            options.absorbLate(result.collection);
          }
          return !result.conflicts.some(function(item){return item.id===current.activeId;})&&
            (!requireDurable||!result.protectedDeletes.length);
        });
      });
      writeQueue=attempt;
      return attempt.catch(function(error){
        options.status('IndexedDB backup failed: '+error.message+
          (options.localSaved()?' · local backup retained.':' · project switching blocked.'),true);
        return !requireDurable&&!!options.localSaved();
      });
    }
    return Object.freeze({persist:persist});
  }
  // Shared editor coordinator. Domain write, shared pointer acknowledgement
  // and receipt retirement are serialized under one operation lock. No
  // Web Storage fallback or pagehide save is used by this path.
  function createShared({autosave,storage,selection,onChange=null}={}){
    if(!autosave||!storage||!selection||
       !['read','saveSelected','retire'].every(k=>typeof storage[k]==='function')||
       !['coordinate','captureBase','acknowledge','check'].every(k=>typeof selection[k]==='function'))
      throw TypeError('Shared Animation persistence dependencies required');
    const copy=v=>JSON.parse(JSON.stringify(v)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    let owner=null,generation=0,sequence=0,running=null,binding=false;
    function state(){
      return copy({reference:owner?.reference??null,generation,
        pending:!!running||binding,unsaved:!!owner?.latest,
        error:owner?.error??null,selectionPending:owner?.receipt?.value??null,
        lastAck:owner?.lastAck??null});
    }
    function notify(){if(onChange)try{onChange(state());}catch(ignore){}}
    function current(active){
      selection.check();
      if(owner!==active)throw Error('Stale shared Animation editor generation');
    }
    async function bind(reference){
      if(binding||running||owner&&(owner.latest||owner.receipt||owner.error))
        throw Error('Resolve shared Animation edits before binding a different document');
      const wanted=copy(reference);
      binding=true;notify();
      try{
        return await selection.coordinate(async()=>{
          selection.check();
          await selection.captureBase(wanted);
          const row=await storage.read();selection.check();
          if(!row||row.receipt||!same(autosave.documentReference(row,wanted.id),wanted))
            throw Error('Animation selection changed before binding');
          const checkpoint=autosave.getWorkspace(row.collection,wanted.id);
          owner={row,reference:wanted,latest:null,receipt:null,error:null,lastAck:null};
          generation++;
          return copy(checkpoint);
        });
      }finally{binding=false;notify();}
    }
    function content(checkpoint){
      const {savedAt,...value}=autosave.normalize(checkpoint);return value;
    }
    function mark(checkpoint){
      selection.check();
      if(!owner||binding)throw Error('No verified shared Animation editor');
      const captured=autosave.normalize(checkpoint);
      const previous=owner.latest?.checkpoint||autosave.getWorkspace(owner.row.collection,owner.reference.id);
      if(same(content(previous),content(captured)))return state();
      // A later edit never changes the already captured in-flight input.
      owner.latest={sequence:++sequence,checkpoint:captured};
      notify();return state();
    }
    async function finishReceipt(active){
      const pending=active.receipt;
      if(!pending)return;
      current(active);
      if(!pending.acknowledged){
        await selection.acknowledge(copy(pending.value));current(active);
        pending.acknowledged=true;
      }
      // A retirement acknowledgement can be lost after the actual commit.
      // Only its exact successor (same collection and revisions, no receipt)
      // is acceptable. Never repeat the domain save or rebase onto another row.
      const durable=await storage.read();current(active);
      if(same(durable,active.row)){
        active.row=await storage.retire(active.row,pending.value);current(active);
      }else if(durable&&durable.revision===active.row.revision+1&&
               durable.receipt===null&&same(durable.collection,active.row.collection)&&
               same(durable.revisions,active.row.revisions)){
        await selection.captureBase(pending.value.current);current(active);
        active.row=durable;
      }else throw Error('Animation receipt retirement changed; reload and inspect evidence');
      active.reference=copy(pending.value.current);
      active.lastAck={reference:copy(active.reference),sequence:pending.sequence};
      if(active.latest?.sequence===pending.sequence)active.latest=null;
      active.receipt=null;active.error=null;
    }
    async function write(active){
      current(active);
      if(active.receipt){await finishReceipt(active);return;}
      const captured=active.latest;
      if(!captured)return;
      const base=await selection.captureBase(active.reference);current(active);
      const row=await storage.read();current(active);
      if(!same(row,active.row))
        throw Error('Shared Animation collection changed; reload or export unsaved draft');
      const prior=autosave.getWorkspace(row.collection,active.reference.id);
      const value=autosave.normalize({...captured.checkpoint,
        savedAt:Math.max(captured.checkpoint.savedAt,prior.savedAt+1)});
      const saved=await storage.saveSelected(row,active.reference,value,base);current(active);
      // From this point, never invoke saveSelected again for this captured
      // sequence, including if shared pointer acknowledgement fails.
      active.row=saved;active.receipt={value:copy(saved.receipt),
        sequence:captured.sequence,acknowledged:false};
      await finishReceipt(active);
    }
    function save(retry=false){
      if(!owner||binding)return Promise.reject(Error('No verified shared Animation editor'));
      if(running)return running.then(state);
      if(owner.error&&!retry)return Promise.reject(Error('Explicit Animation save retry required'));
      if(!owner.latest&&!owner.receipt)return Promise.resolve(state());
      const active=owner;
      running=Promise.resolve().then(async()=>{
        try{
          while(active.latest||active.receipt){
            await selection.coordinate(()=>write(active));current(active);
          }
          active.error=null;
        }catch(error){active.error=String(error.message||error);throw error;}
      }).finally(()=>{running=null;notify();});
      notify();
      return running.then(state);
    }
    function recovery(){
      if(!owner?.latest&&!owner?.receipt)return null;
      return copy({version:1,reference:owner.reference,
        checkpoint:owner.latest?.checkpoint??null,receipt:owner.receipt?.value??null});
    }
    return Object.freeze({bind,mark,save:()=>save(false),retry:()=>save(true),state,recovery});
  }
  return Object.freeze({create:create,createShared:createShared});
}));

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
    function persist(){
      var current=options.getCollection(),atGeneration=options.getGeneration();
      if(!current)return Promise.resolve(false);
      var indexedDB=options.indexedDB();
      if(!indexedDB)return Promise.resolve(!!options.localSaved());
      // Keep the snapshot fixed for this write, but read the previous durable
      // baseline only when the queued operation starts (after earlier writes).
      var attempt=writeQueue.catch(function(){return false;}).then(function(){
        return autosave.writeCollectionMerged(indexedDB,current,
          options.getBaseline(),options.crypto()).then(function(result){
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
          return !result.conflicts.some(function(item){return item.id===current.activeId;});
        });
      });
      writeQueue=attempt;
      return attempt.catch(function(error){
        options.status('IndexedDB backup failed: '+error.message+
          (options.localSaved()?' · local backup retained.':' · project switching blocked.'),true);
        return !!options.localSaved();
      });
    }
    return Object.freeze({persist:persist});
  }
  return Object.freeze({create:create});
}));

/* Animation Workspace startup and lifecycle recovery.
 * This coordinator owns the ordering of local/IndexedDB restore and page
 * lifecycle flushes; the Modern UI still owns the editor, renderers and
 * serialized writes. Keep generation checks ahead of any active-editor swap.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationWorkspaceRecovery=api;
}(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function create(options){
    if(!options||!options.autosave)throw TypeError('Animation workspace recovery requires autosave');
    var autosave=options.autosave,win=options.root,doc=options.document;
    function storage(){return options.storage();}
    function flushOnLeave(){
      if(options.getGeneration()){
        options.saveDraft(false);
        options.writeDraft();
      }
    }
    function bind(){
      var local=autosave.combineCollections([
        autosave.readCollectionLocal(storage())
      ].concat(autosave.readSessionLocals(storage())));
      var oldLocal=autosave.readLocal(storage());
      var freshPlaceholder=!local&&!oldLocal;
      if(!local&&oldLocal){
        try{local=autosave.migrate(oldLocal,win.crypto);}catch(error){
          options.status('Legacy draft migration failed: '+error.message,true);
        }
      }
      if(!local){
        try{
          var draft=autosave.checkpoint({draft:options.getDraft(),selectedKey:null,
            quality:'auto',prepared:false,positionMs:0},Date.now());
          local=autosave.collection(autosave.makeWorkspaceId(win.crypto),draft,Date.now());
        }catch(error){options.status('Cannot create first workspace: '+error.message,true);}
      }
      if(local){
        try{options.restoreCollection(local);
          options.status('Animation workspaces restored; playback paused.',false);
        }catch(error){options.status('Animation workspace recovery failed: '+error.message,true);}
      }
      var generation=options.getGeneration();
      if(win.indexedDB)Promise.all([
        autosave.readCollection(win.indexedDB),
        autosave.read(win.indexedDB)
      ]).then(function(records){
        var remote=records[0];
        if(!remote&&records[1])remote=autosave.migrate(records[1],win.crypto);
        options.setIndexedBaseline(remote);
        if(remote)autosave.pruneSessionLocals(storage(),remote,options.sessionId);
        if(options.getGeneration()!==generation){
          options.absorbLate(remote);return; // never overwrite active edits
        }
        var best=freshPlaceholder&&remote?remote:
          autosave.combineCollections([local,remote]);
        if(best&&(freshPlaceholder&&remote||!local||
           JSON.stringify(best)!==JSON.stringify(local))){
          options.restoreCollection(best);
          options.setCheckpoint(autosave.getWorkspace(best,best.activeId));
          options.status('Animation workspaces restored from IndexedDB.',false);
          options.onRemoteRestored();
        }
        // Reconcile local-only drafts using the editor-owned serialized writer.
        if(best&&JSON.stringify(best)!==JSON.stringify(remote))options.persist();
      }).catch(function(error){
        if(!local)options.status('Animation workspace recovery unavailable: '+error.message,true);
      });
      if(win.addEventListener){
        win.addEventListener('pagehide',flushOnLeave);
        win.addEventListener('beforeunload',flushOnLeave);
      }
      if(doc&&doc.addEventListener)doc.addEventListener('visibilitychange',function(){
        if(doc.hidden)flushOnLeave();
      });
    }
    return Object.freeze({bind:bind});
  }
  return Object.freeze({create:create});
}));

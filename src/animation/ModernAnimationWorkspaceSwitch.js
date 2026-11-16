/* Animation Workspace switch coordinator.
 * Persist the outgoing editor before activating a different draft or Library
 * project. The UI owns editor state, preview, and the durable write queue;
 * this module owns sequencing, generation checks, and error completion.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationWorkspaceSwitch=api;
}(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function create(options){
    if(!options||typeof options.persist!=='function'||
       typeof options.activate!=='function')
      throw TypeError('Animation workspace switching requires persistence and activation');
    function request(kind,id){
      if(options.busy()||!options.ready()||!options.hasStudio())return;
      if(kind==='open'&&(!id||!options.hasProject(id)))return;
      if(kind==='draft'&&(!id||!options.hasDraft(id)))return;
      if((kind==='open'&&options.workspaceId()===options.projectWorkspaceId(id))||
         (kind==='draft'&&options.workspaceId()===id))return;
      options.setBusy(true);options.renderLibrary();
      var generation=options.generation(),formerId=options.workspaceId();
      var dropEmpty=!!formerId&&formerId.indexOf('draft_')===0&&!options.hasUnsavedWork();
      if(!options.saveDraft(false)){
        options.setBusy(false);
        options.notice('Cannot switch: current working draft failed validation or storage.',true);
        return;
      }
      var wizardSwitched=false;
      return options.persist().then(function(ok){
        if(!ok)throw Error('Current draft could not be stored; switching was cancelled to protect your work');
        if(options.generation()!==generation+1)
          throw Error('The draft changed while switching; please try again');
        function finish(next,value){
          options.activate(next,value);
          if(next==='wizard')wizardSwitched=true;
          if(dropEmpty&&formerId!==options.workspaceId())options.dropWorkspace(formerId);
        }
        if(kind==='open')return options.fetchProject(id).then(function(record){
          if(options.generation()!==generation+1)
            throw Error('The draft changed while opening; please try again');
          if(!record)throw Error('Saved animation no longer exists');
          finish('open',record);
        });
        finish(kind,id);
      }).catch(function(error){
        options.fail('Cannot switch project: '+error.message);
      }).then(function(){
        options.setBusy(false);
        if(wizardSwitched){
          options.resetWizard();
          return options.saveNamed().then(function(saved){
            if(!saved)options.notice('Library save failed. The new project remains open in the working draft; use Save project to retry.',true);
          });
        }
        options.renderLibrary();options.renderWizard();
      });
    }
    return Object.freeze({request:request});
  }
  return Object.freeze({create:create});
}));

/* Animation Studio draft editing coordinator.
 * Owns edit history, selection changes and draft checkpoints. The application
 * retains rendering, DOM focus, playback invalidation and Library persistence.
 * Every read is live: a rerender or workspace switch must not revive a stale
 * draft or history from an earlier editor session.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationStudioEditing=api;
}(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function selectedIn(draft,key){
    return draft.frames.some(function(frame){return frame.key===key;})?key:
      draft.frames.length?draft.frames[0].key:null;
  }
  function create(options){
    if(!options||!options.studio||typeof options.read!=='function'||
       typeof options.write!=='function'||typeof options.suggestName!=='function'||
       typeof options.invalidate!=='function'||typeof options.checkpoint!=='function'||
       typeof options.render!=='function')
      throw TypeError('Animation Studio editing requires live state and UI callbacks');
    var studio=options.studio;
    function locked(){return typeof options.readOnly==='function'&&options.readOnly();}
    function commit(next,settings){
      if(locked())return false;
      settings=settings||{};
      var state=options.read(),history=state.history;
      next=options.suggestName(next);
      var recorded=!history||studio.recordEdit(history,state.draft,next,
        settings.beforeSelectedKey===undefined?state.selectedKey:settings.beforeSelectedKey,
        settings.group);
      if(settings.endGroup&&history)studio.endEditGroup(history);
      // A live input already checkpointed this value. Blur must not rebuild
      // the focused form, lose a click, or record an extra undo step.
      if(!recorded&&settings.endGroup)return false;
      options.write({draft:next,selectedKey:selectedIn(next,state.selectedKey),
        diagnosticTransition:null});
      options.invalidate();options.checkpoint();
      if(typeof options.clearStatus==='function')options.clearStatus();
      options.render();
      return true;
    }
    function live(next,group){
      if(locked())return false;
      var state=options.read();
      if(state.history)studio.recordEdit(state.history,state.draft,next,
        state.selectedKey,group);
      options.write({draft:next});
      options.invalidate();options.checkpoint();
      if(typeof options.refreshControls==='function')options.refreshControls();
      if(typeof options.refreshLibrary==='function')options.refreshLibrary();
    }
    function step(direction){
      if(locked())return false;
      var state=options.read();
      if(!state.history)return false;
      var previous=studio.stepEditHistory(state.history,state.draft,state.selectedKey,direction);
      if(!previous)return false;
      options.write({draft:previous.draft,
        selectedKey:selectedIn(previous.draft,previous.selectedKey),
        diagnosticTransition:null});
      options.invalidate();options.checkpoint();options.render();
      return true;
    }
    function select(key){
      options.write({selectedKey:key,diagnosticTransition:null});
      options.checkpoint();options.render();
    }
    function focusTransition(index){
      var state=options.read();
      if(!Number.isInteger(index)||index<0||index+1>=state.draft.frames.length)return false;
      options.write({diagnosticTransition:index,
        selectedKey:state.draft.frames[index+1].key});
      options.render();
      return true;
    }
    function remove(key){
      if(locked())return false;
      var state=options.read();
      var index=state.draft.frames.findIndex(function(frame){return frame.key===key;});
      if(index<0)return false;
      var next=studio.remove(state.draft,key);
      if(state.selectedKey===key)
        options.write({selectedKey:next.frames.length?
          next.frames[Math.min(index,next.frames.length-1)].key:null});
      return commit(next,{beforeSelectedKey:state.selectedKey});
    }
    return Object.freeze({commit:commit,live:live,step:step,
      select:select,focusTransition:focusTransition,remove:remove});
  }
  return Object.freeze({create:create});
}));

/* A single UI binding layer for contract-derived Animation Studio channel locks.
 * This is an adapter from ModernAnimationContract.allowedPaths(), NOT an
 * alternative list of physics permitted by an animation contract.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationKeyframeControlLocks=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // These are only DOM bindings for the existing canonical Scene/Compare UI.
  // The contract alone chooses which paths may be edited.
  var cameraIds=Object.freeze({
    CameraEast:'ModernCameraEast',CameraNorth:'ModernCameraNorth',
    Height:'ModernHeight',Pan:'ModernPan',Nick:'ModernNick',
    Roll:'ModernRoll',FocalLengthField:'ModernFocal'
  });
  function inputIds(paths,scope){
    if(!Array.isArray(paths)||!paths.length||paths.includes('*'))
      throw RangeError('An explicit supported animation channel is required');
    var result=[];
    paths.forEach(function(path){
      var id=null;
      if(path.indexOf('camera.')===0)id=cameraIds[path.slice(7)]||null;
      else if(path==='scene.surface.curvature'&&scope==='scene')
        id=['ModernCurvature','ModernRadiusKm'];
      else if(path==='scene.temperatureProfile.gradientKPerKm'&&scope==='scene')
        id='ModernTemperatureSceneGradient';
      else if((path==='compare.A.surface.curvature'&&scope==='A')||
              (path==='compare.B.surface.curvature'&&scope==='B'))
        id=['ModernModelCurvature','ModernModelRadius'];
      else if((path==='compare.A.temperatureProfile.gradientKPerKm'&&scope==='A')||
              (path==='compare.B.temperatureProfile.gradientKPerKm'&&scope==='B'))
        id='ModernTemperatureCompareGradient';
      if(!id)throw RangeError('No safe UI binding for animation path '+path);
      result.push.apply(result,Array.isArray(id)?id:[id]);
    });
    return Object.freeze(result);
  }
  function create(workspace,paths,scope){
    if(!workspace||typeof workspace.querySelectorAll!=='function'||
       typeof workspace.addEventListener!=='function')
      throw TypeError('Mounted physical editor is required');
    var allowed=new Set(inputIds(paths,scope)),original=new Map(),active=true;
    var lockReason='Locked by the animation project contract; permitted channel: '+paths.join(', ');
    var types='input,select,textarea,button,a,[role="button"]';
    function permit(node){
      if(!node)return false;
      if(node.classList&&node.classList.contains('modern-settings-tab'))return true;
      return allowed.has(node.id)&&['INPUT','SELECT','TEXTAREA'].includes(node.tagName);
    }
    function refresh(){
      if(!active)return;
      Array.prototype.forEach.call(workspace.querySelectorAll(types),function(node){
        if(!original.has(node))original.set(node,{
          disabled:!!node.disabled,title:node.title||'',aria:node.getAttribute&&node.getAttribute('aria-description')
        });
        var old=original.get(node),editable=permit(node);
        if('disabled' in node)node.disabled=!editable||old.disabled;
        if(!editable){
          node.title=lockReason;
          if(node.setAttribute)node.setAttribute('aria-description',lockReason);
        }
      });
    }
    function permittedEvent(target){
      if(!target||typeof target.closest!=='function')return false;
      if(target.closest('.modern-settings-tab,summary'))return true;
      var label=target.closest('label[for]');
      if(label&&allowed.has(label.htmlFor))return true;
      var control=target.closest('input,select,textarea,button,a,[role="button"]');
      return !!(control&&permit(control)&&!control.disabled);
    }
    function guard(event){
      if(!active)return;
      var target=event.target;
      if(event.type==='wheel'&&!target?.closest?.('canvas'))return; // normal page scrolling
      if(permittedEvent(target))return;
      if(event.cancelable&&event.preventDefault)event.preventDefault();
      if(event.stopImmediatePropagation)event.stopImmediatePropagation();
      else if(event.stopPropagation)event.stopPropagation();
    }
    var events=['pointerdown','mousedown','click','dblclick','touchstart','wheel',
      'keydown','keyup','input','change'];
    events.forEach(function(type){workspace.addEventListener(type,guard,true);});
    refresh();
    return Object.freeze({allowedInputs:Object.freeze(Array.from(allowed)),refresh:refresh,
      release:function(){
        if(!active)return;
        active=false;
        events.forEach(function(type){workspace.removeEventListener(type,guard,true);});
        original.forEach(function(old,node){
          if('disabled' in node)node.disabled=old.disabled;
          node.title=old.title;
          if(node.setAttribute&&node.removeAttribute){
            if(old.aria===null||old.aria===undefined)node.removeAttribute('aria-description');
            else node.setAttribute('aria-description',old.aria);
          }
        });
        original.clear();
      }});
  }
  return Object.freeze({inputIds:inputIds,create:create});
}));

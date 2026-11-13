/* Shared, opt-in status presentation for Modern UI. The caller owns message
 * semantics; progress remains quiet and errors stay visible until replaced.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernStatusMessage=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var kinds={error:true,warning:true,success:true,info:true};
  function set(node,message,kind){
    if(!node)return null;
    var type=kinds[kind]?kind:'info';
    var text=String(message===undefined||message===null?'':message);
    // Keep the plain message intact for callers that inspect textContent.
    // In particular, export readiness checks inspect the beginning of it.
    node.textContent=text;
    if(node.classList){
      node.classList.add('modern-status-message');
      node.classList.toggle('is-error',type==='error');
    }
    if(typeof node.setAttribute==='function'){
      node.setAttribute('data-status-kind',type);
      node.setAttribute('role',type==='error'?'alert':'status');
      node.setAttribute('aria-live',type==='error'?'assertive':'polite');
      node.setAttribute('aria-atomic','true');
    }
    if(type==='error'&&text&&node.ownerDocument&&node.ownerDocument.createElement&&
       typeof node.appendChild==='function'){
      var copy=node.ownerDocument.createElement('button');
      copy.type='button';copy.className='modern-status-copy';
      var clipboard=node.ownerDocument.defaultView&&node.ownerDocument.defaultView.navigator&&
        node.ownerDocument.defaultView.navigator.clipboard;
      var canCopy=!!(clipboard&&typeof clipboard.writeText==='function');
      copy.textContent=canCopy?'Copy error':'Copy unavailable';
      copy.disabled=!canCopy;
      copy.setAttribute('aria-label',canCopy?'Copy error message':'Clipboard unavailable');
      copy.addEventListener('click',function(event){
        if(event&&event.stopPropagation)event.stopPropagation();
        if(!canCopy)return;
        Promise.resolve(clipboard.writeText(text)).then(function(){
          copy.textContent='Copied';
        }).catch(function(){copy.textContent='Copy unavailable';});
      });
      node.appendChild(copy);
    }
    return node;
  }
  function decorate(node,kind){return node?set(node,node.textContent,kind):null;}
  return Object.freeze({set:set,decorate:decorate});
}));

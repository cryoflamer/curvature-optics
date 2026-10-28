/* Coalesce high-frequency camera redraw requests in the Physical mode only.
 * The optics frame is recomposed on delivery, from the latest camera state.
 * Legacy and diagnostic draws remain synchronous and unmodified.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureCanvasFrameScheduler=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function create(requestFrame,cancelFrame,draw){
    if(typeof requestFrame!=='function'||typeof cancelFrame!=='function'||typeof draw!=='function')
      throw new TypeError('Frame scheduler requires frame request, cancellation, and draw callbacks');
    var pending=null,scheduled=0,drawn=0,coalesced=0;
    function schedule(){
      if(pending!==null){coalesced++;return;}
      scheduled++;
      // Set the token before invoking the scheduler, so synchronous test
      // implementations cannot leave a stale pending frame behind.
      var token={id:null};pending=token;
      token.id=requestFrame(function(){
        if(pending!==token)return;
        pending=null;drawn++;draw();
      });
    }
    function cancel(){
      if(pending!==null){var token=pending;pending=null;cancelFrame(token.id);}
    }
    return {schedule:schedule,cancel:cancel,stats:function(){return {
      scheduled:scheduled,drawn:drawn,coalesced:coalesced,pending:pending!==null
    };}};
  }
  return {create:create};
}));

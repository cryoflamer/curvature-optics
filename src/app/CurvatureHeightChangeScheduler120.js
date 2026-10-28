/* Debounce expensive height-dependent Physical scene builds while a slider is
 * moving. Never fabricate an approximate ray field: the old frame stays on
 * screen with a visible pending label until an exact redraw of the LAST height.
 * Other renderer modes retain their original redraw semantics.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureHeightChangeScheduler120=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function create(setTimer,clearTimer,draw,delayMs){
    if(typeof setTimer!=='function'||typeof clearTimer!=='function'||typeof draw!=='function')
      throw TypeError('Height scheduler requires timer and redraw functions');
    var delay=delayMs===undefined?150:delayMs;
    if(!Number.isFinite(delay)||delay<0)throw RangeError('Invalid height debounce');
    var timer=null,requests=0,replaced=0,draws=0;
    function cancel(){if(timer!==null){clearTimer(timer);timer=null;}}
    function schedule(){
      requests++;
      if(timer!==null){replaced++;cancel();}
      timer=setTimer(function(){timer=null;draws++;draw();},delay);
    }
    return {schedule:schedule,cancel:cancel,stats:function(){return {
      pending:timer!==null,requests:requests,replaced:replaced,draws:draws,delayMs:delay
    };}};
  }
  function cloneUpdated(base,height){
    if(!base||typeof base.Update!=='function'||!Number.isFinite(height)||height<=0)
      throw TypeError('Updated model and positive finite observer height required');
    var m=Object.create(Object.getPrototypeOf(base));
    Object.keys(base).forEach(function(key){
      var value=base[key];
      m[key]=Array.isArray(value)?value.slice():value;
    });
    // The live barometer references global CurveApp. A detached diagnostic
    // model must not call it or mutate user state during height sweeps.
    m.BaroModel=null;
    m.Height=height;
    m.HeightSliderLast=m.HeightSlider;
    m.Update();
    return m;
  }
  return {create:create,cloneUpdated:cloneUpdated};
}));

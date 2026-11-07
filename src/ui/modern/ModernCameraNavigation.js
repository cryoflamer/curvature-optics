/* Pure camera motion for keyboard navigation. Time and focus are owned by ModernApp;
 * this module neither paints nor touches the Legacy camera.  All velocities are
 * expressed in metres/second or degrees/second in the local observer frame.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernCameraNavigation=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var BINDINGS=Object.freeze({KeyW:'forward',KeyS:'backward',KeyA:'left',KeyD:'right',
    KeyQ:'down',KeyE:'up',ArrowLeft:'panLeft',ArrowRight:'panRight',
    ArrowUp:'nickUp',ArrowDown:'nickDown'});
  var MOVE=Object.freeze(['forward','backward','left','right','down','up']);
  var KEYS=Object.freeze(Object.keys(BINDINGS));
  var SPEEDS=Object.freeze([.01,.1,1,10,100,1000,10000]);
  var TURN_RATES=Object.freeze([.05,.2,1,5,20]);
  var WHEEL_STEPS=Object.freeze(['auto',.1,1,10,100,1000]);
  function action(code){return BINDINGS[code]||null;}
  function settings(value){
    var prefs=value&&typeof value==='object'?value:{};
    return Object.freeze({
      speed:SPEEDS.includes(prefs.speed)?prefs.speed:10,
      turnRate:TURN_RATES.includes(prefs.turnRate)?prefs.turnRate:1,
      wheelStep:WHEEL_STEPS.includes(prefs.wheelStep)?prefs.wheelStep:'auto'
    });
  }
  function move(camera,pressed,seconds,prefs,modifiers){
    if(!camera||!pressed||!(seconds>=0&&Number.isFinite(seconds)))throw RangeError('Invalid camera navigation');
    prefs=settings(prefs);modifiers=modifiers||{};
    var axis=function(a,b){return Number(!!pressed[a])-Number(!!pressed[b]);};
    var forward=axis('forward','backward'),right=axis('right','left'),up=axis('up','down');
    var norm=Math.hypot(forward,right,up),pan=camera.Pan*Math.PI/180;
    var speed=prefs.speed*(modifiers.fast?5:1)*(modifiers.precise?0.2:1);
    var length=norm?seconds*speed/norm:0;
    var next={CameraEast:camera.CameraEast+length*(forward*Math.sin(pan)+right*Math.cos(pan)),
      CameraNorth:camera.CameraNorth+length*(forward*Math.cos(pan)-right*Math.sin(pan)),
      Height:camera.Height+length*up,
      Pan:camera.Pan+seconds*prefs.turnRate*(Number(!!pressed.panRight)-Number(!!pressed.panLeft))*(modifiers.fast?5:1)*(modifiers.precise?0.2:1),
      Nick:camera.Nick+seconds*prefs.turnRate*(Number(!!pressed.nickUp)-Number(!!pressed.nickDown))*(modifiers.fast?5:1)*(modifiers.precise?0.2:1)};
    next.CameraEast=Math.max(-1e7,Math.min(1e7,next.CameraEast));
    next.CameraNorth=Math.max(-1e7,Math.min(1e7,next.CameraNorth));
    next.Height=Math.max(.001,Math.min(1e9,next.Height));
    next.Pan=Math.max(-360,Math.min(360,next.Pan));
    next.Nick=Math.max(-90,Math.min(90,next.Nick));
    return Object.freeze(next);
  }
  return Object.freeze({action:action,move:move,settings:settings,
    KEYS:KEYS,MOVE:MOVE,SPEEDS:SPEEDS,TURN_RATES:TURN_RATES,WHEEL_STEPS:WHEEL_STEPS});
}));

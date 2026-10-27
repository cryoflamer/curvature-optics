/* Camera agreement for controlled diagnostics. The reference is sampled from
 * the actual GraphX3DX draw; the candidate orientation is from the updated
 * model, while legacy-specific viewport and lens constants are recorded.
 * This verifies camera INPUT parity, not rasterizer/projection equivalence.
 */
(function(root,factory){
 var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 root.CurvatureControlledCamera=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function close(a,b){return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));}
 function verify(actual,model,width,height){
  if(!actual||!model||!actual.pixelTransform)throw new TypeError('Captured camera and updated model required');
  var checks=[['pos','camPos'],['center','camViewCenter'],['up','camUp']];
  checks.forEach(function(keys){
   var a=actual[keys[0]],b=model[keys[1]];
   if(!Array.isArray(a)||!Array.isArray(b)||a.length!==3||b.length!==3||a.some(function(x,i){return !close(x,b[i]);}))
    throw new RangeError('Legacy camera differs from updated model: '+keys[1]);
  });
  if(!close(actual.sceneSize,model.camSceneSize)||!close(actual.zoom,1))
   throw new RangeError('Legacy camera scale/zoom differs from updated model');
  if(actual.pixelTransform.width!==width||actual.pixelTransform.height!==height)
   throw new RangeError('Legacy camera viewport mismatch');
  return {matched:true,modelInputs:['camPos','camViewCenter','camUp','camSceneSize'],
   actualScale:{sceneSize:actual.sceneSize,screenSize:actual.screenSize,
    objectZExtend:actual.objectZExtend,zoom:actual.zoom},
   pixelTransformSource:'captured GraphX3DX WinTrans and ContextScale'};
 }
 function candidate(actual,model,width,height){
  verify(actual,model,width,height);
  return Object.assign({},actual,{pos:model.camPos.slice(),center:model.camViewCenter.slice(),up:model.camUp.slice(),
   sceneSize:model.camSceneSize,pixelTransform:Object.assign({},actual.pixelTransform,
    {stroke:actual.pixelTransform.stroke&&Object.assign({},actual.pixelTransform.stroke)})});
 }
 return {verify:verify,candidate:candidate};
}));

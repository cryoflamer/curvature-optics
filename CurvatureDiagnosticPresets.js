/* Controlled independent geometry scenarios. No mutation of the live model. */
(function(root,factory){
 var api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.CurvatureDiagnosticPresets=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function eligible(model){
  if(!model||!Array.isArray(model.NObjects)||!Array.isArray(model.ObjType))return [];
  // Only Objects 2 draws Tower Type 2 in the original DrawShape.
  return [1].filter(function(i){return model.NObjects[i]>0&&model.ObjType[i]===3;});
 }
 function copy(model){
  var result=Object.assign({},model);
  Object.keys(result).forEach(function(key){if(Array.isArray(result[key]))result[key]=result[key].slice();});
  return result;
 }
 function scenarios(model){
  if(!model||!Number.isFinite(model.geometryRadius)||model.geometryRadius<=0)throw new TypeError('Valid geometry radius required');
  var r=model.geometryRadius;
  return [
   {id:'globe-near',globe:true,first:0.002*r,step:0.002*r},
   {id:'globe-far',globe:true,first:0.012*r,step:0.008*r},
   {id:'flat-near',globe:false,first:0.002*r,step:0.002*r},
   {id:'flat-far',globe:false,first:0.012*r,step:0.008*r}
  ].map(function(s){
   var m=copy(model);
   // Controlled geometry values; camera remains an explicit input to capture.
   m.NObjects=[0,3];m.ObjType=[3,3];m.ObjDist=[0,s.first];m.ObjDeltaDist=[0,s.step];
   m.ObjSidePos=[0,0];m.ObjSideVar=[0,0];m.ObjSideType=[0,0];
   m.ObjSizeVar=[0,0];m.ObjSizeType=[0,0];
   m.ObjSize=[0,Math.max(1,model.ObjSize&&model.ObjSize[1]||64)];
   m.showModel=s.globe?1:2;
   // Isolated reference must not inherit the optical-mode visibility checkbox.
   m.diagnosticAlwaysShowLegacyTowers=true;
   return {id:s.id,globe:s.globe,model:m,objectIndex:1,
    parameters:{NObjects:3,ObjType:3,ObjDist:s.first,ObjDeltaDist:s.step,ObjSize:m.ObjSize[1],showModel:m.showModel}};
  });
 }
 return {eligible:eligible,scenarios:scenarios};
}));

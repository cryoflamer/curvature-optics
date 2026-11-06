/* Modern Scene input contract and explicit presets. Pure state changes only:
 * CurvatureModel.Update and the shared Physical renderer remain the authority.
 * No dependency on Legacy controls, DOM fields, or persistence globals.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernSceneState=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var CAMERA={Height:[0.001,1e9],FocalLengthField:[1,100000],ViewAngleField:[0.1,160],
    Pan:[-360,360],Nick:[-90,90],Roll:[-180,180]};
  var OBJECT={NObjects:[0,200,true],ObjType:[0,3,true],ObjDist:[0,1e7],
    ObjDeltaDist:[0.001,1e7],ObjSidePos:[-1e7,1e7],ObjSideVar:[-1e7,1e7],
    ObjSize:[0.001,1e6],ObjSizeVar:[-1e4,1e4],
    ObjSideType:[0,4,true],ObjSizeType:[0,4,true]};
  // Named demonstrators, not claims to copy all original legacy animation steps.
  var PRESETS=Object.freeze({
    pontchartrain:{name:'Lake Pontchartrain Transmission Line',
      description:'85 transmission towers across Lake Pontchartrain',
      camera:{Height:15,FocalLengthField:2000,Pan:0.0464,Nick:0.0121,Roll:0},
      objects:{NObjects:[85,2],ObjType:[3,3],ObjDist:[50,25550],ObjDeltaDist:[297.55,373],
        ObjSidePos:[35,25.4],ObjSize:[23,64]}},
    single:{name:'Single transmission tower · sample',
      description:'Illustrative single tower, 2 km from the observer',
      camera:{Height:15,FocalLengthField:1300,Pan:0,Nick:0,Roll:0},
      objects:{NObjects:[1,0],ObjType:[3,3],ObjDist:[2000,25000],ObjDeltaDist:[300,300],
        ObjSidePos:[0,0],ObjSize:[65,65]}},
    rows:{name:'Two tower rows · sample',
      description:'Illustrative near and distant rows for perspective study',
      camera:{Height:15,FocalLengthField:650,Pan:0,Nick:0,Roll:0},
      objects:{NObjects:[18,8],ObjType:[3,3],ObjDist:[1200,12000],ObjDeltaDist:[450,1000],
        ObjSidePos:[-200,400],ObjSize:[45,65]}}
  });
  function finiteNumber(raw,min,max,integer){
    if(typeof raw==='string'&&raw.trim()==='')throw RangeError('A number is required');
    var n=Number(raw);
    if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))
      throw RangeError('Expected '+(integer?'integer ':'')+'number in ['+min+', '+max+']');
    return n;
  }
  function setCamera(model,key,value){
    if(!Object.prototype.hasOwnProperty.call(CAMERA,key))throw RangeError('Unknown camera field');
    var range=CAMERA[key],n=finiteNumber(value,range[0],range[1]);
    if(key==='ViewAngleField')model.FocalLengthField=model.FocalLength;
    model[key]=n;
    return n;
  }
  function setObject(model,group,key,value){
    if(group!==0&&group!==1||!Object.prototype.hasOwnProperty.call(OBJECT,key))
      throw RangeError('Unknown object group/field');
    var range=OBJECT[key],n=finiteNumber(value,range[0],range[1],range[2]);
    model[key][group]=n;
    return n;
  }
  function setRadiusKm(model,raw){
    var km=finiteNumber(raw,100,1e13);
    model.rEarth=km*1000;model.showModel=1;
    return km;
  }
  function setAim(model,raw){
    var value=finiteNumber(raw,0,3,true);model.viewcenterHorizon=value;return value;
  }
  function setDeviceRatio(model,raw){
    var value=Number(raw),choices=[1.5,2/3,16/9,9/16];
    if(!choices.some(function(x){return Math.abs(x-value)<1e-8;}))throw RangeError('Unknown aspect ratio');
    model.deviceRatio=value;return value;
  }
  // Keep the Pontchartrain caption tied to the *first* tower group shown
  // by the Count control. The second group is an independent object group.
  // Do not overwrite arbitrary user/imported descriptions.
  function refreshDescription(model){
    if(!model||model.DemoText!==PRESETS.pontchartrain.name||
        !/^(?:\d+ transmission towers|\d+ (?:ships|measuring rods|Bedford markers)) across Lake Pontchartrain$/.test(model.Description||''))
      return model&&model.Description;
    var types={0:'Bedford markers',1:'measuring rods',2:'ships',3:'transmission towers'};
    var kind=types[model.ObjType&&model.ObjType[0]];
    if(kind&&model.NObjects&&Number.isInteger(model.NObjects[0]))
      model.Description=model.NObjects[0]+' '+kind+' across Lake Pontchartrain';
    return model.Description;
  }
  function applyPreset(model,id){
    var p=PRESETS[id];if(!p)throw RangeError('Unknown Scene preset: '+id);
    Object.keys(p.camera).forEach(function(k){setCamera(model,k,p.camera[k]);});
    Object.keys(p.objects).forEach(function(k){
      p.objects[k].forEach(function(v,i){setObject(model,i,k,v);});
    });
    // Reset varying-object shapes as well: no stale variations from prior edits.
    ['ObjSideVar','ObjSizeVar','ObjSideType','ObjSizeType'].forEach(function(k){
      [0,1].forEach(function(i){setObject(model,i,k,0);});
    });
    model.DemoText=p.name;model.Description=p.description;
    model.showModel=1;model.rEarth=6371000;model.viewcenterHorizon=3;
    model.showGrid=1;model.showEyeLevel=false;model.showTangent=false;
    return p;
  }
  return Object.freeze({PRESETS:PRESETS,CAMERA:CAMERA,OBJECT:OBJECT,
    finiteNumber:finiteNumber,setCamera:setCamera,setObject:setObject,
    refreshDescription:refreshDescription,
    setRadiusKm:setRadiusKm,setAim:setAim,setDeviceRatio:setDeviceRatio,
    applyPreset:applyPreset});
}));

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
    Pan:[-360,360],Nick:[-90,90],Roll:[-180,180],
    CameraEast:[-1e7,1e7],CameraNorth:[-1e7,1e7]};
  var OBJECT={NObjects:[0,200,true],ObjType:[0,9,true],ObjDist:[0,1e7],
    ObjDeltaDist:[0.001,1e7],ObjSidePos:[-1e7,1e7],ObjSideVar:[-1e7,1e7],
    ObjSize:[0.001,1e6],ObjSizeVar:[-1e4,1e4],
    ObjSideType:[0,4,true],ObjSizeType:[0,4,true]};
  // Named demonstrators, not claims to copy all original legacy animation steps.
  var PRESETS=Object.freeze({
    pontchartrain:{name:'Lake Pontchartrain Transmission Line',
      description:'Transmission-line perspective and horizon visibility across Lake Pontchartrain.',
      camera:{Height:15,FocalLengthField:2000,Pan:0.0464,Nick:0.0121,Roll:0},
      objects:{NObjects:[85,2],ObjType:[3,3],ObjDist:[50,25550],ObjDeltaDist:[297.55,373],
        ObjSidePos:[35,25.4],ObjSize:[23,64]}},
    single:{name:'Single transmission tower · sample',
      description:'A transmission tower used to explore perspective and apparent size.',
      camera:{Height:15,FocalLengthField:1300,Pan:0,Nick:0,Roll:0},
      objects:{NObjects:[1,0],ObjType:[3,3],ObjDist:[2000,25000],ObjDeltaDist:[300,300],
        ObjSidePos:[0,0],ObjSize:[65,65]}},
    rows:{name:'Two tower rows · sample',
      description:'Tower arrangements for exploring perspective and horizon visibility.',
      camera:{Height:15,FocalLengthField:650,Pan:0,Nick:0,Roll:0},
      objects:{NObjects:[18,8],ObjType:[3,3],ObjDist:[1200,12000],ObjDeltaDist:[450,1000],
        ObjSidePos:[-200,400],ObjSize:[45,65]}},
    // Deliberately partial: source Bedford state index 3 (?demo=Bedford&pos=4)
    // has positive distances and existing type-0 geometry. The Legacy composite
    // showModel=3 and its original refraction/presentation are NOT ported.
    bedford:{name:'Bedford Level · marker study',
      description:'Bedford Level marker alignment for studying the appearance of objects near the horizon.',
      camera:{Height:4.04,FocalLengthField:5000,Pan:0,Nick:0,Roll:0},
      objects:{NObjects:[3,0],ObjType:[0,3],ObjDist:[124,0],ObjDeltaDist:[4830,100],
        ObjSidePos:[9.23,0],ObjSideVar:[18,0],ObjSize:[4.04,10]},
      showGrid:false,atmosphere:'vacuum'},
    // The primary Chicago view is the user's verified distant camera (~63 km
    // from the 3.4 km building bank). This is a Modern demonstration camera,
    // NOT an authored Legacy state or a reproduction of showModel=3.
    chicago:{name:'Chicago Skyline · distant-shore study',
      description:'The Chicago skyline across Lake Michigan: a study of horizon visibility and apparent height.',
      camera:{Height:2,FocalLengthField:925.6042410656,Pan:3.023361537686,
        Nick:-.16397488782,Roll:0,CameraEast:-2170.9508443,CameraNorth:-60000},
      objects:{NObjects:[6,0],ObjType:[4,3],ObjDist:[3400,0],ObjDeltaDist:[200,100],
        ObjSideType:[2,0],ObjSidePos:[1040,0],ObjSideVar:[-30.5,0],
        ObjSizeType:[3,0],ObjSize:[442,10],ObjSizeVar:[.381,0]},
      showGrid:true,atmosphere:'standard'},
    // Source-backed near-shore camera is retained as a separate resettable
    // reference. Only camera/atmosphere differ from the main Chicago preset.
    'chicago-near':{name:'Chicago Skyline · source-state camera',
      description:'The Chicago skyline as a reference for exploring perspective and surface geometry.',
      camera:{Height:2,FocalLengthField:34,Pan:0,Nick:0,Roll:0},
      objects:{NObjects:[6,0],ObjType:[4,3],ObjDist:[3400,0],ObjDeltaDist:[200,100],
        ObjSideType:[2,0],ObjSidePos:[1040,0],ObjSideVar:[-30.5,0],
        ObjSizeType:[3,0],ObjSize:[442,10],ObjSizeVar:[.381,0]},
      showGrid:true,atmosphere:'vacuum'},
    // Source Canigou state index 2 (?demo=Canigou&pos=3): the distant
    // 257 km mountain study from an observer at 1000 m, after the zoom.
    // Legacy k=0 is represented by vacuum. Modern Compare fixes its camera
    // to eye-level aim; a -1 degree Nick instead of source Nick=0 aims the
    // narrow FOV toward the globe's geometric horizon at 1000 m. This is
    // a camera adaptation, not an optics/geometry correction.
    canigou:{name:'Mount Canigou · distant mountain study',
      description:'The Canigou mountain silhouette for exploring long-distance visibility and the horizon.',
      camera:{Height:1000,FocalLengthField:1000,Pan:0,Nick:-1,Roll:0},
      objects:{NObjects:[40,0],ObjType:[5,3],ObjDist:[257000,0],ObjDeltaDist:[60,100],
        ObjSideType:[2,0],ObjSidePos:[0,0],ObjSideVar:[-5620,0],
        ObjSizeType:[3,0],ObjSize:[2790,10],ObjSizeVar:[.125,0]},
      showGrid:true,atmosphere:'vacuum'},
    // Source Canigou state index 4 (?demo=Canigou&pos=5) has the same
    // 257 km mountains at 244 m with nonzero LEGACY k=0.16761. Modern
    // 'standard' is an independently traced n(h), not that constant-k
    // model; this is an intentionally approximate physical comparison. The
    // -0.5 degree Modern Nick similarly substitutes for source horizon aim.
    'canigou-low':{name:'Mount Canigou · low-observer refraction study',
      description:'Mount Canigou as a case study in the effects of atmospheric refraction on distant views.',
      camera:{Height:244,FocalLengthField:1000,Pan:0,Nick:-.5,Roll:0},
      objects:{NObjects:[40,0],ObjType:[5,3],ObjDist:[257000,0],ObjDeltaDist:[60,100],
        ObjSideType:[2,0],ObjSidePos:[0,0],ObjSideVar:[-5620,0],
        ObjSizeType:[3,0],ObjSize:[2790,10],ObjSizeVar:[.125,0]},
      showGrid:true,atmosphere:'standard'},
    // Legacy Grace state index 7 (?demo=Grace&pos=8) has a zero
    // refraction coefficient, a globe and two 28-km platforms plus
    // 11 mountain segments on Anacapa at 50.1 km. The Modern eye-level
    // camera aims at both silhouettes; it does not reimplement source
    // horizon-centering or its preceding zero-interval preview states.
    grace:{name:'Anacapa Island / Platform Grace · distant study',
      description:'Offshore platforms and Anacapa Island for examining perspective and distant-object visibility.',
      camera:{Height:72,FocalLengthField:2000,Pan:0,Nick:-.21,Roll:0},
      objects:{NObjects:[2,11],ObjType:[6,5],ObjDist:[28000,50100],
        ObjDeltaDist:[20,22.7],ObjSideType:[0,0],ObjSidePos:[97.5,34.7],
        ObjSideVar:[12,-523],ObjSizeType:[0,3],ObjSize:[37.2,75],
        ObjSizeVar:[0,.234]},
      showGrid:true,atmosphere:'vacuum'},
    // Legacy Causeway state 5: two rows of 41 supports over 38.7 km.
    // Source showModel=3 is a composite overlay: Modern Compare remains
    // independent A/B with a fixed eye-level camera (not legacy horizon aim).
    causeway:{name:'Lake Pontchartrain Causeway · bridge horizon study',
      description:'Bridge alignment over Lake Pontchartrain for comparing perspective and horizon visibility.',
      camera:{Height:100,FocalLengthField:2000,Pan:0,Nick:0,Roll:0},
      objects:{NObjects:[41,0],ObjType:[6,3],ObjDist:[0,0],ObjDeltaDist:[967.5,100],
        ObjSideType:[1,0],ObjSidePos:[45,0],ObjSideVar:[30,0],
        ObjSizeType:[0,0],ObjSize:[5,10],ObjSizeVar:[0,0]},
      showGrid:true,atmosphere:'vacuum'},
    // Legacy Tensas state index 3 (?demo=Tensas&pos=4): 87 source-authored
    // bridge segments, 150 m spacing, zero refraction and 10.8 m observer.
    // Native physical Compare A/B replaces the legacy single globe canvas.
    tensas:{name:'Little Tensas Bayou · bridge profile study',
      description:'The Little Tensas Bayou bridge profile and its roadway geometry in a perspective study.',
      camera:{Height:10.8,FocalLengthField:3000,Pan:0,Nick:0,Roll:0},
      objects:{NObjects:[87,0],ObjType:[7,3],ObjDist:[0,0],ObjDeltaDist:[150,100],
        ObjSideType:[0,0],ObjSidePos:[-2,0],ObjSideVar:[0,0],
        ObjSizeType:[0,0],ObjSize:[1,10],ObjSizeVar:[0,0]},
      showGrid:true,atmosphere:'vacuum'},
    // Soundly source state index 12 (?demo=Soundly&pos=13): 128 supports
    // across 38.1 km, including ship passages and the special raised spans.
    // Modern uses the same shared physical Globe/Flat ray tracer and
    // independent panels; the 18-state Legacy animation is not reproduced.
    soundly:{name:'Soundly Causeway · bridge observations',
      description:'A causeway with navigation spans and supporting structures for studying perspective and horizon visibility.',
      camera:{Height:10.8,FocalLengthField:2200,Pan:0.45,Nick:-0.03,Roll:0},
      objects:{NObjects:[128,0],ObjType:[8,3],ObjDist:[496,0],ObjDeltaDist:[300,100],
        ObjSideType:[0,0],ObjSidePos:[55.5,0],ObjSideVar:[0,0],
        ObjSizeType:[0,0],ObjSize:[1,10],ObjSizeVar:[0,0]},
      showGrid:true,atmosphere:'vacuum'}
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
  // Preset descriptions are authored scene metadata, not a live summary of
  // the observer, atmosphere or object bank. Those values belong in the HUD
  // and physical controls; existing imported descriptions must stay intact.
  function applyPreset(model,id){
    var p=PRESETS[id];if(!p)throw RangeError('Unknown Scene preset: '+id);
    model.CameraEast=0;model.CameraNorth=0;
    Object.keys(p.camera).forEach(function(k){setCamera(model,k,p.camera[k]);});
    // Clear variations *before* applying the preset, so a source-backed
    // variation (Bedford's lateral spacing) is not silently overwritten.
    ['ObjSideVar','ObjSizeVar','ObjSideType','ObjSizeType'].forEach(function(k){
      [0,1].forEach(function(i){setObject(model,i,k,0);});
    });
    Object.keys(p.objects).forEach(function(k){
      p.objects[k].forEach(function(v,i){setObject(model,i,k,v);});
    });
    model.DemoText=p.name;model.Description=p.description;
    model.showModel=1;model.rEarth=6371000;model.viewcenterHorizon=3;
    model.showGrid=p.showGrid===false?0:1;model.metricGridExtentKm=0;
    model.showEyeLevel=false;model.showTangent=false;
    return p;
  }
  return Object.freeze({PRESETS:PRESETS,CAMERA:CAMERA,OBJECT:OBJECT,
    finiteNumber:finiteNumber,setCamera:setCamera,setObject:setObject,
    setRadiusKm:setRadiusKm,setAim:setAim,setDeviceRatio:setDeviceRatio,
    applyPreset:applyPreset});
}));

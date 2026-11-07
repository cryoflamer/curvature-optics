/* Versioned, allowlisted Modern experiment inputs. No optics, DOM, or Legacy
 * controls. Legacy ?state= remains reserved for the original DataX stream.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernExperimentState=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var VERSION=1,PARAM='experiment',STORAGE_KEY='curvature-modern-experiment-v1';
  var CAMERA=['Height','FocalLengthField','Pan','Nick','Roll'];
  var CAMERA_POSITION=['CameraEast','CameraNorth'];
  var OBJECT=['NObjects','ObjType','ObjDist','ObjDeltaDist','ObjSideType','ObjSidePos',
    'ObjSideVar','ObjSizeType','ObjSize','ObjSizeVar'];
  var ATMOSPHERE=['vacuum','standard','temperature-lapse','profile-transition','inverse-temperature','inverse-spherical','exponential-occlusion'];
  var SCENE_PRESETS=['pontchartrain','single','rows','custom'];
  var PAIR_PRESETS=['globe-flat-vacuum','standard-vacuum','standard-inverse','flat-inverse','custom'];
  var TEMPERATURE_PLACEMENTS=['outside-right','outside-left','inside-right','inside-left'];
  function object(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
  function shape(value,keys,optional){
    if(!object(value)||Object.keys(value).some(function(k){return !keys.includes(k)&&!(optional||[]).includes(k);}))
      throw RangeError('Invalid experiment object fields');
    keys.forEach(function(key){if(!Object.prototype.hasOwnProperty.call(value,key))throw RangeError('Missing '+key);});
  }
  function choice(value,allowed){if(!allowed.includes(value))throw RangeError('Invalid experiment choice');return value;}
  function bool(value){if(typeof value!=='boolean')throw RangeError('Expected boolean');return value;}
  function num(value,min,max,integer){
    if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))
      throw RangeError('Experiment number outside supported range');
    return value;
  }
  function title(value,max){if(typeof value!=='string'||value.length>max)throw RangeError('Invalid experiment text');return value;}
  function capture(model,scene,compare,ui){
    var camera={};CAMERA.forEach(function(k){camera[k]=model[k];});
    CAMERA_POSITION.forEach(function(k){camera[k]=model[k]||0;});
    camera.viewcenterHorizon=model.viewcenterHorizon;
    camera.deviceRatio=model.deviceRatio;
    var objects={};OBJECT.forEach(function(k){objects[k]=Array.from(model[k]);});
    return validate({version:VERSION,scene:{camera:camera,objects:objects,
      surface:{showModel:model.showModel,rEarth:model.rEarth},
      atmosphere:scene.atmosphere,occlusionRadius:scene.occlusionRadius,
      visibility:scene.visibility||{enabled:false,rangeKm:60},
      temperatureProfile:scene.temperatureProfile||{temperatureC:15,pressureHpa:1013.25,gradientKPerKm:-6.5},
      transitionProfile:scene.transitionProfile||{source:'standard',weight:0},
      inverseProfile:scene.inverseProfile||{source:'temperature-lapse',weight:0},
      showGrid:model.showGrid!==0,preset:scene.preset,resetPreset:scene.resetPreset,
      title:model.DemoText||'',description:model.Description||''},
      compare:{A:compare.A,B:compare.B,preset:compare.preset,selected:ui.selected},
      display:{mode:ui.mode,eyeLevel:ui.eyeLevel,horizon:ui.horizon,
        gpuProbe:ui.gpuProbe===true,probeTargets:ui.probeTargets||256,
        showTemperatureProfile:ui.showTemperatureProfile===true,
        temperaturePlacement:ui.temperaturePlacement||'outside-right'}});
  }
  function validate(value){
    shape(value,['version','scene','compare','display']);
    if(value.version!==VERSION)throw RangeError('Unsupported experiment version');
    var s=value.scene;
    shape(s,['camera','objects','surface','atmosphere','occlusionRadius','showGrid','preset','resetPreset','title','description'],['visibility','temperatureProfile','transitionProfile','inverseProfile']);
    shape(s.camera,CAMERA.concat(['viewcenterHorizon','deviceRatio']),CAMERA_POSITION);
    var camera={};
    var ranges={Height:[0.001,1e9],FocalLengthField:[1,100000],Pan:[-360,360],
      Nick:[-90,90],Roll:[-180,180]};
    CAMERA.forEach(function(k){camera[k]=num(s.camera[k],ranges[k][0],ranges[k][1]);});
    CAMERA_POSITION.forEach(function(k){camera[k]=s.camera[k]===undefined?0:num(s.camera[k],-1e7,1e7);});
    camera.viewcenterHorizon=num(s.camera.viewcenterHorizon,0,3,true);
    camera.deviceRatio=num(s.camera.deviceRatio,0.1,10);
    if(![1.5,2/3,16/9,9/16].some(function(v){return Math.abs(v-camera.deviceRatio)<1e-8;}))
      throw RangeError('Unsupported camera aspect ratio');
    shape(s.objects,OBJECT);
    var objectLimits={NObjects:[0,200,true],ObjType:[0,3,true],ObjDist:[0,1e7],
      ObjDeltaDist:[0.001,1e7],ObjSideType:[0,4,true],ObjSidePos:[-1e7,1e7],
      ObjSideVar:[-1e7,1e7],ObjSizeType:[0,4,true],ObjSize:[0.001,1e6],ObjSizeVar:[-1e4,1e4]};
    var objects={};OBJECT.forEach(function(k){
      var values=s.objects[k],range=objectLimits[k];
      if(!Array.isArray(values)||values.length!==2)throw RangeError('Invalid object group '+k);
      objects[k]=values.map(function(v){return num(v,range[0],range[1],range[2]);});
    });
    shape(s.surface,['showModel','rEarth']);
    var surface={showModel:choice(s.surface.showModel,[1,2]),rEarth:num(s.surface.rEarth,100000,1e16)};
    function visibility(v){
      if(v===undefined)return {enabled:false,rangeKm:60};
      shape(v,['enabled','rangeKm']);
      return {enabled:bool(v.enabled),rangeKm:num(v.rangeKm,1,500)};
    }
    function temperatureProfile(v){
      if(v===undefined)return {temperatureC:15,pressureHpa:1013.25,gradientKPerKm:-6.5};
      shape(v,['temperatureC','pressureHpa','gradientKPerKm']);
      return {temperatureC:num(v.temperatureC,-30,40),pressureHpa:num(v.pressureHpa,800,1100),
        gradientKPerKm:num(v.gradientKPerKm,-20,20)};
    }
    function transitionProfile(v){
      if(v===undefined)return {source:'standard',weight:0};
      shape(v,['source','weight']);
      return {source:choice(v.source,['standard','temperature-lapse']),weight:num(v.weight,0,1)};
    }
    function inverseProfile(v){
      if(v===undefined)return {source:'temperature-lapse',weight:0};
      shape(v,['source','weight']);
      return {source:choice(v.source,['standard','temperature-lapse']),weight:num(v.weight,0,1)};
    }
    var c=value.compare;
    shape(c,['A','B','preset','selected']);
    function physics(p){
      shape(p,['surface','radiusKm','atmosphere','occlusionRadius'],['visibility','temperatureProfile','transitionProfile','inverseProfile']);
      return {surface:choice(p.surface,['globe','flat']),radiusKm:num(p.radiusKm,100,1e13),
        atmosphere:choice(p.atmosphere,ATMOSPHERE),occlusionRadius:num(p.occlusionRadius,1,1e16),
        visibility:visibility(p.visibility),temperatureProfile:temperatureProfile(p.temperatureProfile),
        transitionProfile:transitionProfile(p.transitionProfile),inverseProfile:inverseProfile(p.inverseProfile)};
    }
    // Historical links can have independent A/B haze settings. Compare now
    // uses a shared value: migrate deterministically from A on every import.
    var compareA=physics(c.A),compareB=physics(c.B);
    compareB.visibility=Object.assign({},compareA.visibility);
    var d=value.display;
    // Probe fields are optional for links saved before the GPU Compare experiment.
    if(!object(d)||Object.keys(d).some(function(k){return !['mode','eyeLevel','horizon','gpuProbe','probeTargets','showTemperatureProfile','temperaturePlacement'].includes(k);})||
      !['mode','eyeLevel','horizon'].every(function(k){return Object.prototype.hasOwnProperty.call(d,k);}))
      throw RangeError('Invalid experiment display fields');
    return {version:VERSION,scene:{camera:camera,objects:objects,surface:surface,
      atmosphere:choice(s.atmosphere,ATMOSPHERE),occlusionRadius:num(s.occlusionRadius,1,1e16),
      visibility:visibility(s.visibility),temperatureProfile:temperatureProfile(s.temperatureProfile),
      transitionProfile:transitionProfile(s.transitionProfile),inverseProfile:inverseProfile(s.inverseProfile),
      showGrid:bool(s.showGrid),preset:choice(s.preset,SCENE_PRESETS),
      resetPreset:choice(s.resetPreset,SCENE_PRESETS.slice(0,3)),
      title:title(s.title,160),description:title(s.description,500)},
      compare:{A:compareA,B:compareB,preset:choice(c.preset,PAIR_PRESETS),
        selected:choice(c.selected,['A','B'])},
      display:{mode:choice(d.mode,['scene','compare']),eyeLevel:bool(d.eyeLevel),horizon:bool(d.horizon),
        gpuProbe:d.gpuProbe===undefined?false:bool(d.gpuProbe),
        probeTargets:d.probeTargets===undefined?256:choice(d.probeTargets,[128,256,512,1024]),
        showTemperatureProfile:d.showTemperatureProfile===undefined?false:bool(d.showTemperatureProfile),
        temperaturePlacement:d.temperaturePlacement===undefined?'outside-right':
          choice(d.temperaturePlacement,TEMPERATURE_PLACEMENTS)}};
  }
  function encode(value){
    var json=JSON.stringify(validate(value));
    var bytes=new TextEncoder().encode(json),binary='';
    for(var i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function decode(encoded){
    if(typeof encoded!=='string'||encoded.length<2||encoded.length>16000||!/^[A-Za-z0-9_-]+$/.test(encoded))
      throw RangeError('Invalid encoded experiment');
    var binary=atob(encoded.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((encoded.length+3)%4));
    var bytes=new Uint8Array(binary.length);
    for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return validate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  }
  function readUrl(search){
    var params=new URLSearchParams(search||'');
    if(!params.has(PARAM))return null;
    var values=params.getAll(PARAM);
    if(values.length!==1)throw RangeError('Repeated experiment parameter');
    return decode(values[0]);
  }
  function urlWithExperiment(href,value){
    var url=new URL(href);
    url.searchParams.set('ui','modern');url.searchParams.delete('state');
    url.searchParams.set(PARAM,encode(value));
    // Shared links always point to the actual primary Modern document.
    // Old canonical links via CurvatureApp.html?ui=modern still resolve through
    // ModernRoute, but new links never depend on that compatibility redirect.
    url.pathname=url.pathname.replace(/CurvatureApp\.html$/,'CurvatureModern.html');
    return url.href;
  }
  return Object.freeze({VERSION:VERSION,PARAM:PARAM,STORAGE_KEY:STORAGE_KEY,
    CAMERA:CAMERA,OBJECT:OBJECT,capture:capture,validate:validate,
    encode:encode,decode:decode,readUrl:readUrl,urlWithExperiment:urlWithExperiment});
}));

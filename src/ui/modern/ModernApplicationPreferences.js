/* Browser-local display and navigation choices, separate from experiment data.
 * The module is pure apart from explicit storage calls. Invalid/blocked storage
 * must never prevent Modern from starting with safe defaults.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernApplicationPreferences=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var STORAGE_KEY='curvature-modern-application-preferences-v1';
  var LEGACY_NAVIGATION_KEY='curvature-modern-camera-navigation-v1';
  var QUALITIES=['accurate','fast','auto'];
  var DETAILS=['auto','1','2','4','8','16','32'];
  var BACKENDS=['canvas','webgl2'];
  var SPEEDS=[.01,.1,1,10,100,1000,10000];
  var TURNS=[.05,.2,1,5,20];
  var WHEELS=['auto',.1,1,10,100,1000];
  var PANEL_KEYS=['advanced','diagnostics','gpu','profiler'];
  function panels(input){
    var source=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
    var result={};
    PANEL_KEYS.forEach(function(key){result[key]=source[key]===true;});
    return Object.freeze(result);
  }
  var TABS=['Camera','Surface','Atmosphere','Objects','Display'];
  var SECTION_SUFFIXES=['camera.pose','camera.navigation','camera.animation','camera.savedViews',
    'camera.frameName','surface.geometry','atmosphere.profile','atmosphere.explanation',
    'atmosphere.visibility','atmosphere.shimmer','objects.group1','objects.group2',
    'objects.group1.variations','objects.group2.variations','display.advanced',
    'display.diagnostics','display.gpu','display.profiler'];
  var SECTION_KEYS=['scene','compare'].flatMap(function(mode){
    return SECTION_SUFFIXES.map(function(section){return mode+'.'+section;});
  });
  function workspace(input){
    var data=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
    var source=data.sections&&typeof data.sections==='object'&&!Array.isArray(data.sections)?data.sections:{};
    var sections={};
    SECTION_KEYS.forEach(function(key){if(typeof source[key]==='boolean')sections[key]=source[key];});
    return Object.freeze({
      // null preserves the mode/model embedded in pre-workspace experiments.
      mode:['scene','compare','demos'].includes(data.mode)?data.mode:null,
      sceneTab:TABS.includes(data.sceneTab)?data.sceneTab:'Camera',
      compareTab:TABS.includes(data.compareTab)?data.compareTab:'Camera',
      compareModel:['A','B'].includes(data.compareModel)?data.compareModel:null,
      sections:Object.freeze(sections)
    });
  }
  function from(choices,value,fallback){return choices.includes(value)?value:fallback;}
  function normalize(input){
    var data=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
    var nav=data.navigation&&typeof data.navigation==='object'&&!Array.isArray(data.navigation)?data.navigation:{};
    return Object.freeze({
      opticalQuality:from(QUALITIES,data.opticalQuality,'accurate'),
      previewDetail:from(DETAILS,data.previewDetail,'auto'),
      geometryBackend:from(BACKENDS,data.geometryBackend,'canvas'),
      displayPanels:panels(data.displayPanels),
      workspace:workspace(data.workspace),
      navigation:Object.freeze({speed:from(SPEEDS,nav.speed,10),
        turnRate:from(TURNS,nav.turnRate,1),wheelStep:from(WHEELS,nav.wheelStep,'auto')})
    });
  }
  function read(storage){
    if(!storage||typeof storage.getItem!=='function')return normalize();
    try{
      var value=storage.getItem(STORAGE_KEY);
      if(value!==null){
        var stored=JSON.parse(value);
        // A future incompatible schema must not silently select a backend.
        return stored&&stored.version!==undefined&&stored.version!==1?normalize():normalize(stored);
      }
      // One-way migration: only when there are no new-format preferences.
      var old=storage.getItem(LEGACY_NAVIGATION_KEY);
      if(old!==null)return normalize({navigation:JSON.parse(old)});
    }catch(error){/* Corrupt/blocked storage falls back to reference defaults. */}
    return normalize();
  }
  function write(storage,value){
    var data=normalize(value);
    if(!storage||typeof storage.setItem!=='function')return false;
    storage.setItem(STORAGE_KEY,JSON.stringify({version:1,opticalQuality:data.opticalQuality,
      previewDetail:data.previewDetail,geometryBackend:data.geometryBackend,
      displayPanels:data.displayPanels,navigation:data.navigation,workspace:data.workspace}));
    // Old navigation data cannot override the new selection on reload.
    return true;
  }
  function reset(storage){
    if(!storage||typeof storage.removeItem!=='function')return false;
    // Delete both generations so old speed settings cannot reappear later.
    storage.removeItem(STORAGE_KEY);
    storage.removeItem(LEGACY_NAVIGATION_KEY);
    return true;
  }
  return Object.freeze({STORAGE_KEY:STORAGE_KEY,LEGACY_NAVIGATION_KEY:LEGACY_NAVIGATION_KEY,
    defaults:function(){return normalize();},normalize:normalize,read:read,write:write,reset:reset});
}));

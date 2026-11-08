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
  function from(choices,value,fallback){return choices.includes(value)?value:fallback;}
  function normalize(input){
    var data=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
    var nav=data.navigation&&typeof data.navigation==='object'&&!Array.isArray(data.navigation)?data.navigation:{};
    return Object.freeze({
      opticalQuality:from(QUALITIES,data.opticalQuality,'accurate'),
      previewDetail:from(DETAILS,data.previewDetail,'auto'),
      geometryBackend:from(BACKENDS,data.geometryBackend,'canvas'),
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
      previewDetail:data.previewDetail,geometryBackend:data.geometryBackend,navigation:data.navigation}));
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

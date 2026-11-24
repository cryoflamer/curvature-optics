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
  var STUDIO_DETAILS=['full','balanced','performance'];
  var STUDIO_FPS=['auto','10','15','30','60'];
  var BACKENDS=['canvas','webgl2'];
  var HISTORY_SIZES=['small','medium','large'];
  var HISTORY_MODES=['all','scene','compare'];
  var HISTORY_GEOMETRIES=['any','globe','flat'];
  var HISTORY_RELATIONS=['any','same','different'];
  var HISTORY_ATMOSPHERES=['any','vacuum','standard','temperature-lapse','profile-transition',
    'inverse-temperature','inverse-spherical','exponential-occlusion'];
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
  var WORKSPACE_MODES=Object.freeze(['scene','compare','animation','calibration','images','demos']);
  function startupWorkspace(stored,physical,urlMode,shared,entryMode){
    var explicit=['scene','compare','demos'].includes(urlMode)?urlMode:null;
    var fallback=['scene','compare'].includes(physical)?physical:'scene';
    // New explicit links win. A deliberate tab choice in that same history
    // entry survives refresh without rewriting the public URL.
    if(shared||explicit)return WORKSPACE_MODES.includes(entryMode)?entryMode:(explicit||fallback);
    return WORKSPACE_MODES.includes(stored)?stored:fallback;
  }
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
      mode:WORKSPACE_MODES.includes(data.mode)?data.mode:null,
      sceneTab:TABS.includes(data.sceneTab)?data.sceneTab:'Camera',
      compareTab:TABS.includes(data.compareTab)?data.compareTab:'Camera',
      compareModel:['A','B'].includes(data.compareModel)?data.compareModel:null,
      calibrationView:data.calibrationView==='projects'?'projects':'editor',
      sections:Object.freeze(sections)
    });
  }
  function from(choices,value,fallback){return choices.includes(value)?value:fallback;}
  function historyFilters(input){
    var source=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
    return Object.freeze({
      query:typeof source.query==='string'?source.query.slice(0,160).trim():'',
      mode:from(HISTORY_MODES,source.mode,'all'),
      geometry:from(HISTORY_GEOMETRIES,source.geometry,'any'),
      atmosphere:from(HISTORY_ATMOSPHERES,source.atmosphere,'any'),
      geometryRelation:source.mode==='scene'?'any':from(HISTORY_RELATIONS,source.geometryRelation,'any'),
      refractionRelation:source.mode==='scene'?'any':from(HISTORY_RELATIONS,source.refractionRelation,'any')
    });
  }
  function storyboardQueue(input){
    var seen=new Set(),result=[];
    if(Array.isArray(input))input.forEach(function(id){
      if(!Number.isSafeInteger(id)||id<=0||seen.has(id)||result.length>=200)return;
      seen.add(id);result.push(id);
    });
    return Object.freeze(result);
  }
  // Presentation only: bounds prevent corrupt storage from changing layout.
  function hudAppearance(input){
    var value=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
    return Object.freeze({
      opacity:Number.isInteger(value.opacity)&&value.opacity>=0&&value.opacity<=100?
        value.opacity:90,
      position:['top-left','top-right','bottom-left','bottom-right'].includes(value.position)?
        value.position:'top-left',
      size:[75,100,125].includes(value.size)?value.size:100
    });
  }
  function normalize(input){
    var data=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
    var nav=data.navigation&&typeof data.navigation==='object'&&!Array.isArray(data.navigation)?data.navigation:{};
    return Object.freeze({
      opticalQuality:from(QUALITIES,data.opticalQuality,'accurate'),
      previewDetail:from(DETAILS,data.previewDetail,'auto'),
      studioPlaybackDetail:from(STUDIO_DETAILS,data.studioPlaybackDetail,'performance'),
      studioPlaybackFps:from(STUDIO_FPS,data.studioPlaybackFps,'auto'),
      geometryBackend:from(BACKENDS,data.geometryBackend,'canvas'),
      cameraHudVisible:data.cameraHudVisible!==false,
      cameraHudAppearance:hudAppearance(data.cameraHudAppearance),
      targetIndicatorVisible:data.targetIndicatorVisible!==false,
      studioTargetVisible:data.studioTargetVisible!==false,
      targetIndicatorSelection:from(['scene','group-0','group-1'],data.targetIndicatorSelection,'scene'),
      targetIndicatorVisible:data.targetIndicatorVisible!==false,
      studioTargetVisible:data.studioTargetVisible!==false,
      targetIndicatorSelection:from(['scene','group-0','group-1'],data.targetIndicatorSelection,'scene'),
      historyGallerySize:from(HISTORY_SIZES,data.historyGallerySize,'small'),
      historyPinnedCollapsed:data.historyPinnedCollapsed===true,
      historyPanelOpen:data.historyPanelOpen===true,
      historyFilters:historyFilters(data.historyFilters),
      studioPickerFilters:historyFilters(data.studioPickerFilters),
      historyStoryboardQueue:storyboardQueue(data.historyStoryboardQueue),
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
      previewDetail:data.previewDetail,studioPlaybackDetail:data.studioPlaybackDetail,
      studioPlaybackFps:data.studioPlaybackFps,
      geometryBackend:data.geometryBackend,
      cameraHudVisible:data.cameraHudVisible,cameraHudAppearance:data.cameraHudAppearance,
      targetIndicatorVisible:data.targetIndicatorVisible,studioTargetVisible:data.studioTargetVisible,
      targetIndicatorSelection:data.targetIndicatorSelection,
      targetIndicatorVisible:data.targetIndicatorVisible,studioTargetVisible:data.studioTargetVisible,
      targetIndicatorSelection:data.targetIndicatorSelection,
      historyGallerySize:data.historyGallerySize,historyPinnedCollapsed:data.historyPinnedCollapsed,
      historyPanelOpen:data.historyPanelOpen,historyFilters:data.historyFilters,
      studioPickerFilters:data.studioPickerFilters,
      historyStoryboardQueue:data.historyStoryboardQueue,
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
  // Global application state has one complete envelope. Workspace layout
  // and the selected experiment/model belong to their existing owners.
  var GLOBAL_KEYS=Object.freeze(Object.keys(normalize()).filter(function(key){
    return key!=='workspace'&&key!=='displayPanels';
  }));
  function globalValues(input){
    var data=normalize(input),result={};
    GLOBAL_KEYS.forEach(function(key){result[key]=data[key];});
    return result;
  }
  function canonical(value){
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(function(key){
      return JSON.stringify(key)+':'+canonical(value[key]);
    }).join(',')+'}';
    return JSON.stringify(value);
  }
  // The ordinary reader remains forgiving. Migration cannot silently
  // substitute defaults for an unreadable/future legacy preference source.
  function migrationSource(storage){
    if(!storage||typeof storage.getItem!=='function')
      throw Error('Legacy application preferences unavailable');
    function parse(raw){
      var value=JSON.parse(raw);
      if(!value||typeof value!=='object'||Array.isArray(value)||
         (value.version!==undefined&&value.version!==1))
        throw Error('Unsupported legacy application preferences');
      return value;
    }
    var raw=storage.getItem(STORAGE_KEY);
    if(raw!==null)return normalize(parse(raw));
    raw=storage.getItem(LEGACY_NAVIGATION_KEY);
    return normalize(raw===null?{}:{navigation:parse(raw)});
  }
  function createShared({registryApi,managerApi,store,storage}={}){
    if(!registryApi||!managerApi||!store)throw Error('Shared application preference dependencies required');
    var manager=null;
    function requireManager(){
      if(!manager||!manager.isReady())throw Error('Shared application preferences not restored');
      return manager;
    }
    function key(name){return 'application.'+name;}
    async function restore(){
      if(manager)throw Error('Shared application preferences already opened');
      // This first read only decides whether legacy input is needed. The
      // manager independently rereads the row and uses its own CAS baseline.
      var before=await store.read('global',{});
      var initial=before.revision===0?globalValues(migrationSource(storage)):globalValues();
      var adapter={
        read:async function(scope,ctx){
          var row=await store.read(scope,ctx);
          if(row.revision>0&&(!row.envelope||!row.envelope.values||
             Object.keys(row.envelope.values).length!==GLOBAL_KEYS.length||
             GLOBAL_KEYS.some(function(name){return !Object.hasOwn(row.envelope.values,key(name));})))
            throw Error('Unsupported or incomplete global preferences; original evidence retained');
          if(row.revision===0&&before.revision>0)
            throw Error('Global preferences disappeared during restore');
          return row;
        },
        write:function(scope,ctx,frame,revision){return store.write(scope,ctx,frame,revision);}
      };
      manager=managerApi.create({registry:registryApi.create(),store:adapter});
      GLOBAL_KEYS.forEach(function(name){
        manager.register({key:key(name),scope:'global',version:1,defaultValue:initial[name],
          validate:function(value){
            return canonical(normalize({[name]:value})[name])===canonical(value);
          }});
      });
      var report=await manager.restore();
      if(report.unrecognizedKeys.length)
        throw Error('Unsupported global preferences: '+report.unrecognizedKeys.join(', '));
      // Write only when the authoritative row is absent. A competing
      // initializer must win by CAS, not by silently replacing its values.
      await manager.initializeScope('global');
      return values();
    }
    function values(){
      var owner=requireManager(),result={};
      GLOBAL_KEYS.forEach(function(name){result[name]=owner.get(key(name));});
      return result;
    }
    function save(input){
      var owner=requireManager(),patch={},data=globalValues(input);
      GLOBAL_KEYS.forEach(function(name){patch[key(name)]=data[name];});
      return owner.setMany(patch);
    }
    return Object.freeze({restore,values,save,
      retryFailed:function(){return requireManager().retryFailed();},
      lastErrors:function(){return manager?manager.lastErrors():[];},
      hasUnacknowledged:function(){return !!manager&&manager.hasUnacknowledged();}});
  }
  return Object.freeze({GLOBAL_KEYS,globalValues,createShared,migrationSource,STORAGE_KEY:STORAGE_KEY,LEGACY_NAVIGATION_KEY:LEGACY_NAVIGATION_KEY,
    WORKSPACE_MODES:WORKSPACE_MODES,startupWorkspace:startupWorkspace,
    defaults:function(){return normalize();},normalize:normalize,read:read,write:write,reset:reset});
}));

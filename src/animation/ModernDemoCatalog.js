/* Read-only shipped Animation Studio projects, not named Library records.
 * No storage, editor or playback side effects. The classic-script data asset
 * is generated from portable JSON so HTTP and local file launch use one path.
 */
(function(root,factory){
  var projects=root.CurvatureModernAnimationProject;
  var library=root.CurvatureModernAnimationLibrary;
  var variants=root.CurvatureModernAnimationAtmosphereVariant;
  var bundled=function(){return root.CurvatureModernDemoCatalogData;};
  if(typeof module==='object'&&module.exports){
    projects=require('./ModernAnimationProject');
    library=require('./ModernAnimationLibrary');
    variants=require('./ModernAnimationAtmosphereVariant');
    bundled=function(){return require('./ModernDemoCatalogData');};
  }
  var assets=typeof module==='object'&&module.exports?require('./ModernReferenceImageLibrary'):root.CurvatureModernReferenceImageLibrary;
  var api=factory(projects,library,bundled,variants,assets);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernDemoCatalog=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(projects,library,bundled,variants,assets){
  'use strict';
  var FORMAT='curvature-modern-demo-catalog',VERSION=1;
  function shape(value,keys){
    return value&&typeof value==='object'&&!Array.isArray(value)&&
      Object.keys(value).sort().join(',')===keys;
  }
  function deepFreeze(value){
    if(value&&typeof value==='object'){
      Object.keys(value).forEach(function(key){deepFreeze(value[key]);});
      Object.freeze(value);
    }
    return value;
  }
  function parseManifest(text){
    if(typeof text!=='string')throw Error('Missing built-in demo manifest');
    var manifest=JSON.parse(text);
    if(!shape(manifest,'demos,format,version')||manifest.format!==FORMAT||
      manifest.version!==VERSION||!Array.isArray(manifest.demos))
      throw Error('Unsupported built-in demo catalog');
    var ids=new Set(),assets=new Set();
    return Object.freeze(manifest.demos.map(function(entry){
      if(!(shape(entry,'asset,id')||shape(entry,'asset,cover,id')||
        shape(entry,'asset,displayMode,id')||shape(entry,'asset,cover,displayMode,id'))||typeof entry.id!=='string'||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)||entry.id.length>80||
        typeof entry.asset!=='string'||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(entry.asset)||entry.asset==='catalog.json')
        throw Error('Invalid built-in demo catalog entry');
      if(entry.displayMode!==undefined&&!['scene','compare'].includes(entry.displayMode))
        throw Error('Invalid built-in demo display mode');
      if(ids.has(entry.id))throw Error('Duplicate built-in demo ID: '+entry.id);
      if(assets.has(entry.asset))throw Error('Duplicate built-in demo asset: '+entry.asset);
      if(entry.cover!==undefined&&(!shape(entry.cover,'asset,source,status')||
        !/^covers\/[a-z0-9]+(?:-[a-z0-9]+)*\.png$/.test(entry.cover.asset)||
        typeof entry.cover.source!=='string'||entry.cover.status!=='unverified'))
        throw Error('Invalid built-in demo cover');
      ids.add(entry.id);assets.add(entry.asset);
      return deepFreeze({id:entry.id,asset:entry.asset,displayMode:entry.displayMode||null,
        cover:entry.cover?Object.assign({},entry.cover):null});
    }));
  }
  // Atomic validation: the caller gets a complete ordered catalog or an error,
  // never a partially loaded list. No importEntries() or persistence is involved.
  function parse(manifestText,readAsset){
    if(typeof readAsset!=='function')throw TypeError('Built-in demo asset reader is required');
    var projectIds=new Set();
    return Object.freeze(parseManifest(manifestText).map(function(entry){
      try{
        var text=readAsset(entry.asset);
        if(typeof text!=='string')throw Error('Missing asset: '+entry.asset);
        var bundle=library.parseBundle(text),items=bundle.animations;
        if(library.referenceIds(items).length&&!bundle.referenceImages.length)throw Error('Built-in demo requires embedded reference originals');
        if(items.length!==1)throw Error('Expected exactly one portable animation');
        var item=items[0],project=item.project;
        var images=item.keyframeThumbnails||[];
        if(projectIds.has(project.id))throw Error('Duplicate authored project ID: '+project.id);
        if(!projects.ready(project))throw Error('Animation project is not preview-ready');
        projectIds.add(project.id);
        // History IDs are browser-local provenance, not trusted catalog links.
        // The original portable source remains untouched.
        project=projects.validate(Object.assign({},project,{keyframes:project.keyframes.map(function(frame){
          return Object.assign({},frame,{sourceSnapshotId:null});
        })}));
        // A catalog presentation override is explicit and applies only to Camera.
        // Physical contracts bind their target to the authored display scope.
        if(entry.displayMode&&entry.displayMode!==project.baseExperiment.display.mode){
          // Source images represent the authored view, not the overridden display.
          images=[];
          if(project.mode!=='camera')throw Error('Display override requires a Camera project');
          var base=Object.assign({},project.baseExperiment,{display:Object.assign({},
            project.baseExperiment.display,{mode:entry.displayMode})});
          var variant=Object.assign({},project,{baseExperiment:base});
          if(project.contract)variant.contract=Object.assign({},project.contract,{referenceExperiment:base});
          project=projects.validate(variant);
        }
        return deepFreeze({id:entry.id,asset:entry.asset,project:project,
          cover:entry.cover,quality:item.quality==='auto'?'canvas-direct':item.quality,thumbnail:item.thumbnail,createdAt:item.createdAt,
          updatedAt:item.updatedAt,keyframeThumbnails:images,referenceImages:bundle.referenceImages});
      }catch(error){
        throw Error('Built-in demo '+entry.id+' ('+entry.asset+'): '+error.message);
      }
    }));
  }
  function exportDemo(id,lookup,options){
    var demo=load().find(function(entry){return entry.id===id;});
    if(!demo)throw Error('Unknown built-in demo: '+id);
    var project=options&&options.atmosphere?variants.derive(demo.project,options.atmosphere):demo.project;
    var changed=JSON.stringify(project)!==JSON.stringify(demo.project);
    var shipped=new Map();
    var frames=projects.frameExperiments(demo.project);
    demo.keyframeThumbnails.forEach(function(item){shipped.set(JSON.stringify(frames[item.index]),item.image);});
    var resolve=options&&options.compact?undefined:function(experiment){
      return (lookup&&lookup(experiment))||shipped.get(JSON.stringify(experiment));
    };
    // Portable records carry the authored project ID, not the catalog identity.
    return library.exportPortable([{version:1,id:demo.project.id,project:project,
      quality:options&&options.quality!==undefined?options.quality:demo.quality,thumbnail:changed?null:demo.thumbnail,
      cover:demo.cover?bundled().covers[demo.cover.asset]:null,
      createdAt:demo.createdAt||1,updatedAt:demo.updatedAt||1}],resolve,Object.assign({},options,{referenceImages:demo.referenceImages}));
  }
  function copyToLibrary(indexedDB,id,now,crypto,{library:targetLibrary=library,assets:targetAssets=assets}={}){
    return Promise.resolve().then(function(){
      var demo=load().find(function(entry){return entry.id===id;});
      if(!demo)throw Error('Unknown built-in demo: '+id);
      var project=projects.validate(Object.assign({},demo.project,{
        id:targetLibrary.makeId(crypto,now),name:demo.project.name.slice(0,113)+' (copy)'}));
      function save(resolved){return targetLibrary.create(indexedDB,resolved,demo.quality,now,demo.thumbnail,true,
        demo.cover?bundled().covers[demo.cover.asset]:null);}
      if(!demo.referenceImages.length)return save(project);
      return targetAssets.importAssets(indexedDB,demo.referenceImages,crypto).then(function(mapping){
        return save(targetLibrary.remapReferences({project:project},mapping).project);
      });
    });
  }
  function load(){
    var data=bundled();
    if(!data||typeof data.manifest!=='string'||!data.assets)
      throw Error('Missing built-in demo catalog data; check the shipped assets');
    return parse(data.manifest,function(asset){
      return Object.prototype.hasOwnProperty.call(data.assets,asset)?data.assets[asset]:null;
    });
  }
  return Object.freeze({FORMAT:FORMAT,VERSION:VERSION,parseManifest:parseManifest,parse:parse,load:load,copyToLibrary:copyToLibrary,exportDemo:exportDemo});
}));

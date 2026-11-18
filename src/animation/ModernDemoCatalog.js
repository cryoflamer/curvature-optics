/* Read-only shipped Animation Studio projects, not named Library records.
 * No storage, editor or playback side effects. The classic-script data asset
 * is generated from portable JSON so HTTP and local file launch use one path.
 */
(function(root,factory){
  var projects=root.CurvatureModernAnimationProject;
  var library=root.CurvatureModernAnimationLibrary;
  var bundled=function(){return root.CurvatureModernDemoCatalogData;};
  if(typeof module==='object'&&module.exports){
    projects=require('./ModernAnimationProject');
    library=require('./ModernAnimationLibrary');
    bundled=function(){return require('./ModernDemoCatalogData');};
  }
  var api=factory(projects,library,bundled);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernDemoCatalog=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(projects,library,bundled){
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
      if(!shape(entry,'asset,id')||typeof entry.id!=='string'||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)||entry.id.length>80||
        typeof entry.asset!=='string'||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(entry.asset)||entry.asset==='catalog.json')
        throw Error('Invalid built-in demo catalog entry');
      if(ids.has(entry.id))throw Error('Duplicate built-in demo ID: '+entry.id);
      if(assets.has(entry.asset))throw Error('Duplicate built-in demo asset: '+entry.asset);
      ids.add(entry.id);assets.add(entry.asset);
      return Object.freeze({id:entry.id,asset:entry.asset});
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
        var items=library.parsePortable(text);
        if(items.length!==1)throw Error('Expected exactly one portable animation');
        var item=items[0],project=item.project;
        if(projectIds.has(project.id))throw Error('Duplicate authored project ID: '+project.id);
        if(!projects.ready(project))throw Error('Animation project is not preview-ready');
        projectIds.add(project.id);
        // History IDs are browser-local provenance, not trusted catalog links.
        // The original portable source remains untouched.
        project=projects.validate(Object.assign({},project,{keyframes:project.keyframes.map(function(frame){
          return Object.assign({},frame,{sourceSnapshotId:null});
        })}));
        return deepFreeze({id:entry.id,asset:entry.asset,project:project,
          quality:item.quality,thumbnail:item.thumbnail,createdAt:item.createdAt,
          updatedAt:item.updatedAt});
      }catch(error){
        throw Error('Built-in demo '+entry.id+' ('+entry.asset+'): '+error.message);
      }
    }));
  }
  function load(){
    var data=bundled();
    if(!data||typeof data.manifest!=='string'||!data.assets)
      throw Error('Missing built-in demo catalog data; check the shipped assets');
    return parse(data.manifest,function(asset){
      return Object.prototype.hasOwnProperty.call(data.assets,asset)?data.assets[asset]:null;
    });
  }
  return Object.freeze({FORMAT:FORMAT,VERSION:VERSION,parseManifest:parseManifest,parse:parse,load:load});
}));

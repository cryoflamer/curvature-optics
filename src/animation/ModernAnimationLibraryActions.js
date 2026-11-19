/* Animation Library operation coordinator.
 * The Library owns durable named records; the application owns live drafts,
 * UI state, and the effects of rename/delete/save on working workspaces.
 */
(function(root,factory){
  var naming=root.CurvatureModernSemanticNaming;
  if(typeof module==='object'&&module.exports)naming=require('../ui/modern/ModernSemanticNaming');
  var api=factory(naming);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationLibraryActions=api;
}(typeof window!=='undefined'?window:globalThis,function(naming){
  'use strict';
  // Name the actual portable payload, including cached (possibly partial) images.
  // Local time is intentional: filenames sort naturally in the user's downloads.
  function exportFilename(json,now,all){
    var payload=JSON.parse(json),entries=payload.animations||[];
    var name=!all&&entries.length===1&&entries[0].project?entries[0].project.name:'curvature-animations';
    var slug=String(name||'').normalize('NFKC').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'');
    slug=Array.from(slug).slice(0,60).join('').replace(/-+$/,'')||'curvature-animation';
    var date=new Date(now===undefined?Date.now():now);
    function pad(n,width){return String(n).padStart(width||2,'0');}
    var stamp=pad(date.getFullYear(),4)+pad(date.getMonth()+1)+pad(date.getDate())+'-'+
      pad(date.getHours())+pad(date.getMinutes())+pad(date.getSeconds())+'-'+pad(date.getMilliseconds(),3);
    var images=entries.some(function(entry){return Array.isArray(entry.keyframeThumbnails)&&entry.keyframeThumbnails.length>0;});
    return slug+(!all&&entries.length===1?naming.atmosphereSuffix(entries[0].project):'')+'-'+stamp+(images?'-with-thumbnails':'')+'.json';
  }
  function create(options){
    if(!options||typeof options.library!=='function'||
       typeof options.busy!=='function'||typeof options.render!=='function'||
       typeof options.notice!=='function'||typeof options.refreshState!=='function')
      throw TypeError('Animation Library actions require state, storage and UI handlers');
    function library(){return options.library();}
    function indexedDB(){return options.indexedDB();}
    function finishBusy(){options.setBusy(false);options.render();}
    function refresh(){
      var api=library();
      if(!api){
        options.notice('Animation Library module failed to load; check the browser console.',true);
        return Promise.resolve([]);
      }
      if(!indexedDB()){
        options.notice('Named animations require browser IndexedDB storage.',true);
        return Promise.resolve([]);
      }
      return api.list(indexedDB()).then(function(entries){
        options.refreshState(entries);options.render();return entries;
      }).catch(function(error){
        options.notice('Animation Library unavailable: '+error.message,true);return [];
      });
    }
    function exportEntries(all){
      var api=library();if(!api||options.busy())return;
      try{
        var entries=all?options.entries():options.entries().filter(function(entry){
          return entry.id===options.selected();
        });
        if(!entries.length)throw Error('Select a saved animation first');
        var json=api.exportPortable(entries,options.keyframeThumbnail);
        options.download(json,exportFilename(json,undefined,all));
        options.notice('Exported '+entries.length+' complete animation'+
          (entries.length===1?'':'s')+' to portable JSON.',false);
      }catch(error){options.notice('Animation export failed: '+error.message,true);}
    }
    function importFile(file){
      var api=library();if(options.busy()||!api||!file)return;
      if(!indexedDB()){options.notice('Animation Library requires IndexedDB.',true);return;}
      if(file.size>api.MAX_PORTABLE_LENGTH){
        options.notice('Animation JSON file is too large.',true);return;
      }
      options.setBusy(true);options.notice('Checking animation JSON…',false);
      return Promise.resolve().then(function(){return file.text();}).then(function(contents){
        var entries=api.parsePortable(contents);
        return api.importEntries(indexedDB(),entries,undefined,options.crypto()).then(function(result){
          if(!options.importKeyframeThumbnails)return result;
          return Promise.resolve().then(function(){return options.importKeyframeThumbnails(entries);})
            .then(function(ok){if(ok===false)result.thumbnailWarning=true;return result;},
              function(){result.thumbnailWarning=true;return result;});
        });
      }).then(function(result){
        options.imported(result);
        return refresh();
      }).catch(function(error){
        options.fail('Animation import failed: '+error.message);
      }).then(finishBusy);
    }
    function rename(id,name){
      var api=library();if(options.busy()||!api)return;
      var current=options.entries().find(function(entry){return entry.id===id;});
      if(!current){options.notice('Saved animation no longer exists.',true);return;}
      options.setBusy(true);options.render();
      return api.rename(indexedDB(),id,name,current.updatedAt).then(function(saved){
        options.renamed(saved,current,id);
        return refresh();
      }).catch(function(error){options.fail('Cannot rename animation: '+error.message);})
        .then(finishBusy);
    }
    function setCover(id,prepare){
      var api=library();if(options.busy()||!api)return;
      var current=options.entries().find(function(entry){return entry.id===id;});
      if(!current){options.notice('Saved animation no longer exists.',true);return;}
      options.setBusy(true);options.render();
      return Promise.resolve().then(prepare).then(function(image){
        return api.setCover(indexedDB(),id,image,current.updatedAt);
      }).then(function(saved){
        options.coverChanged(saved,current,id);
        return refresh();
      }).catch(function(error){options.fail('Cannot change cover: '+error.message);})
        .then(finishBusy);
    }
    function save(request){
      var api=library();if(options.busy()||!api)return Promise.resolve(false);
      options.setBusy(true);options.notice('Saving animation to library…',false);
      // Save As deliberately allows duplicate animation content. The expected
      // revision on Save Changes is enforced by the Library transaction.
      var operation;
      try{
        operation=request.replace?
          api.update(indexedDB(),request.project,request.quality,request.active.updatedAt,
            undefined,request.thumbnail):
          api.create(indexedDB(),request.project,request.quality,undefined,
            request.thumbnail,true,request.cover);
      }catch(error){
        options.notice('Animation was not saved: '+error.message,true);
        finishBusy();return Promise.resolve(false);
      }
      return Promise.resolve(operation).then(function(saved){
        options.saved(saved,request);
        return refresh().then(function(){return true;});
      }).catch(function(error){
        options.notice('Animation was not saved: '+error.message,true);return false;
      }).then(function(ok){finishBusy();return ok;});
    }
    function remove(id){
      var api=library();if(id)options.select(id);
      id=options.selected();
      if(!id||options.busy()||!api)return;
      var found=options.entries().find(function(entry){return entry.id===id;});
      if(!options.confirm('Delete saved animation "'+
        (found?found.project.name:id)+'"? The current draft will remain available.'))return;
      options.setBusy(true);options.render();
      return api.remove(indexedDB(),id).then(function(removed){
        options.deleted(id,removed);
        return refresh();
      }).catch(function(error){options.fail('Cannot delete animation: '+error.message);})
        .then(finishBusy);
    }
    return Object.freeze({refresh:refresh,exportEntries:exportEntries,
      importFile:importFile,rename:rename,setCover:setCover,save:save,remove:remove});
  }
  return Object.freeze({create:create,exportFilename:exportFilename});
}));

/* Deterministic, bounded screenshots of completed physical Canvas frames.
 * Compare thumbnails contain BOTH distinct viewports. This module never
 * renders physics, reads the DOM UI, or modifies an experiment snapshot.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernExperimentThumbnail=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var MAX_DATA_LENGTH=750000,VIEW_WIDTH=480,VIEW_HEIGHT=300;
  var CACHE_ENTRIES=200,CACHE_CHARS=12000000;
  var CACHE_DATABASE='curvature-modern-keyframe-thumbnails',CACHE_STORE='images';
  // The physical painter intentionally clears its Canvas to transparent. In
  // the live Modern viewport CSS paints WHITE behind it; copying raw pixels
  // without that backdrop exposes the gallery's navy card background instead.
  var VIEWPORT_BACKGROUND='#fff';
  function capture(doc,mode,views){
    if(!doc||typeof doc.createElement!=='function'||
      !['scene','compare'].includes(mode)||!Array.isArray(views)||
      views.length!==(mode==='scene'?1:2))return null;
    try{
      var canvas=doc.createElement('canvas');
      if(!canvas||!canvas.getContext||!canvas.toDataURL)return null;
      var ctx=canvas.getContext('2d');
      if(!ctx||typeof ctx.drawImage!=='function')return null;
      // Fit the output to the source aspect ratio instead of adding artificial
      // dark bars inside a fixed 480 x 300 frame. All viewports share the
      // same source canvas geometry in the current Scene/Compare renderer.
      var first=views[0]&&views[0].layers&&views[0].layers[0];
      if(!first||!(first.width>0)||!(first.height>0))return null;
      var fit=Math.min(VIEW_WIDTH/first.width,VIEW_HEIGHT/first.height);
      var sideWidth=Math.max(1,Math.round(first.width*fit));
      var sideHeight=Math.max(1,Math.round(first.height*fit));
      canvas.width=sideWidth*views.length;canvas.height=sideHeight;
      // Recreate the actual displayed composition, not just the transparent
      // backing-store pixels: physical scene over white, then presentation
      // image and transparent guides, separately for both Compare viewports.
      // Draw the backing AFTER setting canvas dimensions (resizing resets 2D
      // state) and BEFORE any source/guide layers.
      if(typeof ctx.fillRect!=='function')return null;
      ctx.fillStyle=VIEWPORT_BACKGROUND;
      ctx.fillRect(0,0,canvas.width,canvas.height);
      for(var i=0;i<views.length;i++){
        var view=views[i];
        if(!view||!Array.isArray(view.layers)||!view.layers.length)return null;
        var primary=view.layers[0];
        if(!primary||!(primary.width>0)||!(primary.height>0))return null;
        // Require consistent viewport proportions; otherwise fall back to a
        // thumbnail-less snapshot instead of misrepresenting either view.
        if(primary.width!==first.width||primary.height!==first.height)return null;
        var left=i*sideWidth,top=0,width=sideWidth,height=sideHeight;
        view.layers.forEach(function(layer){
          if(!layer||layer.width!==primary.width||layer.height!==primary.height)
            throw RangeError('Screenshot layers must have matching dimensions');
          ctx.drawImage(layer,left,top,width,height);
        });
        if(mode==='compare'){
          ctx.fillStyle='rgba(12,31,54,.86)';ctx.fillRect(left+6,6,24,22);
          ctx.fillStyle='#fff';ctx.font='bold 14px Arial';ctx.fillText(i===0?'A':'B',left+13,22);
        }
      }
      var dataUrl=canvas.toDataURL('image/webp',.72);
      if(!/^data:image\/(webp|png);base64,[a-z\d+/=]+$/i.test(dataUrl)||
        dataUrl.length>MAX_DATA_LENGTH)return null;
      return {dataUrl:dataUrl,width:canvas.width,height:canvas.height,mode:mode};
    }catch(error){return null;} // Tainted/non-exportable Canvas must not block save.
  }
  // A partial Compare redraw must not make an unchanged B appear stale when
  // only A physics changed; shared camera/objects invalidate both sides.
  function viewKey(snapshot,view){
    if(!snapshot||!snapshot.scene||!snapshot.compare||!snapshot.display)
      throw TypeError('A validated experiment is required');
    var common={eyeLevel:snapshot.display.eyeLevel,horizon:snapshot.display.horizon};
    if(view==='Scene')return JSON.stringify({scene:snapshot.scene,common:common});
    if(view!=='A'&&view!=='B')throw RangeError('Unknown screenshot viewport');
    return JSON.stringify({camera:snapshot.scene.camera,objects:snapshot.scene.objects,
      grid:snapshot.scene.showGrid,model:snapshot.compare[view],common:common});
  }
  function valid(value,mode){
    if(value===null||value===undefined)return null;
    if(!value||typeof value!=='object'||Array.isArray(value)||
      value.mode!==mode||!Number.isInteger(value.width)||!Number.isInteger(value.height)||
      value.width<1||value.width>1024||value.height<1||value.height>512||
      typeof value.dataUrl!=='string'||value.dataUrl.length>MAX_DATA_LENGTH||
      !/^data:image\/(webp|png);base64,[a-z\d+/=]+$/i.test(value.dataUrl))
      throw RangeError('Invalid experiment thumbnail');
    return {dataUrl:value.dataUrl,width:value.width,height:value.height,mode:mode};
  }
  // Transient storyboard cache: exact snapshot identity, not frame/source IDs
  // or timing. A bounded LRU can safely share unchanged views across copies.
  function keyframeKey(experiment){
    return JSON.stringify(experiment);
  }
  function historyThumbnail(frame,experiment,entries){
    var source=frame.sourceSnapshotId!=null&&entries.find(function(entry){
      return entry.id===frame.sourceSnapshotId;
    });
    if(!source||keyframeKey(source.experiment)!==keyframeKey(experiment))return null;
    try{return valid(source.thumbnail,experiment.display.mode);}catch(error){return null;}
  }
  function createKeyframeCache(options){
    options=options||{};
    var maxEntries=options.maxEntries||CACHE_ENTRIES,maxChars=options.maxChars||CACHE_CHARS;
    var cache=new Map(),chars=0,pending=null;
    function get(experiment){
      var key=keyframeKey(experiment),entry=cache.get(key);
      if(!entry)return null;
      cache.delete(key);cache.set(key,entry);return entry.image;
    }
    function put(experiment,image,silent){
      var key=keyframeKey(experiment),normalized;
      try{normalized=valid(image,experiment.display.mode);}catch(error){return null;}
      if(!normalized)return null;
      var size=key.length+normalized.dataUrl.length;
      if(size>maxChars)return null;
      if(cache.has(key)){chars-=cache.get(key).size;cache.delete(key);}
      cache.set(key,{image:Object.freeze(normalized),size:size});chars+=size;
      while(cache.size>maxEntries||chars>maxChars){
        var oldest=cache.keys().next().value;
        chars-=cache.get(oldest).size;cache.delete(oldest);
      }
      if(!silent&&options.onPut)try{options.onPut(experiment,normalized);}catch(error){}
      return cache.get(key).image;
    }
    function request(player,frame,arrival,experiment,entries,refresh){
      pending=null;
      if(!refresh){
        if(get(experiment))return false;
        var historical=historyThumbnail(frame,experiment,entries);
        if(historical){put(experiment,historical);return false;}
      }
      pending={player:player,key:frame.key,arrival:arrival,experiment:keyframeKey(experiment)};
      return true;
    }
    function complete(player,key,renderedAt,playing,experiment,captureImage){
      if(!pending)return null;
      var wanted=pending;pending=null;
      if(wanted.player!==player||wanted.key!==key||wanted.arrival!==renderedAt||playing||
         wanted.experiment!==keyframeKey(experiment))return null;
      // Optional image capture must never turn a valid physical render into a failure.
      try{return put(experiment,captureImage());}catch(error){return null;}
    }
    function restore(rows){
      // Keep captures made while the initial asynchronous read was in flight.
      var current=Array.from(cache.entries());
      cache.clear();chars=0;
      rows.forEach(function(raw){var row=checkedRow(raw);if(row)put(JSON.parse(row.id),row.image,true);});
      current.forEach(function(pair){put(JSON.parse(pair[0]),pair[1].image,true);});
    }
    return Object.freeze({get:get,put:put,restore:restore,request:request,complete:complete,
      cancel:function(){pending=null;},hasPending:function(){return pending!==null;}});
  }
  // Independent, disposable IndexedDB cache. Exact state keys intentionally
  // share images across projects/drafts/demos, without any owner or revision.
  // Read/write transactions serialize pruning with concurrent browser tabs.
  function cacheRow(experiment,image,now){
    var id=keyframeKey(experiment),normalized=valid(image,experiment.display.mode);
    if(!normalized||id.length+normalized.dataUrl.length>CACHE_CHARS)return null;
    return {id:id,image:normalized,touched:now};
  }
  function checkedRow(row){
    try{
      if(!row||typeof row.id!=='string'||row.id.length>CACHE_CHARS||
         !Number.isSafeInteger(row.touched)||row.touched<0)return null;
      var result=cacheRow(JSON.parse(row.id),row.image,row.touched);
      return result&&result.id===row.id?result:null;
    }catch(error){return null;}
  }
  function boundedRows(rows){
    var chars=0,result=[];
    rows.sort(function(a,b){return b.touched-a.touched;});
    rows.forEach(function(row){
      var size=row.id.length+row.image.dataUrl.length;
      if(result.length<CACHE_ENTRIES&&chars+size<=CACHE_CHARS){result.push(row);chars+=size;}
    });
    return result.reverse(); // oldest first, for memory LRU hydration
  }
  function cacheTransaction(indexedDB,mode,additions){
    if(!indexedDB||typeof indexedDB.open!=='function')return Promise.reject(Error('Keyframe thumbnail storage unavailable'));
    return new Promise(function(resolve,reject){
      var db,tx,done=false,result,request;
      function fail(error){if(done)return;done=true;if(db)db.close();reject(error||Error('Thumbnail cache transaction failed'));}
      try{request=indexedDB.open(CACHE_DATABASE,1);}catch(error){fail(error);return;}
      request.onblocked=function(){fail(Error('Thumbnail cache database blocked'));};
      request.onerror=function(){fail(request.error);};
      request.onupgradeneeded=function(){
        var opened=request.result;
        if(!opened.objectStoreNames.contains(CACHE_STORE))opened.createObjectStore(CACHE_STORE,{keyPath:'id'});
      };
      request.onsuccess=function(){
        db=request.result;if(done){db.close();return;}
        try{
          tx=db.transaction(CACHE_STORE,mode);
          tx.oncomplete=function(){if(!done){done=true;db.close();resolve(result);}};
          tx.onabort=tx.onerror=function(){fail(tx.error);};
          var store=tx.objectStore(CACHE_STORE),read=store.getAll();
          read.onsuccess=function(){try{
            var old=read.result||[],map=new Map();
            old.forEach(function(raw){var row=checkedRow(raw);if(row)map.set(row.id,row);});
            var latest=Array.from(map.values()).reduce(function(max,row){return Math.max(max,row.touched);},0);
            (additions||[]).forEach(function(row){
              // Monotonic ordering even for a batch or two tabs writing in the same millisecond.
              row.touched=Math.max(row.touched,latest+1);latest=row.touched;map.set(row.id,row);
            });
            result=boundedRows(Array.from(map.values()));
            if(mode==='readwrite'){
              var keep=new Set(result.map(function(row){return row.id;}));
              old.forEach(function(row){if(!keep.has(row.id))store.delete(row.id);});
              (additions||[]).forEach(function(row){if(keep.has(row.id)&&map.get(row.id)===row)store.put(row);});
            }
          }catch(error){try{tx.abort();}catch(ignore){}fail(error);}};
        }catch(error){fail(error);}
      };
    });
  }
  function createKeyframePersistence(indexedDB,onError){
    var tail=Promise.resolve();
    function report(error){if(onError)try{onError(error);}catch(ignore){}return false;}
    function read(){return tail.then(function(){return cacheTransaction(indexedDB,'readonly');});}
    function write(items){
      var rows=[];
      try{items.forEach(function(item){var row=cacheRow(item.experiment,item.image,Date.now());if(row)rows.push(row);});}
      catch(error){return Promise.resolve(report(error));}
      if(!rows.length)return tail.then(function(){return true;});
      tail=tail.then(function(){return cacheTransaction(indexedDB,'readwrite',rows);})
        .then(function(){return true;},report);
      return tail;
    }
    return Object.freeze({read:read,write:write});
  }
  // Decode only local raster images, downsample, and re-encode to remove metadata.
  // Do not keep object URLs or the original potentially enormous source file.
  function coverFromFile(doc,file){
    return Promise.resolve().then(function(){
      if(!file||!/^image\/(png|jpeg|webp)$/i.test(file.type)||!(file.size>0)||file.size>20000000)
        throw Error('Choose a PNG, JPEG or WebP image up to 20 MB');
      var urls=doc.defaultView.URL,url=urls.createObjectURL(file);
      return new Promise(function(resolve,reject){
        var image=doc.createElement('img');
        image.onload=function(){try{
          var w=image.naturalWidth,h=image.naturalHeight;
          if(!(w>0&&h>0)||w*h>50000000)throw Error('Unsupported image dimensions');
          var canvas=doc.createElement('canvas'),fit=Math.min(1,960/w,600/h);
          canvas.width=Math.max(1,Math.round(w*fit));canvas.height=Math.max(1,Math.round(h*fit));
          var ctx=canvas.getContext('2d');ctx.fillStyle=VIEWPORT_BACKGROUND;
          ctx.fillRect(0,0,canvas.width,canvas.height);
          ctx.drawImage(image,0,0,canvas.width,canvas.height);
          var data=canvas.toDataURL('image/jpeg',.85);
          if(data.length>MAX_DATA_LENGTH||!/^data:image\/(jpeg|png);base64,[a-z\d+/=]+$/i.test(data))
            throw Error('Encoded cover is too large or unavailable');
          resolve(data);
        }catch(error){reject(error);}};
        image.onerror=function(){reject(Error('Cannot decode cover image'));};
        image.src=url;
      }).finally(function(){urls.revokeObjectURL(url);});
    });
  }
  return Object.freeze({capture:capture,coverFromFile:coverFromFile,validate:valid,viewKey:viewKey,
    historyThumbnail:historyThumbnail,createKeyframeCache:createKeyframeCache,
    createKeyframePersistence:createKeyframePersistence,CACHE_DATABASE:CACHE_DATABASE,CACHE_STORE:CACHE_STORE});
}));

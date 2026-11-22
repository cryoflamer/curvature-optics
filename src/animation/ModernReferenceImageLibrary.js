/* Independent durable observation library. No project or thumbnail-cache access. */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?require('./ModernReferenceImage'):root.CurvatureModernReferenceImage);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernReferenceImageLibrary=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(images){
  'use strict';
  var DATABASE='curvature-modern-reference-images',STORE='observations',ANNOTATIONS='annotations',MAX_ITEMS=100,MAX_CHARS=64*1024*1024;
  var MAX_ANNOTATION_CHARS=512*1024,VERSION_ANNOTATED=2;
  var KINDS=['unclassified','photograph','diagram','map','graph','render','screenshot','illustration','other'];
  var editable=['title','description','author','sourceUrl','license','notes','cameraMetadata'];
  function revision(n){if(!Number.isSafeInteger(n)||n<1)throw RangeError('Invalid observation revision');return n;}
  function normalize(row){
    var record=images.validate(row.record);
    if(row.id!==record.id)throw Error('Observation ID mismatch');
    return {id:record.id,revision:revision(row.revision),record:record};
  }
  function size(row){return JSON.stringify(row).length;}
  function quota(rows){
    if(rows.length>MAX_ITEMS||rows.reduce(function(n,row){return n+size(row);},0)>MAX_CHARS)
      throw RangeError('Reference Image Library limit reached. Save originals externally before removing unused observations.');
  }
  function annotation(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||
      Object.keys(value).some(function(k){return !['kind','tags','collections'].includes(k)}))
      throw RangeError('Invalid image classification metadata');
    var kind=value.kind||'unclassified';
    if(!KINDS.includes(kind))throw RangeError('Invalid image kind');
    function labels(input,max,length,label){
      if(!Array.isArray(input)||input.length>max)throw RangeError('Invalid image '+label);
      var unique=new Set();
      return input.map(function(item){
        if(typeof item!=='string'||!item.trim()||item.length>length||
          /[\u0000-\u001f\u007f]/.test(item))throw RangeError('Invalid image '+label);
        var trimmed=item.trim(),lower=trimmed.toLocaleLowerCase();
        if(unique.has(lower))throw RangeError('Duplicate image '+label);
        unique.add(lower);return trimmed;
      });
    }
    return {kind:kind,tags:labels(value.tags||[],20,64,'tags'),
      collections:labels(value.collections||[],12,80,'collections')};
  }
  function annotated(row){
    if(!row)return {kind:'unclassified',tags:[],collections:[],annotationRevision:0};
    if(!Number.isSafeInteger(row.revision)||row.revision<1)
      throw RangeError('Invalid annotation revision');
    var normalized=annotation({kind:row.kind,tags:row.tags,collections:row.collections});
    return {...normalized,annotationRevision:row.revision};
  }
  function annotationQuota(rows){
    if(rows.length>MAX_ITEMS||JSON.stringify(rows).length>MAX_ANNOTATION_CHARS)
      throw RangeError('Image classifications exceed local metadata quota');
  }
  function transaction(indexedDB,mode,action,includeAnnotations){
    return new Promise(function(resolve,reject){
      var db,tx,request,done=false,result;
      function fail(error){if(done)return;done=true;if(db)db.close();reject(error||Error('Observation storage unavailable'));}
      try{request=indexedDB.open(DATABASE);}catch(error){fail(error);return;}
      request.onupgradeneeded=function(){
        if(!request.result.objectStoreNames.contains(STORE))
          request.result.createObjectStore(STORE,{keyPath:'id'});
      };
      request.onblocked=function(){fail(Error('Observation storage upgrade blocked'));};
      request.onerror=function(){fail(request.error);};
      request.onsuccess=function(){
        db=request.result;if(done){db.close();return;}
        db.onversionchange=function(){db.close();};
        var available=db.objectStoreNames.contains(ANNOTATIONS);
        if(includeAnnotations===true&&!available){fail(Error('Enable Image Library classification before editing kind or tags'));return;}
        try{tx=db.transaction(includeAnnotations&&available?[STORE,ANNOTATIONS]:STORE,mode);}catch(error){fail(error);return;}
        tx.oncomplete=function(){if(done)return;done=true;db.close();resolve(result);};
        tx.onerror=function(){fail(tx.error);};tx.onabort=function(){fail(tx.error||Error('Observation transaction aborted'));};
        function abort(error){try{tx.abort();}catch(ignore){}fail(error);}
        function read(req,fn){req.onsuccess=function(){try{fn(req.result);}catch(error){abort(error);}};}
        try{action(tx.objectStore(STORE),read,function(value){result=value;},available&&includeAnnotations?tx.objectStore(ANNOTATIONS):null);}catch(error){abort(error);}
      };
    });
  }
  function list(db){return transaction(db,'readonly',function(store,read,finish,annotations){
    read(store.getAll(),function(raw){
      var rows=raw.map(normalize);
      function complete(extra){
        var byId=new Map(extra.map(function(r){return [r.id,annotated(r)];}));
        finish(rows.map(function(row){
          var r=row.record;return {id:r.id,revision:row.revision,title:r.title,
            description:r.description||'',author:r.author,license:r.license||'',
            sourceUrl:r.sourceUrl||'',width:r.original.width,height:r.original.height,
            thumbnail:r.thumbnail||null,...(byId.get(r.id)||annotated(null))};
        }).sort(function(a,b){return a.title.localeCompare(b.title)||a.id.localeCompare(b.id);}));
      }
      if(annotations)read(annotations.getAll(),complete);else complete([]);
    });
  },'optional');}
  function get(db,id){images.validId(id);return transaction(db,'readonly',function(store,read,finish,annotations){
    read(store.get(id),function(row){
      if(!row){finish(null);return;}
      var normalized=normalize(row);
      if(!annotations){finish({...normalized,...annotated(null)});return;}
      read(annotations.get(id),function(extra){finish({...normalized,...annotated(extra)});});
    });
  },'optional');}
  function annotationStatus(db){
    return transaction(db,'readonly',function(store,read,finish,annotations){
      finish({enabled:!!annotations,version:annotations?VERSION_ANNOTATED:1});
    },'optional');
  }
  // This is explicitly invoked after exporting the complete v1 library.
  // No transaction automatically bumps a user's existing v1 database.
  function enableAnnotations(db){
    return new Promise(function(resolve,reject){
      var request,database,done=false;
      function fail(error){if(done)return;done=true;if(database)database.close();reject(error||Error('Image Library classification upgrade failed'));}
      try{request=db.open(DATABASE,VERSION_ANNOTATED);}catch(error){fail(error);return;}
      request.onblocked=function(){fail(Error('Image Library upgrade blocked by another tab; close older tabs and retry'));};
      request.onerror=function(){fail(request.error);};
      request.onupgradeneeded=function(){
        database=request.result;
        if(!database.objectStoreNames.contains(STORE))
          database.createObjectStore(STORE,{keyPath:'id'});
        if(!database.objectStoreNames.contains(ANNOTATIONS))
          database.createObjectStore(ANNOTATIONS,{keyPath:'id'});
      };
      request.onsuccess=function(){
        database=request.result;
        if(done){database.close();return;}
        var valid=database.objectStoreNames.contains(STORE)&&
          database.objectStoreNames.contains(ANNOTATIONS);
        database.close();done=true;
        if(!valid)reject(Error('Image Library annotation store missing'));
        else resolve({enabled:true,version:VERSION_ANNOTATED});
      };
    });
  }
  function exportBackup(db){
    return transaction(db,'readonly',function(store,read,finish,annotations){
      read(store.getAll(),function(raw){
        var originals=raw.map(normalize);
        function complete(extra){
          extra.forEach(function(row){annotated(row);});
          finish({format:'curvature-image-library-backup',version:1,
            observations:originals,annotations:extra});
        }
        if(annotations)read(annotations.getAll(),complete);else complete([]);
      });
    },'optional');
  }
  function setAnnotation(db,id,expected,values){
    images.validId(id);
    if(!Number.isSafeInteger(expected)||expected<0)
      throw RangeError('Invalid expected annotation revision');
    var wanted=annotation(values);
    return transaction(db,'readwrite',function(store,read,finish,annotations){
      read(store.get(id),function(existing){
        if(!existing)throw Error('Original image was removed or is not accessible');
        read(annotations.getAll(),function(all){
          var old=all.find(function(row){return row.id===id;});
          if((old?old.revision:0)!==expected)
            throw Error('Image classification changed in another tab. Reload before saving.');
          var next={id:id,revision:expected+1,...wanted};
          annotationQuota(all.filter(function(row){return row.id!==id;}).concat([next]));
          annotations.put(next);
          finish(annotated(next));
        });
      });
    },true);
  }
  function create(db,record){
    var row=normalize({id:record.id,revision:1,record:record});
    return transaction(db,'readwrite',function(store,read,finish){read(store.getAll(),function(raw){
      var rows=raw.map(normalize);if(rows.some(function(r){return r.id===row.id;}))throw Error('Observation ID already exists');
      quota(rows.concat([row]));store.add(row);finish(row);
    });});
  }
  // One transaction plans every mapping and checks quota before adding any row.
  // Same ID and complete normalized content reuse the original; conflicting
  // metadata or bytes are imported as an independent observation. Repeated
  // imports reuse an earlier remapping instead of creating more copies.
  function importAssets(db,records,crypto){
    var incoming=images.validateCollection(records);
    return transaction(db,'readwrite',function(store,read,finish){read(store.getAll(),function(raw){
      var rows=raw.map(normalize),byId=new Map(rows.map(function(r){return [r.id,r];})),added=[],mapping=new Map();
      var reserved=new Set(incoming.map(function(r){return r.id;})),used=new Set();
      function content(r){var copy=Object.assign({},r);delete copy.id;return JSON.stringify(copy);}
      incoming.forEach(function(record){
        var id=record.id,existing=byId.get(id);
        if(existing&&content(existing.record)!==content(record)){
          var match=rows.find(function(r){return !reserved.has(r.id)&&!used.has(r.id)&&content(r.record)===content(record);});
          if(match)id=match.id;
          else{
            var attempts=0;do{if(++attempts>100)throw Error('Cannot allocate reference image ID');id=makeId(crypto);}
            while(byId.has(id)||reserved.has(id));
          }
        }
        if(!byId.has(id)){
          var row=normalize({id:id,revision:1,record:Object.assign({},record,{id:id})});
          rows.push(row);byId.set(id,row);added.push(row);
        }
        mapping.set(record.id,id);used.add(id);
      });
      quota(rows);added.forEach(function(row){store.add(row);});finish(mapping);
    });});
  }
  function originals(db){
    return transaction(db,'readonly',function(store,read,finish){
      read(store.getAll(),function(rows){finish(rows.map(normalize));});
    });
  }
  function sameOriginal(a,b){
    return a.dataUrl===b.dataUrl&&a.width===b.width&&a.height===b.height;
  }
  function sameOriginalSet(before,after){
    if(before.length!==after.length)return false;
    var byId=new Map(after.map(function(row){return [row.id,row.record.original];}));
    return before.every(function(row){
      var current=byId.get(row.id);
      return current&&sameOriginal(row.record.original,current);
    });
  }
  async function matchingOriginal(rows,identity,crypto,verifyOriginal,expected){
    var matches=[];
    // Sequential digests bound memory usage; no crypto/decode while an IDB
    // transaction is open. Existing rows are not trusted as identity claims.
    for(var row of rows){
      if(await images.originalDigest(row.record,crypto)!==identity.sha256)continue;
      var original=row.record.original;
      if(original.width!==identity.width||original.height!==identity.height||
        (expected&&!sameOriginal(expected,original))||
        (matches.length&&!sameOriginal(matches[0].record.original,original)))
        throw Error('Reference photo identity collision or inconsistent raster');
      matches.push(row);
    }
    matches.sort(function(a,b){return a.id<b.id?-1:a.id>b.id?1:0;});
    if(!matches.length)return null;
    await verifyOriginal(matches[0].record);
    return matches[0];
  }
  // The caller supplies the existing real browser decoder, not a header-only
  // check: record => ModernReferenceImageImport.verifyOriginal(record, env).
  async function findOriginal(db,identity,crypto,verifyOriginal){
    identity=images.validateIdentity(identity);
    return matchingOriginal(await originals(db),identity,crypto,verifyOriginal);
  }
  // A distinct calibration ingestion path, not a change to Studio's portable
  // import rules. Metadata/attribution on existing rows is never overwritten.
  // Return the original source record as well so callers can preserve its
  // separate provenance when archiving a calibration.
  async function ensureOriginal(db,record,crypto,verifyOriginal){
    var source=images.validate(record);
    await verifyOriginal(source);
    var original=source.original;
    var identity=images.validateIdentity({version:1,sha256:await images.originalDigest(source,crypto),
      width:original.width,height:original.height});
    for(var attempt=0;attempt<3;attempt++){
      var snapshot=await originals(db);
      var match=await matchingOriginal(snapshot,identity,crypto,verifyOriginal,original);
      var result=await transaction(db,'readwrite',function(store,read,finish){read(store.getAll(),function(raw){
        var rows=raw.map(normalize);
        // Allow concurrent metadata edits; retry on any original/ID change.
        if(!sameOriginalSet(snapshot,rows)){finish(null);return;}
        if(match){
          finish({identity:identity,row:rows.find(function(row){return row.id===match.id;}),
            source:source,reused:true});return;
        }
        var ids=new Set(rows.map(function(row){return row.id;})),id=source.id;
        if(ids.has(id)){
          var attempts=0;do{if(++attempts>100)throw Error('Cannot allocate reference image ID');id=makeId(crypto);}
          while(ids.has(id));
        }
        var row=normalize({id:id,revision:1,record:Object.assign({},source,{id:id})});
        quota(rows.concat([row]));store.add(row);
        finish({identity:identity,row:row,source:source,reused:false});
      });});
      if(result)return result;
    }
    throw Error('Reference Image Library changed during verification; retry');
  }
  function edited(record,metadata){
    if(!metadata||typeof metadata!=='object'||Array.isArray(metadata)||
      Object.keys(metadata).some(function(k){return !editable.includes(k);}))throw RangeError('Only observation metadata can be edited');
    var next=Object.assign({},record);
    editable.forEach(function(k){if(Object.prototype.hasOwnProperty.call(metadata,k)){
      if(metadata[k]===null)delete next[k];else next[k]=metadata[k];
    }});
    return images.validate(next);
  }
  function current(row,expected){
    if(!row||row.revision!==expected)throw Error('Observation changed or was removed in another tab. Reload it before editing.');
    return row;
  }
  function update(db,id,expected,metadata){images.validId(id);revision(expected);
    return transaction(db,'readwrite',function(store,read,finish){read(store.getAll(),function(raw){
      var rows=raw.map(normalize),old=current(rows.find(function(r){return r.id===id;}),expected);
      var next=normalize({id:id,revision:expected+1,record:edited(old.record,metadata)});
      quota(rows.map(function(r){return r.id===id?next:r;}));store.put(next);finish(next);
    });});
  }
  // Cross-database workspaces, Undo and other open tabs cannot yet be
  // enumerated atomically. Fail closed until there is a safe use-site guard.
  // Keep the API protected even if a stale UI attempts to call it.
  function remove(){return Promise.reject(Error('Observation deletion is disabled while keyframe links are supported. Unlinking does not delete originals.'));}
  function makeId(crypto){
    var token=typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),
      function(b){return b.toString(16).padStart(2,'0');}).join('');
    return images.validId('reference_'+token);
  }
  return Object.freeze({DATABASE:DATABASE,STORE:STORE,ANNOTATIONS:ANNOTATIONS,VERSION_ANNOTATED:VERSION_ANNOTATED,KINDS:KINDS.slice(),MAX_ITEMS:MAX_ITEMS,MAX_CHARS:MAX_CHARS,
    list:list,get:get,create:create,importAssets:importAssets,findOriginal:findOriginal,ensureOriginal:ensureOriginal,update:update,remove:remove,edited:edited,makeId:makeId,quota:quota,annotation:annotation,annotationStatus:annotationStatus,enableAnnotations:enableAnnotations,exportBackup:exportBackup,setAnnotation:setAnnotation});
}));

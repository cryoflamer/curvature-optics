/* Independent durable observation library. No project or thumbnail-cache access. */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?require('./ModernReferenceImage'):root.CurvatureModernReferenceImage);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernReferenceImageLibrary=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(images){
  'use strict';
  var DATABASE='curvature-modern-reference-images',STORE='observations',MAX_ITEMS=100,MAX_CHARS=64*1024*1024;
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
  function transaction(indexedDB,mode,action){
    return new Promise(function(resolve,reject){
      var db,tx,request,done=false,result;
      function fail(error){if(done)return;done=true;if(db)db.close();reject(error||Error('Observation storage unavailable'));}
      try{request=indexedDB.open(DATABASE,1);}catch(error){fail(error);return;}
      request.onupgradeneeded=function(){request.result.createObjectStore(STORE,{keyPath:'id'});};
      request.onblocked=function(){fail(Error('Observation storage upgrade blocked'));};
      request.onerror=function(){fail(request.error);};
      request.onsuccess=function(){
        db=request.result;if(done){db.close();return;}
        try{tx=db.transaction(STORE,mode);}catch(error){fail(error);return;}
        tx.oncomplete=function(){if(done)return;done=true;db.close();resolve(result);};
        tx.onerror=function(){fail(tx.error);};tx.onabort=function(){fail(tx.error||Error('Observation transaction aborted'));};
        function abort(error){try{tx.abort();}catch(ignore){}fail(error);}
        function read(req,fn){req.onsuccess=function(){try{fn(req.result);}catch(error){abort(error);}};}
        try{action(tx.objectStore(STORE),read,function(value){result=value;});}catch(error){abort(error);}
      };
    });
  }
  function list(db){return transaction(db,'readonly',function(store,read,finish){
    read(store.getAll(),function(rows){finish(rows.map(normalize).map(function(row){
      var r=row.record;return {id:r.id,revision:row.revision,title:r.title,author:r.author,
        width:r.original.width,height:r.original.height,thumbnail:r.thumbnail||null};
    }).sort(function(a,b){return a.title.localeCompare(b.title)||a.id.localeCompare(b.id);}));});
  });}
  function get(db,id){images.validId(id);return transaction(db,'readonly',function(store,read,finish){
    read(store.get(id),function(row){finish(row?normalize(row):null);});
  });}
  function create(db,record){
    var row=normalize({id:record.id,revision:1,record:record});
    return transaction(db,'readwrite',function(store,read,finish){read(store.getAll(),function(raw){
      var rows=raw.map(normalize);if(rows.some(function(r){return r.id===row.id;}))throw Error('Observation ID already exists');
      quota(rows.concat([row]));store.add(row);finish(row);
    });});
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
  // No links exist in 7C.2. Before introducing links, route deletion through a
  // use-site guard (including saved/draft projects), or disable it entirely.
  function remove(db,id,expected){images.validId(id);revision(expected);
    return transaction(db,'readwrite',function(store,read,finish){read(store.get(id),function(row){
      current(row&&normalize(row),expected);store.delete(id);finish(true);
    });});
  }
  function makeId(crypto){
    var token=typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),
      function(b){return b.toString(16).padStart(2,'0');}).join('');
    return images.validId('reference_'+token);
  }
  return Object.freeze({DATABASE:DATABASE,STORE:STORE,MAX_ITEMS:MAX_ITEMS,MAX_CHARS:MAX_CHARS,
    list:list,get:get,create:create,update:update,remove:remove,edited:edited,makeId:makeId,quota:quota});
}));

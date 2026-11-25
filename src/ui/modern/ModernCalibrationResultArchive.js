/* Append-only durable calibration results. Originals remain in Reference
 * Image Library; drafts, Scene and History are deliberately not mutated.
 */
(function(root,factory){
  const api=factory(root,
    root.CurvatureModernCalibrationResult||require('./ModernCalibrationResult'),
    root.CurvatureModernReferenceImage||require('../../animation/ModernReferenceImage'),
    root.CurvatureModernReferenceImageLibrary||require('../../animation/ModernReferenceImageLibrary'),
    root.CurvatureModernReferenceImageImport||require('./ModernReferenceImageImport'));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernCalibrationResultArchive=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(root,results,images,library,importer){
  'use strict';
  const DATABASE='curvature-modern-calibration-results',STORE='results',VERSION=1;
  const MAX_ITEMS=256,MAX_CHARS=64*1024*1024;
  function validId(id){
    if(typeof id!=='string'||!/^calibration-result-v1-[0-9a-f]{64}$/.test(id))
      throw RangeError('Invalid calibration result ID');
    return id;
  }
  function normalize(row){
    if(!row||typeof row!=='object'||Array.isArray(row)||
       Object.keys(row).length!==3||!['id','createdAt','record'].every(k=>Object.prototype.hasOwnProperty.call(row,k))||
       !Number.isSafeInteger(row.createdAt)||row.createdAt<1)
      throw Error('Invalid calibration archive row');
    const record=results.validate(row.record);
    if(validId(row.id)!==record.id)throw Error('Calibration archive row ID mismatch');
    return Object.freeze({id:record.id,createdAt:row.createdAt,record});
  }
  // Count serialized UTF-16 code units, not an estimate of available disk.
  // Never auto-prune: an archived result may have external snapshot links.
  function quota(rows){
    if(rows.length>MAX_ITEMS)throw RangeError('Calibration result archive limit reached');
    let size=0;
    for(const row of rows){
      size+=JSON.stringify(row).length;
      if(size>MAX_CHARS)throw RangeError('Calibration result archive size limit reached');
    }
  }
  function transaction(indexedDB,mode,action){
    const locks=root.navigator?.locks;
    if(!locks)return transactionRaw(indexedDB,mode,action);
    const barrier=typeof module==='object'&&module.exports?
      require('../../storage/ModernBackupWriteBarrier'):root.CurvatureModernBackupWriteBarrier;
    if(!barrier)return Promise.reject(Error('Calibration archive write barrier unavailable'));
    return barrier.create(locks).registerWriter('calibration.results').commit(
      ()=>transactionRaw(indexedDB,mode,action));
  }
  function transactionRaw(indexedDB,mode,action,existingOnly=false){
    return new Promise((resolve,reject)=>{
      let db,tx,request,done=false,value,failure=null;
      function fail(error){
        if(done)return;done=true;
        if(db)db.close();
        reject(error||Error('Calibration result storage unavailable'));
      }
      try{request=indexedDB.open(DATABASE,VERSION);}catch(error){fail(error);return;}
      request.onupgradeneeded=()=>{
        if(done||existingOnly){failure=Error('Calibration archive database changed during inspection');request.transaction.abort();return;}
        request.result.createObjectStore(STORE,{keyPath:'id'});
      };
      request.onblocked=()=>fail(Error('Calibration result storage upgrade blocked'));
      request.onerror=()=>fail(failure||request.error);
      request.onsuccess=()=>{
        db=request.result;
        if(done){db.close();return;}
        try{tx=db.transaction(STORE,mode);}catch(error){fail(error);return;}
        tx.oncomplete=()=>{
          if(done)return;if(failure){fail(failure);return;}done=true;db.close();resolve(value);
        };
        tx.onerror=()=>{failure=failure||tx.error||Error('Calibration result transaction failed');};
        tx.onabort=()=>fail(failure||tx.error||Error('Calibration result transaction aborted'));
        function read(req,fn){
          req.onsuccess=()=>{try{fn(req.result);}catch(error){abort(error);}};
        }
        function abort(error){
          failure=error;
          try{tx.abort();}catch(ignore){fail(error);}
        }
        try{action(tx.objectStore(STORE),read,v=>{value=v;});}catch(error){abort(error);}
      };
    });
  }
  function samePhoto(a,b){
    return a.sha256===b.sha256&&a.width===b.width&&a.height===b.height&&a.version===b.version;
  }
  // The caller has validated the complete result and durably resolved its
  // original. IDB serializes the read/check/add across concurrent tabs.
  function commit(db,record){
    return transaction(db,'readwrite',(store,read,finish)=>{
      read(store.get(record.id),raw=>{
        if(raw!==undefined){
          const old=normalize(raw);
          if(old.id!==record.id||
             results.canonicalContent(old.record.payload)!==results.canonicalContent(record.payload))
            throw Error('Calibration result identity collision');
          // Do not overwrite first archived attribution or creation time.
          finish(Object.freeze({row:old,reused:true}));return;
        }
        read(store.getAll(),rows=>{
          const row=Object.freeze({id:record.id,createdAt:Date.now(),record});
          quota(rows.concat([row]));
          store.add(row);
          // Only transaction.oncomplete resolves; request success is not
          // a durability acknowledgement and aborts remain failures.
          finish(Object.freeze({row,reused:false}));
        });
      });
    });
  }
  async function get(db,id){
    validId(id);
    const raw=await transaction(db,'readonly',(store,read,finish)=>read(store.get(id),finish));
    if(raw===undefined)return null;
    const row=normalize(raw);
    if(row.id!==id)throw Error('Calibration archive lookup ID mismatch');
    return row;
  }
  function summaries(rows){
    const entries=rows.map(raw=>{
      const row=normalize(raw);
      return Object.freeze({...results.summary(row.record),createdAt:row.createdAt});
    });
    return Object.freeze(entries.sort((a,b)=>b.createdAt-a.createdAt||(a.id<b.id?-1:a.id>b.id?1:0)));
  }
  async function list(db){
    return summaries(await transaction(db,'readonly',(store,read,finish)=>read(store.getAll(),finish)));
  }
  async function inspectUsage(db){
    if(!db||typeof db.databases!=='function')throw Error('Calibration archive inventory unavailable');
    const existing=(await db.databases()).find(row=>row.name===DATABASE);
    if(!existing)return [];
    if(existing.version!==VERSION)throw Error('Unsupported Calibration archive database version');
    return summaries(await transactionRaw(db,'readonly',(store,read,finish)=>read(store.getAll(),finish),true));
  }
  // Rehydrate a portable immutable result only when its verified photograph
  // is already present. Reading historical records remains independent of
  // asset availability, e.g. after external clearing of the image database.
  async function save(db,input,env){
    const record=results.validate(input);
    const photo=await library.findOriginal(db,record.payload.photo,env.crypto,
      r=>importer.verifyOriginal(r,env));
    if(!photo)throw Error('Calibration result original photo is unavailable');
    return commit(db,record);
  }
  // Capture input synchronously before the first await. The original asset
  // and result live in distinct databases, so commit the asset first. On
  // archive failure the harmless retained original can be reused on retry.
  async function archiveExperiment(db,input,env,options){
    const original=images.validate(input.referenceImage);
    const record=await results.create(input,env,options);
    const durable=await library.ensureOriginal(db,original,env.crypto,
      r=>importer.verifyOriginal(r,env));
    if(!samePhoto(record.payload.photo,durable.identity))
      throw Error('Calibration result original identity changed during archival');
    const saved=await commit(db,results.validate(record));
    return Object.freeze({...saved,photoId:durable.row.id,photoReused:durable.reused});
  }
  return Object.freeze({DATABASE,STORE,VERSION,MAX_ITEMS,MAX_CHARS,validId,quota,get,list,inspectUsage,save,archiveExperiment});
}));

/* Atomic Calibration Project records, separate compact list projection.
 * Upgrade preserves legacy draft/active bytes. No editor or photo I/O.
 */
(function(root,factory){
  const api=factory(root.CurvatureModernCalibrationProject||require('./ModernCalibrationProject'));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernCalibrationProjectStore=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(model){
  'use strict';
  const DATABASE='curvature-photo-calibration',VERSION=2;
  const LEGACY='draft',PROJECTS='projects',SUMMARIES='project-summaries',CONTROL='project-control';
  const MAX_PROJECTS=128,MAX_TOTAL_CHARS=64*1024*1024,MAX_ROW_CHARS=model.MAX_CHECKPOINT_CHARS+16384;
  const SUMMARY_KEYS=['id','version','revision','title','createdAt','updatedAt','photo','stage',
    'rowCount','fitStatus','fitRmsPx','resultCount','forkOf','chars'];
  function metadata(v){
    if(!v||typeof v!=='object'||Array.isArray(v)||
       Object.keys(v).length!==SUMMARY_KEYS.length||SUMMARY_KEYS.some(k=>!Object.hasOwn(v,k))||
       Object.keys(v).some(k=>!SUMMARY_KEYS.includes(k))||
       model.id(v.id)!==v.id||v.version!==model.VERSION||
       !Number.isSafeInteger(v.revision)||v.revision<1||
       !Number.isSafeInteger(v.createdAt)||v.createdAt<1||
       !Number.isSafeInteger(v.updatedAt)||v.updatedAt<v.createdAt||
       typeof v.title!=='string'||!v.title.trim()||v.title.length>160||
       !['correspondences','calibration','result'].includes(v.stage)||
       !Number.isSafeInteger(v.rowCount)||v.rowCount<0||v.rowCount>1000||
       (v.fitStatus!==null&&(typeof v.fitStatus!=='string'||v.fitStatus.length>160))||
       (v.fitRmsPx!==null&&(!Number.isFinite(v.fitRmsPx)||v.fitRmsPx<0))||
       !Number.isSafeInteger(v.resultCount)||v.resultCount<0||v.resultCount>256||
       (v.forkOf!==null&&model.id(v.forkOf)!==v.forkOf)||
       !Number.isSafeInteger(v.chars)||v.chars<1||v.chars>MAX_ROW_CHARS)
      throw RangeError('Invalid calibration project list metadata');
    if(v.photo!==null&&(!v.photo||v.photo.version!==1||typeof v.photo.sha256!=='string'||
       !/^[0-9a-f]{64}$/.test(v.photo.sha256)||
       !Number.isSafeInteger(v.photo.width)||v.photo.width<1||v.photo.width>32768||
       !Number.isSafeInteger(v.photo.height)||v.photo.height<1||v.photo.height>32768))
      throw RangeError('Invalid calibration project photo metadata');
    return v;
  }
  function quota(summaries,incoming,replaceId=null){
    if(!Array.isArray(summaries))throw RangeError('Invalid project list');
    const rows=summaries.map(metadata).filter(x=>x.id!==replaceId);
    const next=metadata(model.summary(incoming));
    if(next.chars>MAX_ROW_CHARS||rows.length>=MAX_PROJECTS||
       rows.reduce((n,x)=>n+x.chars,next.chars)>MAX_TOTAL_CHARS)
      throw RangeError('Calibration Projects storage limit reached; export your work before adding more');
    return next;
  }
  function openTransaction(indexedDB,stores,mode,action){
    return new Promise((resolve,reject)=>{
      let request,db,tx,done=false,value;
      function fail(error){
        if(done)return;done=true;if(db)db.close();
        reject(error||Error('Calibration Projects storage unavailable'));
      }
      function abort(error){
        try{if(tx)tx.abort();}catch(ignore){}
        fail(error);
      }
      try{
        if(!indexedDB||typeof indexedDB.open!=='function')throw Error('IndexedDB unavailable');
        request=indexedDB.open(DATABASE,VERSION);
      }catch(error){fail(error);return;}
      request.onupgradeneeded=()=>{
        try{
          const database=request.result;
          for(const name of [LEGACY,PROJECTS,SUMMARIES,CONTROL]){
            if(!database.objectStoreNames.contains(name))
              database.createObjectStore(name,name===PROJECTS||name===SUMMARIES?{keyPath:'id'}:undefined);
          }
        }catch(error){
          try{request.transaction.abort();}catch(ignore){}
          fail(error);
        }
      };
      request.onblocked=()=>fail(Error('Calibration Projects database upgrade blocked by another tab'));
      request.onerror=()=>fail(request.error);
      request.onsuccess=()=>{
        db=request.result;
        if(done){db.close();return;}
        try{tx=db.transaction(stores,mode);}catch(error){fail(error);return;}
        tx.oncomplete=()=>{if(done)return;done=true;db.close();resolve(value);};
        tx.onabort=()=>fail(tx.error||Error('Calibration Projects transaction aborted'));
        tx.onerror=()=>fail(tx.error||Error('Calibration Projects transaction failed'));
        function read(request,fn){
          request.onsuccess=()=>{if(done)return;try{fn(request.result);}catch(error){abort(error);}};
        }
        try{action(tx,read,v=>{value=v;});}catch(error){abort(error);}
      };
    });
  }
  function stores(db,mode,work){
    return openTransaction(db,[PROJECTS,SUMMARIES],mode,(tx,read,finish)=>
      work(tx.objectStore(PROJECTS),tx.objectStore(SUMMARIES),read,finish));
  }
  function match(row,stored){
    const expected=metadata(model.summary(row));
    const actual=metadata(stored);
    if(JSON.stringify(expected)!==JSON.stringify(actual))
      throw Error('Calibration project metadata does not match the authoritative record');
  }
  function create(db,input){
    const project=model.normalize(input);
    return stores(db,'readwrite',(records,summaries,read,finish)=>{
      read(records.get(project.id),existing=>{
        if(existing!==undefined)throw Error('Calibration project ID already exists');
        read(summaries.getAll(),rows=>{
          const small=quota(rows,project);
          records.add(project);summaries.add(small);finish(project);
        });
      });
    });
  }
  function get(db,id){
    model.id(id);
    return stores(db,'readonly',(records,summaries,read,finish)=>{
      read(records.get(id),raw=>{
        if(raw===undefined){read(summaries.get(id),ghost=>{
          if(ghost!==undefined)throw Error('Orphan calibration project metadata');
          finish(null);
        });return;}
        const project=model.normalize(raw);
        read(summaries.get(id),small=>{match(project,small);finish(project);});
      });
    });
  }
  function list(db){
    return stores(db,'readonly',(_records,summaries,read,finish)=>{
      read(summaries.getAll(),rows=>{
        finish(rows.map(metadata).sort((a,b)=>b.updatedAt-a.updatedAt||
          (a.id<b.id?-1:a.id>b.id?1:0)));
      });
    });
  }
  function change(db,id,expected,changes,now,forkId=null){
    model.id(id);
    if(!Number.isSafeInteger(expected)||expected<1)throw RangeError('Invalid expected project revision');
    if(forkId!==null)model.id(forkId);
    return stores(db,'readwrite',(records,summaries,read,finish)=>{
      read(records.get(id),raw=>{
        if(raw===undefined){
          if(forkId===null)throw Error('Calibration project missing; current work was not overwritten');
          // A concurrent delete must not make a complete unsaved local draft
          // unrecoverable. Never recreate the deleted original identity.
          const candidate=model.fresh({...changes,id,now});
          const fork=model.fork(candidate,changes,forkId,now);
          read(records.get(fork.id),existing=>{
            if(existing!==undefined)throw Error('Conflict fork project ID already exists');
            read(summaries.getAll(),rows=>{
              const summary=quota(rows,fork);
              records.add(fork);summaries.add(summary);finish({status:'forked',project:fork});
            });
          });
          return;
        }
        const current=model.normalize(raw);
        read(summaries.get(id),small=>{
          match(current,small);
          if(current.revision!==expected){
            if(forkId===null)throw Error('Calibration project changed in another tab');
            const fork=model.fork(current,changes,forkId,now);
            read(records.get(fork.id),old=>{
              if(old!==undefined)throw Error('Conflict fork project ID already exists');
              read(summaries.getAll(),rows=>{
                const summary=quota(rows,fork);
                records.add(fork);summaries.add(summary);
                finish({status:'forked',project:fork});
              });
            });
            return;
          }
          const next=model.revise(current,changes,now);
          read(summaries.getAll(),rows=>{
            const summary=quota(rows,next,id);
            records.put(next);summaries.put(summary);
            finish({status:'updated',project:next});
          });
        });
      });
    });
  }
  function update(db,id,expected,changes,now=Date.now()){
    return change(db,id,expected,changes,now).then(result=>result.project);
  }
  function saveOrFork(db,id,expected,changes,forkId,now=Date.now()){
    return change(db,id,expected,changes,now,forkId);
  }
  function rename(db,id,expected,title,now=Date.now()){
    return update(db,id,expected,{title},now);
  }
  function remove(db,id,expected){
    model.id(id);
    if(!Number.isSafeInteger(expected)||expected<1)throw RangeError('Invalid expected project revision');
    return stores(db,'readwrite',(records,summaries,read,finish)=>{
      read(records.get(id),raw=>{
        if(raw===undefined)throw Error('Calibration project missing; delete rejected');
        const current=model.normalize(raw);
        read(summaries.get(id),small=>{
          match(current,small);
          if(current.revision!==expected)
            throw Error('Calibration project changed in another tab; delete rejected');
          // No request to the Photo Library, Result Archive or History.
          records.delete(id);summaries.delete(id);finish(current);
        });
      });
    });
  }
  function legacy(db){
    return openTransaction(db,[LEGACY],'readonly',(tx,read,finish)=>{
      read(tx.objectStore(LEGACY).get('active'),raw=>finish(raw??null));
    });
  }
  return Object.freeze({DATABASE,VERSION,LEGACY,PROJECTS,SUMMARIES,CONTROL,
    MAX_PROJECTS,MAX_TOTAL_CHARS,MAX_ROW_CHARS,metadata,quota,
    create,get,list,update,saveOrFork,rename,remove,legacy});
}));

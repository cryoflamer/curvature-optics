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
  function openTransaction(indexedDB,stores,mode,action,lease=null){
    return new Promise((resolve,reject)=>{
      let request,db,tx,done=false,value,untrack=null;
      function checkLease(){if(lease)lease.check(mode==='readwrite');}
      function release(){if(untrack){untrack();untrack=null;}}
      function fail(error){
        if(done)return;done=true;release();if(db)db.close();
        reject(error||Error('Calibration Projects storage unavailable'));
      }
      function abort(error){
        try{if(tx)tx.abort();}catch(ignore){}
        fail(error);
      }
      try{
        checkLease();
        if(!indexedDB||typeof indexedDB.open!=='function')throw Error('IndexedDB unavailable');
        request=indexedDB.open(DATABASE,VERSION);
      }catch(error){fail(error);return;}
      request.onupgradeneeded=()=>{
        try{
          checkLease();
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
        try{
          checkLease();tx=db.transaction(stores,mode);
          if(lease)untrack=lease.track(tx,mode==='readwrite');
        }catch(error){abort(error);return;}
        tx.oncomplete=()=>{
          if(done)return;
          try{checkLease();}catch(error){fail(error);return;}
          done=true;release();db.close();resolve(value);
        };
        tx.onabort=()=>fail(tx.error||Error('Calibration Projects transaction aborted'));
        tx.onerror=()=>fail(tx.error||Error('Calibration Projects transaction failed'));
        function read(request,fn){
          request.onsuccess=()=>{if(done)return;try{checkLease();fn(request.result);}catch(error){abort(error);}};
        }
        try{checkLease();action(tx,read,v=>{value=v;});}catch(error){abort(error);}
      };
    });
  }
  function stores(db,mode,work,lease=null){
    return openTransaction(db,[PROJECTS,SUMMARIES],mode,(tx,read,finish)=>
      work(tx.objectStore(PROJECTS),tx.objectStore(SUMMARIES),read,finish),lease);
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
  // One durable receipt in the existing control store, committed in the
  // same transaction as the project and summary. No schema upgrade or
  // duplicate document/photo payload is required.
  const SHARED_SELECTION_KEY='shared-selection-receipt-v1';
  function exactFields(value,keys){
    return value&&typeof value==='object'&&!Array.isArray(value)&&
      Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
  }
  function selectionBase(value){
    if(!exactFields(value,['revision','digest'])||
       !Number.isSafeInteger(value.revision)||value.revision<1||
       value.revision>=Number.MAX_SAFE_INTEGER||
       typeof value.digest!=='string'||!/^sha256:[0-9a-f]{64}$/.test(value.digest))
      throw RangeError('Invalid shared checkpoint receipt base');
    return {revision:value.revision,digest:value.digest};
  }
  function selectionReference(value){
    if(!exactFields(value,['id','revision','recovery'])||value.recovery!==null||
       typeof value.revision!=='string'||!/^rev:[1-9][0-9]*$/.test(value.revision)||
       !Number.isSafeInteger(Number(value.revision.slice(4))))
      throw RangeError('Invalid shared Calibration receipt reference');
    return {id:model.id(value.id),revision:value.revision,recovery:null};
  }
  function selectionReceipt(value){
    if(!exactFields(value,['version','base','previous','current','status'])||value.version!==1)
      throw RangeError('Invalid shared Calibration receipt');
    const base=selectionBase(value.base),previous=selectionReference(value.previous),
      current=selectionReference(value.current),status=value.status;
    if(!(status==='updated'&&previous.id===current.id&&
         Number(current.revision.slice(4))===Number(previous.revision.slice(4))+1||
         status==='forked'&&previous.id!==current.id&&current.revision==='rev:1'))
      throw RangeError('Invalid shared Calibration receipt transition');
    return {version:1,base,previous,current,status};
  }
  function requireSharedLease(lease){
    if(!lease||lease.sessionId!=='shared'||typeof lease.check!=='function'||
       typeof lease.track!=='function'||'tabId' in lease)
      throw Error('Shared Calibration receipt requires a shared lifetime');
    lease.check(true);
  }
  function readSharedSelectionReceipt(db,lease=null){
    return openTransaction(db,[CONTROL],'readonly',(tx,read,finish)=>{
      read(tx.objectStore(CONTROL).get(SHARED_SELECTION_KEY),raw=>
        finish(raw===undefined?null:selectionReceipt(raw)));
    },lease);
  }
  // Startup inspection must not create or upgrade a historical database
  // merely because the new shared preview was opened.
  async function readExistingSharedSelectionReceipt(db,lease){
    lease.check();
    if(typeof db.databases!=='function')throw Error('Calibration receipt inventory unavailable');
    const entries=await db.databases();lease.check();
    const existing=entries.find(entry=>entry.name===DATABASE);
    if(!existing||existing.version<VERSION)return null;
    if(existing.version!==VERSION)throw Error('Unsupported Calibration database version; evidence retained');
    return readSharedSelectionReceipt(db,lease);
  }
  // Call only after the session controller has verified the exact receipt
  // acknowledgement. This transaction guards the receipt and domain revision;
  // it is intentionally not a cross-database transaction.
  function retireSharedSelectionReceipt(db,expected,lease){
    requireSharedLease(lease);
    const receipt=selectionReceipt(expected);
    return openTransaction(db,[CONTROL,PROJECTS,SUMMARIES],'readwrite',(tx,read,finish)=>{
      const control=tx.objectStore(CONTROL),records=tx.objectStore(PROJECTS),
        summaries=tx.objectStore(SUMMARIES);
      read(control.get(SHARED_SELECTION_KEY),raw=>{
        if(raw===undefined||JSON.stringify(selectionReceipt(raw))!==JSON.stringify(receipt))
          throw Error('Shared Calibration receipt changed; evidence retained');
        read(records.get(receipt.current.id),saved=>{
          if(saved===undefined)throw Error('Receipt project missing; evidence retained');
          const project=model.normalize(saved);
          if('rev:'+project.revision!==receipt.current.revision)
            throw Error('Receipt project changed; evidence retained');
          read(summaries.get(project.id),small=>{
            match(project,small);
            control.delete(SHARED_SELECTION_KEY);finish(receipt);
          });
        });
      });
    },lease);
  }
  function change(db,id,expected,changes,now,forkId=null,lease=null,receiptBase=null){
    model.id(id);
    if(!Number.isSafeInteger(expected)||expected<1)throw RangeError('Invalid expected project revision');
    if(forkId!==null)model.id(forkId);
    const base=receiptBase===null?null:selectionBase(receiptBase);
    if(base)requireSharedLease(lease);
    const work=(records,summaries,read,finish)=>{
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
    };
    if(!base)return stores(db,'readwrite',work,lease);
    return openTransaction(db,[PROJECTS,SUMMARIES,CONTROL],'readwrite',(tx,read,finish)=>{
      const control=tx.objectStore(CONTROL);
      read(control.get(SHARED_SELECTION_KEY),raw=>{
        if(raw!==undefined)throw Error('Shared Calibration receipt unresolved; evidence retained');
        work(tx.objectStore(PROJECTS),tx.objectStore(SUMMARIES),read,result=>{
          const receipt=selectionReceipt({version:1,base,
            previous:{id,revision:'rev:'+expected,recovery:null},
            current:{id:result.project.id,revision:'rev:'+result.project.revision,recovery:null},
            status:result.status});
          control.add(receipt,SHARED_SELECTION_KEY);
          finish({...result,selectionReceipt:receipt});
        });
      });
    },lease);
  }
  function update(db,id,expected,changes,now=Date.now()){
    return change(db,id,expected,changes,now).then(result=>result.project);
  }
  function saveOrFork(db,id,expected,changes,forkId,now=Date.now(),lease=null){
    return change(db,id,expected,changes,now,forkId,lease);
  }
  function saveOrForkWithSelectionReceipt(db,id,expected,changes,forkId,now,base,lease){
    return change(db,id,expected,changes,now,forkId,lease,selectionBase(base));
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

  const MIGRATION_KEY='legacy-calibration-adoption-v1';
  function migrationMarker(db){
    return openTransaction(db,[CONTROL],'readonly',(tx,read,finish)=>{
      read(tx.objectStore(CONTROL).get(MIGRATION_KEY),raw=>finish(raw===undefined?null:marker(raw)));
    });
  }
  function marker(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||
       Object.keys(value).length!==4||
       !['version','projectId','sourceVersion','createdAt'].every(k=>Object.hasOwn(value,k))||
       value.version!==1||![1,2].includes(value.sourceVersion)||
       !Number.isSafeInteger(value.createdAt)||value.createdAt<1)
      throw RangeError('Invalid legacy calibration migration marker');
    model.id(value.projectId);
    return {version:1,projectId:value.projectId,
      sourceVersion:value.sourceVersion,createdAt:value.createdAt};
  }
  // Serialized with other project writes and competing browser tabs. The
  // source snapshot is compared *inside* this transaction, after the image
  // was verified outside it. Never delete or overwrite draft/active.
  function adoptLegacy(db,sourceSnapshot,projectInput){
    if(!sourceSnapshot||![1,2].includes(sourceSnapshot.version))
      throw RangeError('Unsupported source for calibration migration');
    const source=JSON.stringify(sourceSnapshot),project=model.normalize(projectInput);
    const expected={version:1,projectId:project.id,
      sourceVersion:sourceSnapshot.version,createdAt:project.createdAt};
    return openTransaction(db,[LEGACY,PROJECTS,SUMMARIES,CONTROL],'readwrite',
      (tx,read,finish)=>{
        const legacyStore=tx.objectStore(LEGACY),records=tx.objectStore(PROJECTS),
          summaries=tx.objectStore(SUMMARIES),control=tx.objectStore(CONTROL);
        read(control.get(MIGRATION_KEY),raw=>{
          if(raw!==undefined){
            const existing=marker(raw);
            read(records.get(existing.projectId),saved=>{
              if(saved===undefined){
                read(summaries.get(existing.projectId),ghost=>{
                  if(ghost!==undefined)throw Error('Orphan legacy migration project metadata');
                  finish({status:'already-removed',marker:existing,project:null});
                });
                return;
              }
              const current=model.normalize(saved);
              read(summaries.get(current.id),small=>{
                match(current,small);
                finish({status:'already',marker:existing,project:current});
              });
            });
            return;
          }
          read(legacyStore.get('active'),actual=>{
            if(actual===undefined||JSON.stringify(actual)!==source)
              throw Error('Legacy calibration changed during migration; retry without replacing the draft');
            read(records.get(project.id),existing=>{
              if(existing!==undefined)throw Error('Migration project identity already exists');
              read(summaries.getAll(),rows=>{
                const small=quota(rows,project);
                records.add(project);summaries.add(small);
                control.add(expected,MIGRATION_KEY);
                finish({status:'migrated',marker:expected,project});
              });
            });
          });
        });
      });
  }
  return Object.freeze({DATABASE,VERSION,LEGACY,PROJECTS,SUMMARIES,CONTROL,
    MAX_PROJECTS,MAX_TOTAL_CHARS,MAX_ROW_CHARS,MIGRATION_KEY,metadata,quota,
    create,get,list,update,saveOrFork,rename,remove,legacy,migrationMarker,adoptLegacy,
    SHARED_SELECTION_KEY,saveOrForkWithSelectionReceipt,readSharedSelectionReceipt,
    readExistingSharedSelectionReceipt,retireSharedSelectionReceipt});
}));

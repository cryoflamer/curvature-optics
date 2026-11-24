/* Single working-session checkpoint, independent of History and Library.
 * IndexedDB retains the durable copy; the existing localStorage experiment
 * remains a synchronous reload/pagehide fallback and compatibility path.
 * No snapshot, thumbnail or History record is created here.
 */
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const barrier=node?require('../../storage/ModernBackupWriteBarrier'):
    root.CurvatureModernBackupWriteBarrier;
  const api=factory(root,barrier);
  if(node)module.exports=api;
  root.CurvatureModernSessionAutosave=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(root,barrier){
  'use strict';
  var DATABASE='curvature-modern-working-session',STORE='session',KEY='current';
  var META_KEY='curvature-modern-working-session-timestamp-v1';
  function withStore(indexedDB,mode,perform,lease=null){
    if(!indexedDB||typeof indexedDB.open!=='function')return Promise.resolve(null);
    return new Promise(function(resolve,reject){
      var request,settled=false,db=null,untrack=null;
      function cleanup(){if(untrack)untrack();if(db)db.close();}
      function rejectOnce(error){if(settled)return;settled=true;cleanup();reject(error);}
      try{request=indexedDB.open(DATABASE,1);}catch(error){rejectOnce(error);return;}
      request.onupgradeneeded=function(){
        db=request.result;
        if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);
      };
      request.onerror=function(){rejectOnce(request.error||Error('Working-session database unavailable'));};
      request.onblocked=function(){rejectOnce(Error('Working-session database blocked by another tab'));};
      request.onsuccess=function(){
        if(settled){request.result.close();return;}
        db=request.result;
        var tx,result=null,reportedError=null;
        try{
          if(lease)lease.check(mode==='readwrite');
          tx=db.transaction(STORE,mode);
          tx.oncomplete=function(){
            if(settled)return;
            try{if(lease)lease.check(mode==='readwrite');}
            catch(error){rejectOnce(error);return;}
            settled=true;cleanup();
            resolve(result&&result.result!==undefined?result.result:null);
          };
          // Wait for actual abort before releasing the backup writer lock.
          tx.onerror=function(){reportedError=reportedError||tx.error||Error('Working-session transaction failed');};
          tx.onabort=function(){rejectOnce(reportedError||tx.error||Error('Working-session transaction aborted'));};
          if(lease)untrack=lease.track(tx,mode==='readwrite');
          result=perform(tx.objectStore(STORE));
        }catch(error){
          reportedError=error;
          if(tx){try{tx.abort();}catch(ignore){rejectOnce(error);}}
          else rejectOnce(error);
        }
      };
    });
  }
  function read(indexedDB){
    return withStore(indexedDB,'readonly',function(store){return store.get(KEY);});
  }
  // Each browser tab uses the same origin-wide Web Lock. A protected writer
  // owns its SHARED lock until the underlying IndexedDB transaction completes,
  // not merely until the put/delete request succeeds. Old localStorage F5
  // recovery and source schemas remain unchanged.
  //
  // If Web Locks are unavailable, ordinary working-session editing must still
  // work using the legacy transaction path. Such writes are explicitly
  // *uncoordinated* and cannot qualify any backup for migration.
  // Read-first migration candidate. The legacy current row remains the
  // live owner until a separately verified document-session activation.
  const COPY_FORMAT='curvature-modern-working-copy',COPY_PREFIX='working-copy:';
  const COPY_ID=/^working-[A-Za-z0-9_-]{1,128}$/;
  function ensure(ok,message){if(!ok)throw Error('Working-copy migration: '+message);}
  function canonical(value){
    if(value===null||typeof value==='boolean'||typeof value==='string')
      return JSON.stringify(value);
    if(typeof value==='number'){
      ensure(Number.isFinite(value),'non-JSON number');return JSON.stringify(value);
    }
    if(Array.isArray(value)){
      ensure(Object.keys(value).length===value.length&&
        value.every((_,i)=>Object.prototype.hasOwnProperty.call(value,i)),
        'non-JSON array');
      return '['+Array.from(value,canonical).join(',')+']';
    }
    ensure(value&&typeof value==='object'&&
      (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null),
      'non-JSON object');
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  }
  function validateSource(record,codec){
    ensure(record&&Object.keys(record).length===3&&record.version===1&&
      Number.isSafeInteger(record.savedAt)&&record.savedAt>0,
      'invalid or unsupported source checkpoint');
    ensure(codec&&typeof codec.validate==='function','experiment validator required');
    const raw=canonical(record);
    const normalized=codec.validate(JSON.parse(raw).experiment);
    return {raw,normalized};
  }
  async function digest(text,crypto){
    ensure(crypto&&crypto.subtle&&typeof crypto.subtle.digest==='function',
      'Web Crypto SHA-256 required');
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
    return 'sha256:'+Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
  }
  function localEvidence(storage,codec){
    ensure(storage&&typeof storage.getItem==='function','local fallback inspection required');
    return {raw:storage.getItem(codec.STORAGE_KEY),stamp:storage.getItem(META_KEY)};
  }
  function copyKey(id){
    ensure(typeof id==='string'&&COPY_ID.test(id),'invalid working-copy identity');
    return COPY_PREFIX+id;
  }
  function copyRead(indexedDB,id){
    const key=copyKey(id);
    return withStore(indexedDB,'readonly',store=>{
      const output={result:null},req=store.get(key);
      req.onsuccess=()=>{output.result={present:req.result!==undefined,value:req.result};};
      return output;
    });
  }
  async function readWorkingCopy(indexedDB,id,codec,crypto){
    ensure(indexedDB&&typeof indexedDB.open==='function','IndexedDB required');
    const found=await copyRead(indexedDB,id);
    ensure(found,'working-copy read unavailable');
    if(!found.present)return null;
    const row=found.value;
    ensure(row&&Object.keys(row).length===5&&row.format===COPY_FORMAT&&
      row.version===1&&row.id===id,'invalid or unsupported working-copy record');
    const source=validateSource(row.source,codec);
    const revision=await digest(canonical(row.source.experiment),crypto);
    ensure(row.revision===revision,'working-copy digest mismatch');
    return {kind:'experiment',id,revision,experiment:source.normalized,
      sourceSavedAt:row.source.savedAt};
  }
  function makeAdapter(lockManager){
    if(lockManager&&typeof lockManager.request!=='function')
      throw TypeError('Working-session Web Locks manager is invalid');
    if(lockManager&&(!barrier||typeof barrier.create!=='function'))
      throw Error('Working-session backup barrier dependency unavailable');
    const writer=lockManager?barrier.create(lockManager).registerWriter('working.session'):null;
    function transaction(indexedDB,perform,lease=null){
      const action=function(){return withStore(indexedDB,'readwrite',perform,lease);};
      return writer?writer.commit(action):action();
    }
    function write(indexedDB,experiment,savedAt){
      if(!Number.isSafeInteger(savedAt)||savedAt<=0)
        throw RangeError('Invalid working-session timestamp');
      return transaction(indexedDB,function(store){
        store.put({version:1,savedAt:savedAt,experiment:experiment},KEY);
        return null;
      });
    }
    function clear(indexedDB){
      return transaction(indexedDB,function(store){store.delete(KEY);return null;});
    }
    async function prepareWorkingCopy(indexedDB,{tabId,storage,codec,crypto,
      explicitIntent,isCurrent}={}){
      ensure(typeof explicitIntent==='boolean'&&typeof isCurrent==='function',
        'explicit restore intent and generation guard required');
      const guard=()=>ensure(isCurrent()===true,'stale migration generation');
      guard();
      if(explicitIntent)return {status:'external'};
      ensure(writer,'coordinated working-session writer required');
      ensure(indexedDB&&typeof indexedDB.open==='function','IndexedDB required');
      ensure(typeof tabId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(tabId),
        'invalid tab identity');
      ensure(codec&&typeof codec.validate==='function'&&typeof codec.STORAGE_KEY==='string',
        'experiment validator required');
      const id='working-'+tabId,key=copyKey(id);
      const local=localEvidence(storage,codec);
      const checkpoint=await read(indexedDB);guard();
      if(!checkpoint){
        ensure(local.raw===null&&local.stamp===null,
          'local-only or incomplete checkpoint requires explicit recovery');
        return {status:'empty'};
      }
      const source=validateSource(checkpoint,codec);
      if(local.raw!==null){
        let parsed;
        try{parsed=JSON.parse(local.raw);}catch(error){
          throw Error('Working-copy migration: corrupt local fallback; evidence preserved');
        }
        codec.validate(parsed);
        ensure(canonical(parsed)===canonical(checkpoint.experiment),
          'local and IndexedDB checkpoints differ; evidence preserved');
        ensure(local.stamp===null||Number(local.stamp)===checkpoint.savedAt,
          'local checkpoint timestamp differs; evidence preserved');
      }else ensure(local.stamp===null,'incomplete local fallback; evidence preserved');
      const row={format:COPY_FORMAT,version:1,id,
        revision:await digest(canonical(checkpoint.experiment),crypto),
        source:JSON.parse(source.raw)};
      guard();
      function verifyLocal(){
        const now=localEvidence(storage,codec);
        ensure(now.raw===local.raw&&now.stamp===local.stamp,
          'local fallback changed during migration');
      }
      let failure=null;
      try{
        await transaction(indexedDB,store=>{
          // Read source and destination under one readwrite transaction.
          // No async digest work inside the IDB callback, and never put over
          // a candidate; a retry can only acknowledge identical bytes.
          const output={result:null},req=store.get(KEY);
          function fail(error){
            failure=error;
            try{store.transaction.abort();}catch(ignore){}
          }
          req.onsuccess=()=>{
            try{
              guard();verifyLocal();
              ensure(canonical(req.result)===source.raw,
                'IndexedDB source changed during migration');
              const target=store.get(key);
              target.onsuccess=()=>{
                try{
                  guard();verifyLocal();
                  if(target.result===undefined)store.add(row,key);
                  else ensure(canonical(target.result)===canonical(row),
                    'existing working copy differs; evidence preserved');
                  output.result=true;
                }catch(error){fail(error);}
              };
            }catch(error){fail(error);}
          };
          return output;
        });
      }catch(error){throw failure||error;}
      // Transaction completion is necessary, not sufficient. Re-read and
      // hash the durable candidate, then verify that source evidence is still
      // current. A failed check retains the immutable candidate for review.
      const saved=await readWorkingCopy(indexedDB,id,codec,crypto);guard();
      ensure(saved&&saved.revision===row.revision&&
        saved.sourceSavedAt===checkpoint.savedAt&&
        canonical(saved.experiment)===canonical(source.normalized),
        'working-copy readback mismatch');
      const after=await read(indexedDB);guard();verifyLocal();
      ensure(canonical(after)===source.raw,'IndexedDB source changed after copy');
      return {status:'verified',workspace:saved.experiment.display.mode,
        document:{id:saved.id,revision:saved.revision,recovery:null}};
    }
    // Immutable revision rows plus an atomic head pointer. The migration
    // row stays intact and represents revision one, including raw provenance.
    function openWorkingCopy(indexedDB,{lease,codec,crypto}={}){
      ensure(writer,'coordinated working-session writer required');
      ensure(indexedDB&&typeof indexedDB.open==='function','IndexedDB required');
      ensure(lease&&typeof lease.check==='function'&&typeof lease.track==='function',
        'captured document lease required');
      lease.check();
      const id='working-'+lease.tabId,baseKey=copyKey(id);
      const headKey='working-head:'+id;
      const REV_FORMAT='curvature-modern-working-revision',HEAD_FORMAT='curvature-modern-working-head';
      const initial=/^sha256:[0-9a-f]{64}$/;
      const later=/^rev:([1-9][0-9]*):sha256:[0-9a-f]{64}$/;
      function sequence(revision){
        ensure(typeof revision==='string','invalid working revision');
        if(initial.test(revision))return 1;
        const match=later.exec(revision),n=match&&Number(match[1]);
        ensure(Number.isSafeInteger(n)&&n>=2,'invalid working revision');
        return n;
      }
      function revisionKey(revision){
        return sequence(revision)===1?baseKey:'working-revision:'+id+':'+revision;
      }
      function headRevision(head){
        ensure(head&&Object.keys(head).length===4&&head.format===HEAD_FORMAT&&
          head.version===1&&head.id===id&&sequence(head.revision)>=2,
          'invalid working-copy head');
        return head.revision;
      }
      async function decode(row,expected){
        ensure(row&&row.id===id&&row.version===1,'missing or incompatible working revision');
        if(row.format===COPY_FORMAT){
          ensure(Object.keys(row).length===5&&sequence(row.revision)===1,
            'invalid migration revision');
          const source=validateSource(row.source,codec);
          ensure(row.revision===await digest(canonical(row.source.experiment),crypto),
            'working-copy digest mismatch');
          if(expected!==undefined)ensure(row.revision===expected,'working revision identity mismatch');
          return {kind:'experiment',id,revision:row.revision,experiment:source.normalized};
        }
        ensure(row.format===REV_FORMAT&&Object.keys(row).length===6&&
          sequence(row.revision)>=2&&sequence(row.previousRevision)===sequence(row.revision)-1,
          'invalid edited revision');
        if(expected!==undefined)ensure(row.revision===expected,'working revision identity mismatch');
        const raw=canonical(row.experiment),experiment=codec.validate(JSON.parse(raw));
        ensure(canonical(experiment)===raw,'noncanonical edited experiment');
        ensure(row.revision==='rev:'+sequence(row.revision)+':'+await digest(raw,crypto),
          'working revision digest mismatch');
        return {kind:'experiment',id,revision:row.revision,experiment};
      }
      // IDB reads both the head and its target in the same transaction.
      function readRaw(store,accept,fail){
        const req=store.get(headKey);
        req.onsuccess=()=>{
          try{
            lease.check();
            const head=req.result;
            const rev=head===undefined?undefined:headRevision(head);
            const item=store.get(rev===undefined?baseKey:revisionKey(rev));
            item.onsuccess=()=>{
              try{lease.check();accept({head,row:item.result});}
              catch(error){fail(error);}
            };
          }catch(error){fail(error);}
        };
      }
      async function snapshot(){
        let failure=null;
        try{
          return await withStore(indexedDB,'readonly',store=>{
            const out={result:null};
            readRaw(store,v=>{out.result=v;},error=>{
              failure=error;store.transaction.abort();
            });
            return out;
          },lease);
        }catch(error){throw failure||error;}
      }
      async function verify(raw){
        ensure(raw&&raw.row!==undefined,'working copy not prepared');
        const value=await decode(raw.row,raw.head===undefined?undefined:headRevision(raw.head));
        lease.check();
        return value;
      }
      function rawSignature(raw){
        return canonical({head:raw.head===undefined?null:raw.head,row:raw.row});
      }
      let baseline=null,busy=false;
      async function read(){
        ensure(!busy,'working-copy operation pending');
        busy=true;baseline=null;
        try{
          lease.check();
          const raw=await snapshot(),value=await verify(raw);
          baseline={signature:rawSignature(raw),value:canonical(value.experiment),revision:value.revision};
          return value;
        }finally{busy=false;}
      }
      async function readRevision(revision){
        ensure(!busy,'working-copy operation pending');
        const key=revisionKey(revision);
        busy=true;
        try{
          lease.check();
          const row=await withStore(indexedDB,'readonly',store=>store.get(key),lease);
          const value=await decode(row,revision);lease.check();return value;
        }finally{busy=false;}
      }
      async function write(experiment,expectedRevision){
        ensure(!busy,'working-copy operation pending');
        lease.check(true);
        ensure(baseline&&baseline.revision===expectedRevision,'read current working copy before write');
        const before=baseline;
        busy=true;baseline=null;
        try{
          const normalized=codec.validate(JSON.parse(canonical(experiment)));
          const raw=canonical(normalized),n=sequence(expectedRevision)+1;
          ensure(Number.isSafeInteger(n),'working revision exhausted');
          ensure(raw!==before.value,'working copy is unchanged');
          const revision='rev:'+n+':'+await digest(raw,crypto);
          lease.check(true);
          const row={format:REV_FORMAT,version:1,id,revision,
            previousRevision:expectedRevision,experiment:JSON.parse(raw)};
          const head={format:HEAD_FORMAT,version:1,id,revision};
          let failure=null;
          try{
            await transaction(indexedDB,store=>{
              const fail=error=>{failure=error;try{store.transaction.abort();}catch(ignore){}};
              readRaw(store,current=>{
                lease.check(true);
                ensure(rawSignature(current)===before.signature,'working-copy revision or envelope conflict');
                // add, never put, on the immutable revision record.
                store.add(row,revisionKey(revision));store.put(head,headKey);
              },fail);
              return null;
            },lease);
          }catch(error){throw failure||error;}
          const saved=await snapshot(),value=await verify(saved);
          lease.check(true);
          ensure(rawSignature(saved)===rawSignature({head,row}),
            'working-copy post-commit readback conflict');
          baseline={signature:rawSignature(saved),value:canonical(value.experiment),revision};
          return Object.freeze({kind:'experiment',id,revision});
        }finally{busy=false;}
      }
      return Object.freeze({id,read,readRevision,write});
    }
    return Object.freeze({read,write,clear,prepareWorkingCopy,readWorkingCopy,openWorkingCopy,
      coordination:writer?'participating-writer':'uncoordinated'});
  }
  const defaultAdapter=makeAdapter(root.navigator&&root.navigator.locks||null);
  function normalize(record,validate){
    if(!record||record.version!==1||!Number.isSafeInteger(record.savedAt)||record.savedAt<=0)
      throw RangeError('Invalid working-session checkpoint');
    return {savedAt:record.savedAt,experiment:validate(record.experiment)};
  }
  function newer(local,remote){
    if(!local)return remote||null;
    if(!remote)return local;
    // Old localStorage experiments have no timestamp; keep them rather than
    // silently replacing a potentially newer legacy edit with stale IDB.
    if(local.savedAt===null)return local;
    return remote.savedAt>local.savedAt?remote:local;
  }
  return Object.freeze({DATABASE:DATABASE,STORE:STORE,META_KEY:META_KEY,
    read:defaultAdapter.read,write:defaultAdapter.write,clear:defaultAdapter.clear,
    prepareWorkingCopy:defaultAdapter.prepareWorkingCopy,readWorkingCopy,
    openWorkingCopy:defaultAdapter.openWorkingCopy,
    coordination:defaultAdapter.coordination,makeAdapter,
    normalize:normalize,newer:newer});
}));

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
  function withStore(indexedDB,mode,perform,lease=null,existingOnly=false){
    if(!indexedDB||typeof indexedDB.open!=='function')return Promise.resolve(null);
    return new Promise(function(resolve,reject){
      var request,settled=false,db=null,untrack=null;
      function cleanup(){if(untrack)untrack();if(db)db.close();}
      function rejectOnce(error){if(settled)return;settled=true;cleanup();reject(error);}
      try{request=indexedDB.open(DATABASE,1);}catch(error){rejectOnce(error);return;}
      request.onupgradeneeded=function(){
        if(settled){request.transaction.abort();return;}
        db=request.result;
        if(existingOnly){request.transaction.abort();rejectOnce(Error('Working-session database changed during inventory'));return;}
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
  const FORK_FORMAT='curvature-modern-working-fork';
  const IMPORT_FORMAT='curvature-modern-working-import';
  const SHARED_COPY_ID='shared-experiment';
  const COPY_ID=/^(?:working-[A-Za-z0-9_-]{1,128}|shared-experiment)$/;
  function sharedLease(lease){return lease&&lease.sessionId==='shared'&&!('tabId' in lease);}
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
  function copyRead(indexedDB,id,readStore){
    const key=copyKey(id);
    return readStore(indexedDB,store=>{
      const output={result:null},req=store.get(key);
      req.onsuccess=()=>{output.result={present:req.result!==undefined,value:req.result};};
      return output;
    });
  }
  async function decodeFork(row,id,codec,crypto){
    ensure(row&&Object.keys(row).length===6&&row.format===FORK_FORMAT&&
      row.version===1&&row.id===id,'invalid working-copy fork');
    const origin=row.origin;
    ensure(origin&&Object.keys(origin).length===3&&COPY_ID.test(origin.id)&&
      origin.id!==id&&typeof origin.revision==='string'&&
      /^(rev:[1-9][0-9]*:)?sha256:[0-9a-f]{64}$/.test(origin.revision)&&
      Number.isSafeInteger(origin.sessionRevision)&&origin.sessionRevision>=1,
      'invalid working-copy fork provenance');
    const raw=canonical(row.experiment),experiment=codec.validate(JSON.parse(raw));
    ensure(canonical(experiment)===raw&&row.revision===await digest(raw,crypto),
      'working-copy fork digest mismatch');
    return {kind:'experiment',id,revision:row.revision,experiment,origin:row.origin};
  }
  async function decodeImport(row,id,codec,crypto){
    ensure(row&&Object.keys(row).length===6&&row.format===IMPORT_FORMAT&&
      row.version===1&&row.id===SHARED_COPY_ID&&id===SHARED_COPY_ID,
      'invalid selected migration record');
    const origin=row.origin;
    ensure(origin&&Object.keys(origin).length===3&&
      ['local','idb'].includes(origin.source)&&typeof origin.key==='string'&&
      /^sha256:[0-9a-f]{64}$/.test(origin.digest),'invalid selected migration provenance');
    const raw=canonical(row.experiment),experiment=codec.validate(JSON.parse(raw));
    ensure(canonical(experiment)===raw&&row.revision===await digest(raw,crypto),
      'selected migration digest mismatch');
    return {kind:'experiment',id,revision:row.revision,experiment,origin};
  }
  async function readWorkingCopyRaw(indexedDB,id,codec,crypto,readStore){
    ensure(indexedDB&&typeof indexedDB.open==='function','IndexedDB required');
    const found=await copyRead(indexedDB,id,readStore);
    ensure(found,'working-copy read unavailable');
    if(!found.present)return null;
    const row=found.value;
    if(row&&row.format===FORK_FORMAT)return decodeFork(row,id,codec,crypto);
    if(row&&row.format===IMPORT_FORMAT)return decodeImport(row,id,codec,crypto);
    ensure(row&&Object.keys(row).length===5&&row.format===COPY_FORMAT&&
      row.version===1&&row.id===id,'invalid or unsupported working-copy record');
    const source=validateSource(row.source,codec);
    const revision=await digest(canonical(row.source.experiment),crypto);
    ensure(row.revision===revision,'working-copy digest mismatch');
    return {kind:'experiment',id,revision,experiment:source.normalized,
      sourceSavedAt:row.source.savedAt};
  }
  const SHARED_CHECKPOINT_FORMAT='curvature-modern-shared-checkpoint';
  function normalizeSharedExperiment(value,codec){
    const clone=v=>JSON.parse(canonical(v));
    const experiment=clone(codec.validate(clone(value)));
    ensure(['scene','compare'].includes(experiment.display?.mode),'invalid checkpoint workspace');
    return experiment;
  }
  // Storage-independent validation of the exact acknowledged checkpoint.
  // Managed adoption and the existing shared writer use the same digest,
  // physical mode and selection-binding rules.
  async function validateSharedCheckpoint(row,codec,crypto,contract){
    ensure(row&&Object.keys(row).length===7&&row.format===SHARED_CHECKPOINT_FORMAT&&row.version===1&&
      Number.isSafeInteger(row.revision)&&row.revision>=1,'invalid shared checkpoint');
    const {digest:checksum,...data}=row;
    ensure(typeof checksum==='string'&&checksum===await digest(canonical(data),crypto),
      'shared checkpoint digest mismatch; evidence retained');
    const experiment=normalizeSharedExperiment(row.experiment,codec),frame=contract.normalize(row.envelope);
    const ref=frame.documents.experiment;
    const match=ref&&/^checkpoint:([1-9][0-9]*)$/.exec(ref.revision);
    const sequence=match&&Number(match[1]);
    const physical=['scene','compare'].includes(frame.workspace);
    const auxiliary=['calibration','animation'].includes(frame.workspace);
    ensure(frame.sessionId===contract.SHARED_ID&&
      ((physical&&frame.workspace===experiment.display.mode)||
       (auxiliary&&frame.documents[frame.workspace]&&row.draft===null))&&
      ref&&ref.id===SHARED_COPY_ID&&ref.recovery===null&&Number.isSafeInteger(sequence)&&
      sequence<=row.revision&&canonical(experiment)===canonical(row.experiment),
      'invalid shared checkpoint binding');
    ensure(row.draft===null||canonical(normalizeSharedExperiment(row.draft,codec))===canonical(row.draft),
      'invalid shared checkpoint draft');
    return JSON.parse(canonical(row));
  }
  async function existingDatabase(indexedDB){
    ensure(indexedDB&&typeof indexedDB.databases==='function','working-session inventory unavailable');
    const existing=(await indexedDB.databases()).find(item=>item.name===DATABASE);
    if(!existing)return false;
    ensure(existing.version===1,'unsupported working-session database version');
    return true;
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
    // Ordinary reads may create the schema; observational existing-only
    // reads must not acquire a shared lock from an exclusive snapshot.
    function readTransaction(indexedDB,perform,lease=null,existingOnly=false){
      const action=()=>withStore(indexedDB,'readonly',perform,lease,existingOnly);
      return writer&&!existingOnly?writer.commit(action):action();
    }
    function read(indexedDB){
      return readTransaction(indexedDB,store=>store.get(KEY));
    }
    function readWorkingCopy(indexedDB,id,codec,crypto){
      return readWorkingCopyRaw(indexedDB,id,codec,crypto,readTransaction);
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
    // Atomic replacement primitive. Migration and activation are deliberately
    // separate: no old preview rows or other domain slots are rewritten here.
    function openSharedCheckpoint(indexedDB,options={}){
      const {lease,codec,crypto,contract,existingOnly=false}=options;
      ensure(writer,'coordinated working-session writer required');
      ensure(indexedDB&&typeof indexedDB.open==='function','IndexedDB required');
      ensure(sharedLease(lease)&&typeof lease.check==='function'&&typeof lease.track==='function',
        'shared document lifetime required');
      ensure(codec&&typeof codec.validate==='function'&&contract&&
        contract.SHARED_ID==='shared'&&typeof contract.normalize==='function'&&
        typeof contract.select==='function'&&typeof contract.emptyShared==='function',
        'shared checkpoint contracts required');
      lease.check();
      let managed=null;
      if(Object.hasOwn(options,'managedResources')){
        ensure(typeof options.managedResources?.createWorkingCheckpointPort==='function',
          'explicit managed working checkpoint port required');
        managed=options.managedResources.createWorkingCheckpointPort(indexedDB,lease);
      }
      function requireLegacy(){
        ensure(!managed,'managed checkpoint legacy migration requires coordinated cutover');
      }
      const key='shared-checkpoint',format=SHARED_CHECKPOINT_FORMAT;
      let observed=null,busy=false;
      const clone=value=>JSON.parse(canonical(value));
      function normalizeExperiment(value){
        return normalizeSharedExperiment(value,codec);
      }
      function envelopeFor(envelope,experiment,revision){
        const frame=contract.normalize(envelope);
        ensure(frame.sessionId===contract.SHARED_ID&&['scene','compare'].includes(frame.workspace),
          'unsupported shared checkpoint envelope');
        return contract.select(frame,experiment.display.mode,
          {id:SHARED_COPY_ID,revision:'checkpoint:'+revision,recovery:null});
      }
      async function fetch(){
        if(managed){
          const row=await managed.read();
          return row===null?{present:false}:{present:true,row};
        }
        if(existingOnly&&!await existingDatabase(indexedDB))return {present:false};
        return readTransaction(indexedDB,store=>{
          const out={result:null},req=store.get(key);
          req.onsuccess=()=>{out.result=req.result===undefined?{present:false}:{present:true,row:req.result};};
          return out;
        },lease,existingOnly);
      }
      async function decode(raw){
        ensure(raw,'checkpoint read unavailable');
        if(!raw.present)return null;
        const value=await validateSharedCheckpoint(raw.row,codec,crypto,contract);
        lease.check();
        return value;
      }
      async function read(){
        ensure(!busy,'shared checkpoint operation pending');
        busy=true;observed=null;
        try{
          lease.check();
          const raw=await fetch(),value=await decode(raw);
          lease.check();observed=raw;return value;
        }finally{busy=false;}
      }
      // The entire row, including the last observed draft, is the CAS
      // baseline. Revision tokens are never reused, even on reverted edits.
      async function mutate(expectedRevision,build,evidence=[],guard=()=>lease.check(true),requireEmpty=false,verify=null){
        ensure(!existingOnly,'observational checkpoint reader cannot mutate');
        ensure(!busy,'shared checkpoint operation pending');
        lease.check(true);
        ensure(observed&&Number.isSafeInteger(expectedRevision)&&expectedRevision>=0&&
          expectedRevision<Number.MAX_SAFE_INTEGER&&
          (observed.present?observed.row.revision:0)===expectedRevision,
          'read current shared checkpoint before write');
        const before=observed,revision=expectedRevision+1;
        busy=true;observed=null;
        try{
          const payload=build(before.present?before.row:null,revision);
          const data=clone({format,version:1,revision,...payload});
          const row={...data,digest:await digest(canonical(data),crypto)};
          await decode({present:true,row});guard();
          if(verify){await verify(row.envelope);guard();}
          let failure;
          try{
            if(managed){
              ensure(!evidence.length&&!requireEmpty,'managed checkpoint legacy migration requires coordinated cutover');
              await managed.commit(before.present?before.row:null,row,guard);
            }else await transaction(indexedDB,store=>{
              const req=store.get(key);
              req.onsuccess=()=>{
                try{
                  guard();
                  const current=req.result===undefined?{present:false}:{present:true,row:req.result};
                  ensure(canonical(current)===canonical(before),'shared checkpoint CAS conflict; evidence retained');
                  function verifySource(index){
                    if(index===evidence.length){
                      if(before.present)store.put(row,key);else store.add(row,key);
                      return;
                    }
                    const item=evidence[index],source=store.get(item.key);
                    source.onsuccess=()=>{
                      try{
                        guard();
                        const value=source.result===undefined?{present:false}:{present:true,row:source.result};
                        ensure(canonical(value)===canonical(item.value),
                          'legacy checkpoint evidence changed during migration');
                        verifySource(index+1);
                      }catch(error){failure=error;store.transaction.abort();}
                    };
                  }
                  if(requireEmpty){
                    const keys=store.getAllKeys();
                    keys.onsuccess=()=>{
                      try{guard();ensure(keys.result.length===0,'historical working evidence appeared during initialization');verifySource(0);}
                      catch(error){failure=error;store.transaction.abort();}
                    };
                  }else verifySource(0);
                }catch(error){failure=error;store.transaction.abort();}
              };
              return null;
            },lease);
          }catch(error){throw failure||error;}
          const saved=await fetch(),value=await decode(saved);guard();
          ensure(saved.present&&canonical(saved.row)===canonical(row),'shared checkpoint readback conflict');
          if(verify){await verify(value.envelope);guard();}
          observed=saved;return value;
        }finally{busy=false;}
      }
      function initialize(experiment,envelope=contract.emptyShared()){
        return mutate(0,(before,revision)=>{
          ensure(before===null,'shared checkpoint already initialized');
          const value=normalizeExperiment(experiment);
          return {envelope:envelopeFor(envelope,value,revision),experiment:value,draft:null};
        });
      }
      function stage(experiment,expectedRevision){
        return mutate(expectedRevision,before=>{
          ensure(before&&['scene','compare'].includes(before.envelope.workspace),
            'physical workspace must be active before staging');
          return {envelope:before.envelope,experiment:before.experiment,draft:normalizeExperiment(experiment)};
        });
      }
      function promote(expectedRevision){
        return mutate(expectedRevision,(before,revision)=>{
          ensure(before&&before.draft!==null,'shared checkpoint draft required');
          const envelope=canonical(before.draft)===canonical(before.experiment)?before.envelope:
            envelopeFor(before.envelope,before.draft,revision);
          return {envelope,experiment:before.draft,draft:null};
        });
      }
      // Cross-database selection: the domain owns project contents and
      // revision. Verify the exact acknowledged reference before CAS and
      // again after readback; a changed/deleted domain can never be activated.
      // This is not a cross-database atomic transaction. If postflight fails
      // the new pointer is retained as explicit recovery evidence.
      function selectWorkspace(mode,document,expectedRevision,{readDocument,readRecovery,isCurrent}={}){
        ensure(typeof isCurrent==='function','selection generation guard required');
        const guard=()=>{lease.check(true);ensure(isCurrent()===true,'stale selection generation');};
        const verify=async frame=>{
          guard();
          if(['calibration','animation'].includes(frame.workspace)){
            const plan=await contract.planRestore(frame,{readDocument,readRecovery,isCurrent});
            ensure(plan.source==='session'||plan.source==='recovery','verified auxiliary document required');
          }
          guard();
        };
        return mutate(expectedRevision,before=>{
          guard();
          ensure(before&&before.draft===null,'resolve physical draft before workspace selection');
          const physical=['scene','compare'].includes(mode);
          ensure(physical?mode===before.experiment.display.mode&&document===undefined:
            ['calibration','animation'].includes(mode)&&document!==undefined&&document!==null,
            'invalid shared workspace selection');
          return {envelope:contract.select(before.envelope,mode,document),
            experiment:before.experiment,draft:null};
        },[],guard,false,verify);
      }
      // The old physical payload has already been protected by the caller.
      // Keep both auxiliary document slots unchanged, and commit the new
      // physical payload and its workspace/reference as one checksum row.
      function replaceFromCalibration(reference,expected,next,expectedRevision,{readDocument,readRecovery,isCurrent}={}){
        ensure(typeof isCurrent==='function','Calibration Apply generation guard required');
        const guard=()=>{lease.check(true);ensure(isCurrent()===true,'stale Calibration Apply generation');};
        const prior=normalizeExperiment(expected),value=normalizeExperiment(next);
        const verify=async frame=>{
          guard();
          const plan=await contract.planRestore(contract.select(frame,'calibration'),{
            readDocument,readRecovery,isCurrent});
          ensure(plan.source==='session'&&canonical(plan.document)===canonical(reference),
            'verified Calibration Apply reference required');
          guard();
        };
        return mutate(expectedRevision,(before,revision)=>{
          guard();
          ensure(before&&before.draft===null&&before.envelope.workspace==='calibration'&&
            reference&&reference.recovery===null&&
            canonical(before.envelope.documents.calibration)===canonical(reference),
            'active clean Calibration Apply reference required');
          ensure(canonical(before.experiment)===canonical(prior),
            'outgoing physical experiment changed before Calibration Apply');
          const physical=contract.select(before.envelope,before.experiment.display.mode);
          return {envelope:envelopeFor(physical,value,revision),experiment:value,draft:null};
        },[],guard,false,verify);
      }
      // The caller protects the outgoing exact experiment in History before
      // invoking this operation. No intermediate draft or workspace switch:
      // one CAS owns both the replacement and its physical workspace.
      function replaceFromHistory(expected,next,expectedRevision,{isCurrent}={}){
        ensure(typeof isCurrent==='function','History restore generation guard required');
        const guard=()=>{lease.check(true);ensure(isCurrent()===true,'stale History restore generation');};
        const prior=normalizeExperiment(expected),value=normalizeExperiment(next);
        return mutate(expectedRevision,(before,revision)=>{
          guard();
          ensure(before&&before.draft===null&&['scene','compare'].includes(before.envelope.workspace),
            'active clean physical workspace required for History restore');
          ensure(canonical(before.experiment)===canonical(prior),
            'outgoing physical experiment changed before History restore');
          return {envelope:envelopeFor(before.envelope,value,revision),experiment:value,draft:null};
        },[],guard);
      }
      function detachDocument(kind,reference,expectedRevision,{isCurrent}={}){
        ensure(typeof isCurrent==='function','removal generation guard required');
        const guard=()=>{lease.check(true);ensure(isCurrent()===true,'stale removal generation');};
        return mutate(expectedRevision,before=>{
          guard();
          ensure(before&&before.draft===null&&['calibration','animation'].includes(kind)&&
            (['scene','compare'].includes(before.envelope.workspace)||before.envelope.workspace===kind),
            'invalid auxiliary removal workspace');
          ensure(reference&&reference.recovery===null&&
            canonical(before.envelope.documents[kind])===canonical(reference),
            'auxiliary removal reference changed');
          const cleared=contract.select(before.envelope,kind,null);
          const envelope=contract.select(cleared,before.experiment.display.mode);
          return {envelope,experiment:before.experiment,draft:null};
        },[],guard);
      }
      // Prove the exact pre-write checkpoint even after a process restart.
      // The selection transition changes only revision and envelope; reversing
      // it must reproduce the recorded SHA-256, including all other slots and
      // physical payload. A matching current project ID alone is insufficient.
      async function proveSelectionReceipt(row,mode,previous,current,base){
        lease.check();
        ensure(base&&Number.isSafeInteger(base.revision)&&base.revision>=1&&
          /^sha256:[0-9a-f]{64}$/.test(base.digest),'invalid selection receipt base');
        if(!row||row.draft!==null||row.envelope.workspace!==mode||
           !['calibration','animation'].includes(mode))return null;
        await decode({present:true,row});lease.check();
        const selected=row.envelope.documents[mode];
        if(row.revision===base.revision&&row.digest===base.digest&&
           canonical(selected)===canonical(previous))return 'pending';
        if(row.revision!==base.revision+1||canonical(selected)!==canonical(current))return null;
        const {digest:ignored,...data}=row;
        const reconstructed={...data,revision:base.revision,
          envelope:contract.select(row.envelope,mode,previous)};
        const checksum=await digest(canonical(reconstructed),crypto);lease.check();
        return checksum===base.digest?'committed':null;
      }
      // The previous live controller uses this same operation lock for all
      // cross-store writes. Old sessions must not be edited outside it while
      // migrating. The working-store evidence is also compared atomically.
      async function legacyPlan(sessions){
        requireLegacy();
        ensure(sessions&&typeof sessions.read==='function','legacy shared session reader required');
        const saved=await sessions.read();lease.check();
        ensure(saved&&Number.isSafeInteger(saved.revision)&&saved.revision>=1&&saved.envelope,
          'legacy shared session binding required');
        const frame=contract.normalize(saved.envelope),ref=frame.documents.experiment;
        ensure(frame.sessionId===contract.SHARED_ID&&['scene','compare'].includes(frame.workspace)&&
          ref&&ref.id===SHARED_COPY_ID&&!ref.recovery,'unsupported legacy shared session binding');
        const legacy=openWorkingCopy(indexedDB,{lease,codec,crypto});
        const data=await legacy.readMigrationEvidence(ref.revision);
        ensure(data.bound.experiment.display.mode===frame.workspace,
          'legacy session workspace differs from bound experiment');
        ensure(canonical(await sessions.read())===canonical(saved),
          'legacy session changed during inspection');
        lease.check();
        const checksum=await digest(canonical({saved,evidence:data.evidence}),crypto);
        const choices=[data.bound];
        if(data.head.revision!==data.bound.revision)choices.push(data.head);
        return {frame,evidence:data.evidence,view:{
          digest:checksum,sessionRevision:saved.revision,bound:data.bound,head:data.head,draft:data.draft,
          choices:choices.map(value=>({revision:value.revision,
            draftModes:!data.draft?['none']:
              data.draft.baseRevision===value.revision||
              canonical(data.draft.experiment)===canonical(value.experiment)?['keep','archive']:['archive']}))
        }};
      }
      async function inspectLegacy({sessions,coordinate}={}){
        ensure(typeof coordinate==='function','shared migration coordinator required');
        return coordinate(async()=>{
          lease.check();
          return (await legacyPlan(sessions)).view;
        });
      }
      async function migrateLegacy(selection,{sessions,coordinate,isCurrent}={}){
        ensure(typeof coordinate==='function'&&typeof isCurrent==='function',
          'shared migration coordinator and generation guard required');
        return coordinate(async()=>{
          const guard=()=>{lease.check(true);ensure(isCurrent()===true,'stale migration generation');};
          guard();
          const plan=await legacyPlan(sessions);guard();
          const view=plan.view;
          ensure(selection&&selection.digest===view.digest,'legacy migration evidence changed');
          const choice=view.choices.find(item=>item.revision===selection.revision);
          ensure(choice&&choice.draftModes.includes(selection.draft),
            'explicit compatible legacy revision and draft choice required');
          const value=choice.revision===view.bound.revision?view.bound:view.head;
          const current=await read();guard();
          ensure(current===null,'shared checkpoint already initialized; evidence retained');
          return mutate(0,(_,revision)=>{
            guard();
            const experiment=normalizeExperiment(value.experiment);
            return {envelope:envelopeFor(plan.frame,experiment,revision),experiment,
              draft:selection.draft==='keep'?normalizeExperiment(view.draft.experiment):null};
          },plan.evidence,guard);
        });
      }
      // No bound shared metadata: select directly from historical evidence,
      // including orphaned shared rows, without creating an old import.
      async function sourcePlan(sessions,storage){
        requireLegacy();
        ensure(sessions&&typeof sessions.read==='function','legacy shared session reader required');
        const saved=await sessions.read();lease.check();
        ensure(saved&&Number.isSafeInteger(saved.revision)&&saved.revision>=0&&
          (saved.revision===0)===(saved.envelope===null),'invalid legacy shared session row');
        const frame=saved.envelope===null?contract.emptyShared():contract.normalize(saved.envelope);
        ensure(frame.sessionId===contract.SHARED_ID&&['scene','compare'].includes(frame.workspace)&&
          frame.documents.experiment===null,'bound or unsupported legacy session; use bound migration');
        const legacy=openWorkingCopy(indexedDB,{lease,codec,crypto});
        const inventory=await legacy.readMigrationSources(storage);
        ensure(canonical(await sessions.read())===canonical(saved),
          'legacy session changed during inspection');
        lease.check();
        const sessionDigest=await digest(canonical(saved),crypto);
        const candidates=inventory.candidates.map(item=>({...item,
          selection:{...item.selection,sessionDigest}}));
        return {frame,candidates,issues:inventory.issues};
      }
      // Fresh initialization is distinct from migration. Never treat an
      // invalid source or detached historical metadata as an empty profile.
      async function initializeEmpty(experiment,{sessions,storage,coordinate,isCurrent}={}){
        requireLegacy();
        ensure(typeof coordinate==='function'&&typeof isCurrent==='function'&&
          sessions&&typeof sessions.inspectLegacyDocuments==='function',
          'empty initialization dependencies required');
        const value=normalizeExperiment(experiment);
        return coordinate(async()=>{
          const guard=()=>{lease.check(true);ensure(isCurrent()===true,'stale initialization generation');};
          const verifyLocal=()=>{
            guard();
            const local=localEvidence(storage,codec);
            ensure(local.raw===null&&local.stamp===null,'historical local evidence exists');
          };
          verifyLocal();
          const plan=await sourcePlan(sessions,storage);
          ensure(plan.candidates.length===0&&plan.issues.length===0,
            'historical working evidence exists; select migration or recover from backup');
          ensure((await sessions.read()).revision===0&&
            (await sessions.inspectLegacyDocuments()).length===0,
            'historical document metadata exists; recover from backup');
          const current=await read();verifyLocal();
          ensure(current===null,'shared checkpoint already initialized; evidence retained');
          return mutate(0,(_,revision)=>({envelope:envelopeFor(contract.emptyShared(),value,revision),
            experiment:value,draft:null}),[],verifyLocal,true);
        });
      }
      async function inspectSources({sessions,storage,coordinate}={}){
        ensure(typeof coordinate==='function','shared migration coordinator required');
        return coordinate(async()=>{
          const plan=await sourcePlan(sessions,storage);
          lease.check();
          return {candidates:plan.candidates.map(({selection,workspace,experiment})=>
            ({selection,workspace,experiment})),issues:plan.issues};
        });
      }
      async function migrateSource(selection,{sessions,storage,coordinate,isCurrent}={}){
        ensure(typeof coordinate==='function'&&typeof isCurrent==='function',
          'shared migration coordinator and generation guard required');
        return coordinate(async()=>{
          const guard=()=>{lease.check(true);ensure(isCurrent()===true,'stale migration generation');};
          guard();
          const plan=await sourcePlan(sessions,storage);guard();
          const selected=plan.candidates.find(item=>canonical(item.selection)===canonical(selection));
          ensure(selected,'selected migration evidence changed or is invalid');
          const evidence=[];
          if(selected.selection.source==='idb'){
            evidence.push({key:selected.selection.key,value:{present:true,row:selected.raw}});
            if(selected.base)evidence.push({key:selected.base.key,value:{present:true,row:selected.base.row}});
          }
          // Local Storage has no IDB transaction. Old ordinary writers must
          // be stopped; check synchronously before put and on readback.
          const verify=()=>{
            guard();
            if(selected.selection.source==='local')
              ensure(canonical(localEvidence(storage,codec))===canonical(selected.raw),
                'selected local migration evidence changed');
          };
          const current=await read();verify();
          ensure(current===null,'shared checkpoint already initialized; evidence retained');
          return mutate(0,(_,revision)=>{
            verify();
            const experiment=normalizeExperiment(selected.experiment);
            return {envelope:envelopeFor(plan.frame,experiment,revision),experiment,draft:null};
          },evidence,verify);
        });
      }
      return Object.freeze({read,initialize,initializeEmpty,stage,promote,selectWorkspace,replaceFromCalibration,replaceFromHistory,detachDocument,proveSelectionReceipt,inspectLegacy,migrateLegacy,inspectSources,migrateSource,
        ...(managed?{storageKind:'managed'}:{})});
    }
    // Read-only historical revision, HEAD and recovery evidence.
    function openWorkingCopy(indexedDB,{lease,codec,crypto,existingOnly=false}={}){
      ensure(indexedDB&&typeof indexedDB.open==='function','IndexedDB required');
      ensure(lease&&typeof lease.check==='function'&&typeof lease.track==='function',
        'captured document lease required');
      lease.check();
      ensure(sharedLease(lease),'shared document lifetime required');
      const id=SHARED_COPY_ID,baseKey=copyKey(id);
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
      function revisionKey(revision,documentId=id){
        return sequence(revision)===1?copyKey(documentId):'working-revision:'+documentId+':'+revision;
      }
      function headRevision(head){
        ensure(head&&Object.keys(head).length===4&&head.format===HEAD_FORMAT&&
          head.version===1&&head.id===id&&sequence(head.revision)>=2,
          'invalid working-copy head');
        return head.revision;
      }
      async function decode(row,expected,documentId=id){
        ensure(row&&row.id===documentId&&row.version===1,'missing or incompatible working revision');
        if(row.format===FORK_FORMAT||row.format===IMPORT_FORMAT){
          const value=await (row.format===FORK_FORMAT?decodeFork:decodeImport)(row,documentId,codec,crypto);
          if(expected!==undefined)ensure(value.revision===expected,'working revision identity mismatch');
          return {kind:value.kind,id:value.id,revision:value.revision,experiment:value.experiment};
        }
        if(row.format===COPY_FORMAT){
          ensure(Object.keys(row).length===5&&sequence(row.revision)===1,
            'invalid migration revision');
          const source=validateSource(row.source,codec);
          ensure(row.revision===await digest(canonical(row.source.experiment),crypto),
            'working-copy digest mismatch');
          if(expected!==undefined)ensure(row.revision===expected,'working revision identity mismatch');
          return {kind:'experiment',id:documentId,revision:row.revision,experiment:source.normalized};
        }
        ensure(row.format===REV_FORMAT&&Object.keys(row).length===6&&
          sequence(row.revision)>=2&&sequence(row.previousRevision)===sequence(row.revision)-1,
          'invalid edited revision');
        if(expected!==undefined)ensure(row.revision===expected,'working revision identity mismatch');
        const raw=canonical(row.experiment),experiment=codec.validate(JSON.parse(raw));
        ensure(canonical(experiment)===raw,'noncanonical edited experiment');
        ensure(row.revision==='rev:'+sequence(row.revision)+':'+await digest(raw,crypto),
          'working revision digest mismatch');
        return {kind:'experiment',id:documentId,revision:row.revision,experiment};
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
          return await readTransaction(indexedDB,store=>{
            const out={result:null};
            readRaw(store,v=>{out.result=v;},error=>{
              failure=error;store.transaction.abort();
            });
            return out;
          },lease,existingOnly);
        }catch(error){throw failure||error;}
      }
      async function verify(raw){
        ensure(raw&&raw.row!==undefined,'working copy not prepared');
        const value=await decode(raw.row,raw.head===undefined?undefined:headRevision(raw.head));
        lease.check();
        return value;
      }
      async function read(){
        lease.check();
        return verify(await snapshot());
      }
      async function readRevision(revision){
        lease.check();
        const row=await readTransaction(indexedDB,store=>store.get(revisionKey(revision)),lease,existingOnly);
        const value=await decode(row,revision);lease.check();return value;
      }
      // A separately acknowledged draft never advances the document head.
      // This namespace belongs to its document. Preserve invalid old bytes.
      const RECOVERY_FORMAT='curvature-modern-working-recovery';
      const recoveryKey='working-recovery:'+id;
      const recoveryToken=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      function recoveryFields(row,documentId=id){
        const expectedId=documentId===SHARED_COPY_ID?'shared-experiment-recovery':
          'recovery-'+documentId.slice('working-'.length);
        ensure(row&&Object.keys(row).length===8&&row.format===RECOVERY_FORMAT&&
          row.version===1&&row.id===expectedId&&row.documentId===documentId&&
          typeof row.revision==='string'&&recoveryToken.test(row.revision)&&
          typeof row.digest==='string','invalid or unsupported working recovery; evidence retained');
        sequence(row.baseRevision);
        const {digest:checksum,...data}=row;
        return {data,checksum};
      }
      function getRecoveryRaw(store,accept,fail){
        const req=store.get(recoveryKey);
        req.onsuccess=()=>{
          try{
            lease.check();
            if(req.result===undefined){accept(null);return;}
            const row=req.result;
            recoveryFields(row);
            const base=store.get(revisionKey(row.baseRevision));
            base.onsuccess=()=>{
              try{lease.check();accept({row,base:base.result});}
              catch(error){fail(error);}
            };
          }catch(error){fail(error);}
        };
      }
      async function recoverySnapshot(){
        let failure;
        try{
          return await readTransaction(indexedDB,store=>{
            const out={result:null};
            getRecoveryRaw(store,v=>{out.result=v;},error=>{
              failure=error;store.transaction.abort();
            });
            return out;
          },lease,existingOnly);
        }catch(error){throw failure||error;}
      }
      async function verifyRecovery(raw,documentId=id){
        if(raw===null)return null;
        const {row,base}=raw,{data,checksum}=recoveryFields(row,documentId);
        await decode(base,row.baseRevision,documentId);
        ensure(checksum===await digest(canonical(data),crypto),
          'working recovery digest mismatch; evidence retained');
        const payload=canonical(row.experiment),experiment=codec.validate(JSON.parse(payload));
        ensure(canonical(experiment)===payload,'noncanonical working recovery; evidence retained');
        lease.check();
        return {kind:'experiment',id:row.id,documentId,revision:row.revision,
          baseRevision:row.baseRevision,experiment};
      }
      async function readRecovery(){
        lease.check();
        return verifyRecovery(await recoverySnapshot());
      }
      // Read the old records together, without changing them or treating
      // a timestamp, HEAD, or copied tab token as an automatic selection.
      async function inventoryRows(){
        if(existingOnly&&!await existingDatabase(indexedDB))return new Map();
        return readTransaction(indexedDB,store=>{
          const output={result:null},req=store.getAllKeys();
          req.onsuccess=()=>{
            const keys=req.result,rows=new Map();
            output.result=rows;
            for(const key of keys){
              const item=store.get(key);
              item.onsuccess=()=>rows.set(key,item.result);
            }
          };
          return output;
        },lease,existingOnly);
      }
      // Verified snapshot of the old shared binding, HEAD and recovery base.
      // Capture raw keys (including absence) for the destination transaction.
      async function readMigrationEvidence(boundRevision){
        const rows=await inventoryRows(),keys=new Set();
        function get(key){keys.add(key);return rows.get(key);}
        const pointer=get(headKey);
        const bound=await decode(get(revisionKey(boundRevision)),boundRevision);
        const head=pointer===undefined?await decode(get(baseKey)):
          await decode(get(revisionKey(headRevision(pointer))),headRevision(pointer));
        ensure(sequence(head.revision)>=sequence(bound.revision),
          'legacy HEAD predates bound revision; evidence retained');
        const recovery=get(recoveryKey);
        let draft=null;
        if(recovery!==undefined){
          recoveryFields(recovery);
          draft=await verifyRecovery({row:recovery,base:get(revisionKey(recovery.baseRevision))});
        }
        lease.check();
        return {bound,head,draft,evidence:[...keys].sort().map(key=>({key,value:
          rows.has(key)?{present:true,row:rows.get(key)}:{present:false}}))};
      }
      async function migrationCandidates(storage,includeShared=false){
        const local=localEvidence(storage,codec),rows=await inventoryRows();
        lease.check();
        const candidates=[],issues=[];
        async function add(source,key,raw,experiment,base=null){
          ensure(['scene','compare'].includes(experiment.display?.mode),'invalid migration workspace');
          const selection={source,key,digest:await digest(canonical({source,key,raw,base}),crypto)};
          candidates.push({selection,workspace:experiment.display.mode,experiment,raw,base});
        }
        if(local.raw!==null||local.stamp!==null){
          try{
            ensure(local.raw!==null,'local checkpoint payload missing');
            await add('local',codec.STORAGE_KEY,local,codec.validate(JSON.parse(local.raw)));
          }catch(error){issues.push({source:'local',key:codec.STORAGE_KEY,error:error.message});}
        }
        for(const [key,row] of rows){
          try{
            if(key===KEY){
              await add('idb',key,row,validateSource(row,codec).normalized);continue;
            }
            ensure(typeof key==='string','unsupported working-store key');
            if(key==='shared-checkpoint')continue;
            if(!includeShared&&(key===baseKey||key===headKey||key===recoveryKey||
               key.startsWith('working-revision:'+id+':')))continue;
            if(key.startsWith('working-head:')){
              // HEAD is only a pointer. Every retained immutable revision is
              // listed independently; no pointer alone can be selected.
              const ownerId=key.slice('working-head:'.length);
              ensure(COPY_ID.test(ownerId)&&row&&row.format===HEAD_FORMAT&&
                row.version===1&&row.id===ownerId&&sequence(row.revision)>=2&&
                rows.has(revisionKey(row.revision,ownerId)),'invalid old HEAD');
              continue;
            }
            if(key.startsWith('working-recovery:')){
              const ownerId=key.slice('working-recovery:'.length);
              ensure(COPY_ID.test(ownerId),'invalid old recovery owner');
              recoveryFields(row,ownerId);
              const baseKey=revisionKey(row.baseRevision,ownerId),base=rows.get(baseKey);
              const verified=await verifyRecovery({row,base},ownerId);
              await add('idb',key,row,verified.experiment,{key:baseKey,row:base});continue;
            }
            const ownerId=row&&row.id;
            ensure(typeof ownerId==='string'&&COPY_ID.test(ownerId)&&(includeShared||ownerId!==id)&&
              key===revisionKey(row.revision,ownerId),'unsupported working-store record');
            const verified=await decode(row,row.revision,ownerId);
            await add('idb',key,row,verified.experiment);
          }catch(error){issues.push({source:'idb',key:String(key),error:error.message});}
        }
        lease.check();
        ensure(canonical(localEvidence(storage,codec))===canonical(local),
          'local evidence changed during inventory');
        return {candidates,issues};
      }
      function readMigrationSources(storage){
        return migrationCandidates(storage,true);
      }
      async function inspectMigration(storage){
        const result=await migrationCandidates(storage);
        return {candidates:result.candidates.map(({selection,workspace,experiment})=>
          ({selection,workspace,experiment})),issues:result.issues};
      }
      return Object.freeze({id,read,readRevision,inspectMigration,readMigrationEvidence,readMigrationSources,readRecovery});
    }
    // Bounded observation of all verified retained physical experiments.
    // The lease cannot select a document or track a writable transaction.
    async function inspectProvenance(indexedDB,{storage,codec,crypto,contract}={}){
      const lease=Object.freeze({sessionId:'shared',
        check(write=false){if(write)throw Error('Physical provenance inspection is read-only');},
        track(_tx,write=false){if(write)throw Error('Physical provenance inspection is read-only');return ()=>{};}
      });
      const entries=[],issues=[];
      function add(key,title,revision,experiment){
        if(experiment?.calibrationOrigin)entries.push({key,title,revision,
          experiment:{calibrationOrigin:experiment.calibrationOrigin}});
      }
      try{
        const old=await openWorkingCopy(indexedDB,{lease,codec,crypto,existingOnly:true}).readMigrationSources(storage);
        old.candidates.forEach(item=>{
          const ref=item.selection;
          add(ref.source+':'+ref.key,'Retained physical experiment',ref.digest,item.experiment);
        });
        old.issues.forEach(item=>issues.push(item.source+':'+item.key+': '+item.error));
      }catch(error){issues.push('Retained physical experiments: '+error.message);}
      try{
        const row=await openSharedCheckpoint(indexedDB,{lease,codec,crypto,contract,existingOnly:true}).read();
        if(row){
          add('shared:committed','Shared physical experiment',row.revision,row.experiment);
          add('shared:draft','Shared physical recovery draft',row.revision,row.draft);
        }
      }catch(error){issues.push('Shared physical checkpoint: '+error.message);}
      return {entries,issues};
    }
    return Object.freeze({read,write,clear,readWorkingCopy,openWorkingCopy,openSharedCheckpoint,inspectProvenance,
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
    readWorkingCopy:defaultAdapter.readWorkingCopy,
    openWorkingCopy:defaultAdapter.openWorkingCopy,
    openSharedCheckpoint:defaultAdapter.openSharedCheckpoint,
    inspectProvenance:defaultAdapter.inspectProvenance,
    coordination:defaultAdapter.coordination,makeAdapter,
    normalize:normalize,newer:newer,validateSharedCheckpoint});
}));

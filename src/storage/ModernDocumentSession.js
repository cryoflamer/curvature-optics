/* Headless document-session contract; no storage or DOM side effects.
 * Domain stores own payloads. Not mounted until migration is verified.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CurvatureModernDocumentSession=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const FORMAT='curvature-modern-document-session',VERSION=1;
  const SHARED_VERSION=2,SHARED_ID='shared';
  const KINDS=Object.freeze(['experiment','calibration','animation']);
  const WORKSPACES=Object.freeze(['scene','compare','calibration','animation','images','demos']);
  const SLOT=Object.freeze({scene:'experiment',compare:'experiment',
    calibration:'calibration',animation:'animation',images:null,demos:null});
  function check(ok,why){if(!ok)throw Error('Document Session: '+why);}
  function fields(v,keys,what){
    check(v&&typeof v==='object'&&!Array.isArray(v)&&
      Object.keys(v).length===keys.length&&keys.every(k=>
        Object.prototype.hasOwnProperty.call(v,k)), 'invalid '+what+' fields');
  }
  function token(v,what,max=256){
    check(typeof v==='string'&&v.length<=max&&/^[A-Za-z0-9_.:-]+$/.test(v),
      'invalid '+what);return v;
  }
  function workspace(v){
    check(WORKSPACES.includes(v),'unknown workspace');return v;
  }
  function binding(v){
    if(v===null)return null;
    fields(v,['id','revision','recovery'],'document binding');
    const id=token(v.id,'document identity'),revision=token(v.revision,'document revision');
    let recovery=null;
    if(v.recovery!==null){
      fields(v.recovery,['id','revision','baseRevision'],'recovery reference');
      check(v.recovery.baseRevision===revision,'recovery base revision mismatch');
      recovery=Object.freeze({id:token(v.recovery.id,'recovery identity'),
        revision:token(v.recovery.revision,'recovery revision'),baseRevision:revision});
    }
    return Object.freeze({id,revision,recovery});
  }
  function normalize(v){
    check(v&&v.format===FORMAT&&(v.version===VERSION||
      (v.version===SHARED_VERSION&&v.sessionId===SHARED_ID)),
      'unsupported session format/version or shared identity');
    const shared=v.version===SHARED_VERSION;
    fields(v,['format','version',shared?'sessionId':'tabId','workspace','documents'],'session');
    fields(v.documents,KINDS,'document slots');
    const identity=shared?{sessionId:SHARED_ID}:{tabId:token(v.tabId,'tab ID',128)};
    return Object.freeze({format:FORMAT,version:v.version,...identity,
      workspace:workspace(v.workspace),documents:Object.freeze(Object.fromEntries(
        KINDS.map(kind=>[kind,binding(v.documents[kind])])))});
  }
  function empty(tabId){
    return normalize({format:FORMAT,version:VERSION,tabId,workspace:'scene',
      documents:{experiment:null,calibration:null,animation:null}});
  }
  function emptyShared(){
    return normalize({format:FORMAT,version:SHARED_VERSION,sessionId:SHARED_ID,
      workspace:'scene',documents:{experiment:null,calibration:null,animation:null}});
  }
  // Pure candidate only. The owner must preflight and CAS before activation.
  function select(session,mode,document){
    const before=normalize(session),kind=SLOT[workspace(mode)];
    check(kind!==null||document===undefined,'workspace has no editable document slot');
    return normalize({...before,workspace:mode,documents:kind&&document!==undefined?
      {...before.documents,[kind]:document}:before.documents});
  }
  function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
  const verifiedRecoveryPlans=new WeakMap();
  // Injected readers return domain-verified durable identities, not guessed
  // timestamps. Caller still checks its generation at actual activation.
  async function planRestore(session,{explicitIntent=false,readDocument,readRecovery,
    isCurrent=()=>true}={}){
    check(typeof explicitIntent==='boolean'&&typeof isCurrent==='function',
      'invalid restore intent/guard');
    const guard=()=>check(isCurrent()===true,'stale restore generation');
    guard();
    if(explicitIntent)return Object.freeze({source:'external'});
    const current=normalize(session),kind=SLOT[current.workspace];
    const ref=kind?current.documents[kind]:null;
    if(!ref)return Object.freeze({source:'empty',workspace:current.workspace});
    check(typeof readDocument==='function','document reader required');
    const found=await readDocument(kind,ref.id);guard();
    check(found&&found.kind===kind&&found.id===ref.id&&found.revision===ref.revision,
      'document missing or revision changed; selection was not activated');
    if(ref.recovery){
      check(typeof readRecovery==='function','recovery reader required');
      const r=await readRecovery(kind,ref.recovery.id);guard();
      check(r&&r.kind===kind&&r.documentId===ref.id&&r.baseRevision===ref.revision&&
        r.id===ref.recovery.id&&r.revision===ref.recovery.revision,
        'recovery missing or revision changed; evidence retained');
    }
    const plan=Object.freeze({source:ref.recovery?'recovery':'session',
      workspace:current.workspace,kind,document:ref});
    if(ref.recovery)verifiedRecoveryPlans.set(plan,{session:current,isCurrent});
    return plan;
  }
  // Starts from a verified, acknowledged session row. Receipt methods are
  // invoked ONLY after actual domain commit/readback and session CAS/readback.
  function createSaveTracker({session,sessionRevision}={}){
    let current=normalize(session);
    check(Number.isSafeInteger(sessionRevision)&&sessionRevision>=1&&
      sessionRevision<Number.MAX_SAFE_INTEGER,'acknowledged session revision required');
    const kind=SLOT[current.workspace];
    check(kind&&current.documents[kind],'bound document required');
    let revision=sessionRevision,edit=0,attempt=0,active=null,pending=null,error=null;
    let status=current.documents[kind].recovery?'recovering':'clean';
    function state(){
      return Object.freeze({status,session:current,sessionRevision:revision,
        edit,error,pending});
    }
    function markDirty(){
      check(['clean','committed','dirty','saving'].includes(status),
        'resolve recovery/failure before editing');
      check(edit<Number.MAX_SAFE_INTEGER,'edit generation exhausted');
      edit++;
      if(status!=='saving')status='dirty';
      return state();
    }
    // Explicitly load verified recovery through the domain adapter. Preserve
    // its pointer until the replacement session has been acknowledged.
    function recoveryLoaded(plan){
      check(status==='recovering'&&!error&&!pending&&current.documents[kind].recovery,
        'no original recovery to load');
      const verified=verifiedRecoveryPlans.get(plan);
      check(verified&&same(verified.session,current)&&verified.isCurrent()===true,
        'verified recovery plan required');
      verifiedRecoveryPlans.delete(plan);
      status='dirty';edit++;return state();
    }
    function beginSave(){
      check(status==='dirty','dirty document required before save');
      check(revision<Number.MAX_SAFE_INTEGER&&attempt<Number.MAX_SAFE_INTEGER,
        'save/session revision exhausted');
      const ref=current.documents[kind];
      const identity=current.version===SHARED_VERSION?
        {sessionId:current.sessionId}:{tabId:current.tabId};
      active=Object.freeze({...identity,kind,id:ref.id,
        baseRevision:ref.revision,sessionRevision:revision,edit,attempt:++attempt});
      pending=null;error=null;status='saving';return active;
    }
    function stale(t){return status!=='saving'||t!==active;}
    function acknowledgeDocument(t,receipt,mode=current.workspace){
      if(stale(t))return null;
      check(!pending,'document receipt already recorded');
      fields(receipt,['kind','id','revision'],'document receipt');
      check(receipt.kind===kind&&receipt.id===t.id&&receipt.revision!==t.baseRevision,
        'document acknowledgement does not match bound edit');
      // A domain fork needs separately verified activation; never silently
      // redirect later edits to a different document.
      check(SLOT[workspace(mode)]===kind,'document acknowledgement workspace mismatch');
      const next=binding({id:receipt.id,revision:receipt.revision,recovery:null});
      pending=Object.freeze({expectedRevision:revision,
        envelope:select(current,mode,next)});
      return pending;
    }
    function acknowledgeSession(t,receipt){
      if(stale(t))return false;
      check(pending,'document commit must be acknowledged first');
      fields(receipt,['revision','envelope'],'session receipt');
      check(receipt.revision===pending.expectedRevision+1&&
        same(normalize(receipt.envelope),pending.envelope),
        'session CAS acknowledgement mismatch');
      current=pending.envelope;revision=receipt.revision;
      pending=null;active=null;error=null;
      status=edit===t.edit?'committed':'dirty';
      return true;
    }
    function fail(t,reason){
      if(stale(t))return false;
      error=String(reason&&reason.message||reason||'save failed');
      // Preserve the candidate after a domain commit but before session CAS.
      // Recovery rereads both stores; never retries blindly.
      active=null;status='failed';return true;
    }
    function beginRecovery(){
      check(status==='failed','failed save required before reconciliation');
      status='recovering';return state();
    }
    function canSwitch(){return status==='clean'||status==='committed';}
    return Object.freeze({state,markDirty,recoveryLoaded,beginSave,
      acknowledgeDocument,acknowledgeSession,fail,beginRecovery,canSwitch});
  }
  function sharedExperimentCoordinator(locks){
    check(locks&&typeof locks.request==='function','shared experiment writer coordination unavailable');
    return action=>locks.request('curvature-modern-shared-experiment-operation',
      {mode:'exclusive'},lock=>{
        check(lock&&lock.mode==='exclusive','shared experiment operation lock unavailable');
        return action();
      });
  }
  const sharedLease=lease=>lease&&lease.sessionId===SHARED_ID&&!('tabId' in lease);
  // Explicit Scene/Compare orchestration; the caller owns activation and
  // supplies the same captured lease to both adapters. No UI/URL effects.
  function createExperimentController({lease,sessions,working,prepare,isCurrent}={}){
    check(lease&&typeof lease.check==='function'&&sessions&&working&&
      typeof prepare==='function'&&typeof isCurrent==='function',
      'owned experiment controller dependencies required');
    const shared=sharedLease(lease),tabId=shared?null:token(lease.tabId,'tab ID',128);
    check(working.id===(shared?'shared-experiment':'working-'+tabId),
      'working-copy identity mismatch');
    let status='idle',busy=false,tracker=null,row=null,head=null,bound=null,
      failure=null,offer=null,unsavedAfterAttempt=false;
    const clone=v=>JSON.parse(JSON.stringify(v));
    const scene=mode=>mode==='scene'||mode==='compare';
    function guard(writable=false){
      check(isCurrent()===true,'stale controller generation');lease.check(writable);
    }
    function state(){
      return clone({status,busy,row,head,bound,error:failure,
        pending:tracker?tracker.state().pending:null,unsavedAfterAttempt});
    }
    function checkedRow(value){
      check(value&&Number.isSafeInteger(value.revision)&&value.revision>=0,
        'invalid session receipt');
      const frame=value.revision===0?null:normalize(value.envelope);
      check(value.revision===0?value.envelope===null:
        shared?frame.version===SHARED_VERSION&&frame.sessionId===SHARED_ID:
          frame.version===VERSION&&frame.tabId===tabId,'session identity mismatch');
      return value.revision===0?{revision:0,envelope:null}:
        {revision:value.revision,envelope:normalize(value.envelope)};
    }
    function checkedDocument(value,expected){
      check(value&&value.kind==='experiment'&&value.id===working.id&&
        typeof value.revision==='string'&&value.experiment&&
        (expected===undefined||value.revision===expected),
        'working-copy receipt mismatch');
      return clone(value);
    }
    function activate(saved,value){
      check(saved.envelope&&scene(saved.envelope.workspace)&&
        saved.envelope.documents.experiment&&
        saved.envelope.documents.experiment.id===value.id&&
        saved.envelope.documents.experiment.revision===value.revision&&
        !saved.envelope.documents.experiment.recovery,'experiment binding mismatch');
      row=saved;head=bound=value;
      tracker=createSaveTracker({session:row.envelope,sessionRevision:row.revision});
      offer=null;failure=null;status='clean';
    }
    function begin(){
      check(!busy,'controller operation pending');busy=true;
    }
    function failed(error){
      failure=String(error&&error.message||error);status='failed';offer=null;
    }
    async function writeSession(candidate,expected){
      guard(true);
      const saved=checkedRow(await sessions.write(candidate,expected));guard(true);
      check(saved.revision===expected+1&&same(saved.envelope,candidate),
        'session CAS acknowledgement mismatch');
      return saved;
    }
    // For an existing binding always read the precise acknowledged revision
    // before comparing HEAD. Never migrate over another workspace or draft.
    async function inspect(){
      guard();
      const saved=checkedRow(await sessions.read());guard();
      if(!saved.envelope||!saved.envelope.documents.experiment){
        check(!saved.envelope||scene(saved.envelope.workspace),
          'active non-experiment workspace must not be replaced');
        return {saved,unbound:true};
      }
      const ref=saved.envelope.documents.experiment;
      check(scene(saved.envelope.workspace)&&ref.id===working.id&&!ref.recovery,
        'unsupported experiment session binding; evidence retained');
      const previous=checkedDocument(await working.readRevision(ref.revision),ref.revision);
      guard();
      const latest=checkedDocument(await working.read());guard();
      return {saved,previous,latest};
    }
    function acceptInspection(result){
      row=result.saved;bound=result.previous;head=result.latest;
      if(bound.revision===head.revision){activate(row,bound);return;}
      tracker=null;status='recovering';
      // This offer is tied to exact observed session and document identities.
      offer=Object.freeze({sessionRevision:row.revision,revision:head.revision,
        acknowledgedRevision:bound.revision});
    }
    async function open({explicitIntent=false}={}){
      check(typeof explicitIntent==='boolean','explicit intent must be boolean');
      check(status==='idle','controller already opened');
      begin();
      try{
        guard();
        // Explicit URL/import priority: not even a private session read.
        if(explicitIntent){status='external';return;}
        const result=await inspect();
        if(!result.unbound){acceptInspection(result);return;}
        guard(true);
        const candidate=await prepare();guard(true);
        if(candidate.status==='empty'){status='empty';row=result.saved;return;}
        check(candidate.status==='verified'&&scene(candidate.workspace)&&
          candidate.document&&candidate.document.id===working.id&&!candidate.document.recovery,
          'invalid migration candidate');
        const current=checkedDocument(await working.read(),candidate.document.revision);
        guard(true);
        const envelope=select(result.saved.envelope||(shared?emptyShared():empty(tabId)),
          candidate.workspace,candidate.document);
        const saved=await writeSession(envelope,result.saved.revision);
        activate(saved,current);
      }catch(error){failed(error);throw error;}finally{busy=false;}
    }
    function markDirty(){
      guard(true);
      check(tracker&&['clean','dirty','committed','saving'].includes(status),
        'resolve session recovery before editing');
      const next=tracker.markDirty();status=next.status;return state();
    }
    async function save(experiment){
      check(status==='dirty'&&tracker,'dirty document required');
      begin();let attempt=null;
      try{
        guard(true);
        if(same(experiment,bound.experiment)){
          // No new revision for a reverted edit. Check both durable stores,
          // and retain any edit that arrived while verifying the no-op.
          const edit=tracker.state().edit;
          const verified=await inspect();guard(true);
          check(!verified.unbound&&same(verified.saved,row)&&
            verified.latest.revision===bound.revision,'unchanged edit verification conflict');
          if(tracker.state().edit===edit)activate(row,bound);
          return;
        }
        attempt=tracker.beginSave();status='saving';
        const receipt=await working.write(experiment,attempt.baseRevision);guard(true);
        const verified=checkedDocument(await working.readRevision(receipt.revision),receipt.revision);
        guard(true);head=verified;
        const mode=verified.experiment.display?.mode||row.envelope.workspace;
        const pending=tracker.acknowledgeDocument(attempt,receipt,mode);
        check(pending,'stale document receipt');
        const saved=await writeSession(pending.envelope,pending.expectedRevision);
        check(tracker.acknowledgeSession(attempt,saved),'stale session receipt');
        row=saved;bound=verified;status=tracker.state().status;failure=null;
      }catch(error){
        if(attempt){unsavedAfterAttempt=tracker.state().edit!==attempt.edit;tracker.fail(attempt,error);}
        failed(error);throw error;
      }
      finally{busy=false;}
    }
    // Read-first reconciliation after an ambiguous commit. A dirty edit
    // without a durable new head remains failed; caller must retain its input.
    async function recover(){
      check(status==='failed'||status==='recovering','no unresolved save');
      begin();
      try{
        check(!unsavedAfterAttempt,'later unsaved edits require explicit handling; retain input');
        const result=await inspect();
        check(!result.unbound,'unbound candidate requires a fresh explicit open');
        if(tracker&&tracker.state().status==='failed'&&
          result.latest.revision===result.previous.revision){
          const pending=tracker.state().pending;
          check(pending&&same(result.saved.envelope,pending.envelope)&&
            result.saved.revision===pending.expectedRevision+1,
            'no verified saved edit; retain unsaved input');
        }
        acceptInspection(result);failure=null;
      }catch(error){failed(error);throw error;}finally{busy=false;}
    }
    function recoveryOffer(){return offer?clone(offer):null;}
    async function acceptHead(selection){
      check(status==='recovering'&&offer&&same(selection,offer),
        'explicit current recovery offer required');
      begin();
      try{
        guard(true);
        const result=await inspect();guard(true);
        check(!result.unbound&&same(result.saved,row)&&
          result.previous.revision===offer.acknowledgedRevision&&
          result.latest.revision===offer.revision,'recovery offer changed; evidence retained');
        const mode=result.latest.experiment.display?.mode||row.envelope.workspace;
        check(scene(mode),'unsupported recovered experiment workspace');
        const candidate=select(row.envelope,mode,
          {id:working.id,revision:offer.revision,recovery:null});
        const saved=await writeSession(candidate,row.revision);
        activate(saved,result.latest);
      }catch(error){failed(error);throw error;}finally{busy=false;}
    }
    return Object.freeze({open,markDirty,save,recover,recoveryOffer,acceptHead,state});
  }

  // Opt-in recovery orchestration around the existing document/session CAS
  // controller. The domain owns the draft bytes; the session always points
  // to the last acknowledged document (including during a draft write).
  function createRecoverableExperimentController(options={}){
    const {lease,sessions,working,isCurrent,coordinate}=options;
    const shared=sharedLease(lease);
    check(!shared||typeof coordinate==='function','shared experiment operation coordinator required');
    const coordinated=action=>shared?coordinate(action):action();
    check(working&&['readRecovery','stageRecovery','retireRecovery'].every(
      name=>typeof working[name]==='function'),'working recovery adapter required');
    const core=createExperimentController(options);
    const clone=v=>JSON.parse(JSON.stringify(v));
    const payloadKey=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?
      Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
    const samePayload=(a,b)=>payloadKey(a)===payloadKey(b);
    let draft=null,offer=null,latest=null,generation=0,durableGeneration=0;
    let pump=null,retiring=false,busy=false,checkpointError=null;
    let commitDone=null,finishCommit=null;
    const guard=(writable=false)=>{
      check(isCurrent()===true,'stale recovery controller generation');lease.check(writable);
    };
    function fail(error){checkpointError=String(error&&error.message||error);}
    function state(){
      const current=core.state();
      return {...current,busy:busy||current.busy,
        status:checkpointError?'failed':offer?'recovering':current.status,
        error:checkpointError||current.error,
        checkpoint:checkpointError?'failed':latest&&latest.generation!==durableGeneration?
          'pending':draft?'durable':'none',
        draft:draft?clone(draft):null,draftOffer:offer?clone(offer):null,
        latestInput:latest?clone(latest.experiment):null};
    }
    function checkedDraft(value){
      if(value===null)return null;
      check(value&&value.kind==='experiment'&&value.documentId===working.id&&
        value.id===(shared?'shared-experiment-recovery':'recovery-'+lease.tabId)&&value.experiment&&
        typeof value.revision==='string'&&typeof value.baseRevision==='string',
        'working recovery identity mismatch');
      token(value.revision,'draft revision');token(value.baseRevision,'draft base revision');
      return clone(value);
    }
    // Called inside the shared operation lock. Read first, but never
    // rebase a stale view by silently adopting a newer revision.
    async function verifySharedCurrent(){
      guard(true);
      const current=core.state(),saved=await sessions.read();guard(true);
      check(same(saved,current.row),'shared session changed; retain unsaved input and reload');
      const head=await working.read();guard(true);
      check(same(head,current.bound),'shared document changed; retain unsaved input and reload');
      const remote=checkedDraft(await working.readRecovery());guard(true);
      check(same(remote,draft),'shared recovery changed; retain unsaved input and reload');
    }
    function startPump(){
      if(pump||retiring||commitDone||checkpointError||!latest||latest.generation===durableGeneration)return;
      // Legacy preview may stage concurrently with document CAS. Shared
      // saves defer later edits until the new base is acknowledged.
      // Coalesce edits that arrived while the prior checkpoint was in flight.
      pump=(async()=>{
        while(latest&&latest.generation!==durableGeneration){
          guard(true);
          const job=latest,base=core.state().bound;
          check(base,'acknowledged document required for recovery');
          const saved=await coordinated(async()=>{
            if(shared)await verifySharedCurrent();
            return checkedDraft(await working.stageRecovery(job.experiment,base.revision,
              draft?draft.revision:null));
          });
          guard(true);
          check(saved&&saved.baseRevision===base.revision&&samePayload(saved.experiment,job.experiment),
            'working recovery acknowledgement mismatch');
          draft=saved;durableGeneration=job.generation;
        }
      })().catch(fail).finally(()=>{
        pump=null;startPump();
      });
    }
    async function flushCheckpoint(){
      if(commitDone)await commitDone;
      startPump();
      while(pump)await pump;
      guard();
      check(!checkpointError,checkpointError||'working recovery failed');
      check(!latest||latest.generation===durableGeneration,'working recovery not acknowledged');
      return draft?clone(draft):null;
    }
    function markDirty(experiment){
      guard(true);
      check(!checkpointError&&!offer,'resolve working recovery before editing');
      check(experiment&&typeof experiment==='object'&&!Array.isArray(experiment),
        'experiment snapshot required for recovery');
      check(generation<Number.MAX_SAFE_INTEGER,'recovery edit generation exhausted');
      const snapshot=clone(experiment);
      core.markDirty();
      latest={generation:++generation,experiment:snapshot};
      startPump();
      return state();
    }
    async function retire(acknowledged,expected){
      // Serialize retirement against checkpoint writes. Edits arriving here
      // stay pending in memory and start staging after the exact CAS returns.
      check(!pump&&!retiring,'recovery writer still active');
      retiring=true;
      try{
        guard(true);
        check(draft&&draft.revision===expected&&samePayload(draft.experiment,acknowledged.experiment),
          'recovery retirement receipt mismatch');
        check(await working.retireRecovery(expected,acknowledged.revision)===true,
          'recovery retirement not acknowledged');
        guard(true);draft=null;
      }catch(error){fail(error);throw error;}
      finally{retiring=false;startPump();}
    }
    async function inspectDraft(){
      guard();
      draft=checkedDraft(await working.readRecovery());guard();
      offer=null;
      const current=core.state();
      if(!draft)return;
      check(current.bound&&current.head,'unbound working recovery; evidence retained');
      // A divergent document HEAD must be explicitly reconciled first.
      // Never silently promote it or apply a draft to an unknown head.
      if(current.status==='recovering')return;
      check(current.status==='clean'&&current.head.revision===current.bound.revision,
        'working recovery cannot be activated; evidence retained');
      if(samePayload(draft.experiment,current.bound.experiment)){
        // Crash after session CAS but before retirement. Both stores were
        // just verified by core.open()/acceptHead(); no new revision needed.
        await retire(current.bound,draft.revision);return;
      }
      offer=Object.freeze({sessionRevision:current.row.revision,
        documentRevision:current.bound.revision,recoveryRevision:draft.revision,
        baseRevision:draft.baseRevision});
    }
    async function open({explicitIntent=false}={}){
      check(!busy,'recovery controller operation pending');busy=true;
      try{
        if(explicitIntent)await core.open({explicitIntent:true});
        else await coordinated(async()=>{
          await core.open();
          await inspectDraft();
        });
      }catch(error){fail(error);throw error;}finally{busy=false;}
    }
    function recoveryOffer(){return checkpointError?null:core.recoveryOffer();}
    function draftOffer(){return !checkpointError&&offer?clone(offer):null;}
    async function acceptHead(selection){
      check(!busy&&!checkpointError&&!offer,'resolve recovery before accepting head');
      busy=true;
      try{
        await coordinated(async()=>{
          guard(true);
          const current=checkedDraft(await working.readRecovery());guard();
          check(same(current,draft),'working recovery changed; evidence retained');
          await core.acceptHead(selection);
          await inspectDraft();
        });
      }catch(error){fail(error);throw error;}finally{busy=false;}
    }
    async function loadDraft(selection){
      check(!busy&&!checkpointError&&offer&&same(offer,selection),
        'explicit current draft offer required');
      busy=true;
      try{
        return await coordinated(async()=>{
        guard(true);
        const current=core.state(),saved=await sessions.read();guard();
        check(same(saved,current.row),'draft session changed; evidence retained');
        const head=await working.read();guard();
        check(same(head,current.bound),'draft document changed; evidence retained');
        const verified=checkedDraft(await working.readRecovery());guard();
        check(same(verified,draft),'draft offer changed; evidence retained');
        check(generation<Number.MAX_SAFE_INTEGER,'recovery edit generation exhausted');
        core.markDirty();
        latest={generation:++generation,experiment:clone(draft.experiment)};
        durableGeneration=generation;offer=null;
        // Caller may now activate the exact payload in memory. No commit
        // occurs until a separately requested save().
        return clone(latest.experiment);
        });
      }catch(error){fail(error);throw error;}finally{busy=false;}
    }
    async function save(){
      check(!busy&&!checkpointError&&!offer&&latest&&core.state().status==='dirty',
        'dirty recoverable experiment required');
      busy=true;
      try{
        await flushCheckpoint();
        const job=latest,savedDraft=draft;
        check(job&&savedDraft&&job.generation===durableGeneration,'draft acknowledgement required');
        if(shared)commitDone=new Promise(resolve=>{finishCommit=resolve;});
        await coordinated(async()=>{
        if(shared)await verifySharedCurrent();
        const before=core.state().bound;
        // Legacy migration may preserve a different JSON property order.
        // The existing core still gets an exact no-op snapshot in that case.
        await core.save(samePayload(savedDraft.experiment,before.experiment)?
          before.experiment:clone(savedDraft.experiment));
        guard(true);
        // A newer input can arrive during shared preflight, before the
        // core captures its save token. Keep it dirty even in that case.
        if(shared&&latest!==job&&['clean','committed'].includes(core.state().status))
          core.markDirty();
        // A later edit may already be durable or still in flight. Never
        // retire any draft on behalf of this older document completion.
        if(latest===job&&core.state().status!=='dirty'&&!checkpointError){
          check(!pump,'unexpected pending recovery write');
          // Clear only this in-memory generation before retirement. A new
          // edit can replace it while the retirement transaction runs.
          await retire(core.state().bound,savedDraft.revision);
          if(latest===job)latest=null;
        }
        check(!checkpointError,checkpointError||'working recovery failed');
        });
      }catch(error){if(shared||core.state().status!=='failed')fail(error);throw error;}
      finally{
        if(commitDone){const done=finishCommit;commitDone=null;finishCommit=null;done();}
        busy=false;
        if(shared)startPump();
      }
    }
    return Object.freeze({open,markDirty,flushCheckpoint,save,recoveryOffer,
      acceptHead,draftOffer,loadDraft,state});
  }
  return Object.freeze({FORMAT,VERSION,SHARED_VERSION,SHARED_ID,KINDS,WORKSPACES,empty,emptyShared,normalize,
    select,planRestore,createSaveTracker,createExperimentController,createRecoverableExperimentController,
    sharedExperimentCoordinator});
}));

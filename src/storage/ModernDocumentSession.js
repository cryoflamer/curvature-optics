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
    return plan;
  }
  function sharedExperimentCoordinator(locks){
    check(locks&&typeof locks.request==='function','shared experiment writer coordination unavailable');
    return action=>locks.request('curvature-modern-shared-experiment-operation',
      {mode:'exclusive'},lock=>{
        check(lock&&lock.mode==='exclusive','shared experiment operation lock unavailable');
        return action();
      });
  }
  // Live atomic checkpoint controller. One CAS baseline for both committed
  // and draft payloads; later edits remain in memory during promotion.
  function createAtomicExperimentController({lease,checkpoint,prepare,isCurrent,readDocument,readRecovery,selectionRecovery=null}={}){
    check(lease&&lease.sessionId===SHARED_ID&&!('tabId' in lease)&&
      checkpoint&&typeof prepare==='function'&&typeof isCurrent==='function',
      'atomic experiment controller dependencies required');
    if(selectionRecovery)check(['calibration','animation'].includes(selectionRecovery.kind)&&
      typeof selectionRecovery.read==='function'&&typeof selectionRecovery.retire==='function'&&
      typeof checkpoint.proveSelectionReceipt==='function','durable selection recovery dependencies required');
    const clone=v=>JSON.parse(JSON.stringify(v));
    const guard=(write=false)=>{check(isCurrent()===true,'stale controller generation');lease.check(write);};
    let row=null,status='idle',busy=false,error=null,offer=null,latest=null,staged=null,pump=null,promoting=false,selecting=false,selectionAttempt=null,recoveryReceipt=null;
    function fail(e){error=String(e&&e.message||e);status='failed';}
    function bound(){
      return row?{kind:'experiment',id:'shared-experiment',
        revision:row.envelope.documents.experiment.revision,experiment:row.experiment}:null;
    }
    function draft(){
      return row&&row.draft!==null?{kind:'experiment',documentId:'shared-experiment',
        id:'shared-experiment-recovery',revision:'checkpoint:'+row.revision,
        baseRevision:bound().revision,experiment:row.draft}:null;
    }
    function state(){
      return clone({status,busy,error,row:row?{revision:row.revision,envelope:row.envelope}:null,
        bound:bound(),draft:draft(),draftOffer:offer,
        checkpoint:error?'failed':latest&&latest!==staged?'pending':draft()?'durable':'none',
        latestInput:latest?latest.experiment:null,
        ...(selectionRecovery?{selectionRecovery:recoveryReceipt?clone(recoveryReceipt):null}:{}),
        pendingSelection:selectionAttempt?{baseRevision:selectionAttempt.before.revision,
          workspace:selectionAttempt.mode,document:selectionAttempt.document??null}:null});
    }
    function startPump(){
      if(pump||promoting||error||offer||!latest||latest===staged)return;
      pump=(async()=>{
        while(latest&&latest!==staged){
          guard(true);
          const job=latest;
          row=await checkpoint.stage(job.experiment,row.revision);guard(true);
          staged=job;
        }
      })().catch(fail).finally(()=>{pump=null;startPump();});
    }
    async function flushCheckpoint(){
      startPump();while(pump)await pump;
      guard();check(!error,error||'checkpoint failed');
      check(!latest||latest===staged,'checkpoint not acknowledged');
      return draft()?clone(draft()):null;
    }
    async function open({explicitIntent=false}={}){
      check(status==='idle'&&!busy,'controller already opened');
      busy=true;
      try{
        guard();
        if(explicitIntent){status='external';return;}
        row=await checkpoint.read();guard();
        if(selectionRecovery){
          recoveryReceipt=await selectionRecovery.read();guard();
          if(recoveryReceipt){
            // The old pointer may intentionally reference a superseded
            // project revision. Do not run ordinary restore or migration.
            check(row,'selection receipt has no shared checkpoint; evidence retained');
            status='recovering-selection';return;
          }
        }
        if(!row){row=await prepare();guard();}
        if(!row){status='empty';return;}
        if(['calibration','animation'].includes(row.envelope.workspace)){
          const plan=await planRestore(row.envelope,{readDocument,readRecovery,isCurrent});
          guard();check(plan.source==='session'||plan.source==='recovery','verified auxiliary document required');
        }
        if(row.draft!==null){
          offer={revision:row.revision,digest:row.digest};
          status='recovering';
        }else status='clean';
      }catch(e){fail(e);throw e;}finally{busy=false;}
    }
    function markDirty(experiment){
      guard(true);
      check(row&&!offer&&!error&&!selecting&&['scene','compare'].includes(row.envelope.workspace)&&
        ['clean','committed','dirty','saving'].includes(status),
        'resolve session recovery before editing');
      latest={experiment:clone(experiment)};
      if(!promoting)status='dirty';
      startPump();return state();
    }
    function draftOffer(){return !error&&offer?clone(offer):null;}
    async function loadDraft(selection){
      check(!busy&&!error&&offer&&same(selection,offer),'explicit current draft offer required');
      busy=true;
      try{
        guard(true);
        const verified=await checkpoint.read();guard(true);
        check(same(verified,row),'draft offer changed; evidence retained');
        latest=staged={experiment:clone(row.draft)};
        offer=null;status='dirty';return clone(latest.experiment);
      }catch(e){fail(e);throw e;}finally{busy=false;}
    }
    async function save(){
      check(!busy&&!error&&!offer&&status==='dirty'&&latest,'dirty experiment required');
      busy=true;
      try{
        do{await flushCheckpoint();}while(latest!==staged);
        const job=latest;
        check(job&&row.draft!==null,'draft acknowledgement required');
        promoting=true;status='saving';
        row=await checkpoint.promote(row.revision);guard(true);
        staged=null;
        if(latest===job){latest=null;status='committed';}
        else status='dirty';
      }catch(e){fail(e);throw e;}
      finally{promoting=false;busy=false;startPump();}
    }
    async function selectWorkspace(mode,document){
      guard(true);
      check(row&&!busy&&!pump&&!latest&&!offer&&!error&&row.draft===null&&
        ['clean','committed'].includes(status),'resolve physical draft before workspace selection');
      check(typeof checkpoint.selectWorkspace==='function','workspace selection adapter required');
      const expected=select(row.envelope,mode,document);
      selectionAttempt={before:clone(row),expected,mode,document:document===undefined?undefined:clone(document)};
      busy=true;selecting=true;
      try{
        row=await checkpoint.selectWorkspace(mode,document,row.revision,{readDocument,readRecovery,isCurrent});
        guard(true);status='committed';selectionAttempt=null;
      }catch(e){fail(e);throw e;}
      finally{selecting=false;busy=false;}
      return state();
    }
    // Explicit retry only for this controller's failed selection. A fresh
    // read may prove the original write committed, but must never rebase it.
    async function retryWorkspaceSelection(){
      guard(true);
      check(!busy&&!pump&&!latest&&!offer&&status==='failed'&&selectionAttempt,
        'failed workspace selection receipt required');
      const attempt=selectionAttempt,before=attempt.before;
      busy=true;selecting=true;
      try{
        const verified=await checkpoint.read();guard(true);
        if(same(verified,before)){
          row=await checkpoint.selectWorkspace(attempt.mode,attempt.document,before.revision,
            {readDocument,readRecovery,isCurrent});
        }else{
          check(verified&&verified.revision===before.revision+1&&verified.draft===null&&
            same(verified.experiment,before.experiment)&&same(normalize(verified.envelope),attempt.expected),
            'workspace selection CAS conflict; original receipt retained');
          if(['calibration','animation'].includes(attempt.mode)){
            const plan=await planRestore(verified.envelope,{readDocument,readRecovery,isCurrent});
            guard(true);check(plan.source==='session'||plan.source==='recovery','verified auxiliary document required');
          }
          const confirmed=await checkpoint.read();guard(true);
          check(same(confirmed,verified),'workspace selection changed during acknowledgement; receipt retained');
          row=confirmed;
        }
        guard(true);status='committed';error=null;selectionAttempt=null;
      }catch(e){fail(e);throw e;}
      finally{selecting=false;busy=false;}
      return state();
    }
    // Domain saves may update/fork a project before the shared pointer is
    // acknowledged. A receipt is not an explicit request to open a different
    // document: it may advance only the exact currently selected binding.
    async function captureSelectionBase(kind,previous){
      guard(true);
      check(['calibration','animation'].includes(kind),'auxiliary document kind required');
      check(row&&!busy&&!pump&&!latest&&!offer&&!error&&row.draft===null&&
        ['clean','committed'].includes(status)&&row.envelope.workspace===kind&&
        previous&&same(binding(row.envelope.documents[kind]),binding(previous)),
        'active clean auxiliary selection required');
      busy=true;
      try{
        const verified=await checkpoint.read();guard(true);
        check(same(verified,row),'auxiliary selection CAS conflict before domain save');
        return Object.freeze({revision:row.revision,digest:row.digest});
      }catch(e){fail(e);throw e;}
      finally{busy=false;}
    }
    async function acknowledgeDocumentRevision(kind,{previous,current,base}={}){
      guard(true);
      check(['calibration','animation'].includes(kind),'auxiliary document kind required');
      const before=binding(previous),after=binding(current);
      check(before&&after&&before.recovery===null&&after.recovery===null&&!same(before,after),
        'invalid auxiliary revision receipt');
      check(row&&row.envelope.workspace===kind&&same(binding(row.envelope.documents[kind]),before),
        'auxiliary selection changed; domain receipt retained');
      if(base!==undefined){
        fields(base,['revision','digest'],'auxiliary receipt base');
        const origin=selectionAttempt?selectionAttempt.before:row;
        check(origin.revision===base.revision&&origin.digest===base.digest,
          'auxiliary receipt base changed; evidence retained');
      }
      if(selectionAttempt){
        check(selectionAttempt.mode===kind&&same(selectionAttempt.document,after)&&
          same(binding(selectionAttempt.before.envelope.documents[kind]),before),
          'different workspace selection pending; domain receipt retained');
        return retryWorkspaceSelection();
      }
      return selectWorkspace(kind,after);
    }
    // Metadata changes to an unselected auxiliary document must not
    // advance or invalidate the retained shared reference. The caller holds
    // the same operation lock through the subsequent domain CAS.
    async function assertUnselectedDocument(kind,reference){
      guard(true);
      check(['calibration','animation'].includes(kind),'auxiliary document kind required');
      const ref=binding(reference);
      check(ref&&ref.recovery===null,'verified document reference required');
      check(row&&!busy&&!pump&&!latest&&!offer&&!error&&!selectionAttempt&&!recoveryReceipt&&
        row.draft===null&&['clean','committed'].includes(status),
        'resolve pending session work before changing unselected document');
      busy=true;selecting=true;
      try{
        const verified=await checkpoint.read();guard(true);
        check(same(verified,row),'auxiliary metadata CAS conflict; reload required');
      }catch(e){fail(e);throw e;}
      finally{busy=false;selecting=false;}
      const selected=binding(row.envelope.documents[kind]);
      check(!selected||selected.id!==ref.id,'open the retained selected document before renaming');
      return true;
    }
    // Must be called inside the same mounted auxiliary-operation lock as
    // selection and domain saves. Clear the durable pointer before allowing
    // destructive domain CRUD, never the other way around.
    async function detachDocument(kind,reference){
      guard(true);
      check(['calibration','animation'].includes(kind),'auxiliary document kind required');
      const ref=binding(reference);
      check(ref&&ref.recovery===null,'verified document reference required');
      check(row&&!busy&&!pump&&!latest&&!offer&&!error&&!selectionAttempt&&!recoveryReceipt&&
        row.draft===null&&['clean','committed'].includes(status),
        'resolve pending session work before removal');
      busy=true;selecting=true;
      try{
        const verified=await checkpoint.read();guard(true);
        check(same(verified,row),'auxiliary removal CAS conflict; reload required');
        const selected=binding(row.envelope.documents[kind]);
        if(!selected||selected.id!==ref.id)return {detached:false};
        check(same(selected,ref),'selected document revision changed; removal rejected');
        check(typeof checkpoint.detachDocument==='function','auxiliary removal adapter required');
        row=await checkpoint.detachDocument(kind,ref,row.revision,{isCurrent});
        guard(true);status='committed';
        return {detached:true};
      }catch(e){fail(e);throw e;}
      finally{busy=false;selecting=false;}
    }
    // A new controller can reconcile a persisted domain receipt, but only
    // on explicit request. No inference from the newest domain revision.
    async function recoverDocumentSelection(selection){
      guard(true);
      check(selectionRecovery&&recoveryReceipt&&!busy&&!pump&&!latest&&!offer&&
        ['recovering-selection','failed'].includes(status)&&same(selection,recoveryReceipt),
        'explicit current durable selection receipt required');
      busy=true;selecting=true;
      try{
        const kind=selectionRecovery.kind,receipt=recoveryReceipt;
        const before=binding(receipt.previous),after=binding(receipt.current);
        check(before&&after&&before.recovery===null&&after.recovery===null&&!same(before,after),
          'invalid durable selection receipt');
        const retained=await selectionRecovery.read();guard(true);
        check(same(retained,receipt),'durable selection receipt changed; evidence retained');
        row=await checkpoint.read();guard(true);
        const proof=await checkpoint.proveSelectionReceipt(row,kind,before,after,receipt.base);guard(true);
        check(['pending','committed'].includes(proof),'selection receipt CAS conflict; evidence retained');
        if(proof==='pending'){
          row=await checkpoint.selectWorkspace(kind,after,receipt.base.revision,
            {readDocument,readRecovery,isCurrent});guard(true);
        }
        const plan=await planRestore(row.envelope,{readDocument,readRecovery,isCurrent});guard(true);
        check(plan.source==='session'&&plan.kind===kind&&same(plan.document,after),
          'durable selection was not verified');
        const confirmed=await checkpoint.read();guard(true);
        check(same(confirmed,row)&&await checkpoint.proveSelectionReceipt(confirmed,kind,before,after,receipt.base)==='committed',
          'selection changed before receipt retirement; evidence retained');
        guard(true);
        await selectionRecovery.retire(receipt);guard(true);
        const final=await checkpoint.read();guard(true);
        check(same(final,confirmed),'selection changed during receipt retirement; reload required');
        row=final;recoveryReceipt=null;status='committed';error=null;
      }catch(e){fail(e);throw e;}
      finally{busy=false;selecting=false;}
      return state();
    }
    return Object.freeze({open,markDirty,flushCheckpoint,save,draftOffer,loadDraft,selectWorkspace,
      retryWorkspaceSelection,captureSelectionBase,acknowledgeDocumentRevision,assertUnselectedDocument,detachDocument,recoverDocumentSelection,state});
  }
  return Object.freeze({FORMAT,VERSION,SHARED_VERSION,SHARED_ID,KINDS,WORKSPACES,empty,emptyShared,normalize,
    select,planRestore,
    sharedExperimentCoordinator,createAtomicExperimentController});
}));

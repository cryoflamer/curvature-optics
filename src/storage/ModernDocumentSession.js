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
    fields(v,['format','version','tabId','workspace','documents'],'session');
    check(v.format===FORMAT&&v.version===VERSION,'unsupported session format/version');
    fields(v.documents,KINDS,'document slots');
    return Object.freeze({format:FORMAT,version:VERSION,tabId:token(v.tabId,'tab ID',128),
      workspace:workspace(v.workspace),documents:Object.freeze(Object.fromEntries(
        KINDS.map(kind=>[kind,binding(v.documents[kind])])))});
  }
  function empty(tabId){
    return normalize({format:FORMAT,version:VERSION,tabId,workspace:'scene',
      documents:{experiment:null,calibration:null,animation:null}});
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
      active=Object.freeze({tabId:current.tabId,kind,id:ref.id,
        baseRevision:ref.revision,sessionRevision:revision,edit,attempt:++attempt});
      pending=null;error=null;status='saving';return active;
    }
    function stale(t){return status!=='saving'||t!==active;}
    function acknowledgeDocument(t,receipt){
      if(stale(t))return null;
      check(!pending,'document receipt already recorded');
      fields(receipt,['kind','id','revision'],'document receipt');
      check(receipt.kind===kind&&receipt.id===t.id&&receipt.revision!==t.baseRevision,
        'document acknowledgement does not match bound edit');
      // A domain fork needs separately verified activation; never silently
      // redirect later edits to a different document.
      const next=binding({id:receipt.id,revision:receipt.revision,recovery:null});
      pending=Object.freeze({expectedRevision:revision,
        envelope:select(current,current.workspace,next)});
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
  return Object.freeze({FORMAT,VERSION,KINDS,WORKSPACES,empty,normalize,
    select,planRestore,createSaveTracker});
}));

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
  function createAtomicExperimentController({lease,checkpoint,prepare,isCurrent}={}){
    check(lease&&lease.sessionId===SHARED_ID&&!('tabId' in lease)&&
      checkpoint&&typeof prepare==='function'&&typeof isCurrent==='function',
      'atomic experiment controller dependencies required');
    const clone=v=>JSON.parse(JSON.stringify(v));
    const guard=(write=false)=>{check(isCurrent()===true,'stale controller generation');lease.check(write);};
    let row=null,status='idle',busy=false,error=null,offer=null,latest=null,staged=null,pump=null,promoting=false;
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
        latestInput:latest?latest.experiment:null});
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
        if(!row){row=await prepare();guard();}
        if(!row){status='empty';return;}
        if(row.draft!==null){
          offer={revision:row.revision,digest:row.digest};
          status='recovering';
        }else status='clean';
      }catch(e){fail(e);throw e;}finally{busy=false;}
    }
    function markDirty(experiment){
      guard(true);
      check(row&&!offer&&!error&&['clean','committed','dirty','saving'].includes(status),
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
    return Object.freeze({open,markDirty,flushCheckpoint,save,draftOffer,loadDraft,state});
  }
  return Object.freeze({FORMAT,VERSION,SHARED_VERSION,SHARED_ID,KINDS,WORKSPACES,empty,emptyShared,normalize,
    select,planRestore,
    sharedExperimentCoordinator,createAtomicExperimentController});
}));

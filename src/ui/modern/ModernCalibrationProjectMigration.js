/* One-time, explicitly invoked legacy Calibration Project adoption.
 * Verified assets are staged before the atomic project+marker transaction.
 * Existing single-draft startup and editor state are left untouched.
 */
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(
    node?require('./ModernCalibrationProject'):root.CurvatureModernCalibrationProject,
    node?require('./ModernCalibrationProjectStore'):root.CurvatureModernCalibrationProjectStore,
    node?require('./ModernCalibrationProjectCheckpoint'):root.CurvatureModernCalibrationProjectCheckpoint);
  if(node)module.exports=api;
  root.CurvatureModernCalibrationProjectMigration=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(model,store,checkpoint){
  'use strict';
  const INLINE_KEY='curvature-calibration-inline-v2';
  const V1_FIELDS=new Set([...checkpoint.DRAFT_FIELDS,'magnifierSessionId']);
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function object(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
  function normalizeLegacy(raw){
    if(!object(raw)||![1,2].includes(raw.version))
      throw Error('Unsupported legacy calibration draft; raw recovery is available');
    if(raw.version===2){
      const saved=clone(raw);
      checkpoint.validateDraft(saved,null);
      return saved;
    }
    if(Object.keys(raw).some(k=>!V1_FIELDS.has(k))||!object(raw.scene)||
       !Array.isArray(raw.rows)||raw.rows.some(r=>!object(r)))
      throw Error('Unknown legacy V1 calibration fields; raw recovery is required');
    const session=raw.physicalSessionId??raw.magnifierSessionId;
    if(typeof session!=='string'||!session)
      throw Error('Legacy calibration has no recoverable physical session identity');
    const rows=items=>items.map(r=>({included:true,...clone(r)}));
    const history=items=>items.map(entry=>{
      if(!object(entry)||!Array.isArray(entry.rows))throw Error('Invalid legacy calibration edit history');
      return {...clone(entry),rows:rows(entry.rows)};
    });
    const draft={version:2,scene:clone(raw.scene),
      record:clone(raw.record??null),activeSource:clone(raw.activeSource??null),
      rows:rows(raw.rows),pending:clone(raw.pending??null),
      pendingModel:clone(raw.pendingModel??null),activePair:raw.activePair??null,
      editing:raw.editing??null,explicitAdd:raw.explicitAdd===true,
      view:clone(raw.view??null),physicalSessionId:session,
      undoStack:history(raw.undoStack??[]),redoStack:history(raw.redoStack??[]),
      selectedOwner:clone(raw.selectedOwner??null),weight:String(raw.weight??'1'),
      freeParameters:clone(raw.freeParameters??[]),fitBest:clone(raw.fitBest??null),
      fitStatus:raw.fitStatus??'Not yet fitted',viewBest:raw.viewBest===true,
      stage:raw.stage??'correspondences',
      resultCamera:raw.resultCamera??'best',
      resultViews:clone(raw.resultViews??{initial:null,best:null}),
      residualMode:raw.residualMode??'off'};
    // Unsupported shapes are *not* silently pruned or changed. A bad old
    // fit/history is a recovery case, not a reason to lose observations.
    checkpoint.validateDraft(draft,null);
    return draft;
  }
  function matchingInline(storage,draft){
    if(!storage||typeof storage.getItem!=='function')return null;
    const text=storage.getItem(INLINE_KEY);
    if(text===null||text===undefined)return null;
    let saved;
    try{saved=JSON.parse(text);}
    catch(error){throw Error('Legacy inline session is corrupt; raw recovery is required');}
    if(!object(saved))throw Error('Legacy inline session is invalid; raw recovery is required');
    if(saved.id!==draft.physicalSessionId||saved.photo!==(draft.record?.id||null))
      return null; // Another session's local view must not be cross-bound.
    checkpoint.validateDraft(draft,saved);
    return clone(saved);
  }
  // Compare JSON values structurally: IndexedDB/validation can change
  // object property order, but array order, all fields and bytes must match.
  function sameJson(a,b){
    if(a===b)return true;
    if(Array.isArray(a)||Array.isArray(b))
      return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&
        a.every((item,i)=>sameJson(item,b[i]));
    if(!object(a)||!object(b))return false;
    const keys=Object.keys(a),other=Object.keys(b);
    return keys.length===other.length&&keys.every(key=>
      Object.hasOwn(b,key)&&sameJson(a[key],b[key]));
  }
  // A harmless startup gate: report what exists without migrating or
  // switching the live editor. Raw recovery remains possible even if
  // the old draft is unsupported or fails scientific validation.
  async function inspect(env){
    if(!env?.indexedDB)throw Error('Calibration migration inspection requires IndexedDB');
    const marker=await store.migrationMarker(env.indexedDB);
    const legacy=await store.legacy(env.indexedDB);
    if(marker){
      const project=await store.get(env.indexedDB,marker.projectId);
      return {status:project?'adopted':'adopted-deleted',
        projectId:marker.projectId,sourceVersion:marker.sourceVersion};
    }
    if(legacy===null)return {status:'empty'};
    try{
      const draft=normalizeLegacy(legacy);
      matchingInline(env.localStorage,draft);
      return {status:'legacy-pending',sourceVersion:legacy.version};
    }catch(error){
      return {status:'recovery-required',sourceVersion:legacy?.version??null,
        reason:String(error.message||error)};
    }
  }
  async function rawRecovery(db){
    // Raw browser draft (including original bytes). Not a portable project
    // format, and intentionally never deleted by migration or Project remove.
    const raw=await store.legacy(db);
    return raw===null?null:JSON.stringify(raw);
  }
  async function checkedExisting(env,existing,adapter,decoder){
    if(existing.status==='already-removed')
      return {status:'already-removed',marker:existing.marker,project:null};
    const record=existing.project||await store.get(env.indexedDB,existing.projectId);
    // A retained marker also outlives an intentionally deleted project.
    // Do not re-adopt the legacy draft or silently recreate that identity.
    // get() already rejects orphan summary rows as storage corruption.
    if(!record)return {status:'already-removed',marker:existing.marker||null,project:null};
    await checkpoint.prepare(record,env,adapter,decoder);
    return {status:'already',marker:existing.marker||null,project:record};
  }
  async function migrate(env,{adapter,decoder,now=Date.now()}={}){
    if(!env?.indexedDB||!env?.crypto)
      throw Error('Calibration migration requires IndexedDB and crypto');
    // This module is not an editor startup hook. Call only when no old v1
    // IndexedDB connection can block the version-2 project-store upgrade.
    const previous=await store.migrationMarker(env.indexedDB);
    if(previous)return checkedExisting(env,{status:'already',projectId:previous.projectId,
      marker:previous},adapter,decoder);
    const raw=await store.legacy(env.indexedDB);
    if(raw===null)return {status:'empty',marker:null,project:null};
    const draft=normalizeLegacy(raw);
    const inline=matchingInline(env.localStorage,draft);
    const parts=await checkpoint.captureVerified(draft,inline,env,adapter,decoder);
    const id=model.createId(env.crypto);
    const title=(draft.record?.title||'Recovered calibration').trim();
    const project=model.fresh({id,title,now,...parts});
    const outcome=await store.adoptLegacy(env.indexedDB,raw,project);
    if(outcome.status!=='migrated')return checkedExisting(env,outcome,adapter,decoder);
    // Read back both committed stores, then verify and hydrate the real
    // original. No editor switch/activation happens, even on failure.
    const durable=await store.get(env.indexedDB,project.id);
    const marker=await store.migrationMarker(env.indexedDB);
    if(!durable||marker?.projectId!==project.id)
      throw Error('Calibration migration commit could not be verified; old draft retained');
    const prepared=await checkpoint.prepare(durable,env,adapter,decoder);
    // Compare the complete validated photo-free contract, not the raw
    // hydrated record's JSON text: ReferenceImage.validate reorders fields,
    // and a reused Library original can have a different thumbnail.
    // The original itself was already independently SHA-256/decode verified.
    const returned=checkpoint.extract(prepared.draft,prepared.inline,
      durable.photo?durable.photo.identity:null);
    if(!sameJson(returned,parts))
      throw Error('Calibration migration round-trip changed saved work; old draft retained');
    return {status:'migrated',marker,project:durable};
  }
  return Object.freeze({INLINE_KEY,normalizeLegacy,matchingInline,rawRecovery,inspect,migrate});
}));
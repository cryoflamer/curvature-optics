/* Explicit Calibration Project CRUD and import actions. Never activate the editor
 * or remove Photo Library / Result Archive assets from these operations.
 */
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(
    node?require('./ModernCalibrationProject'):root.CurvatureModernCalibrationProject,
    node?require('./ModernCalibrationProjectStore'):root.CurvatureModernCalibrationProjectStore,
    node?require('./ModernCalibrationProjectCheckpoint'):root.CurvatureModernCalibrationProjectCheckpoint);
  if(node)module.exports=api;
  root.CurvatureModernCalibrationProjectActions=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(model,store,checkpoint){
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  function sessionId(env){return model.createId(env.crypto);}
  function emptyDraft(snapshot,physicalSessionId){
    const draft={version:2,scene:copy(snapshot),record:null,activeSource:null,
      rows:[],pending:null,pendingModel:null,activePair:null,editing:null,
      explicitAdd:false,view:null,physicalSessionId,undoStack:[],redoStack:[],
      selectedOwner:null,weight:'1',freeParameters:[],fitBest:null,
      fitStatus:'Not yet fitted',viewBest:false,stage:'correspondences',
      resultCamera:'best',resultViews:{initial:null,best:null},residualMode:'off'};
    checkpoint.validateDraft(draft,null);
    return draft;
  }
  function importedDraft(data,physicalSessionId){
    // The editor validates the portable v1/v2/v3 experiment, its fit and
    // observation topology before calling this converter.
    const draft=emptyDraft(data.scene,physicalSessionId);
    draft.record=copy(data.referenceImage);
    draft.activeSource={...(data.referenceSource||{}),key:null,
      links:copy(data.referenceSource?.links||[]),imported:true};
    draft.rows=copy(data.observations);
    draft.freeParameters=copy(data.fit.freeParameters);
    draft.fitBest=copy(data.fit.result);
    draft.fitStatus=data.fit.running?
      'Imported interrupted fit · best saved candidate only':data.fit.status;
    draft.stage=data.fit.result?'result':'correspondences';
    checkpoint.validateDraft(draft,null);
    return draft;
  }
  async function createNew(env,scene,{title='Untitled calibration',storage=store,files=checkpoint,now=Date.now()}={}){
    const draft=emptyDraft(scene,sessionId(env));
    const parts=await files.captureVerified(draft,null,env);
    const project=model.fresh({id:model.createId(env.crypto),title,now,...parts});
    await storage.create(env.indexedDB,project);
    return project;
  }
  async function duplicate(env,id,expectedRevision,{storage=store,files=checkpoint,now=Date.now()}={}){
    model.id(id);
    const source=await storage.get(env.indexedDB,id);
    if(!source||source.revision!==expectedRevision)
      throw Error('Calibration Project changed in another tab; refresh before duplicating');
    // Hydration must verify the existing original before making a second
    // independently editable checkpoint. No raster data are copied to IDB.
    const prepared=await files.prepare(source,env);
    const current=await storage.get(env.indexedDB,id);
    if(!current||current.revision!==source.revision)
      throw Error('Calibration Project changed while preparing its duplicate');
    let parts={photo:source.photo,checkpoint:source.checkpoint,overview:source.overview};
    if(prepared.draft){
      const draft=copy(prepared.draft);
      draft.physicalSessionId=sessionId(env);
      const inline=prepared.inline?{...copy(prepared.inline),id:draft.physicalSessionId}:null;
      parts=files.extract(draft,inline,source.photo?.identity??null);
    }
    const title=source.title.slice(0,153).trimEnd()+' (copy)';
    // Archive links are references, never cloned or deleted. Their IDs remain
    // independent per project; only the editable checkpoint is duplicated.
    const project=model.fresh({id:model.createId(env.crypto),title,now,...parts,
      resultIds:source.resultIds});
    await storage.create(env.indexedDB,project);
    return project;
  }
  async function importAsNew(env,validatedExperiment,{title='Imported calibration',storage=store,
      files=checkpoint,now=Date.now()}={}){
    const draft=importedDraft(validatedExperiment,sessionId(env));
    // Verified original is staged asset-first, before the atomic project row.
    // Active calibration/editor and its legacy recovery draft are untouched.
    const parts=await files.captureVerified(draft,null,env);
    const project=model.fresh({id:model.createId(env.crypto),title,now,...parts});
    await storage.create(env.indexedDB,project);
    return project;
  }
  async function saveDraftAsNew(env,draft,inline=null,{title='Recovered calibration',
      storage=store,files=checkpoint,now=Date.now()}={}){
    // A first-class current-draft recovery, independent of one-time Legacy
    // migration and the subset of data carried by a portable experiment.
    files.validateDraft(draft,inline);
    const parts=await files.captureVerified(copy(draft),inline===null?null:copy(inline),env);
    const project=model.fresh({id:model.createId(env.crypto),title,now,...parts});
    await storage.create(env.indexedDB,project);
    // A successful transaction alone is not a verified recovery: reread the
    // same row and ensure its original can still be hydrated from the Library.
    const durable=await storage.get(env.indexedDB,project.id);
    if(!durable||durable.revision!==project.revision||
       durable.photo?.identity.sha256!==project.photo?.identity.sha256)
      throw Error('Recovered calibration project could not be verified after save');
    await files.prepare(durable,env);
    return durable;
  }
  return Object.freeze({emptyDraft,importedDraft,createNew,duplicate,importAsNew,saveDraftAsNew});
}));

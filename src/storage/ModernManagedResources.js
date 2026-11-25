/* Opt-in domain adapters. No production store routing or automatic migration. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernManagedResources=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SNAPSHOT='experiment-snapshot',ORIGINAL='original-image',OBSERVATION='reference-observation',ANIMATION='animation-project',RESULT='calibration-result',CALIBRATION='calibration-project',
    DRAFTS='animation-working-collection',CALIBRATION_RECEIPT='calibration-selection-receipt';
  const check=(ok,message)=>{if(!ok)throw Error('Managed Resources: '+message);};
  const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
  const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&
    Object.keys(v).length===keys.length&&keys.every(k=>own(v,k));
  const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?
    Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  const same=(a,b)=>stable(a)===stable(b);
  const objectId=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(v);
  const positive=v=>Number.isSafeInteger(v)&&v>0;
  const nonnegative=v=>Number.isSafeInteger(v)&&v>=0;
  const strong=(slot,target)=>({slot,target,strength:'strong'});
  function aliases(project){
    return [...new Set(project.keyframes.flatMap(frame=>frame.referenceImageIds||[]))].sort();
  }
  function calibrationOrigins(project){
    return [project.baseExperiment,...(project.mode==='experimental'?project.keyframes.map(frame=>frame.value):[])]
      .map(experiment=>experiment.calibrationOrigin).filter(Boolean);
  }
  // The acknowledged shared collection is one revisioned owner. Inactive
  // workspaces and pending journals are included, never only the selected one.
  function draftInventory(row){
    const photos=new Set(),origins=[];
    function physical(experiment){
      if(experiment.calibrationOrigin)origins.push(experiment.calibrationOrigin);
    }
    for(const workspace of row.collection.workspaces){
      const draft=workspace.checkpoint.draft;
      // A V2 contract owns its reference experiment even before the first
      // frame exists (and in experimental mode it may differ from all frames).
      if(draft.contract)physical(draft.contract.referenceExperiment);
      for(const frame of draft.frames){
        physical(frame.experiment);
        for(const id of frame.referenceImageIds||[])photos.add(id);
      }
    }
    if(row.namedSave)for(const record of [row.namedSave.plan.before,row.namedSave.plan.after]){
      for(const alias of aliases(record.project))photos.add(alias);
      origins.push(...calibrationOrigins(record.project));
    }
    if(row.keyframeEdit){
      const edit=row.keyframeEdit.session;
      for(const experiment of [edit.original,edit.workspace,edit.candidate,...edit.past,...edit.future])
        physical(experiment);
      if(row.keyframeEdit.history)physical(row.keyframeEdit.history.experiment);
    }
    return {photos:[...photos].sort(),origins,results:[...new Set(origins.map(o=>o.resultId))].sort()};
  }
  function create(env,deps=env){
    const core=deps.CurvatureModernManagedObjectStore,state=deps.CurvatureModernExperimentState,
      history=deps.CurvatureModernExperimentHistory,fp=deps.CurvatureModernExperimentFingerprint,
      images=deps.CurvatureModernReferenceImage,importer=deps.CurvatureModernReferenceImageImport,
      library=deps.CurvatureModernReferenceImageLibrary,
      projects=deps.CurvatureModernAnimationProject,animations=deps.CurvatureModernAnimationLibrary,
      results=deps.CurvatureModernCalibrationResult,archiveApi=deps.CurvatureModernCalibrationResultArchive,
      calibrations=deps.CurvatureModernCalibrationProject,projectStore=deps.CurvatureModernCalibrationProjectStore,
      checkpoints=deps.CurvatureModernCalibrationProjectCheckpoint,
      session=deps.CurvatureModernSessionAutosave,sessionContract=deps.CurvatureModernDocumentSession,
      drafts=deps.CurvatureModernAnimationDraftAutosave;
    check(core&&state&&history&&fp&&images&&importer&&library,'domain dependencies required');
    const types=[
      {type:SNAPSHOT,version:1,validate:v=>{
        if(!exact(v,['experiment','evidence']))return false;
        const e=state.validate(v.experiment);
        return same(e,v.experiment)&&(!e.calibrationOrigin?v.evidence==='none':
          v.evidence==='standalone'||(exact(v.evidence,['result'])&&objectId(v.evidence.result)));
      },references:v=>typeof v.evidence==='object'?[strong('calibration',v.evidence.result)]:[]},
      {type:ORIGINAL,version:1,validate:v=>exact(v,['identity','blob'])&&
        same(images.validateIdentity(v.identity),v.identity)&&v.blob instanceof Blob&&
        v.blob.size>0&&v.blob.size<=images.MAX_ORIGINAL_BYTES&&
        /^image\/(png|jpeg|webp)$/.test(v.blob.type),references:()=>[]},
      {type:OBSERVATION,version:1,validate:v=>exact(v,['id','attribution','originalId','identity','thumbnail'])&&
        images.validId(v.id)===v.id&&same(images.validateAttribution(v.attribution),v.attribution)&&
        objectId(v.originalId)&&same(images.validateIdentity(v.identity),v.identity)&&
        (v.thumbnail===null||same(images.validateThumbnail(v.thumbnail),v.thumbnail)),
        references:v=>[strong('original',v.originalId)]}
    ];
    function calibrationAliases(project){
      return [...new Set(calibrationOrigins(project).map(origin=>origin.resultId))].sort();
    }
    function validAnimationEvidence(project,evidence){
      const ids=calibrationAliases(project);
      return !ids.length?evidence==='none':evidence==='standalone'||
        (Array.isArray(evidence)&&evidence.length===ids.length&&evidence.every((entry,i)=>
          exact(entry,['alias','target'])&&entry.alias===ids[i]&&objectId(entry.target)));
    }
    if(projects&&animations)types.push({type:ANIMATION,version:1,validate:v=>{
      if(!exact(v,['project','observations','evidence']))return false;
      const project=projects.validate(v.project);
      const ids=aliases(project);
      return same(project,v.project)&&Array.isArray(v.observations)&&
        v.observations.length===ids.length&&v.observations.every((entry,i)=>
          exact(entry,['alias','target'])&&entry.alias===ids[i]&&objectId(entry.target))&&
        validAnimationEvidence(project,v.evidence);
    },references:v=>[
      ...v.observations.map(entry=>strong('photo:'+entry.alias,entry.target)),
      ...(Array.isArray(v.evidence)?v.evidence.map(entry=>strong('result:'+entry.alias,entry.target)):[])
    ]});
    if(results)types.push({type:RESULT,version:1,validate:v=>exact(v,['record','originalId'])&&
      same(results.validate(v.record),v.record)&&objectId(v.originalId),
      references:v=>[strong('original',v.originalId)]});
    if(calibrations&&checkpoints)types.push({type:CALIBRATION,version:1,validate:v=>{
      if(!exact(v,['project','originalId','results']))return false;
      const project=calibrations.normalize(v.project);
      return same(project,v.project)&&(project.photo?objectId(v.originalId):v.originalId===null)&&
        Array.isArray(v.results)&&v.results.length===project.resultIds.length&&
        v.results.every((entry,i)=>exact(entry,['alias','target'])&&entry.alias===project.resultIds[i]&&objectId(entry.target));
    },references:v=>[
      ...(v.originalId?[strong('original',v.originalId)]:[]),
      ...v.results.map(entry=>strong('result:'+entry.alias,entry.target))
    ]});
    function mapped(entries,ids,standalone=false){
      return Array.isArray(entries)&&entries.length===ids.length&&entries.every((entry,i)=>
        exact(entry,['alias','target'])&&entry.alias===ids[i]&&
        (objectId(entry.target)||(standalone&&entry.target===null)));
    }
    if(drafts&&projects&&animations)types.push({type:DRAFTS,version:1,validate:v=>{
      if(!exact(v,['row','observations','evidence']))return false;
      const row=drafts.normalizeSharedRow(v.row),inventory=draftInventory(row);
      return mapped(v.observations,inventory.photos)&&mapped(v.evidence,inventory.results,true);
    },references:v=>[
      ...v.observations.map(entry=>strong('photo:'+entry.alias,entry.target)),
      ...v.evidence.filter(entry=>entry.target!==null).map(entry=>strong('result:'+entry.alias,entry.target))
    ]});
    const store=core.create(env,{types});
    const historyId=id=>{check(positive(id),'invalid History alias');return 'history:'+id;};
    const observationId=id=>'observation:'+images.validId(id);
    function pick(graph,slot,type){
      const ref=graph.document.references.find(e=>e.slot===slot);
      const value=ref&&ref.strength==='strong'&&graph.resources.find(r=>r.id===ref.target);
      check(value&&value.type===type&&value.version===1,'missing or incorrect '+slot+' resource');
      return value;
    }
    function historyFields(row){
      check(row&&positive(row.id)&&row.version===history.VERSION&&nonnegative(row.createdAt)&&
        ['manual','auto','recovery'].includes(row.source)&&typeof row.pinned==='boolean'&&
        typeof row.name==='string'&&typeof row.description==='string','invalid History row');
      const item=history.parsePortable(history.exportPortable([row]))[0];
      check(!row.thumbnail||item.thumbnail,'invalid History thumbnail');
      return {item,metadata:{id:row.id,version:row.version,createdAt:row.createdAt,
        source:row.source,pinned:item.pinned,name:item.name,description:item.description,
        thumbnail:item.thumbnail}};
    }
    async function prepareHistory(row,{expectedRevision=0,snapshotId,standalone=false,handoff=null}={}){
      const {item,metadata}=historyFields(row),experiment=item.experiment;
      const prior=expectedRevision===0?null:await readHistory(row.id);
      check(expectedRevision===0||prior?.managedRevision===expectedRevision,'History revision conflict');
      let evidence='none';
      if(experiment.calibrationOrigin){
        const retained=prior&&same(prior.row.experiment.calibrationOrigin,experiment.calibrationOrigin);
        if(retained&&typeof prior.evidence==='object'){
          check(standalone!==true,'verified calibration evidence cannot be downgraded');
          evidence=prior.evidence;
        }else if(retained&&prior.evidence==='standalone')evidence='standalone';
        else if(handoff){
          check(!standalone&&same(handoff.experiment.calibrationOrigin,experiment.calibrationOrigin),
            'History handoff origin mismatch');
          evidence=handoff.evidence;
          if(typeof evidence==='object')checkOrigin(experiment.calibrationOrigin,await store.get(evidence.result));
          else check(evidence==='standalone','invalid History handoff evidence');
          if(same(handoff.experiment,experiment))snapshotId=handoff.id;
        }else evidence=standalone===true?'standalone':{result:await resolveOrigin(experiment.calibrationOrigin)};
      }
      const payload={experiment,evidence};
      // A metadata-only edit does not allocate another immutable snapshot.
      if(snapshotId===undefined&&prior&&same(prior.row.experiment,experiment)&&same(prior.evidence,evidence))
        snapshotId=prior.snapshotId;
      const id=snapshotId??store.newObjectId();
      let resources=[];
      if(snapshotId!==undefined){
        const previous=await store.get(id);
        check(previous&&previous.type===SNAPSHOT&&same(previous.payload,payload),
          'snapshot reuse requires identical complete experiment');
      }else resources=[{id,type:SNAPSHOT,version:1,payload}];
      return {snapshotId:id,plan:{documentId:historyId(row.id),kind:'history',
        expectedRevision,metadata,references:[strong('snapshot',id)],resources},
        row:historyRow(metadata,experiment)};
    }
    async function saveHistory(row,options){
      const prepared=await prepareHistory(row,options);
      const document=await store.writeDocument(prepared.plan);
      return {snapshotId:prepared.snapshotId,managedRevision:document.revision};
    }
    function historyRow(metadata,experiment){
      return {...metadata,experiment,signature:fp.exactSignature(experiment),
        physicalSignature:fp.physicalSignature(experiment),features:fp.features(experiment)};
    }
    function historyInventory(entries){
      return {kind:'history',documents:entries.map(({row,managedRevision})=>
        ({id:historyId(row.id),revision:managedRevision}))};
    }
    function portableHistoryItems(items){
      return history.parsePortable(JSON.stringify({format:history.PORTABLE_FORMAT,version:1,snapshots:items}));
    }
    // The UI save contract: adjacent automatic deduplication, deliberate
    // saves reusing any matching entry, and conservative capacity refusal.
    // Even an unchanged match is checked inside the final transaction.
    async function recordHistory(experiment,source,thumbnail,{now=Date.now,maxAutoEntries=history.MAX_AUTO,guard=()=>{}}={}){
      check(['manual','auto','recovery'].includes(source),'invalid History source');
      check(Number.isInteger(maxAutoEntries)&&maxAutoEntries>=1&&maxAutoEntries<=10000,'invalid auto-history limit');
      const naming=deps.CurvatureModernSemanticNaming;
      check(naming,'History naming adapter unavailable');
      const snapshot=state.validate(experiment),signature=fp.exactSignature(snapshot);
      const item=portableHistoryItems([{experiment:snapshot,thumbnail:thumbnail||null}])[0];
      const existing=await listHistory(),expectedInventory=historyInventory(existing);
      const match=source==='auto'?(existing[0]?.row.signature===signature?existing[0]:null):
        existing.find(v=>v.row.signature===signature);
      if(match){
        const row={...match.row};
        if(source!=='auto'&&!row.pinned){row.pinned=true;row.source=source;}
        if(item.thumbnail&&!row.thumbnail)row.thumbnail=item.thumbnail;
        if(same(row,match.row)){
          await store.writeDocuments([],{expectedInventory,guard});
          return {created:false,entry:match.row,managedRevision:match.managedRevision};
        }
        const next=await prepareHistory(row,{expectedRevision:match.managedRevision});
        const [document]=await store.writeDocuments([next.plan],{expectedInventory,guard});
        return {created:false,entry:next.row,managedRevision:document.revision};
      }
      if(source==='auto'&&existing.filter(v=>v.row.source==='auto'&&!v.row.pinned).length>=maxAutoEntries){
        await store.writeDocuments([],{expectedInventory,guard});
        return {created:false,entry:null,skipped:'capacity'};
      }
      const id=await suggestHistoryId();
      const inventories=[expectedInventory];
      let handoff=null;
      if(snapshot.calibrationOrigin&&session&&sessionContract){
        const working=await readWorkingCheckpoint();
        if(working){
          const candidates=['committed','draft'].map(slot=>({
            experiment:slot==='committed'?working.row.experiment:working.row.draft,
            ref:working.snapshots[slot]})).filter(v=>v.experiment&&
              same(v.experiment.calibrationOrigin,snapshot.calibrationOrigin));
          const chosen=candidates.find(v=>typeof v.ref.evidence==='object'&&same(v.experiment,snapshot))??
            candidates.find(v=>typeof v.ref.evidence==='object')??
            candidates.find(v=>same(v.experiment,snapshot));
          if(chosen){
            handoff={experiment:chosen.experiment,id:chosen.ref.id,evidence:chosen.ref.evidence};
            inventories.push({kind:'working-checkpoint',documents:[{id:workingId,revision:working.managedRevision}]});
          }
        }
      }
      const next=await prepareHistory({id,version:history.VERSION,createdAt:now(),source,pinned:source!=='auto',
        name:naming.snapshot(snapshot),description:'',thumbnail:item.thumbnail,experiment:snapshot},{handoff});
      const [document]=await store.writeDocuments([next.plan],{expectedInventory:inventories,guard});
      return {created:true,entry:next.row,managedRevision:document.revision};
    }
    // Portable import retains the legacy name/notes deduplication contract.
    // All new and changed owners commit together; no-op matches also take
    // part in the inventory CAS. Missing foreign fit evidence is explicitly
    // standalone, while a present but inconsistent archive is a hard error.
    async function importHistory(items,{now=Date.now,guard=()=>{}}={}){
      const prepared=portableHistoryItems(items);
      const existing=await listHistory(),expectedInventory=historyInventory(existing);
      const records=existing.map(v=>({...v,row:{...v.row}})),changed=new Map();
      let id=await suggestHistoryId(),created=0,reused=0;
      for(const item of prepared){
        const signature=fp.exactSignature(item.experiment);
        const match=records.find(v=>v.row.signature===signature&&
          v.row.name===item.name&&v.row.description===item.description);
        if(match){
          reused++;
          const before={...match.row};
          if(match.row.source==='auto')match.row.source='manual';
          if(item.pinned)match.row.pinned=true;
          if(item.thumbnail&&!match.row.thumbnail)match.row.thumbnail=item.thumbnail;
          if(!same(before,match.row))changed.set(match.row.id,match);
          continue;
        }
        check(positive(id),'History ID exhausted');
        const row={...item,id:id++,version:history.VERSION,createdAt:item.createdAt??now(),source:'manual',signature};
        const value={row,managedRevision:0};
        records.push(value);changed.set(row.id,value);created++;
      }
      const plans=[];
      for(const {row,managedRevision} of changed.values()){
        const origin=row.experiment.calibrationOrigin;
        const standalone=managedRevision===0&&!!origin&&!(await readCalibrationResult(origin.resultId));
        const next=await prepareHistory(row,{expectedRevision:managedRevision,standalone});
        plans.push(next.plan);
      }
      await store.writeDocuments(plans,{expectedInventory,guard});
      return {created,reused};
    }
    // Exact managed revisions are sufficient for atomic gallery pinning.
    // Retain the legacy protection policy for recovery and unpinned auto
    // snapshots. No physical state or archive mapping is rewritten.
    async function setHistoryPinned(entries,pinned,{guard=()=>{}}={}){
      check(typeof pinned==='boolean'&&Array.isArray(entries)&&entries.length>0,'explicit History pin batch required');
      const plans=[],updated=[];
      for(const {id,managedRevision} of entries){
        const current=await readHistory(id);
        check(current&&positive(managedRevision)&&current.managedRevision===managedRevision,
          'History revision conflict');
        check(pinned||current.row.source!=='recovery','Recovery snapshot must remain protected');
        const row={...current.row,pinned};
        if(!pinned&&current.row.pinned&&row.source==='auto')row.source='manual';
        const {metadata}=historyFields(row);
        plans.push({documentId:historyId(id),kind:'history',expectedRevision:managedRevision,
          metadata,references:[strong('snapshot',current.snapshotId)]});
        updated.push(row);
      }
      const documents=await store.writeDocuments(plans,{guard});
      return updated.map((row,i)=>({row,managedRevision:documents[i].revision}));
    }
    async function readHistory(id){
      const graph=await store.readDocumentGraph(historyId(id));
      if(!graph)return null;
      check(graph.document.kind==='history'&&graph.document.references.length===1,'invalid History root');
      const snapshot=pick(graph,'snapshot',SNAPSHOT);
      const row={...graph.document.metadata,experiment:snapshot.payload.experiment};
      check(row.id===id,'History alias mismatch');
      if(typeof snapshot.payload.evidence==='object'){
        const result=graph.resources.find(r=>r.id===snapshot.payload.evidence.result);
        checkOrigin(row.experiment.calibrationOrigin,result);
        await verifyResultOriginal(graph,result);
      }
      const {item,metadata}=historyFields(row);
      return {row:historyRow(metadata,item.experiment),
        snapshotId:snapshot.id,managedRevision:graph.document.revision,evidence:snapshot.payload.evidence};
    }
    // The existing protected History UI expects rows and exact displayed
    // records, not a separate managed envelope. Keep the revision attached
    // to every returned row and fail closed on unsupported legacy methods.
    function createHistoryPort({now=Date.now,maxAutoEntries=history.MAX_AUTO}={}){
      check(typeof now==='function'&&Number.isInteger(maxAutoEntries)&&maxAutoEntries>=1&&
        maxAutoEntries<=10000,'invalid History port options');
      const asRow=value=>value?{...value.row,managedRevision:value.managedRevision}:null;
      async function exactRow(expected){
        check(expected&&positive(expected.id)&&positive(expected.managedRevision),
          'exact managed History record required');
        const current=await readHistory(expected.id);
        check(current&&same(asRow(current),expected),'History snapshot changed; refresh before editing');
        return current;
      }
      async function updateMetadataExact(expected,name,description,guard=()=>{}){
        const current=await exactRow(expected);
        const row={...current.row,name,description};
        const {metadata}=historyFields(row);
        if((metadata.name||metadata.description)&&row.source==='auto')row.source='manual';
        const next=await prepareHistory(row,{expectedRevision:current.managedRevision});
        const [document]=await store.writeDocuments([next.plan],{guard});
        return asRow({row:next.row,managedRevision:document.revision});
      }
      async function setPinnedExact(expected,pinned,guard=()=>{}){
        check(Array.isArray(expected)&&expected.length>0,'exact managed History records required');
        const entries=[];
        for(const row of expected){
          const current=await exactRow(row);
          entries.push({id:current.row.id,managedRevision:current.managedRevision});
        }
        return (await setHistoryPinned(entries,pinned,{guard})).map(asRow);
      }
      async function record(experiment,source,thumbnail,{guard=()=>{}}={}){
        const {managedRevision,entry,...result}=await recordHistory(experiment,source,thumbnail,{now,maxAutoEntries,guard});
        return {...result,entry:asRow(entry?{row:entry,managedRevision}:null)};
      }
      const rejectManagement=async()=>{throw Error('Managed History deletion or non-revisioned management is disabled');};
      const rejectMigration=async()=>{throw Error('Managed History requires coordinated cutover; legacy migration is disabled');};
      return Object.freeze({
        storageKind:'managed',coordination:store.coordination,
        open:()=>store.listDocuments('history'),
        list:async()=>(await listHistory()).map(asRow),
        get:async id=>asRow(await readHistory(Number(id))),
        record,importEntries:(items,guard=()=>{})=>importHistory(items,{now,guard}),
        updateMetadataExact,setPinnedExact,
        updateMetadata:rejectManagement,pin:rejectManagement,remove:rejectManagement,
        clearAll:rejectManagement,clearAuto:rejectManagement,
        migrateLegacy:rejectMigration,migrationReceipt:rejectMigration
      });
    }
    function attribution(record){
      const {id,version,original,thumbnail,...rest}=record;
      return images.validateAttribution(rest);
    }
    function classification(row){
      check(positive(row.revision),'invalid observation revision');
      const annotationRevision=row.annotationRevision??0;
      check(nonnegative(annotationRevision),'invalid classification revision');
      const value=library.annotation({kind:row.kind??'unclassified',tags:row.tags??[],collections:row.collections??[]});
      check(annotationRevision>0||same(value,library.annotation({})),'unversioned classification');
      return {...value,annotationRevision};
    }
    async function originalFrom(record){
      // The existing decoder certifies raster dimensions before hashing.
      const identity=await importer.identify(record,env);
      const comma=record.original.dataUrl.indexOf(',');
      const mime=record.original.dataUrl.slice(5,comma).split(';')[0];
      const bytes=Uint8Array.from(atob(record.original.dataUrl.slice(comma+1)),c=>c.charCodeAt(0));
      return {identity,blob:new Blob([bytes],{type:mime})};
    }
    async function bytesEqual(a,b){
      if(a.size!==b.size||a.type!==b.type)return false;
      const left=new Uint8Array(await a.arrayBuffer()),right=new Uint8Array(await b.arrayBuffer());
      return left.every((byte,i)=>byte===right[i]);
    }
    async function prepareObservation(row,{expectedRevision=0,originalId,verified=null,stagedOriginals=null}={}){
      check(row&&row.record,'observation row required');
      const record=images.validate(row.record);
      check(record.id===row.id,'observation alias mismatch');
      const metadata={id:row.id,revision:row.revision,...classification(row)};
      const original=verified??await originalFrom(record);
      const binaryId=originalId??store.newObjectId();
      const resources=[];
      if(originalId!==undefined){
        const previous=stagedOriginals?.get(binaryId)??await store.get(binaryId);
        check(previous&&previous.type===ORIGINAL&&same(previous.payload.identity,original.identity)&&
          await bytesEqual(previous.payload.blob,original.blob),'original reuse requires verified identical bytes');
      }else{
        const resource={id:binaryId,type:ORIGINAL,version:1,payload:original};
        resources.push(resource);stagedOriginals?.set(binaryId,resource);
      }
      const id=store.newObjectId();
      resources.push({id,type:OBSERVATION,version:1,payload:{id:record.id,attribution:attribution(record),
        originalId:binaryId,identity:original.identity,thumbnail:record.thumbnail??null}});
      return {row:{...metadata,record},observationId:id,originalId:binaryId,
        plan:{documentId:observationId(row.id),kind:'observation',
          expectedRevision,metadata,references:[strong('observation',id)],resources}};
    }
    async function saveObservation(row,options){
      const next=await prepareObservation(row,options);
      const document=await store.writeDocument(next.plan);
      return {observationId:next.observationId,originalId:next.originalId,managedRevision:document.revision};
    }
    // Application operations use one verified gallery inventory and commit
    // quota, allocation, reuse and revisions against that same inventory.
    async function observationInventory(){
      return (await listVerified('observation',readObservation,observationId,v=>v,
        (a,b)=>a.row.id.localeCompare(b.row.id))).map(v=>v.row);
    }
    function observationExpected(existing){
      return {kind:'observation',documents:existing.map(v=>({id:observationId(v.row.id),
        revision:v.managedRevision}))};
    }
    function observationQuota(rows){
      library.quota(rows.map(({id,revision,record})=>({id,revision,record})));
      library.annotationQuota(rows.filter(r=>r.annotationRevision>0).map(r=>({
        id:r.id,revision:r.annotationRevision,kind:r.kind,tags:r.tags,collections:r.collections})));
    }
    async function matchingObservation(existing,original,stagedOriginals=null){
      let found=null;
      for(const value of existing){
        const resource=stagedOriginals?.get(value.originalId)??await store.get(value.originalId);
        check(resource?.type===ORIGINAL,'observation original unavailable');
        if(resource.payload.identity.sha256!==original.identity.sha256)continue;
        check(same(resource.payload.identity,original.identity)&&
          await bytesEqual(resource.payload.blob,original.blob),'reference photo identity collision or inconsistent raster');
        if(!found)found=value;
      }
      return found;
    }
    async function createObservation(record,{guard=()=>{}}={}){
      const source=images.validate(record),original=await originalFrom(source);
      const existing=await observationInventory(),expectedInventory=observationExpected(existing);
      check(!existing.some(v=>v.row.id===source.id),'Observation ID already exists');
      const match=await matchingObservation(existing,original);
      const next=await prepareObservation({id:source.id,revision:1,record:source},
        {originalId:match?.originalId,verified:original});
      observationQuota([...existing.map(v=>v.row),next.row]);
      const [document]=await store.writeDocuments([next.plan],{expectedInventory,guard});
      return {row:next.row,observationId:next.observationId,originalId:next.originalId,managedRevision:document.revision};
    }
    // Calibration ingestion reuses the original observation without changing
    // its attribution; the caller still gets the separate incoming source.
    async function prepareObservationIngestion(record){
      const source=images.validate(record),original=await originalFrom(source);
      const existing=await observationInventory(),expectedInventory=observationExpected(existing);
      const match=await matchingObservation(existing,original);
      if(match){
        return {identity:original.identity,row:match.row,source,reused:true,
          originalId:match.originalId,managedRevision:match.managedRevision,expectedInventory,plan:null};
      }
      const reserved=new Set((await store.listDocuments('observation',{includeDeleted:true})).map(v=>v.id));
      let id=source.id,attempts=0;
      while(reserved.has(observationId(id))){
        check(++attempts<=100,'Cannot allocate reference image ID');id=library.makeId(env.crypto);
      }
      const next=await prepareObservation({id,revision:1,record:{...source,id}},{verified:original});
      observationQuota([...existing.map(v=>v.row),next.row]);
      return {identity:original.identity,row:next.row,source,reused:false,
        originalId:next.originalId,expectedInventory,plan:next.plan};
    }
    async function ensureObservationOriginal(record,{guard=()=>{}}={}){
      const {plan,expectedInventory,...value}=await prepareObservationIngestion(record);
      const [document]=await store.writeDocuments(plan?[plan]:[],{expectedInventory,guard});
      return {...value,managedRevision:document?.revision??value.managedRevision};
    }
    function retainedObservationPlan(row,current){
      const metadata={id:row.id,revision:row.revision,...classification(row)};
      return {row:{...metadata,record:row.record},observationId:current.observationId,originalId:current.originalId,
        plan:{documentId:observationId(row.id),kind:'observation',expectedRevision:current.managedRevision,
          metadata,references:[strong('observation',current.observationId)]}};
    }
    async function updateObservationDetails(id,expectedRevision,expectedAnnotation,metadata,values,{guard=()=>{}}={}){
      check(positive(expectedRevision)&&nonnegative(expectedAnnotation),'invalid expected observation revisions');
      const existing=await observationInventory(),expectedInventory=observationExpected(existing);
      const current=existing.find(v=>v.row.id===id);
      check(current&&current.row.revision===expectedRevision,'Observation changed or was removed; reload before editing');
      check(current.row.annotationRevision===expectedAnnotation,'Image classification changed; reload before saving');
      const wanted=library.annotation(values),old=library.annotation({kind:current.row.kind,
        tags:current.row.tags,collections:current.row.collections});
      const row={...current.row,...wanted,revision:expectedRevision+1,
        annotationRevision:expectedAnnotation+(same(wanted,old)?0:1),
        record:library.edited(current.row.record,metadata)};
      const next=same(row.record,current.row.record)?retainedObservationPlan(row,current):
        await prepareObservation(row,{expectedRevision:current.managedRevision,originalId:current.originalId});
      observationQuota(existing.map(v=>v.row.id===id?next.row:v.row));
      const [document]=await store.writeDocuments([next.plan],{expectedInventory,guard});
      return {row:next.row,observationId:next.observationId,originalId:next.originalId,managedRevision:document.revision};
    }
    async function setObservationAnnotation(id,expectedAnnotation,values,{guard=()=>{}}={}){
      check(nonnegative(expectedAnnotation),'invalid expected annotation revision');
      const existing=await observationInventory(),expectedInventory=observationExpected(existing);
      const current=existing.find(v=>v.row.id===id);
      check(current&&current.row.annotationRevision===expectedAnnotation,'Image classification changed or was removed; reload before saving');
      const row={...current.row,...library.annotation(values),annotationRevision:expectedAnnotation+1};
      const next=retainedObservationPlan(row,current);
      observationQuota(existing.map(v=>v.row.id===id?next.row:v.row));
      const [document]=await store.writeDocuments([next.plan],{expectedInventory,guard});
      return {row:next.row,observationId:next.observationId,originalId:next.originalId,managedRevision:document.revision};
    }
    // Portable assets and library backups share one merge planner. Every
    // incoming original is decoded and verified before any root mutation.
    // Local aliases are never overwritten or recycled after retirement.
    async function mergeObservationRecords(input,annotations,{guard=()=>{}}={}){
      const incoming=images.validateCollection(input),verified=new Map();
      for(const record of incoming)verified.set(record.id,await originalFrom(record));
      const existing=await observationInventory(),expectedInventory=observationExpected(existing);
      const all=[...existing],byId=new Map(all.map(v=>[v.row.id,v]));
      const occupied=new Set((await store.listDocuments('observation',{includeDeleted:true})).map(v=>v.id));
      const reserved=new Set(incoming.map(r=>r.id)),used=new Set(),mapping=new Map();
      const created=new Map(),updates=new Map(),stagedOriginals=new Map();
      function content(record){const {id,...rest}=record;return rest;}
      function equalRecord(a,b){return same(content(a),content(b));}
      for(const record of incoming){
        let id=record.id,current=byId.get(id);
        if(current&&!equalRecord(current.row.record,record)||!current&&occupied.has(observationId(id))){
          const match=all.find(v=>!reserved.has(v.row.id)&&!used.has(v.row.id)&&equalRecord(v.row.record,record));
          if(match)id=match.row.id;
          else{
            let attempts=0;
            do{
              check(++attempts<=100,'Cannot allocate reference image alias');
              id=library.makeId(env.crypto);
            }while(occupied.has(observationId(id))||reserved.has(id));
          }
        }
        if(!byId.has(id)){
          const original=verified.get(record.id),match=await matchingObservation(all,original,stagedOriginals);
          const next=await prepareObservation({id,revision:1,record:{...record,id}},
            {originalId:match?.originalId,verified:original,stagedOriginals});
          all.push(next);byId.set(id,next);created.set(id,next);occupied.add(observationId(id));
        }
        mapping.set(record.id,id);used.add(id);
      }
      let annotationsAdded=0;
      for(const [sourceId,value] of annotations){
        const id=mapping.get(sourceId),current=byId.get(id);
        check(current,'orphaned backup classification');
        if(current.row.annotationRevision>0)continue;
        const row={...current.row,...library.annotation({kind:value.kind,tags:value.tags,collections:value.collections}),
          annotationRevision:1};
        if(created.has(id)){
          const metadata={id,revision:row.revision,...classification(row)};
          const next={...current,row,plan:{...current.plan,metadata}};
          created.set(id,next);byId.set(id,next);
        }else{
          const next=retainedObservationPlan(row,current);
          updates.set(id,next);byId.set(id,next);
        }
        annotationsAdded++;
      }
      observationQuota([...byId.values()].map(v=>v.row));
      const plans=[...created.values(),...updates.values()].map(v=>v.plan);
      await store.writeDocuments(plans,{expectedInventory,guard});
      return {mapping,created:created.size,annotationsAdded};
    }
    async function importObservationAssets(records,options){
      return (await mergeObservationRecords(records,new Map(),options)).mapping;
    }
    async function exportObservationBackup(){
      const existing=await observationInventory();
      const backup={format:'curvature-image-library-backup',version:1,
        observations:existing.map(({row:{id,revision,record}})=>({id,revision,record})),
        annotations:existing.filter(v=>v.row.annotationRevision>0).map(({row:r})=>({
          id:r.id,revision:r.annotationRevision,kind:r.kind,tags:r.tags,collections:r.collections}))};
      library.validateBackup(backup);
      return backup;
    }
    async function restoreObservationBackup(backup,options){
      const {rows,annotations}=library.validateBackup(backup);
      return mergeObservationRecords(rows.map(r=>r.record),annotations,options);
    }
    // A cache belongs to one immutable graph closure only. Never retain
    // verification across transactions or trust an alias as binary identity.
    async function verifiedOriginal(original,cache){
      check(original?.type===ORIGINAL,'missing original resource');
      if(cache?.has(original.id))return cache.get(original.id);
      const {identity,blob}=original.payload;
      const verified=await importer.verifyOriginalBlob(blob,env);
      check(same(verified.identity,identity),'original evidence digest mismatch');
      if(cache)cache.set(original.id,verified);
      return verified;
    }
    async function materializeOriginal(original,id,attribution,thumbnail=null,cache){
      const verified=await verifiedOriginal(original,cache);
      const {identity,blob}=original.payload;
      if(!verified.dataUrl)verified.dataUrl=importer.dataUrl(verified.bytes,blob.type.slice(6));
      return images.validate({id,version:images.VERSION,...attribution,
        original:{dataUrl:verified.dataUrl,width:identity.width,height:identity.height},
        ...(thumbnail?{thumbnail}:{})});
    }
    async function materializeObservation(graph,observation,cache,hydrate=true){
      const v=observation.payload;
      const original=graph.resources.find(r=>r.id===v.originalId);
      check(original?.type===ORIGINAL&&same(original.payload.identity,v.identity),'observation evidence mismatch');
      if(!hydrate){await verifiedOriginal(original,cache);return null;}
      return materializeOriginal(original,v.id,v.attribution,v.thumbnail,cache);
    }
    async function readObservation(id){
      return loadObservation(await store.readDocumentGraph(observationId(id)),id);
    }
    async function inspectObservation(id){
      return loadObservation(await store.inspectDocumentGraph(observationId(id)),id);
    }
    async function loadObservation(graph,id){
      if(!graph)return null;
      check(graph.document.kind==='observation'&&graph.document.references.length===1,'invalid observation root');
      const observation=pick(graph,'observation',OBSERVATION),v=observation.payload;
      const original=graph.resources.find(r=>r.id===v.originalId);
      check(v.id===id&&graph.document.metadata.id===id,'observation alias mismatch');
      const record=await materializeObservation(graph,observation);
      const metadata=graph.document.metadata;
      return {row:{id,revision:metadata.revision,record,...classification(metadata)},
        observationId:observation.id,originalId:original.id,managedRevision:graph.document.revision};
    }
    // Gallery lookup, not a search of retired or private archived evidence.
    async function matchObservationIdentity(identity,existing){
      const wanted=images.validateIdentity(identity);
      let first=null,firstBlob=null;
      for(const value of existing){
        const original=await store.get(value.originalId);
        check(original?.type===ORIGINAL,'observation original unavailable');
        if(original.payload.identity.sha256!==wanted.sha256)continue;
        check(same(original.payload.identity,wanted),'reference photo identity collision or inconsistent raster');
        if(firstBlob)check(await bytesEqual(firstBlob,original.payload.blob),'reference photo identity collision');
        else{first=value;firstBlob=original.payload.blob;}
      }
      return first;
    }
    async function findObservationOriginal(identity){
      const existing=await observationInventory(),first=await matchObservationIdentity(identity,existing);
      const after=await store.listDocuments('observation');
      const expected=observationExpected(existing).documents;
      const order=rows=>rows.map(v=>[v.id,v.revision]).sort((a,b)=>a[0].localeCompare(b[0]));
      check(same(order(after),order(expected)),'observation inventory changed; reload and retry');
      return first;
    }
    // Existing consumers keep db-first signatures. Never open a legacy DB.
    function createImageLibraryPort(){
      function bound(db){check(db===env.indexedDB,'Image Library database context mismatch');}
      function originalRow(row){return {id:row.id,revision:row.revision,record:row.record};}
      function annotationRow(row){return {kind:row.kind,tags:row.tags,collections:row.collections,
        annotationRevision:row.annotationRevision};}
      async function get(db,id){
        bound(db);const value=await readObservation(id);return value?.row??null;
      }
      async function inspectOriginal(db,id){
        bound(db);const value=await inspectObservation(id);return value?.row??null;
      }
      function decoder(verify){check(typeof verify==='function','Original decoder required');return verify;}
      return Object.freeze({
        storageKind:'managed',coordination:store.coordination,
        KINDS:library.KINDS,MAX_ITEMS:library.MAX_ITEMS,MAX_CHARS:library.MAX_CHARS,
        makeId:library.makeId,validateBackup:library.validateBackup,annotation:library.annotation,
        edited:library.edited,quota:library.quota,annotationQuota:library.annotationQuota,
        list:async db=>{bound(db);return (await listObservations()).map(v=>v.row);},
        get,inspectOriginal,
        create:async(db,record)=>{bound(db);return originalRow((await createObservation(record)).row);},
        importAssets:async(db,records)=>{bound(db);return importObservationAssets(records);},
        findOriginal:async(db,identity,_crypto,verify)=>{
          bound(db);decoder(verify);
          const found=await findObservationOriginal(identity);
          if(!found)return null;
          await verify(found.row.record);return originalRow(found.row);
        },
        ensureOriginal:async(db,record,_crypto,verify)=>{
          bound(db);await decoder(verify)(record);
          const {identity,row,source,reused}=await ensureObservationOriginal(record);
          return {identity,row:originalRow(row),source,reused};
        },
        update:async(db,id,expected,metadata)=>{
          bound(db);const row=await get(db,id);
          check(row&&row.revision===expected,'Observation changed or was removed; reload before editing');
          const {kind,tags,collections}=row;
          return originalRow((await updateObservationDetails(id,expected,row.annotationRevision,metadata,
            {kind,tags,collections})).row);
        },
        updateDetails:async(db,id,rev,ann,metadata,values)=>{
          bound(db);return (await updateObservationDetails(id,rev,ann,metadata,values)).row;
        },
        setAnnotation:async(db,id,rev,values)=>{
          bound(db);return annotationRow((await setObservationAnnotation(id,rev,values)).row);
        },
        annotationStatus:async db=>{bound(db);return {enabled:true,version:library.VERSION_ANNOTATED};},
        enableAnnotations:async db=>{bound(db);return {enabled:true,version:library.VERSION_ANNOTATED};},
        exportBackup:async db=>{bound(db);return exportObservationBackup();},
        restoreBackup:async(db,backup,_crypto,verify)=>{
          bound(db);decoder(verify);
          const {rows}=library.validateBackup(backup);
          for(const row of rows)await verify(row.record);
          return restoreObservationBackup(backup);
        },
        remove:async()=>{throw Error('Managed Image Library deletion is disabled until coordinated cutover');}
      });
    }
    function resultDocumentId(id){
      check(typeof id==='string'&&/^calibration-result-v1-[0-9a-f]{64}$/.test(id),'invalid calibration result ID');
      return 'result:'+id;
    }
    async function verifyResultOriginal(graph,result,cache,hydrate=true){
      check(result?.type===RESULT,'calibration result resource missing');
      const original=graph.resources.find(r=>r.id===result.payload.originalId);
      const record=result.payload.record;
      check(original?.type===ORIGINAL&&same(original.payload.identity,record.payload.photo),
        'calibration original identity mismatch');
      if(!hydrate){await verifiedOriginal(original,cache);return null;}
      return materializeOriginal(original,'calibration_evidence',record.provenance.attribution,null,cache);
    }
    async function saveCalibrationResult(row,{originalId}={}){
      check(results&&exact(row,['id','createdAt','record'])&&positive(row.createdAt),
        'invalid calibration archive row or adapter unavailable');
      const record=results.validate(row.record);
      check(row.id===record.id,'calibration result alias mismatch');
      const original=await store.get(originalId);
      check(original?.type===ORIGINAL&&same(original.payload.identity,record.payload.photo),
        'calibration original identity mismatch');
      await materializeOriginal(original,'calibration_evidence',record.provenance.attribution);
      const existing=await readCalibrationResult(record.id);
      if(existing){
        check(results.sameContent(existing.row.record,record),'calibration result collision');
        return {resultId:existing.resultId,managedRevision:existing.managedRevision,reused:true};
      }
      const id=store.newObjectId();
      const document=await store.writeDocument({documentId:resultDocumentId(record.id),kind:'calibration-result',
        expectedRevision:0,metadata:{id:row.id,createdAt:row.createdAt},references:[strong('result',id)],
        resources:[{id,type:RESULT,version:1,payload:{record,originalId}}]});
      return {resultId:id,managedRevision:document.revision,reused:false};
    }
    async function readCalibrationResult(id){
      check(results,'Calibration result adapter unavailable');
      return loadCalibrationResult(await store.readDocumentGraph(resultDocumentId(id)),id);
    }
    async function inspectCalibrationResult(id){
      check(results,'Calibration result adapter unavailable');
      return loadCalibrationResult(await store.inspectDocumentGraph(resultDocumentId(id)),id);
    }
    async function loadCalibrationResult(graph,id){
      if(!graph)return null;
      check(graph.document.kind==='calibration-result'&&graph.document.references.length===1,
        'invalid calibration archive root');
      const result=pick(graph,'result',RESULT),record=result.payload.record,meta=graph.document.metadata;
      check(record.id===id&&meta.id===id&&positive(meta.createdAt),'calibration result alias mismatch');
      const original=await verifyResultOriginal(graph,result);
      return {row:{id,createdAt:meta.createdAt,record},resultId:result.id,
        originalId:result.payload.originalId,original,managedRevision:graph.document.revision};
    }
    async function calibrationResultInventory(){
      check(archiveApi&&results,'Calibration archive application adapter unavailable');
      return (await listVerified('calibration-result',readCalibrationResult,resultDocumentId,v=>v,
        (a,b)=>a.row.id.localeCompare(b.row.id))).map(v=>v.row);
    }
    // Plan an append-only archive root against the exact verified inventory.
    // The original is either retained by the current gallery or staged in
    // the same transaction; first archived provenance is never replaced.
    function planCalibrationArchive(record,originalId,existing,now){
      const expectedInventory={kind:'calibration-result',documents:existing.map(v=>({
        id:resultDocumentId(v.row.id),revision:v.managedRevision}))};
      const previous=existing.find(v=>v.row.id===record.id);
      if(previous){
        check(results.sameContent(previous.row.record,record),'Calibration result identity collision');
        return {row:previous.row,reused:true,expectedInventory,plan:null};
      }
      const row={id:record.id,createdAt:now(),record};
      check(positive(row.createdAt),'invalid calibration archive creation time');
      archiveApi.quota([...existing.map(v=>v.row),row]);
      const id=store.newObjectId();
      return {row,reused:false,expectedInventory,plan:{documentId:resultDocumentId(record.id),
        kind:'calibration-result',expectedRevision:0,metadata:{id:row.id,createdAt:row.createdAt},
        references:[strong('result',id)],resources:[{id,type:RESULT,version:1,payload:{record,originalId}}]}};
    }
    async function archiveCalibrationExperiment(input,{now=Date.now,guard=()=>{},resultOptions}={}){
      check(archiveApi&&results,'Calibration archive application adapter unavailable');
      const original=images.validate(input.referenceImage);
      const record=await results.create(input,env,resultOptions);
      const photo=await prepareObservationIngestion(original);
      check(same(record.payload.photo,photo.identity),'Calibration result original identity changed during archival');
      const archive=planCalibrationArchive(record,photo.originalId,await calibrationResultInventory(),now);
      await store.writeDocuments([photo.plan,archive.plan].filter(Boolean),{
        expectedInventory:[photo.expectedInventory,archive.expectedInventory],guard});
      return {row:archive.row,reused:archive.reused,photoId:photo.row.id,photoReused:photo.reused};
    }
    async function saveArchivedCalibration(input,{now=Date.now,guard=()=>{}}={}){
      check(archiveApi&&results,'Calibration archive application adapter unavailable');
      const record=results.validate(input);
      const observations=await observationInventory();
      const photo=await matchObservationIdentity(record.payload.photo,observations);
      check(photo,'Calibration result original photo is unavailable');
      const archive=planCalibrationArchive(record,photo.originalId,await calibrationResultInventory(),now);
      await store.writeDocuments(archive.plan?[archive.plan]:[],{
        expectedInventory:[observationExpected(observations),archive.expectedInventory],guard});
      return {row:archive.row,reused:archive.reused};
    }
    function createCalibrationArchivePort(){
      check(archiveApi&&results,'Calibration archive application adapter unavailable');
      function bound(db,context=env){
        check(db===env.indexedDB&&context.indexedDB===db,'Calibration archive database context mismatch');
      }
      return Object.freeze({storageKind:'managed',coordination:store.coordination,
        MAX_ITEMS:archiveApi.MAX_ITEMS,MAX_CHARS:archiveApi.MAX_CHARS,validId:archiveApi.validId,quota:archiveApi.quota,
        get:async(db,id)=>{bound(db);return (await readCalibrationResult(id))?.row??null;},
        list:async db=>{bound(db);return (await listCalibrationResults()).map(v=>v.row);},
        inspectUsage:async db=>{
          bound(db);
          return (await listVerified('calibration-result',inspectCalibrationResult,resultDocumentId,
            v=>({...results.summary(v.row.record),createdAt:v.row.createdAt}),byTime('createdAt'),store.inspectDocuments)).map(v=>v.row);
        },
        save:async(db,input,context)=>{
          bound(db,context);return saveArchivedCalibration(input);
        },
        archiveExperiment:async(db,input,context,options)=>{
          bound(db,context);return archiveCalibrationExperiment(input,{resultOptions:options});
        }
      });
    }
    function checkOrigin(origin,result){
      check(results&&result?.type===RESULT&&origin&&
        same(results.origin(result.payload.record,origin.target),origin),'calibration origin evidence mismatch');
    }
    async function resolveOrigin(origin){
      const saved=await readCalibrationResult(origin.resultId);
      check(saved,'calibration result missing; standalone import must be explicit');
      checkOrigin(origin,{type:RESULT,payload:{record:saved.row.record}});
      return saved.resultId;
    }
    async function prepareCalibration(project,original){
      let verified=null;
      if(project.photo){
        check(original?.type===ORIGINAL&&same(original.payload.identity,project.photo.identity),
          'Calibration Project original identity mismatch');
        verified=await materializeOriginal(original,'calibration_evidence',{title:'Verified original'});
      }
      // Reuse the existing checkpoint hydration/validation, replacing only
      // its original lookup port. This never accesses the old Image Library.
      return checkpoints.prepare(project,env,{async findOriginal(_db,identity){
        check(verified&&same(identity,project.photo.identity),'Calibration Project original missing');
        return {record:verified};
      }},importer);
    }
    async function saveCalibrationProject(input,{expectedRevision=0,originalId=null}={}){
      check(calibrations&&checkpoints,'Calibration Project adapters unavailable');
      const project=calibrations.normalize(input);
      const previous=expectedRevision===0?null:await readCalibrationProject(project.id);
      check(expectedRevision===0||previous?.managedRevision===expectedRevision,'Calibration Project revision conflict');
      const {plan,projectId}=await planCalibrationProject(project,previous,expectedRevision,originalId);
      const document=await store.writeDocument(plan);
      return {projectId,managedRevision:document.revision};
    }
    async function planCalibrationProject(project,previous,expectedRevision,originalId){
      // Editing an owner does not require its archived evidence to remain
      // listed in the gallery. Preserve exact existing resource mappings.
      if(previous&&originalId===null&&project.photo&&
        same(project.photo.identity,previous.project.photo?.identity))originalId=previous.originalId;
      check(project.photo?objectId(originalId):originalId===null,'Calibration Project photo mapping required');
      const original=originalId?await store.get(originalId):null;
      await prepareCalibration(project,original);
      const retained=new Map((previous?.results||[]).map(entry=>[entry.alias,entry.target]));
      const references=[];
      for(const alias of project.resultIds){
        const target=retained.get(alias);
        if(target){references.push({alias,target});continue;}
        const result=await readCalibrationResult(alias);
        check(result,'Calibration Project result missing: '+alias);
        references.push({alias,target:result.resultId});
      }
      const id=store.newObjectId();
      return {projectId:id,plan:{documentId:'calibration:'+project.id,kind:'calibration',
        expectedRevision,metadata:{id:project.id},references:[strong('project',id)],
        resources:[{id,type:CALIBRATION,version:1,payload:{project,originalId,results:references}}]}};
    }
    async function readCalibrationProject(id){
      check(calibrations&&checkpoints,'Calibration Project adapters unavailable');
      return loadCalibrationProject(await store.readDocumentGraph('calibration:'+calibrations.id(id)),id);
    }
    async function inspectCalibrationProject(id){
      check(calibrations&&checkpoints,'Calibration Project adapters unavailable');
      return loadCalibrationProject(await store.inspectDocumentGraph('calibration:'+calibrations.id(id)),id);
    }
    async function loadCalibrationProject(graph,id){
      if(!graph)return null;
      check(graph.document.kind==='calibration'&&graph.document.references.length===1,'invalid Calibration Project root');
      const resource=pick(graph,'project',CALIBRATION),v=resource.payload;
      check(v.project.id===id&&graph.document.metadata.id===id,'Calibration Project alias mismatch');
      for(const entry of v.results){
        const result=graph.resources.find(r=>r.id===entry.target);
        check(result?.type===RESULT&&result.payload.record.id===entry.alias,'Calibration Project result mismatch');
        await verifyResultOriginal(graph,result);
      }
      const original=v.originalId?graph.resources.find(r=>r.id===v.originalId):null;
      const prepared=await prepareCalibration(v.project,original);
      return {...prepared,projectId:resource.id,managedRevision:graph.document.revision,
        originalId:v.originalId,results:v.results};
    }
    async function calibrationProjectInventory(){
      check(projectStore&&calibrations&&checkpoints,'Calibration Project application adapter unavailable');
      return (await listVerified('calibration',readCalibrationProject,id=>'calibration:'+calibrations.id(id),
        v=>v,(a,b)=>a.project.id.localeCompare(b.project.id))).map(v=>v.row);
    }
    function calibrationProjectExpected(existing){
      return {kind:'calibration',documents:existing.map(v=>({id:'calibration:'+v.project.id,revision:v.managedRevision}))};
    }
    // The ordinary project port preserves domain revisions and conflict-fork
    // behavior, independently of the managed root revision. Quota and
    // source-photo resolution are guarded by their exact kind inventories.
    async function planApplicationCalibration(project,existing,previous,expectedRevision){
      projectStore.quota(existing.map(v=>calibrations.summary(v.project)),project,
        expectedRevision>0?project.id:null);
      const inventories=[calibrationProjectExpected(existing)];
      let originalId=null;
      if(project.photo&&!(previous&&same(project.photo.identity,previous.project.photo?.identity))){
        const observations=await observationInventory();
        const photo=await matchObservationIdentity(project.photo.identity,observations);
        check(photo,'Calibration Project verified original unavailable');
        originalId=photo.originalId;inventories.push(observationExpected(observations));
      }
      return {...await planCalibrationProject(project,previous,expectedRevision,originalId),inventories};
    }
    async function createApplicationCalibration(input,{guard=()=>{}}={}){
      const project=calibrations.normalize(input),existing=await calibrationProjectInventory();
      check(!existing.some(v=>v.project.id===project.id),'Calibration project ID already exists');
      const next=await planApplicationCalibration(project,existing,null,0);
      await store.writeDocuments([next.plan],{expectedInventory:next.inventories,guard});
      return project;
    }
    const calibrationReceiptId='calibration-selection:shared';
    function receiptInventory(value){
      return {kind:CALIBRATION_RECEIPT,documents:value?[{id:calibrationReceiptId,revision:value.managedRevision}]:[]};
    }
    // A reusable control root, never a resurrected tombstone. An active
    // receipt owns the exact committed project and, when available, the
    // exact preceding revision. Retirement clears these strong edges.
    async function loadCalibrationReceipt(graph,existingOnly){
      if(!graph)return null;
      const doc=graph.document;
      check(doc.id===calibrationReceiptId&&doc.kind===CALIBRATION_RECEIPT&&
        exact(doc.metadata,['id','receipt'])&&doc.metadata.id==='shared','invalid Calibration receipt root');
      if(doc.metadata.receipt===null){
        check(!doc.references.length,'retired Calibration receipt retains edges');
        return {receipt:null,managedRevision:doc.revision};
      }
      const receipt=projectStore.selectionReceipt(doc.metadata.receipt);
      const target=pick(graph,'current',CALIBRATION);
      const ref=project=>({id:project.id,revision:'rev:'+project.revision,recovery:null});
      check(same(ref(target.payload.project),receipt.current),'Calibration receipt target mismatch');
      const prior=doc.references.find(e=>e.slot==='previous');
      check(doc.references.length===(prior?2:1),'unexpected Calibration receipt edge');
      if(prior){
        const previous=pick(graph,'previous',CALIBRATION);
        check(same(ref(previous.payload.project),receipt.previous),'Calibration receipt previous mismatch');
      }
      const current=await (existingOnly?inspectCalibrationProject(receipt.current.id):readCalibrationProject(receipt.current.id));
      check(current&&current.projectId===target.id&&same(ref(current.project),receipt.current),
        'Receipt project changed; evidence retained');
      return {receipt,managedRevision:doc.revision,projectId:target.id,current};
    }
    async function readCalibrationReceipt(existingOnly=false){
      const graph=await (existingOnly?store.inspectDocumentGraph(calibrationReceiptId):store.readDocumentGraph(calibrationReceiptId));
      return loadCalibrationReceipt(graph,existingOnly);
    }
    async function changeApplicationCalibration(id,expected,changes,now,forkId=null,{guard=()=>{},lease=null,base=null,requireNoReceipt=false}={}){
      calibrations.id(id);check(positive(expected),'invalid expected project revision');
      if(lease!==null)projectStore.requireSharedLease(lease);
      if(base!==null||requireNoReceipt)projectStore.requireSharedLease(lease);
      if(base!==null)base=projectStore.selectionBase(base);
      const pending=await readCalibrationReceipt();
      check(!pending?.receipt||(base===null&&!requireNoReceipt&&pending.receipt.current.id!==id),
        'Shared Calibration receipt unresolved; evidence retained');
      if(forkId!==null)calibrations.id(forkId);
      const existing=await calibrationProjectInventory(),current=existing.find(v=>v.project.id===id);
      let project,status,expectedRevision;
      if(!current||current.project.revision!==expected){
        check(forkId!==null,'Calibration project changed or missing; reload before editing');
        const before=current?.project??calibrations.fresh({...changes,id,now});
        project=calibrations.fork(before,changes,forkId,now);
        status='forked';expectedRevision=0;
        check(!existing.some(v=>v.project.id===project.id),'Conflict fork project ID already exists');
      }else{
        project=calibrations.revise(current.project,changes,now);
        status='updated';expectedRevision=current.managedRevision;
      }
      const next=await planApplicationCalibration(project,existing,current,expectedRevision);
      const plans=[next.plan],inventories=[...next.inventories,receiptInventory(pending)];
      let selectionReceipt;
      if(base!==null){
        selectionReceipt=projectStore.selectionReceipt({version:1,base,
          previous:{id,revision:'rev:'+expected,recovery:null},
          current:{id:project.id,revision:'rev:'+project.revision,recovery:null},status});
        const references=[strong('current',next.projectId)];
        if(current?.project.revision===expected)references.push(strong('previous',current.projectId));
        plans.push({documentId:calibrationReceiptId,kind:CALIBRATION_RECEIPT,
          expectedRevision:pending?.managedRevision??0,metadata:{id:'shared',receipt:selectionReceipt},references});
      }
      await store.writeDocuments(plans,{expectedInventory:inventories,guard,lease});
      return {status,project,...(selectionReceipt?{selectionReceipt}:{})};
    }
    async function retireCalibrationReceipt(expected,lease){
      projectStore.requireSharedLease(lease);
      const receipt=projectStore.selectionReceipt(expected),pending=await readCalibrationReceipt();
      check(pending?.receipt&&same(pending.receipt,receipt),'Shared Calibration receipt changed; evidence retained');
      const existing=await calibrationProjectInventory();
      check(existing.some(v=>v.project.id===receipt.current.id&&v.projectId===pending.projectId),
        'Receipt project changed; evidence retained');
      await store.writeDocuments([{documentId:calibrationReceiptId,kind:CALIBRATION_RECEIPT,
        expectedRevision:pending.managedRevision,metadata:{id:'shared',receipt:null},references:[]}],{
        expectedInventory:[receiptInventory(pending),calibrationProjectExpected(existing)],lease});
      return receipt;
    }
    // A retained photo can be captured again without recreating a deleted
    // gallery entry. A newly selected photo follows the explicit ingestion
    // path; the later project write rechecks the actual owner.
    async function captureApplicationCalibration(draft,inline,boundProject){
      const captured=structuredClone(draft),capturedInline=structuredClone(inline);
      checkpoints.validateDraft(captured,capturedInline);
      if(!captured.record)return checkpoints.extract(captured,capturedInline,null);
      const original=await originalFrom(images.validate(captured.record));
      const current=await readCalibrationProject(calibrations.normalize(boundProject).id);
      if(current?.project.photo&&same(current.project.photo.identity,original.identity)){
        const retained=await store.get(current.originalId);
        check(retained?.type===ORIGINAL&&same(retained.payload.identity,original.identity)&&
          await bytesEqual(retained.payload.blob,original.blob),'Calibration Project retained original mismatch');
        return checkpoints.extract(captured,capturedInline,original.identity);
      }
      const saved=await ensureObservationOriginal(captured.record);
      return checkpoints.extract(captured,capturedInline,saved.identity);
    }
    function createCalibrationProjectPort(){
      check(projectStore&&calibrations&&checkpoints,'Calibration Project application adapter unavailable');
      function bound(db){check(db===env.indexedDB,'Calibration Project database context mismatch');}
      async function readReceipt(db,lease=null,existingOnly=false){
        bound(db);
        if(lease!==null){
          check(lease.sessionId==='shared'&&typeof lease.check==='function'&&typeof lease.track==='function'&&
            !('tabId' in lease),'Shared Calibration receipt requires a shared lifetime');
          lease.check();
        }
        const value=await readCalibrationReceipt(existingOnly);
        lease?.check();
        return value?.receipt??null;
      }
      const deletionUnavailable=async()=>{throw Error('Managed Calibration deletion is disabled until coordinated cutover');};
      const legacyUnavailable=async()=>{throw Error('Managed Calibration requires coordinated cutover; legacy adoption is disabled');};
      return Object.freeze({storageKind:'managed',coordination:store.coordination,
        MAX_PROJECTS:projectStore.MAX_PROJECTS,MAX_TOTAL_CHARS:projectStore.MAX_TOTAL_CHARS,
        MAX_ROW_CHARS:projectStore.MAX_ROW_CHARS,metadata:projectStore.metadata,quota:projectStore.quota,
        get:async(db,id)=>{bound(db);return (await readCalibrationProject(id))?.project??null;},
        prepare:async(db,id)=>{bound(db);return readCalibrationProject(id);},
        captureVerified:async(db,draft,inline,project)=>{bound(db);return captureApplicationCalibration(draft,inline,project);},
        list:async db=>{bound(db);return (await listCalibrationProjects()).map(v=>v.row);},
        inspectUsage:async db=>{
          bound(db);
          const rows=await listVerified('calibration',inspectCalibrationProject,id=>'calibration:'+calibrations.id(id),
            v=>calibrations.summary(v.project),byTime('updatedAt'),store.inspectDocuments);
          return {projects:rows.map(v=>v.row),legacy:null};
        },
        create:async(db,input)=>{bound(db);return createApplicationCalibration(input);},
        update:async(db,id,expected,changes,now=Date.now())=>{
          bound(db);return (await changeApplicationCalibration(id,expected,changes,now)).project;
        },
        rename:async(db,id,expected,title,now=Date.now())=>{
          bound(db);return (await changeApplicationCalibration(id,expected,{title},now)).project;
        },
        saveOrFork:async(db,id,expected,changes,forkId,now=Date.now(),lease=null)=>{
          bound(db);
          return changeApplicationCalibration(id,expected,changes,now,forkId,{lease});
        },
        saveOrForkWithSelectionReceipt:async(db,id,expected,changes,forkId,now,base,lease)=>{
          bound(db);projectStore.requireSharedLease(lease);
          return changeApplicationCalibration(id,expected,changes,now,forkId,{base,lease});
        },
        readSharedSelectionReceipt:readReceipt,
        readExistingSharedSelectionReceipt:(db,lease)=>readReceipt(db,lease,true),
        retireSharedSelectionReceipt:async(db,receipt,lease)=>{bound(db);return retireCalibrationReceipt(receipt,lease);},
        renameSharedUnselected:async(db,id,expected,title,lease,now=Date.now())=>{
          bound(db);projectStore.requireSharedLease(lease);
          return (await changeApplicationCalibration(id,expected,{title},now,null,{lease,requireNoReceipt:true})).project;
        },
        removeShared:deletionUnavailable,remove:deletionUnavailable,
        legacy:legacyUnavailable,migrationMarker:legacyUnavailable,adoptLegacy:legacyUnavailable
      });
    }
    function animationFields(row){
      check(projects&&animations,'Animation adapters unavailable');
      const normalized=animations.normalize(row);
      check(!row.thumbnail||normalized.thumbnail,'invalid Animation thumbnail');
      const {project,...metadata}=normalized;
      return {project,metadata};
    }
    async function saveAnimation(row,{expectedRevision=0,standalone=false}={}){
      const {project,metadata}=animationFields(row);
      // Existing aliases keep their historical evidence, not whatever a
      // mutable gallery alias happens to resolve to today. The final root
      // CAS protects this read against a concurrent edit or deletion.
      const previous=expectedRevision===0?null:await readAnimation(project.id);
      check(expectedRevision===0||previous?.managedRevision===expectedRevision,
        'Animation revision conflict');
      const next=await planAnimation(row,previous,expectedRevision,standalone);
      const document=await store.writeDocument(next.plan);
      return {projectId:next.projectId,managedRevision:document.revision};
    }
    async function planAnimation(row,previous,expectedRevision,standalone=false,journal=null){
      const {project,metadata}=animationFields(row);
      const retainedEvidence=new Map(Array.isArray(previous?.evidence)?
        previous.evidence.map(entry=>[entry.alias,entry.target]):[]);
      const retainedObservations=new Map((previous?.observations||[]).map(entry=>[entry.alias,entry.target]));
      const origins=calibrationOrigins(project);
      let evidence='none';
      if(origins.length){
        if(standalone===true){
          check(!origins.some(origin=>retainedEvidence.has(origin.resultId)),
            'verified calibration evidence cannot be downgraded');
          evidence='standalone';
        }else{
          const mapped=new Map();
          for(const origin of origins){
            let target=retainedEvidence.get(origin.resultId)??journal?.evidence.find(v=>v.alias===origin.resultId)?.target;
            if(target)checkOrigin(origin,await store.get(target));
            else target=await resolveOrigin(origin);
            if(mapped.has(origin.resultId))check(mapped.get(origin.resultId)===target,'calibration evidence changed');
            mapped.set(origin.resultId,target);
          }
          evidence=[...mapped].sort(([a],[b])=>a.localeCompare(b)).map(([alias,target])=>({alias,target}));
        }
      }
      const observations=[];
      for(const alias of aliases(project)){
        if(retainedObservations.has(alias)){
          observations.push({alias,target:retainedObservations.get(alias)});
          continue;
        }
        const retained=journal?.observations.find(v=>v.alias===alias);
        if(retained){observations.push(retained);continue;}
        const graph=await store.readDocumentGraph(observationId(alias));
        check(graph&&graph.document.kind==='observation','required observation missing: '+alias);
        const value=pick(graph,'observation',OBSERVATION);
        check(value.payload.id===alias,'observation alias mismatch');
        await materializeObservation(graph,value);
        observations.push({alias,target:value.id});
      }
      const payload={project,observations,evidence};
      const id=store.newObjectId();
      return {projectId:id,plan:{documentId:'animation:'+project.id,kind:'animation',
        expectedRevision,metadata,references:[strong('project',id)],
        resources:[{id,type:ANIMATION,version:1,payload}]}};
    }
    async function readAnimation(id){
      check(projects&&animations,'Animation adapters unavailable');
      return loadAnimation(await store.readDocumentGraph('animation:'+images.validId(id)),id);
    }
    async function inspectAnimation(id){
      return loadAnimation(await store.inspectDocumentGraph('animation:'+images.validId(id)),id);
    }
    async function loadAnimation(graph,id){
      if(!graph)return null;
      check(graph.document.kind==='animation'&&graph.document.references.length===1,'invalid Animation root');
      const resource=pick(graph,'project',ANIMATION),v=resource.payload;
      const row=animations.normalize({...graph.document.metadata,project:v.project});
      check(row.id===id,'Animation alias mismatch');
      const referenceImages=[];
      for(const entry of v.observations){
        const image=graph.resources.find(r=>r.id===entry.target);
        check(image?.type===OBSERVATION&&image.payload.id===entry.alias,'Animation observation mismatch');
        referenceImages.push(await materializeObservation(graph,image));
      }
      if(Array.isArray(v.evidence)){
        for(const entry of v.evidence){
          const result=graph.resources.find(r=>r.id===entry.target);
          for(const origin of calibrationOrigins(row.project).filter(origin=>origin.resultId===entry.alias))
            checkOrigin(origin,result);
          await verifyResultOriginal(graph,result);
        }
      }
      return {row,projectId:resource.id,managedRevision:graph.document.revision,
        evidence:v.evidence,observations:v.observations,referenceImages};
    }
    async function animationInventory(){
      return (await listVerified('animation',readAnimation,id=>'animation:'+images.validId(id),v=>v,
        (a,b)=>byTime('updatedAt')(a.row,b.row))).map(v=>v.row);
    }
    function animationExpected(existing){
      return {kind:'animation',documents:existing.map(v=>({id:'animation:'+v.row.id,revision:v.managedRevision}))};
    }
    async function createApplicationAnimation(project,optics,now,thumbnail,allowDuplicate,cover){
      const time=now||Date.now(),row=animations.record(project,optics,project.id,time,time,thumbnail,cover);
      const existing=await animationInventory();
      check(!existing.some(v=>v.row.id===row.id),'Animation Library project already exists');
      if(!allowDuplicate){
        const match=existing.find(v=>animations.fingerprint(v.row.project)===animations.fingerprint(row.project));
        if(match)throw animations.duplicateError(match.row);
      }
      const next=await planAnimation(row,null,0);
      await store.writeDocuments([next.plan],{expectedInventory:animationExpected(existing)});
      return row;
    }
    async function changeApplicationAnimation(id,expected,build,{guard=()=>{},exactRow=null,planned=null}={}){
      const existing=await animationInventory(),current=existing.find(v=>v.row.id===id);
      check(current,'Saved Animation was deleted; update plan retained');
      const inventory=[animationExpected(existing)];
      if(planned&&same(current.row,planned.after)){
        await store.writeDocuments([],{expectedInventory:inventory,guard});
        return planned.after;
      }
      check(current.row.updatedAt===expected&&(!exactRow||same(current.row,exactRow)),
        'Animation Library project changed in another tab; reopen it or use Save As');
      const row=animations.normalize(build(current.row));
      let journal=null;
      if(planned&&drafts){
        const candidate=await readAnimationWorkingCollection();
        if(candidate?.row.namedSave&&same(candidate.row.namedSave.plan,planned)){
          journal=candidate;
          inventory.push({kind:DRAFTS,documents:[{id:draftsId,revision:candidate.managedRevision}]});
        }
      }
      const next=await planAnimation(row,current,current.managedRevision,false,journal);
      await store.writeDocuments([next.plan],{expectedInventory:inventory,guard});
      return row;
    }
    async function importApplicationAnimations(items,now,crypto){
      const incoming=animations.parseBundle(JSON.stringify({format:animations.PORTABLE_FORMAT,version:1,animations:items})).animations;
      const existing=await animationInventory(),seen=new Map(),ids=new Set();
      for(const doc of await store.listDocuments('animation',{includeDeleted:true}))ids.add(doc.id.slice('animation:'.length));
      for(const v of existing){const key=animations.fingerprint(v.row.project);if(!seen.has(key))seen.set(key,v.row.id);}
      const time=now||Date.now(),createdIds=[],reusedIds=[],plans=[];
      for(const item of incoming){
        const key=animations.fingerprint(item.project);
        if(seen.has(key)){reusedIds.push(seen.get(key));continue;}
        let id,attempt=0;
        do{check(++attempt<=100,'Cannot allocate a unique animation ID');id=animations.makeId(crypto,time+attempt);}while(ids.has(id));
        ids.add(id);seen.set(key,id);
        const project=projects.validate({...item.project,id,keyframes:item.project.keyframes.map(f=>({...f,sourceSnapshotId:null}))});
        // A foreign calibration origin without an archive cannot silently
        // become verified evidence. Refuse mixed/unavailable evidence here.
        const row=animations.record(project,item.quality,id,item.createdAt??time,item.updatedAt??time,item.thumbnail,item.cover);
        plans.push((await planAnimation(row,null,0)).plan);createdIds.push(id);
      }
      await store.writeDocuments(plans,{expectedInventory:animationExpected(existing)});
      return {created:createdIds.length,reused:reusedIds.length,createdIds,reusedIds};
    }
    function createAnimationLibraryPort(){
      check(projects&&animations,'Animation adapters unavailable');
      function bound(db){check(db===env.indexedDB,'Animation Library database context mismatch');}
      const rejectDelete=async()=>{throw Error('Managed Animation deletion is disabled until coordinated cutover');};
      return Object.freeze({...animations,storageKind:'managed',coordination:store.coordination,
        list:async db=>{bound(db);return (await listAnimations()).map(v=>v.row);},
        get:async(db,id)=>{bound(db);return (await readAnimation(id))?.row??null;},
        inspectUsage:async db=>{
          bound(db);return (await listVerified('animation',inspectAnimation,id=>'animation:'+images.validId(id),
            v=>v.row,byTime('updatedAt'),store.inspectDocuments)).map(v=>v.row);
        },
        create:async(db,...args)=>{bound(db);return createApplicationAnimation(...args);},
        update:async(db,project,optics,expected,now,thumbnail)=>{
          bound(db);return changeApplicationAnimation(project.id,expected,old=>animations.nextRecord(old,project,optics,now,thumbnail));
        },
        updateExact:async(db,project,optics,expected,now,thumbnail)=>{
          bound(db);const plan=animations.planExactUpdate(project,optics,expected,now,thumbnail);
          return changeApplicationAnimation(plan.before.id,plan.before.updatedAt,()=>plan.after,{exactRow:plan.before});
        },
        commitPlannedUpdate:async(db,input,guard=()=>{})=>{
          bound(db);guard();const plan=animations.validateUpdatePlan(input);
          return changeApplicationAnimation(plan.before.id,plan.before.updatedAt,()=>plan.after,{guard,exactRow:plan.before,planned:plan});
        },
        rename:async(db,id,name,expected,now)=>{
          bound(db);return changeApplicationAnimation(id,expected,old=>animations.record({...old.project,name},old.quality,id,
            old.createdAt,Math.max(now||Date.now(),old.updatedAt+1),old.thumbnail,old.cover));
        },
        setCover:async(db,id,image,expected,now)=>{
          bound(db);return changeApplicationAnimation(id,expected,old=>animations.record(old.project,old.quality,id,
            old.createdAt,Math.max(now||Date.now(),old.updatedAt+1),old.thumbnail,image));
        },
        importEntries:async(db,items,now,crypto)=>{bound(db);return importApplicationAnimations(items,now,crypto);},
        // Export from the immutable owner, not from a mutable gallery alias.
        retainedReferences:async(db,id)=>{
          bound(db);const value=await readAnimation(id);check(value,'Saved Animation missing');return value.referenceImages;
        },
        remove:rejectDelete,removeExact:rejectDelete
      });
    }
    const workingId='working:shared-experiment';
    function workingContracts(){
      check(session&&sessionContract&&typeof session.validateSharedCheckpoint==='function',
        'working checkpoint adapter unavailable');
    }
    async function loadWorkingCheckpoint(readGraph){
      workingContracts();
      const graph=await readGraph(workingId);
      if(!graph)return null;
      const meta=graph.document.metadata;
      check(graph.document.kind==='working-checkpoint'&&
        exact(meta,['format','version','revision','envelope','digest']),'invalid working checkpoint root');
      const hasDraft=graph.document.references.some(ref=>ref.slot==='draft');
      check(graph.document.references.length===(hasDraft?2:1),'invalid working checkpoint slots');
      const verified=new Map();
      async function load(slot){
        const snapshot=pick(graph,slot,SNAPSHOT),{experiment,evidence}=snapshot.payload;
        if(typeof evidence==='object'){
          const result=graph.resources.find(r=>r.id===evidence.result);
          checkOrigin(experiment.calibrationOrigin,result);
          await verifyResultOriginal(graph,result,verified,false);
        }
        return {experiment,ref:{id:snapshot.id,evidence}};
      }
      const committed=await load('committed'),draft=hasDraft?await load('draft'):null;
      const row=await session.validateSharedCheckpoint({...meta,experiment:committed.experiment,
        draft:draft?draft.experiment:null},state,env.crypto,sessionContract);
      return {row,managedRevision:graph.document.revision,
        snapshots:{committed:committed.ref,draft:draft?draft.ref:null}};
    }
    async function readWorkingCheckpoint(){
      return loadWorkingCheckpoint(store.readDocumentGraph);
    }
    function explicitStandaloneIds(ids){
      check(Array.isArray(ids),'standalone result ID list required');
      for(const id of ids)resultDocumentId(id);
      return new Set(ids);
    }
    async function saveWorkingCheckpoint(input,{expectedRevision=0,standalone=false,standaloneResultIds=[],
      expectedRow=undefined,guard=()=>{},lease=null,historyHandoff=false}={}){
      workingContracts();
      const allowedStandalone=explicitStandaloneIds(standaloneResultIds);
      const row=await session.validateSharedCheckpoint(input,state,env.crypto,sessionContract);
      const previous=expectedRevision===0?null:await loadWorkingCheckpoint(store.readDocumentClosureForWrite);
      check(expectedRevision===0||previous?.managedRevision===expectedRevision,
        'working checkpoint revision conflict');
      check(!previous||row.revision===previous.row.revision+1,'working checkpoint source revision must advance once');
      if(expectedRow!==undefined)check(same(previous?.row??null,expectedRow),
        'shared checkpoint CAS conflict; evidence retained');
      const retained=[];
      if(previous)for(const [slot,experiment] of [['committed',previous.row.experiment],['draft',previous.row.draft]]){
        if(experiment)retained.push({id:previous.snapshots[slot].id,
          payload:{experiment,evidence:previous.snapshots[slot].evidence}});
      }
      const resources=[],references=[],inventories=[];
      let historySources=null;
      for(const [slot,experiment] of [['committed',row.experiment],['draft',row.draft]]){
        if(!experiment)continue;
        const origin=experiment.calibrationOrigin;
        let evidence='none';
        if(origin){
          const archived=retained.find(r=>typeof r.payload.evidence==='object'&&
            r.payload.experiment.calibrationOrigin?.resultId===origin.resultId);
          if(archived){
            const target=archived.payload.evidence.result;
            checkOrigin(origin,await store.get(target));
            evidence={result:target};
          }else if(standalone===true||allowedStandalone.has(origin.resultId)||retained.some(r=>r.payload.evidence==='standalone'&&
            same(r.payload.experiment.calibrationOrigin,origin)))evidence='standalone';
          else{
            let handoff=null;
            if(historyHandoff){
              if(!historySources){
                historySources=await listVerified('history',readHistory,historyId,v=>v,(a,b)=>b.row.id-a.row.id);
                inventories.push({kind:'history',documents:historySources.map(v=>({
                  id:historyId(v.row.row.id),revision:v.managedRevision}))});
              }
              const matches=historySources.map(v=>v.row).filter(v=>same(v.row.experiment,experiment));
              const verified=matches.filter(v=>typeof v.evidence==='object');
              check(new Set(verified.map(v=>v.evidence.result)).size<=1,
                'ambiguous History calibration evidence; select an exact source');
              handoff=verified[0]??null;
              // Only transfer verified evidence here; portable standalone
              // provenance remains a separately explicit policy.
            }
            if(handoff){
              evidence=handoff.evidence;
              checkOrigin(origin,await store.get(evidence.result));
              retained.push({id:handoff.snapshotId,payload:{experiment,evidence}});
            }else evidence={result:await resolveOrigin(origin)};
          }
        }
        const payload={experiment,evidence};
        let snapshot=[...retained,...resources].find(r=>same(r.payload,payload));
        if(!snapshot){
          snapshot={id:store.newObjectId(),type:SNAPSHOT,version:1,payload};
          resources.push(snapshot);
        }
        references.push(strong(slot,snapshot.id));
      }
      const {experiment,draft,...metadata}=row;
      const [saved]=await store.writeDocuments([{documentId:workingId,kind:'working-checkpoint',
        expectedRevision,metadata,references,resources}],{expectedInventory:inventories.length?inventories:null,guard,lease});
      return {managedRevision:saved.revision};
    }
    function createWorkingCheckpointPort(db,lease){
      workingContracts();
      check(db===env.indexedDB,'working checkpoint database context mismatch');
      check(lease?.sessionId==='shared'&&typeof lease.check==='function'&&typeof lease.track==='function'&&
        !('tabId' in lease),'shared document lifetime required');
      lease.check();
      return Object.freeze({
        async read(){
          lease.check();
          const value=await loadWorkingCheckpoint(store.inspectDocumentGraph);
          lease.check();return value?.row??null;
        },
        async commit(before,row,guard){
          lease.check(true);
          const previous=await loadWorkingCheckpoint(store.readDocumentClosureForWrite);
          check(same(previous?.row??null,before),'shared checkpoint CAS conflict; evidence retained');
          check(previous||row.revision===1,'initial working checkpoint revision must be one');
          await saveWorkingCheckpoint(row,{expectedRevision:previous?.managedRevision??0,
            expectedRow:before,guard,lease,historyHandoff:true});
        }
      });
    }
    const draftsId='animation-working:shared';
    function draftContracts(){
      check(drafts&&projects&&animations&&typeof drafts.verifySharedRow==='function',
        'Animation working collection adapter unavailable');
    }
    async function loadAnimationWorkingCollection(readGraph,hydrate=true){
      draftContracts();
      const graph=await readGraph(draftsId);
      if(!graph)return null;
      const prior=graph.document.references.some(ref=>ref.slot==='previous');
      check(graph.document.kind===DRAFTS&&graph.document.references.length===(prior?2:1)&&
        exact(graph.document.metadata,['sourceRevision']),'invalid Animation working root');
      const resource=pick(graph,'collection',DRAFTS),v=resource.payload;
      const row=await drafts.verifySharedRow(v.row,env.crypto);
      check(graph.document.metadata.sourceRevision===row.revision,'Animation working revision mismatch');
      if(prior){
        const previous=pick(graph,'previous',DRAFTS),old=await drafts.verifySharedRow(previous.payload.row,env.crypto);
        check(row.receipt&&old.revision+1===row.revision&&
          same(drafts.documentReference(old,row.receipt.previous.id),row.receipt.previous),
          'Animation receipt previous collection mismatch');
        // Validate retained prior evidence too; it may not appear in the current row.
        const inventory=draftInventory(old),verified=new Map();
        for(const entry of previous.payload.observations){
          const observation=graph.resources.find(r=>r.id===entry.target);
          check(observation?.type===OBSERVATION&&observation.payload.id===entry.alias,'prior Animation observation mismatch');
          await materializeObservation(graph,observation,verified,false);
        }
        for(const entry of previous.payload.evidence){
          if(entry.target===null)continue;
          const result=graph.resources.find(r=>r.id===entry.target);
          for(const origin of inventory.origins.filter(o=>o.resultId===entry.alias))checkOrigin(origin,result);
          await verifyResultOriginal(graph,result,verified,false);
        }
      }
      const inventory=draftInventory(row),referenceImages=[],verified=new Map();
      for(const entry of v.observations){
        const observation=graph.resources.find(r=>r.id===entry.target);
        check(observation?.type===OBSERVATION&&observation.payload.id===entry.alias,
          'Animation working observation mismatch');
        const record=await materializeObservation(graph,observation,verified,hydrate);
        if(hydrate)referenceImages.push(record);
      }
      for(const entry of v.evidence){
        if(entry.target===null)continue;
        const result=graph.resources.find(r=>r.id===entry.target);
        for(const origin of inventory.origins.filter(origin=>origin.resultId===entry.alias))
          checkOrigin(origin,result);
        await verifyResultOriginal(graph,result,verified,false);
      }
      return {row,collectionId:resource.id,managedRevision:graph.document.revision,
        observations:v.observations,evidence:v.evidence,referenceImages};
    }
    async function readAnimationWorkingCollection(){
      return loadAnimationWorkingCollection(store.readDocumentGraph);
    }
    async function saveAnimationWorkingCollection(input,{expectedRevision=0,standalone=false,standaloneResultIds=[],
      expectedRow=undefined,guard=()=>{},lease=null,animationHandoff=false}={}){
      draftContracts();
      const allowedStandalone=explicitStandaloneIds(standaloneResultIds);
      const row=await drafts.verifySharedRow(input,env.crypto);
      const previous=expectedRevision===0?null:await loadAnimationWorkingCollection(store.readDocumentClosureForWrite,false);
      check(expectedRevision===0||previous?.managedRevision===expectedRevision,
        'Animation working revision conflict');
      check(!previous||row.revision===previous.row.revision+1,'Animation working source revision must advance once');
      if(expectedRow!==undefined)check(same(previous?.row??null,expectedRow),'Shared Animation collection CAS conflict; evidence retained');
      const inventory=draftInventory(row),oldInventory=previous?draftInventory(previous.row):null;
      const oldPhotos=new Map((previous?.observations||[]).map(entry=>[entry.alias,entry.target]));
      const oldResults=new Map((previous?.evidence||[]).map(entry=>[entry.alias,entry.target]));
      const observations=[],evidence=[];
      // A linked working checkpoint identifies an exact named Library revision.
      // Transfer retained resources from that owner, not a mutable gallery alias.
      // The inventory CAS protects the source until the new root is committed.
      let sources=null,sourceInventory=null;
      async function linkedSources(){
        if(sources)return sources;
        sources=[];
        if(!animationHandoff)return sources;
        const linked=row.collection.workspaces.map(w=>w.checkpoint).filter(cp=>cp.libraryId!==null);
        if(!linked.length)return sources;
        const named=await listVerified('animation',readAnimation,id=>'animation:'+images.validId(id),
          v=>v,(a,b)=>byTime('updatedAt')(a.row,b.row));
        sourceInventory=animationExpected(named.map(v=>v.row));
        for(const cp of linked){
          const match=named.find(v=>v.row.row.id===cp.libraryId&&v.row.row.updatedAt===cp.libraryRevision);
          if(match)sources.push(match.row);
        }
        return sources;
      }
      async function retainedFromAnimation(alias,kind,origins=[]){
        const matches=new Set();
        for(const source of await linkedSources()){
          if(kind==='evidence'&&!origins.every(origin=>
            calibrationOrigins(source.row.project).some(v=>same(v,origin))))continue;
          const entries=source[kind];
          if(!Array.isArray(entries))continue;
          const target=entries.find(v=>v.alias===alias)?.target;
          if(target)matches.add(target);
        }
        check(matches.size<=1,'ambiguous named Animation resource: '+alias);
        return matches.values().next().value??null;
      }
      for(const alias of inventory.photos){
        let target=oldPhotos.get(alias);
        if(!target)target=await retainedFromAnimation(alias,'observations');
        if(!target){
          const graph=await store.readDocumentGraph(observationId(alias));
          check(graph&&graph.document.kind==='observation','required working observation missing: '+alias);
          const observation=pick(graph,'observation',OBSERVATION);
          check(observation.payload.id===alias,'working observation alias mismatch');
          await materializeObservation(graph,observation,undefined,false);
          target=observation.id;
        }
        observations.push({alias,target});
      }
      for(const alias of inventory.results){
        const origins=inventory.origins.filter(o=>o.resultId===alias);
        let target=oldResults.get(alias);
        if(!target)target=await retainedFromAnimation(alias,'evidence',origins);
        if(!target){
          const saved=await readCalibrationResult(alias);
          target=saved?.resultId??null;
        }
        if(target){
          const result=await store.get(target);
          for(const origin of origins)checkOrigin(origin,result);
        }else{
          const retained=oldResults.has(alias)&&oldResults.get(alias)===null&&
            origins.every(origin=>oldInventory.origins.some(old=>same(origin,old)));
          check(standalone===true||allowedStandalone.has(alias)||retained,
            'working calibration result missing; standalone recovery must be explicit');
        }
        evidence.push({alias,target});
      }
      const id=store.newObjectId();
      const references=[strong('collection',id)];
      if(row.receipt&&previous){
        check(same(drafts.documentReference(previous.row,row.receipt.previous.id),row.receipt.previous),
          'Animation receipt previous workspace mismatch');
        references.push(strong('previous',previous.collectionId));
      }
      const [document]=await store.writeDocuments([{documentId:draftsId,kind:DRAFTS,
        expectedRevision,metadata:{sourceRevision:row.revision},references,
        resources:[{id,type:DRAFTS,version:1,payload:{row,observations,evidence}}]}],{guard,lease,expectedInventory:sourceInventory});
      return {collectionId:id,managedRevision:document.revision};
    }
    function createAnimationWorkingPort(db,lease){
      draftContracts();
      check(db===env.indexedDB,'Animation working database context mismatch');
      check(lease?.sessionId==='shared'&&typeof lease.check==='function'&&typeof lease.track==='function'&&
        !('tabId' in lease),'Shared Animation lifetime required');
      lease.check();
      return Object.freeze({
        async read(){
          lease.check();
          const value=await loadAnimationWorkingCollection(store.inspectDocumentGraph,false);
          lease.check();return value?.row??null;
        },
        async commit(before,row,guard){
          lease.check(true);
          const previous=await loadAnimationWorkingCollection(store.readDocumentClosureForWrite,false);
          check(same(previous?.row??null,before),'Shared Animation collection CAS conflict; evidence retained');
          check(previous||row.revision===1,'initial Animation working revision must be one');
          await saveAnimationWorkingCollection(row,{expectedRevision:previous?.managedRevision??0,
            expectedRow:before,guard,lease,animationHandoff:true});
        }
      });
    }
    // Read verified domain rows, one closure at a time. A second inventory
    // refuses a mixed-revision list rather than silently dropping changed
    // documents. Revisions never roll back or reuse retired document IDs.
    async function listVerified(kind,reader,documentId,project,compare,inventory=store.listDocuments){
      const before=await inventory(kind),out=[];
      for(const doc of before){
        const alias=doc.metadata?.id;
        check(doc.id===documentId(alias),'invalid '+kind+' root alias');
        const value=await reader(alias);
        check(value&&value.managedRevision===doc.revision,
          kind+' inventory changed; reload and retry');
        out.push({row:project(value),managedRevision:value.managedRevision});
      }
      const after=await inventory(kind);
      check(same(before.map(d=>[d.id,d.revision]),after.map(d=>[d.id,d.revision])),
        kind+' inventory changed; reload and retry');
      return out.sort((a,b)=>compare(a.row,b.row));
    }
    const byTime=field=>(a,b)=>b[field]-a[field]||a.id.localeCompare(b.id);
    function listHistory(){
      return listVerified('history',readHistory,historyId,v=>v.row,(a,b)=>b.id-a.id);
    }
    function listObservations(){
      return listVerified('observation',readObservation,observationId,({row})=>{
        const {record,...rest}=row;
        return {...rest,title:record.title,description:record.description||'',author:record.author,
          license:record.license||'',sourceUrl:record.sourceUrl||'',width:record.original.width,
          height:record.original.height,thumbnail:record.thumbnail||null};
      },(a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
    }
    function listAnimations(){
      return listVerified('animation',readAnimation,id=>'animation:'+images.validId(id),v=>v.row,byTime('updatedAt'));
    }
    function listCalibrationResults(){
      check(results,'Calibration result adapter unavailable');
      return listVerified('calibration-result',readCalibrationResult,resultDocumentId,
        v=>({...results.summary(v.row.record),createdAt:v.row.createdAt}),byTime('createdAt'));
    }
    function listCalibrationProjects(){
      check(calibrations,'Calibration Project adapter unavailable');
      return listVerified('calibration',readCalibrationProject,id=>'calibration:'+calibrations.id(id),
        v=>calibrations.summary(v.project),byTime('updatedAt'));
    }
    // This is only a proposed numeric alias. The initial root CAS remains
    // the reservation; a competing create must obtain a fresh suggestion.
    async function suggestHistoryId(){
      const all=await store.listDocuments('history',{includeDeleted:true});
      let largest=0;
      for(const doc of all){
        const id=Number(doc.id.slice('history:'.length));
        check(doc.id===historyId(id),'invalid History root alias');
        largest=Math.max(largest,id);
      }
      check(largest<Number.MAX_SAFE_INTEGER,'History ID exhausted');
      return largest+1;
    }
    // Qualification of an exact restored archive, not a live migration
    // gate. The inventory comes from the verified archive, not a UI list.
    async function qualifyRestoredArchive(database,backup){
      const rows=name=>{
        const entry=database.stores.find(s=>s.name===name);
        check(entry,'managed archive store missing: '+name);
        return entry.records.map(r=>({key:backup.decode(r.key),value:backup.decode(r.value)}));
      };
      const integrity=await store.verifyIntegrity();
      check(integrity.valid,'restored managed reference count mismatch');
      const documents=rows('documents'),objects=rows('objects'),owners={};
      let originalsVerified=0;
      for(const {key,value} of objects){
        check(key===value.id,'restored object key mismatch');
        if(!value.deleted&&value.type===ORIGINAL){
          await verifiedOriginal(await store.get(key));
          originalsVerified++;
        }
      }
      for(const {key,value} of documents){
        check(key===value.id,'restored document key mismatch');
        if(value.deleted)continue;
        let opened;
        const alias=value.metadata?.id;
        switch(value.kind){
        case 'history':
          check(key===historyId(alias),'restored History root alias mismatch');
          opened=await readHistory(alias);break;
        case 'observation':
          check(key===observationId(alias),'restored observation root alias mismatch');
          opened=await readObservation(alias);break;
        case 'animation':
          check(key==='animation:'+images.validId(alias),'restored Animation root alias mismatch');
          opened=await readAnimation(alias);break;
        case 'calibration-result':
          check(key===resultDocumentId(alias),'restored Calibration result root alias mismatch');
          opened=await readCalibrationResult(alias);break;
        case 'calibration':
          check(calibrations&&key==='calibration:'+calibrations.id(alias),'restored Calibration root alias mismatch');
          opened=await readCalibrationProject(alias);break;
        case CALIBRATION_RECEIPT:
          check(key===calibrationReceiptId,'restored Calibration receipt root alias mismatch');
          opened=await readCalibrationReceipt();break;
        case 'working-checkpoint':
          check(key===workingId,'restored working root alias mismatch');
          opened=await readWorkingCheckpoint();break;
        case DRAFTS:
          check(key===draftsId,'restored Animation working root alias mismatch');
          opened=await readAnimationWorkingCollection();break;
        default:throw Error('Managed Resources: unsupported restored document kind: '+value.kind);
        }
        check(opened&&opened.managedRevision===value.revision,'restored document revision mismatch');
        owners[value.kind]=(owners[value.kind]||0)+1;
      }
      return {owners,originalsVerified,integrity,countsRecomputed:true};
    }
    return Object.freeze({store,qualifyRestoredArchive,saveWorkingCheckpoint,readWorkingCheckpoint,createWorkingCheckpointPort,
      saveAnimationWorkingCollection,readAnimationWorkingCollection,createAnimationWorkingPort,
      saveHistory,readHistory,recordHistory,importHistory,setHistoryPinned,createHistoryPort,saveObservation,readObservation,saveAnimation,readAnimation,
      saveCalibrationResult,readCalibrationResult,saveCalibrationProject,readCalibrationProject,
      createCalibrationArchivePort,archiveCalibrationExperiment,saveArchivedCalibration,createCalibrationProjectPort,createAnimationLibraryPort,
      createObservation,ensureObservationOriginal,updateObservationDetails,setObservationAnnotation,
      importObservationAssets,exportObservationBackup,restoreObservationBackup,createImageLibraryPort,findObservationOriginal,
      listHistory,listObservations,listAnimations,listCalibrationResults,listCalibrationProjects,suggestHistoryId});
  }
  // One-way rehearsal from a verified portable archive into a disposable,
  // empty origin profile. No old database is opened or rewritten. No UI route
  // selects this data and the report never authorizes a production cutover.
  async function rehearseLegacyArchive(archive,env,deps=env){
    const backup=deps.CurvatureModernPortableBackup;
    check(backup&&env?.navigator?.locks,'portable backup and Web Locks required');
    return env.navigator.locks.request('curvature-modern-managed-rehearsal',
      {mode:'exclusive',ifAvailable:true},async lock=>{
        check(lock,'another rehearsal is active; close the other tab and retry');
        const preview=await backup.previewEmptyRestore(archive,env);
        check(preview.empty,'rehearsal requires an empty disposable browser profile');
        const data=JSON.parse(archive.payload).content;
        const present=data.databases.filter(db=>db.status==='present');
        check(!present.some(db=>db.name===deps.CurvatureModernManagedObjectStore.DATABASE),
          'source already contains a managed store; use graph restore instead');
        const adapter=create(env,deps);
        check(adapter.store.coordination==='participating-writer','backup coordination required');
        const covered=new Set(),partial=new Map(),imported={},skipped=[],standalone=[],originals=new Map();
        function rows(database,store,onlyKey){
          const path=database+'/'+store;
          const source=present.find(db=>db.name===database)?.stores.find(s=>s.name===store);
          const selected=(source?.records||[]).filter(row=>onlyKey===undefined||backup.decode(row.key)===onlyKey);
          if(onlyKey===undefined)covered.add(path);
          else{
            check(selected.length<=1,'duplicate shared checkpoint key');
            partial.set(path,(partial.get(path)||0)+selected.length);
          }
          return selected.map(row=>({key:backup.decode(row.key),value:backup.decode(row.value)}));
        }
        const identityKey=v=>{const i=deps.CurvatureModernReferenceImage.validateIdentity(v);
          return i.sha256+':'+i.width+'x'+i.height;};
        async function each(kind,entries,operation,keyIsId=true){
          imported[kind]=0;
          for(const entry of entries){
            let acknowledged=false;
            try{
              check(entry.value&&(!keyIsId||entry.key===entry.value.id),'source row ID mismatch');
              await operation(entry.value,()=>{acknowledged=true;});
              imported[kind]++;
            }catch(error){
              // A refused write is safely skippable. An acknowledged root
              // that cannot be verified is not: discard this test profile.
              if(acknowledged)throw Error('Rehearsal verification failed after commit: '+
                kind+' '+String(entry.key)+'; discard this disposable profile: '+String(error.message||error));
              skipped.push({kind,id:String(entry.key),reason:String(error.message||error)});
            }
          }
        }
        const annotations=rows('curvature-modern-reference-images','annotations');
        const observations=rows('curvature-modern-reference-images','observations');
        const annotationMap=new Map(annotations.map(entry=>[entry.key,entry.value]));
        for(const entry of annotations){
          if(!entry.value||entry.value.id!==entry.key||!observations.some(row=>row.key===entry.key))
            skipped.push({kind:'annotation',id:String(entry.key),reason:'invalid or orphan classification'});
        }
        await each('observation',observations,async (row,ack)=>{
          const a=annotationMap.get(row.id);
          if(a)check(a.id===row.id&&positive(a.revision),'invalid classification revision');
          const identity=await deps.CurvatureModernReferenceImageImport.identify(row.record,env);
          const key=identityKey(identity);
          const saved=await adapter.saveObservation({...row,...(a?{
            kind:a.kind,tags:a.tags,collections:a.collections,annotationRevision:a.revision}:{} )},
            {originalId:originals.get(key)});
          ack();
          check(await adapter.readObservation(row.id),'migrated observation missing');
          originals.set(key,saved.originalId);
        });
        const resultRows=rows('curvature-modern-calibration-results','results');
        const archived=new Set(resultRows.map(row=>row.key));
        await each('calibration-result',resultRows,async (row,ack)=>{
          const originalId=originals.get(identityKey(row.record.payload.photo));
          check(originalId,'verified original absent from migrated observations');
          await adapter.saveCalibrationResult(row,{originalId});
          ack();
          check(await adapter.readCalibrationResult(row.id),'migrated calibration result missing');
        });
        function standalonePolicy(origins){
          if(!origins.length)return false;
          const available=origins.filter(origin=>archived.has(origin.resultId));
          check(!available.length||available.length===origins.length,
            'mixed local and unresolved calibration evidence requires explicit recovery');
          return !available.length;
        }
        await each('history',rows('curvature-modern-experiment-history','snapshots'),async (row,ack)=>{
          const mode=standalonePolicy([row.experiment.calibrationOrigin].filter(Boolean));
          await adapter.saveHistory(row,{standalone:mode});
          ack();
          check(await adapter.readHistory(row.id),'migrated History row missing');
          if(mode)standalone.push({kind:'history',id:row.id,reason:'archive absent in source'});
        });
        await each('animation',rows('curvature-modern-animation-library','projects'),async (row,ack)=>{
          const project=deps.CurvatureModernAnimationProject.validate(row.project);
          const origins=[project.baseExperiment,...(project.mode==='experimental'?project.keyframes.map(f=>f.value):[])]
            .map(e=>e.calibrationOrigin).filter(Boolean);
          const mode=standalonePolicy(origins);
          await adapter.saveAnimation(row,{standalone:mode});
          ack();
          check(await adapter.readAnimation(row.id),'migrated Animation missing');
          if(mode)standalone.push({kind:'animation',id:row.id,reason:'archive absent in source'});
        });
        await each('calibration',rows('curvature-photo-calibration','projects'),async (row,ack)=>{
          const originalId=row.photo?originals.get(identityKey(row.photo.identity)):null;
          check(!row.photo||originalId,'verified Calibration Project original missing');
          await adapter.saveCalibrationProject(row,{originalId});
          ack();
          check(await adapter.readCalibrationProject(row.id),'migrated Calibration Project missing');
        });
        // Only the acknowledged shared rows are adopted here. The other
        // keys in the same legacy stores remain explicit unhandled evidence.
        const missingArchiveIds=origins=>[...new Set(origins.map(o=>o.resultId))]
          .filter(id=>!archived.has(id));
        await each('working-checkpoint',rows('curvature-modern-working-session','session','shared-checkpoint'),
          async (input,ack)=>{
            const session=deps.CurvatureModernSessionAutosave,contract=deps.CurvatureModernDocumentSession;
            check(session&&contract,'working checkpoint contracts unavailable');
            const row=await session.validateSharedCheckpoint(input,deps.CurvatureModernExperimentState,env.crypto,contract);
            const missing=missingArchiveIds([row.experiment.calibrationOrigin,row.draft?.calibrationOrigin].filter(Boolean));
            await adapter.saveWorkingCheckpoint(row,{standaloneResultIds:missing});
            ack();
            const read=await adapter.readWorkingCheckpoint();
            check(read?.row.digest===row.digest,'migrated working checkpoint mismatch');
            for(const resultId of missing)standalone.push({kind:'working-checkpoint',id:'shared-checkpoint',
              resultId,reason:'archive absent in source'});
          },false);
        await each('animation-working',rows('curvature-modern-animation-draft','draft','shared-workspaces-v1'),
          async (input,ack)=>{
            const drafts=deps.CurvatureModernAnimationDraftAutosave;
            check(drafts,'Animation working collection contract unavailable');
            const row=await drafts.verifySharedRow(input,env.crypto);
            const missing=missingArchiveIds(draftInventory(row).origins);
            await adapter.saveAnimationWorkingCollection(row,{standaloneResultIds:missing});
            ack();
            const read=await adapter.readAnimationWorkingCollection();
            check(read?.row.digest===row.digest,'migrated Animation working collection mismatch');
            for(const resultId of missing)standalone.push({kind:'animation-working',id:'shared-workspaces-v1',
              resultId,reason:'archive absent in source'});
          },false);
        const unhandled=[];
        for(const db of present)for(const store of db.stores){
          const key=db.name+'/'+store.name;
          const remaining=store.records.length-(partial.get(key)||0);
          if(remaining&&!covered.has(key))
            unhandled.push({source:key,records:remaining});
        }
        if(data.webStorage.local.length)unhandled.push({source:'localStorage',records:data.webStorage.local.length});
        if(data.webStorage.session.length)unhandled.push({source:'sessionStorage',records:data.webStorage.session.length});
        const integrity=await adapter.store.verifyIntegrity();
        check(integrity.valid,'managed graph failed integrity verification');
        return {imported,skipped,standalone,unhandled,originals:originals.size,
          integrity,eligibleForMigration:false,sourceUntouched:true};
      });
  }
  // Only an empty disposable profile may be restored. Exact portable
  // restore precedes typed verification; failure preserves the target as
  // diagnostic evidence and never authorizes production activation.
  async function restoreAndQualifyManagedArchive(archive,env,deps=env){
    const backup=deps.CurvatureModernPortableBackup;
    check(backup&&env?.navigator?.locks,'portable backup and Web Locks required');
    return env.navigator.locks.request('curvature-modern-managed-rehearsal',
      {mode:'exclusive',ifAvailable:true},async lock=>{
        check(lock,'another rehearsal is active; close the other tab and retry');
        await backup.inspect(archive,env.crypto);
        const database=JSON.parse(archive.payload).content.databases.find(db=>
          db.name===deps.CurvatureModernManagedObjectStore.DATABASE&&db.status==='present');
        check(database,'archive contains no managed store');
        const adapter=create(env,deps);
        check(adapter.store.coordination==='participating-writer','backup coordination required');
        const restored=await backup.restoreEmpty(archive,env);
        try{
          const qualification=await adapter.qualifyRestoredArchive(database,backup);
          // Qualification is read-only. Re-observe the exact managed store
          // to detect intervening writes in the disposable test profile.
          const after=(await backup.captureCoordinated(env)).archive;
          const observed=JSON.parse(after.payload).content.databases.find(db=>db.name===database.name);
          check(same(database,observed),'managed restore changed during qualification');
          return {restored,qualification,eligibleForMigration:false};
        }catch(error){
          throw Error('Managed restore qualification failed; discard this disposable profile: '+String(error.message||error));
        }
      });
  }
  return Object.freeze({create,rehearseLegacyArchive,restoreAndQualifyManagedArchive,SNAPSHOT,ORIGINAL,OBSERVATION,ANIMATION,RESULT,CALIBRATION,DRAFTS});
}));

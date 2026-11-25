/* Opt-in domain adapters. No production store routing or automatic migration. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernManagedResources=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SNAPSHOT='experiment-snapshot',ORIGINAL='original-image',OBSERVATION='reference-observation',ANIMATION='animation-project',RESULT='calibration-result',CALIBRATION='calibration-project',
    DRAFTS='animation-working-collection';
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
      results=deps.CurvatureModernCalibrationResult,calibrations=deps.CurvatureModernCalibrationProject,
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
    async function saveHistory(row,{expectedRevision=0,snapshotId,standalone=false}={}){
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
        else evidence=standalone===true?'standalone':{result:await resolveOrigin(experiment.calibrationOrigin)};
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
      const document=await store.writeDocument({documentId:historyId(row.id),kind:'history',
        expectedRevision,metadata,references:[strong('snapshot',id)],resources});
      return {snapshotId:id,managedRevision:document.revision};
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
      return {row:{...metadata,experiment:item.experiment,signature:fp.exactSignature(item.experiment),
        physicalSignature:fp.physicalSignature(item.experiment),features:fp.features(item.experiment)},
        snapshotId:snapshot.id,managedRevision:graph.document.revision,evidence:snapshot.payload.evidence};
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
    async function saveObservation(row,{expectedRevision=0,originalId}={}){
      check(row&&row.record,'observation row required');
      const record=images.validate(row.record);
      check(record.id===row.id,'observation alias mismatch');
      const metadata={id:row.id,revision:row.revision,...classification(row)};
      const original=await originalFrom(record);
      const binaryId=originalId??store.newObjectId();
      const resources=[];
      if(originalId!==undefined){
        const previous=await store.get(binaryId);
        check(previous&&previous.type===ORIGINAL&&same(previous.payload.identity,original.identity)&&
          await bytesEqual(previous.payload.blob,original.blob),'original reuse requires verified identical bytes');
      }else resources.push({id:binaryId,type:ORIGINAL,version:1,payload:original});
      const id=store.newObjectId();
      resources.push({id,type:OBSERVATION,version:1,payload:{id:record.id,attribution:attribution(record),
        originalId:binaryId,identity:original.identity,thumbnail:record.thumbnail??null}});
      const document=await store.writeDocument({documentId:observationId(row.id),kind:'observation',
        expectedRevision,metadata,references:[strong('observation',id)],resources});
      return {observationId:id,originalId:binaryId,managedRevision:document.revision};
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
      const graph=await store.readDocumentGraph(observationId(id));
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
      const graph=await store.readDocumentGraph(resultDocumentId(id));
      if(!graph)return null;
      check(graph.document.kind==='calibration-result'&&graph.document.references.length===1,
        'invalid calibration archive root');
      const result=pick(graph,'result',RESULT),record=result.payload.record,meta=graph.document.metadata;
      check(record.id===id&&meta.id===id&&positive(meta.createdAt),'calibration result alias mismatch');
      const original=await verifyResultOriginal(graph,result);
      return {row:{id,createdAt:meta.createdAt,record},resultId:result.id,
        originalId:result.payload.originalId,original,managedRevision:graph.document.revision};
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
      const document=await store.writeDocument({documentId:'calibration:'+project.id,kind:'calibration',
        expectedRevision,metadata:{id:project.id},references:[strong('project',id)],
        resources:[{id,type:CALIBRATION,version:1,payload:{project,originalId,results:references}}]});
      return {projectId:id,managedRevision:document.revision};
    }
    async function readCalibrationProject(id){
      check(calibrations&&checkpoints,'Calibration Project adapters unavailable');
      const graph=await store.readDocumentGraph('calibration:'+calibrations.id(id));
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
            let target=retainedEvidence.get(origin.resultId);
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
        const graph=await store.readDocumentGraph(observationId(alias));
        check(graph&&graph.document.kind==='observation','required observation missing: '+alias);
        const value=pick(graph,'observation',OBSERVATION);
        check(value.payload.id===alias,'observation alias mismatch');
        await materializeObservation(graph,value);
        observations.push({alias,target:value.id});
      }
      const payload={project,observations,evidence};
      const id=store.newObjectId();
      const document=await store.writeDocument({documentId:'animation:'+project.id,kind:'animation',
        expectedRevision,metadata,references:[strong('project',id)],
        resources:[{id,type:ANIMATION,version:1,payload}]});
      return {projectId:id,managedRevision:document.revision};
    }
    async function readAnimation(id){
      check(projects&&animations,'Animation adapters unavailable');
      const graph=await store.readDocumentGraph('animation:'+images.validId(id));
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
    async function saveWorkingCheckpoint(input,{expectedRevision=0,standalone=false,standaloneResultIds=[]}={}){
      workingContracts();
      const allowedStandalone=explicitStandaloneIds(standaloneResultIds);
      const row=await session.validateSharedCheckpoint(input,state,env.crypto,sessionContract);
      const previous=expectedRevision===0?null:await loadWorkingCheckpoint(store.readDocumentClosureForWrite);
      check(expectedRevision===0||previous?.managedRevision===expectedRevision,
        'working checkpoint revision conflict');
      check(!previous||row.revision===previous.row.revision+1,'working checkpoint source revision must advance once');
      const retained=[];
      if(previous)for(const [slot,experiment] of [['committed',previous.row.experiment],['draft',previous.row.draft]]){
        if(experiment)retained.push({id:previous.snapshots[slot].id,
          payload:{experiment,evidence:previous.snapshots[slot].evidence}});
      }
      const resources=[],references=[];
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
          else evidence={result:await resolveOrigin(origin)};
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
      const saved=await store.writeDocument({documentId:workingId,kind:'working-checkpoint',
        expectedRevision,metadata,references,resources});
      return {managedRevision:saved.revision};
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
      check(graph.document.kind===DRAFTS&&graph.document.references.length===1&&
        exact(graph.document.metadata,['sourceRevision']),'invalid Animation working root');
      const resource=pick(graph,'collection',DRAFTS),v=resource.payload;
      const row=await drafts.verifySharedRow(v.row,env.crypto);
      check(graph.document.metadata.sourceRevision===row.revision,'Animation working revision mismatch');
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
    async function saveAnimationWorkingCollection(input,{expectedRevision=0,standalone=false,standaloneResultIds=[]}={}){
      draftContracts();
      const allowedStandalone=explicitStandaloneIds(standaloneResultIds);
      const row=await drafts.verifySharedRow(input,env.crypto);
      const previous=expectedRevision===0?null:await loadAnimationWorkingCollection(store.readDocumentClosureForWrite,false);
      check(expectedRevision===0||previous?.managedRevision===expectedRevision,
        'Animation working revision conflict');
      check(!previous||row.revision===previous.row.revision+1,'Animation working source revision must advance once');
      const inventory=draftInventory(row),oldInventory=previous?draftInventory(previous.row):null;
      const oldPhotos=new Map((previous?.observations||[]).map(entry=>[entry.alias,entry.target]));
      const oldResults=new Map((previous?.evidence||[]).map(entry=>[entry.alias,entry.target]));
      const observations=[],evidence=[];
      for(const alias of inventory.photos){
        let target=oldPhotos.get(alias);
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
      const document=await store.writeDocument({documentId:draftsId,kind:DRAFTS,
        expectedRevision,metadata:{sourceRevision:row.revision},references:[strong('collection',id)],
        resources:[{id,type:DRAFTS,version:1,payload:{row,observations,evidence}}]});
      return {collectionId:id,managedRevision:document.revision};
    }
    // Read verified domain rows, one closure at a time. A second inventory
    // refuses a mixed-revision list rather than silently dropping changed
    // documents. Revisions never roll back or reuse retired document IDs.
    async function listVerified(kind,reader,documentId,project,compare){
      const before=await store.listDocuments(kind),out=[];
      for(const doc of before){
        const alias=doc.metadata?.id;
        check(doc.id===documentId(alias),'invalid '+kind+' root alias');
        const value=await reader(alias);
        check(value&&value.managedRevision===doc.revision,
          kind+' inventory changed; reload and retry');
        out.push({row:project(value),managedRevision:value.managedRevision});
      }
      const after=await store.listDocuments(kind);
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
    return Object.freeze({store,qualifyRestoredArchive,saveWorkingCheckpoint,readWorkingCheckpoint,
      saveAnimationWorkingCollection,readAnimationWorkingCollection,
      saveHistory,readHistory,saveObservation,readObservation,saveAnimation,readAnimation,
      saveCalibrationResult,readCalibrationResult,saveCalibrationProject,readCalibrationProject,
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

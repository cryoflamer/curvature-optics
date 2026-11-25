/* Opt-in domain adapters. No production store routing or automatic migration. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernManagedResources=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SNAPSHOT='experiment-snapshot',ORIGINAL='original-image',OBSERVATION='reference-observation',ANIMATION='animation-project',RESULT='calibration-result',CALIBRATION='calibration-project';
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
  function create(env,deps=env){
    const core=deps.CurvatureModernManagedObjectStore,state=deps.CurvatureModernExperimentState,
      history=deps.CurvatureModernExperimentHistory,fp=deps.CurvatureModernExperimentFingerprint,
      images=deps.CurvatureModernReferenceImage,importer=deps.CurvatureModernReferenceImageImport,
      library=deps.CurvatureModernReferenceImageLibrary,
      projects=deps.CurvatureModernAnimationProject,animations=deps.CurvatureModernAnimationLibrary,
      results=deps.CurvatureModernCalibrationResult,calibrations=deps.CurvatureModernCalibrationProject,
      checkpoints=deps.CurvatureModernCalibrationProjectCheckpoint;
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
        (v.thumbnail===null||exact(v.thumbnail,['dataUrl','width','height'])),
        references:v=>[strong('original',v.originalId)]}
    ];
    function aliases(project){
      return [...new Set(project.keyframes.flatMap(frame=>frame.referenceImageIds||[]))].sort();
    }
    function calibrationOrigins(project){
      return [project.baseExperiment,...(project.mode==='experimental'?project.keyframes.map(frame=>frame.value):[])]
        .map(experiment=>experiment.calibrationOrigin).filter(Boolean);
    }
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
      let evidence='none';
      if(experiment.calibrationOrigin){
        evidence=standalone===true?'standalone':{result:await resolveOrigin(experiment.calibrationOrigin)};
      }
      const payload={experiment,evidence};
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
    async function materializeOriginal(original,id,attribution,thumbnail=null){
      check(original?.type===ORIGINAL,'missing original resource');
      const {identity,blob}=original.payload,bytes=new Uint8Array(await blob.arrayBuffer());
      const record=images.validate({id,version:images.VERSION,...attribution,
        original:{dataUrl:importer.dataUrl(bytes,blob.type.slice(6)),width:identity.width,height:identity.height},
        ...(thumbnail?{thumbnail}:{})});
      check(same(await importer.identify(record,env),identity),'original evidence digest mismatch');
      return record;
    }
    async function materializeObservation(graph,observation){
      const v=observation.payload;
      const original=graph.resources.find(r=>r.id===v.originalId);
      check(original?.type===ORIGINAL&&same(original.payload.identity,v.identity),'observation evidence mismatch');
      return materializeOriginal(original,v.id,v.attribution,v.thumbnail);
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
    async function verifyResultOriginal(graph,result){
      check(result?.type===RESULT,'calibration result resource missing');
      const original=graph.resources.find(r=>r.id===result.payload.originalId);
      const record=result.payload.record;
      check(original?.type===ORIGINAL&&same(original.payload.identity,record.payload.photo),
        'calibration original identity mismatch');
      return materializeOriginal(original,'calibration_evidence',record.provenance.attribution);
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
      check(project.photo?objectId(originalId):originalId===null,'Calibration Project photo mapping required');
      const original=originalId?await store.get(originalId):null;
      await prepareCalibration(project,original);
      const references=[];
      for(const alias of project.resultIds){
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
      const origins=calibrationOrigins(project);
      let evidence='none';
      if(origins.length){
        if(standalone===true)evidence='standalone';
        else{
          const mapped=new Map();
          for(const origin of origins){
            const target=await resolveOrigin(origin);
            if(mapped.has(origin.resultId))check(mapped.get(origin.resultId)===target,'calibration evidence changed');
            mapped.set(origin.resultId,target);
          }
          evidence=[...mapped].sort(([a],[b])=>a.localeCompare(b)).map(([alias,target])=>({alias,target}));
        }
      }
      const observations=[];
      for(const alias of aliases(project)){
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
    return Object.freeze({store,saveHistory,readHistory,saveObservation,readObservation,saveAnimation,readAnimation,
      saveCalibrationResult,readCalibrationResult,saveCalibrationProject,readCalibrationProject});
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
        const covered=new Set(),imported={},skipped=[],standalone=[],originals=new Map();
        function rows(database,store){
          covered.add(database+'/'+store);
          const source=present.find(db=>db.name===database)?.stores.find(s=>s.name===store);
          return (source?.records||[]).map(row=>({key:backup.decode(row.key),value:backup.decode(row.value)}));
        }
        const identityKey=v=>{const i=deps.CurvatureModernReferenceImage.validateIdentity(v);
          return i.sha256+':'+i.width+'x'+i.height;};
        async function each(kind,entries,operation){
          imported[kind]=0;
          for(const entry of entries){
            let acknowledged=false;
            try{
              check(entry.value&&entry.key===entry.value.id,'source row ID mismatch');
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
        const unhandled=[];
        for(const db of present)for(const store of db.stores){
          const key=db.name+'/'+store.name;
          if(store.records.length&&!covered.has(key))
            unhandled.push({source:key,records:store.records.length});
        }
        if(data.webStorage.local.length)unhandled.push({source:'localStorage',records:data.webStorage.local.length});
        if(data.webStorage.session.length)unhandled.push({source:'sessionStorage',records:data.webStorage.session.length});
        const integrity=await adapter.store.verifyIntegrity();
        check(integrity.valid,'managed graph failed integrity verification');
        return {imported,skipped,standalone,unhandled,originals:originals.size,
          integrity,eligibleForMigration:false,sourceUntouched:true};
      });
  }
  return Object.freeze({create,rehearseLegacyArchive,SNAPSHOT,ORIGINAL,OBSERVATION,ANIMATION,RESULT,CALIBRATION});
}));

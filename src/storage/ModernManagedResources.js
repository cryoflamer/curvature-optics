/* Opt-in domain adapters. No production store routing or automatic migration. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernManagedResources=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SNAPSHOT='experiment-snapshot',ORIGINAL='original-image',OBSERVATION='reference-observation';
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
      library=deps.CurvatureModernReferenceImageLibrary;
    check(core&&state&&history&&fp&&images&&importer&&library,'domain dependencies required');
    const types=[
      {type:SNAPSHOT,version:1,validate:v=>{
        if(!exact(v,['experiment','evidence']))return false;
        const e=state.validate(v.experiment);
        return same(e,v.experiment)&&v.evidence===(e.calibrationOrigin?'standalone':'none');
      },references:()=>[]},
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
      check(!experiment.calibrationOrigin||standalone===true,
        'calibrated local snapshot requires evidence mapping; standalone import must be explicit');
      const payload={experiment,evidence:experiment.calibrationOrigin?'standalone':'none'};
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
    async function readObservation(id){
      const graph=await store.readDocumentGraph(observationId(id));
      if(!graph)return null;
      check(graph.document.kind==='observation'&&graph.document.references.length===1,'invalid observation root');
      const observation=pick(graph,'observation',OBSERVATION),v=observation.payload;
      const original=graph.resources.find(r=>r.id===v.originalId);
      check(v.id===id&&graph.document.metadata.id===id&&original?.type===ORIGINAL&&
        same(original.payload.identity,v.identity),'observation evidence mismatch');
      const blob=original.payload.blob,bytes=new Uint8Array(await blob.arrayBuffer());
      const record=images.validate({id,version:images.VERSION,...v.attribution,
        original:{dataUrl:importer.dataUrl(bytes,blob.type.slice(6)),width:v.identity.width,height:v.identity.height},
        ...(v.thumbnail?{thumbnail:v.thumbnail}:{})});
      check(same(await importer.identify(record,env),v.identity),'original evidence digest mismatch');
      const metadata=graph.document.metadata;
      return {row:{id,revision:metadata.revision,record,...classification(metadata)},
        observationId:observation.id,originalId:original.id,managedRevision:graph.document.revision};
    }
    return Object.freeze({store,saveHistory,readHistory,saveObservation,readObservation});
  }
  return Object.freeze({create,SNAPSHOT,ORIGINAL,OBSERVATION});
}));

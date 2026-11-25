/* Opt-in managed resource graph. Not wired into Modern or portable backup yet. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernManagedObjectStore=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DATABASE='curvature-modern-managed-objects',VERSION=1,MAX_GC_BATCH=64;
  const STORES=['documents','objects','payloads','references'];
  const TOKEN=/^[A-Za-z0-9_.:-]{1,128}$/;
  const check=(ok,message)=>{if(!ok)throw Error('Managed Object Store: '+message);};
  const token=(value,label)=>{check(typeof value==='string'&&TOKEN.test(value),'invalid '+label);return value;};
  const revision=value=>{check(Number.isSafeInteger(value)&&value>=0,'expected revision required');return value;};
  const key=e=>[e.ownerKind,e.ownerId,e.slot];
  const edgeId=e=>JSON.stringify(key(e));
  const typeKey=(type,version)=>JSON.stringify([type,version]);
  const clone=value=>structuredClone(value);
  function request(req){
    return new Promise((resolve,reject)=>{
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||Error('IndexedDB request failed'));
    });
  }
  function open(indexedDB){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DATABASE,VERSION);
      let blocked=false;
      req.onblocked=()=>{blocked=true;reject(Error('Managed Object Store: database upgrade blocked; close other tabs and retry'));};
      req.onerror=()=>reject(req.error);
      req.onupgradeneeded=event=>{
        if(event.oldVersion!==0){req.transaction.abort();return;}
        const db=req.result;
        db.createObjectStore('documents',{keyPath:'id'});
        db.createObjectStore('objects',{keyPath:'id'});
        db.createObjectStore('payloads',{keyPath:'id'});
        const refs=db.createObjectStore('references',{keyPath:['ownerKind','ownerId','slot']});
        refs.createIndex('owner',['ownerKind','ownerId']);
        refs.createIndex('target','target');
      };
      req.onsuccess=()=>{
        const db=req.result;
        if(blocked){db.close();return;}
        db.onversionchange=()=>db.close();
        resolve(db);
      };
    });
  }
  async function transaction(indexedDB,mode,work){
    const db=await open(indexedDB);
    try{
      const tx=db.transaction(STORES,mode);
      const done=new Promise((resolve,reject)=>{
        tx.oncomplete=resolve;
        tx.onabort=()=>reject(tx.error||Error('Managed Object Store: transaction aborted'));
      });
      // Observe early aborts while individual requests are still pending.
      done.catch(()=>{});
      const stores=Object.fromEntries(STORES.map(name=>[name,tx.objectStore(name)]));
      try{
        const result=await work(stores);
        await done;
        return result;
      }catch(error){
        try{tx.abort();}catch(ignored){/* already ended */}
        await done.catch(()=>{});
        throw error;
      }
    }finally{db.close();}
  }
  function slots(value){
    check(Array.isArray(value),'references must be an array');
    const seen=new Set();
    return value.map(ref=>{
      check(ref&&typeof ref==='object','invalid reference');
      const slot=token(ref.slot,'slot'),target=token(ref.target,'target');
      check(ref.strength==='strong'||ref.strength==='weak','invalid reference strength');
      check(!seen.has(slot),'duplicate reference slot');
      seen.add(slot);
      return {slot,target,strength:ref.strength};
    });
  }
  async function graph(stores){
    const [docs,objects,refs,payloadKeys]=await Promise.all([
      request(stores.documents.getAll()),request(stores.objects.getAll()),
      request(stores.references.getAll()),request(stores.payloads.getAllKeys())
    ]);
    return {docs:new Map(docs.map(row=>[row.id,row])),
      objects:new Map(objects.map(row=>[row.id,row])),
      refs:new Map(refs.map(row=>[edgeId(row),row])),payloadKeys:new Set(payloadKeys)};
  }
  // All metadata, but no binary payloads, are read by the initial implementation.
  // Acyclicity is checked iteratively, so graph depth does not consume the stack.
  function inspect(g,types,allowCountMismatch=false){
    const counts=new Map(),degrees=new Map(),children=new Map();
    for(const [id,obj] of g.objects){
      token(id,'object ID');
      check(obj.id===id&&typeof obj.deleted==='boolean','invalid object row');
      if(obj.deleted){
        check(!g.payloadKeys.has(id)&&obj.refCount===0,'invalid object tombstone');
        continue;
      }
      check(types.has(typeKey(obj.type,obj.version)),'unsupported resource type/version');
      check(g.payloadKeys.has(id),'missing payload');
      counts.set(id,0);degrees.set(id,0);children.set(id,[]);
    }
    for(const id of g.payloadKeys)check(counts.has(id),'orphan payload');
    for(const [id,doc] of g.docs){
      token(id,'document ID');token(doc.kind,'document kind');
      check(doc.id===id&&revision(doc.revision)>0&&typeof doc.deleted==='boolean','invalid document revision');
    }
    for(const [id,edge] of g.refs){
      check(id===edgeId(edge),'invalid edge key');
      slots([edge]);
      check(edge.ownerKind==='document'||edge.ownerKind==='object','invalid reference owner');
      check(edge.ownerKind==='document'?g.docs.has(edge.ownerId)&&!g.docs.get(edge.ownerId).deleted:counts.has(edge.ownerId),'missing reference owner');
      check(g.objects.has(edge.target),'unknown reference target');
      if(edge.strength==='weak')continue;
      check(counts.has(edge.target),'missing strong target');
      counts.set(edge.target,counts.get(edge.target)+1);
      if(edge.ownerKind==='object'){
        degrees.set(edge.target,degrees.get(edge.target)+1);
        children.get(edge.ownerId).push(edge.target);
      }
    }
    const queue=[...degrees].filter(([,n])=>n===0).map(([id])=>id);
    for(let i=0;i<queue.length;i++){
      for(const child of children.get(queue[i])){
        const n=degrees.get(child)-1;degrees.set(child,n);
        if(n===0)queue.push(child);
      }
    }
    check(queue.length===counts.size,'strong reference cycle');
    const mismatches=[];
    for(const [id,count] of counts){
      if(g.objects.get(id).refCount!==count)mismatches.push({id,expected:count,actual:g.objects.get(id).refCount});
    }
    check(allowCountMismatch||!mismatches.length,'reference count mismatch');
    return {counts,mismatches};
  }
  async function verifyPayloads(g,stores,types){
    const rows=await request(stores.payloads.getAll());
    const edgeCounts=new Map();
    for(const edge of g.refs.values())if(edge.ownerKind==='object')
      edgeCounts.set(edge.ownerId,(edgeCounts.get(edge.ownerId)||0)+1);
    for(const row of rows){
      const obj=g.objects.get(row.id);
      const adapter=obj&&!obj.deleted&&types.get(typeKey(obj.type,obj.version));
      check(adapter&&adapter.validate(clone(row.value))===true,'invalid or unsupported payload');
      const expected=slots(adapter.references(clone(row.value)));
      check(expected.length===(edgeCounts.get(row.id)||0)&&expected.every(ref=>{
        const edge=g.refs.get(edgeId({ownerKind:'object',ownerId:row.id,slot:ref.slot}));
        return edge&&edge.target===ref.target&&edge.strength===ref.strength;
      }),'payload reference mismatch');
    }
  }
  function reachable(g){
    const children=new Map(),seen=new Set(),queue=[];
    for(const edge of g.refs.values()){
      if(edge.strength!=='strong')continue;
      if(edge.ownerKind==='document'){
        if(!seen.has(edge.target)){seen.add(edge.target);queue.push(edge.target);}
      }else{
        if(!children.has(edge.ownerId))children.set(edge.ownerId,[]);
        children.get(edge.ownerId).push(edge.target);
      }
    }
    for(let i=0;i<queue.length;i++)for(const id of children.get(queue[i])||[]){
      if(!seen.has(id)){seen.add(id);queue.push(id);}
    }
    return seen;
  }
  function setEdge(g,stores,edge){
    const id=edgeId(edge);
    g.refs.set(id,edge);
    stores.references.put(edge);
  }
  function dropEdge(g,stores,edge){
    g.refs.delete(edgeId(edge));
    stores.references.delete(key(edge));
  }
  function updateCounts(g,stores,types){
    const {counts,mismatches}=inspect(g,types,true);
    for(const {id} of mismatches){
      const row={...g.objects.get(id),refCount:counts.get(id)};
      g.objects.set(id,row);stores.objects.put(row);
    }
    return mismatches.length;
  }
  function create(env,{types:definitions}={}){
    check(env?.indexedDB&&typeof env.indexedDB.open==='function','IndexedDB required');
    check(env?.crypto&&typeof env.crypto.randomUUID==='function','UUID generator required');
    check(Array.isArray(definitions)&&definitions.length>0,'resource types required');
    const types=new Map();
    for(const definition of definitions){
      const {type,version,validate,references}=definition;
      token(type,'type');check(Number.isSafeInteger(version)&&version>0,'invalid type version');
      check(typeof validate==='function'&&typeof references==='function','type adapter required');
      const id=typeKey(type,version);check(!types.has(id),'duplicate type adapter');
      types.set(id,{validate,references});
    }
    // Schema-capable reads also participate: an otherwise read-only open
    // can create the database. Test/standalone callers without the barrier
    // remain explicitly uncoordinated, never eligible for live cutover.
    const barrier=env.CurvatureModernBackupWriteBarrier;
    const writer=barrier&&env.navigator?.locks?
      barrier.create(env.navigator.locks).registerWriter('managed.objects'):null;
    const run=(mode,fn)=>{
      const action=()=>transaction(env.indexedDB,mode,fn);
      return writer?writer.commit(action):action();
    };
    const owned=(g,id,slot)=>g.refs.get(edgeId({ownerKind:'document',ownerId:id,slot}));
    function checkedDocument(g,id,expected){
      const doc=g.docs.get(id);
      check((doc?.revision??0)===expected,'stale document revision');
      check(!doc?.deleted,'document ID retired');
      return doc;
    }
    function saveDocument(g,stores,doc){
      check(Number.isSafeInteger(doc.revision),'document revision exhausted');
      g.docs.set(doc.id,doc);stores.documents.put(doc);
      return clone(doc);
    }
    // IDs can be allocated before assembling a graph. Allocation does not
    // reserve a row; the atomic write rejects collisions, including tombstones.
    function newObjectId(){return token(env.crypto.randomUUID(),'generated object ID');}
    function prepareResource({id,type,version,payload}){
      token(id,'object ID');
      const adapter=types.get(typeKey(type,version));check(adapter,'unsupported resource type/version');
      const value=clone(payload);
      check(adapter.validate(clone(value))===true,'invalid payload');
      return {id,type,version,value,refs:slots(adapter.references(clone(value)))};
    }
    function insertResource(g,stores,{id,type,version,value,refs}){
      check(!g.objects.has(id),'object ID collision');
      const row={id,type,version,refCount:0,deleted:false};
      g.objects.set(id,row);stores.objects.add(row);
      g.payloadKeys.add(id);stores.payloads.add({id,value});
      for(const ref of refs)setEdge(g,stores,{ownerKind:'object',ownerId:id,...ref});
    }
    async function createAndAttach({documentId,kind,expectedRevision,metadata,slot,type,version,payload}){
      token(documentId,'document ID');token(kind,'document kind');token(slot,'slot');revision(expectedRevision);
      // Clone before and after adapter calls: neither callers nor adapters retain
      // a mutable alias into the stored payload. Validators must be synchronous.
      const id=newObjectId(),resource=prepareResource({id,type,version,payload});
      const meta=clone(metadata);
      return run('readwrite',async stores=>{
        const g=await graph(stores);inspect(g,types);
        const old=checkedDocument(g,documentId,expectedRevision);
        check(!old||old.kind===kind,'document kind mismatch');
        insertResource(g,stores,resource);
        setEdge(g,stores,{ownerKind:'document',ownerId:documentId,slot,target:id,strength:'strong'});
        const document=saveDocument(g,stores,{id:documentId,kind,revision:expectedRevision+1,metadata:meta,deleted:false});
        updateCounts(g,stores,types);
        return {id,document};
      });
    }
    // Replace the complete root-slot set and metadata in one revision. This
    // also creates a new owner of already-existing resources without copying.
    async function writeDocument({documentId,kind,expectedRevision,metadata,references,resources=[]}){
      token(documentId,'document ID');token(kind,'document kind');revision(expectedRevision);
      const refs=slots(references),meta=clone(metadata);
      check(Array.isArray(resources),'resources must be an array');
      const prepared=resources.map(prepareResource);
      check(new Set(prepared.map(row=>row.id)).size===prepared.length,'duplicate new object ID');
      return run('readwrite',async stores=>{
        const g=await graph(stores);inspect(g,types);
        const old=checkedDocument(g,documentId,expectedRevision);
        check(!old||old.kind===kind,'document kind mismatch');
        const document=saveDocument(g,stores,{id:documentId,kind,revision:expectedRevision+1,metadata:meta,deleted:false});
        for(const resource of prepared)insertResource(g,stores,resource);
        for(const edge of [...g.refs.values()]){
          if(edge.ownerKind==='document'&&edge.ownerId===documentId)dropEdge(g,stores,edge);
        }
        for(const ref of refs)setEdge(g,stores,{ownerKind:'document',ownerId:documentId,...ref});
        updateCounts(g,stores,types);
        if(prepared.length){
          const retained=reachable(g);
          check(prepared.every(row=>retained.has(row.id)),'new resource is not strongly reachable from a document');
        }
        return document;
      });
    }
    async function setReference({documentId,expectedRevision,slot,target,strength='strong'}){
      token(documentId,'document ID');revision(expectedRevision);
      const [ref]=slots([{slot,target,strength}]);
      return run('readwrite',async stores=>{
        const g=await graph(stores);inspect(g,types);
        const doc=checkedDocument(g,documentId,expectedRevision);check(doc,'document missing');
        const old=owned(g,documentId,slot);
        if(old?.target===target&&old.strength===strength)return clone(doc);
        setEdge(g,stores,{ownerKind:'document',ownerId:documentId,...ref});
        updateCounts(g,stores,types);
        return saveDocument(g,stores,{...doc,revision:doc.revision+1});
      });
    }
    async function detach({documentId,expectedRevision,slot}){
      token(documentId,'document ID');token(slot,'slot');revision(expectedRevision);
      return run('readwrite',async stores=>{
        const g=await graph(stores);inspect(g,types);
        const doc=checkedDocument(g,documentId,expectedRevision);check(doc,'document missing');
        const old=owned(g,documentId,slot);
        if(!old)return clone(doc);
        dropEdge(g,stores,old);
        updateCounts(g,stores,types);
        return saveDocument(g,stores,{...doc,revision:doc.revision+1});
      });
    }
    async function get(id){
      token(id,'object ID');
      return run('readonly',async stores=>{
        const [obj,payload]=await Promise.all([request(stores.objects.get(id)),request(stores.payloads.get(id))]);
        if(!obj||obj.deleted){check(!payload,'orphan payload');return null;}
        const adapter=types.get(typeKey(obj.type,obj.version));
        check(adapter&&payload&&adapter.validate(clone(payload.value))===true,'invalid or unsupported payload');
        return {...obj,payload:payload.value};
      });
    }
    async function getDocument(id){
      token(id,'document ID');
      return run('readonly',async stores=>{
        const g=await graph(stores);inspect(g,types);
        const doc=g.docs.get(id);
        return doc&&!doc.deleted?{...doc,references:[...g.refs.values()].filter(e=>e.ownerKind==='document'&&e.ownerId===id)
          .map(({slot,target,strength})=>({slot,target,strength}))}:null;
      });
    }
    // Read a document and its entire strong closure from one IDB snapshot.
    // Separate getDocument()/get() calls cannot provide revision consistency.
    async function readDocumentGraph(id){
      token(id,'document ID');
      return run('readonly',async stores=>{
        const g=await graph(stores);inspect(g,types);
        const doc=g.docs.get(id);
        if(!doc||doc.deleted)return null;
        const byOwner=new Map();
        for(const edge of g.refs.values()){
          const k=JSON.stringify([edge.ownerKind,edge.ownerId]);
          if(!byOwner.has(k))byOwner.set(k,[]);
          byOwner.get(k).push(edge);
        }
        const edges=(kind,ownerId)=>byOwner.get(JSON.stringify([kind,ownerId]))||[];
        const rootEdges=edges('document',id),seen=new Set(),queue=[];
        function add(refs){
          for(const ref of refs)if(ref.strength==='strong'&&!seen.has(ref.target)){
            seen.add(ref.target);queue.push(ref.target);
          }
        }
        add(rootEdges);
        const resources=[];
        for(let i=0;i<queue.length;i++){
          const objectId=queue[i],obj=g.objects.get(objectId);
          const row=await request(stores.payloads.get(objectId));
          const adapter=types.get(typeKey(obj.type,obj.version));
          check(row&&adapter.validate(clone(row.value))===true,'invalid or unsupported payload');
          const actual=edges('object',objectId),expected=slots(adapter.references(clone(row.value)));
          check(expected.length===actual.length&&expected.every(ref=>actual.some(e=>
            e.slot===ref.slot&&e.target===ref.target&&e.strength===ref.strength)),'payload reference mismatch');
          resources.push({...obj,payload:row.value});
          add(actual);
        }
        return {document:{...doc,references:rootEdges.map(({slot,target,strength})=>({slot,target,strength}))},resources};
      });
    }
    // Scoped preflight for an ensuing CAS write. It verifies the actual
    // immutable strong closure, but deliberately makes no global integrity
    // claim. The final write still checks the entire current metadata graph.
    // Public restoration and destructive operations retain global checks.
    async function readDocumentClosureForWrite(id){
      token(id,'document ID');
      return run('readonly',async stores=>{
        const refsFor=async (kind,owner)=>{
          const rows=await request(stores.references.index('owner').getAll([kind,owner]));
          check(rows.every(e=>e.ownerKind===kind&&e.ownerId===owner),'invalid reference owner');
          return slots(rows);
        };
        const [doc,rootEdges]=await Promise.all([
          request(stores.documents.get(id)),refsFor('document',id)
        ]);
        if(doc){
          check(doc.id===id&&revision(doc.revision)>0&&typeof doc.deleted==='boolean','invalid document revision');
          token(doc.kind,'document kind');
        }
        if(!doc||doc.deleted){
          check(!rootEdges.length,'missing reference owner');return null;
        }
        const seen=new Set(),queue=[],weakTargets=new Set(),children=new Map(),resources=[];
        function add(refs){
          for(const ref of refs){
            if(ref.strength==='weak'){weakTargets.add(ref.target);continue;}
            if(!seen.has(ref.target)){seen.add(ref.target);queue.push(ref.target);}
          }
        }
        add(rootEdges);
        for(let i=0;i<queue.length;i++){
          const objectId=queue[i];
          const [obj,row,actual]=await Promise.all([
            request(stores.objects.get(objectId)),request(stores.payloads.get(objectId)),refsFor('object',objectId)
          ]);
          check(obj&&obj.id===objectId&&obj.deleted===false,'missing strong target');
          check(Number.isSafeInteger(obj.refCount)&&obj.refCount>0,'invalid reference count');
          const adapter=types.get(typeKey(obj.type,obj.version));
          check(adapter&&row&&adapter.validate(clone(row.value))===true,'invalid or unsupported payload');
          const expected=slots(adapter.references(clone(row.value)));
          check(expected.length===actual.length&&expected.every(ref=>actual.some(e=>
            e.slot===ref.slot&&e.target===ref.target&&e.strength===ref.strength)),'payload reference mismatch');
          resources.push({...obj,payload:row.value});
          children.set(objectId,actual.filter(ref=>ref.strength==='strong').map(ref=>ref.target));
          add(actual);
        }
        for(const target of weakTargets)if(!seen.has(target)){
          const obj=await request(stores.objects.get(target));
          check(obj&&obj.id===target&&typeof obj.deleted==='boolean','unknown reference target');
        }
        const degrees=new Map(queue.map(id=>[id,0]));
        for(const refs of children.values())for(const target of refs)
          degrees.set(target,degrees.get(target)+1);
        const ready=queue.filter(id=>degrees.get(id)===0);
        for(let i=0;i<ready.length;i++)for(const target of children.get(ready[i])){
          const n=degrees.get(target)-1;degrees.set(target,n);
          if(n===0)ready.push(target);
        }
        check(ready.length===queue.length,'strong reference cycle');
        return {document:{...doc,references:rootEdges},resources};
      });
    }
    async function inspectUsage(id){
      token(id,'object ID');
      return run('readonly',async stores=>{
        const g=await graph(stores);inspect(g,types);
        return {object:g.objects.get(id)||null,references:[...g.refs.values()].filter(e=>e.target===id)};
      });
    }
    async function verifyIntegrity(){
      return run('readonly',async stores=>{
        const g=await graph(stores),{counts,mismatches}=inspect(g,types,true);
        await verifyPayloads(g,stores,types);
        const retained=reachable(g);
        return {valid:!mismatches.length,liveObjects:counts.size,mismatches,
          eligible:[...counts].filter(([,n])=>n===0).map(([id])=>id),
          unreachable:[...counts.keys()].filter(id=>!retained.has(id))};
      });
    }
    async function recount(){
      return run('readwrite',async stores=>{
        const g=await graph(stores);inspect(g,types,true);
        await verifyPayloads(g,stores,types);
        return {repaired:updateCounts(g,stores,types)};
      });
    }
    function underResourceLock(id,mode,operation){
      token(id,'object ID');
      const locks=env.navigator?.locks;
      check(locks&&typeof locks.request==='function','resource coordination unavailable; retry in a supported browser');
      return locks.request(DATABASE+':resource:'+id,{mode,ifAvailable:true},lock=>{
        check(lock&&lock.mode===mode,'resource in use; close the corresponding editor or tab and retry');
        return operation();
      });
    }
    // Explicit user-facing owner removal is not an editing detach. Refuse
    // without modifying the entry if any of its retained resources is in use.
    async function removeDocument({documentId,expectedRevision}){
      token(documentId,'document ID');revision(expectedRevision);
      const before=await getDocument(documentId);
      check(before&&before.revision===expectedRevision,'stale or missing document');
      const targets=[...new Set(before.references.filter(ref=>ref.strength==='strong').map(ref=>ref.target))].sort();
      function acquire(index,operation){
        if(index===targets.length)return operation();
        return underResourceLock(targets[index],'exclusive',()=>acquire(index+1,operation));
      }
      return acquire(0,()=>run('readwrite',async stores=>{
        const g=await graph(stores);inspect(g,types);
        const doc=checkedDocument(g,documentId,expectedRevision);check(doc,'document missing');
        await verifyPayloads(g,stores,types);
        for(const edge of [...g.refs.values()]){
          if(edge.ownerKind==='document'&&edge.ownerId===documentId)dropEdge(g,stores,edge);
        }
        updateCounts(g,stores,types);
        const retired=saveDocument(g,stores,{id:documentId,kind:doc.kind,
          revision:doc.revision+1,deleted:true});
        return {removed:true,revision:retired.revision};
      }));
    }
    async function withRetained(id,operation){
      check(typeof operation==='function','retained operation required');
      return underResourceLock(id,'shared',async()=>{
        const value=await get(id);check(value,'resource missing');
        return operation(value);
      });
    }
    // Explicit single-object collection; later calls collect newly eligible
    // children. No implicit collection, and no destructive domain integration.
    async function collectGarbage(id){
      return underResourceLock(id,'exclusive',()=>run('readwrite',async stores=>{
        const g=await graph(stores);inspect(g,types);
        await verifyPayloads(g,stores,types);
        const row=g.objects.get(id);
        if(!row||row.deleted)return {collected:false,reason:'missing'};
        if(row.refCount!==0)return {collected:false,reason:'durable-reference'};
        for(const edge of [...g.refs.values()]){
          if(edge.ownerKind==='object'&&edge.ownerId===id)dropEdge(g,stores,edge);
        }
        // Keep a small tombstone to prevent accidental ID reuse and preserve
        // the meaning of unresolved weak links. Payload bytes are reclaimed.
        const tombstone={id,deleted:true,refCount:0};
        g.objects.set(id,tombstone);stores.objects.put(tombstone);
        g.payloadKeys.delete(id);stores.payloads.delete(id);
        updateCounts(g,stores,types);
        return {collected:true};
      }));
    }
    // Explicit bounded maintenance only. Hold every acquired exclusive
    // resource lock through the same IDB transaction. Busy candidates are
    // skipped; all other candidates are rechecked against the current graph.
    async function collectGarbageBatch(ids){
      check(Array.isArray(ids)&&ids.length>0&&ids.length<=MAX_GC_BATCH,'invalid GC batch size');
      const candidates=ids.map(id=>token(id,'object ID')).sort();
      check(new Set(candidates).size===candidates.length,'duplicate GC candidate');
      const locks=env.navigator?.locks;
      check(locks&&typeof locks.request==='function','resource coordination unavailable; retry in a supported browser');
      const acquired=[],blocked=[];
      async function lockNext(index){
        if(index<candidates.length){
          const id=candidates[index];
          return locks.request(DATABASE+':resource:'+id,{mode:'exclusive',ifAvailable:true},lock=>{
            if(!lock){blocked.push(id);return lockNext(index+1);}
            check(lock.mode==='exclusive','exclusive resource lock required');
            acquired.push(id);
            return lockNext(index+1);
          });
        }
        if(!acquired.length)return {collected:[],blocked,retained:[],missing:[]};
        return run('readwrite',async stores=>{
          const g=await graph(stores),{counts}=inspect(g,types);
          await verifyPayloads(g,stores,types);
          const outgoing=new Map();
          for(const edge of g.refs.values())if(edge.ownerKind==='object'){
            if(!outgoing.has(edge.ownerId))outgoing.set(edge.ownerId,[]);
            outgoing.get(edge.ownerId).push(edge);
          }
          const pending=new Set(acquired.filter(id=>counts.has(id)));
          const missing=acquired.filter(id=>!counts.has(id)),collected=[];
          // Only candidates with zero actual incoming strong edges may be
          // removed. A parent collected in this batch can make another
          // locked candidate eligible. No unlisted child is reclaimed.
          let changed=true;
          while(changed){
            changed=false;
            for(const id of pending){
              if(counts.get(id)!==0)continue;
              for(const edge of outgoing.get(id)||[]){
                dropEdge(g,stores,edge);
                if(edge.strength==='strong')counts.set(edge.target,counts.get(edge.target)-1);
              }
              const tombstone={id,deleted:true,refCount:0};
              g.objects.set(id,tombstone);stores.objects.put(tombstone);
              g.payloadKeys.delete(id);stores.payloads.delete(id);
              pending.delete(id);collected.push(id);changed=true;
            }
          }
          // Re-derive and validate all resulting counts before commit.
          updateCounts(g,stores,types);
          return {collected,blocked,retained:[...pending],missing};
        });
      }
      return lockNext(0);
    }
    return Object.freeze({coordination:writer?'participating-writer':'uncoordinated',
      newObjectId,createAndAttach,writeDocument,setReference,detach,removeDocument,get,getDocument,readDocumentGraph,inspectUsage,
      readDocumentClosureForWrite,verifyIntegrity,recount,withRetained,collectGarbage,collectGarbageBatch});
  }
  return Object.freeze({DATABASE,VERSION,MAX_GC_BATCH,create});
}));

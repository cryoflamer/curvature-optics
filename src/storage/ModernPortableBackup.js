/* Read-only inventory/portable codec for Modern storage.
 * A snapshot is NOT a migration gate until coordinated capture,
 * original-image verification and isolated restore are accepted.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernPortableBackup=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const FORMAT='curvature-modern-portable-backup',VERSION=1;
  const KNOWN_DATABASES=Object.freeze([
    'curvature-modern-working-session','curvature-modern-animation-draft',
    'curvature-modern-animation-library','curvature-modern-reference-images',
    'curvature-modern-experiment-history','curvature-modern-calibration-results',
    'curvature-photo-calibration'
  ]);
  const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  function ensure(ok,reason){if(!ok)throw Error('Portable backup: '+reason);}
  function base64(bytes){
    const chunks=[];
    for(let i=0;i<bytes.length;i+=16384)
      chunks.push(String.fromCharCode(...bytes.subarray(i,i+16384)));
    return btoa(chunks.join(''));
  }
  function unbase64(text){
    ensure(typeof text==='string'&&text.length%4===0,'invalid base64');
    const s=atob(text);ensure(btoa(s)===text,'noncanonical base64');
    const bytes=new Uint8Array(s.length);
    for(let i=0;i<s.length;i++)bytes[i]=s.charCodeAt(i);
    return bytes;
  }
  async function encode(value,stack=new Set()){
    if(value===null)return ['null'];
    if(value===undefined)return ['undefined'];
    const type=typeof value;
    if(type==='string'||type==='boolean')return [type,value];
    if(type==='number'){ensure(Number.isFinite(value),'nonfinite number');return [type,value];}
    if(type==='bigint')return ['bigint',String(value)];
    ensure(type==='object'&&!stack.has(value),'unsupported or circular value');
    stack.add(value);
    try{
      if(value instanceof Date){
        ensure(Number.isFinite(value.getTime()),'invalid date');return ['date',value.toISOString()];
      }
      if(value instanceof ArrayBuffer)return ['buffer',base64(new Uint8Array(value))];
      if(ArrayBuffer.isView(value))return ['view',value.constructor.name,
        base64(new Uint8Array(value.buffer,value.byteOffset,value.byteLength))];
      if(typeof Blob!=='undefined'&&value instanceof Blob){
        const data=base64(new Uint8Array(await value.arrayBuffer()));
        if(typeof File!=='undefined'&&value instanceof File)
          return ['file',value.name,value.type,value.lastModified,data];
        return ['blob',value.type,data];
      }
      if(Array.isArray(value)){
        const entries=[];
        for(let i=0;i<value.length;i++){
          ensure(own(value,i),'sparse array');entries.push(await encode(value[i],stack));
        }
        return ['array',entries];
      }
      const proto=Object.getPrototypeOf(value);
      ensure(proto===null||proto===Object.prototype,'unsupported stored object');
      const entries=[];
      for(const key of Object.keys(value))entries.push([key,await encode(value[key],stack)]);
      return ['object',entries];
    }finally{stack.delete(value);}
  }
  function decode(tag){
    ensure(Array.isArray(tag)&&typeof tag[0]==='string','invalid typed value');
    const kind=tag[0],v=tag[1];
    if(kind==='null'||kind==='undefined'){ensure(tag.length===1,'invalid scalar');return kind==='null'?null:undefined;}
    if(['string','boolean','number'].includes(kind)){
      ensure(tag.length===2&&typeof v===kind&&(kind!=='number'||Number.isFinite(v)),
        'invalid scalar');return v;
    }
    if(kind==='bigint'){
      ensure(tag.length===2&&typeof v==='string'&&/^-?(0|[1-9]\d*)$/.test(v),'invalid bigint');
      return BigInt(v);
    }
    if(kind==='date'){
      ensure(tag.length===2&&typeof v==='string'&&!Number.isNaN(Date.parse(v))&&
        new Date(v).toISOString()===v,'invalid date');return new Date(v);
    }
    if(kind==='buffer'){ensure(tag.length===2,'invalid buffer');return unbase64(v).buffer;}
    if(kind==='view'){
      ensure(tag.length===3&&typeof v==='string','invalid view');
      const bytes=unbase64(tag[2]);
      if(v==='DataView')return new DataView(bytes.buffer);
      const types={Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,
        Int32Array,Uint32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array};
      const ctor=own(types,v)?types[v]:null;
      ensure(ctor&&bytes.length%ctor.BYTES_PER_ELEMENT===0,'unsupported typed view');
      return new ctor(bytes.buffer);
    }
    if(kind==='blob'){
      ensure(tag.length===3&&typeof v==='string'&&typeof Blob!=='undefined','invalid blob');
      return new Blob([unbase64(tag[2])],{type:v});
    }
    if(kind==='file'){
      ensure(tag.length===5&&typeof v==='string'&&typeof tag[2]==='string'&&
        Number.isSafeInteger(tag[3])&&tag[3]>=0&&typeof File!=='undefined','invalid file');
      return new File([unbase64(tag[4])],v,{type:tag[2],lastModified:tag[3]});
    }
    if(kind==='array'){
      ensure(tag.length===2&&Array.isArray(v),'invalid array');return v.map(decode);
    }
    if(kind==='object'){
      ensure(tag.length===2&&Array.isArray(v),'invalid object');
      const result=Object.create(null),seen=new Set();
      for(const entry of v){
        ensure(Array.isArray(entry)&&entry.length===2&&typeof entry[0]==='string'&&
          !seen.has(entry[0]),'duplicate or invalid property');
        seen.add(entry[0]);result[entry[0]]=decode(entry[1]);
      }
      return result;
    }
    throw Error('Portable backup: unsupported value tag '+kind);
  }
  async function digest(string,crypto){
    ensure(crypto&&crypto.subtle&&typeof crypto.subtle.digest==='function'&&
      typeof TextEncoder!=='undefined','SHA-256 unavailable');
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(string));
    return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
  }
  function webRows(rows){
    ensure(Array.isArray(rows),'invalid Web Storage inventory');
    const used=new Set();
    for(const entry of rows){
      ensure(object(entry)&&typeof entry.key==='string'&&/^curvature[-_]/.test(entry.key)&&
        typeof entry.value==='string'&&!used.has(entry.key),'invalid Web Storage entry');
      used.add(entry.key);
    }
    return rows.slice().sort((a,b)=>a.key.localeCompare(b.key));
  }
  function keyPath(path){
    return path===null||typeof path==='string'||Array.isArray(path)&&
      path.every(v=>typeof v==='string');
  }
  async function normalize(raw){
    ensure(object(raw)&&Array.isArray(raw.databases)&&object(raw.webStorage),
      'invalid source inventory');
    const used=new Set(),databases=[];
    for(const db of raw.databases){
      ensure(object(db)&&typeof db.name==='string'&&/^curvature[-_]/.test(db.name)&&
        !used.has(db.name)&&['present','absent'].includes(db.status),'invalid database');
      used.add(db.name);
      if(db.status==='absent'){
        ensure(db.version===null&&Array.isArray(db.stores)&&db.stores.length===0,
          'invalid absent database');
        databases.push({name:db.name,status:'absent',version:null,stores:[]});continue;
      }
      ensure(Number.isSafeInteger(db.version)&&db.version>0&&Array.isArray(db.stores),
        'invalid database version');
      const seenStores=new Set(),stores=[];
      for(const store of db.stores){
        ensure(object(store)&&typeof store.name==='string'&&store.name.length>0&&
          !seenStores.has(store.name)&&keyPath(store.keyPath)&&
          typeof store.autoIncrement==='boolean'&&Array.isArray(store.indexes)&&
          Array.isArray(store.records),'invalid store metadata');
        seenStores.add(store.name);
        const indexes=new Set();
        for(const index of store.indexes){
          ensure(object(index)&&typeof index.name==='string'&&!indexes.has(index.name)&&
            keyPath(index.keyPath)&&index.keyPath!==null&&
            typeof index.unique==='boolean'&&typeof index.multiEntry==='boolean',
            'invalid index metadata');
          indexes.add(index.name);
        }
        const keys=new Set(),records=[];
        for(const row of store.records){
          ensure(object(row)&&own(row,'key')&&own(row,'value'),'invalid record');
          const key=await encode(row.key),value=await encode(row.value);
          const fingerprint=JSON.stringify(key);
          ensure(!keys.has(fingerprint),'duplicate primary key');
          keys.add(fingerprint);records.push({key,value});
        }
        stores.push({name:store.name,keyPath:store.keyPath,autoIncrement:store.autoIncrement,
          indexes:store.indexes.slice().sort((a,b)=>a.name.localeCompare(b.name)),records});
      }
      databases.push({name:db.name,status:'present',version:db.version,
        stores:stores.sort((a,b)=>a.name.localeCompare(b.name))});
    }
    ensure(KNOWN_DATABASES.every(name=>used.has(name)),'required database missing from inventory');
    const ws=raw.webStorage;
    ensure(object(ws.excluded)&&Number.isSafeInteger(ws.excluded.local)&&ws.excluded.local>=0&&
      Number.isSafeInteger(ws.excluded.session)&&ws.excluded.session>=0,
      'Web Storage exclusions missing');
    return {databases:databases.sort((a,b)=>a.name.localeCompare(b.name)),
      webStorage:{local:webRows(ws.local),session:webRows(ws.session),
        excluded:{local:ws.excluded.local,session:ws.excluded.session}}};
  }
  function unpackData(data){
    return {databases:data.databases.map(db=>({...db,stores:db.stores.map(store=>({
      ...store,records:store.records.map(row=>({key:decode(row.key),value:decode(row.value)}))
    }))})),webStorage:data.webStorage};
  }
  async function makeManifest(data,crypto){
    const databases=[];
    for(const db of data.databases){
      const stores=[];
      for(const store of db.stores)
        stores.push({name:store.name,count:store.records.length,
          sha256:await digest(JSON.stringify(store.records),crypto)});
      databases.push({name:db.name,status:db.status,version:db.version,stores});
    }
    return {databases,localStorageCount:data.webStorage.local.length,
      sessionStorageCount:data.webStorage.session.length,
      excludedWebStorageKeys:data.webStorage.excluded};
  }
  async function pack(raw,crypto){
    const content=await normalize(raw);
    const body={format:FORMAT,version:VERSION,capturedAt:new Date().toISOString(),
      consistency:'two-pass-observation-only',writerCoordination:false,
      eligibleForMigration:false,content,manifest:await makeManifest(content,crypto)};
    const payload=JSON.stringify(body);
    return {format:FORMAT,version:VERSION,payload,sha256:await digest(payload,crypto)};
  }
  async function inspect(archive,crypto){
    ensure(object(archive)&&archive.format===FORMAT&&archive.version===VERSION&&
      typeof archive.payload==='string'&&/^[0-9a-f]{64}$/.test(archive.sha256),
      'unsupported envelope');
    ensure(await digest(archive.payload,crypto)===archive.sha256,'archive checksum mismatch');
    let body;
    try{body=JSON.parse(archive.payload);}catch(error){throw Error('Portable backup: invalid JSON');}
    ensure(object(body)&&body.format===FORMAT&&body.version===VERSION&&
      body.consistency==='two-pass-observation-only'&&body.writerCoordination===false&&
      body.eligibleForMigration===false,'unsupported archive contents');
    const content=await normalize(unpackData(body.content));
    const expected=await makeManifest(content,crypto);
    ensure(JSON.stringify(expected)===JSON.stringify(body.manifest),'manifest mismatch');
    return {capturedAt:body.capturedAt,manifest:expected,
      consistency:body.consistency,eligibleForMigration:false};
  }
  function storageRows(storage){
    ensure(storage&&Number.isSafeInteger(storage.length)&&
      typeof storage.key==='function'&&typeof storage.getItem==='function',
      'Web Storage unavailable');
    const rows=[];let excluded=0;
    for(let i=0;i<storage.length;i++){
      const key=storage.key(i);
      ensure(typeof key==='string','Web Storage enumeration incomplete');
      if(!/^curvature[-_]/.test(key)){excluded++;continue;}
      const value=storage.getItem(key);
      ensure(typeof value==='string','Web Storage changed during capture');
      rows.push({key,value});
    }
    return {rows,excluded};
  }
  function readDatabase(indexedDB,info){
    return new Promise((resolve,reject)=>{
      let req,db,tx,settled=false;
      const fail=error=>{
        if(settled)return;settled=true;
        try{tx&&tx.abort();}catch(ignore){}
        if(db)db.close();
        reject(error||Error('Portable backup: IndexedDB read failed'));
      };
      try{req=indexedDB.open(info.name);}catch(error){fail(error);return;}
      req.onupgradeneeded=()=>{
        try{req.transaction.abort();}catch(ignore){}
        fail(Error('Portable backup: unexpected database creation/upgrade'));
      };
      req.onerror=()=>fail(req.error);
      req.onblocked=()=>fail(Error('Portable backup: database blocked'));
      req.onsuccess=()=>{
        db=req.result;
        if(settled){db.close();return;}
        if(db.version!==info.version){
          fail(Error('Portable backup: database version changed'));return;
        }
        const names=Array.from(db.objectStoreNames),stores=[];
        if(!names.length){settled=true;db.close();
          resolve({name:info.name,status:'present',version:db.version,stores});return;}
        try{tx=db.transaction(names,'readonly');}catch(error){fail(error);return;}
        tx.oncomplete=()=>{
          if(settled)return;settled=true;db.close();
          resolve({name:info.name,status:'present',version:info.version,stores});
        };
        tx.onabort=()=>fail(tx.error||Error('Portable backup: transaction aborted'));
        tx.onerror=()=>fail(tx.error);
        for(const name of names){
          let store;
          try{store=tx.objectStore(name);}catch(error){fail(error);return;}
          const indexes=Array.from(store.indexNames,indexName=>{
            const index=store.index(indexName);
            return {name:indexName,keyPath:index.keyPath,unique:index.unique,multiEntry:index.multiEntry};
          });
          const entry={name,keyPath:store.keyPath,autoIncrement:store.autoIncrement,
            indexes,records:[]};
          stores.push(entry);
          let cursor;
          try{cursor=store.openCursor();}catch(error){fail(error);return;}
          cursor.onerror=()=>fail(cursor.error);
          cursor.onsuccess=()=>{
            if(settled)return;
            const row=cursor.result;
            if(!row)return;
            entry.records.push({key:row.primaryKey,value:row.value});
            try{row.continue();}catch(error){fail(error);}
          };
        }
      };
    });
  }
  async function scan(env){
    ensure(env&&env.indexedDB&&typeof env.indexedDB.databases==='function',
      'IndexedDB database inventory unsupported');
    const catalog=await env.indexedDB.databases(),infos=new Map();
    ensure(Array.isArray(catalog),'invalid database inventory');
    for(const entry of catalog){
      if(!entry||typeof entry.name!=='string'||!/^curvature[-_]/.test(entry.name))continue;
      ensure(Number.isSafeInteger(entry.version)&&entry.version>0&&!infos.has(entry.name),
        'duplicate or invalid database descriptor');
      infos.set(entry.name,entry);
    }
    const databases=[];
    for(const name of [...new Set([...KNOWN_DATABASES,...infos.keys()])].sort()){
      databases.push(infos.has(name)?
        await readDatabase(env.indexedDB,infos.get(name)):
        {name,status:'absent',version:null,stores:[]});
    }
    const local=storageRows(env.localStorage),session=storageRows(env.sessionStorage);
    return {databases,webStorage:{local:local.rows,session:session.rows,
      excluded:{local:local.excluded,session:session.excluded}}};
  }
  async function capture(env){
    ensure(env&&env.crypto,'Web Crypto unavailable');
    const before=await normalize(await scan(env));
    const after=await normalize(await scan(env));
    ensure(JSON.stringify(before)===JSON.stringify(after),
      'data changed between read-only passes; retry after writes settle');
    // Two equal observations do not constitute an atomic cut across databases.
    return pack(unpackData(before),env.crypto);
  }
  // Source-specific qualification is distinct from archive checksum validation.
  // An archive can be byte-perfect yet miss the original photo needed by a
  // Calibration Project, or carry a stale project summary. Fail the safety
  // review without touching either the original or isolated databases.
  async function qualifyEvidence(archive,env){
    ensure(env&&env.crypto&&typeof env.verifyOriginal==='function',
      'an original-image decoder is required for evidence qualification');
    await inspect(archive,env.crypto);
    const body=JSON.parse(archive.payload);
    const databases=new Map(body.content.databases.map(db=>[db.name,db]));
    function rows(database,store){
      const db=databases.get(database);
      if(!db||db.status!=='present')return [];
      const entry=db.stores.find(s=>s.name===store);
      return entry?entry.records.map(row=>({key:decode(row.key),value:decode(row.value)})):[];
    }
    function exists(database,store){
      const db=databases.get(database);
      return db&&db.status==='present'&&db.stores.some(s=>s.name===store);
    }
    function identity(value,label){
      ensure(object(value)&&value.version===1&&
        typeof value.sha256==='string'&&/^[0-9a-f]{64}$/.test(value.sha256)&&
        Number.isSafeInteger(value.width)&&value.width>0&&value.width<=32768&&
        Number.isSafeInteger(value.height)&&value.height>0&&value.height<=32768,
        'invalid photograph identity: '+label);
      return value.sha256+':'+value.width+'x'+value.height;
    }
    const images=rows('curvature-modern-reference-images','observations');
    const ids=new Set(),origins=new Map(),rawById=new Map();
    for(const row of images){
      const value=row.value,record=value&&value.record;
      ensure(object(value)&&typeof value.id==='string'&&
        row.key===value.id&&Number.isSafeInteger(value.revision)&&value.revision>=1&&
        object(record)&&record.id===value.id&&object(record.original),
        'invalid reference image row');
      ensure(!ids.has(value.id),'duplicate reference image ID');
      ids.add(value.id);
      const raster=record.original,url=raster.dataUrl;
      ensure(typeof url==='string'&&/^data:image\/(?:png|jpeg|webp);base64,/.test(url)&&
        Number.isSafeInteger(raster.width)&&Number.isSafeInteger(raster.height)&&
        raster.width>0&&raster.height>0,'invalid original image raster');
      const binary=unbase64(url.slice(url.indexOf(',')+1));
      ensure(binary.length>0&&binary.length<=20*1024*1024,
        'original image byte limit exceeded');
      // Browser decoder checks MIME, raster header and actual decoded natural
      // dimensions. It must be read-only; no thumbnail regeneration here.
      await env.verifyOriginal(record);
      const hash=Array.from(new Uint8Array(await env.crypto.subtle.digest('SHA-256',binary)),
        b=>b.toString(16).padStart(2,'0')).join('');
      const key=identity({version:1,sha256:hash,width:raster.width,height:raster.height},value.id);
      const previous=origins.get(key);
      if(previous)ensure(previous.dataUrl===url,
        'inconsistent original bytes for one image identity');
      else origins.set(key,{dataUrl:url});
      rawById.set(value.id,{identity:key,revision:value.revision});
    }
    const annotations=rows('curvature-modern-reference-images','annotations');
    for(const row of annotations)
      ensure(object(row.value)&&typeof row.value.id==='string'&&
        row.key===row.value.id&&ids.has(row.value.id),
        'orphan reference image annotation');
    const projects=rows('curvature-photo-calibration','projects');
    const summaries=rows('curvature-photo-calibration','project-summaries');
    const summaryMap=new Map();
    for(const row of summaries){
      const v=row.value;
      ensure(object(v)&&typeof v.id==='string'&&row.key===v.id&&
        !summaryMap.has(v.id),'invalid calibration project summary');
      summaryMap.set(v.id,v);
    }
    const archiveRows=rows('curvature-modern-calibration-results','results');
    const resultMap=new Map();
    for(const row of archiveRows){
      const v=row.value;
      ensure(object(v)&&typeof v.id==='string'&&row.key===v.id&&
        object(v.record)&&object(v.record.payload)&&
        !resultMap.has(v.id),'invalid archived calibration result');
      resultMap.set(v.id,v);
      ensure(origins.has(identity(v.record.payload.photo,v.id)),
        'archived Calibration result original missing: '+v.id);
    }
    const projectIds=new Set();
    for(const row of projects){
      const v=row.value;
      ensure(object(v)&&typeof v.id==='string'&&row.key===v.id&&
        !projectIds.has(v.id)&&Number.isSafeInteger(v.revision)&&v.revision>=1,
        'invalid Calibration Project record');
      projectIds.add(v.id);
      const summary=summaryMap.get(v.id);
      ensure(summary&&summary.id===v.id&&summary.revision===v.revision&&
        summary.version===v.version&&summary.title===v.title&&
        summary.updatedAt===v.updatedAt&&summary.createdAt===v.createdAt,
        'Calibration Project summary/record mismatch: '+v.id);
      if(v.photo!==null){
        ensure(object(v.photo)&&origins.has(identity(v.photo.identity,v.id)),
          'Calibration Project original missing: '+v.id);
        ensure(summary.photo&&identity(summary.photo,v.id)===
          identity(v.photo.identity,v.id),
          'Calibration Project photo summary mismatch: '+v.id);
      }else ensure(summary.photo===null,
        'Calibration Project claims an unexpected summary photo: '+v.id);
      if(v.checkpoint&&v.photo&&v.checkpoint.payload&&
        v.checkpoint.payload.recordMetadata)
        ensure(v.checkpoint.payload.recordMetadata.id===v.photo.aliasId,
          'Calibration Project checkpoint attribution mismatch: '+v.id);
      ensure(Array.isArray(v.resultIds),
        'invalid Calibration Project result links: '+v.id);
      for(const id of v.resultIds){
        ensure(typeof id==='string'&&resultMap.has(id),
          'Calibration Project archived result missing: '+v.id+' / '+id);
      }
    }
    ensure(projects.length===summaryMap.size,
      'orphan Calibration Project summary');
    const animationRows=rows('curvature-modern-animation-library','projects');
    let animationLinks=0;
    for(const row of animationRows){
      const value=row.value,frames=value&&value.project&&value.project.keyframes;
      ensure(value&&row.key===value.id,'invalid Animation Library row');
      if(!Array.isArray(frames))continue;
      for(const frame of frames){
        if(!frame||frame.referenceImageIds===undefined)continue;
        ensure(Array.isArray(frame.referenceImageIds),
          'invalid Storyboard reference list');
        for(const imageId of frame.referenceImageIds){
          ensure(typeof imageId==='string'&&rawById.has(imageId),
            'Storyboard original missing: '+value.id+' / '+imageId);
          animationLinks++;
        }
      }
    }
    // A store absent in an older schema is fine only if no record in the
    // corresponding owner requires it. Do not silently bless unexpected
    // project summaries while the projects store is missing.
    ensure(!summaries.length||exists('curvature-photo-calibration','projects'),
      'Calibration Project store missing');
    return Object.freeze({qualified:'covered-sources-only',originalsVerified:images.length,
      projectsChecked:projects.length,archivesChecked:archiveRows.length,
      annotationsChecked:annotations.length,storyboardLinksChecked:animationLinks,
      decoderVerified:true,eligibleForMigration:false,
      remaining:['live writer coordination and acknowledged revisions',
        'Animation drafts and legacy recovery payloads',
        'full referential/schema qualification and user-held archive round-trip']});
  }
  /* Restore only to newly created, namespaced databases.
   * There is deliberately no live replacement or existing-database merge API.
   * A verified archive is a prerequisite; it is not yet a migration-ready backup.
   */
  function isolatedName(token,name){
    ensure(typeof token==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(token),
      'invalid isolated-restore token');
    ensure(typeof name==='string'&&/^curvature[-_]/.test(name),
      'invalid isolated source name');
    return '__curvature_backup_verify__'+token+'__'+name;
  }
  function createIsolatedDatabase(indexedDB,source,target){
    const prepared=source.stores.map(store=>({
      ...store,records:store.records.map(row=>({key:decode(row.key),value:decode(row.value)}))
    }));
    return new Promise((resolve,reject)=>{
      let req,db,finished=false,created=false;
      const fail=error=>{
        if(finished)return;finished=true;
        try{if(req&&req.transaction)req.transaction.abort();}catch(ignore){}
        try{if(db)db.close();}catch(ignore){}
        reject(error||Error('Portable backup: isolated restore failed'));
      };
      try{req=indexedDB.open(target,source.version);}catch(error){fail(error);return;}
      req.onblocked=()=>fail(Error('Portable backup: isolated restore blocked'));
      req.onerror=()=>fail(req.error);
      req.onupgradeneeded=event=>{
        if(event.oldVersion!==0){fail(Error('Portable backup: isolated target collision'));return;}
        created=true;db=req.result;
        try{
          for(const spec of prepared){
            const options={autoIncrement:spec.autoIncrement};
            if(spec.keyPath!==null)options.keyPath=spec.keyPath;
            const store=db.createObjectStore(spec.name,options);
            for(const index of spec.indexes)
              store.createIndex(index.name,index.keyPath,
                {unique:index.unique,multiEntry:index.multiEntry});
            for(const row of spec.records){
              if(spec.keyPath===null)store.put(row.value,row.key);
              else store.put(row.value);
            }
          }
        }catch(error){fail(error);}
      };
      req.onsuccess=()=>{
        db=req.result;
        if(!created){fail(Error('Portable backup: isolated target already exists'));return;}
        if(finished){db.close();return;}
        finished=true;db.close();resolve();
      };
    });
  }
  async function verifyIsolatedDatabase(indexedDB,source,target){
    const read=await readDatabase(indexedDB,{name:target,version:source.version});
    const stores=[];
    for(const store of read.stores){
      const records=[];
      for(const row of store.records)
        records.push({key:await encode(row.key),value:await encode(row.value)});
      stores.push({name:store.name,keyPath:store.keyPath,
        autoIncrement:store.autoIncrement,indexes:store.indexes,records});
    }
    stores.sort((a,b)=>a.name.localeCompare(b.name));
    const expected={name:source.name,status:source.status,version:source.version,stores:source.stores};
    const actual={name:source.name,status:'present',version:read.version,stores};
    ensure(JSON.stringify(actual)===JSON.stringify(expected),
      'isolated restore readback differs from archive: '+source.name);
  }
  async function restoreIsolated(archive,env,token){
    ensure(env&&env.crypto&&env.indexedDB&&
      typeof env.indexedDB.databases==='function','isolated restore dependencies missing');
    await inspect(archive,env.crypto);
    const body=JSON.parse(archive.payload);
    const sources=body.content.databases.filter(row=>row.status==='present');
    const id=token===undefined?
      (env.crypto.randomUUID&&env.crypto.randomUUID().replace(/-/g,'')):token;
    ensure(typeof id==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(id),
      'isolated restore needs a unique token');
    const mappings=sources.map(source=>({name:source.name,target:isolatedName(id,source.name),
      version:source.version,records:source.stores.reduce((n,s)=>n+s.records.length,0)}));
    const inventory=await env.indexedDB.databases();
    ensure(Array.isArray(inventory),'isolated restore inventory unavailable');
    const occupied=new Set(inventory.map(x=>x&&x.name));
    ensure(mappings.every(item=>!occupied.has(item.target)),
      'isolated restore target collision; no restore was started');
    for(let i=0;i<sources.length;i++){
      await createIsolatedDatabase(env.indexedDB,sources[i],mappings[i].target);
      await verifyIsolatedDatabase(env.indexedDB,sources[i],mappings[i].target);
    }
    return {token:id,mappings,verified:true,eligibleForMigration:false,
      note:'No live database was replaced. Session writer coordination and photo provenance remain unverified.'};
  }
  // One-user rollback drill: restore the exact database names only when this
  // origin has NO Curvature IndexedDB databases and NO Curvature Web Storage.
  // Deliberately no overwrite, cleanup, delete or source replacement option.
  function cleanTarget(env){
    ensure(env&&env.indexedDB&&typeof env.indexedDB.databases==='function'&&
      env.localStorage&&env.sessionStorage,'empty-profile inspection unavailable');
    return Promise.resolve(env.indexedDB.databases()).then(databases=>{
      ensure(Array.isArray(databases),'invalid target database catalog');
      const existing=databases.filter(row=>row&&typeof row.name==='string'&&
        /^curvature[-_]/.test(row.name)).map(row=>row.name);
      // Backups created by earlier isolated verification are NOT an empty
      // origin either; do not conceal these proof databases.
      const proof=databases.filter(row=>row&&typeof row.name==='string'&&
        row.name.startsWith('__curvature_backup_verify__')).map(row=>row.name);
      const local=storageRows(env.localStorage),session=storageRows(env.sessionStorage);
      return {empty:existing.length===0&&proof.length===0&&
        local.rows.length===0&&session.rows.length===0,
        databases:existing.concat(proof).sort(),
        localKeys:local.rows.map(row=>row.key),
        sessionKeys:session.rows.map(row=>row.key)};
    });
  }
  async function previewEmptyRestore(archive,env){
    const inspected=await inspect(archive,env.crypto);
    const clean=await cleanTarget(env);
    const present=inspected.manifest.databases.filter(row=>row.status==='present');
    const counts=present.reduce((result,db)=>{
      result.stores+=db.stores.length;
      result.records+=db.stores.reduce((n,store)=>n+store.count,0);
      return result;
    },{stores:0,records:0});
    return Object.freeze({
      empty:clean.empty,conflicts:clean,databases:present.length,
      stores:counts.stores,records:counts.records,
      localKeys:inspected.manifest.localStorageCount,
      sessionKeys:inspected.manifest.sessionStorageCount,
      excludedWebStorageKeys:inspected.manifest.excludedWebStorageKeys,
      capturedAt:inspected.capturedAt,
      eligibleForMigration:false
    });
  }
  async function restoreEmpty(archive,env){
    // Validate all hashes and schema tags before touching the target.
    const preview=await previewEmptyRestore(archive,env);
    ensure(preview.empty,
      'target is not empty; use a new browser profile (nothing was overwritten)');
    const content=JSON.parse(archive.payload).content;
    const sources=content.databases.filter(db=>db.status==='present');
    // One final read of the catalog before the FIRST write.
    ensure((await cleanTarget(env)).empty,
      'target became non-empty before restore; nothing was overwritten');
    // Failures leave only newly created data in this deliberately empty
    // profile. The user can discard that test profile and retry elsewhere.
    // Never delete a live source or attempt rollback by destructive cleanup.
    for(const source of sources){
      await createIsolatedDatabase(env.indexedDB,source,source.name);
      await verifyIsolatedDatabase(env.indexedDB,source,source.name);
    }
    for(const row of content.webStorage.local)env.localStorage.setItem(row.key,row.value);
    for(const row of content.webStorage.session)env.sessionStorage.setItem(row.key,row.value);
    const after=await normalize(await scan(env));
    ensure(JSON.stringify(after.databases)===JSON.stringify(content.databases)&&
      JSON.stringify(after.webStorage.local)===JSON.stringify(content.webStorage.local)&&
      JSON.stringify(after.webStorage.session)===JSON.stringify(content.webStorage.session),
      'restored storage differs from the source archive; discard the test profile');
    return Object.freeze({verified:true,databases:preview.databases,
      stores:preview.stores,records:preview.records,localKeys:preview.localKeys,
      sessionKeys:preview.sessionKeys,eligibleForMigration:false,
      message:'Restore verified by full reread. Reload the Modern app in this new profile.'});
  }
  const MAX_PORTABLE_FILE_BYTES=512*1024*1024;
  // Explicit opt-in file transport. A Blob is created in memory, not silently
  // downloaded, and never treated as a fully accepted migration safety copy.
  async function fileBlob(archive,crypto){
    const review=await inspect(archive,crypto);
    ensure(typeof Blob!=='undefined','portable file Blob unavailable');
    const bytes=new Blob([JSON.stringify(archive)],{type:'application/json'});
    ensure(bytes.size>0&&bytes.size<=MAX_PORTABLE_FILE_BYTES,
      'portable archive too large for the current JSON file transport');
    const day=review.capturedAt;
    ensure(typeof day==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(day)&&
      Number.isFinite(Date.parse(day))&&new Date(day).toISOString()===day,
      'archive capture timestamp invalid');
    return Object.freeze({blob:bytes,
      filename:'curvature-optics-unqualified-backup-'+day.slice(0,10)+'.json',
      bytes:bytes.size,eligibleForMigration:false});
  }
  async function readFile(file,crypto){
    ensure(file&&typeof file.text==='function'&&Number.isSafeInteger(file.size)&&
      file.size>0&&file.size<=MAX_PORTABLE_FILE_BYTES,
      'unsupported or oversized portable backup file');
    let archive;
    try{archive=JSON.parse(await file.text());}
    catch(error){throw Error('Portable backup: invalid archive file JSON');}
    await inspect(archive,crypto);
    return archive;
  }
  return Object.freeze({FORMAT,VERSION,KNOWN_DATABASES,encode,decode,pack,inspect,capture,restoreIsolated,qualifyEvidence,previewEmptyRestore,restoreEmpty,fileBlob,readFile});
}));
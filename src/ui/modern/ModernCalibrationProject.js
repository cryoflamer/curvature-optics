/* Versioned Calibration Project envelope: no DOM, IndexedDB or photo bytes.
 * Editor checkpoint semantics are integrated separately, after this boundary.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernCalibrationProject=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION=1,MAX_CHECKPOINT_CHARS=4*1024*1024;
  const ID=/^calibration-project-v1-[0-9a-f]{32}$/;
  const RESULT_ID=/^calibration-result-v1-[0-9a-f]{64}$/;
  const SHA=/^[0-9a-f]{64}$/;
  const STAGES=['correspondences','calibration','result'];
  const FIELDS=['title','photo','checkpoint','overview','resultIds'];
  function object(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
  function keys(v,required,optional=[]){
    if(!object(v)||Object.keys(v).some(k=>!required.includes(k)&&!optional.includes(k))||
       required.some(k=>!Object.prototype.hasOwnProperty.call(v,k)))
      throw RangeError('Invalid calibration project fields');
  }
  function text(v,max,kind,allowEmpty=false){
    if(typeof v!=='string'||v.length>max||(!allowEmpty&&!v.trim())||
       /[\u0000-\u001f\u007f]/.test(v))throw RangeError('Invalid calibration project '+kind);
    return v;
  }
  function integer(v,min,max,kind){
    if(!Number.isSafeInteger(v)||v<min||v>max)throw RangeError('Invalid calibration project '+kind);
    return v;
  }
  function id(v){
    if(typeof v!=='string'||!ID.test(v))throw RangeError('Invalid calibration project ID');
    return v;
  }
  function createId(crypto){
    if(crypto?.randomUUID){
      const uuid=crypto.randomUUID().replace(/-/g,'').toLowerCase();
      if(/^[0-9a-f]{32}$/.test(uuid))return 'calibration-project-v1-'+uuid;
    }
    if(!crypto?.getRandomValues)throw Error('Secure project identity generation unavailable');
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    return 'calibration-project-v1-'+Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');
  }
  function json(v,depth=0){
    if(depth>48)throw RangeError('Calibration checkpoint exceeds nesting limit');
    if(v===null||typeof v==='boolean')return v;
    if(typeof v==='number'){
      if(!Number.isFinite(v))throw RangeError('Non-finite calibration checkpoint number');
      return v;
    }
    if(typeof v==='string'){
      if(v.startsWith('data:'))throw RangeError('Calibration project must not embed data URLs');
      return v;
    }
    if(Array.isArray(v)){
      if(Object.keys(v).length!==v.length)throw RangeError('Sparse calibration checkpoint');
      return v.map(x=>json(x,depth+1));
    }
    if(!object(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))
      throw RangeError('Invalid calibration checkpoint JSON value');
    const out={};
    for(const k of Object.keys(v)){
      if(['__proto__','constructor','prototype','dataUrl'].includes(k))
        throw RangeError('Unsafe or embedded-photo calibration checkpoint field');
      out[k]=json(v[k],depth+1);
    }
    return out;
  }
  function photo(v){
    if(v===null)return null;
    keys(v,['identity','aliasId','source']);
    const i=v.identity;keys(i,['version','sha256','width','height']);
    if(i.version!==1||typeof i.sha256!=='string'||!SHA.test(i.sha256))
      throw RangeError('Invalid calibration photo identity');
    const identity={version:1,sha256:i.sha256,
      width:integer(i.width,1,32768,'photo width'),height:integer(i.height,1,32768,'photo height')};
    let source=null;
    if(v.source!==null){
      keys(v.source,['kind','key']);
      if(!['library','demo','local','imported','unknown'].includes(v.source.kind))
        throw RangeError('Invalid calibration photo source');
      source={kind:v.source.kind,key:v.source.key===null?null:text(v.source.key,160,'photo source key')};
    }
    return {identity,aliasId:text(v.aliasId,160,'photo alias'),source};
  }
  function overview(v){
    keys(v,['stage','rowCount','fitStatus','fitRmsPx']);
    if(!STAGES.includes(v.stage))throw RangeError('Invalid calibration project stage');
    const fitStatus=v.fitStatus===null?null:text(v.fitStatus,160,'fit status',true);
    const fitRmsPx=v.fitRmsPx;
    if(fitRmsPx!==null&&(!Number.isFinite(fitRmsPx)||fitRmsPx<0))
      throw RangeError('Invalid calibration project fit RMS');
    return {stage:v.stage,rowCount:integer(v.rowCount,0,1000,'row count'),fitStatus,fitRmsPx};
  }
  function checkpoint(v){
    if(v===null)return null;
    keys(v,['version','payload']);
    if(v.version!==1||!object(v.payload))throw RangeError('Unsupported calibration project checkpoint');
    const out={version:1,payload:json(v.payload)};
    if(JSON.stringify(out).length>MAX_CHECKPOINT_CHARS)
      throw RangeError('Calibration project checkpoint limit reached');
    return out;
  }
  function normalize(v){
    keys(v,['version','id','title','createdAt','updatedAt','revision','photo',
      'checkpoint','overview','resultIds','forkOf']);
    if(v.version!==VERSION)throw RangeError('Unsupported calibration project version');
    const createdAt=integer(v.createdAt,1,Number.MAX_SAFE_INTEGER,'creation time');
    const updatedAt=integer(v.updatedAt,createdAt,Number.MAX_SAFE_INTEGER,'update time');
    if(!Array.isArray(v.resultIds)||v.resultIds.length>256||
       v.resultIds.some(x=>typeof x!=='string'||!RESULT_ID.test(x))||
       new Set(v.resultIds).size!==v.resultIds.length)
      throw RangeError('Invalid calibration project result links');
    const out={version:VERSION,id:id(v.id),title:text(v.title,160,'title'),
      createdAt,updatedAt,revision:integer(v.revision,1,Number.MAX_SAFE_INTEGER,'revision'),
      photo:photo(v.photo),checkpoint:checkpoint(v.checkpoint),overview:overview(v.overview),
      resultIds:v.resultIds.slice(),forkOf:v.forkOf===null?null:id(v.forkOf)};
    if(out.forkOf===out.id)throw RangeError('Calibration project cannot fork itself');
    return out;
  }
  function fresh({id:projectId,title='Untitled calibration',now=Date.now(),
    photo:photoValue=null,checkpoint:state=null,overview:details=null,resultIds=[],forkOf=null}){
    return normalize({version:VERSION,id:projectId,title,createdAt:now,updatedAt:now,
      revision:1,photo:photoValue,checkpoint:state,overview:details||{
        stage:'correspondences',rowCount:0,fitStatus:null,fitRmsPx:null},resultIds,forkOf});
  }
  function revise(current,changes,now=Date.now()){
    const before=normalize(current);
    if(!object(changes)||!Object.keys(changes).length||
       Object.keys(changes).some(k=>!FIELDS.includes(k)))
      throw RangeError('Invalid calibration project update');
    if(before.revision>=Number.MAX_SAFE_INTEGER)throw RangeError('Calibration project revision exhausted');
    return normalize({...before,...changes,revision:before.revision+1,
      updatedAt:Math.max(integer(now,1,Number.MAX_SAFE_INTEGER,'update time'),before.updatedAt+1)});
  }
  function fork(current,changes,forkId,now=Date.now()){
    const before=normalize(current);
    // Never mix remote state with a partial stale local candidate.
    if(!object(changes)||FIELDS.some(k=>!Object.prototype.hasOwnProperty.call(changes,k))||
       Object.keys(changes).some(k=>!FIELDS.includes(k)))
      throw RangeError('A conflict fork requires a complete project candidate');
    return fresh({...changes,id:forkId,now,forkOf:before.id,
      title:changes.title==='Untitled calibration'?
        'Untitled calibration (conflict)':changes.title+' (conflict)'});
  }
  function summary(value){
    const v=normalize(value);
    return {id:v.id,version:v.version,revision:v.revision,title:v.title,
      createdAt:v.createdAt,updatedAt:v.updatedAt,photo:v.photo?.identity??null,
      stage:v.overview.stage,rowCount:v.overview.rowCount,fitStatus:v.overview.fitStatus,
      fitRmsPx:v.overview.fitRmsPx,resultCount:v.resultIds.length,forkOf:v.forkOf,
      chars:JSON.stringify(v).length};
  }
  return Object.freeze({VERSION,MAX_CHECKPOINT_CHARS,FIELDS,id,createId,
    normalize,fresh,revise,fork,summary});
}));

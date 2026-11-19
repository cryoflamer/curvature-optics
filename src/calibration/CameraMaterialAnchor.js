/* Camera-independent, snapshot-scoped authored material anchor values.
 * Structural validation only: bank signature generation, topology resolution,
 * adjacency and triangle membership are the responsibility of 8F.4b.
 * Not yet loaded by the editor, projector or calibration worker.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CurvatureCameraMaterialAnchor=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const WEIGHT_TOLERANCE=1e-9;
  const sizes=Object.freeze({vertex:1,edge:2,surface:3});
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const record=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
  function fail(message){throw new TypeError(message);}
  function shape(o,keys,message){
    if(!record(o)||Object.keys(o).length!==keys.length||!keys.every(k=>own(o,k)))fail(message);
  }
  function index(n){return Number.isSafeInteger(n)&&n>=0;}
  function bank(n){return n===0||n===1;}
  function objectType(n){return index(n)&&n<=9;}
  const zero=n=>n===0?0:n;
  function normalizeObjectOwner(o){
    shape(o,['kind','bank','objectType','stationIndex','column','drawn','total'],'Invalid object owner fields');
    if(o.kind!=='object'||!bank(o.bank)||!objectType(o.objectType)||
      !index(o.stationIndex)||!index(o.drawn)||!index(o.total)||o.total<1||o.total>500||
      o.stationIndex+o.drawn!==o.total-1||![0,1,2].includes(o.column))fail('Invalid object owner context');
    return {kind:'object',bank:zero(o.bank),objectType:zero(o.objectType),
      stationIndex:zero(o.stationIndex),column:zero(o.column),drawn:zero(o.drawn),total:o.total};
  }
  function normalizeOwner(o){
    if(o?.kind==='object')return normalizeObjectOwner(o);
    shape(o,['kind','bank','objectType','from','to','role','side'],'Invalid span owner fields');
    if(o.kind!=='span'||!bank(o.bank)||!objectType(o.objectType))fail('Invalid span owner');
    const from=normalizeObjectOwner(o.from),to=normalizeObjectOwner(o.to);
    if(from.bank!==o.bank||to.bank!==o.bank||from.objectType!==o.objectType||to.objectType!==o.objectType||
      from.total!==to.total||from.column!==to.column||from.stationIndex!==to.stationIndex+1)
      fail('Invalid span endpoints');
    const sided=o.role==='soundly-road'||o.role==='tensas-road';
    const typeOK=o.role==='bridge-road'?o.objectType===6:
      o.role==='soundly-road'?[8,9].includes(o.objectType):
      o.role==='tensas-road'||o.role==='tensas-shore'?o.objectType===7:false;
    if(!typeOK||(sided?![-1,1].includes(o.side):o.side!==null))fail('Invalid span role or side');
    return {kind:'span',bank:zero(o.bank),objectType:zero(o.objectType),from,to,role:o.role,side:o.side};
  }
  // Sort by original vertex index, preserving the associated material weight.
  // Assign the remainder to the largest weight to avoid negative values from
  // floating-point subtraction near a boundary. Sum small terms first.
  function canonicalWeights(indices,weights){
    const entries=indices.map((i,j)=>({i,w:zero(weights[j])})).sort((a,b)=>a.i-b.i);
    const terms=entries.slice().sort((a,b)=>a.w-b.w||a.i-b.i);
    const sum=terms.reduce((s,e)=>s+e.w,0);
    if(!(sum>0)||Math.abs(sum-1)>WEIGHT_TOLERANCE)fail('Material weights must sum to one');
    const largest=terms[terms.length-1];
    if(sum!==1)for(const e of terms)e.w/=sum;
    const rest=terms.slice(0,-1).reduce((s,e)=>s+e.w,0);
    largest.w=1-rest;
    return {indices:entries.map(e=>zero(e.i)),weights:entries.map(e=>zero(e.w))};
  }
  function normalizeAnchor(a){
    shape(a,['kind','owner','primitive','signature','indices','weights'],'Invalid material anchor fields');
    const n=own(sizes,a.kind)?sizes[a.kind]:0,owner=normalizeOwner(a.owner);
    if(!n||!index(a.primitive)||owner.kind==='span'&&a.primitive!==0)fail('Invalid anchor kind or primitive');
    if(typeof a.signature!=='string'||!/^bank-v1:sha256:[0-9a-f]{64}$/.test(a.signature))
      fail('Invalid bank topology signature');
    if(!Array.isArray(a.indices)||a.indices.length!==n||
      !Array.from(a.indices).every(index)||new Set(a.indices).size!==n)fail('Invalid original vertex indices');
    if(!Array.isArray(a.weights)||a.weights.length!==n||
      !Array.from(a.weights).every(w=>Number.isFinite(w)&&w>=0&&w<=1))fail('Invalid material weights');
    const material=canonicalWeights(a.indices,a.weights);
    return {kind:a.kind,owner,primitive:zero(a.primitive),signature:a.signature,...material};
  }
  // Exact canonical descriptor key, independent of observation ID. Geometric
  // coincidence across primitives/kinds and tolerance-based UI checks are
  // separate operations requiring resolved physical coordinates.
  function anchorKey(a){return JSON.stringify(normalizeAnchor(a));}
  function idOf(p){
    if(!record(p)||!own(p,'id')||typeof p.id!=='string'||!p.id.trim())fail('Landmark ID required');
    return p.id;
  }
  // Legacy IDs remain opaque in headless calibration; portable v1/v2 checks
  // the historical bN:pN:vN key separately. Never invent a topology signature
  // for legacy input: true upgrade requires resolving the old bank index.
  function legacyVertex(p){
    const id=idOf(p);
    if(own(p,'anchor')||!['bank','objectType','primitive','vertex'].every(k=>own(p,k))||
      !bank(p.bank)||!objectType(p.objectType)||!index(p.primitive)||!index(p.vertex))fail('Invalid legacy vertex');
    return {id,bank:zero(p.bank),objectType:zero(p.objectType),primitive:zero(p.primitive),vertex:zero(p.vertex)};
  }
  function legacyVertexKey(p){
    const v=legacyVertex(p);return 'b'+v.bank+':p'+v.primitive+':v'+v.vertex;
  }
  function normalizeLandmark(kind,p){
    const id=idOf(p);
    if(own(p,'anchor')){
      shape(p,['id','anchor'],'Invalid material landmark fields');
      const anchor=normalizeAnchor(p.anchor);
      if(kind!==anchor.kind)fail('Observation and anchor kind mismatch');
      return {id,anchor};
    }
    if(kind!=='vertex')fail('Material anchor required');
    return legacyVertex(p);
  }
  // Strip transient viewer order, global primitive index, camera-space point,
  // depth and pixels. The caller must supply the verified bank signature and
  // explicitly chosen stable observation ID (not a generated geometric key).
  function fromPick(hit,signature,id){
    if(!record(hit)||hit.bank!==hit.owner?.bank)fail('Pick owner bank mismatch');
    return normalizeLandmark(hit.kind,{id,anchor:{kind:hit.kind,owner:hit.owner,
      primitive:hit.primitive,signature,indices:hit.indices,weights:hit.weights}});
  }
  return Object.freeze({WEIGHT_TOLERANCE,normalizeOwner,normalizeAnchor,anchorKey,
    legacyVertex,legacyVertexKey,normalizeLandmark,fromPick});
}));

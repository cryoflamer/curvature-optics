'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('../src/calibration/CameraMaterialAnchor');
const signature='bank-v1:sha256:'+'a'.repeat(64);
const owner=(stationIndex=2,column=0,objectType=8,bank=0)=>({
  kind:'object',bank,objectType,stationIndex,column,drawn:4-stationIndex,total:5
});
const span=(objectType=8,role='soundly-road',side=-1)=>({
  kind:'span',bank:0,objectType,from:owner(2,1,objectType),to:owner(1,1,objectType),role,side
});
const anchor=(kind='surface',indices=[2,5,8],weights=[.2,.3,.5])=>({
  kind,owner:owner(),primitive:4,signature,indices,weights
});

test('canonical material values preserve original indices and detach input data',()=>{
  const a=anchor(),n=api.normalizeAnchor(a);
  assert.deepEqual(n,a);
  assert.deepEqual(api.normalizeAnchor(anchor('vertex',[5],[1])).weights,[1]);
  assert.deepEqual(api.normalizeAnchor(anchor('edge',[8,2],[.75,.25])).indices,[2,8]);
  assert.deepEqual(api.normalizeAnchor(anchor('edge',[8,2],[.75,.25])).weights,[.25,.75]);
  a.owner.stationIndex=0;a.indices[0]=99;a.weights[0]=1;
  assert.deepEqual(n,anchor());
  assert.deepEqual(api.normalizeAnchor(JSON.parse(JSON.stringify(n))),n);
});

test('edge reversals and triangle permutations yield the same descriptor key',()=>{
  const a=anchor(),key=api.anchorKey(a);
  for(const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]){
    const b=anchor('surface',order.map(i=>a.indices[i]),order.map(i=>a.weights[i]));
    assert.equal(api.anchorKey(b),key);
  }
  assert.equal(api.anchorKey(anchor('edge',[2,8],[.25,.75])),api.anchorKey(anchor('edge',[8,2],[.75,.25])));
  assert.notEqual(api.anchorKey({...a,signature:'bank-v1:sha256:'+'b'.repeat(64)}),key);
  assert.notEqual(api.anchorKey({...a,primitive:5}),key);
  assert.notEqual(api.anchorKey({...a,owner:owner(3)}),key);
});

test('weight normalization is bounded and idempotent, including endpoints',()=>{
  for(const w of [[.2,.3,.5000000001],[0,0,1],[1,0,0],[.3333333333,.3333333333,.3333333333],
    [1e-20,.49999999995,.50000000001]]){
    const n=api.normalizeAnchor(anchor('surface',[2,5,8],w));
    assert.ok(Math.abs(n.weights.reduce((a,b)=>a+b,0)-1)<=Number.EPSILON);
    assert.ok(n.weights.every(x=>x>=0&&x<=1));
    assert.deepEqual(api.normalizeAnchor(n),n);
  }
  assert.deepEqual(api.normalizeAnchor(anchor('edge',[2,8],[0,1])).weights,[0,1]);
  assert.throws(()=>api.normalizeAnchor(anchor('surface',[2,5,8],[.2,.3,.50000001])),/sum/);
});

test('strict owner context preserves source roles and rejects invalid spans',()=>{
  for(const [type,role,side] of [[6,'bridge-road',null],[7,'tensas-shore',null],[7,'tensas-road',1],
    [8,'soundly-road',-1],[9,'soundly-road',1]]){
    const o=span(type,role,side);
    assert.deepEqual(api.normalizeOwner(o),o);
    assert.deepEqual(api.normalizeAnchor({...anchor(),owner:o,primitive:0}).owner,o);
    assert.throws(()=>api.normalizeAnchor({...anchor(),owner:o,primitive:1}),/primitive/);
  }
  for(const o of [{...owner(),column:3},{...owner(),drawn:0},{...owner(),total:501},{...owner(),bank:2},
    {...span(),to:owner(1,2)},{...span(),to:owner(0,1)},{...span(),side:null},
    {...span(),role:'unknown'},{...span(),from:owner(2,1,7)},span(6,'soundly-road',1)]){
    assert.throws(()=>api.normalizeOwner(o),/owner|span/);
  }
});

test('malformed anchor fields, weights, signatures and indices are rejected',()=>{
  const a=anchor();
  for(const b of [null,{...a,kind:'metric'},{...a,kind:'constructor'},{...a,primitive:-1},
    {...a,primitive:1.5},{...a,primitive:Number.MAX_SAFE_INTEGER+1},{...a,indices:[2,2,8]},
    {...a,indices:[-1,5,8]},{...a,indices:[2,5]},{...a,indices:[2,,8]},
    {...a,weights:[.2,.3,NaN]},{...a,weights:[.2,.3,Infinity]},{...a,weights:[.2,-.1,.9]},
    {...a,weights:[.2,.8,1.1]},{...a,weights:[.2,,.8]},{...a,weights:[0,0,0]},
    {...a,signature:'bank-v2:sha256:'+'a'.repeat(64)},{...a,signature:'bank-v1:sha256:xyz'},
    {...a,signature:signature.toUpperCase()},{...a,pixel:[1,2]},{...a,owner:{...owner(),placedObjectIndex:1}}]){
    assert.throws(()=>api.normalizeAnchor(b),TypeError);
  }
});

test('legacy vertex adapter preserves opaque headless IDs and historical portable key',()=>{
  const legacy={id:'tower:3',bank:0,objectType:3,primitive:2,vertex:3};
  assert.deepEqual(api.normalizeLandmark('vertex',legacy),legacy);
  assert.equal(api.legacyVertexKey(legacy),'b0:p2:v3');
  assert.deepEqual(api.legacyVertex({...legacy,id:'b0:p2:v3'}),{...legacy,id:'b0:p2:v3'});
  assert.equal(api.normalizeLandmark('vertex',legacy).anchor,undefined);
  assert.throws(()=>api.normalizeLandmark('edge',legacy),/anchor required/);
  assert.throws(()=>api.legacyVertex({...legacy,vertex:-1}),/legacy vertex/);
  assert.throws(()=>api.legacyVertex({...legacy,id:' '}),/ID/);
  assert.throws(()=>api.legacyVertex({...legacy,anchor:anchor()}),/legacy vertex/);
});

test('stable observation ID is independent from material anchor kind and key',()=>{
  const id='b0:p2:v3',a=anchor();
  const l=api.normalizeLandmark('surface',{id,anchor:a});
  const moved=api.normalizeLandmark('edge',{id,anchor:anchor('edge',[2,5],[.4,.6])});
  assert.equal(l.id,moved.id);
  assert.notEqual(api.anchorKey(l.anchor),api.anchorKey(moved.anchor));
  assert.deepEqual(api.normalizeLandmark('surface',{id:'other',anchor:a}).anchor,l.anchor);
  assert.throws(()=>api.normalizeLandmark('edge',l),/kind mismatch/);
  assert.throws(()=>api.normalizeLandmark('surface',{...l,vertex:3}),/fields/);
});

test('viewer pick adapter drops transient projection and enumeration fields',()=>{
  const hit={kind:'surface',bank:0,owner:owner(),primitive:4,index:312,order:17,
    indices:[8,2,5],weights:[.5,.2,.3],point:[1,2,3],pixel:[100,200],depth:400,
    distance:0,roundTripError:0};
  const a=api.fromPick(hit,signature,'pair-7');
  const b=api.fromPick({...hit,index:999,order:1,point:[4,5,6],pixel:[2,3]},signature,'pair-7');
  assert.deepEqual(a,b);
  assert.deepEqual(a,{id:'pair-7',anchor:anchor()});
  assert.throws(()=>api.fromPick({...hit,bank:1},signature,'pair-7'),/bank/);
  assert.throws(()=>api.fromPick(hit,undefined,'pair-7'),/signature/);
});

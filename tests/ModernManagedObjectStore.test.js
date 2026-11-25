'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const managed=require('../src/storage/ModernManagedObjectStore');
function fixture(){
  let opened=0;
  const env={
    indexedDB:{open(){opened++;throw Error('Unexpected IndexedDB open');}},
    crypto:{randomUUID(){return 'object-id';}}
  };
  const types=[{type:'example',version:1,validate:v=>Array.isArray(v?.refs),references:v=>v.refs}];
  return {env,types,get opened(){return opened;}};
}
function input(overrides={}){
  return {documentId:'document',kind:'test',expectedRevision:0,metadata:{},
    slot:'value',type:'example',version:1,payload:{refs:[]},...overrides};
}
test('managed object core is opt-in and validates its type registry',()=>{
  const f=fixture(),s=managed.create(f.env,{types:f.types});
  assert.equal(managed.DATABASE,'curvature-modern-managed-objects');
  assert.equal(s.newObjectId(),'object-id');
  assert.equal(f.opened,0);
  assert.throws(()=>managed.create({}, {types:f.types}),/IndexedDB required/);
  assert.throws(()=>managed.create(f.env,{types:[...f.types,...f.types]}),/duplicate type adapter/);
  assert.throws(()=>managed.create(f.env,{types:[{...f.types[0],version:0}]}),/invalid type version/);
  assert.throws(()=>managed.create(f.env,{types:[{...f.types[0],references:null}]}),/type adapter required/);
  assert.equal(f.opened,0);
});
test('invalid payloads, reference slots and unsupported versions fail before opening IndexedDB',async()=>{
  const f=fixture(),s=managed.create(f.env,{types:f.types});
  await assert.rejects(s.createAndAttach(input({version:2})),/unsupported resource type/);
  await assert.rejects(s.createAndAttach(input({payload:{}})),/invalid payload/);
  await assert.rejects(s.createAndAttach(input({expectedRevision:-1})),/expected revision required/);
  await assert.rejects(s.createAndAttach(input({payload:{refs:[
    {slot:'dup',target:'a',strength:'strong'},{slot:'dup',target:'b',strength:'weak'}
  ]}})),/duplicate reference slot/);
  await assert.rejects(s.setReference({documentId:'document',expectedRevision:1,
    slot:'bad',target:'a',strength:'maybe'}),/invalid reference strength/);
  assert.equal(f.opened,0);
});
test('batch creation validates every input and rejects duplicate IDs before opening storage',async()=>{
  const f=fixture(),s=managed.create(f.env,{types:f.types});
  const resource={id:'new',type:'example',version:1,payload:{refs:[]}};
  const plan={documentId:'document',kind:'test',expectedRevision:0,metadata:{},
    references:[{slot:'value',target:'new',strength:'strong'}]};
  await assert.rejects(s.writeDocument({...plan,resources:[resource,resource]}),/duplicate new object ID/);
  await assert.rejects(s.writeDocument({...plan,resources:[resource,{...resource,id:'bad',version:9}]}),
    /unsupported resource type/);
  assert.equal(f.opened,0);
});
test('live retention and collection fail closed without resource coordination',async()=>{
  const f=fixture(),s=managed.create(f.env,{types:f.types});
  await assert.rejects(s.collectGarbage('object-id'),/resource coordination unavailable/);
  await assert.rejects(s.withRetained('object-id',()=>{}),/resource coordination unavailable/);
  assert.equal(f.opened,0);
});

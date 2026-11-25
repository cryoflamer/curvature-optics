'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const barrier=require('../src/storage/ModernBackupWriteBarrier.js');

function deferred(){
  let resolve,reject;
  const promise=new Promise((a,b)=>{resolve=a;reject=b;});
  return {promise,resolve,reject};
}
// Faithful enough to exercise shared/exclusive lock ordering without using
// a browser. The targeted Chromium test covers the real cross-tab API.
function lockManager(){
  const queue=[],active=new Set(),issued=[];
  function next(){
    if([...active].some(e=>e.mode==='exclusive'))return;
    while(queue.length){
      const item=queue[0];
      if(item.mode==='exclusive'&&active.size)return;
      queue.shift();active.add(item);issued.push(item.mode);
      Promise.resolve().then(()=>item.callback({name:item.name,mode:item.mode}))
        .then(item.resolve,item.reject).finally(()=>{active.delete(item);next();});
      if(item.mode==='exclusive')return;
    }
  }
  return {issued,request(name,options,callback){
    return new Promise((resolve,reject)=>{
      queue.push({name,mode:options.mode,callback,resolve,reject});
      next();
    });
  }};
}

test('unavailable locks and duplicate or invalid writer registrations fail closed',()=>{
  assert.throws(()=>barrier.create(null),/Web Locks unavailable/);
  assert.throws(()=>barrier.create({}),/Web Locks unavailable/);
  const coordinator=barrier.create(lockManager());
  assert.throws(()=>coordinator.registerWriter('bad owner'),/invalid writer/);
  assert.throws(()=>coordinator.registerWriter('__proto__'),/invalid writer/);
  const writer=coordinator.registerWriter('working.session');
  assert.equal(writer.owner,'working.session');
  assert.ok(Object.isFrozen(writer));
  assert.throws(()=>coordinator.registerWriter('working.session'),/already registered/);
});

test('two participating writers use shared lock while snapshot waits for both acknowledgements',async()=>{
  const locks=lockManager(),a=barrier.create(locks),b=barrier.create(locks);
  const first=a.registerWriter('working.session'),second=b.registerWriter('animation.draft');
  const releaseOne=deferred(),releaseTwo=deferred();
  const enteredOne=deferred(),enteredTwo=deferred();
  const events=[];
  const one=first.commit(async()=>{events.push('writer1-enter');enteredOne.resolve();
    await releaseOne.promise;events.push('writer1-ack');return 11;});
  const two=second.commit(async()=>{events.push('writer2-enter');enteredTwo.resolve();
    await releaseTwo.promise;events.push('writer2-ack');return 12;});
  await Promise.all([enteredOne.promise,enteredTwo.promise]);
  const snapshot=b.snapshot(async()=>{events.push('snapshot-read');return {status:'read-only'};});
  await Promise.resolve();
  assert.deepEqual(events,['writer1-enter','writer2-enter']);
  releaseOne.resolve();releaseTwo.resolve();
  assert.equal(await one,11);assert.equal(await two,12);
  const result=await snapshot;
  assert.equal(result.coordination,'participating-writers-only');
  assert.equal(result.eligibleForMigration,false);
  assert.deepEqual(result.localRegisteredWriters,['animation.draft']);
  assert.deepEqual(result.value,{status:'read-only'});
  assert.equal(events.at(-1),'snapshot-read');
  assert.deepEqual(locks.issued,['shared','shared','exclusive']);
});

test('exclusive snapshot blocks a subsequently queued cooperative writer',async()=>{
  const locks=lockManager(),a=barrier.create(locks),b=barrier.create(locks);
  const writer=b.registerWriter('calibration.projects');
  const entered=deferred(),release=deferred(),events=[];
  const read=a.snapshot(async()=>{
    events.push('snapshot-enter');entered.resolve();
    await release.promise;events.push('snapshot-exit');return 1;
  });
  await entered.promise;
  const pending=writer.commit(async()=>{events.push('writer-ack');return 'saved';});
  await Promise.resolve();
  assert.deepEqual(events,['snapshot-enter']);
  release.resolve();
  assert.equal((await read).value,1);
  assert.equal(await pending,'saved');
  assert.deepEqual(events,['snapshot-enter','snapshot-exit','writer-ack']);
});

test('a failed committed operation rejects and releases its lock; no success is invented',async()=>{
  const locks=lockManager(),instance=barrier.create(locks);
  const writer=instance.registerWriter('reference.images');
  await assert.rejects(writer.commit(async()=>{throw Error('IndexedDB transaction aborted');}),
    /IndexedDB transaction aborted/);
  const result=await instance.snapshot(async()=>42);
  assert.equal(result.value,42);
  assert.equal(result.eligibleForMigration,false);
  assert.deepEqual(locks.issued,['shared','exclusive']);
});

test('a denied exclusive lock never executes snapshot work',async()=>{
  let called=false;
  const broken={async request(name,options,fn){return fn(null);}};
  const instance=barrier.create(broken);
  await assert.rejects(instance.snapshot(async()=>{called=true;}),/lock was not granted/);
  assert.equal(called,false);
});

test('writer callback must be callable and a failed snapshot releases for subsequent writers',async()=>{
  const locks=lockManager(),instance=barrier.create(locks);
  const writer=instance.registerWriter('reference.images');
  await assert.rejects(writer.commit(null),/operation must be callable/);
  await assert.rejects(instance.snapshot(async()=>{throw Error('capture failed');}),
    /capture failed/);
  assert.equal(await writer.commit(async()=> 'committed'),'committed');
  assert.deepEqual(locks.issued,['exclusive','shared']);
});

test('route fence drains preceding writes and checks queued writers at lock grant',async()=>{
  const locks=lockManager(),values=new Map();
  const storage={getItem:key=>values.get(key)??null};
  const a=barrier.create(locks,{routeStorage:storage}),b=barrier.create(locks,{routeStorage:storage});
  const legacy=a.registerWriter('working.session'),managed=b.registerWriter('managed.objects');
  const ui=b.registerWriter('ui.registry'),unknown=b.registerWriter('future.writer');
  const entered=deferred(),release=deferred(),events=[];
  const first=legacy.commit(async()=>{entered.resolve();await release.promise;events.push('ack');});
  await entered.promise;
  const marker={format:'curvature-modern-storage-route',version:1,state:'preparing',backupSha256:'a'.repeat(64)};
  const cut=a.snapshot(()=>{events.push('fence');values.set(barrier.ROUTE_KEY,JSON.stringify(marker));});
  const queued=legacy.commit(()=>{events.push('stale');});
  const refused=assert.rejects(queued,/writer fenced by preparing/);
  release.resolve();
  await Promise.all([first,cut,refused]);
  assert.deepEqual(events,['ack','fence']);
  assert.deepEqual(barrier.readRoute(storage),marker);
  assert.equal(await managed.commit(()=>42),42);
  await assert.rejects(ui.commit(()=>0),/writer fenced/);
  await a.snapshot(()=>values.set(barrier.ROUTE_KEY,JSON.stringify({...marker,state:'managed'})));
  assert.equal(await ui.commit(()=>43),43);
  await assert.rejects(legacy.commit(()=>0),/writer fenced by managed/);
  await assert.rejects(unknown.commit(()=>0),/writer fenced by managed/);
  await a.snapshot(()=>values.set(barrier.ROUTE_KEY,'broken'));
  await assert.rejects(managed.commit(()=>0),/invalid storage route/);
  await a.snapshot(()=>values.delete(barrier.ROUTE_KEY));
  assert.equal(await legacy.commit(()=>44),44);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const actions=require('../src/animation/ModernAnimationLibraryActions');

function deferred(){
  let resolve,reject;
  const promise=new Promise((a,b)=>{resolve=a;reject=b;});
  return {promise,resolve,reject};
}
function harness(settings={}){
  const logs=[],records=new Map([['alpha',{id:'alpha',updatedAt:1,
    project:{name:'Alpha'}}],['beta',{id:'beta',updatedAt:2,project:{name:'Beta'}}]]);
  const state={busy:false,selected:'alpha',entries:[],active:null};
  state.entries=[...records.values()];
  let reject=false,renaming=0;
  const library={MAX_PORTABLE_LENGTH:1024,
    list(){logs.push('list');return Promise.resolve([...records.values()]);},
    exportPortable(items){return JSON.stringify(items.map(e=>e.id));},
    parsePortable(text){return JSON.parse(text);},
    importEntries(db,items){logs.push('import');if(reject)return Promise.reject(Error('import denied'));
      items.forEach(id=>records.set(id,{id,updatedAt:1,project:{name:id}}));
      return Promise.resolve({createdIds:items,reusedIds:[],created:items.length,reused:0});},
    rename(db,id,name,expected){logs.push(['rename',id,name,expected]);
      if(reject)return Promise.reject(Error('stale revision'));
      const current=records.get(id),updated={...current,updatedAt:++renaming+2,
        project:{name}};
      records.set(id,updated);return Promise.resolve(updated);},
    create(db,project,quality,now,thumbnail,allowDuplicate){
      logs.push(['create',quality,allowDuplicate,thumbnail]);
      if(reject)return Promise.reject(Error('storage denied'));
      const record={id:project.id,updatedAt:4,project};records.set(record.id,record);
      return Promise.resolve(record);},
    update(db,project,quality,revision,now,thumbnail){
      logs.push(['update',quality,revision,thumbnail]);
      if(reject)return Promise.reject(Error('stale revision'));
      const record={id:project.id,updatedAt:5,project};records.set(record.id,record);
      return Promise.resolve(record);},
    remove(db,id){logs.push(['remove',id]);
      if(reject)return Promise.reject(Error('deletion denied'));
      return Promise.resolve(records.delete(id));}
  };
  let pending=null;
  if(settings.deferredSave){
    pending=deferred();
    library.create=()=>pending.promise;
  }
  const service=actions.create({
    library:()=>settings.noLibrary?null:library,
    indexedDB:()=>settings.noDb?null:{},crypto:()=>({}),
    busy:()=>state.busy,setBusy:value=>{state.busy=value;logs.push(['busy',value]);},
    entries:()=>state.entries,selected:()=>state.selected,select:id=>{state.selected=id;},
    render:()=>logs.push('render'),
    notice:(message,error)=>logs.push(['notice',message,error]),
    fail:message=>logs.push(['fail',message]),
    confirm:message=>{logs.push(['confirm',message]);return settings.confirm!==false;},
    download:(value,name)=>logs.push(['download',value,name]),
    refreshState:entries=>{state.entries=entries;logs.push('entries');},
    importKeyframeThumbnails:settings.importKeyframeThumbnails,
    imported:result=>{state.selected=result.createdIds[0];logs.push(['imported',result.created]);state.thumbnailWarning=result.thumbnailWarning;},
    renamed:(saved,old,id)=>{state.active=saved;logs.push(['renamed',id,old.updatedAt,saved.updatedAt]);},
    saved:(saved,request)=>{state.active=saved;state.selected=saved.id;
      logs.push(['saved',saved.id,request.replace]);},
    deleted:(id,removed)=>{logs.push(['deleted',id,removed]);state.selected='';}
  });
  return {service,state,logs,records,pending,fail:()=>{reject=true;},retry:()=>{reject=false;}};
}

test('classic script initializes before ModernApp without CommonJS',()=>{
  const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const filename='src/animation/ModernAnimationLibraryActions.js';
  assert.ok(html.indexOf(filename)>html.indexOf('ModernAnimationLibrary.js'));
  assert.ok(html.indexOf(filename)<html.indexOf('src/ui/modern/ModernApp.js'));
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root,filename),'utf8'),context);
  assert.equal(typeof context.CurvatureModernAnimationLibraryActions.create,'function');
  assert.equal(vm.runInContext('typeof require',context),'undefined');
});

test('refresh handles missing Library and unavailable IndexedDB without damaging selections',async()=>{
  for(const settings of [{noLibrary:true},{noDb:true}]){
    const h=harness(settings);
    assert.deepEqual(await h.service.refresh(),[]);
    assert.equal(h.state.selected,'alpha');
    assert.ok(h.logs.some(e=>Array.isArray(e)&&e[0]==='notice'));
  }
  assert.throws(()=>actions.create({}),/require state/);
});

test('export selected and all preserve portable JSON, filenames and selection',()=>{
  const h=harness();
  h.service.exportEntries(false);h.service.exportEntries(true);
  const downloads=h.logs.filter(e=>Array.isArray(e)&&e[0]==='download');
  assert.deepEqual(downloads.map(e=>[e[1],e[2]]),[
    ['["alpha"]','curvature-animation.json'],
    ['["alpha","beta"]','curvature-animations.json']]);
  assert.equal(h.state.selected,'alpha');
});

test('portable import validates file size before reading and refreshes after import',async()=>{
  const h=harness();let read=0;
  await h.service.importFile({size:2000,text:()=>{read++;return Promise.resolve('[]');}});
  assert.equal(read,0);assert.equal(h.state.busy,false);
  await h.service.importFile({size:30,text:()=>{read++;return Promise.resolve('["gamma"]');}});
  assert.equal(read,1);assert.equal(h.state.selected,'gamma');
  assert.equal(h.records.has('gamma'),true);assert.equal(h.state.busy,false);
  assert.ok(h.logs.indexOf('import')<h.logs.lastIndexOf('list'));
});

test('invalid JSON and storage failures release busy and retain existing records',async()=>{
  const h=harness();
  await h.service.importFile({size:10,text:()=>Promise.resolve('nope')});
  assert.equal(h.state.busy,false);
  h.fail();await h.service.importFile({size:9,text:()=>Promise.resolve('["new"]')});
  assert.equal(h.records.has('new'),false);assert.equal(h.state.busy,false);
  assert.ok(h.logs.filter(e=>Array.isArray(e)&&e[0]==='fail').length>=2);
});

test('rename uses exact expected revision, reports stale error without rebase',async()=>{
  const h=harness();
  await h.service.rename('alpha','Renamed');
  assert.deepEqual(h.logs.find(e=>Array.isArray(e)&&e[0]==='rename'),
    ['rename','alpha','Renamed',1]);
  assert.equal(h.state.active.project.name,'Renamed');
  h.fail();await h.service.rename('alpha','Denied');
  assert.equal(h.state.active.project.name,'Renamed');
  assert.equal(h.state.busy,false);
});

test('Save As permits duplicates; Save Changes carries exact active revision and thumbnail',async()=>{
  const h=harness(),thumbnail={dataUrl:'png'};
  assert.equal(await h.service.save({project:{id:'copy',name:'Copy'},quality:'fast',
    replace:false,thumbnail}),true);
  assert.deepEqual(h.logs.find(e=>Array.isArray(e)&&e[0]==='create'),
    ['create','fast',true,thumbnail]);
  assert.equal(h.state.selected,'copy');
  assert.equal(await h.service.save({project:{id:'alpha',name:'Edited'},quality:'auto',
    replace:true,active:{id:'alpha',updatedAt:17},thumbnail}),true);
  assert.deepEqual(h.logs.find(e=>Array.isArray(e)&&e[0]==='update'),
    ['update','auto',17,thumbnail]);
});

test('failed Save Changes keeps current editor active and releases busy for retry',async()=>{
  const h=harness();h.fail();
  const request={project:{id:'alpha',name:'Edited'},replace:true,quality:'auto',
    active:{id:'alpha',updatedAt:1}};
  assert.equal(await h.service.save(request),false);
  assert.equal(h.state.active,null);assert.equal(h.state.busy,false);
  h.retry();assert.equal(await h.service.save(request),true);
  assert.equal(h.state.active.project.name,'Edited');
});

test('pending save blocks second save or import until the first has completed',async()=>{
  const h=harness({deferredSave:true}),request={project:{id:'copy',name:'Copy'},replace:false};
  const first=h.service.save(request);
  assert.equal(h.state.busy,true);
  assert.equal(await h.service.save(request),false);
  h.service.importFile({size:3,text:()=>Promise.resolve('[]')});
  assert.equal(h.logs.includes('import'),false);
  h.pending.resolve({id:'copy',project:request.project,updatedAt:3});
  assert.equal(await first,true);assert.equal(h.state.busy,false);
});

test('delete prompts before removing, never signals detachment when canceled or failed',async()=>{
  const canceled=harness({confirm:false});
  canceled.service.remove('alpha');
  assert.equal(canceled.records.has('alpha'),true);
  assert.equal(canceled.logs.some(e=>Array.isArray(e)&&e[0]==='remove'),false);
  const h=harness();h.fail();await h.service.remove('alpha');
  assert.equal(h.state.selected,'alpha');
  assert.equal(h.logs.some(e=>Array.isArray(e)&&e[0]==='deleted'),false);
  assert.equal(h.state.busy,false);h.retry();
  await h.service.remove('alpha');
  assert.equal(h.records.has('alpha'),false);
  assert.ok(h.logs.some(e=>Array.isArray(e)&&e[0]==='deleted'&&e[2]===true));
  assert.equal(h.state.selected,'');
});


test('thumbnail attachments are imported only after project commit and failure is non-destructive',async()=>{
  const seen=[],h=harness({importKeyframeThumbnails:items=>{seen.push(items);return false;}});
  h.fail();await h.service.importFile({size:12,text:()=>Promise.resolve('["gamma"]')});
  assert.equal(seen.length,0);assert.equal(h.records.has('gamma'),false);
  h.retry();await h.service.importFile({size:12,text:()=>Promise.resolve('["gamma"]')});
  assert.deepEqual(seen,[['gamma']]);assert.equal(h.records.has('gamma'),true);
  assert.equal(h.state.thumbnailWarning,true);assert.equal(h.state.busy,false);
});

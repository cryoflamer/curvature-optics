'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const crypto=require('node:crypto');
const catalog=require('../src/animation/ModernDemoCatalog');
const library=require('../src/animation/ModernAnimationLibrary');
const projects=require('../src/animation/ModernAnimationProject');
const generator=require('../tools/build-modern-demo-catalog');
const root=path.resolve(__dirname,'..');
const directory=path.join(root,'demos/modern');
const source=fs.readFileSync(path.join(directory,'soundly.json'),'utf8');
const manifest=entries=>JSON.stringify({format:catalog.FORMAT,version:catalog.VERSION,demos:entries});
const soundly={id:'soundly',asset:'soundly.json'};
const cloneSource=()=>JSON.parse(source);
const parse=(entries,reader=()=>source)=>catalog.parse(manifest(entries),reader);

test('shipped Soundly is the original export, with its complete camera trajectory',()=>{
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'),
    '1d404662096922477329db126f8eac207bc45785f9cebaf078a56e8db1a214bb');
  const [demo]=catalog.load();
  assert.equal(demo.id,'soundly');
  assert.notEqual(demo.id,demo.project.id);
  assert.deepEqual(demo.project,library.parsePortable(source)[0].project);
  assert.equal(demo.quality,'auto');
  assert.equal(demo.project.keyframes.length,9);
  assert.equal(demo.project.interpolation,'spline');
  assert.equal(demo.project.baseExperiment.display.mode,'scene');
  assert.equal(projects.totalMs(demo.project),59100);
  assert.equal(demo.project.baseExperiment.compare.A.surface,'globe');
  assert.equal(demo.project.baseExperiment.compare.B.surface,'flat');
});

test('catalog source and nested runtime data are immutable; load owns independent objects',()=>{
  const first=catalog.load(),second=catalog.load();
  function frozen(value){
    if(value&&typeof value==='object'){
      assert.ok(Object.isFrozen(value));
      Object.values(value).forEach(frozen);
    }
  }
  frozen(first);frozen(require('../src/animation/ModernDemoCatalogData'));
  assert.notEqual(first,second);
  assert.notEqual(first[0].project.keyframes[0].value,second[0].project.keyframes[0].value);
  assert.throws(()=>{first[0].project.keyframes[0].value.Height=42;},TypeError);
  assert.throws(()=>{first.push({});},TypeError);
  assert.equal(second[0].project.keyframes[0].value.Height,200);
});

test('manifest order is preserved and metadata derives from each portable project',()=>{
  const another=cloneSource();another.animations[0].project.id='other-project';
  another.animations[0].project.name='Another authored name';
  const result=parse([{id:'second',asset:'other.json'},soundly],
    asset=>asset==='other.json'?JSON.stringify(another):source);
  assert.deepEqual(result.map(d=>d.id),['second','soundly']);
  assert.equal(result[0].project.name,'Another authored name');
  assert.deepEqual(parse([]),[]);
});

test('manifest rejects unsupported versions, malformed entries, duplicates and unsafe paths before reading',()=>{
  const bad=[
    '{}','not json',JSON.stringify({format:catalog.FORMAT,version:2,demos:[]}),
    manifest([soundly,{...soundly,asset:'other.json'}]),
    manifest([soundly,{...soundly,id:'other'}]),
    ...['../soundly.json','/soundly.json','https://example.org/x.json','x.json?x=1','catalog.json','x\\y.json'].map(asset=>manifest([{id:'a',asset}])),
    manifest([{id:'animation_a',asset:'soundly.json'}]),manifest([{...soundly,name:'duplicated'}])
  ];
  for(const value of bad){let reads=0;assert.throws(()=>catalog.parse(value,()=>{reads++;return source;}));assert.equal(reads,0);}
});

test('invalid, missing, multi-project, duplicate-project and non-playable assets fail explicitly',()=>{
  const multi=cloneSource();multi.animations.push(multi.animations[0]);
  const invalid=cloneSource();invalid.animations[0].project.keyframes[0].value.Height='bad';
  const short=cloneSource();short.animations[0].project.keyframes=[];
  for(const [value,reason] of [[undefined,/Missing asset/],['bad',/JSON/],
    [JSON.stringify(multi),/exactly one/],[JSON.stringify(invalid),/Built-in demo soundly/],
    [JSON.stringify(short),/not preview-ready/]]){
    assert.throws(()=>parse([soundly],()=>value),reason);
  }
  assert.throws(()=>parse([soundly,{id:'other',asset:'other.json'}]),/Duplicate authored project ID/);
  assert.throws(()=>parse([soundly],()=>{throw Error('ENOENT');}),/soundly.*ENOENT/);
});

test('browser-local History provenance is cleared only in the runtime catalog',()=>{
  const input=cloneSource();input.animations[0].project.keyframes[0].sourceSnapshotId='history-123';
  const [demo]=parse([soundly],()=>JSON.stringify(input));
  assert.equal(demo.project.keyframes[0].sourceSnapshotId,null);
  assert.equal(input.animations[0].project.keyframes[0].sourceSnapshotId,'history-123');
});

test('generated classic script is reproducible from canonical JSON and missing assets fail generation',()=>{
  assert.equal(generator.build(),fs.readFileSync(path.join(root,'src/animation/ModernDemoCatalogData.js'),'utf8'));
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'curvature-demo-'));
  try{
    fs.writeFileSync(path.join(temp,'catalog.json'),manifest([soundly]));
    assert.throws(()=>generator.build(temp),/soundly.*ENOENT/);
    fs.writeFileSync(path.join(temp,'soundly.json'),source);
    const result=generator.build(temp);
    assert.equal(result,generator.build(temp));
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});

test('classic-script loading needs no fetch, IndexedDB or localStorage and reports missing bundle',()=>{
  const context=vm.createContext({CurvatureModernAnimationProject:projects,
    CurvatureModernAnimationLibrary:library});
  for(const name of ['fetch','indexedDB','localStorage']){
    Object.defineProperty(context,name,{get(){throw Error(name+' used by catalog');}});
  }
  vm.runInContext(fs.readFileSync(path.join(root,'src/animation/ModernDemoCatalog.js'),'utf8'),context);
  assert.throws(()=>context.CurvatureModernDemoCatalog.load(),/Missing built-in demo catalog data/);
  vm.runInContext(fs.readFileSync(path.join(root,'src/animation/ModernDemoCatalogData.js'),'utf8'),context);
  assert.equal(context.CurvatureModernDemoCatalog.load()[0].project.name,'Soundly Causeway · Bridge Camera Study');
  context.CurvatureModernDemoCatalogData={manifest:manifest([soundly]),assets:{}};
  assert.throws(()=>context.CurvatureModernDemoCatalog.load(),/Missing asset: soundly.json/);
});

test('Modern loads data and reader once, after library, before app; Legacy does not load them',()=>{
  const modern=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const scripts=[...modern.matchAll(/<script src="([^"?]+)(?:\?[^\"]*)?"/g)].map(m=>m[1]);
  const ordered=['src/animation/ModernAnimationLibrary.js','src/animation/ModernDemoCatalogData.js',
    'src/animation/ModernDemoCatalog.js','src/ui/modern/ModernApp.js'];
  ordered.forEach((file,i)=>{
    assert.equal(scripts.filter(s=>s===file).length,1);
    if(i)assert.ok(scripts.indexOf(file)>scripts.indexOf(ordered[i-1]));
  });
  for(const file of ['CurvatureApp.html','CurvatureDemosHost.html'])
    assert.doesNotMatch(fs.readFileSync(path.join(root,file),'utf8'),/ModernDemoCatalog(?:Data)?\.js/);
});

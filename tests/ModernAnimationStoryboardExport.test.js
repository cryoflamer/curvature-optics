'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const batch=require('../src/animation/ModernAnimationStoryboardExport');
const library=require('../src/animation/ModernAnimationLibrary');
const catalog=require('../src/animation/ModernDemoCatalog');
const projects=require('../src/animation/ModernAnimationProject');
const project=catalog.load()[0].project;
const image={mode:'compare',width:960,height:320,dataUrl:'data:image/webp;base64,AAAA'};
const frames=projects.frameExperiments(project);
const entry={version:1,id:project.id,project,quality:'canvas-direct',createdAt:1,updatedAt:1};
test('complete export reuses existing images, renders missing physical states, and retains results outside cache',async()=>{
  const rendered=[],progress=[];let yields=0;
  const lookup=await batch.collect(project,{lookup:e=>JSON.stringify(e)===JSON.stringify(frames[0])?image:null,
    render:e=>{rendered.push(e);return image;},yieldFrame:()=>{yields++;},progress:(n,total)=>progress.push([n,total])});
  assert.deepEqual(rendered,frames.slice(1));assert.equal(yields,8);
  assert.deepEqual(progress.at(-1),[9,9]);
  const [decoded]=library.parsePortable(library.exportPortable([entry],lookup,{complete:true}));
  assert.equal(decoded.keyframeThumbnails.length,9);
  assert.deepEqual(decoded.project,project);
  assert.equal(library.parsePortable(library.exportPortable([entry]))[0].keyframeThumbnails,undefined);
});
test('regeneration does not reuse existing cache and rejects failed or cancelled capture',async()=>{
  let calls=0;
  await batch.collect(project,{refresh:true,lookup:()=>{throw Error('cache used');},render:()=>{calls++;return image;}});
  assert.equal(calls,9);
  await assert.rejects(batch.collect(project,{render:()=>null}),/keyframe 1/);
  await assert.rejects(batch.collect(project,{render:()=>image,cancelled:()=>true}),/cancelled/);
  let cancelled=false;
  await assert.rejects(batch.collect(project,{render:()=>{cancelled=true;return image;},cancelled:()=>cancelled}),/cancelled/);
  assert.throws(()=>library.exportPortable([entry],()=>null,{complete:true}),/keyframe 1/);
  assert.throws(()=>library.exportPortable([entry],undefined,{complete:true}),/lookup required/);
});
test('detached demo data keeps shipped thumbnails only for the authored display',()=>{
  const manifest=mode=>JSON.stringify({format:catalog.FORMAT,version:1,demos:[{id:'sample',asset:'sample.json',displayMode:mode}]});
  const json=library.exportPortable([entry],()=>image,{complete:true});
  const [demo]=catalog.parse(manifest('compare'),()=>json);
  assert.equal(demo.keyframeThumbnails.length,9);assert.ok(Object.isFrozen(demo.keyframeThumbnails[0].image));
  assert.equal(catalog.parse(manifest('scene'),()=>json)[0].keyframeThumbnails.length,0);
});
test('paired capture re-renders approximate side when other side falls back',()=>{
  const calls=[],graphs={A:{Canvas:{}},B:{Canvas:{}}};
  const renderer={render:(e,side,g,opts)=>{calls.push([side,opts.quality]);return side==='B'?{quality:'accurate',fallback:'unsupported'}:{quality:opts.quality};}};
  const result=batch.renderPair(renderer,graphs,frames[0],{quality:'canvas-direct'});
  assert.deepEqual(calls,[['A','canvas-direct'],['B','canvas-direct'],['A','accurate']]);
  assert.deepEqual(result,[{layers:[graphs.A.Canvas]},{layers:[graphs.B.Canvas]}]);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const png=require('../src/animation/ModernAnimationFrameExport');
const compositor=require('../src/animation/ModernAnimationPresentationCompositor');
const lib=require('../src/animation/ModernDemoCatalog');
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=';
function fixture(){const project=structuredClone(lib.load()[0].project);project.keyframes[0].referenceImageIds=['observe'];project.keyframes[0].description='Actual observation';
 const record={version:1,id:'observe',original:{dataUrl:image,width:1,height:1},title:'Original',author:'Author',license:'CC BY',sourceUrl:'https://example.com/photo',cameraMetadata:{cameraHeightM:{status:'reported',value:3,uncertainty:1}}};
 return {project,record};}
function canvas(width,height){const calls=[],ctx={save(){},restore(){},setTransform(){},fillRect(){},drawImage(...a){calls.push(a);},measureText(s){return {width:s.length*8};},fillText(){}};
 return {width,height,calls,getContext(){return ctx;},async convertToBlob(){return new Blob([Uint8Array.from([137,80,78,71,13,10,26,10])],{type:'image/png'});}};}
test('presentation preview samples exact timestamp, uses both physical views and retains complete provenance',async()=>{
 const {project,record}=fixture(),opts={presentation:{referenceLayout:'side'},referenceImages:[record],width:1280,height:720,fps:25,previewTimeMs:0};
 const p=png.plan(project,opts),f=compositor.frameAt(p.presentation,0);assert.equal(p.presentation.referenceAspects.observe,1);assert.deepEqual(p.timesMs,[0]);assert.deepEqual(png.outputSides(p),['presentation']);assert.equal(p.sides.length,2);
 const output=canvas(1280,720),seen=[];const photo={width:1,height:1};
 const frame=await png.renderTimestamp(p,0,async(sample,side,d)=>{seen.push({sample,side,d});return {canvas:canvas(d.width,d.height),quality:'accurate',cameraModel:{showModel:f.expected[side].showModel},metrics:{opticalQuality:'accurate'}};},null,{canvas:()=>output,observation:async r=>compositor.observation(r,photo)});
 assert.equal(seen.length,2);assert.deepEqual(seen[0].sample,f.sample);assert.equal(seen[0].d.width,f.viewSize.width);assert.equal(seen[0].d.showCaptions,false);assert.equal(output.calls.length,3);assert.equal(output.calls[2][0],photo);
 assert.equal(frame.row.referenceId,'observe');assert.equal(frame.entries[0].name,'frames/frame_00000_presentation.png');
 const result=png.assemble(p,[frame]);assert.equal(result.previewBlob.type,'image/png');assert.equal(result.manifest.endpointIncluded,false);assert.equal(result.manifest.presentation.referenceImages[0].cameraMetadata.cameraHeightM.uncertainty,1);assert.equal(result.manifest.presentation.referenceImages[0].original.dataUrl,undefined);assert.equal(result.manifest.project.keyframes[0].description,'Actual observation');
 assert.throws(()=>png.assemble(p,[{...frame,row:{...frame.row,referenceId:null}}]),/metadata/);
});
test('asset identity is exact; hidden layout needs no originals and sequence caps remain enforced',()=>{
 const {project,record}=fixture();assert.throws(()=>png.plan(project,{presentation:{},width:1920,height:1080,previewTimeMs:0}),/linked IDs/);
 assert.throws(()=>png.plan(project,{presentation:{},width:1920,height:1080,referenceImages:[record],fps:25}),/Too many frames/);
 const p=png.plan(project,{presentation:{referenceLayout:'hidden'},width:3840,height:2160,fps:5});assert.equal(p.width,3840);assert.equal(p.timesMs.at(-1),p.durationMs);assert.deepEqual(p.referenceImages,[]);
 assert.throws(()=>png.plan(project,{presentation:{referenceLayout:'hidden'},width:1280,height:720,referenceImages:[record],fps:5}),/linked IDs/);
 assert.throws(()=>png.plan(project,{width:960,height:540,previewTimeMs:0}),/Preview requires/);
});

test('presentation HUD is composed externally, not burned into physical canvases',async()=>{
 const {project,record}=fixture(),p=png.plan(project,{presentation:{referenceLayout:'auto'},referenceImages:[record],width:1920,height:1080,previewTimeMs:0,cameraHud:true});
 const f=compositor.frameAt(p.presentation,0),out=canvas(p.width,p.height),photo={width:1,height:1},seen=[];
 const frame=await png.renderTimestamp(p,0,async(sample,side,d)=>{
   const c=canvas(d.width,d.height);seen.push({c,d});
   // Physical Canvas lacks strokeText; an accidental legacy HUD burn-in would throw.
   return {canvas:c,quality:'accurate',cameraModel:{showModel:f.expected[side].showModel,Height:8,CameraEast:0,CameraNorth:0,
     Pan:0,Nick:0,Roll:0,camViewAngle:0.1,deviceRatio:16/9,viewcenterHorizon:3,rEarth:6371000,rFEarth:10000000}};
 },null,{canvas:()=>out,observation:async r=>compositor.observation(r,photo)});
 assert.ok(seen.every(x=>x.d.showCaptions===false&&x.d.guideLabelScale===1.5));assert.equal(out.calls.length,3);
 assert.equal(png.assemble(p,[frame]).manifest.presentation.cameraHudPlacement,'external');
 assert.equal(frame.row.topology,f.topology);assert.throws(()=>png.assemble(p,[{...frame,row:{...frame.row,topology:'invalid'}}]),/metadata/);
});

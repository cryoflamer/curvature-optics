'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const variants=require('../src/animation/ModernAnimationAtmosphereVariant');
const projects=require('../src/animation/ModernAnimationProject');
const playback=require('../src/animation/ModernAnimationPlayback');
const studio=require('../src/animation/ModernAnimationStudio');
const thumbnails=require('../src/ui/modern/ModernExperimentThumbnail');
const demo=require('../src/animation/ModernDemoCatalog').load().find(d=>d.id==='soundly');
const app=fs.readFileSync('src/ui/modern/ModernApp.js','utf8');
const html=fs.readFileSync('CurvatureModern.html','utf8');
function harness(project=demo.project){
  let now=1000,paints=0,scheduled=0,cancelled=0,initial=0,refreshes=0;
  const nodes={};for(const id of ['ModernAnimationAtmosphereControl','ModernAnimationAtmosphere','ModernAnimationAtmosphereNote'])nodes[id]={};
  const draft=studio.fromProject(project),cache=thumbnails.createKeyframeCache();
  const ctx=vm.createContext({root:{CurvatureModernAnimationAtmosphereVariant:variants},
    studioPrepared:project,studioPlayback:playback.create(project),studioDraft:draft,
    studioSelectedKey:draft.frames[3].key,studioPlaybackApi:playback,studioProjects:projects,studioApi:studio,
    studioKeyframeThumbnails:cache,studioStoryboardJob:null,studioStoryboardStatus:'',
    studioThumbnailProject:null,studioThumbnailExperiments:null,studioHistoryEntries:[],
    studioActiveDemo:{...demo,project},thumbnailApi:thumbnails,
    studioPreviewRenderer:null,studioQualityAudit:null,studioLastQualityFrame:{},studioLastParity:{},
    studioPlaybackFpsMeter:{reset(){}},studioPlaybackLastPaint:0,studioPlaybackRenderedAt:0,
    profileNow:()=>now,newUiEl:id=>nodes[id],cancelStudioInitialPaint(){},
    ensureStudioPlaybackControls:()=>({cancel(){cancelled++;},schedule(){scheduled++;}}),
    scheduleStudioInitialPaint(reason){assert.equal(reason,'atmosphere');initial++;},
    renderAnimationStudio(){refreshes++;},syncStudioPlaybackControls(){ctx.syncStudioAtmosphereControl();},
    renderStudioPlaybackSample(force){assert.equal(force,true);paints++;}});
  const a=app.indexOf('  function studioAtmosphereMode('),b=app.indexOf('  // Benchmarks use',a);
  const c=app.indexOf('  function studioKeyframeExperiment('),d=app.indexOf('  function studioStoryboardBatch(',c);
  vm.runInContext(app.slice(a,b)+app.slice(c,d),ctx);ctx.syncStudioAtmosphereControl();
  return {ctx,nodes,cache,now:v=>{now=v;},stats:()=>({paints,scheduled,cancelled,initial,refreshes})};
}
test('shared controls remain outside author-only layout; runtime switch retains authored project and paused time',()=>{
  assert.match(html,/<div class="modern-animation-playback-controls">\s*<label id="ModernAnimationAtmosphereControl" hidden>/);
  const h=harness(),c=h.ctx,original=c.studioPrepared,draft=c.studioDraft,key=c.studioSelectedKey;
  c.studioPlayback.seek(20950,1000);const before=c.studioPlayback.sample().scene.camera;
  assert.equal(h.nodes.ModernAnimationAtmosphere.value,'vacuum');
  c.setStudioAtmosphere('standard');
  assert.equal(c.studioPrepared,original);assert.equal(c.studioDraft,draft);assert.equal(c.studioSelectedKey,key);
  assert.equal(c.studioPlayback.status().positionMs,20950);assert.equal(c.studioPlayback.status().playing,false);
  assert.deepEqual(c.studioPlayback.sample().scene.camera,before);
  assert.equal(c.studioPlayback.sample().compare.A.atmosphere,'standard');assert.equal(c.studioPlayback.sample().compare.B.atmosphere,'standard');
  assert.equal(c.studioPlaybackRenderedAt,null);assert.equal(c.studioAtmosphereOverridden(),true);
  assert.match(h.nodes.ModernAnimationAtmosphereNote.textContent,/authored project unchanged/);
  assert.deepEqual(h.stats(),{paints:0,scheduled:0,cancelled:1,initial:1,refreshes:1});
  c.setStudioAtmosphere('vacuum');assert.deepEqual(c.studioPlayback.project,original);assert.equal(c.studioAtmosphereOverridden(),false);
});
test('running switch advances old clock once and schedules exactly one new tick',()=>{
  const h=harness(),c=h.ctx,old=c.studioPlayback;old.start(1000);old.tick(2000);h.now(2500);
  c.studioStoryboardJob={cancelled:false};c.setStudioAtmosphere('standard');
  assert.equal(old.status().playing,false);assert.equal(c.studioPlayback.status().positionMs,1500);
  assert.equal(c.studioPlayback.status().playing,true);assert.equal(c.studioStoryboardJob.cancelled,true);
  assert.deepEqual(h.stats(),{paints:1,scheduled:1,cancelled:1,initial:0,refreshes:1});
  assert.equal(c.studioPlayback.tick(3000).positionMs,2000);
});
test('shipped and cached thumbnails cannot leak into another atmospheric variant',()=>{
  const h=harness(),c=h.ctx,frame=c.studioDraft.frames[3];
  const image={mode:'compare',width:960,height:320,dataUrl:'data:image/webp;base64,YQ=='};
  c.studioActiveDemo.keyframeThumbnails=[{index:3,image}];
  assert.deepEqual(c.resolveStudioKeyframe(frame,[]).thumbnail,image);
  const authored=c.studioKeyframeExperiment(frame);h.cache.put(authored,image);
  h.cache.request(c.studioPlayback,frame,20950,authored,[],true);assert.equal(h.cache.hasPending(),true);
  c.setStudioAtmosphere('standard');assert.equal(h.cache.hasPending(),false);
  const changed=c.studioKeyframeExperiment(frame);assert.equal(changed.compare.A.atmosphere,'standard');
  assert.equal(c.resolveStudioKeyframe(frame,[]).thumbnail,null);
  const second={...image,dataUrl:'data:image/webp;base64,Yg=='};h.cache.put(changed,second);
  assert.deepEqual(c.resolveStudioKeyframe(frame,[]).thumbnail,second);
  c.setStudioAtmosphere('vacuum');assert.deepEqual(c.resolveStudioKeyframe(frame,[]).thumbnail,image);
});
test('mixed-refraction project hides switch and rejects attempts without replacing player',()=>{
  const p=structuredClone(demo.project);p.baseExperiment.compare.B.atmosphere='standard';p.contract.referenceExperiment=p.baseExperiment;
  const h=harness(projects.validate(p)),c=h.ctx,old=c.studioPlayback;
  assert.equal(h.nodes.ModernAnimationAtmosphereControl.hidden,true);
  assert.throws(()=>c.setStudioAtmosphere('vacuum'),/unavailable/);assert.equal(c.studioPlayback,old);
  assert.equal(h.stats().refreshes,0);
});


test('Storyboard exports selected atmosphere with exact matching images, not the authored cache',async()=>{
  const h=harness(),c=h.ctx,downloads=[],library=require('../src/animation/ModernAnimationLibrary');
  const oldImage={mode:'compare',width:960,height:320,dataUrl:'data:image/webp;base64,YQ=='};
  const newImage={...oldImage,dataUrl:'data:image/webp;base64,Yg=='};
  projects.frameExperiments(c.studioPrepared).forEach(e=>h.cache.put(e,oldImage));
  c.studioPlayback.seek(20950,1000);c.setStudioAtmosphere('standard');
  const effective=c.studioPlayback.project;
  projects.frameExperiments(effective).forEach(e=>h.cache.put(e,newImage));
  Object.assign(c,{studioLibraryActive:null,animationWorkspaceOpen:true,studioPlaybackQuality:'canvas-direct',
    studioPlaybackDetail:'full',studioDemoCatalog:require('../src/animation/ModernDemoCatalog'),
    studioLibrary:library,studioLibraryActionsApi:require('../src/animation/ModernAnimationLibraryActions'),
    studioThumbnailReady:Promise.resolve(),downloadHistoryJson:(json,name)=>downloads.push({json,name})});
  c.root.CurvatureModernAnimationStoryboardExport=require('../src/animation/ModernAnimationStoryboardExport');
  vm.runInContext(app.slice(app.indexOf('  function studioStoryboardBatch('),app.indexOf('  function captureStudioKeyframeThumbnail(')),c);
  c.studioStoryboardBatch('compact');await c.studioStoryboardBatch('export');
  assert.equal(downloads.length,2,c.studioStoryboardStatus);
  for(const [i,d] of downloads.entries()){
    const [item]=library.parsePortable(d.json);
    assert.deepEqual(item.project,effective);assert.match(d.name,/-standard-/);
    if(i){assert.equal(item.keyframeThumbnails.length,9);assert.ok(item.keyframeThumbnails.every(k=>k.image.dataUrl===newImage.dataUrl));}
    else assert.equal(item.keyframeThumbnails,undefined);
  }
  const authored=library.parsePortable(c.studioDemoCatalog.exportDemo('soundly',e=>h.cache.get(e)))[0];
  assert.deepEqual(authored.project,c.studioPrepared);
  assert.ok(authored.keyframeThumbnails.every(k=>k.image.dataUrl===oldImage.dataUrl));
  assert.equal(c.studioPlayback.status().positionMs,20950);
  assert.equal(c.studioPrepared.baseExperiment.compare.A.atmosphere,'vacuum');
  // An editable workspace uses just the same physical selection, retaining draft metadata.
  c.studioActiveDemo=null;c.studioDraft=studio.edit(c.studioDraft,'name','Edited bridge');
  c.studioStoryboardBatch('compact');
  const edited=library.parsePortable(downloads.at(-1).json)[0];
  assert.equal(edited.project.name,'Edited bridge');assert.equal(edited.project.baseExperiment.compare.B.atmosphere,'standard');
});

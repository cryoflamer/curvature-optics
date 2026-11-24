'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const editor=require('../src/ui/modern/ModernPhotoCalibrationEditor');
test('photo viewport preserves original pixel coordinates through zoom and pan',()=>{
  const v=editor.fit(4000,3000,800,540),x=v.x+1300*v.scale,y=v.y+2500*v.scale;
  const z=editor.zoomAt(v,x,y,4,.01,20);
  const p=editor.imagePoint(z,x,y,4000,3000);
  assert.ok(Math.hypot(p[0]-1300,p[1]-2500)<1e-8);
  z.x+=81;z.y-=35;
  assert.deepEqual(editor.imagePoint(z,x+81,y-35,4000,3000).map(Math.round),[1300,2500]);
  assert.equal(editor.imagePoint(v,-1,-1,4000,3000),null);
});
test('correspondence IDs and weights survive editing without mutating input',()=>{
  const l={id:'b0:p2:v3',bank:0,objectType:3,primitive:2,vertex:3},p=[12.5,34.25];
  const row=editor.pair(l,p,100,80),rows=editor.upsert([],row);
  const edited=editor.pair(l,[15,20],100,80,.1);
  assert.throws(()=>editor.upsert(rows,edited),/already paired/);
  assert.deepEqual(editor.upsert(rows,edited,l.id),[edited]);
  assert.deepEqual(rows[0].pixel,p);assert.equal(rows[0].weight,1);
  assert.throws(()=>editor.pair(l,[100,0],100,80),/Invalid/);
  assert.throws(()=>editor.pair(l,p,100,80,0),/Invalid/);
});

test('photo choices retain project/frame links and isolate built-in IDs from library IDs',()=>{
  const local=[{id:'same',title:'Local photo',width:100,height:80,author:'A'},
    {id:'free',title:'Unlinked photo',width:20,height:30}];
  const projects=[{project:{name:'Bridge',keyframes:[{name:'View A',referenceImageIds:['same']},
    {name:'View B',referenceImageIds:['same']}]}}];
  const demos=[{id:'soundly',project:{name:'Soundly',keyframes:[{name:'Original',referenceImageIds:['same']}]},
    referenceImages:[{id:'same',title:'Shipped photo',original:{width:1200,height:800},author:'B'}]}];
  const before=JSON.stringify([local,projects,demos]);
  const choices=editor.photoChoices(local,projects,demos);
  assert.equal(choices.length,3);
  assert.equal(new Set(choices.map(c=>c.key)).size,3);
  assert.deepEqual(choices[0].links,['Bridge / View A','Bridge / View B']);
  assert.deepEqual(choices[1].links,[]);
  assert.deepEqual(choices[2].links,['Soundly / Original']);
  assert.equal(choices[2].width,1200);
  assert.equal(choices[2].demoId,'soundly');
  assert.equal(JSON.stringify([local,projects,demos]),before);
});







test('identity mask groups visible pixels by logical object and bank, not primitive',()=>{
  const banks=[[{metadata:{placedObjectIndex:4}},{metadata:{placedObjectIndex:4}}],[{metadata:{placedObjectIndex:4}}]];
  assert.equal(editor.objectKey({bank:0,primitive:0},banks),9);
  assert.equal(editor.objectKey({bank:0,primitive:1},banks),9);
  assert.equal(editor.objectKey({bank:1,primitive:0},banks),10);
  const pixel=id=>[id,0,1+(id*31%254),255];
  const data=new Uint8ClampedArray([...pixel(9),...pixel(9),0,0,0,255,...pixel(10),...pixel(9),1,2,3,255]);
  const spans=editor.identitySpans(data,3,2);
  assert.deepEqual(spans.get(9),[[0,0,2],[1,1,1]]);
  assert.deepEqual(spans.get(10),[[0,1,1]]);
  assert.equal(spans.size,2);
});



test('experiment exchange preserves original pixels, locked fields and result identity',()=>{
 const model={showModel:1,rEarth:6371000,rFEarth:10007543,CameraEast:0,CameraNorth:0,Height:10,Pan:1,Nick:0,Roll:0,FocalLengthField:50};
 for(const k of ['NObjects','ObjType','ObjDist','ObjDeltaDist','ObjSideType','ObjSidePos','ObjSideVar','ObjSizeType','ObjSize','ObjSizeVar'])model[k]=[1,0];
 const landmark={id:'b0:p0:v0',bank:0,objectType:1,primitive:0,vertex:0};
 const observation=editor.pair(landmark,[11,22],100,80,2);
 const input={format:'curvature-photo-calibration',version:1,scene:{model,physics:{atmosphere:'vacuum'}},referenceImage:{original:{width:100,height:80}},referenceSource:null,observations:[observation],
 fit:{method:'canvas-direct',maxIterations:80,freeParameters:['Pan'],result:null}};
 const check=x=>editor.validateExperiment(x,r=>r);
 const out=check(input);assert.deepEqual(out.observations,input.observations);assert.deepEqual(out.fit.freeParameters,['Pan']);
 assert.throws(()=>check({...input,version:4}),/format/);
 assert.equal(check({...input,version:3}).version,2);
 assert.throws(()=>check({...input,observations:[observation,observation]}),/Duplicate/);
 assert.throws(()=>check({...input,fit:{...input.fit,freeParameters:['Height','Height']}}),/free camera/);
 assert.throws(()=>check({...input,fit:{...input.fit,result:{evaluation:{valid:true}}}}),/stored fit/);
});

test('residual rows retain original pixels, signed differences and stable landmark identity',()=>{
  const rows=[{landmark:{id:'a'},pixel:[100,200]},{landmark:{id:'b'},pixel:[9,12]}];
  const initial=[{id:'b',status:'blocked',predicted:null},{id:'a',status:'out_of_frame',predicted:[-20,240]}];
  const best=[{id:'b',status:'visible',predicted:[9,12]},{id:'a',status:'visible',predicted:[103,196]}];
  const before=JSON.stringify([rows,initial,best]),r=editor.residualRows(rows,initial,best);
  assert.deepEqual(r[0].best.residual,[3,-4]);assert.equal(r[0].best.error,5);
  assert.deepEqual(r[0].initial.residual,[-120,40]);assert.equal(r[0].initial.status,'out_of_frame');
  assert.equal(r[1].initial.error,null);assert.equal(r[1].initial.status,'blocked');
  assert.equal(r[1].best.error,0);assert.equal(r[1].number,2);
  assert.equal(editor.residualRows(rows,[],[])[0].best.status,'unavailable');
  assert.equal(JSON.stringify([rows,initial,best]),before);
});
test('residual overlay uses the photo viewport transform for both endpoints',()=>{
  const calls=[],ctx=new Proxy({}, {get:(_,k)=>(...a)=>calls.push([k,...a]),set:()=>true});
  editor.drawResidual(ctx,{x:15,y:-4,scale:2},[10,20],{predicted:[13,16]},'#123456',true);
  assert.deepEqual(calls.find(c=>c[0]==='moveTo'),['moveTo',35,36]);
  assert.deepEqual(calls.find(c=>c[0]==='lineTo'),['lineTo',41,28]);
  assert.deepEqual(calls.find(c=>c[0]==='arc').slice(0,4),['arc',41,28,8]);
  assert.ok(calls.some(c=>c[0]==='setLineDash'&&c[1].length===2));
  const n=calls.length;editor.drawResidual(ctx,{x:0,y:0,scale:1},[0,0],{predicted:null},'#000',false);assert.equal(calls.length,n);
});

test('Fit and Validation roles are explicit, independent of weights, and preserve order',()=>{
  const l={id:'a',bank:0,objectType:3,primitive:2,vertex:3};
  const a=editor.pair(l,[12,34],100,80,2);
  const b=editor.pair({...l,id:'b'},[13,34],100,80,10,false);
  assert.equal(a.included,true);assert.equal(b.included,false);
  assert.deepEqual(editor.fitRows([b,a]),[a]);
  assert.throws(()=>editor.pair(l,[12,34],100,80,1,'false'),/Invalid/);
  const p=[{id:'a',status:'visible',predicted:[15,38]},{id:'b',status:'visible',predicted:[13,46]}];
  const stats=editor.residualStatistics(editor.residualRows([b,a],[],p));
  assert.deepEqual(stats.fit,{count:1,available:1,rms:5});
  assert.deepEqual(stats.validation,{count:1,available:1,rms:12});
  assert.ok(Math.abs(stats.all.rms-Math.sqrt(169/2))<1e-12);
  const missing=editor.residualStatistics(editor.residualRows([b,a],[],p.slice(0,1)));
  assert.equal(missing.fit.rms,5);assert.equal(missing.validation.rms,null);
  assert.equal(missing.all.rms,null);assert.equal(missing.all.available,1);
});
test('v1 migrates to Fit; v2 preserves held-out points and validates results against Fit only',()=>{
  const model={showModel:1,rEarth:6371000,rFEarth:10007543,CameraEast:0,CameraNorth:0,Height:10,Pan:1,Nick:0,Roll:0,FocalLengthField:50};
  for(const k of ['NObjects','ObjType','ObjDist','ObjDeltaDist','ObjSideType','ObjSidePos','ObjSideVar','ObjSizeType','ObjSize','ObjSizeVar'])model[k]=[1,0];
  const l={id:'a',bank:0,objectType:1,primitive:0,vertex:0};
  const a=editor.pair(l,[11,22],100,80,2),b=editor.pair({...l,id:'b'},[33,44],100,80,3,false);
  const legacy={...a};delete legacy.included;
  const input={format:'curvature-photo-calibration',version:1,scene:{model,physics:{atmosphere:'vacuum'}},referenceImage:{original:{width:100,height:80}},observations:[legacy],fit:{method:'canvas-direct',maxIterations:80,freeParameters:['Pan'],result:null}};
  const check=x=>editor.validateExperiment(x,r=>r);
  assert.equal(check(input).version,2);assert.equal(check(input).observations[0].included,true);
  const result={pose:{...model},initialRmsPx:5,evaluations:1,acceptedSteps:0,evaluation:{valid:true,rmsPx:5,weightedRmsPx:5,cost:25,points:[{id:'a',weight:2,observed:[11,22],predicted:[14,26]}]}};
  const v2={...input,version:2,observations:[b,a],fit:{...input.fit,result}};
  assert.deepEqual(check(v2).observations,[b,a]);assert.deepEqual(check(v2).fit.result,result);
  assert.throws(()=>check({...v2,version:1}),/version 2/);
  assert.throws(()=>check({...v2,observations:[{...b,included:true},a]}),/stored fit/);
});


test('snapshot object and span owners retain authored indices and endpoint columns',()=>{
  const geometry=require('../src/geometry/CurvatureGeometryEngine');
  const m={geometryRadius:6371000,Height:0,NObjects:[4,4],ObjDist:[1000,1200],ObjDeltaDist:[300,300],
    ObjSidePos:[55,50],ObjSideVar:[20,20],ObjSideType:[1,1],ObjSize:[1,1],ObjSizeVar:[0,0],
    ObjSizeType:[0,0],ObjType:[8,7]};
  for(const bank of [0,1]){
    const globe=geometry.createObjectSequenceScene(m,bank,true,{opticsNeutral:true,physicalSurface:true,curvature:1/m.geometryRadius});
    const flat=geometry.createObjectSequenceScene(m,bank,false,{opticsNeutral:true,physicalSurface:true,curvature:0});
    assert.deepEqual(globe.primitives.map(p=>p.metadata),flat.primitives.map(p=>p.metadata));
    const packages=editor.objectPackages(bank===0?[globe.primitives,[]]:[[],globe.primitives]);
    assert.equal(packages.size,8);
    for(const pkg of packages.values()){
      assert.equal(pkg.owner.bank,bank);
      assert.equal(pkg.owner.stationIndex,3-Math.floor(pkg.placedIndex/2));
      assert.equal(pkg.owner.column,pkg.placedIndex%2+1);
      const owned=pkg.primitiveIndices.map(i=>globe.primitives[i]).filter(p=>p.metadata.landmarkOwner.kind==='object');
      assert.deepEqual(owned.map(p=>p.metadata.landmarkPrimitive),owned.map((_,i)=>i));
      for(const span of pkg.spanOwners){
        assert.equal(span.from.column,span.to.column);
        assert.equal(span.from.stationIndex,span.to.stationIndex+1);
        assert.deepEqual(span.to,pkg.owner);
        if(span.role.endsWith('-road'))assert.ok([-1,1].includes(span.side));
      }
    }
  }
  const truncated=geometry.createObjectSequenceScene({...m,ObjDist:[21000000,1200],ObjDeltaDist:[10000000,300]},0,true,{opticsNeutral:true});
  assert.equal(editor.objectPackages([truncated.primitives,[]]).size,0);
});




test('Globe material edits keep observation ID, role, row order and original data until committed',()=>{
  const m={showModel:1,rEarth:6371000,Height:12,NObjects:[2,0],ObjType:[6,3],ObjDist:[1000,1200],ObjDeltaDist:[100,100],ObjSideType:[0,0],ObjSidePos:[30,40],ObjSideVar:[0,0],ObjSizeType:[0,0],ObjSize:[10,20],ObjSizeVar:[0,0]};
  const resolver=require('../src/calibration/CameraMaterialAnchorResolver').create(m);
  const engine=require('../src/geometry/CurvatureGeometryEngine');
  const ear=require('../src/geometry/CurvatureEarClip');
  const ps=engine.createObjectSequenceScene({...m,Height:0,geometryRadius:m.rEarth},0,true,{opticsNeutral:true,physicalSurface:true,curvature:1/m.rEarth}).primitives;
  const i=ps.findIndex(p=>ear.indexedTriangles(p).triangles.length>0),p=ps[i],tri=ear.indexedTriangles(p).triangles[0];
  const legacy=j=>({id:'b0:p'+i+':v'+j,bank:0,objectType:6,primitive:i,vertex:j});
  const a=editor.pair(legacy(tri[0]),[20,30],100,80,2,false),b=editor.pair(legacy(tri[1]),[40,50],100,80,1,true);
  const rows=[a,b],before=JSON.stringify(rows);
  const hit={kind:'surface',bank:0,index:i,owner:p.metadata.landmarkOwner,primitive:p.metadata.landmarkPrimitive,indices:tri,weights:[.2,.3,.5]};
  const material=resolver.fromPick(hit,'new-id');
  const edited=editor.commitGlobePair(rows,material,[21,31],100,80,3,a.landmark.id,m);
  assert.equal(edited[0].landmark.id,a.landmark.id);assert.equal(edited[0].kind,'surface');
  assert.equal(edited[0].included,false);assert.equal(edited[0].weight,3);assert.deepEqual(edited[0].pixel,[21,31]);
  assert.equal(edited[1],b);assert.equal(JSON.stringify(rows),before);
  assert.throws(()=>editor.commitGlobePair(rows,b.landmark,[21,31],100,80,3,a.landmark.id,m),/already paired/);
  const back=editor.commitGlobePair(edited,legacy(tri[2]),[22,32],100,80,3,a.landmark.id,m);
  assert.equal(back[0].landmark.id,a.landmark.id);assert.equal(back[0].kind,'vertex');assert.ok(back[0].landmark.anchor);
  assert.deepEqual(editor.observationRows(back,100,80,true,m),back);
  assert.throws(()=>editor.commitGlobePair(rows,material,[100,31],100,80,3,a.landmark.id,m),/Invalid/);
  assert.throws(()=>editor.commitGlobePair(rows,material,[21,31],100,80,3,'missing',m),/no longer exists/);
});

test('Flat experiment is rejected before reference decoding or state mutation',()=>{
  const input={format:'curvature-photo-calibration',version:2,scene:{model:{showModel:2}}};
  assert.throws(()=>editor.validateExperiment(input,()=>{throw Error('unexpected decode');}),/Flat calibration experiments are no longer supported/);
});

test('calibration destination descriptions disclose shared changes and explicit target',()=>{
  const scene=editor.applyDestination('Scene');
  assert.equal(scene.button,'Apply Best Camera to Scene');
  assert.match(scene.description,/inactive Compare pair is reset/);
  for(const target of ['A','B']){
    const other=target==='A'?'B':'A',info=editor.applyDestination(target);
    assert.equal(info.target,target);assert.equal(info.label,'Compare '+target);
    assert.equal(info.button,'Apply Best Camera to Compare '+target);
    for(const message of [info.description,info.confirmation]){
      assert.match(message,/Both Compare panels receive the same best fitted camera/);
      assert.ok(message.includes('Only Compare '+target+' receives'));
      assert.ok(message.includes('Compare '+other+' retains its physics'));
      assert.match(message,/shared visibility/);
      assert.match(message,/Retained Scene physics is unchanged/);
      assert.match(message,/camera positions\/sequence are reset/);
      assert.match(message,/protected in History/);
      assert.match(message,/draft is retained/);
    }
    assert.match(info.description,/historical, not an Accurate render error/);
    assert.ok(Object.isFrozen(info));
  }
  for(const target of [undefined,null,'compare','a','C'])assert.throws(()=>editor.applyDestination(target),/destination/);
});

test('shared Calibration fingerprints ignore only equivalent version-4 backing raster changes',()=>{
  const draft={stage:'correspondences',rows:[{pixel:[100,200]}]};
  const inline={id:'session',photo:'photo',sessions:{initial:{source:'scene',session:{version:4,
    raster:[800,520],view:{pan:[37.3,-10.1],zoom:2},base:{focal:35}}}}};
  const resized=structuredClone(inline),view=resized.sessions.initial.session;
  view.raster=[1000,650];view.view.pan=view.view.pan.map(n=>n*650/520);
  const raw=JSON.stringify(resized),fingerprint=editor.sharedInputFingerprint(draft,inline);
  assert.equal(editor.sharedInputFingerprint(draft,resized),fingerprint);
  assert.equal(JSON.stringify(resized),raw);
  view.view.pan[0]+=1;
  assert.notEqual(editor.sharedInputFingerprint(draft,resized),fingerprint);
  view.view.pan[0]-=1;view.view.zoom=3;
  assert.notEqual(editor.sharedInputFingerprint(draft,resized),fingerprint);
  assert.notEqual(editor.sharedInputFingerprint({...draft,rows:[{pixel:[100,201]}]},inline),fingerprint);
  assert.notEqual(editor.sharedInputFingerprint(draft,{...inline,photo:'different'}),fingerprint);
});

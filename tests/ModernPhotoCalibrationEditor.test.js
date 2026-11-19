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

test('preview raster preserves aspect and model snap is independent of viewport zoom/pan',()=>{
  assert.deepEqual(editor.previewSize(4000,3000),{width:1200,height:900});
  assert.deepEqual(editor.previewSize(800,1200),{width:800,height:1200});
  const point=(id,pixel,worldKey)=>({landmark:{id},pixel,worldKey});
  const points=[point('a',[10,20],'1'),point('duplicate',[10,20],'1'),
    point('b',[10.2,20],'2'),point('far',[50,20],'3')];
  const v={x:15,y:25,scale:2};
  const center=editor.screenPoint(v,[10,20]);
  assert.deepEqual(editor.snapCandidates(points,v,...center).map(p=>p.landmark.id),['a','b']);
  const z={x:140,y:-5,scale:20};
  assert.deepEqual(editor.snapCandidates(points,z,...editor.screenPoint(z,[10,20])).map(p=>p.landmark.id),['a']);
  assert.deepEqual(editor.snapCandidates(points,v,0,0),[]);
});

test('marker hit chooses the closest existing pair and leaves empty space for panning',()=>{
 const markers=[{id:'a',pixel:[10,10]},{id:'b',pixel:[15,10]}];
 assert.equal(editor.nearestMarker(markers,[14,10],8).id,'b');
 assert.equal(editor.nearestMarker(markers,[50,50],8),null);
});

test('raster spatial index preserves exact snap results across zoom and pan',()=>{
  const points=Array.from({length:8000},(_,i)=>({landmark:{id:String(i)},pixel:[(i*37)%1200,(i*71)%900],worldKey:String(i)}));
  const index=editor.spatialIndex(points);
  for(const view of [{x:0,y:0,scale:.4},{x:-200,y:150,scale:3},{x:100,y:-20,scale:16}]){
    for(const point of points.filter((_,i)=>i%173===0)){
      const [x,y]=editor.screenPoint(view,point.pixel);
      const subset=index.query(view,x,y,12);
      assert.deepEqual(editor.snapCandidates(subset,view,x,y,12,2),editor.snapCandidates(points,view,x,y,12,2));
    }
  }
  assert.ok(index.query({x:0,y:0,scale:1},500,400,10).length<points.length/10);
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

test('visible object takes priority over overlapping or closer hidden landmarks',()=>{
 const raster=editor.ownershipRaster(new Map([[1,[[0,2,8]]],[2,[[8,2,8]]]]),16,5);
 const view={x:0,y:0,scale:1};
 const pt=(id,key,x,visible=true)=>({landmark:{id},objectKey:key,painterVisible:visible,pixel:[x,2.5],worldKey:id});
 const points=[pt('hidden-near',2,5),pt('right',1,7),pt('self-hidden',1,5,false),pt('other',2,9)];
 const hit=editor.visiblePick(raster,points,view,5,2.5);
 assert.equal(hit.key,1);
 assert.deepEqual(hit.candidates.map(p=>p.landmark.id),['right']);
 assert.equal(editor.visiblePick(raster,points,view,9,2.5).key,2);
 assert.equal(editor.visiblePick(raster,[],view,5,2.5).key,1,'object interior does not require nearby vertices');
 assert.equal(editor.ownerAt(raster,5,1.5,2),1,'small edge gap recovers ownership');
 assert.equal(editor.ownerAt(raster,5,-1,3),null);
 assert.deepEqual(editor.visiblePick(null,points,view,5,2.5).candidates,[],'no unsafe global fallback');
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
 assert.throws(()=>check({...input,version:2}),/format/);
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

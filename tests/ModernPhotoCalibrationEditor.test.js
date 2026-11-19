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

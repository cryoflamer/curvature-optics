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

const test=require('node:test');
const assert=require('node:assert/strict');
const sessions=require('../src/animation/ModernAnimationKeyframeEditSession');
const contractApi={
  allowedPaths:()=>['camera.Height'],
  inspectCandidate:(_contract,candidate)=>({allowed:candidate.scene.locked===1})
};
function input(){
  return {projectId:'project-1',revision:'rev-1',
    contract:{mode:'camera'},frame:{key:'frame-1',
      experiment:{display:{mode:'scene'},scene:{locked:1},camera:{Height:10}}},
    workspaceExperiment:{display:{mode:'compare'},camera:{Height:99}},
    contractApi};
}
test('candidate and originals remain isolated from caller and workspace',()=>{
  const options=input(),s=sessions.begin(options);
  options.frame.experiment.camera.Height=999;
  assert.equal(s.original.camera.Height,10);
  const c=s.snapshot();c.camera.Height=20;s.replace(c);
  assert.equal(s.snapshot().camera.Height,20);
  assert.equal(s.workspace.camera.Height,99);
  assert.equal(s.original.camera.Height,10);
  assert.deepEqual(s.allowedPaths,['camera.Height']);
});
test('temporary undo/redo is isolated, grouped, bounded and invalidated by a new edit',()=>{
  const s=sessions.begin(input()),initial=s.snapshot();
  assert.deepEqual(s.history(),{undo:0,redo:0,dirty:false});
  s.beginGroup('pointer');
  s.replace({...initial,camera:{Height:11}});
  s.replace({...initial,camera:{Height:12}});
  s.endGroup('pointer');
  assert.deepEqual(s.history(),{undo:1,redo:0,dirty:true});
  assert.equal(s.undo().camera.Height,10);
  assert.deepEqual(s.history(),{undo:0,redo:1,dirty:false});
  assert.equal(s.redo().camera.Height,12);
  assert.equal(s.undo().camera.Height,10);
  s.replace({...initial,camera:{Height:15}});
  assert.deepEqual(s.history(),{undo:1,redo:0,dirty:true});
  assert.equal(s.redo(),null);
  for(let h=16;h<=60;h++)s.replace({...initial,camera:{Height:h}});
  assert.equal(s.history().undo,30);
  assert.equal(s.prepareApply({projectId:'project-1',revision:'rev-1',
    frameKey:'frame-1'}).experiment.camera.Height,60);
  s.cancel();
  assert.throws(()=>s.undo(),/ended/);
});
test('a gesture returning to its original pose leaves no undo step',()=>{
  const s=sessions.begin(input()),initial=s.snapshot();
  s.beginGroup('wheel');
  s.replace({...initial,camera:{Height:16}});
  s.replace(initial);
  s.endGroup('wheel');
  assert.deepEqual(s.history(),{undo:0,redo:0,dirty:false});
});
test('cancel restores preserved workspace and makes session terminal',()=>{
  const s=sessions.begin(input());
  s.replace({...s.snapshot(),camera:{Height:30}});
  const restored=s.cancel();
  restored.camera.Height=1000;
  assert.equal(s.workspace.camera.Height,99);
  assert.equal(s.active(),false);
  assert.throws(()=>s.snapshot(),/ended/);
  assert.throws(()=>s.prepareApply({}),/ended/);
});
test('stale revision and wrong frame cannot be applied',()=>{
  const s=sessions.begin(input());
  assert.throws(()=>s.prepareApply({projectId:'project-1',revision:'rev-2',frameKey:'frame-1'}),/changed/);
  assert.throws(()=>s.prepareApply({projectId:'project-1',revision:'rev-1',frameKey:'other'}),/changed/);
  const result=s.prepareApply({projectId:'project-1',revision:'rev-1',frameKey:'frame-1'});
  assert.equal(result.experiment.camera.Height,10);
  assert.equal(Object.isFrozen(result.experiment),true);
});
test('invalid candidate and mode switches are rejected',()=>{
  const s=sessions.begin(input());
  assert.throws(()=>s.replace({...s.snapshot(),display:{mode:'compare'}}),/mode/);
  s.replace({...s.snapshot(),scene:{locked:0}});
  assert.throws(()=>s.prepareApply({projectId:'project-1',revision:'rev-1',frameKey:'frame-1'}),/contract/);
});
test('experimental and incompatible frames are not exposed as editable',()=>{
  const o=input();o.contract.mode='experimental';
  assert.throws(()=>sessions.begin(o),/safely/);
  const other=input();other.frame.experiment.scene.locked=0;
  assert.throws(()=>sessions.begin(other),/safely/);
});

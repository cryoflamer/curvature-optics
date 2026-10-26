const {test}=require('node:test');
const assert=require('node:assert/strict');
const capture=require('./CurvatureControlledLegacyCapture');
test('real draw is captured and original model restored',()=>{
 let current={name:'live'},original=current,steps=[];
 const result=capture.capture({model:{name:'preset'},install:m=>{current=m;steps.push('install');},draw:()=>{assert.equal(current.name,'preset');steps.push('draw');},snapshot:()=>{steps.push('snapshot');return 'frame';},restore:()=>{current=original;steps.push('restore');}});
 assert.equal(result,'frame');assert.equal(current,original);
 assert.deepEqual(steps,['install','draw','snapshot','restore']);
});
test('restores original binding when draw fails',()=>{
 let current='live';
 assert.throws(()=>capture.capture({model:'preset',install:m=>{current=m;},draw:()=>{throw Error('broken');},snapshot:()=>{},restore:()=>{current='live';}}),/broken/);
 assert.equal(current,'live');
});
test('restores even if installation partially fails',()=>{
 let current='live';
 assert.throws(()=>capture.capture({model:'preset',install:m=>{current=m;throw Error('install');},draw:()=>{},snapshot:()=>{},restore:()=>{current='live';}}),/install/);
 assert.equal(current,'live');
});

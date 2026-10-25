'use strict';
const assert=require('assert');
const bridge=require('./CurvatureInverseOpticsBridge.js');
const ids=Array.from({length:85},(_,i)=>i+1);
const groups={primary:Object.fromEntries(ids.map(i=>[i,{}]))};
const audit={getCapturedGroups:()=>groups,getTowerPaths:i=>ids.includes(i)?[[[0,i*100,10],[0,i*100,20]]]:null};
const m={rEarth:6371000,Height:15,ObjDist:[1000],ObjDeltaDist:[100],ObjSize:[1],ObjSidePos:[0],NObjects:[85]};
const solver={solveAngle:()=>({status:'visible',angle:0.01})};
function run(options){return new Promise(resolve=>bridge.calculateAtmosphereLine(m,audit,solver,()=>{},resolve,options));}
(async()=>{
  let r=await run({mode:'sample',count:5});
  assert.equal(r.state,'ready');assert.equal(r.towers,5);
  assert.deepEqual(r.selectedTowerIds,[1,22,43,64,85]);assert.equal(r.edges,5);
  r=await run({mode:'single'});assert.equal(r.towers,1);assert.deepEqual(r.selectedTowerIds,[21]);
  r=await run({mode:'sample',count:3});assert.deepEqual(r.selectedTowerIds,[1,43,85]);
  r=await run({mode:'all'});assert.equal(r.towers,85);assert.equal(r.edges,85);
  r=await run({mode:'invalid'});assert.equal(r.state,'error');
  console.log('PASS atmosphere line selection');
})().catch(e=>{console.error(e);process.exitCode=1;});

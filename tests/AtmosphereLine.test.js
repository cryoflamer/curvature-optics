'use strict';
const assert=require('assert');
const bridge=require('../src/renderers/CurvatureInverseOpticsBridge.js');
const m={rEarth:6371000,Height:15,ObjDist:[1000],ObjDeltaDist:[100],ObjSize:[1],ObjSidePos:[0],NObjects:[3]};
const a=[0,1000,10], b=[0,1000,20];
const audit={getCapturedGroups:()=>({primary:{0:{},1:{}}}),getTowerPaths:(i)=>i===0?[[a,b]]:i===1?[[a,b]]:null};
const solver={solveAngle:()=>({status:'visible',angle:0.01})};
let done=false;
bridge.calculateAtmosphereLine(m,audit,solver,()=>{},r=>{
  assert.equal(r.state,'ready');assert.equal(r.towers,2);assert.equal(r.edges,2);
  assert.equal(r.paths.length,2);assert(r.paths.every(p=>p.points.length>=2));
  assert(r.evaluations>0);done=true;
});
setTimeout(()=>{assert(done,'async calculation did not complete');console.log('PASS atmosphere line');},100);

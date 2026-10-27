const assert=require('node:assert/strict');
const {test}=require('node:test');
const v=require('../src/diagnostics/CurvatureVisibilityVerification');
test('analytical visibility checks distinguish occluded and clear rays',()=>{
 const cases=v.analyticalCases();assert.equal(cases.length,3);assert.ok(cases.every(c=>c.passed));
});
test('ray-sphere intersections are computed independently of rasterization',()=>{
 assert.equal(v.raySphere([0,0,3],[0,0,-6],[0,0,0],1),1/3);
 assert.equal(v.raySphere([0,0,3],[1,0,0],[0,0,0],1),null);
});

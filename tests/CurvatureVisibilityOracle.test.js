const {test}=require('node:test');
const assert=require('node:assert/strict');
const oracle=require('../src/diagnostics/CurvatureVisibilityOracle');
test('sphere Z-buffer visibility agrees with analytic ray/sphere occlusion away from silhouettes',()=>{
 const r=oracle.run();assert.equal(r.cases.length,3);for(const c of r.cases){assert.ok(c.interiorSamples>100,c.name);assert.ok(c.exteriorSamples>100,c.name);assert.equal(c.mismatches,0,JSON.stringify(c));}assert.equal(r.passed,true);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const sanity=require('../src/diagnostics/CurvaturePhysicalSanity129');
test('129: read-only sanity checks have independent fixed reference cases',()=>{
 const r=sanity.run();
 assert.equal(r.schema,'physical-sanity-check-v129');
 assert.equal(r.checks.length,4);
 assert.deepEqual(r.summary,{PASS:4,WARN:0,FAIL:0});
 assert.ok(r.checks.find(c=>c.id==='vacuum-analytic-angles').measurements.cases===18);
 assert.ok(r.checks.find(c=>c.id==='flat-limit-continuity').measurements.maxPositionDifferenceMetres<0.001);
});

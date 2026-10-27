'use strict';
const assert = require('assert');
const audit = require('../src/optics/OpticalRenderedVertexAudit');
const points = [
  {x:-0.12,y:0,world:[-12,3000,-15]},
  {x: 0.12,y:0,world:[12,3000,-15]},
  {x:-0.02,y:1,world:[-2,3000,8]},
  {x: 0.02,y:1,world:[2,3000,8]},
  {x:0.7,y:0.5,world:[70,3000,-3]}
];
assert.deepStrictEqual(audit.sectionCenter(points,0,1e-8),[0,3000,-15]);
assert.deepStrictEqual(audit.sectionCenter(points,1,1e-8),[0,3000,8]);
assert.strictEqual(audit.sectionCenter(points,0.3,1e-8),null);
assert.strictEqual(audit.sectionCenter([points[0]],0,1e-8),null);
assert.strictEqual(audit.sectionCenter([{x:0,y:1,world:[0,0,1]},{x:0,y:1,world:[0,0,1]}],1,1e-8),null);
console.log('OpticalTowerSectionCenter: 5 checks passed');

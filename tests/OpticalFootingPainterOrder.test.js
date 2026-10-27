'use strict';
const assert = require('assert');
const bridge = require('../src/renderers/CurvatureInverseOpticsBridge');
// ObjDist + (index-1)*ObjDeltaDist increases with index.
// The legacy renderer paints aObjLast first and aObjFirst last.
const footings = [
  {tower:1, points:[[1,0,0]]},
  {tower:85, points:[[85,0,0]]},
  {tower:21, points:[[21,0,0]]},
  {tower:2, points:[[2,0,0]]}
];
const result = bridge.orderFootingsFarToNear(footings);
assert.strictEqual(result, footings);
assert.deepStrictEqual(result.map(f => f.tower), [85,21,2,1]);
assert.deepStrictEqual(result.map(f => f.points[0][0]), [85,21,2,1]);
console.log('Optical footing painter order matches legacy far-to-near traversal');

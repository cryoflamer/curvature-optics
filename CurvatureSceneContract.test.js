'use strict';
const assert = require('node:assert/strict');
const contract = require('./CurvatureSceneContract');
const input = {showModel: 3, Height: 15, ObjDist: [10, 20],
  camPos: [0,0,0], geometryRadius: 6371000, unknown: 'not part of contract'};
const snapshot = contract.captureState(input);
assert.equal(snapshot.version, 1);
assert.deepEqual(snapshot.values.ObjDist, [10,20]);
assert.equal(snapshot.values.unknown, undefined);
input.ObjDist[0] = 999;
assert.equal(snapshot.values.ObjDist[0], 10);
const primitives = [{type:'polygon',points:[[0,0,0],[1,0,0],[1,1,0]],
  mode:3,visible:true,style:{fill:'#a38d60'},tower:21}];
const scene = contract.createScene('optical-p4',primitives,{horizon:'tangent'});
assert.equal(scene.source,'optical-p4');
primitives[0].points[0][0] = 77;
primitives[0].style.fill = 'red';
assert.equal(scene.primitives[0].points[0][0],0);
assert.equal(scene.primitives[0].style.fill,'#a38d60');
assert.throws(()=>contract.createScene('wrong',[]), /Unknown scene source/);
assert.throws(()=>contract.createScene('legacy',[{type:'line',points:[[0,0,0],[1,2,NaN]]}]), /Invalid 3D/);
assert.throws(()=>contract.createScene('legacy',[{type:'polygon',points:[[0,0,0],[1,1,1]]}]), /Invalid 3D/);
assert.throws(()=>contract.captureState(null), /required/);
console.log('CurvatureSceneContract: passed');

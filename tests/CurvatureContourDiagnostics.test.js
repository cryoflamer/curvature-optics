const test=require('node:test');const assert=require('node:assert/strict');
const diag=require('../src/diagnostics/CurvatureContourDiagnostics');
test('selected failures preserve mode and source command identifiers',()=>{
 const scene={primitives:[{type:'polygon',commandIndex:61,mode:2,sourceCommandIndices:[60,61],points:[[0,0,0],[1,0,0],[0,1,0]]}]};
 const selected=diag.select(scene,[{commandIndex:61},{commandIndex:62}]);
 assert.equal(selected.length,1);assert.equal(selected[0].mode,2);assert.deepEqual(selected[0].sourceCommandIndices,[60,61]);
});
test('world plane projection preserves planar vertex order',()=>{
 const pts=[[0,0,3],[1,0,3],[1,1,3],[0,1,3]];
 const projected=diag.project(pts);assert.equal(projected.length,4);
 assert.ok(Math.abs(projected[1][0]-1)<1e-12);
});
test('degenerate points are rejected without rendering',()=>assert.deepEqual(diag.project([[0,0,0],[0,0,0],[0,0,0]]),[]));

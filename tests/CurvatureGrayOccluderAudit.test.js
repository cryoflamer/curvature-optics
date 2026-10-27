const test=require('node:test');
const assert=require('node:assert/strict');
const {analyze}=require('../src/diagnostics/CurvatureGrayOccluderAudit');
test('distinguishes neutral gray pixels with and without independent fill',()=>{
 const pixels=Uint8ClampedArray.from([128,128,128,255,128,128,128,255,0,0,0,255,170,140,90,255]);
 const result=analyze(pixels,Int32Array.from([0,-1,-1,0]),[{commandIndex:77}],4,1);
 assert.equal(result.statistics.referenceGrayPixels,2);
 assert.equal(result.statistics.coveredByIndependentFill,1);
 assert.equal(result.statistics.missingIndependentFill,1);
 assert.deepEqual(result.statistics.referenceGrayBounds,[0,0,1,0]);
 assert.deepEqual(result.statistics.topCoveringFillCommands,[{commandIndex:77,pixels:1}]);
});
test('no gray regions produces null coverage and bounds',()=>{
 const result=analyze(Uint8ClampedArray.from([0,0,0,255]),Int32Array.from([-1]),[],1,1);
 assert.equal(result.statistics.referenceGrayPixels,0);
 assert.equal(result.statistics.coverageRatio,null);
 assert.equal(result.statistics.referenceGrayBounds,null);
});
test('rejects mismatched pixel arrays',()=>{
 assert.throws(()=>analyze(new Uint8ClampedArray(3),new Int32Array(1),[],1,1),TypeError);
});

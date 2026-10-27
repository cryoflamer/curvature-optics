'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const masked=require('./CurvatureRegionComparison');
const make=(w,h)=>new Uint8ClampedArray(w*h*4);
const set=(buf,w,x,y)=>{const k=(y*w+x)*4;buf.set([0,0,0,255],k);};
test('supplemental IoU removes only named decoration rectangles',()=>{
 const w=5,h=4,r=make(w,h),c=make(w,h);
 set(r,w,0,0);set(r,w,2,2);set(c,w,2,2);set(c,w,3,2);
 const full=masked.compare(r,c,w,h,[]);
 assert.equal(full.both,1);assert.equal(full.referenceOnly,1);assert.equal(full.candidateOnly,1);
 assert.equal(full.intersectionOverUnion,1/3);
 const geometry=masked.compare(r,c,w,h,[{kind:'frame',x:0,y:0,width:1,height:1}]);
 assert.equal(geometry.both,1);assert.equal(geometry.referenceOnly,0);
 assert.equal(geometry.candidateOnly,1);assert.equal(geometry.intersectionOverUnion,.5);
 assert.equal(geometry.comparedPixels,19);assert.equal(geometry.excludedPixels,1);
});
test('overlapping exclusions do not inflate excluded counts; invalid rectangles reject',()=>{
 const buf=make(9,9),out=masked.compare(buf,buf,9,9,[{x:-4,y:-1,width:6,height:4},{x:1,y:1,width:2,height:2}]);
 assert.equal(out.excludedPixels,8);
 assert.throws(()=>masked.compare(buf,buf,9,9,[{x:0,y:0,width:-2,height:1}]),/rectangles/);
 assert.throws(()=>masked.compare(buf,buf,10,9,[]),/frames/);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const interpolation=require('../src/camera/ModernCameraInterpolator');
const start={CameraEast:0,CameraNorth:0,Height:3,Pan:359,Nick:-10,Roll:179,
  FocalLengthField:50,viewcenterHorizon:3,deviceRatio:1.5};
const end={...start,CameraEast:100,CameraNorth:200,Height:13,Pan:1,Nick:20,Roll:-179,FocalLengthField:200};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('endpoints are exact and independent of sampling order',()=>{
  assert.deepEqual(interpolation.cameraAt(start,end,0,5000),start);
  assert.deepEqual(interpolation.cameraAt(start,end,5000,5000),end);
  assert.deepEqual(interpolation.cameraAt(start,end,-5,5000),start);
  assert.deepEqual(interpolation.cameraAt(start,end,6000,5000),end);
  const a=interpolation.cameraAt(start,end,1700,5000);
  interpolation.cameraAt(start,end,4500,5000);
  assert.deepEqual(interpolation.cameraAt(start,end,1700,5000),a);
  assert.equal(start.CameraEast,0);
});
test('linear timing, shortest wrapped angles and logarithmic zoom',()=>{
  const mid=interpolation.cameraAt(start,end,2500,5000,'linear');
  close(mid.CameraEast,50);close(mid.CameraNorth,100);close(mid.Height,8);
  close(mid.Nick,5);close(mid.Pan,360);close(mid.Roll,180);
  close(mid.FocalLengthField,100);
  assert.equal(mid.viewcenterHorizon,3);assert.equal(mid.deviceRatio,1.5);
});
test('smoothstep eases movement and preserves local height on Globe and Flat',()=>{
  const quarter=interpolation.cameraAt(start,end,1250,5000,'smoothstep');
  close(quarter.CameraEast,15.625);close(quarter.Height,4.5625);
  assert.ok(quarter.Height>=.001);
});
test('invalid inputs and discrete camera mode changes are rejected',()=>{
  assert.throws(()=>interpolation.cameraAt(start,end,1,0),RangeError);
  assert.throws(()=>interpolation.interpolate(start,end,NaN),RangeError);
  assert.throws(()=>interpolation.interpolate(start,end,.5,'unknown'),RangeError);
  assert.throws(()=>interpolation.interpolate({...start,Height:0},end,.5),RangeError);
  assert.throws(()=>interpolation.interpolate(start,{...end,deviceRatio:2/3},.5),RangeError);
  assert.throws(()=>interpolation.interpolate(start,{...end,viewcenterHorizon:1},.5),RangeError);
});

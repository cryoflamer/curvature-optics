'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const api=require('../src/ui/modern/ModernPhotoOverlayRegistration');
const close=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol,`${a} vs ${b} (tolerance ${tol})`);
const aspects=[1.5,2/3,16/9,9/16];
const origin={photo:{width:1176,height:791},
  baselineCamera:{Height:42.8,FocalLengthField:1996,Pan:.61,Nick:-.29,Roll:-.11,
    CameraEast:-50.75,CameraNorth:-9.42,viewcenterHorizon:3}};
function view(aspect,width,height,screenSize=1){
  return {aspect,width,height,screenSize,pixelTransform:{width,height,contextScale:1,
    scaleX:height/screenSize,scaleY:-height/screenSize,offsetX:width/2,offsetY:height/2}};
}
function point({rect,scale},[u,v]){return [rect.x+u*scale,rect.y+v*scale];}
function graphWindow(aspect,dpr){
  // Reproduce actual GraphX3DX SetViewport(0,1,-0.5,-2),
  // SetWindowToCameraScreen and SetWindow, including half-pixel offsets.
  const h=720,w=Math.round(h*aspect),vw=w-.5,vh=h-3,ratio=vw/vh;
  return {...view(aspect,w*dpr,h*dpr),
    pixelTransform:{width:w*dpr,height:h*dpr,contextScale:dpr,
      scaleX:(vw-1)/ratio*dpr,scaleY:-(vh-1)*dpr,
      offsetX:vw/2*dpr,offsetY:(1+vh/2)*dpr}};
}
test('original raster is registered without rounding its aspect or stretching',()=>{
  const reg=api.create(origin);
  assert.deepEqual(reg.ray([588,395.5]),[0,0,1]);
  const ray=reg.ray([0,0]);
  assert.ok(ray[0]<0&&ray[1]>0);
  for(const aspect of aspects){
    const v=view(aspect,Math.round(720*aspect),720),l=reg.layout(v);
    close(l.rect.width/l.rect.height,1176/791);
    const center=point(l,[588,395.5]);
    close(center[0],v.pixelTransform.offsetX);close(center[1],v.pixelTransform.offsetY);
    assert.ok(l.clip.x>=0&&l.clip.y>=0);
    assert.ok(l.clip.x+l.clip.width<=v.width+1e-9);
    assert.ok(l.clip.y+l.clip.height<=v.height+1e-9);
    assert.equal(l.maxHorizontalErrorPx,0);
  }
  const portrait=reg.layout(view(9/16,405,720));
  assert.ok(portrait.rect.x<0&&portrait.rect.width>405);
  close(portrait.clip.width,405);
  const landscape=reg.layout(view(16/9,1280,720));
  assert.ok(landscape.rect.x>0&&landscape.rect.width<1280);
  assert.ok(landscape.clip.height<=landscape.rect.height);
  // Full-canvas of matching-shaped original, with a normal supported Scene
  // ratio, is the identity map when the raster dimensions match.
  const same=api.create({...origin,photo:{width:1200,height:800}});
  assert.deepEqual(same.layout(view(1.5,1200,800)).rect,{x:0,y:0,width:1200,height:800});
});
test('captured window offsets, clipping and uniform scale are used instead of CSS or canvas fit',()=>{
  const reg=api.create(origin),v=view(1.5,1200,800);
  v.pixelTransform.offsetX=90;v.pixelTransform.offsetY=100;
  const l=reg.layout(v);
  close(point(l,[588,395.5])[0],90);close(point(l,[588,395.5])[1],100);
  assert.ok(l.rect.x<0&&l.rect.y<0);
  assert.equal(l.clip.x,0);assert.equal(l.clip.y,0);
  assert.ok(l.clip.width<l.rect.width&&l.clip.height<l.rect.height);
  v.pixelTransform.offsetX=-1e6;
  assert.equal(reg.layout(v).clip,null);
  const doubled=view(1.5,1200,800,2);
  assert.deepEqual(reg.layout(doubled),reg.layout(view(1.5,1200,800)));
});
test('resize and DPR recompute the same registered rectangle in the new backing coordinates',()=>{
  const reg=api.create(origin);
  for(const aspect of aspects){
    const a=graphWindow(aspect,1),b=graphWindow(aspect,2);
    const l=reg.layout(a),r=reg.layout(b);
    for(const k of ['x','y','width','height']){
      close(r.rect[k],2*l.rect[k]);
      close(r.clip[k],2*l.clip[k]);
    }
    close(r.scale,2*l.scale);
    close(r.maxHorizontalErrorPx,2*l.maxHorizontalErrorPx);
    close(l.rect.width/l.rect.height,1176/791);
    assert.ok(l.maxHorizontalErrorPx<1);
    const c=view(aspect,Math.round(720*aspect)*2,1440);
    const d=view(aspect,Math.round(720*aspect),720);
    close(reg.layout(c).rect.width,2*reg.layout(d).rect.width);
  }
});
test('registration owns baseline scalars and never follows physical edits',()=>{
  const input=structuredClone(origin),reg=api.create(input),v=view(1.5,1200,800);
  const l=reg.layout(v),ray=reg.ray([23,71]);
  input.photo.width=600;
  input.baselineCamera.FocalLengthField*=10;
  input.baselineCamera.Roll=90;
  const live={Height:3,Pan:20,Nick:10,Roll:45,FocalLengthField:90,
    CameraEast:0,CameraNorth:1,showModel:2,rEarth:1000000,
    atmosphere:'standard',sceneSize:200,zoom:5,objectZExtend:4};
  assert.deepEqual(reg.layout({...v,...live}),l);
  assert.deepEqual(reg.ray([23,71]),ray);
  assert.equal(reg.width,1176);
  assert.equal(Object.isFrozen(reg),true);
  assert.equal(Object.isFrozen(l.rect),true);
  assert.equal(Object.isFrozen(l.clip),true);
  // A new independent baseline changes the ray angle, but the rectangle
  // uses the same baseline intrinsics on both sides (focal cancels).
  const next=api.create({...origin,baselineCamera:{...origin.baselineCamera,FocalLengthField:800}});
  assert.notDeepEqual(next.ray([23,71]),ray);
  assert.deepEqual(next.layout(v),l);
});
test('invalid, stale or materially anisotropic captures are rejected without fallback',()=>{
  for(const photo of [{width:0,height:1},{width:2.5,height:5},{width:32768,height:32768}])
    assert.throws(()=>api.create({...origin,photo}),/dimensions/);
  for(const focal of [0,-1,Infinity,1e9,.01])
    assert.throws(()=>api.create({...origin,baselineCamera:{...origin.baselineCamera,FocalLengthField:focal}}),/baseline|field of view/i);
  assert.throws(()=>api.create({...origin,baselineCamera:{...origin.baselineCamera,viewcenterHorizon:0}}),/Eye-Lvl/);
  const reg=api.create(origin),v=view(1.5,1200,800);
  assert.throws(()=>reg.ray([NaN,0]),/pixel/);
  assert.throws(()=>reg.layout({...v,aspect:1176/791}),/aspect/);
  assert.throws(()=>reg.layout({...v,width:1201}),/viewport/);
  assert.throws(()=>reg.layout({...v,pixelTransform:null}),/viewport/);
  assert.throws(()=>reg.layout({...v,pixelTransform:{...v.pixelTransform,scaleY:800}}),/viewport/);
  assert.throws(()=>reg.layout({...v,pixelTransform:{...v.pixelTransform,scaleX:900}}),/nonuniform/);
});

test('production camera scale and actual window mapping agree for baseline rays',()=>{
  const pose=require('../src/calibration/CameraPhysicalPose');
  const physical=require('../src/app/CurvaturePhysicalCamera');
  const projection=require('../src/renderers/CurvatureCanvasProjection');
  const {model,observations,options}=require('./fixtures/soundly-mixed-calibration.json');
  for(const photo of [origin.photo,{width:1920,height:1080},{width:800,height:1200}]){
    const baselineCamera={...origin.baselineCamera};
    const m={...model,...baselineCamera},reg=api.create({photo,baselineCamera});
    const p=pose.photoCamera(m,photo.width,photo.height);
    close(reg.focalPx,photo.height*physical.REFERENCE_DISTANCE/p.sceneSize,1e-8);
    const pixels=photo===origin.photo?observations.map(r=>r.pixel):
      [[0,0],[photo.width/2,photo.height/2],[photo.width,photo.height]];
    assert.equal(options.width,1176);assert.equal(options.height,791);
    for(const aspect of aspects){
      const v=graphWindow(aspect,2);
      const c=physical.create({...m,camViewAngle:p.fieldOfViewRadians,deviceRatio:aspect});
      const q=physical.REFERENCE_DISTANCE/c.sceneSize*v.screenSize;
      const window=projection.resolve({screenSize:v.screenSize,pixelTransform:v.pixelTransform},v.width,v.height);
      const l=reg.layout(v);
      for(const pixel of pixels){
        const ray=reg.ray(pixel);
        const expected=projection.point(window,ray[0]*q,ray[1]*q);
        const actual=point(l,pixel);
        close(actual[1],expected[1],1e-8);
        close(Math.abs(actual[0]-expected[0]),
          Math.abs(pixel[0]-photo.width/2)*2*l.maxHorizontalErrorPx/photo.width,1e-8);
        assert.ok(Math.abs(actual[0]-expected[0])<=l.maxHorizontalErrorPx+1e-8);
      }
    }
  }
});

test('generic photo shapes preserve angular scale, clipping and center for every Scene aspect and DPR',()=>{
  const photos=[{width:400,height:200},{width:200,height:400},
    {width:250,height:250},{width:350,height:150}];
  let cropped=0,uncovered=0;
  for(const photo of photos){
    const reg=api.create({photo,baselineCamera:{...origin.baselineCamera,FocalLengthField:100}});
    const center=[photo.width/2,photo.height/2];
    assert.deepEqual(reg.ray(center),[0,0,1]);
    for(const aspect of aspects){
      const baseline=reg.layout(graphWindow(aspect,1));
      for(const dpr of [1,2,3]){
        const v=graphWindow(aspect,dpr),l=reg.layout(v),r=l.rect;
        close(r.width/r.height,photo.width/photo.height);
        const c=point(l,center);
        close(c[0],v.pixelTransform.offsetX);close(c[1],v.pixelTransform.offsetY);
        for(const key of ['x','y','width','height']){
          close(r[key],baseline.rect[key]*dpr);
          close(l.clip[key],baseline.clip[key]*dpr);
        }
        const x0=Math.max(0,r.x),x1=Math.min(v.width,r.x+r.width);
        const y0=Math.max(0,r.y),y1=Math.min(v.height,r.y+r.height);
        close(l.clip.x,x0);close(l.clip.y,y0);
        close(l.clip.width,x1-x0);close(l.clip.height,y1-y0);
        if(l.clip.width<r.width-1e-8||l.clip.height<r.height-1e-8)cropped++;
        if(l.clip.width<v.width-1e-8||l.clip.height<v.height-1e-8)uncovered++;
        const a=point(l,[photo.width/5,photo.height/5]);
        const b=point(l,[2*photo.width/5,2*photo.height/5]);
        close((b[0]-a[0])/(photo.width/5),l.scale);
        close((b[1]-a[1])/(photo.height/5),l.scale);
      }
    }
  }
  assert.ok(cropped>0&&uncovered>0);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const physicalWorld=require('../src/geometry/CurvaturePhysicalWorldGeometry');
const opticalGuides=require('../src/optics/CurvaturePhysicalGroundGuides');
const physicalCamera=require('../src/app/CurvaturePhysicalCamera');
const decorations=require('../src/scene/CurvatureFullSceneDecorations');
const R=6371000;
function scene(geometry){
  const model={showGrid:1,Height:244,rEarth:R,GlobeGridCol:'blue',FEGridCol:'blue',
    camViewAngle:7.8*Math.PI/180,deviceRatio:1000/630,Pan:0,
    Nick:geometry==='globe'?-0.5:-0.34,Roll:0,
    showModel:geometry==='globe'?1:2,viewcenterHorizon:3,rFEarth:1e7};
  const source=physicalWorld.metricGuides({curvature:geometry==='globe'?1/R:0,
    observerHeight:model.Height,showGrid:1,maxDistance:100000});
  const guide=opticalGuides.create({model,geometry,atmosphere:'vacuum',
    metricGrid:true,maxDistance:100000});
  const physical=guide.transform(source.primitives);
  const c=physicalCamera.create(model);
  const camera={pos:c.pos,center:c.center,up:c.up,sceneSize:c.sceneSize,
    screenSize:1,objectZExtend:0,zoom:1,near:.001};
  return {model,physical,camera,guide};
}
function canvas(){
  const text=[],lines=[],ctx={save(){},restore(){},beginPath(){},moveTo(){},
    lineTo(){},stroke(){lines.push(true);},setLineDash(){},fillRect(){},
    measureText(t){return {width:t.length*8};},fillText(t,x,y){text.push({t,x,y});}};
  return {width:1000,height:630,text,lines,getContext(){return ctx;}};
}
test('40: narrow FOV Flat grid shows view-aligned spokes and physically anchored km marks',()=>{
  const {model,physical,camera,guide}=scene('flat'),before=guide.solves(),target=canvas();
  const original=physical.map(p=>p.points.map(q=>q.slice()));
  const result=decorations.metricGridOverlay(target,model,camera,physical);
  assert.ok(result.spokes>20,'camera-oriented meridians should be visible at 7.8 degree FOV');
  assert.ok(result.labels>=3,'legible real ground distances should appear');
  assert.ok(target.text.some(x=>x.t==='100 km'),'Flat has no geometric 100 km horizon');
  assert.ok(target.text.every(x=>x.x>0&&x.x<target.width&&x.y>0&&x.y<target.height));
  assert.equal(guide.solves(),before,'a screen overlay must not shoot a single additional ray');
  assert.deepEqual(physical.map(p=>p.points),original,'rendering annotations cannot mutate physical geometry');
  assert.ok(target.lines.length);
});
test('40: Globe marks stop at the confirmed visible ground; pan still displays meridians',()=>{
  const {model,physical,camera}=scene('globe'),c=canvas();
  const result=decorations.metricGridOverlay(c,model,camera,physical);
  assert.ok(result.spokes>20);assert.ok(result.labels>0);
  assert.ok(!c.text.some(x=>x.t==='100 km'),'the obscured 100 km Globe ring is not a visible distance mark');
  const angle=23*Math.PI/180;
  const turned={...camera,center:[Math.sin(angle)*1000,Math.cos(angle)*1000,
    camera.center[2]],up:[0,0,1]};
  const other=decorations.metricGridOverlay(canvas(),model,turned,physical);
  assert.ok(other.spokes>20,'guide spacing follows the camera, not global 15 degree meridians');
});
test('40: disabled or absent metric grid remains optically and visually unchanged',()=>{
  const {model,physical,camera}=scene('flat');
  const c=canvas();
  assert.deepEqual(decorations.metricGridOverlay(c,{...model,showGrid:0},camera,physical),
    {spokes:0,labels:0});
  assert.deepEqual(decorations.metricGridOverlay(c,model,camera,[]),
    {spokes:0,labels:0});
  assert.deepEqual(c.text,[]);assert.deepEqual(c.lines,[]);
});

test('presentation ring labels scale with output pixels without changing physical ring rows or rays',()=>{
  const {model,physical,camera,guide}=scene('flat'),before=guide.solves(),original=JSON.stringify(physical);
  for(const scale of [1,1.5,2,3]){
    const c=canvas(),ctx=c.getContext(),boxes=[],fonts=[];
    ctx.fillRect=(x,y,w,h)=>boxes.push({x,y,w,h});
    const fill=ctx.fillText;ctx.fillText=function(t,x,y){fonts.push(this.font);fill(t,x,y);};
    const result=decorations.metricGridOverlay(c,model,camera,physical,scale);
    assert.ok(result.labels>0);assert.equal(boxes.length,result.labels);
    assert.ok(fonts.every(f=>f==='600 '+Math.round(12*scale)+'px Arial'));
    boxes.forEach((b,i)=>{assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=c.width&&b.y+b.h<=c.height);
      assert.equal(c.text[i].y,b.y+b.h/2);boxes.slice(i+1).forEach(a=>assert.ok(a.y+a.h<=b.y||b.y+b.h<=a.y));});
  }
  assert.equal(guide.solves(),before);assert.equal(JSON.stringify(physical),original);
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const projection=require('../src/renderers/CurvatureCanvasProjection');
const perspective=require('../src/renderers/CurvaturePerspectivePreview');
const stroke=require('../src/renderers/CurvatureStrokePreview');
const fill=require('../src/renderers/CurvatureFilledPreview');
const zbuffer=require('../src/renderers/CurvatureZBufferPreview');
const painter=require('../src/renderers/CurvatureLegacyOrderPreview');
const styled=require('../src/renderers/CurvatureStyledCombinedPreview');
const width=1218,height=812,ratio=1.5,cssWidth=width/ratio,cssHeight=height/ratio;
// Reproduce GraphX3DX: SetViewport(0,1,-.5,-2), SetWindowToCameraScreen().
function referenceGraph(){
 const vp={x:0,y:1,width:cssWidth-.5,height:cssHeight-3};
 const win={width:2*vp.width/vp.height,height:2};
 const innerW=vp.width-1,innerH=vp.height-1;
 const sx=innerW/win.width,sy=-innerH/win.height;
 const ox=win.width/2*sx+vp.x+.5;
 const oy=innerH-(-win.height/2)*sy+vp.y+.5;
 return {ContextScale:ratio,WinTrans:{ScaleX:sx,ScaleY:sy,OffsetX:ox,OffsetY:oy,TransX(x){return x*sx+ox;},TransY(y){return y*sy+oy;}},
  AutoScalePix:true,GetPixScaling(){return Math.min(1,cssWidth/800);},MinLineWidth:.01,ScalePixInt:false,DevicePixelRatio:ratio};
}
const graph=referenceGraph();
const live={CamPos:[0,0,0],CamViewCenter:[0,10,0],CamUp:[0,0,1],SceneSize:10,ScreenSize:2,ObjectZExtend:0,Zoom:1};
function captured(){const c=perspective.snapshot(live);c.pixelTransform=projection.capture(graph,width,height);return c;}
function reference(x,y){return [graph.WinTrans.TransX(x)*graph.ContextScale,graph.WinTrans.TransY(y)*graph.ContextScale];}
function near(actual,expected,tolerance=1e-9){assert.ok(Math.abs(actual[0]-expected[0])<=tolerance,`x ${actual[0]} vs ${expected[0]}`);assert.ok(Math.abs(actual[1]-expected[1])<=tolerance,`y ${actual[1]} vs ${expected[1]}`);}
const segment={type:'line',commandIndex:4,points:[[0,10,0],[2,10,3]],style:{lineWidth:2,stroke:'black'}};
const square={type:'polygon',mode:3,commandIndex:5,points:[[-1,10,-1],[1,10,-1],[1,10,1],[-1,10,1]],style:{lineWidth:1,fill:'white'}};
const scene={primitives:[segment,square]};
test('actual GraphX3DX viewport transform is captured in backing-store pixels',()=>{
 const c=captured(),map=projection.resolve(c,width,height);
 assert.equal(map.mode,'captured-GraphX3DX-window');
 near(projection.point(map,0,0),reference(0,0));
 near(projection.point(map,0.4,0.6),reference(0.4,0.6));
 near(projection.point(map,-1,-1),reference(-1,-1));
 assert.ok(Math.abs(map.scaleY+height/2)>1); // ScreenSize=2: not full-height mapping
 assert.throws(()=>projection.resolve(c,width-1,height),/does not match/);
});
test('perspective wireframe endpoints match legacy window+Canvas transform',()=>{
 const r=perspective.project({primitives:[segment]},captured(),width,height);
 assert.equal(r.segments.length,1);
 near(r.segments[0].points[0],reference(0,0));
 near(r.segments[0].points[1],reference(0.4,0.6));
});
test('strokes and fills use the same final pixel positions as perspective',()=>{
 const c=captured();
 const line=stroke.build({primitives:[segment]},c,width,height);
 near(line.segments[0].points[0],reference(0,0));
 near(line.segments[0].points[1],reference(0.4,0.6));
 const polygon=fill.build({primitives:[square]},c,width,height);
 assert.equal(polygon.polygons.length,1);
 for(let i=0;i<square.points.length;i++){
  const v=square.points[i];near(polygon.polygons[0].points[i],reference(v[0]*.2,v[2]*.2));
 }
 const triangles=zbuffer.build({primitives:[square]},c,width,height).triangles;
 assert.equal(triangles.length,2);
 const vertices=triangles.flatMap(t=>t.points);
 for(const v of square.points){const expected=reference(v[0]*.2,v[2]*.2);assert.ok(vertices.some(p=>Math.hypot(p[0]-expected[0],p[1]-expected[1])<1e-9));}
});
test('stroke widths follow auto-scaling and device-pixel ratio',()=>{
 const c=captured();
 assert.equal(projection.lineWidth(2,c),3);
 assert.equal(projection.lineWidth(0,c),1);
 assert.equal(projection.lineWidth(1,c),1.5);
 const forced={...c,pixelTransform:{...c.pixelTransform,stroke:{...c.pixelTransform.stroke,pixelScale:.4,minWidth:.75,scaleInt:true}}};
 assert.equal(projection.lineWidth(1,forced),1.5); // min .75 -> rounded to 1 CSS px
});
test('painter-order uses physical width rather than raw Canvas CSS width',()=>{
 const c=captured(),triangles=zbuffer.build({primitives:[square]},c,width,height).triangles,seen=[];
 const ctx={beginPath(){},moveTo(){},lineTo(){},closePath(){},clearRect(){},fill(){},stroke(){seen.push(this.lineWidth);}};
 painter.draw({width,height,getContext(){return ctx}},scene,c,triangles);
 assert.deepEqual(seen,[3,1.5]);
});
test('styled depth renderer receives physical stroke width through shared mapping',()=>{
 assert.match(fs.readFileSync(require.resolve('../src/renderers/CurvatureStyledCombinedPreview'),'utf8'),/canvasProjection\.lineWidth\(style&&style\.lineWidth,camera\)/);
 assert.match(require('./helpers/readCurvatureSources')(),/cameraSnapshot\.pixelTransform=window\.CurvatureCanvasProjection\.capture\(g,cameraWidth,cameraHeight\)/);
 assert.equal(typeof styled.draw,'function');
});
test('old camera fixtures without a viewport still use the historical fallback',()=>{
 const c=perspective.snapshot(live),map=projection.resolve(c,100,100);
 assert.equal(map.mode,'legacy-full-canvas-fallback');
 near(projection.point(map,.4,.6),[70,20]);
});
test('pixel-stage verifier compares independent projection through actual WinTrans',()=>{
 const verifier=require('../src/diagnostics/CurvatureCameraVerification');
 const camera={...live,Trans(v){return [v[0]*2/v[1],v[2]*2/v[1],v[1]];}};
 const g={...graph,Camera:camera};
 const s={primitives:[segment]};
 const good=verifier.verifyPixels(s,g,captured(),perspective,width,height);
 assert.equal(good.passed,true);
 assert.equal(good.comparedCoordinates,4);
 assert.ok(good.maxAbsoluteError<1e-8);
 const bad=captured();bad.pixelTransform.offsetY+=2;
 const mismatch=verifier.verifyPixels(s,g,bad,perspective,width,height);
 assert.equal(mismatch.passed,false);
 assert.equal(mismatch.firstMismatch.axis,'y');
 assert.ok(mismatch.firstMismatch.absoluteError>=1.99);
});

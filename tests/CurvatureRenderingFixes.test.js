'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const extract=require('../src/legacy/LegacyGeometryExtractor'),z=require('../src/renderers/CurvatureZBufferPreview'),ear=require('../src/geometry/CurvatureEarClip'),stroke=require('../src/renderers/CurvatureStrokePreview'),perspective=require('../src/renderers/CurvaturePerspectivePreview'),clip=require('../src/renderers/CurvatureViewportPolygonClip'),painter=require('../src/renderers/CurvatureLegacyOrderPreview'),pixel=require('../src/diagnostics/CurvaturePixelComparison');
const camera={pos:[0,0,0],center:[0,10,0],up:[0,0,1],sceneSize:10,screenSize:2,objectZExtend:0,zoom:1,near:0.001};
test('scene captures fill/stroke styles, alpha, near distance and source ordering',()=>{
 const frame={commands:[
 {method:'SetCameraClipping',args:[0.001]}, {method:'SetAreaAttr',args:['#ffa','#666',1.5]},
 {method:'SetPlane',args:[[0,10,0],[1,0,0],[0,0,1]]},
 {method:'PolygonOnPlane',args:[[-1,1,0],[-1,-1,1],3]},
 {method:'SetBgColor',args:['white']},{method:'SetAlpha',args:[0.6]},
 {method:'CircleOnPlane',args:[0,0,2,2]},
 {method:'LineOnPlane',args:[0,0,1,1]},
 ]};const r=extract.extract(frame),p=r.scene.primitives;
 assert.equal(r.scene.metadata.cameraNear,0.001);
 assert.equal(p.length,3);assert.deepEqual(p.map(x=>x.commandIndex),[3,6,7]);
 assert.deepEqual(p[0].style,{fill:'#ffa',stroke:'#666',lineWidth:1.5,alpha:1});
 assert.deepEqual(p[1].style,{fill:'white',stroke:'#666',lineWidth:1.5,alpha:0.6});
 assert.equal(p[2].style.fill,'white');assert.equal(r.coverage.unsupported,0);
});
test('screen clipping preserves inverse depth on crossing edges',()=>{
 const poly=[[-10,1,2],[10,1,4],[10,9,4],[-10,9,2]];
 const p=clip.clip(poly,10,10);assert.equal(p.length,4);
 assert.ok(p.every(v=>v[0]>=0&&v[0]<=10));
 const at=p.find(v=>v[0]===0&&v[1]===1);assert.ok(at);
 assert.ok(Math.abs(at[2]-1/(0.5/2+0.5/4))<1e-10);
});
test('large near-plane-clipped disks remain bounded and cover their visible screen region',()=>{
 const radius=100,points=Array.from({length:256},(_,i)=>{const t=2*Math.PI*i/256;return [radius*Math.cos(t),0.2+radius*Math.sin(t),0.3*radius*Math.sin(t)];});
 const r=z.build({primitives:[{type:'polygon',mode:2,commandIndex:4,sourceMethod:'CircleOnPlane',points}]},camera,120,80,ear.triangulate);
 assert.equal(r.statistics.nearPlane,0.001);assert.equal(r.statistics.failedTriangulations||0,0);
 assert.ok(r.triangles.length>=2);assert.ok(r.triangles.every(t=>t.points.every(p=>p[0]>=0&&p[0]<=120&&p[1]>=0&&p[1]<=80)));
 assert.ok(z.rasterize(r.triangles,120,80).owner.some(n=>n>=0));
});
test('stroke and wireframe use near setting and respect independent lines and open outlines',()=>{
 const scene={metadata:{cameraNear:0.001},primitives:[
 {type:'line',commandIndex:1,points:[[0,0.0005,0],[0,10,0]]},
 {type:'polygon',mode:1,commandIndex:2,points:[[-1,10,0],[0,10,1],[1,10,0]]},
 {type:'polygon',mode:2,commandIndex:3,points:[[-1,10,0],[0,10,1],[1,10,0]]},
 ]};
 const lines=stroke.build(scene,camera,100,100);
 assert.equal(lines.statistics.inputLines,1);assert.equal(lines.statistics.nearPlane,0.001);
 assert.equal(lines.statistics.inputSegments,3);
 assert.equal(perspective.project(scene,camera,100,100).segments.length,3);
});
test('painter paints the white horizon disk after earlier outlines and includes standalone lines',()=>{
 const scene={primitives:[
 {type:'line',commandIndex:0,points:[[-1,10,0],[1,10,0]],style:{stroke:'#666',lineWidth:2,alpha:1}},
 {type:'polygon',commandIndex:1,mode:2,points:[[-1,10,-1],[1,10,-1],[0,10,1]],style:{fill:'white',alpha:0.8}}
 ]};
 const triangles=z.build(scene,camera,80,80,ear.triangulate).triangles;
 const ops=[],ctx={fillStyle:'',strokeStyle:'',lineWidth:1,globalAlpha:1,beginPath(){},moveTo(){},lineTo(){},closePath(){},clearRect(){},fillRect(){},fill(){ops.push(['fill',this.fillStyle,this.globalAlpha]);},stroke(){ops.push(['stroke',this.strokeStyle,this.lineWidth]);}};
 const result=painter.draw({width:80,height:80,getContext(){return ctx}},scene,camera,triangles);
 assert.equal(result.statistics.inputLines,1);assert.equal(result.statistics.drawnSegments,1);
 assert.deepEqual(ops[0],['stroke','#666',2]);assert.deepEqual(ops[1],['fill','white',0.8]);
});
test('alpha normalized edge detection treats transparent black as white background',()=>{
 const w=30,h=30,a=new Uint8ClampedArray(w*h*4),b=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<w*h;i++){a.set([0,0,0,0],i*4);b.set([255,255,255,255],i*4);}
 const r=pixel.compareEdges(a,b,w,h,{top:2,bottom:2,inset:2});
 assert.equal(r.statistics.referenceEdges,0);assert.equal(r.statistics.candidateEdges,0);
 assert.match(r.statistics.alphaNormalization,/white/);
});
test('styled depth preview resolves recorded CSS colors and exposes diagnostics',()=>{
 const styled=require('../src/renderers/CurvatureStyledCombinedPreview');
 assert.deepEqual(styled.color('#ffa'),[255,255,170,1]);
 assert.deepEqual(styled.color('#666'),[102,102,102,1]);
 assert.deepEqual(styled.color('white'),[255,255,255,1]);
 const fs=require('node:fs'),html=require('./helpers/readCurvatureSources')();
 assert.ok(html.includes('CurvatureStyledCombinedPreview.js'));
 assert.ok(html.includes('camera-styled-combined.png'));
 assert.ok(html.includes('styledEdgeComparison'));
});

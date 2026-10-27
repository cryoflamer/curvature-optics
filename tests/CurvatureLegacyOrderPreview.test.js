'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const painter=require('../src/renderers/CurvatureLegacyOrderPreview');
const camera={pos:[0,0,10],center:[0,0,0],up:[0,1,0],sceneSize:10,screenSize:10,objectZExtend:0,zoom:1};
const polygon=(id,mode,z)=>({type:'polygon',commandIndex:id,mode,points:[[-1,-1,z],[1,-1,z],[1,1,z],[-1,1,z]]});
test('painter preserves source command order and mode flags',()=>{const scene={primitives:[polygon(7,1,0),polygon(3,3,0),polygon(9,2,0)]};const tri=[{commandIndex:3,points:[[1,1,10],[2,1,10],[2,2,10]]},{commandIndex:9,points:[[1,1,10],[2,1,10],[2,2,10]]}];const r=painter.build(scene,camera,100,100,tri);assert.deepEqual(r.commands.map(c=>c.commandIndex),[7,3,9]);assert.deepEqual(r.commands.map(c=>c.triangles.length),[0,1,1]);assert.deepEqual(r.commands.map(c=>c.segments.length),[3,3,0]);});
test('diagnostic export includes painter-order comparison',()=>{const html=require('./helpers/readCurvatureSources')();for(const x of ['CurvatureLegacyOrderPreview.js','camera-legacy-order.png','camera-legacy-order-edge-diff.png','legacyOrderEdgeComparison','cameraLegacyOrder:legacyOrderResult.statistics'])assert.ok(html.includes(x),x);});

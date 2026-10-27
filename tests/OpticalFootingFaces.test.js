'use strict';
const assert=require('assert');
require('../src/optics/OpticalRenderedVertexAudit');
const {clipVisibleFooting}=require('../src/renderers/CurvatureInverseOpticsBridge');
const triangulate=global.CurvatureRenderedVertexAudit.triangulateFooting;
const xs=[-.145,-.095,-.095,.095,.095,.145,.145,-.145,-.145];
const ys=[0,0,.105,.105,0,0,.137,.137,0];
const world=xs.map((x,i)=>[x,ys[i],0]);
const faces=triangulate(xs,ys,world);
assert.strictEqual(faces.length,6,'8-vertex concave footing must produce 6 triangles');
const area=poly=>Math.abs(poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-q[0]*p[1]},0))/2;
assert(Math.abs(faces.reduce((s,f)=>s+area(f),0)-area(world.slice(0,-1)))<1e-10,'triangles must cover exact footprint without overlap');
assert(faces.every(f=>area(f)>1e-9));
// Visibility clipping must work when the *second* endpoint is visible, too.
const tri=[[0,0,0],[2,0,0],[0,2,0]];
const part=clipVisibleFooting(tri,p=>p[0]>=1?p:null);
assert(part && part.partial && part.points.every(p=>p[0]>=1-1e-4));
console.log('OpticalFootingFaces: OK');

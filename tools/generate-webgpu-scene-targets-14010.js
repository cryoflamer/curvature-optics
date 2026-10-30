#!/usr/bin/env node
/* Regenerate the immutable #140.10 scene-target fixture from the actual
 * production physical tower composition. No hand-authored synthetic rays. */
'use strict';
const composition=require('../src/scene/CurvatureIndependentComposition');
const silhouette=require('../src/optics/OpticalTowerSilhouette');
const surface=require('../src/geometry/CurvatureSurfaceGeometry');
const {model}=require('./benchmark-adaptive-prism-112');
const fs=require('node:fs');
const path=require('node:path');
const R=6371000, EYE=15, COUNT=64, DENSE_COUNT=1024, EDGE_SUBDIVISIONS=12;
function collect(geometry){
  const m=model(10,geometry);
  const c=composition.composeOpticalMain(m,geometry==='globe',{physicalWorld:true});
  const metric=surface.createFromCurvature(geometry==='globe'?1/R:0);
  const uniq=new Map(),edgeSamples=new Map();
  function addSample(map,point){
    const coord=silhouette.coordinate(point,geometry,R,EYE,metric);
    if(coord.distance<=0||coord.distance>R*Math.PI/2||coord.height<0)return;
    const key=coord.distance.toFixed(7)+','+coord.height.toFixed(7);
    if(!map.has(key))map.set(key,[coord.distance,coord.height]);
  }
  for(const group of c.ranges.filter(r=>r.role==='objects')){
    for(const primitive of c.scene.primitives.slice(group.start,group.end)){
      for(const point of primitive.points){
        addSample(uniq,point);
        addSample(edgeSamples,point);
      }
      // Physical polygon edges, NOT interpolations between unrelated towers.
      // Sampling before coordinate conversion preserves curved geometry.
      if(primitive.type==='polygon')for(let i=0;i<primitive.points.length;i++){
        const a=primitive.points[i],b=primitive.points[(i+1)%primitive.points.length];
        for(let j=1;j<EDGE_SUBDIVISIONS;j++){
          const t=j/EDGE_SUBDIVISIONS;
          addSample(edgeSamples,a.map((v,k)=>v+(b[k]-v)*t));
        }
      }
    }
  }
  const all=Array.from(uniq.values()).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  if(all.length<COUNT)throw Error('Not enough production scene vertices');
  // Deterministically spread across the complete near-to-far tower bank.
  const targets=Array.from({length:COUNT},(_,i)=>all[Math.floor(i*(all.length-1)/(COUNT-1))]);
  const dense=Array.from(edgeSamples.values()).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  if(dense.length<DENSE_COUNT)throw Error('Not enough real polygon-edge samples');
  const denseTargets=Array.from({length:DENSE_COUNT},(_,i)=>
    dense[Math.floor(i*(dense.length-1)/(DENSE_COUNT-1))]);
  return {id:'towers-12.'+geometry,geometry,atmosphere:'standard',radius:R,
    observerHeight:EYE,sourceVertexCount:all.length,targets,
    denseSourcePointCount:dense.length,denseTargets};
}
function fixture(){return {version:'140.10',source:'CurvatureIndependentComposition.composeOpticalMain physicalWorld + OpticalTowerSilhouette.coordinate',
  selection:'64 distance-sorted unique production mesh vertices, evenly sampled',
  denseSelection:'1024 distance-sorted unique vertices and polygon-edge points from physical 12-tower meshes (12 edge subdivisions)',
  scenes:['flat','globe'].map(collect)};}
if(require.main===module){
  const target=path.join(__dirname,'reference','webgpu-real-scene-targets-14010.json');
  fs.writeFileSync(target,JSON.stringify(fixture(),null,2)+'\n');
  process.stdout.write(target+'\n');
}
module.exports={fixture,collect};

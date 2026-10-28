/* Reproducible optical and painter-contract validation.
 * Sampled acceptance is NOT a global error proof or a browser screenshot.
 * Run: node tools/validate-physical-scene-115.js [--full] [--json]
 */
'use strict';
const {performance}=require('node:perf_hooks');
const target=require('../src/optics/OpticalTargetProjection');
const fieldFactory=require('../src/optics/OpticalSharedRayField');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const composition=require('../src/scene/CurvatureIndependentComposition');
const silhouette=require('../src/optics/OpticalTowerSilhouette');
const frames=require('../src/scene/CurvatureRenderFrame');
const painter=require('../src/renderers/CurvatureFrameRenderer');
const {model}=require('./benchmark-adaptive-prism-112');
const R=6371000;
const WIDTH=1920,FOV=Math.PI/3,PIXELS_PER_RADIAN=WIDTH/FOV;
const point=(d,h,g,r=R)=>g==='flat'?[d,h]:[(r+h)*Math.sin(d/r),(r+h)*Math.cos(d/r)-r];
const horizon=(kind,h,r)=>r*(kind==='inverse-spherical'||kind==='globe-vacuum'?
  Math.acos(r/(r+h)):Math.acos(Math.exp(-h/r)));
function boundaryMatrix({heights=[2,15,100],radii=[500000,R]}={}){
  const cases=[];
  for(const r of radii)for(const eye of heights)for(const h of [0,65]){
    const limit=horizon('globe-vacuum',eye,r)+horizon('globe-vacuum',h,r);
    for(const offset of [-200,200]){
      const d=limit+offset;
      const globe=optics.vacuumSample('globe',r,eye,d,h);
      const inverse=target.solve({geometry:'flat',radius:r,observerHeight:eye,
        target:[d,h],atmosphere:'inverse-spherical',profileOptions:{occlusionRadius:r},step:Math.min(2000,r/250)});
      const expected=offset<0?'visible':'blocked';
      cases.push({r,eye,h,offset,expected,globe:globe.status,inverse:inverse.status,
        passed:globe.status===expected&&inverse.status===expected});
    }
  }
  // The exponential-occlusion law agrees with its own analytically distinct
  // tangent distance; do not conflate the two engineered profiles.
  for(const eye of [15,100])for(const h of [0,65])for(const offset of [-200,200]){
    const d=horizon('exponential-occlusion',eye,R)+horizon('exponential-occlusion',h,R)+offset;
    const result=target.solve({geometry:'flat',radius:R,observerHeight:eye,
      target:[d,h],atmosphere:'exponential-occlusion',profileOptions:{occlusionRadius:R},step:2000});
    const expected=offset<0?'visible':'blocked';
    cases.push({r:R,eye,h,offset,expected,exponential:result.status,passed:result.status===expected});
  }
  return {name:'analytic-grazing-boundaries',cases:cases.length,
    failures:cases.filter(c=>!c.passed),scopes:['globe-vacuum','flat-inverse-spherical','flat-exponential-occlusion']};
}
function standardNumericalQualification(){
  const rows=[],failures=[];
  for(const geometry of ['flat','globe'])for(const height of [0,65])
    for(const distance of [3000,10000,15000]){
      const position=point(distance,height,geometry);
      const vacuum=target.solve({geometry,radius:R,observerHeight:15,
        target:position,atmosphere:'vacuum',step:2000});
      const coarse=target.solve({geometry,radius:R,observerHeight:15,
        target:position,atmosphere:'standard',step:2000});
      const fine=target.solve({geometry,radius:R,observerHeight:15,
        target:position,atmosphere:'standard',step:200});
      const deviation=Math.abs(coarse.angle-fine.angle)*PIXELS_PER_RADIAN;
      const correct=coarse.status==='visible'&&fine.status==='visible'&&
        Number.isFinite(deviation)&&deviation<0.05&&coarse.angle>vacuum.angle;
      if(!correct)failures.push({geometry,height,distance,
        coarse:coarse.status,fine:fine.status,deviation});
      rows.push({geometry,height,distance,coarse:coarse.status,fine:fine.status,
        pixelError:deviation,apparentLift:coarse.angle-vacuum.angle});
    }
  return {name:'standard-rk4-step-qualification',cases:rows.length,
    maxPixelError:Math.max(...rows.map(r=>r.pixelError)),
    minimumApparentLift:Math.min(...rows.map(r=>r.apparentLift)),failures};
}
function projectionMatrix(){
  const rows=[];
  const pairs=[['flat','standard'],['globe','standard'],['flat','inverse-spherical'],['flat','exponential-occlusion']];
  for(const [geometry,atmosphere] of pairs){
    const field=fieldFactory.create({geometry,radius:R,observerHeight:15,atmosphere,
      profileOptions:atmosphere==='standard'?undefined:{occlusionRadius:R},
      distances:[500,1000,3000,8000,16000,30000],heights:[0,5,20,65],
      step:2000,angleTolerance:1e-5,adaptiveDepth:3,maxAdaptiveCells:4096});
    // Deliberately offset from cell corners, centres and edge midpoints used
    // by cell qualification. Only reliable away-from-tangency statuses are
    // demanded to match; a boundary ambiguity remains visible in the report.
    const samples=[[770,9],[1350,31],[2670,59],[4110,16],[5840,44],
      [7350,62],[9300,7],[11400,27],[13850,55],[17500,13],
      [21000,40],[26200,64]];
    let compared=0, maxPx=0,mismatches=0,ambiguous=0;
    const failures=[];
    for(const [d,h] of samples){
      const approx=field.sample(d,h);
      const direct=target.solve({geometry,radius:R,observerHeight:15,target:point(d,h,geometry),
        atmosphere,profileOptions:atmosphere==='standard'?undefined:{occlusionRadius:R},step:200});
      if(approx.status==='indeterminate'||direct.status==='indeterminate'||
        approx.status==='solver_failed'||direct.status==='solver_failed'){
        ambiguous++;continue;
      }
      if(approx.status!==direct.status){mismatches++;failures.push({d,h,expected:direct.status,actual:approx.status});continue;}
      if(direct.status==='visible'){
        compared++;
        const diff=Math.abs(approx.angle-direct.angle)*PIXELS_PER_RADIAN;
        maxPx=Math.max(maxPx,diff);
        if(diff>0.5)failures.push({d,h,pixelError:diff});
      }
    }
    rows.push({geometry,atmosphere,sampledPoints:samples.length,compared,ambiguous,
      mismatches,maxPixelError:+maxPx.toFixed(7),field:field.stats(),failures});
  }
  return {name:'independent-target-shooting',viewport:{width:WIDTH,horizontalFovDegrees:60},
    tolerancePixels:0.5,rows:rows,failures:rows.flatMap(r=>r.failures)};
}
function nondegenerateFillAim(primitives){
  // A fixed camera may point outside every foundation (notably on Globe),
  // yielding zero Canvas fill calls despite hundreds of valid authored fills.
  // Aim a third, independent painter probe at an ACTUAL projected fill facet.
  let best=null,bestArea=0;
  for(const p of primitives){
    if(p.metadata?.kind!=='physical-object-fill'||p.points.length!==3)continue;
    const [a,b,c]=p.points;
    const u=b.map((v,i)=>v-a[i]),v=c.map((x,i)=>x-a[i]);
    const area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);
    if(area>bestArea){bestArea=area;best=a.map((x,i)=>(x+b[i]+c[i])/3);}
  }
  return bestArea>1e-8?best:null;
}
function camera(x){
  return {pos:[0,0,0],center:Array.isArray(x)?x:[x,1000,0],up:[0,0,1],sceneSize:2,
    screenSize:2,objectZExtend:0,zoom:1,near:1e-5};
}
function sceneMatrix({full=false,workloads}={}){
  const rows=[];
  workloads=workloads||[['flat','standard',85],['globe','standard',85],
    ['flat','inverse-spherical',2],['globe','vacuum',2]];
  if(full)workloads.push(['flat','standard',200],['globe','standard',200]);
  for(const [geometry,atmosphere,count] of workloads){
    const m=model(count,geometry),source=composition.composeOpticalMain(m,geometry==='globe');
    const api=optics.create();
    const start=performance.now(),result=api.transform(source,m,{atmosphere,
      occlusionRadius:R});
    const coldMs=performance.now()-start;
    const cachedStart=performance.now(),again=api.transform(source,m,{atmosphere,
      occlusionRadius:R});
    const warmMs=performance.now()-cachedStart;
    const primitives=result.composition.scene.primitives;
    const errors=[];
    const perObject=result.stats.perObject;
    if(perObject.length!==count+2)errors.push('placed-object-count');
    if(perObject.some((item,i)=>i>0&&perObject[i-1].distance<item.distance))errors.push('painter-order');
    if(result.stats.budgetExceeded)errors.push('time-budget');
    if(result.stats.unresolvedReasons['sample-budget'])errors.push('sample-budget');
    if(result.stats.fillUnresolved)errors.push('uncertain-fill');
    if(!result.stats.fillTriangles)errors.push('fills-missing');
    if(!result.stats.visibleSegments)errors.push('strokes-missing');
    if(!again.reused||again.composition!==result.composition)errors.push('cold-cache-invalidation');
    // Recompose the optics-neutral source after a real model camera turn;
    // legacy tangent presentation changes, physical 3D geometry does not.
    m.PanRad=0.3;m.Nick=0.05;
    const turnedSource=composition.composeOpticalMain(m,geometry==='globe');
    const turned=api.transform(turnedSource,m,{atmosphere,occlusionRadius:R});
    if(!turned.reused||turned.composition!==result.composition)errors.push('camera-invalidated-physical-optics');
    if(geometry==='globe'&&atmosphere==='vacuum'&&
      Math.abs(result.stats.groundHorizon-horizon('globe-vacuum',15,R))>1)
      errors.push('vacuum-horizon-distance');
    if(geometry==='flat'&&atmosphere==='inverse-spherical'&&
      Math.abs(result.stats.groundHorizon-horizon('inverse-spherical',15,R))>1)
      errors.push('inverse-horizon-distance');
    if(geometry==='flat'&&atmosphere==='standard'&&result.stats.groundHorizon!==null)
      errors.push('invented-flat-horizon');
    if(primitives.some(p=>p.points.some(v=>v.some(n=>!Number.isFinite(n)))))errors.push('non-finite-projection');
    // Validate painter ordering on the ACTUAL projected scene. It is not
    // sufficient to sort perObject statistics while interleaving commands.
    const observed=new Map(),sequence=[];
    primitives.forEach((p,index)=>{
      if(!['physical-object-fill','physical-object-stroke'].includes(p.metadata?.kind))return;
      const sourcePrimitive=source.scene.primitives[p.metadata.opticalSourceIndex];
      const metadata=sourcePrimitive?.metadata;
      if(!metadata||!Number.isInteger(metadata.placedObjectIndex)){
        errors.push('missing-painter-source');return;
      }
      const key=metadata.objectBank+':'+metadata.placedObjectIndex;
      if(!observed.has(key)){observed.set(key,{first:index,last:index,firstStroke:null,lastFill:null});sequence.push(key);}
      const batch=observed.get(key);
      if(index!==batch.last && index!==batch.last+1)errors.push('interleaved-painter-batch');
      batch.last=index;
      if(p.metadata.kind==='physical-object-stroke'&&batch.firstStroke===null)batch.firstStroke=index;
      if(p.metadata.kind==='physical-object-fill')batch.lastFill=index;
    });
    // Fully ground-occluded towers legitimately emit no painter commands.
    if(sequence.length===0||sequence.length>count+2)errors.push('painter-batch-count');
    for(const batch of observed.values())
      if(batch.firstStroke!==null&&batch.lastFill!==null&&batch.firstStroke<batch.lastFill)
        errors.push('fill-painted-over-own-stroke');
    let checks=0,totalDrawnFills=0,totalDrawnStrokes=0;
    const fillAim=nondegenerateFillAim(primitives);
    if(!fillAim)errors.push('no-nondegenerate-fill-facet');
    const views=[{name:'reference',camera:camera(0)},
      {name:'pan',camera:camera(0.3)}];
    if(fillAim)views.push({name:'foundation-targeted',camera:camera(fillAim)});
    const painterViews=[];
    for(const view of views){
      const frame=frames.fromComposition(result.composition,view.camera,480,320);
      let fills=0,strokes=0;
      const ctx={clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},
        fill(){fills++;},stroke(){strokes++;}};
      const canvas={width:480,height:320,getContext(){return ctx;}};
      const render=painter.render(canvas,frame,{mode:'painter'});
      if(render.mode!=='painter'||!strokes)errors.push('shared-canvas-painter');
      totalDrawnFills+=fills;totalDrawnStrokes+=strokes;checks++;
      painterViews.push({name:view.name,fillCalls:fills,strokeCalls:strokes});
    }
    if(fillAim&&!painterViews.some(v=>v.name==='foundation-targeted'&&v.fillCalls>0))
      errors.push('visible-foundation-was-not-filled');
    if(result.stats.boundaryClipped>0 &&
        !(result.stats.maxBoundaryGapMetres<=0.1))errors.push('unbounded-ground-clip-gap');
    rows.push({geometry,atmosphere,towers:count+2,
      coldMs:+coldMs.toFixed(2),cachedMs:+warmMs.toFixed(2),
      visibleSegments:result.stats.visibleSegments,fillTriangles:result.stats.fillTriangles,
      fillUnresolved:result.stats.fillUnresolved,outlineUnresolved:result.stats.unresolved,
      unresolvedReasons:result.stats.unresolvedReasons,sharedExactSolves:result.stats.fieldStats?.solves||0,
      boundaryClipped:result.stats.boundaryClipped,maxBoundaryGapMetres:result.stats.maxBoundaryGapMetres,
      boundaryGrazingStops:result.stats.boundaryGrazingStops,
      painterViewsChecked:checks,painterViews,drawnFillCalls:totalDrawnFills,drawnStrokeCalls:totalDrawnStrokes,
      groundHorizon:result.stats.groundHorizon,
      cacheReused:again.reused,cameraTurnReused:turned.reused,failures:errors});
  }
  return {name:'shared-painter-and-boundary-accounting',rows,
    failures:rows.flatMap(r=>r.failures)};
}
function vacuumGeometry(){
  const rows=[],failures=[];
  for(const geometry of ['flat','globe'])for(const distance of [100,1000,12000,26000])
    for(const height of [0,15,65]){
      const eye=15;
      const [x,z]=point(distance,height,geometry);
      const world=[0,x,z-eye];
      const coord=silhouette.coordinate(world,geometry,R,eye);
      const analytical=Math.atan2(world[2],Math.hypot(world[0],world[1]));
      const result=optics.vacuumSample(geometry,R,eye,coord.distance,Math.max(0,coord.height));
      const deviation=Math.abs(result.angle-analytical);
      if(deviation>2e-10)failures.push({geometry,distance,height,deviation});
      rows.push({geometry,distance,height,status:result.status,angleError:deviation});
    }
  return {name:'vacuum-camera-world-geometry',cases:rows.length,
    maxAngleError:Math.max(...rows.map(r=>r.angleError)),failures};
}
function run(options={}){
  const started=performance.now();
  const sections=[vacuumGeometry(),boundaryMatrix(),standardNumericalQualification(),
    projectionMatrix(),sceneMatrix(options)];
  return {suite:'physical-optics-validation-115',passed:sections.every(s=>s.failures.length===0),
    elapsedMs:+(performance.now()-started).toFixed(2),
    limitations:['Sampling does not prove a global interpolation error bound',
      'Near-horizon outline uncertainty is reported, not silently marked visible or blocked',
      'This validates shared painter commands, not browser pixels or arbitrary 3D mutual occlusion',
      'Engineered Flat horizon equality does not assert equality of all image angles'],
    sections};
}
if(require.main===module){
  try{
    const report=run({full:process.argv.includes('--full')});
    if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
    else {
      console.log('Physical optics #115:',report.passed?'PASS':'FAIL','('+report.elapsedMs+' ms)');
      for(const section of report.sections){
        console.log('\n'+section.name+':',section.failures.length?'FAIL':'PASS');
        for(const row of section.rows||[])
          console.log(' ',row.geometry,row.atmosphere||'',row.towers||'',
            row.coldMs===undefined?'max error '+row.maxPixelError+' px':'cold '+row.coldMs+' ms',
            row.outlineUnresolved===undefined?'':'boundary '+row.outlineUnresolved);
        for(const problem of section.failures.slice(0,5))console.log('  failure:',JSON.stringify(problem));
      }
      console.log('\nLimits:',report.limitations.join('; '));
    }
    if(!report.passed)process.exitCode=1;
  }catch(error){console.error(error);process.exitCode=1;}
}
module.exports={run,vacuumGeometry,boundaryMatrix,standardNumericalQualification,
  projectionMatrix,sceneMatrix,point,horizon};

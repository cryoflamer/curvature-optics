/* #140.12.35: controlled GPU-grid algorithmic ablation diagnostics.
 * The same 4096-ray GPU grid is used in baseline, strict-status gate, and
 * strict + a fixed sparse direct-GPU refinement set. CPU exact answers are
 * computed AFTER selecting/painting the GPU candidates and never injected.
 * The variants are not independent causal factors: changing statuses changes
 * recursive geometry queries. Report that limitation explicitly.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGpuAlgorithmAttribution141235=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var VERSION='140.12.35',KINDS=['visible','blocked','indeterminate','solver_failed'];
  function kind(value){return KINDS.includes(value)?value:'solver_failed';}
  function comparison(rows,cpu,direct,camera,projection){
    if(!Array.isArray(rows)||!rows.length||!cpu||!direct||
        !Array.isArray(cpu.results)||!Array.isArray(direct.results)||
        rows.length!==cpu.results.length||rows.length!==direct.results.length||
        !camera||typeof projection!=='function')throw TypeError('Aligned renderer queries, independent CPU/GPU results and physical camera required');
    var matrix={},counts={targets:rows.length,robustCpuTargets:0,
      gridStatusMismatches:0,directStatusMismatches:0,gridAndDirectBothMismatch:0,
      gridWrongDirectCorrect:0,gridCorrectDirectWrong:0,
      uncertainCpuTargets:0,gridRiskTargets:0,
      gridVsCpuAnglesCount:0,directVsCpuAnglesCount:0,
      maxGridVsCpuPx:0,maxDirectVsCpuPx:0,meanGridVsCpuPx:0,meanDirectVsCpuPx:0},
      data=[];
    function addMatrix(name,a,b){var k=kind(a)+' → '+kind(b);matrix[name][k]=(matrix[name][k]||0)+1;}
    ['gridVsCpu','directVsCpu','gridVsDirect'].forEach(function(key){matrix[key]={};});
    rows.forEach(function(row,i){
      if(!row||!Number.isFinite(row.d)||!Number.isFinite(row.h)||row.d<=0||row.h<0)
        throw TypeError('Invalid sampled renderer query');
      var c=cpu.results[i],g=direct.results[i];
      if(!c||!g)throw TypeError('Incomplete direct or CPU result');
      if(Array.isArray(c.target)&&Array.isArray(g.target)&&
        (c.target.length!==2||g.target.length!==2||
         c.target[0]!==g.target[0]||c.target[1]!==g.target[1]))
        throw RangeError('CPU/direct GPU target order mismatch');
      var cs=kind(c.status),ds=kind(g.status),gs=kind(row.gridStatus),
        risks=Array.isArray(row.riskFlags)?row.riskFlags:[],
        robust=cs==='visible'||cs==='blocked';
      addMatrix('gridVsCpu',cs,gs);addMatrix('directVsCpu',cs,ds);
      addMatrix('gridVsDirect',ds,gs);
      if(risks.length)counts.gridRiskTargets++;
      if(!robust)counts.uncertainCpuTargets++;
      else{
        counts.robustCpuTargets++;
        if(gs!==cs)counts.gridStatusMismatches++;
        if(ds!==cs)counts.directStatusMismatches++;
        if(gs!==cs&&ds!==cs)counts.gridAndDirectBothMismatch++;
        if(gs!==cs&&ds===cs)counts.gridWrongDirectCorrect++;
        if(gs===cs&&ds!==cs)counts.gridCorrectDirectWrong++;
      }
      function offset(candidate){
        // Coordinate comparisons are meaningful only for robust matching
        // first-forward-x branch/status. Never hide classification changes
        // behind a small projected angle delta.
        if(!robust||candidate.status!==cs||!Number.isFinite(c.angle)||
            !Number.isFinite(candidate.angle))return null;
        var one=projection(camera,c.angle),two=projection(camera,candidate.angle);
        if(!one||!two||one.inFrame===false||two.inFrame===false||
           !Number.isFinite(one.yPx)||!Number.isFinite(two.yPx))return null;
        return Math.abs(two.yPx-one.yPx);
      }
      var gr=offset({status:gs,angle:row.gridAngle}),dr=offset(g);
      if(gr!==null){counts.gridVsCpuAnglesCount++;counts.maxGridVsCpuPx=Math.max(counts.maxGridVsCpuPx,gr);counts.meanGridVsCpuPx+=gr;}
      if(dr!==null){counts.directVsCpuAnglesCount++;counts.maxDirectVsCpuPx=Math.max(counts.maxDirectVsCpuPx,dr);counts.meanDirectVsCpuPx+=dr;}
      data.push({d:row.d,h:row.h,riskFlags:risks,gridStatus:gs,
        directGpuStatus:ds,cpuF64Status:cs,gridAngleRadians:row.gridAngle,
        directGpuAngleRadians:g.angle,cpuF64AngleRadians:c.angle,
        gridVsCpuPx:gr,directVsCpuPx:dr,
        gridCalls:{sample:row.sampleCalls||0,exact:row.exactCalls||0},
        cpuEvent:c.event||null,directGpuEvent:g.event||null});
    });
    counts.meanGridVsCpuPx=counts.gridVsCpuAnglesCount?
      counts.meanGridVsCpuPx/counts.gridVsCpuAnglesCount:null;
    counts.meanDirectVsCpuPx=counts.directVsCpuAnglesCount?
      counts.meanDirectVsCpuPx/counts.directVsCpuAnglesCount:null;
    if(!counts.gridVsCpuAnglesCount)counts.maxGridVsCpuPx=null;
    if(!counts.directVsCpuAnglesCount)counts.maxDirectVsCpuPx=null;
    return {summary:counts,confusion:matrix,perTarget:data,
      note:'Agreement is evaluated only for CPU visible/blocked; uncertain CPU outcomes excluded from robust mismatches. Angles are compared only when CPU and candidate robust statuses agree.'};
  }
  function report(cases,oracle,metadata){
    if(!Array.isArray(cases)||cases.length!==4||
       cases.some(function(item){return !item||!item.variants||
         !['baseline','strict','strictDirect'].every(function(k){return item.variants[k]&&item.variants[k].pixelDiff;});})||
       !oracle||!oracle.summary)throw TypeError('Four 3-way measured camera cases and aligned oracle audit required');
    return {version:VERSION,kind:'GPU grid algorithmic error attribution (status gating + sparse direct queries)',
      gpuAlgorithm:'f32 RK4 predictor 500m, scene-derived grid, 192 selected direct GPU targets maximum',
      doubleSingleFrame:false,realFramesCompared:true,
      cpuOracleUsedForCandidateSelection:false,cpuOracleInjectedIntoGpuFrame:false,
      productionAuthorized:false,causalDecompositionCertified:false,
      cases:cases,rendererQueryOracle:oracle,setup:metadata,limitations:[
        'Strict status gate turns mixed/invalid/out-of-domain grid responses into indeterminate; it is a diagnostic no-guessed-visibility policy, NOT a physical visibility solution.',
        'Strict + direct refinement only replaces selected exact renderer coordinates from one baseline actual-camera discovery; adaptive variants may issue other coordinates.',
        'The three variants change renderer query paths and geometry; pixel improvements are NOT additive independent causal contributions.',
        'CPU f64 same-coordinate oracle is computed after all GPU candidates; it does not influence selection or painting.',
        'The direct GPU answers are f32 RK4 predictor, NOT DS; unresolved or ambiguous ground contact does not certify visibility.',
        'White-composited RGB and painted/edge metrics are raster proxies, not semantic sky/ground or certified horizon.',
        'GPU computes rays, CPU Canvas 2D paints; frame paint timings exclude GPU grid setup/readback and direct sampling.',
        'Unselected or out-of-domain queries remain uncertain under strict mode; missing geometry can increase deliberately.',
        'Results apply to this scene, four cameras, sampled first-forward-x branch; no production acceptance or mathematical error bound.'
      ]};
  }
  return Object.freeze({VERSION:VERSION,comparison:comparison,report:report});
}));

/* Legacy main Canvas routing belongs to one renderer/model instance.
 * The original Legacy fallback and Physical/Independent status reporting stay
 * unchanged. DOM, globals and diagnostic capture are injected through ports. */
(function(root){
  'use strict';
  var required=['getModel','getMode','getStatus','getRenderer','isAuditActive',
    'drawLegacy','getPhysicalOptions','reportError'];
  function create(ports){
    if(!ports||required.some(function(name){return typeof ports[name]!=='function';}))
      throw new TypeError('Legacy Canvas presenter requires explicit drawing ports');
    return {draw:function(g){
      var model=ports.getModel();
      if(!model||typeof model!=='object')
        throw new TypeError('Legacy Canvas presenter requires a model object');
      var selector = ports.getMode();
      var status = ports.getStatus();
      var independent = ports.getRenderer();
      if (!selector || (selector.value !== 'independent' && selector.value !== 'physical') || !independent ||
          ports.isAuditActive()) {
        if (status && (!selector || selector.value === 'legacy')) status.textContent = '';
        return ports.drawLegacy(g);
      }
      var physicalMode = selector.value === 'physical';
      var availability = physicalMode ? independent.supportPhysical(model) : independent.support(model);
      if (!availability.supported) {
        if (status) status.textContent = availability.reason;
        return ports.drawLegacy(g);
      }
      try {
        var result;
        if (physicalMode) {
          result = independent.renderPhysical(g, model, ports.getPhysicalOptions());
          if (status) {
            var reasons=result.unresolvedReasons||{},samples=result.sampleStatuses||{};
            var solverFailures=samples.solver_failed||0;
            var grazingSamples=samples.indeterminate||0;
            var pieces=[];
            pieces.push(result.drawn+' lines (visible outline pieces)');
            if(result.interactiveGuidePreview)pieces.push('INTERACTIVE PREVIEW: '+
              result.previewGuidePrimitives+'/'+result.fullGuidePrimitives+
              ' ground guides (full grid restored after slider settles)');
            if(result.fillTriangles!==undefined){
              pieces.push(result.fillTriangles+' physical fill triangles | '+
                result.fillUnresolved+' uncertain fill triangles omitted');
              if(result.fillUnresolved)pieces.push('fill boundaries: '+
                JSON.stringify(result.fillUnresolvedReasons||{}));
            }
            pieces.push(result.unresolved+' unresolved ('+
              (reasons['visibility-boundary']||0)+' horizon/boundary, '+
              (reasons['optical-solver']||0)+' solver, '+
              (reasons['sample-budget']||0)+' sample-budget, '+
              (reasons['grazing-uncertainty']||0)+' grazing)');
            if(result.boundaryClipped)pieces.push(result.boundaryClipped+
              ' bounded boundary clips (gap <= '+
              result.maxBoundaryGapMetres.toFixed(4)+' m; hidden gap not drawn'+
              (result.boundaryGrazingStops?'; '+result.boundaryGrazingStops+' grazing stops':'')+')');
            pieces.push(solverFailures+' failed point evaluations | '+
              grazingSamples+' grazing/indeterminate point samples');
            pieces.push(result.cacheReused?'optical geometry cached':'optical geometry '+result.buildMs+' ms');
            if(result.timings){
              var t=result.timings;
              pieces.push('frame '+Math.round(t.totalMs)+' ms ('+
                'scene '+Math.round(t.composeMs)+' + optics '+Math.round(t.opticsMs)+
                ' + screen LOD '+Math.round(t.screenLodMs||0)+
                ' + snapshot '+Math.round(t.snapshotOnlyMs===undefined?t.frameMs:t.snapshotOnlyMs)+
                ' + painter '+Math.round(t.paintMs)+
                ' [validation '+Math.round(t.validationMs)+
                ', fill projection '+Math.round(t.projectionMs)+
                ', Canvas '+Math.round(t.canvasMs)+'] ms; '+
                t.strokeCalls+' Canvas strokes)');
            }
            if(result.guideScreenLod){
              var l=result.guideScreenLod;
              pieces.push('screen grid <= '+l.tolerancePixels+' px: '+
                l.inputGroundSegments+' source -> '+
                (l.inputGroundSegments-l.removedBySimplification-l.removedOffscreen)+
                ' displayed ('+l.removedOffscreen+' offscreen/behind, '+
                l.removedBySimplification+' simplified, '+l.unsafeNearPlane+
                ' near-plane preserved)');
            }
            if(result.opticalStages&&!result.cacheReused){
              var ot=result.opticalStages;
              pieces.push('cold optics: ground '+Math.round(ot.groundGuidesMs)+
                ', outlines '+Math.round(ot.outlinesMs)+', fills '+Math.round(ot.fillsMs)+
                ', exact solver '+Math.round(ot.exactSolveMs)+' ms (solver included in ground/outlines/fills)');
            }
            if(result.step)pieces.push('RK4 step '+Math.round(result.step)+' m');
            if(result.fieldStats){
              pieces.push(result.fieldStats.solves+' shared exact ray solves'+
                (result.towerSolves!==undefined?' ('+result.towerSolves+' tower, '+
                  result.sharedGroundSolves+' ground)':''));
              if(result.fieldPrism)pieces.push('tower prism '+
                Math.round(result.fieldPrism.minDistance/1000)+'-'+
                Math.round(result.fieldPrism.maxDistance/1000)+' km | '+
                Math.round(result.fieldPrism.minHeight)+'-'+
                Math.round(result.fieldPrism.maxHeight)+' m elevation');
              pieces.push(result.fieldStats.interpolations+' interpolated points | '+
                result.fieldStats.fallbacks+' exact fallbacks');
              if(!result.cacheReused&&result.fieldStats.predictorAccepted)
                pieces.push('fast shooting '+result.fieldStats.predictorAccepted+' verified roots / '+
                  result.fieldStats.shootEvaluations+' trials | '+
                  result.fieldStats.clearGroundSteps+' clear ground steps (no substep search)');
              if(result.fieldStats.refinements!==undefined)
                pieces.push(result.fieldStats.acceptedCells+' qualified adaptive cells | '+
                  result.fieldStats.refinements+' refinements'+
                  (result.fieldStats.adaptiveLimits?' | '+result.fieldStats.adaptiveLimits+' refinement limits':''));
            }
            if(result.groundHorizon!==null&&Number.isFinite(result.groundHorizon))
              pieces.push('optical horizon '+(result.groundHorizon/1000).toFixed(2)+' km');
            else pieces.push('no finite ground horizon resolved');
            if(result.physicalMetricWorld)pieces.push('metric ground grid (physical metres, independent of horizon)');
            if(result.guideSegments!==undefined)pieces.push(result.guideSegments+' physical surface guide pieces');
            if(result.guideSolves!==undefined)pieces.push(result.guideSolves+' ground ray queries'+
              (result.sharedGroundCacheHits?' ('+result.sharedGroundCacheHits+' exact cache hits)':''));
            if(result.guideCulling&&(result.guideCulling.skippedEdges||result.guideCulling.clippedEdges))
              pieces.push('ground-grid drawing limited to '+Math.round(result.guideRenderExtent/1000)+
                ' km ('+result.guideCulling.skippedEdges+' skipped, '+result.guideCulling.clippedEdges+' clipped edges; NOT an optical horizon)');
            status.textContent=(result.budgetExceeded?'PARTIAL (time budget): ':solverFailures?'CHECK SOLVER: ':result.unresolved?'BOUNDARY UNCERTAINTY: ':'')+
              pieces.join(' | ')+'. Physical ground grid/horizon; authored foundation fills, mutual object occlusion pending.';
          }
        } else {
          result = independent.render(g, model);
          if (status) status.textContent = result.warning;
        }
      } catch (error) {
        if (status) status.textContent = (physicalMode ? 'Physical' : 'Independent') + ' failed; Legacy restored: ' + error.message;
        ports.reportError(error);
        // On failure, avoid leaving behind a partly rendered preview.
        g.Reset(true);
        return ports.drawLegacy(g);
      }
    }};
  }
  root.CurvatureLegacyCanvasPresenter={create:create};
}(typeof window==='undefined'?globalThis:window));

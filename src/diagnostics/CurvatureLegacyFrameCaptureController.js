var geometryDiagnosticsExportRequested = false;
var legacyGeometryPreviewRequested = false;
var lastGeometryPreviewScene = null;
function updateLegacyGeometryPreview() {
  if (!lastGeometryPreviewScene || !window.CurvatureScenePreview) return;
  var view = document.getElementById('LegacyGeometryPreviewAxes').value;
  var result = window.CurvatureScenePreview.draw(
    document.getElementById('LegacyGeometryPreviewCanvas'), lastGeometryPreviewScene, view);
  document.getElementById('LegacyGeometryPreviewStatus').textContent =
    result.primitives.length + ' world-space primitives (' + view.toUpperCase() + ' wireframe)';
}
document.getElementById('GeometryDiagnosticsExportButton').addEventListener('click',function(){
  geometryDiagnosticsExportRequested=true;
  legacyGeometryAnalyzeRequested=true;
  legacyFrameAuditRequested=true;
  document.getElementById('LegacyFrameCaptureStatus').textContent='Capturing geometry diagnostics ZIP...';
  graph.Redraw();
});
document.getElementById('LegacyGeometryPreviewAxes').addEventListener('change', updateLegacyGeometryPreview);
document.getElementById('LegacyGeometryPreviewButton').addEventListener('click', function () {
  legacyGeometryPreviewRequested = true;
  legacyGeometryAnalyzeRequested = true;
  legacyFrameAuditRequested = true;
  document.getElementById('LegacyFrameCaptureStatus').textContent = 'Capturing orthographic scene preview...';
  graph.Redraw();
});
document.getElementById('LegacyGeometryAnalyzeButton').addEventListener('click', function () {
  legacyGeometryAnalyzeRequested = true;
  legacyFrameAuditRequested = true;
  document.getElementById('LegacyFrameCaptureStatus').textContent = 'Capturing geometry coverage...';
  graph.Redraw();
});

document.getElementById('LegacyFrameCaptureButton').addEventListener('click', function () {
  var status = document.getElementById('LegacyFrameCaptureStatus');
  legacyFrameAuditRequested = true;
  status.textContent = 'Capturing next DrawModel frame...';
  graph.Redraw();
});

// Phase 4: an explicitly requested ONE-SHOT pass-through capture of a real
// graph DrawFunc invocation. The normal DrawModel remains the only renderer.
var legacyFrameAuditRequested = false;
var legacyGeometryAnalyzeRequested = false;
var legacyFrameAuditInProgress = false;
var previousLegacyFrameCapture = null;
function DrawModelWithOptionalAudit(g) {
  if (!legacyFrameAuditRequested || legacyFrameAuditInProgress ||
      !window.LegacySceneAudit) return DrawModel(g);
  legacyFrameAuditRequested = false;
  legacyFrameAuditInProgress = true;
  var status = document.getElementById('LegacyFrameCaptureStatus');
  try {
    var compareCanvas = document.getElementById('LegacyFrameCompareCanvas').checked;
    var originalPipeline = null, originalPaint = null, originalClippingTrace = [];
    var result = window.LegacySceneAudit.captureFrame(g, function(graph) {
      if (!compareCanvas || !window.LegacyCanvasReplayProbe) return DrawModel(graph);
      originalPaint = window.LegacyCanvasReplayProbe.observePaint(graph.Context2D, function() {
        originalPipeline = window.LegacyCanvasReplayProbe.observePipeline(graph, function() {
          DrawModel(graph);
        }, originalClippingTrace);
      });
    });
    // Geometry export needs the original finished Canvas even when detached replay is off.
    var captureProbe = window.LegacyCanvasReplayProbe;
    var snapshotProbe = compareCanvas && captureProbe;
    var captureEndPixels = (compareCanvas || geometryDiagnosticsExportRequested) && captureProbe ?
      captureProbe.snapshotCanvas(g.Canvas) : null;
    // Convert the completed graph-command trace to a standalone frame.
    // The legacy trace remains available for opt-in export.
    var sceneFrame = window.SceneFrame && result.trace.complete ?
      window.SceneFrame.fromTrace(result.trace, {
        MaxCurveSegments:g.MaxCurveSegments,AngleMeasure:g.AngleMeasure}) : null;
    var analyzeGeometry = legacyGeometryAnalyzeRequested;
    legacyGeometryAnalyzeRequested = false;
    var geometryExtraction = analyzeGeometry && sceneFrame && window.LegacyGeometryExtractor ?
      window.LegacyGeometryExtractor.extract(sceneFrame) : null;
    if (legacyGeometryPreviewRequested) {
      legacyGeometryPreviewRequested = false;
      if (geometryExtraction) {
        lastGeometryPreviewScene = geometryExtraction.scene;
        document.getElementById('LegacyGeometryPreviewPanel').hidden = false;
        updateLegacyGeometryPreview();
      }
    }
    var exportGeometryZip=geometryDiagnosticsExportRequested;
    geometryDiagnosticsExportRequested=false;
    var geometryVerification = geometryExtraction && window.LegacyGeometryFrameVerification &&
      window.JsgMat3 && window.JsgPlane ?
      window.LegacyGeometryFrameVerification.verify(sceneFrame,geometryExtraction.scene,
        {mat:window.JsgMat3,plane:window.JsgPlane}) : null;
    // Isolated dispatch preflight does not assert visual equivalence.
    var preflight = window.LegacyReplayProbe && window.LegacyReplayProbe.preflight(
      sceneFrame || result.trace, window.JsgPolygon);
    var exportCanvasPng = document.getElementById('LegacyFrameExportCanvasPng').checked;
    var beforeReplayPixels = snapshotProbe ? snapshotProbe.snapshotCanvas(g.Canvas) : null;
    var canvasProbe = compareCanvas &&
      window.LegacyCanvasReplayProbe && window.LegacyCanvasReplayProbe.run(
        g, sceneFrame || result.trace, window.JsGraphX3D, window.JsgPolygon, exportCanvasPng);
    // Independent one-factor probes, followed by a replay which restores the
    // explicit frame bootstrap despite deliberately perturbed external state.
    var bootstrapSensitivity = null;
    if (compareCanvas && canvasProbe && canvasProbe.ok &&
        document.getElementById('LegacyFrameBootstrapSensitivity').checked) {
      var baseline = canvasProbe.bootstrap;
      var cases = {
        MaxCurveSegments:{MaxCurveSegments:baseline.MaxCurveSegments === 1 ? 2 : 1},
        AngleMeasure:{AngleMeasure:baseline.AngleMeasure === 'deg' ? 'rad' : 'deg'}
      };
      var probes = {};
      Object.keys(cases).forEach(function(key){
        var variant = window.LegacyCanvasReplayProbe.run(
          g, sceneFrame || result.trace, window.JsGraphX3D, window.JsgPolygon,
          false, {bootstrapOverrides:cases[key]});
        probes[key] = {override:cases[key],ok:variant.ok,
          comparisonToOriginal:variant.comparison || null,
          pixelEvidence:variant.pixelEvidence || null,
          reason:variant.ok ? null : variant.reason,
          detected:!!(canvasProbe.comparison && canvasProbe.comparison.identical === true &&
            variant.comparison && variant.comparison.identical === false)};
      });
      var perturbed = {
        MaxCurveSegments:cases.MaxCurveSegments.MaxCurveSegments,
        AngleMeasure:cases.AngleMeasure.AngleMeasure
      };
      var restored = window.LegacyCanvasReplayProbe.run(
        g, sceneFrame || result.trace, window.JsGraphX3D, window.JsgPolygon,
        false, {bootstrapOverrides:perturbed,restoreFrameBootstrap:true});
      bootstrapSensitivity = {baseline:baseline,probes:probes,
        replayFingerprintComparison:{baseline:canvasProbe.pixelEvidence && canvasProbe.pixelEvidence.replayHash,
          restored:restored.pixelEvidence && restored.pixelEvidence.replayHash,
          hashesEqual:!!(canvasProbe.pixelEvidence && restored.pixelEvidence &&
            canvasProbe.pixelEvidence.replayHash===restored.pixelEvidence.replayHash),
          note:"Matching 32-bit hashes are diagnostic, not proof of pixel identity"},
        restoredFrameBootstrap:{ok:restored.ok,bootstrap:restored.bootstrap || null,
          comparisonToOriginal:restored.comparison || null,
          pixelEvidence:restored.pixelEvidence || null,
          reason:restored.ok ? null : restored.reason}};
    }
    var afterReplayPixels = snapshotProbe ? snapshotProbe.snapshotCanvas(g.Canvas) : null;
    var canvasTimeline = snapshotProbe ? snapshotProbe.snapshotTimeline(
      captureEndPixels,beforeReplayPixels,afterReplayPixels) : null;
    var firstClippingDifference = canvasProbe && canvasProbe.clippingTrace &&
      window.LegacyCanvasReplayProbe.firstClippingDifference(
        originalClippingTrace, canvasProbe.clippingTrace);
    // Keep the first divergent call, not hundreds of repeated state snapshots.
    if (canvasProbe) delete canvasProbe.clippingTrace;
    // Large PNG data URLs must never be embedded in the audit JSON.
    var canvasImages = canvasProbe && canvasProbe.images;
    if (canvasProbe && canvasImages) delete canvasProbe.images;
    var currentCapture = snapshotProbe ? {
      originalCanvas:snapshotProbe.captureFingerprint(captureEndPixels),
      sceneFrame:snapshotProbe.frameFingerprint(sceneFrame)
    } : null;
    var interCapture = currentCapture ? {
      previous:previousLegacyFrameCapture,current:currentCapture,
      originalHashChanged:previousLegacyFrameCapture ?
        previousLegacyFrameCapture.originalCanvas.hash!==currentCapture.originalCanvas.hash : null,
      frameHashChanged:previousLegacyFrameCapture && previousLegacyFrameCapture.sceneFrame && currentCapture.sceneFrame ?
        previousLegacyFrameCapture.sceneFrame.hash!==currentCapture.sceneFrame.hash : null,
      note:'Compares consecutive captures in this page session; does not infer repaint causes'
    } : null;
    if(currentCapture)previousLegacyFrameCapture=currentCapture;
    // Counts are diagnostic; a trace is not a validated replayable scene.
    var report = {
      schema: 'legacy-frame-audit-v2',
      geometryVerification: geometryVerification,
      geometryExtraction: geometryExtraction ? {coverage:geometryExtraction.coverage,
        sceneMetadata:geometryExtraction.scene.metadata,
        primitiveCount:geometryExtraction.scene.primitives.length} : null,
      unsupported: result.trace.unsupported,
      captureComplete: result.trace.complete,
      replayVerified: false,
      isolatedReplayPreflight: preflight || null,
      detachedCanvasReplay: canvasProbe || null,
      originalCanvasTimeline: canvasTimeline,
      interCapture: interCapture,
      bootstrapSensitivity: bootstrapSensitivity,
      originalCanvasPipeline: compareCanvas ? {pipeline:originalPipeline,paintOperations:originalPaint} : null,
      firstClippingDifference: firstClippingDifference || null,
      summary: result.summary,
      notes: [
        'Capture is a pass-through of the active DrawModel invocation',
        'Only allowlisted top-level graph methods are counted',
        'Direct graph property writes, internal graph calls and canvas calls are not captured',
        'Isolated replay preflight checks command dispatch only, not pixels',
        'Detached canvas comparison is experimental and omits uncaptured graph state',
        'No full-state pixel equivalence has been verified'
      ]
    };
    window.LastLegacyFrameAudit = report;
    // Retain the trace for debugging, but only download it with explicit opt-in.
    window.LastLegacyFrameTrace = result.trace;
    window.LastSceneFrame = sceneFrame;
    if (status && geometryExtraction) status.textContent = 'Geometry extraction: ' +
      geometryExtraction.coverage.supported + '/' + geometryExtraction.coverage.total +
      ' commands (' + (100 * geometryExtraction.coverage.supported / Math.max(1,geometryExtraction.coverage.total)).toFixed(2) +
      '%); partial scene, not render coverage. Downloading report.';
    else if (status) status.textContent = 'Captured ' + result.summary.count +
      ' commands; unsupported arguments: ' + result.trace.unsupported.length +
      '. Downloading diagnostic report.';
    if(exportGeometryZip){
      if(!geometryExtraction||!window.CurvatureScenePreview||!window.GeometryDiagnosticsZip)
        throw new Error('Geometry diagnostics dependencies unavailable');
      var scene=geometryExtraction.scene,preview=window.CurvatureScenePreview;
      var images=[],views=['xy','xz','yz','xz-exaggerated','yz-exaggerated'];
      var perspective=window.CurvaturePerspectivePreview;
      if(!perspective)throw new Error('Perspective preview unavailable');
      var cameraSnapshot=perspective.snapshot(g.Camera);
      cameraSnapshot.near=g.CameraClipPlaneDist>0?g.CameraClipPlaneDist:1e-6;
      // Camera diagnostics must use the captured Canvas backing-store viewport,
      // not the fixed-size orthographic diagnostic preview. No image resampling.
      var cameraWidth=captureEndPixels?captureEndPixels.width:900;
      var cameraHeight=captureEndPixels?captureEndPixels.height:500;
      cameraSnapshot.pixelTransform=window.CurvatureCanvasProjection.capture(g,cameraWidth,cameraHeight);
      var scales={};
      views.forEach(function(name){
        var view=name.split('-')[0],factor=name.indexOf('exaggerated')>=0?preview.autoVerticalFactor(scene,view):1;
        var canvas=document.createElement('canvas');canvas.width=900;canvas.height=500;
        preview.draw(canvas,scene,view,factor);
        var encoded=canvas.toDataURL('image/png').split(',')[1];
        var binary=atob(encoded),data=new Uint8Array(binary.length);
        for(var i=0;i<binary.length;i++)data[i]=binary.charCodeAt(i);
        images.push({name:name+'.png',data:data});scales[name]=factor;
      });
      var perspectiveCanvas=document.createElement('canvas');perspectiveCanvas.width=cameraWidth;perspectiveCanvas.height=cameraHeight;
      var perspectiveResult=perspective.draw(perspectiveCanvas,scene,cameraSnapshot);
      var perspectiveBinary=atob(perspectiveCanvas.toDataURL('image/png').split(',')[1]);
      var perspectiveBytes=new Uint8Array(perspectiveBinary.length);
      for(var j=0;j<perspectiveBinary.length;j++)perspectiveBytes[j]=perspectiveBinary.charCodeAt(j);
      images.push({name:'camera-perspective.png',data:perspectiveBytes});
      var filledCanvas=document.createElement('canvas');filledCanvas.width=cameraWidth;filledCanvas.height=cameraHeight;
      var filledResult=window.CurvatureFilledPreview.draw(filledCanvas,scene,cameraSnapshot);
      var filledBinary=atob(filledCanvas.toDataURL('image/png').split(',')[1]);
      var filledBytes=new Uint8Array(filledBinary.length);
      for(var k=0;k<filledBinary.length;k++)filledBytes[k]=filledBinary.charCodeAt(k);
      images.push({name:'camera-filled.png',data:filledBytes});
      var zCanvas=document.createElement('canvas');zCanvas.width=cameraWidth;zCanvas.height=cameraHeight;
      var zResult=window.CurvatureZBufferPreview.draw(zCanvas,scene,cameraSnapshot);
      var zBinary=atob(zCanvas.toDataURL('image/png').split(',')[1]);
      var zBytes=new Uint8Array(zBinary.length);
      for(var z=0;z<zBinary.length;z++)zBytes[z]=zBinary.charCodeAt(z);
      images.push({name:'camera-zbuffer.png',data:zBytes});
      var earCanvas=document.createElement('canvas');earCanvas.width=cameraWidth;earCanvas.height=cameraHeight;
      var topologyEntries=new Map();
      function inspectTopology(entry){
        var id=entry.commandIndex,record=topologyEntries.get(id)||{commandIndex:id};
        function inspectStage(name,points){record[name]=points?window.CurvatureEarClip.inspect(points):{unavailable:true,reason:'vertices behind near plane'};}
        if('preCamera' in entry){inspectStage('cameraXYBeforeNearClip',entry.preCamera);inspectStage('screenBeforeNearClip',entry.preProjected);inspectStage('screenAfterNearClip',entry.postProjected);}
        if('cleanedProjected' in entry){inspectStage('screenAfterCleanup',entry.cleanedProjected);record.failureReason=entry.reason;}
        topologyEntries.set(id,record);
      }
      var earResult=window.CurvatureZBufferPreview.draw(earCanvas,scene,cameraSnapshot,window.CurvatureEarClip.triangulate,inspectTopology);
      var topologyFailures=Array.from(topologyEntries.values()).filter(function(x){return x.failureReason;});
      earResult.statistics.topologyStages={failedPolygons:topologyFailures.length,reportedFailureExamples:topologyFailures.slice(0,25),
        stageDefinition:'cameraXY is camera-plane projection before near clipping; screen stages use perspective division; screen-before-clipping is unavailable when points are behind near plane',
        failureReasonSamplesTruncated:topologyFailures.length>25};
      earResult.statistics.worldTopology=window.CurvatureWorldTopologyAudit.summarize(scene,topologyFailures);
      // GraphX3DX.js: JsGraph.Polygon(mode&2) -> DriverDrawPoly -> ctx.fill().
      // Canvas 2D fill() defaults to nonzero winding; no explicit evenodd rule is passed.
      var contourEntries=window.CurvatureContourDiagnostics.select(scene,topologyFailures,[61,62]);
      earResult.statistics.legacyFillSemantics={source:'GraphX3DX.js JsGraph.Polygon / DriverDrawPoly / JsGraph.Path',
        polygonFillFlag:'mode & 2',canvasCall:'Context2D.fill() without a fillRule argument',
        defaultCanvasFillRule:'nonzero',caveat:'This identifies the Canvas fill rule, not the outcome of any preceding legacy graph clipping'};
      earResult.statistics.contourExamples=contourEntries.map(function(entry){return {commandIndex:entry.commandIndex,mode:entry.mode,
        sourceCommandIndices:entry.sourceCommandIndices,vertices:entry.points.length,image:'contour-command-'+entry.commandIndex+'.png'};});
      contourEntries.forEach(function(entry){
        var contourCanvas=document.createElement('canvas');contourCanvas.width=900;contourCanvas.height=600;
        window.CurvatureContourDiagnostics.render(contourCanvas,entry);
        var binary=atob(contourCanvas.toDataURL('image/png').split(',')[1]),bytes=new Uint8Array(binary.length);
        for(var ci=0;ci<binary.length;ci++)bytes[ci]=binary.charCodeAt(ci);
        images.push({name:'contour-command-'+entry.commandIndex+'.png',data:bytes});
      });
      var earBinary=atob(earCanvas.toDataURL('image/png').split(',')[1]);
      var earBytes=new Uint8Array(earBinary.length);
      for(var e=0;e<earBinary.length;e++)earBytes[e]=earBinary.charCodeAt(e);
      images.push({name:'camera-earclip.png',data:earBytes});
      var strokeCanvas=document.createElement('canvas');strokeCanvas.width=cameraWidth;strokeCanvas.height=cameraHeight;
      var strokeResult=window.CurvatureStrokePreview.draw(strokeCanvas,scene,cameraSnapshot);
      var combinedCanvas=document.createElement('canvas');combinedCanvas.width=cameraWidth;combinedCanvas.height=cameraHeight;
      var combinedResult=window.CurvatureStrokePreview.draw(combinedCanvas,scene,cameraSnapshot,earResult.triangles);
      [[strokeCanvas,'camera-strokes.png'],[combinedCanvas,'camera-combined.png']].forEach(function(item){
        var binary=atob(item[0].toDataURL('image/png').split(',')[1]),bytes=new Uint8Array(binary.length);
        for(var si=0;si<binary.length;si++)bytes[si]=binary.charCodeAt(si);
        images.push({name:item[1],data:bytes});
      });
      var styledCanvas=document.createElement('canvas');styledCanvas.width=cameraWidth;styledCanvas.height=cameraHeight;
      var styledResult=window.CurvatureStyledCombinedPreview.draw(styledCanvas,scene,cameraSnapshot,earResult.triangles);
      var styledBinary=atob(styledCanvas.toDataURL('image/png').split(',')[1]),styledBytes=new Uint8Array(styledBinary.length);
      for(var sci=0;sci<styledBinary.length;sci++)styledBytes[sci]=styledBinary.charCodeAt(sci);
      images.push({name:'camera-styled-combined.png',data:styledBytes});
      var legacyOrderCanvas=document.createElement('canvas');legacyOrderCanvas.width=cameraWidth;legacyOrderCanvas.height=cameraHeight;
      var legacyOrderResult=window.CurvatureLegacyOrderPreview.draw(legacyOrderCanvas,scene,cameraSnapshot,earResult.triangles);
      var legacyOrderBinary=atob(legacyOrderCanvas.toDataURL('image/png').split(',')[1]),legacyOrderBytes=new Uint8Array(legacyOrderBinary.length);
      for(var li=0;li<legacyOrderBinary.length;li++)legacyOrderBytes[li]=legacyOrderBinary.charCodeAt(li);
      images.push({name:'camera-legacy-order.png',data:legacyOrderBytes});
      // Preserve the native reference before comparing; never rescale pixel evidence.
      if(captureEndPixels){
        var originalBinary=atob(captureEndPixels.toDataURL('image/png').split(',')[1]);
        var originalBytes=new Uint8Array(originalBinary.length);
        for(var oi=0;oi<originalBinary.length;oi++)originalBytes[oi]=originalBinary.charCodeAt(oi);
        images.push({name:'camera-original.png',data:originalBytes});
      }
      var pixelComparison={available:false,reason:'Original Canvas capture unavailable',
        originalSize:captureEndPixels?[captureEndPixels.width,captureEndPixels.height]:null,
        independentSize:[combinedCanvas.width,combinedCanvas.height],
        originalImage:captureEndPixels?'camera-original.png':null};
      if(captureEndPixels&&window.CurvaturePixelComparison){
        if(captureEndPixels.width!==combinedCanvas.width||captureEndPixels.height!==combinedCanvas.height){
          pixelComparison={available:false,reason:'Viewport dimensions differ; no resampling performed',
            originalSize:[captureEndPixels.width,captureEndPixels.height],
            independentSize:[combinedCanvas.width,combinedCanvas.height],originalImage:'camera-original.png'};
        }else{
          try{
            var legacyPixels=captureEndPixels.getContext('2d').getImageData(0,0,combinedCanvas.width,combinedCanvas.height).data;
            var independentPixels=combinedCanvas.getContext('2d').getImageData(0,0,combinedCanvas.width,combinedCanvas.height).data;
            var comparison=window.CurvaturePixelComparison.compare(legacyPixels,independentPixels,combinedCanvas.width,combinedCanvas.height);
            var diffCanvas=document.createElement('canvas');diffCanvas.width=combinedCanvas.width;diffCanvas.height=combinedCanvas.height;
            var diffContext=diffCanvas.getContext('2d'),diffImage=diffContext.createImageData(diffCanvas.width,diffCanvas.height);
            diffImage.data.set(comparison.rgba);diffContext.putImageData(diffImage,0,0);
            var diffBinary=atob(diffCanvas.toDataURL('image/png').split(',')[1]),diffBytes=new Uint8Array(diffBinary.length);
            for(var di=0;di<diffBinary.length;di++)diffBytes[di]=diffBinary.charCodeAt(di);
            images.push({name:'camera-foreground-diff.png',data:diffBytes});
            var edgeComparison=window.CurvaturePixelComparison.compareEdges(legacyPixels,independentPixels,combinedCanvas.width,combinedCanvas.height);
            var edgeCanvas=document.createElement('canvas');edgeCanvas.width=combinedCanvas.width;edgeCanvas.height=combinedCanvas.height;
            var edgeContext=edgeCanvas.getContext('2d'),edgeImage=edgeContext.createImageData(edgeCanvas.width,edgeCanvas.height);
            edgeImage.data.set(edgeComparison.rgba);edgeContext.putImageData(edgeImage,0,0);
            var edgeBinary=atob(edgeCanvas.toDataURL('image/png').split(',')[1]),edgeBytes=new Uint8Array(edgeBinary.length);
            for(var ei=0;ei<edgeBinary.length;ei++)edgeBytes[ei]=edgeBinary.charCodeAt(ei);
            images.push({name:'camera-edge-diff.png',data:edgeBytes});
            var styledPixels=styledCanvas.getContext('2d').getImageData(0,0,cameraWidth,cameraHeight).data;
            var styledEdges=window.CurvaturePixelComparison.compareEdges(legacyPixels,styledPixels,cameraWidth,cameraHeight);
            var orderPixels=legacyOrderCanvas.getContext('2d').getImageData(0,0,cameraWidth,cameraHeight).data;
            var orderEdges=window.CurvaturePixelComparison.compareEdges(legacyPixels,orderPixels,cameraWidth,cameraHeight);
            var styledRgba=window.CurvaturePixelComparison.compareRgba(legacyPixels,styledPixels,cameraWidth,cameraHeight);
            var legacyOrderRgba=window.CurvaturePixelComparison.compareRgba(legacyPixels,orderPixels,cameraWidth,cameraHeight);
            var orderDiffCanvas=document.createElement('canvas');orderDiffCanvas.width=cameraWidth;orderDiffCanvas.height=cameraHeight;
            var orderDiffContext=orderDiffCanvas.getContext('2d'),orderDiffImage=orderDiffContext.createImageData(cameraWidth,cameraHeight);
            orderDiffImage.data.set(orderEdges.rgba);orderDiffContext.putImageData(orderDiffImage,0,0);
            var orderDiffBinary=atob(orderDiffCanvas.toDataURL('image/png').split(',')[1]),orderDiffBytes=new Uint8Array(orderDiffBinary.length);
            for(var ld=0;ld<orderDiffBinary.length;ld++)orderDiffBytes[ld]=orderDiffBinary.charCodeAt(ld);
            images.push({name:'camera-legacy-order-edge-diff.png',data:orderDiffBytes});
            pixelComparison=Object.assign({available:true,image:'camera-foreground-diff.png',
              originalImage:'camera-original.png',originalSize:[captureEndPixels.width,captureEndPixels.height],
              independentSize:[combinedCanvas.width,combinedCanvas.height],edgeImage:'camera-edge-diff.png',edgeComparison:edgeComparison.statistics,styledRgbaComparison:styledRgba,legacyOrderRgbaComparison:legacyOrderRgba,styledEdgeComparison:Object.assign({image:'camera-styled-combined.png'},styledEdges.statistics),legacyOrderEdgeComparison:Object.assign({image:'camera-legacy-order-edge-diff.png'},orderEdges.statistics),edgeRegions:window.CurvaturePixelComparison.localizeUnmatchedEdges(edgeComparison.rgba,independentPixels,combinedCanvas.width,combinedCanvas.height)},comparison.statistics);
          }catch(pixelError){pixelComparison={available:false,reason:String(pixelError)};}
        }
      }
      var grayOccluderAudit={available:false,reason:'Original Canvas capture unavailable'};
      if(captureEndPixels&&window.CurvatureGrayOccluderAudit&&window.CurvatureZBufferPreview){
        try{
          var grayReference=captureEndPixels.getContext('2d').getImageData(0,0,cameraWidth,cameraHeight).data;
          var grayDepth=window.CurvatureZBufferPreview.rasterize(earResult.triangles,cameraWidth,cameraHeight);
          var grayResult=window.CurvatureGrayOccluderAudit.analyze(grayReference,grayDepth.owner,earResult.triangles,cameraWidth,cameraHeight);
          grayOccluderAudit=Object.assign({available:true},grayResult.statistics);
          var grayCanvas=document.createElement('canvas');grayCanvas.width=cameraWidth;grayCanvas.height=cameraHeight;
          var grayCtx=grayCanvas.getContext('2d'),grayImage=grayCtx.createImageData(cameraWidth,cameraHeight);
          grayImage.data.set(grayResult.rgba);grayCtx.putImageData(grayImage,0,0);
          var grayBinary=atob(grayCanvas.toDataURL('image/png').split(',')[1]),grayBytes=new Uint8Array(grayBinary.length);
          for(var gi=0;gi<grayBinary.length;gi++)grayBytes[gi]=grayBinary.charCodeAt(gi);
          images.push({name:'camera-gray-fill-coverage.png',data:grayBytes});
        }catch(grayError){grayOccluderAudit={available:false,reason:String(grayError)};}
      }
      var cameraVerification=window.CurvatureCameraVerification.verify(scene,g.Camera,perspective);
      var cameraCanvasVerification=window.CurvatureCameraVerification.verifyPixels(scene,g,cameraSnapshot,perspective,cameraWidth,cameraHeight);
      var visibilityVerification=window.CurvatureVisibilityVerification.run(scene,cameraSnapshot,cameraWidth,cameraHeight);
      // Phase 73: compare an actual completed DrawModel Canvas with a separately
      // generated tower/horizon frame. This is a PARTIAL-scene comparison: the
      // reference includes grids, text and other objects that the candidate omits.
      var independentCompositionComparison={available:false,
        reason:'Independent comparison not attempted',scope:'type-2 towers and polygonal horizon only',
        referenceScope:'complete legacy DrawModel frame; includes unrelated graphics'};
      try {
        if(!captureEndPixels)throw new Error('Completed legacy Canvas capture unavailable');
        if(!window.CurvatureCompositionCapture)throw new Error('Composition capture module unavailable');
        if(CurveApp.showModel!==1&&CurveApp.showModel!==2)
          throw new Error('Select only Globe or only Flat (split view cannot share one viewport)');
        var supportedIndices=window.CurvatureDiagnosticPresets.eligible(CurveApp);
        if(supportedIndices.length!==1 || [0,1].some(function(i){return CurveApp.NObjects[i]>0 && i!==supportedIndices[0];}))
          throw new Error('Current-frame comparison requires one active type-2 tower series; controlled independent presets are exported separately');
        var independentGlobe=CurveApp.showModel===1;
        var compositionResult=window.CurvatureCompositionCapture.capture({
          model:CurveApp,objectIndex:supportedIndices[0],globe:independentGlobe,
          width:cameraWidth,height:cameraHeight,camera:cameraSnapshot,
          captureLegacy:function(){return {canvas:captureEndPixels,camera:cameraSnapshot};},
          createCanvas:function(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c;}
        });
        function addComparisonImage(name,rgba){
          var c=document.createElement('canvas');c.width=cameraWidth;c.height=cameraHeight;
          var ctx=c.getContext('2d'),img=ctx.createImageData(cameraWidth,cameraHeight);
          img.data.set(rgba);ctx.putImageData(img,0,0);
          var binary=atob(c.toDataURL('image/png').split(',')[1]),bytes=new Uint8Array(binary.length);
          for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
          images.push({name:name,data:bytes});
        }
        // Phase 88: second, opt-in full-guide comparison using the same real
        // reference pixels and camera. Keep the established partial export intact.
        var fullCompositionResult=window.CurvatureCompositionCapture.capture({
          model:CurveApp,objectIndex:supportedIndices[0],globe:independentGlobe,
          compositionScope:'full',width:cameraWidth,height:cameraHeight,
          camera:cameraSnapshot,legacyReference:compositionResult.reference,
          createCanvas:function(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c;}
        });
        addComparisonImage('independent-full-composition.png',fullCompositionResult.candidate.rgba);
        addComparisonImage('independent-full-foreground-diff.png',fullCompositionResult.comparison.differenceImages.foreground);
        addComparisonImage('independent-full-edges-diff.png',fullCompositionResult.comparison.differenceImages.edges);
        addComparisonImage('independent-composition.png',compositionResult.candidate.rgba);
        addComparisonImage('independent-foreground-diff.png',compositionResult.comparison.differenceImages.foreground);
        addComparisonImage('independent-edges-diff.png',compositionResult.comparison.differenceImages.edges);
        independentCompositionComparison={available:true,fullComposition:{scope:'full',audit:fullCompositionResult.compositionAudit,renderStatistics:fullCompositionResult.renderStatistics,foreground:fullCompositionResult.comparison.foreground,edges:fullCompositionResult.comparison.edges,rgba:fullCompositionResult.comparison.rgba,geometryForeground:fullCompositionResult.geometryForeground,decorations:fullCompositionResult.decorations&&{frameSegments:fullCompositionResult.decorations.frameSegments,captionCount:fullCompositionResult.decorations.captionCount},caveats:fullCompositionResult.comparison.caveats.concat(fullCompositionResult.limitations),candidateImage:'independent-full-composition.png',foregroundDifferenceImage:'independent-full-foreground-diff.png',edgesDifferenceImage:'independent-full-edges-diff.png'},mode:independentGlobe?'globe':'flat',
          objectIndex:supportedIndices[0],compositionAudit:compositionResult.compositionAudit,
          renderStatistics:compositionResult.renderStatistics,
          foreground:compositionResult.comparison.foreground,
          edges:compositionResult.comparison.edges,rgba:compositionResult.comparison.rgba,
          caveats:compositionResult.comparison.caveats.concat(compositionResult.limitations),
          referenceImage:'camera-original.png',candidateImage:'independent-composition.png',
          foregroundDifferenceImage:'independent-foreground-diff.png',
          edgesDifferenceImage:'independent-edges-diff.png',
          referenceScope:'complete legacy DrawModel frame; includes grids, text and other graphics',
          candidateScope:'only one type-2 tower series and polygonal horizon; comparison metrics do NOT establish full-scene parity'};
      } catch(compositionError){independentCompositionComparison.reason=compositionError.message;}
      // The controlled scene uses legacy Objects 2 (Tower Type 2), not Objects 1.
      // Update the isolated model BEFORE constructing either geometry pipeline.
      // Each preset exports both the historical full-frame comparison and a
      // dedicated tower-only comparison with auxiliary grids/labels omitted.
      var controlledPresets=[];
      if(window.CurvatureDiagnosticPresets&&window.CurvatureControlledLegacyCapture&&
         window.CurvatureControlledCamera&&window.CurvatureCompositionComparison&&
         window.CurvatureZBufferPreview&&window.CurvatureLegacyOrderPreview&&
         window.CurvatureEarClip&&captureProbe){
        window.CurvatureDiagnosticPresets.scenarios(CurveApp).forEach(function(preset){
          var entry={id:preset.id,parameters:preset.parameters,objectIndex:preset.objectIndex,
            referenceAvailable:false,towerOnlyReferenceAvailable:false};
          try {
            var liveModel=CurveApp,controlledModel=preset.model;
            Object.setPrototypeOf(controlledModel,Object.getPrototypeOf(liveModel));
            // BaroModel.Update closes over the live model, not its `this` receiver.
            controlledModel.BaroModel=null;
            controlledModel.Update();
            // These are the values the legacy renderer actually receives,
            // after slider synchronization and derived-geometry recomputation.
            entry.parameters=Object.assign({},entry.parameters,{
              ObjDist:controlledModel.ObjDist[preset.objectIndex],
              ObjDeltaDist:controlledModel.ObjDeltaDist[preset.objectIndex],
              ObjSize:controlledModel.ObjSize[preset.objectIndex],
              geometryRadius:controlledModel.geometryRadius,
              Height:controlledModel.Height});
            var isolatedPrepared=window.CurvatureCompositionComparison.prepare(
              controlledModel,preset.objectIndex,preset.globe,{towersOnly:true});
            function cameraFromGraph(){
              var cam=perspective.snapshot(g.Camera);
              cam.near=g.CameraClipPlaneDist>0?g.CameraClipPlaneDist:1e-6;
              cam.pixelTransform=window.CurvatureCanvasProjection.capture(g,cameraWidth,cameraHeight);
              return cam;
            }
            function snapshotPixels(canvas){
              return canvas.getContext('2d').getImageData(0,0,cameraWidth,cameraHeight).data;
            }
            function addPresetPng(name,canvas){
              var png=atob(canvas.toDataURL('image/png').split(',')[1]),bytes=new Uint8Array(png.length);
              for(var bi=0;bi<png.length;bi++)bytes[bi]=png.charCodeAt(bi);
              images.push({name:name,data:bytes});
            }
            function addPresetRgba(name,rgba){
              var c=document.createElement('canvas');c.width=cameraWidth;c.height=cameraHeight;
              var ctx=c.getContext('2d'),im=ctx.createImageData(cameraWidth,cameraHeight);
              im.data.set(rgba);ctx.putImageData(im,0,0);addPresetPng(name,c);
            }
            var legacyFullCanvas,legacyTowerCanvas,legacyFullCamera,legacyTowerCamera;
            var legacyTowerGeometry=null,legacyTowerGeometryError=null,projectionVerification=null;
            var referenceFrames=window.CurvatureControlledLegacyCapture.capture({
              model:controlledModel,
              install:function(model){CurveApp=model;},
              draw:function(){
                g.Context2D.clearRect(0,0,g.Canvas.width,g.Canvas.height);
                DrawModel(g);
                legacyFullCanvas=captureProbe.snapshotCanvas(g.Canvas);
                legacyFullCamera=cameraFromGraph();
                g.Context2D.clearRect(0,0,g.Canvas.width,g.Canvas.height);
                if(window.LegacySceneAdapter&&window.LegacyGeometryExtractor&&window.SceneFrame){
                  var towerTrace=window.LegacySceneAdapter.record(g,function(graph){
                    DrawModel(graph,{towerOnlyIndex:preset.objectIndex});
                  },{diagnostic:true});
                  if(towerTrace.complete){
                    try {
                      var towerFrame=window.SceneFrame.fromTrace(towerTrace,{
                        MaxCurveSegments:g.MaxCurveSegments,AngleMeasure:g.AngleMeasure});
                      legacyTowerGeometry=window.LegacyGeometryExtractor.extract(towerFrame);
                    }catch(traceError){legacyTowerGeometryError=String(traceError);}
                  }else{
                    legacyTowerGeometryError='Legacy graph trace incomplete: '+JSON.stringify(towerTrace.unsupported);
                  }
                }else{
                  DrawModel(g,{towerOnlyIndex:preset.objectIndex});
                }
                legacyTowerCanvas=captureProbe.snapshotCanvas(g.Canvas);
                legacyTowerCamera=cameraFromGraph();
                if(window.CurvatureCameraVerification){
                  projectionVerification=window.CurvatureCameraVerification.verifyPixels(
                    isolatedPrepared.scene,g,legacyTowerCamera,perspective,cameraWidth,cameraHeight);
                }
              },
              snapshot:function(){return {full:legacyFullCanvas,towers:legacyTowerCanvas,
                fullCamera:legacyFullCamera,towerCamera:legacyTowerCamera};},
              restore:function(){
                CurveApp=liveModel;
                g.Context2D.clearRect(0,0,g.Canvas.width,g.Canvas.height);
                DrawModel(g);
              }
            });
            entry.cameraValidation={
              full:window.CurvatureControlledCamera.verify(referenceFrames.fullCamera,controlledModel,cameraWidth,cameraHeight),
              towers:window.CurvatureControlledCamera.verify(referenceFrames.towerCamera,controlledModel,cameraWidth,cameraHeight)};
            var fullCamera=window.CurvatureControlledCamera.candidate(referenceFrames.fullCamera,controlledModel,cameraWidth,cameraHeight);
            var towerCamera=window.CurvatureControlledCamera.candidate(referenceFrames.towerCamera,controlledModel,cameraWidth,cameraHeight);
            function renderCandidate(options,camera){
              var prepared=window.CurvatureCompositionComparison.prepare(controlledModel,preset.objectIndex,preset.globe,options);
              var canvas=document.createElement('canvas');canvas.width=cameraWidth;canvas.height=cameraHeight;
              var triangles=window.CurvatureZBufferPreview.build(prepared.scene,camera,cameraWidth,cameraHeight,window.CurvatureEarClip.triangulate).triangles;
              var stats=window.CurvatureLegacyOrderPreview.draw(canvas,prepared.scene,camera,triangles);
              return {canvas:canvas,prepared:prepared,stats:stats.statistics};
            }
            function reportPair(referenceCanvas,candidateCanvas,referenceCamera,candidateCamera,basename){
              var comparison=window.CurvatureCompositionComparison.compare(
                {width:cameraWidth,height:cameraHeight,camera:referenceCamera,rgba:snapshotPixels(referenceCanvas)},
                {width:cameraWidth,height:cameraHeight,camera:candidateCamera,rgba:snapshotPixels(candidateCanvas)});
              var foregroundDifferenceImage=basename+'-foreground-diff.png';
              var edgesDifferenceImage=basename+'-edges-diff.png';
              addPresetRgba(foregroundDifferenceImage,comparison.differenceImages.foreground);
              addPresetRgba(edgesDifferenceImage,comparison.differenceImages.edges);
              return {foreground:comparison.foreground,edges:comparison.edges,rgba:comparison.rgba,
                foregroundDifferenceImage:foregroundDifferenceImage,
                edgesDifferenceImage:edgesDifferenceImage,caveats:comparison.caveats};
            }
            var full=renderCandidate({},fullCamera);
            entry.image='controlled-'+preset.id+'.png';
            entry.referenceImage='controlled-'+preset.id+'-legacy.png';
            entry.primitiveCount=full.prepared.scene.primitives.length;
            addPresetPng(entry.image,full.canvas);
            addPresetPng(entry.referenceImage,referenceFrames.full);
            var fullReport=reportPair(referenceFrames.full,full.canvas,referenceFrames.fullCamera,fullCamera,'controlled-'+preset.id);
            Object.assign(entry,fullReport);
            entry.referenceAvailable=true;
            entry.referenceScope='complete legacy DrawModel scene including auxiliary geometry';
            // One click now includes both Globe and Flat full-composition checks
            // for each controlled near/far preset, regardless of the live mode.
            // The controlled reference and candidate share exactly one camera.
            entry.fullComposition={available:false};
            try {
              if(!window.CurvatureCompositionCapture)
                throw new Error('Full composition capture module unavailable');
              var controlledFull=window.CurvatureCompositionCapture.capture({
                model:controlledModel,objectIndex:preset.objectIndex,globe:preset.globe,
                compositionScope:'full',width:cameraWidth,height:cameraHeight,
                camera:fullCamera,
                legacyReference:{width:cameraWidth,height:cameraHeight,
                  camera:referenceFrames.fullCamera,rgba:snapshotPixels(referenceFrames.full)},
                createCanvas:function(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c;}
              });
              var fullBase='controlled-'+preset.id+'-full-composition';
              var fullCandidateName=fullBase+'.png';
              var fullForegroundName=fullBase+'-foreground-diff.png';
              var fullEdgesName=fullBase+'-edges-diff.png';
              addPresetRgba(fullCandidateName,controlledFull.candidate.rgba);
              addPresetRgba(fullForegroundName,controlledFull.comparison.differenceImages.foreground);
              addPresetRgba(fullEdgesName,controlledFull.comparison.differenceImages.edges);
              entry.fullComposition={available:true,mode:preset.globe?'globe':'flat',
                referenceImage:entry.referenceImage,candidateImage:fullCandidateName,
                foregroundDifferenceImage:fullForegroundName,edgesDifferenceImage:fullEdgesName,
                compositionAudit:controlledFull.compositionAudit,
                renderStatistics:controlledFull.renderStatistics,
                foreground:controlledFull.comparison.foreground,
                edges:controlledFull.comparison.edges,rgba:controlledFull.comparison.rgba,
                geometryForeground:controlledFull.geometryForeground,
                decorations:controlledFull.decorations&&{frameSegments:controlledFull.decorations.frameSegments,captionCount:controlledFull.decorations.captionCount},
                cameraMatched:controlledFull.comparison.cameraMatched,
                caveats:controlledFull.comparison.caveats.concat(controlledFull.limitations)};
            }catch(fullPresetError){entry.fullComposition.reason=String(fullPresetError);}

            entry.candidateScope='independent type-2 towers and horizon outlines';
            var isolated=renderCandidate({towersOnly:true},towerCamera);
            var towerBase='controlled-'+preset.id+'-towers';
            var towerReferenceImage=towerBase+'-legacy.png';
            var towerCandidateImage=towerBase+'-independent.png';
            addPresetPng(towerReferenceImage,referenceFrames.towers);
            addPresetPng(towerCandidateImage,isolated.canvas);
            var isolatedReport=reportPair(referenceFrames.towers,isolated.canvas,referenceFrames.towerCamera,towerCamera,towerBase);
            entry.towerOnly=Object.assign({referenceImage:towerReferenceImage,candidateImage:towerCandidateImage,
              primitiveCount:isolated.prepared.scene.primitives.length,
              referenceScope:'legacy Objects 2 / Type 2 + globe mask, no grids, labels or horizon outlines',
              candidateScope:'independent Objects 2 / Type 2 + globe mask, no grids, labels or horizon outlines',
              renderStatistics:isolated.stats},isolatedReport);
            entry.towerOnly.projectionVerification=projectionVerification;
            if(legacyTowerGeometryError)entry.towerOnly.worldGeometryUnavailableReason=legacyTowerGeometryError;
            if(legacyTowerGeometry&&window.CurvatureControlledGeometryParity){
              entry.towerOnly.worldGeometryVerification=window.CurvatureControlledGeometryParity.compare(
                legacyTowerGeometry.scene,isolatedPrepared.scene,isolatedPrepared.ranges);
              entry.towerOnly.legacyExtractionCoverage=legacyTowerGeometry.coverage;
            }
            entry.towerOnlyReferenceAvailable=true;
          }catch(presetError){entry.error=String(presetError);}
          controlledPresets.push(entry);
        });
      }
      var diagnostics={schema:'geometry-diagnostics-v3',audit:report,bounds:preview.bounds3D(scene),
        cameraVerification:cameraVerification,
        cameraCanvasVerification:cameraCanvasVerification,
        visibilityVerification:visibilityVerification,
        independentCompositionComparison:independentCompositionComparison,
        controlledPresets:controlledPresets,
        cameraPerspective:window.CurvaturePerspectiveDiagnostics.summarize(perspectiveResult,cameraSnapshot),
        cameraFilled:filledResult.statistics,
        cameraZBuffer:zResult.statistics,
        cameraEarClip:earResult.statistics,
        cameraStrokes:strokeResult.statistics,
        cameraCombined:combinedResult.statistics,
        cameraStyledCombined:styledResult.statistics,
        cameraLegacyOrder:legacyOrderResult.statistics,
        cameraPixelComparison:pixelComparison,
        cameraGrayOccluderAudit:grayOccluderAudit,
        primitiveTypes:scene.primitives.reduce(function(a,p){a[p.type]=(a[p.type]||0)+1;return a;},{}),
        verticalFactors:scales,notes:['Single captured SceneFrame for all views',
          'Exaggerated views multiply world Z by the reported factor before orthographic projection',
          'Diagnostic images are not equivalent to legacy camera rendering; filled preview uses approximate depth sorting']};
      var zip=window.GeometryDiagnosticsZip.build([{name:'geometry-audit.json',data:JSON.stringify(diagnostics,null,2)}].concat(images));
      var zipUrl=URL.createObjectURL(zip),zipLink=document.createElement('a');
      zipLink.href=zipUrl;zipLink.download='geometry-diagnostics.zip';document.body.appendChild(zipLink);
      zipLink.click();zipLink.remove();setTimeout(function(){URL.revokeObjectURL(zipUrl);},1000);
      if(status)status.textContent='Geometry diagnostics ZIP exported ('+images.length+' PNGs and JSON).';
    } else {
    var blob = new Blob([JSON.stringify(report,null,2)], {type:'application/json'});
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'legacy-frame-audit.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
    if (canvasImages) {
      Object.keys(canvasImages).forEach(function (name) {
        var pngLink = document.createElement('a');
        pngLink.href = canvasImages[name];
        pngLink.download = 'legacy-frame-' + name + '.png';
        document.body.appendChild(pngLink);
        pngLink.click();
        document.body.removeChild(pngLink);
      });
    }
    if (document.getElementById('LegacyFrameExportTrace').checked) {
      var traceBlob = new Blob([JSON.stringify(result.trace)], {type:'application/json'});
      var traceUrl = URL.createObjectURL(traceBlob);
      var traceLink = document.createElement('a');
      traceLink.href = traceUrl;
      traceLink.download = 'legacy-frame-commands.json';
      document.body.appendChild(traceLink);
      traceLink.click();
      document.body.removeChild(traceLink);
      setTimeout(function () { URL.revokeObjectURL(traceUrl); }, 1000);
    }
  } catch (error) {
    if (status) status.textContent = 'Capture failed: ' + error.message +
      '. Redrawing normally.';
    console.error('Legacy frame audit failed:', error);
    // A capture error must not leave the production scene blank.
    DrawModel(g);
  } finally {
    legacyFrameAuditInProgress = false;
  }
}

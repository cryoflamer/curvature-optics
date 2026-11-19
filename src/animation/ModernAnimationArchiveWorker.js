/* Bounded, off-main-thread ZIP assembly for the parallel animation renderer.
 * Frame workers transfer PNG buffers through the controller. Arrival order is
 * arbitrary in memory mode; disk mode receives ordered frames and transfers
 * local ZIP chunks immediately, retaining only row and directory metadata.
 */
'use strict';
importScripts(
  '../ui/modern/ModernExperimentState.js',
  '../ui/modern/ModernCameraHud.js?studio-hud-fix=1&contrast=1',
  '../camera/ModernCameraTelemetry.js',
  '../ui/modern/ModernTargetIndicator.js?target-indicator=1',
  '../ui/modern/ModernExperimentFingerprint.js',
  '../camera/ModernCameraInterpolator.js?spline-core=1',
  'ModernAnimationCompatibility.js',
  'ModernAnimationContract.js',
  'ModernAnimationProject.js?project-fields=reference-narrative-1',
  'ModernAnimationCanvasHud.js?studio-hud-fix=1&contrast=1',
  'ModernReferenceImage.js',
  'ModernAnimationPresentation.js?reference-presentation=1&presentation-resize=1',
  'ModernAnimationPresentationCompositor.js?presentation-hud=1&adaptive-layout=1&topology=1&content-layout=1&guide-labels=1',
  'ModernAnimationFrameExport.js?studio-hud-fix=1&target-indicator=1&spline-parity=1&presentation-png=1&png-project-fields=1&png-stream=1&presentation-hud=1&adaptive-layout=1&topology=1&content-layout=1&guide-labels=1&presentation-video=1'
);
var archive=null;
function reportError(error){
  self.postMessage({type:'error',message:String(error&&error.message||error)});
}
self.onmessage=function(event){
  var data=event&&event.data;
  if(!data)return;
  try{
    if(data.type==='init'){
      if(archive)throw Error('PNG archive worker already initialized');
      var revision=self.CurvatureModernAnimationProject.FIELDS_REVISION;
      if(data.projectFieldsRevision!==undefined&&data.projectFieldsRevision!==revision)
        throw Error('PNG project fields revision mismatch (stale Worker scripts). Reload the page and retry.');
      var plan=self.CurvatureModernAnimationFrameExport.plan(data.project,data);
      if(!Number.isInteger(data.workers)||data.workers<1||data.workers>4)
        throw RangeError('Invalid render worker count');
      archive={plan:plan,workers:data.workers,frames:plan.streaming?null:new Array(plan.timesMs.length),
        stream:plan.streaming?self.CurvatureModernAnimationFrameExport.streamingArchive(plan,data.workers):null,
        count:0,bytes:0,start:performance.now()};
      self.postMessage({type:'ready',total:plan.timesMs.length,projectFieldsRevision:revision,streaming:plan.streaming});
    }else if(data.type==='frame'){
      if(!archive)throw Error('PNG archive worker was not initialized');
      var index=data.index,frame=data.frame,plan=archive.plan;
      if(archive.stream){
        var result=archive.stream.append(index,frame,performance.now()-archive.start);
        self.postMessage({type:'chunk',index:index,parts:result.parts,manifest:result.manifest},
          result.parts.map(function(part){return part.buffer;}));
        if(result.manifest)archive=null;
        return;
      }
      if(!Number.isInteger(index)||index<0||index>=plan.timesMs.length||
        archive.frames[index]!==undefined||!frame||!frame.row||
        frame.row.index!==index||frame.row.timeMs!==plan.timesMs[index]||
        !Array.isArray(frame.entries)||frame.entries.length!==self.CurvatureModernAnimationFrameExport.outputSides(plan).length)
        throw Error('Duplicate, missing or invalid PNG frame index');
      for(var j=0;j<frame.entries.length;j++){
        var entry=frame.entries[j];
        if(!entry||!(entry.data instanceof Uint8Array))
          throw Error('Missing PNG frame bytes');
        archive.bytes+=entry.data.byteLength;
        if(archive.bytes>192*1024*1024)
          throw RangeError('Export would exceed 192 MiB; reduce resolution or frame count');
      }
      archive.frames[index]=frame;
      archive.count++;
      self.postMessage({type:'progress',completed:archive.count,
        total:plan.timesMs.length,timeMs:plan.timesMs[index],
        elapsedMs:performance.now()-archive.start});
      if(archive.count===plan.timesMs.length){
        self.postMessage({type:'packing',total:archive.count});
        var result=self.CurvatureModernAnimationFrameExport.assemble(plan,archive.frames,
          {workers:archive.workers,renderElapsedMs:performance.now()-archive.start});
        self.postMessage({type:'complete',blob:result.blob,manifest:result.manifest,previewBlob:result.previewBlob});
        archive=null;
      }
    }
  }catch(error){reportError(error);}
};

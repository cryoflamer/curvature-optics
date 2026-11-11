/* Bounded, off-main-thread ZIP assembly for the parallel animation renderer.
 * Frame workers transfer PNG buffers through the controller. Arrival order is
 * arbitrary; the manifest and ZIP are always serialized in timestamp order.
 */
'use strict';
importScripts(
  '../ui/modern/ModernExperimentState.js',
  '../ui/modern/ModernExperimentFingerprint.js',
  '../camera/ModernCameraInterpolator.js',
  'ModernAnimationCompatibility.js',
  'ModernAnimationProject.js',
  'ModernAnimationFrameExport.js'
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
      var plan=self.CurvatureModernAnimationFrameExport.plan(data.project,data);
      if(!Number.isInteger(data.workers)||data.workers<1||data.workers>4)
        throw RangeError('Invalid render worker count');
      archive={plan:plan,workers:data.workers,frames:new Array(plan.timesMs.length),
        count:0,bytes:0,start:performance.now()};
      self.postMessage({type:'ready',total:plan.timesMs.length});
    }else if(data.type==='frame'){
      if(!archive)throw Error('PNG archive worker was not initialized');
      var index=data.index,frame=data.frame,plan=archive.plan;
      if(!Number.isInteger(index)||index<0||index>=plan.timesMs.length||
        archive.frames[index]!==undefined||!frame||!frame.row||
        frame.row.index!==index||frame.row.timeMs!==plan.timesMs[index]||
        !Array.isArray(frame.entries)||frame.entries.length!==plan.sides.length)
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
        self.postMessage({type:'complete',blob:result.blob,manifest:result.manifest});
        archive=null;
      }
    }
  }catch(error){reportError(error);}
};

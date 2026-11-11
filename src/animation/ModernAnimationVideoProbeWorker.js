/* Diagnostics only: no video frame rendering, encoding, muxing or download.
 * A dedicated Worker is essential because main-thread support is insufficient.
 */
'use strict';
importScripts('ModernAnimationWebMMuxer.js','ModernAnimationMP4Muxer.js',
  'ModernAnimationVideoCapabilities.js');
self.onmessage=async function(event){
  var data=event&&event.data;
  if(!data||data.type!=='probe')return;
  try{
    var report=await self.CurvatureModernAnimationVideoCapabilities.inspectWorker(self,
      data.settings);
    self.postMessage({type:'video-capabilities',report:report});
  }catch(error){
    self.postMessage({type:'video-capabilities',report:{offscreenCanvas2d:false,
      videoFrame:false,videoEncoder:false,containerMuxerInstalled:false,
      codecs:[{format:'webm',codec:'vp09.00.10.08',supported:false,
        reason:String(error&&error.message||error)},
        {format:'mp4',codec:'avc1.42E01F',supported:false,
        reason:String(error&&error.message||error)}]}});
  }
};

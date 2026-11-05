/* Isolated Legacy playback adapter. This is opt-in (?embed=demos) and does not
 * change the standalone legacy application or any physical computation. */
(function(root){
  'use strict';
  if(!root.location||new URLSearchParams(root.location.search).get('embed')!=='demos'||root.parent===root)return;
  root.document.documentElement.classList.add('legacy-demo-embed');
  var protocol='curvature-demos-v1';
  var activeName='TransLine'; // Deliberately one migrated demo in #140.12.77.
  function send(){
    if(!root.Demos)return;
    root.parent.postMessage({protocol:protocol,type:'state',demo:activeName,
      position:root.Demos.GetCurrPos(),total:root.Demos.GetNStates(),
      playing:root.Demos.IsPlaying()},root.location.origin==='null'?'*':root.location.origin);
  }
  function act(command){
    if(!root.Demos||!root.Demos.IsCurrDemoName(activeName))return;
    switch(command){
      case 'play':
        if(root.Demos.IsPlaying())root.Demos.Stop();
        else root.Demos.Play();
        break;
      case 'previous':root.Demos.Prev(false,false);break;
      case 'next':root.Demos.Next(false,false);break;
      case 'reset':root.Demos.SetDemo(activeName,false,0);break;
      case 'pause':root.Demos.Stop();break;
      case 'status':break;
      default:return;
    }
    if(command==='status'&&root.graph)root.graph.Redraw();
    send();
  }
  root.addEventListener('message',function(event){
    if(event.source!==root.parent||
       (root.location.origin!=='null'&&event.origin!==root.location.origin)||
       !event.data||event.data.protocol!==protocol||event.data.type!=='command')return;
    act(event.data.command);
  });
  root.addEventListener('load',function(){
    // Registration happens after the original legacy startup load callbacks.
    root.setTimeout(function(){
      if(!root.Demos||root.Demos.Find(activeName)<0)return;
      var originalUpdate=root.Demos.UpdateDemoPanels;
      root.Demos.UpdateDemoPanels=function(){
        var result=originalUpdate.apply(this,arguments);
        send();return result;
      };
      root.Demos.SetDemo(activeName,false,0);
      send();
    },0);
  });
}(window));

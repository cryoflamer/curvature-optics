/* Isolated Legacy playback adapter. Opt-in (?embed=demos) within Modern only:
 * the standalone page, model, Canvas and original demo states are unchanged. */
(function(root){
  'use strict';
  if(!root.location||new URLSearchParams(root.location.search).get('embed')!=='demos'||root.parent===root)return;
  root.document.documentElement.classList.add('legacy-demo-embed');
  var protocol='curvature-demos-v1';
  function origin(){return root.location.origin==='null'?'*':root.location.origin;}
  function send(){
    if(!root.Demos||!root.Demos.CurrDemo)return;
    root.parent.postMessage({protocol:protocol,type:'state',demo:root.Demos.CurrDemo.Name,
      position:root.Demos.GetCurrPos(),total:root.Demos.GetNStates(),
      playing:root.Demos.IsPlaying()},origin());
  }
  function sendCatalog(){
    if(!root.Demos||!Array.isArray(root.Demos.DemoList))return;
    root.parent.postMessage({protocol:protocol,type:'catalog',
      names:root.Demos.DemoList.map(function(demo){return demo.Name;})},origin());
  }
  function act(command,name){
    if(!root.Demos||!root.Demos.CurrDemo)return;
    if(command==='select'){
      if(typeof name!=='string'||root.Demos.Find(name)<0)return;
      // SetDemo stops the old animation before activating the new key frames.
      root.Demos.SetDemo(name,false,0);
    }else{
      switch(command){
        case 'play':
          if(root.Demos.IsPlaying())root.Demos.Stop();
          else root.Demos.Play();
          break;
        case 'previous':root.Demos.Prev(false,false);break;
        case 'next':root.Demos.Next(false,false);break;
        case 'reset':root.Demos.SetDemo(root.Demos.CurrDemo.Name,false,0);break;
        case 'pause':root.Demos.Stop();break;
        case 'status':break;
        default:return;
      }
    }
    if(command==='status'&&root.graph)root.graph.Redraw();
    send();
  }
  root.addEventListener('message',function(event){
    if(event.source!==root.parent||
       (root.location.origin!=='null'&&event.origin!==root.location.origin)||
       !event.data||event.data.protocol!==protocol||event.data.type!=='command')return;
    act(event.data.command,event.data.name);
  });
  root.addEventListener('load',function(){
    // Registration happens after the original Legacy startup load callbacks.
    root.setTimeout(function(){
      if(!root.Demos||root.Demos.Find('TransLine')<0)return;
      var originalUpdate=root.Demos.UpdateDemoPanels;
      root.Demos.UpdateDemoPanels=function(){
        var result=originalUpdate.apply(this,arguments);
        send();return result;
      };
      sendCatalog();
      root.Demos.SetDemo('TransLine',false,0);
      send();
    },0);
  });
}(window));

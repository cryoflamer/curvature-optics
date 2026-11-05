/* Minimal controller for one Legacy demo shown inside Modern. No Legacy globals
 * are imported into the physical Scene/Compare application. */
(function(root){
  'use strict';
  var protocol='curvature-demos-v1';
  var frame,ready=false,started=false,active=false;
  function el(id){return root.document.getElementById(id);}
  function status(message){var node=el('ModernDemoStatus');if(node)node.textContent=message;}
  function enable(available){
    ['ModernDemoPlay','ModernDemoPrev','ModernDemoNext','ModernDemoReset'].forEach(function(id){
      var node=el(id);if(node)node.disabled=!available;
    });
  }
  function send(command){
    if(frame&&ready&&frame.contentWindow)
      frame.contentWindow.postMessage({protocol:protocol,type:'command',command:command},
        root.location.origin==='null'?'*':root.location.origin);
  }
  function onState(event){
    if(!frame||event.source!==frame.contentWindow||
       (root.location.origin!=='null'&&event.origin!==root.location.origin))return;
    var data=event.data;
    if(!data||data.protocol!==protocol||data.type!=='state'||data.demo!=='TransLine')return;
    ready=true;
    enable(true);
    var play=el('ModernDemoPlay');if(play)play.textContent=data.playing?'Pause':'Play';
    var count=el('ModernDemoProgress');
    if(count)count.textContent='Step '+(data.position+1)+' / '+data.total;
    status(data.playing?'Playing original Legacy animation.':'Ready · Original Legacy renderer.');
    if(!active)send('pause');
  }
  function init(){
    frame=el('ModernDemoFrame');
    if(!frame)return;
    root.addEventListener('message',onState);
    [['ModernDemoPlay','play'],['ModernDemoPrev','previous'],
      ['ModernDemoNext','next'],['ModernDemoReset','reset']].forEach(function(pair){
      el(pair[0]).addEventListener('click',function(){send(pair[1]);});
    });
    enable(false);
  }
  function activate(){
    active=true;
    if(!frame)return;
    if(!started){
      started=true;
      status('Loading original Legacy transmission-line renderer…');
      frame.src='CurvatureApp.html?ui=legacy&embed=demos';
    }else if(ready)send('status');
  }
  function deactivate(){active=false;send('pause');}
  root.CurvatureModernDemos={init:init,activate:activate,deactivate:deactivate};
}(window));

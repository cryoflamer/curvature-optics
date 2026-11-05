/* Dedicated Demos host DOM port. The historically frozen GraphX3DX and
 * ControlPanelX bundles still call document.writeln; in this isolated host
 * the port redirects those calls to DOM insertions. Standalone Legacy never
 * loads this script and keeps native document.writeln unchanged. */
(function(root){
  'use strict';
  var doc=root.document,original=doc.writeln,installed=false,target=null;
  function setTarget(node){
    if(node!==null&&(!node||typeof node.insertAdjacentHTML!=='function'))
      throw new TypeError('A DOM mount target must support insertAdjacentHTML');
    target=node;
  }
  function writeHTML(html){
    if(typeof html!=='string')throw new TypeError('Legacy DOM markup must be a string');
    if(target){target.insertAdjacentHTML('beforeend',html);return;}
    var anchor=doc.currentScript;
    if(!anchor||typeof anchor.insertAdjacentHTML!=='function')
      throw new Error('A script anchor or explicit DOM mount target is required');
    // beforebegin preserves sequential Render() order for a single script.
    anchor.insertAdjacentHTML('beforebegin',html);
  }
  function install(){
    if(installed)return;
    // Override is strictly host-local: no production bundle or Modern realm
    // is changed. All live writer call sites currently pass one HTML string.
    doc.writeln=function(){
      for(var i=0;i<arguments.length;i++)writeHTML(String(arguments[i]));
    };
    installed=true;
  }
  function uninstall(){
    if(!installed)return;
    doc.writeln=original;
    installed=false;
  }
  root.CurvatureLegacyDemoDomMount={writeHTML:writeHTML,setTarget:setTarget,
    install:install,uninstall:uninstall};
  install();
}(window));

/* GraphX3DX must create its Canvas at parser time via document.writeln.
 * This lightweight second entrypoint creates real independent A/B canvases;
 * all painting still goes through CurvatureMainCanvasRenderer.renderPhysical.
 */
(function(root){
  'use strict';
  var script=document.currentScript;
  var side=script&&script.getAttribute('data-compare-side');
  if(side!=='A'&&side!=='B')throw Error('Compare graph side A/B is required');
  var app=root.CurvatureModernApp;
  if(!app||typeof app.registerCompareGraph!=='function')throw Error('Modern Compare bootstrap is unavailable');
  var graph=root.NewGraphX3D({Id:'ModernCompareGraph'+side,Width:'100%',Height:'66.67%',
    DrawFunc:function(g){app.drawCompare(side,g);},AutoReset:true,AutoClear:true,AutoScalePix:true});
  app.registerCompareGraph(side,graph);
}(window));

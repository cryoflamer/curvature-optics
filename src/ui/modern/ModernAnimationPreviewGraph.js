/* GraphX3DX creates its Canvas with document.writeln at parser time. These
 * preview graphs are bootstrapped off-screen at nonzero width, then attached
 * to the Animation workspace before the first isolated render. */
(function(root){
  'use strict';
  var script=document.currentScript;
  var side=script&&script.getAttribute('data-animation-side');
  if(side!=='A'&&side!=='B')throw Error('Animation graph side A/B required');
  var graph=root.NewGraphX3D({Id:'ModernAnimationGraph'+side,Width:'100%',Height:'66.67%',
    AutoReset:true,AutoClear:true,AutoScalePix:true});
  // This graph is painted explicitly by ModernAnimationPreview.render(), not by
  // GraphX3DX.Draw().  GraphX3DX's own resize watcher can reset the canvas
  // after a successful paused/restore render; an empty DrawFunc then leaves a
  // WHITE viewport while our diagnostics still report the previous frame.
  // No implicit redraw timer may own these independent animation canvases.
  if(graph.ResizeTimer!==null){clearTimeout(graph.ResizeTimer);graph.ResizeTimer=null;}
  graph.CancelPendingDraws();
  if(!root.CurvatureModernAnimationGraphs)root.CurvatureModernAnimationGraphs={};
  root.CurvatureModernAnimationGraphs[side]=graph;
}(window));

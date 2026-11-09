/* GraphX3DX creates its Canvas with document.writeln at parser time. These
 * preview graphs are bootstrapped off-screen at nonzero width, then attached
 * to the Animation workspace before the first isolated render. */
(function(root){
  'use strict';
  var script=document.currentScript;
  var side=script&&script.getAttribute('data-animation-side');
  if(side!=='A'&&side!=='B')throw Error('Animation graph side A/B required');
  var graph=root.NewGraphX3D({Id:'ModernAnimationGraph'+side,Width:'100%',Height:'66.67%',
    DrawFunc:function(){},AutoReset:true,AutoClear:true,AutoScalePix:true});
  if(!root.CurvatureModernAnimationGraphs)root.CurvatureModernAnimationGraphs={};
  root.CurvatureModernAnimationGraphs[side]=graph;
}(window));

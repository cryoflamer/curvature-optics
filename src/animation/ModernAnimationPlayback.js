/* Clock-only controller for deterministic, isolated Camera / Physical Animation playback.
 * The renderer receives owned samples; neither a live experiment nor History
 * is read or written by this controller. Clock time never depends on frame count.
 */
(function(root,factory){
  var projects=root.CurvatureModernAnimationProject;
  if(typeof module==='object'&&module.exports)projects=require('./ModernAnimationProject');
  var api=factory(projects);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationPlayback=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(projects){
  'use strict';
  function create(project){
    var owned=projects.validate(project);
    var duration=projects.totalMs(owned),position=0,startedAt=0,playing=false;
    function clamp(ms){
      if(typeof ms!=='number'||!Number.isFinite(ms))throw RangeError('Invalid playback time');
      return Math.max(0,Math.min(duration,ms));
    }
    function sample(){return projects.sampleAt(owned,position);}
    function status(){return Object.freeze({playing:playing,positionMs:position,durationMs:duration,completed:position>=duration});}
    function start(now){
      if(!Number.isFinite(now))throw RangeError('Invalid playback clock');
      if(!playing){if(position>=duration)position=0;startedAt=now-position;playing=true;}
      return status();
    }
    function tick(now){
      if(!Number.isFinite(now))throw RangeError('Invalid playback clock');
      if(playing){position=clamp(now-startedAt);if(position>=duration)playing=false;}
      return status();
    }
    function pause(now){if(playing)tick(now);playing=false;return status();}
    function seek(ms,now){
      position=clamp(ms);
      if(playing){if(!Number.isFinite(now))throw RangeError('Invalid playback clock');startedAt=now-position;}
      return status();
    }
    function stop(){playing=false;position=0;return status();}
    return Object.freeze({project:owned,sample:sample,status:status,start:start,tick:tick,
      pause:pause,seek:seek,stop:stop});
  }
  // A label of the sampled *physical* value, not an arbitrary transition
  // percentage. Never derive it from the live workspace controls.
  function describeSample(project,sample){
    if(project.mode!=='physical')return '';
    var target=project.target;
    var side=target.scope;
    var spec=side==='scene'?sample.scene:sample.compare[side];
    var prefix=side==='scene'?'Scene':('Model '+side);
    if(target.parameter==='temperatureProfile.gradientKPerKm')
      return prefix+' · Temperature gradient '+spec.temperatureProfile.gradientKPerKm.toFixed(2)+' K/km';
    var flat=side==='scene'?spec.surface.showModel===2:spec.surface==='flat';
    if(flat)return prefix+' · Flat (curvature = 0)';
    var radiusKm=side==='scene'?spec.surface.rEarth/1000:spec.radiusKm;
    return prefix+' · Globe R = '+radiusKm.toLocaleString('en-US',{maximumFractionDigits:1})+' km';
  }
  return Object.freeze({create:create,describeSample:describeSample});
}));

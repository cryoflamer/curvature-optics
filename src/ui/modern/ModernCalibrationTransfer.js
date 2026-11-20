/* Pure calibration -> canonical Modern experiment mapping.
 * No archive writes, rendering, UI, mutation of inputs or fit certification.
 */
(function(root,factory){
  const api=factory(
    root.CurvatureModernCalibrationResult||require('./ModernCalibrationResult'),
    root.CurvatureModernExperimentState||require('./ModernExperimentState'),
    root.CurvatureModernCompareState||require('./ModernCompareState'));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernCalibrationTransfer=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(results,state,compare){
  'use strict';
  const ASPECTS=Object.freeze([1.5,2/3,16/9,9/16]);
  const FLAT_REFERENCE_RADIUS=10007543;
  function aspect(captured,current){
    // Photo dimensions remain exact in origin; never use their ratio as a
    // new Scene aspect or rescale the fitted focal field to compensate.
    return ASPECTS.find(a=>Math.abs(a-captured)<1e-8)??current;
  }
  function capturedPhysics(p){
    // Calibration v1 only captured atmosphere and optional temperature profile.
    // These are the same per-field defaults used by the physical atmosphere.
    // Keep dormant fields deterministic too; do not borrow destination physics.
    return {
      atmosphere:p.atmosphere,
      temperatureProfile:compare.temperatureProfile({
        ...compare.temperatureProfile(),...p.temperatureProfile}),
      occlusionRadius:6371000,
      visibility:compare.visibility(),
      transitionProfile:compare.transitionProfile(),
      inverseProfile:compare.inverseProfile()
    };
  }
  function transfer(record,current,target){
    if(!['Scene','A','B'].includes(target))throw RangeError('Explicit calibration transfer target required');
    const validated=results.validate(record);
    const payload=validated.payload,model=payload.scene.model;
    const next=state.validate(current);
    // Modern v1 has no rFEarth field. It is inactive for Globe Eye-Lvl but
    // affects Flat reference guides. Do not silently claim arbitrary imported
    // constants survive a transfer that may later be used in Compare.
    if(model.rFEarth!==FLAT_REFERENCE_RADIUS)
      throw RangeError('Captured flat reference radius cannot be represented in Modern experiment state');
    const origin=results.origin(validated,target);
    const physics=capturedPhysics(payload.scene.physics);
    next.scene.camera={...origin.baselineCamera,
      deviceRatio:aspect(model.deviceRatio,next.scene.camera.deviceRatio)};
    for(const k of state.OBJECT)next.scene.objects[k]=model[k].slice();
    // Captured v1 archive has no canonical scene title/preset/guide/sequence
    // context. An unrelated outgoing experiment's narrative or camera path
    // must not become part of the new calibration baseline.
    next.scene.preset='custom';
    next.scene.resetPreset='pontchartrain';
    next.scene.title='Calibrated camera';
    next.scene.description='';
    next.scene.showGrid=false;
    next.scene.gridExtentKm=0;
    delete next.cameraPositions;
    delete next.cameraSequence;
    next.display.gpuProbe=false;
    if(target==='Scene'){
      next.scene.surface={showModel:model.showModel,rEarth:model.rEarth};
      Object.assign(next.scene,physics);
      // A new photo-based Scene starts a fresh default Globe/Flat comparison,
      // not the inactive configurations of an unrelated outgoing experiment.
      const pair=compare.initial(model,physics.atmosphere,physics.occlusionRadius,
        physics.temperatureProfile,physics.transitionProfile,physics.inverseProfile);
      next.compare={A:pair.A,B:pair.B,preset:pair.preset,selected:'A'};
      next.display.mode='scene';
    }else{
      // Both sides use the one canonical Scene camera/layout. Only target
      // receives new optical hypothesis; neutral haze is shared presentation.
      next.compare[target]={surface:model.showModel===1?'globe':'flat',
        radiusKm:model.rEarth/1000,...physics};
      next.compare.A.visibility=compare.visibility();
      next.compare.B.visibility=compare.visibility();
      next.compare.preset='custom';
      next.compare.selected=target;
      next.display.mode='compare';
      // Retained Scene optics and alternative-side optics remain untouched.
    }
    next.calibrationOrigin=origin;
    // Includes all destination range limits (e.g. max 200 objects/bank).
    // Reject unsupported values; never clamp camera, objects or radius.
    return state.validate(next);
  }
  return Object.freeze({ASPECTS,transfer});
}));

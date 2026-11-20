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
  // Tiny round-trip tolerance, not a fit-quality or measurement threshold.
  // Integer/enumerated values remain exact. Relative + absolute tolerance
  // accommodates floating point metres <-> kilometres and model.Update.
  function near(a,b){
    return Number.isFinite(a)&&Number.isFinite(b)&&
      Math.abs(a-b)<=1e-9+1e-12*Math.max(Math.abs(a),Math.abs(b));
  }
  function opticalInputs(e,view){
    if(view==='Scene')return {surface:e.scene.surface.showModel===1?'globe':'flat',
      radiusKm:e.scene.surface.rEarth/1000,atmosphere:e.scene.atmosphere,
      temperatureProfile:e.scene.temperatureProfile};
    return e.compare[view];
  }
  function differences(e,baseline,view,target){
    const changed=[],camera=e.scene.camera,expected=baseline.scene.camera;
    for(const key of ['Height','FocalLengthField','Pan','Nick','Roll','CameraEast','CameraNorth'])
      if(!near(camera[key],expected[key]))changed.push('camera.'+key);
    // CompareState.pair forces observer-fixed Eye-Lvl on BOTH clones.
    // The retained Scene aim is a separate input when rendering Scene.
    if(view==='Scene'&&camera.viewcenterHorizon!==3)changed.push('camera.viewcenterHorizon');
    const objects=e.scene.objects,baseObjects=baseline.scene.objects;
    for(let bank=0;bank<2;bank++){
      if(objects.NObjects[bank]!==baseObjects.NObjects[bank])changed.push('objects.NObjects.'+bank);
      if(objects.NObjects[bank]===0&&baseObjects.NObjects[bank]===0)continue;
      for(const k of state.OBJECT){
        if(k==='NObjects')continue;
        if(!(Number.isInteger(objects[k][bank])&&['ObjType','ObjSideType','ObjSizeType'].includes(k)?
          objects[k][bank]===baseObjects[k][bank]:near(objects[k][bank],baseObjects[k][bank])))
          changed.push('objects.'+k+'.'+bank);
      }
    }
    const actual=opticalInputs(e,view),source=opticalInputs(baseline,target);
    if(actual.surface!==source.surface)changed.push('physics.surface');
    else if(actual.surface==='globe'&&!near(actual.radiusKm,source.radiusKm))changed.push('physics.radiusKm');
    if(actual.atmosphere!==source.atmosphere)changed.push('physics.atmosphere');
    else if(source.atmosphere==='temperature-lapse'){
      for(const k of ['temperatureC','pressureHpa','gradientKPerKm'])
        if(!near(actual.temperatureProfile[k],source.temperatureProfile[k]))
          changed.push('physics.temperatureProfile.'+k);
    }
    // Standard and Vacuum do not use editable temperature fields.
    // Visibility, grid, guides, presentation aspect and renderer quality
    // are not fit inputs. The supported archive hypotheses are v1 simple.
    return changed;
  }
  function freezeDeep(v){
    if(v&&typeof v==='object'){Object.values(v).forEach(freezeDeep);Object.freeze(v);}
    return v;
  }
  // record: full immutable result, or null/undefined if unavailable.
  // No asset or storage I/O. Verified result is necessary for a calibrated
  // claim; compact origin alone is an unverified historical assertion.
  // Classification concerns fit INPUTS, never a live renderer RMS.
  function applicability(input,record){
    const e=state.validate(input),origin=e.calibrationOrigin;
    const activeViews=e.display.mode==='scene'?['Scene']:['A','B'];
    const views={};
    function finish(resultStatus,error){
      return freezeDeep({origin:origin??null,resultStatus,error:error??null,
        historicalFit:origin?{...origin.historicalFit,verified:resultStatus==='verified'}:null,
        activeViews,views});
    }
    function unresolved(resultStatus,error){
      for(const view of ['Scene','A','B'])views[view]={associated:origin.target===view,
        status:'unresolved',matchesFit:null,differences:[]};
      return finish(resultStatus,error);
    }
    if(!origin){
      for(const view of ['Scene','A','B'])views[view]={associated:false,status:'ordinary',matchesFit:null,differences:[]};
      return finish('unlinked');
    }
    if(record==null)return unresolved('missing');
    let baseline;
    try{
      const validated=results.validate(record);
      const expected=state.validateCalibrationOrigin(results.origin(validated,origin.target));
      // State normalizes key order and all allowlisted fields. Compare full
      // origin, not simply ID; a shared URL may contain forged metrics/pose.
      if(JSON.stringify(expected)!==JSON.stringify(origin))
        return unresolved('mismatch','Calibration origin does not match archived result');
      // Reuse transfer's exact defaults and supported-domain validation.
      baseline=transfer(validated,e,origin.target);
    }catch(error){return unresolved('invalid',String(error.message||error));}
    for(const view of ['Scene','A','B']){
      const changed=differences(e,baseline,view,origin.target),associated=view===origin.target;
      views[view]={associated,status:associated&&changed.length===0?'calibrated':'derived',
        matchesFit:changed.length===0,differences:changed};
    }
    return finish('verified');
  }
  return Object.freeze({ASPECTS,transfer,applicability});
}));

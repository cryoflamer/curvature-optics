/* Shared saved-snapshot presentation for History and Animation Studio.
 * DOM-only, read-only: no IndexedDB, optical renders or experiment mutations.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernSnapshotPresentation=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function label(entry){
    var f=entry.features||{},mode=f.mode||entry.experiment.display.mode;
    if(mode==='compare'){
      var r=f.relations||{};
      return 'Compare A/B · '+(r.physicsSame?'Identical physics':
        r.geometrySame?'Same geometry':'Different geometry');
    }
    return 'Scene · '+(f.scene&&f.scene.geometry&&f.scene.geometry.kind==='flat'?'Flat':'Globe');
  }
  function displayName(entry){return entry.name&&entry.name.trim()?entry.name:label(entry);}
  // Reusable snapshot identity for History and Animation. Presentation only: never
  // capture a fresh thumbnail or mutate experiment state.
  function frameSummary(entry){
    var e=entry.experiment||{},scene=e.scene||{},camera=scene.camera||{};
    var mode=(entry.features&&entry.features.mode)||(e.display&&e.display.mode)||'scene';
    function model(surface,atmosphere,radius,profile){
      var name=surface==='flat'?'Flat':'Globe';
      if(surface!=='flat'&&Number.isFinite(radius))name+=' R '+Math.round(radius)+' km';
      name+=' · '+(atmosphere||'Atmosphere ?');
      if(atmosphere==='temperature-lapse'&&profile&&Number.isFinite(profile.gradientKPerKm))
        name+=' '+Number(profile.gradientKPerKm.toFixed(2))+' K/km';
      return name;
    }
    var parts=[];
    if(mode==='compare'&&e.compare&&e.compare.A&&e.compare.B){
      ['A','B'].forEach(function(side){
        var p=e.compare[side];
        parts.push(side+': '+model(p.surface,p.atmosphere,p.radiusKm,p.temperatureProfile));
      });
    }else if(mode==='scene'&&scene.surface){
      parts.push(model(scene.surface.showModel===2?'flat':'globe',scene.atmosphere,
        Number(scene.surface.rEarth)/1000,scene.temperatureProfile));
    }else parts.push(label(entry));
    if(Number.isFinite(camera.Height))parts.push('Camera '+Number(camera.Height.toFixed(2))+' m');
    return parts.join(' | ');
  }
  function frameVisual(doc,entry,className){
    var visual=el(doc,'div',className);
    if(entry.thumbnail&&entry.thumbnail.dataUrl){
      var img=el(doc,'img','modern-storyboard-image');
      img.src=entry.thumbnail.dataUrl;img.alt=displayName(entry)+' saved screenshot';
      img.loading='lazy';visual.appendChild(img);
    }else visual.appendChild(el(doc,'span','modern-storyboard-no-image','No screenshot'));
    return visual;
  }
  // The inspector reads the already loaded validated experiment. No IndexedDB
  // query, experiment mutation or optical work is performed while inspecting.
  function number(value,digits){
    return Number(value).toLocaleString('en-US',{maximumFractionDigits:digits===undefined?2:digits});
  }
  function inspect(entry){
    var e=entry.experiment,mode=(entry.features&&entry.features.mode)||e.display.mode;
    function physics(p,geometry){
      var rows=[['Surface',geometry.kind==='flat'?'Flat':
        'Globe · R '+number(geometry.radiusKm,3)+' km']];
      var names={'vacuum':'Vacuum','standard':'Standard',
        'temperature-lapse':'Temperature lapse','profile-transition':'Profile transition',
        'inverse-temperature':'Inverse temperature','inverse-spherical':'Inverse spherical',
        'exponential-occlusion':'Exponential occlusion'};
      rows.push(['Atmosphere',names[p.atmosphere]||p.atmosphere]);
      if(['temperature-lapse','profile-transition','inverse-temperature','exponential-occlusion'].includes(p.atmosphere)){
        var t=p.temperatureProfile;
        if(t){
          rows.push(['Temperature',number(t.temperatureC)+' °C']);
          rows.push(['Gradient',number(t.gradientKPerKm)+' K/km']);
          rows.push(['Pressure',number(t.pressureHpa)+' hPa']);
        }
      }
      if(p.atmosphere==='profile-transition'&&p.transitionProfile)
        rows.push(['Transition',p.transitionProfile.source+' · weight '+number(p.transitionProfile.weight,3)]);
      if(p.atmosphere==='inverse-temperature'&&p.inverseProfile)
        rows.push(['Inversion',p.inverseProfile.source+' · weight '+number(p.inverseProfile.weight,3)]);
      if(['profile-transition','inverse-temperature','inverse-spherical','exponential-occlusion'].includes(p.atmosphere))
        rows.push(['Occlusion radius',number(p.occlusionRadius/1000,3)+' km']);
      return rows;
    }
    var a,b,relations=[];
    if(mode==='compare'){
      a=physics(e.compare.A,{kind:e.compare.A.surface,radiusKm:e.compare.A.radiusKm});
      b=physics(e.compare.B,{kind:e.compare.B.surface,radiusKm:e.compare.B.radiusKm});
      var r=entry.features&&entry.features.relations;
      if(r){
        if(r.physicsSame)relations.push('Identical physical settings');
        else{
          relations.push(r.geometrySame?'Same geometry':'Different geometry');
          relations.push(r.atmosphereSame?'Same atmosphere model':'Different atmosphere models');
          if(!r.refractionSame&&r.atmosphereSame)relations.push('Different refraction parameters');
        }
      }
    }else{
      var s=e.scene;
      a=physics(s,{kind:s.surface.showModel===2?'flat':'globe',radiusKm:s.surface.rEarth/1000});
    }
    var camera=e.scene.camera,objects=e.scene.objects,names=['Bedford marker','measuring rod','ship','transmission tower'];
    var groups=[];
    for(var i=0;i<2;i++){
      var count=objects.NObjects[i];
      if(count)groups.push(number(count,0)+' × '+(names[objects.ObjType[i]]||'object'));
    }
    return {mode:mode,title:displayName(entry),classification:label(entry),
      description:entry.description||'',A:a,B:b,relations:relations,
      shared:[['Camera height',number(camera.Height)+' m'],
        ['Camera orientation',number(camera.Pan)+'° pan · '+number(camera.Nick)+'° nick'],
        ['Objects',groups.join(' · ')||'No objects']]};
  }
  function inspectorMarkup(doc,entry){
    var data=inspect(entry),card=el(doc,'div','modern-history-inspector-inner');
    if(entry.thumbnail&&entry.thumbnail.dataUrl){
      var image=el(doc,'img','modern-history-preview-image');
      image.src=entry.thumbnail.dataUrl;image.alt=data.title+' saved physical render';
      card.appendChild(image);
    }else card.appendChild(el(doc,'p','modern-history-empty',
      'No screenshot saved; physical settings and Restore are still available.'));
    card.appendChild(el(doc,'strong','modern-history-inspector-title',data.title));
    if(data.title!==data.classification)
      card.appendChild(el(doc,'span','modern-history-inspector-kind',data.classification));
    if(data.description)
      card.appendChild(el(doc,'p','modern-history-inspector-description',data.description));
    var stamp=Number(entry.createdAt),when=Number.isFinite(stamp)&&stamp>0?
      new Date(stamp).toLocaleString():null;
    if(when||entry.source)card.appendChild(el(doc,'span','modern-history-inspector-time',
      [when,entry.source].filter(Boolean).join(' · ')));
    var columns=el(doc,'div','modern-history-inspector-columns');
    function column(name,rows){
      var container=el(doc,'section','modern-history-inspector-column');
      container.appendChild(el(doc,'strong','modern-history-inspector-heading',name));
      rows.forEach(function(row){
        var line=el(doc,'div','modern-history-inspector-row');
        line.appendChild(el(doc,'span','',row[0]));
        line.appendChild(el(doc,'strong','',row[1]));
        container.appendChild(line);
      });
      columns.appendChild(container);
    }
    column(data.mode==='compare'?'Model A':'Scene',data.A);
    if(data.B)column('Model B',data.B);
    card.appendChild(columns);
    if(data.relations.length){
      var diff=el(doc,'div','modern-history-inspector-differences');
      diff.appendChild(el(doc,'strong','','A/B comparison'));
      diff.appendChild(el(doc,'span','',data.relations.join(' · ')));
      card.appendChild(diff);
    }
    var shared=el(doc,'div','modern-history-inspector-shared');
    data.shared.forEach(function(row){
      shared.appendChild(el(doc,'span','',row[0]+': '+row[1]));
    });
    card.appendChild(shared);
    return card;
  }
  function el(doc,name,className,text){
    var node=doc.createElement(name);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  return Object.freeze({label:label,displayName:displayName,frameSummary:frameSummary,
    frameVisual:frameVisual,inspect:inspect,inspectorMarkup:inspectorMarkup});
}));

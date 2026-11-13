/* Deterministic labels for Modern snapshots, animation sequences and exported
 * files. Reads only owned scene/project data: no DOM, physics or persistence.
 * User-authored names always take precedence over these suggestions.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernSemanticNaming=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var STYLES=['short','descriptive','technical'];
  var CAMERA=['Height','FocalLengthField','Pan','Nick','Roll','CameraEast','CameraNorth',
    'viewcenterHorizon','deviceRatio'];
  function styleOf(options){var s=options&&options.style;return STYLES.includes(s)?s:'descriptive';}
  function trim(value,max){return String(value||'').replace(/\s+/g,' ').trim().slice(0,max||120);}
  function number(value,digits){
    if(!Number.isFinite(value))return '?';
    var s=String(Number(value.toFixed(digits===undefined?2:digits)));
    return s.replace(/^-/,'−');
  }
  function subject(experiment){
    var scene=experiment&&experiment.scene||{},title=trim(scene.title,44);
    if(/pontchartrain/i.test(title)||scene.preset==='pontchartrain')return 'Pontchartrain';
    if(title&&title!=='Scene')return title;
    return 'Curvature';
  }
  function surface(p,scene){
    var isFlat=scene?p.surface&&p.surface.showModel===2:p.surface==='flat';
    if(isFlat)return 'Flat';
    var radius=scene?p.surface&&p.surface.rEarth/1000:p.radiusKm;
    return Number.isFinite(radius)&&Math.abs(radius-6371)>0.5?
      'Globe R'+number(radius,1)+'km':'Globe';
  }
  function atmosphere(p,style){
    var names={'vacuum':'Vacuum','standard':'Standard','temperature-lapse':'Gradient',
      'profile-transition':'Transition','inverse-temperature':'Inversion',
      'inverse-spherical':'Inverse spherical','exponential-occlusion':'Exponential'};
    var base=names[p.atmosphere]||trim(p.atmosphere,25)||'Atmosphere';
    if(p.atmosphere==='temperature-lapse'&&style!=='short')
      return 'dT/dh '+number(p.temperatureProfile&&p.temperatureProfile.gradientKPerKm,2)+' K/km';
    return base;
  }
  function snapshot(experiment,options){
    var s=styleOf(options),scene=experiment&&experiment.scene||{},camera=scene.camera||{};
    var mode=experiment&&experiment.display&&experiment.display.mode;
    var title=subject(experiment),parts=[title],height=Number.isFinite(camera.Height)?'H '+number(camera.Height)+' m':null;
    if(mode==='compare'&&experiment.compare&&experiment.compare.A&&experiment.compare.B){
      var a=experiment.compare.A,b=experiment.compare.B;
      parts.push('Compare '+surface(a,false)+'/'+surface(b,false));
      if(height)parts.push(height);
      var aText=atmosphere(a,s),bText=atmosphere(b,s);
      var differingProfile=a.atmosphere==='temperature-lapse'&&b.atmosphere==='temperature-lapse'&&
        (a.temperatureProfile.temperatureC!==b.temperatureProfile.temperatureC||
         a.temperatureProfile.pressureHpa!==b.temperatureProfile.pressureHpa);
      if(s!=='short'||a.atmosphere!==b.atmosphere||aText!==bText||differingProfile){
        if(differingProfile){
          aText+=' T0 '+number(a.temperatureProfile.temperatureC)+'°C';
          bText+=' T0 '+number(b.temperatureProfile.temperatureC)+'°C';
        }
        parts.push(aText===bText?aText:'A: '+aText+' · B: '+bText);
      }
    }else{
      parts.push(surface(scene,true));
      if(height)parts.push(height);
      parts.push(atmosphere(scene,s));
    }
    if(s!=='short'){
      if(Number.isFinite(camera.Pan)&&Math.abs(camera.Pan)>=0.01)parts.push('Pan '+number(camera.Pan,2)+'°');
      if(Number.isFinite(camera.Nick)&&Math.abs(camera.Nick)>=0.01)parts.push('Nick '+number(camera.Nick,2)+'°');
      if(s==='technical'){
        if(Number.isFinite(camera.CameraEast)&&Math.abs(camera.CameraEast)>=0.5)
          parts.push('East '+number(camera.CameraEast,1)+' m');
        if(Number.isFinite(camera.CameraNorth)&&Math.abs(camera.CameraNorth)>=0.5)
          parts.push('North '+number(camera.CameraNorth,1)+' m');
      }
    }
    return trim(parts.filter(Boolean).join(' · '),120);
  }
  function changes(frames){
    return CAMERA.filter(function(field){
      var first=frames[0]&&frames[0].value&&frames[0].value[field];
      return frames.some(function(f){return f.value&&f.value[field]!==first;});
    });
  }
  function trajectory(frames,key,unit){
    var first=frames[0].value[key],last=frames[frames.length-1].value[key];
    if(first!==last)return number(first)+' → '+number(last)+unit;
    var numbers=frames.map(function(f){return f.value&&f.value[key];});
    var low=Math.min.apply(null,numbers),high=Math.max.apply(null,numbers);
    return 'range '+number(low)+'–'+number(high)+unit;
  }
  function valueRange(frames,unit){
    var first=frames[0].value,last=frames[frames.length-1].value;
    if(first!==last)return number(first)+' → '+number(last)+unit;
    var low=Math.min.apply(null,frames.map(function(f){return f.value;}));
    var high=Math.max.apply(null,frames.map(function(f){return f.value;}));
    return 'range '+number(low)+'–'+number(high)+unit;
  }
  function animation(project,options){
    var s=styleOf(options),frames=project&&project.keyframes||[],base=project&&project.baseExperiment;
    var title=subject(base),parts=[title];
    if(!frames.length)return trim(title+' · Animation',120);
    var first=frames[0].value,last=frames[frames.length-1].value;
    if(project.mode==='camera'){
      var fields=changes(frames);
      if(fields.length===1&&fields[0]==='Height')
        parts.push('Camera height'+(s==='short'?'':' '+trajectory(frames,'Height',' m')));
      else if(fields.length===1&&fields[0]==='Pan')
        parts.push('Camera pan'+(s==='short'?'':' '+trajectory(frames,'Pan','°')));
      else parts.push('Camera motion · '+frames.length+' keyframes');
    }else if(project.mode==='physical'&&project.target){
      var target=project.target,scope=target.scope;
      if(target.parameter==='surface.curvature'){
        var radius=function(v){return v===0?'Flat':'Globe';};
        parts.push('Earth curvature'+(s==='short'?'':
          first===last&&frames.some(function(f){return f.value!==first;})?
          ' '+radius(first)+' → '+radius(frames.find(function(f){return f.value!==first;}).value)+' → '+radius(last):
          ' '+radius(first)+' → '+radius(last)));
      }else if(target.parameter==='temperatureProfile.gradientKPerKm'){
        parts.push('Temperature gradient'+(s==='short'?'':' '+valueRange(frames,' K/km')));
      }else parts.push('Physical animation');
      if(scope!=='scene')parts.push('Model '+scope);
    }else parts.push('Animation · '+frames.length+' keyframes');
    return trim(parts.join(' · '),120);
  }
  function autoProjectName(name){return !trim(name)||trim(name)==='Animation study';}
  // A slug uses conservative ASCII for broad OS/browser/ZIP compatibility.
  // Cyrillic transliteration avoids empty names for Ukrainian custom titles.
  var latin={'а':'a','б':'b','в':'v','г':'h','ґ':'g','д':'d','е':'e','є':'ie',
    'ж':'zh','з':'z','и':'y','і':'i','ї':'i','й':'i','к':'k','л':'l','м':'m',
    'н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh',
    'ц':'ts','ч':'ch','ш':'sh','щ':'shch','ь':'','ю':'iu','я':'ia','ы':'y','э':'e','ё':'io','ъ':''};
  function slug(name){
    var raw=trim(name,240).toLowerCase().replace(/№/g,'').replace(/−/g,'-');
    raw=Array.from(raw).map(function(ch){return latin[ch]===undefined?ch:latin[ch];}).join('');
    return raw.normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,74).replace(/-+$/,'')||'curvature-animation';
  }
  function exportStem(project){
    var preferred=trim(project&&project.name);
    if(autoProjectName(preferred))preferred=animation(project);
    return slug(preferred);
  }
  function exportNames(project,settings){
    settings=settings||{};
    var format=settings.format||'mp4',kind=settings.kind||'video';
    if(!['mp4','webm','png'].includes(format))throw RangeError('Invalid export format');
    if(!['video','frames'].includes(kind))throw RangeError('Invalid export kind');
    var width=settings.width,height=settings.height,fps=settings.fps;
    if(!Number.isInteger(width)||!Number.isInteger(height)||!Number.isInteger(fps)||
      width<=0||height<=0||fps<=0)throw RangeError('Invalid export dimensions');
    var base=exportStem(project)+'_'+width+'x'+height+'_'+fps+'fps';
    if(kind==='frames')return {filename:base+'_frames.zip'};
    var compare=project&&project.baseExperiment&&project.baseExperiment.display.mode==='compare';
    if(compare&&settings.compareLayout==='separate')return {
      filename:base+'_compare-separate.zip',
      entries:{A:base+'_A.'+format,B:base+'_B.'+format}};
    return {filename:base+(compare?'_compare':'')+'.'+format};
  }
  return Object.freeze({snapshot:snapshot,animation:animation,autoProjectName:autoProjectName,
    slug:slug,exportStem:exportStem,exportNames:exportNames,styles:Object.freeze(STYLES)});
}));

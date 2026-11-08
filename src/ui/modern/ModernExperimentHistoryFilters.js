/* Pure, render-free History search. Uses the active physical features already
 * stored with snapshots; inactive Flat radius and unused atmospheric controls
 * never influence geometric or atmospheric filters.
 */
(function(root,factory){
  var fingerprint=root.CurvatureModernExperimentFingerprint;
  if(!fingerprint&&typeof module==='object'&&module.exports)
    fingerprint=require('./ModernExperimentFingerprint');
  var api=factory(fingerprint);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernExperimentHistoryFilters=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(fingerprint){
  'use strict';
  var MODES=['all','scene','compare'],GEOMETRIES=['any','globe','flat'];
  var ATMOSPHERES=['any','vacuum','standard','temperature-lapse','profile-transition',
    'inverse-temperature','inverse-spherical','exponential-occlusion'];
  var MAX_QUERY=160;
  function choice(value,valid,fallback){return valid.includes(value)?value:fallback;}
  function normalize(input){
    var data=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
    return Object.freeze({
      query:typeof data.query==='string'?data.query.slice(0,MAX_QUERY).trim():'',
      mode:choice(data.mode,MODES,'all'),
      geometry:choice(data.geometry,GEOMETRIES,'any'),
      atmosphere:choice(data.atmosphere,ATMOSPHERES,'any')
    });
  }
  function features(entry){
    return entry.features&&entry.features.scene&&entry.features.compare?
      entry.features:fingerprint.features(entry.experiment);
  }
  function views(feature){
    return feature.mode==='compare'?[feature.compare.A,feature.compare.B]:[feature.scene];
  }
  function searchText(entry,feature){
    var r=feature.relations||{};
    var descriptions=views(feature).map(function(view){
      var geometry=view.geometry||{},refraction=view.refraction||{};
      return [geometry.kind,geometry.kind==='globe'?'radius '+geometry.radiusKm:'',
        refraction.kind,refraction.kind&&refraction.kind.replace(/-/g,' '),
        JSON.stringify(refraction)].join(' ');
    });
    return [entry.name||'',entry.description||'',entry.source||'',
      feature.mode==='compare'?'Compare A/B':'Scene',
      feature.mode==='compare'?(r.physicsSame?'Identical physics':
        r.geometrySame?'Same geometry':'Different geometry'):'',
      feature.mode==='compare'?(r.atmosphereSame?'Same atmosphere':'Different atmosphere'):'',
      descriptions.join(' ')].join(' ').normalize('NFKC').toLocaleLowerCase();
  }
  function matches(entry,options){
    var filters=normalize(options),feature=features(entry);
    if(filters.mode!=='all'&&filters.mode!==feature.mode)return false;
    // Multiple physical choices must match the same A/B side. A Flat model
    // with Standard and a Globe model with Vacuum must not match Flat+Vacuum.
    if(!views(feature).some(function(view){
      return (filters.geometry==='any'||view.geometry&&view.geometry.kind===filters.geometry)&&
        (filters.atmosphere==='any'||view.refraction&&view.refraction.kind===filters.atmosphere);
    }))return false;
    var words=filters.query.normalize('NFKC').toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if(words.length){
      var text=searchText(entry,feature);
      if(!words.every(function(word){return text.includes(word);}))return false;
    }
    return true;
  }
  function filter(entries,options){return entries.filter(function(entry){return matches(entry,options);});}
  function active(options){
    var f=normalize(options);
    return !!(f.query||f.mode!=='all'||f.geometry!=='any'||f.atmosphere!=='any');
  }
  return Object.freeze({normalize:normalize,matches:matches,filter:filter,active:active,
    MODES:MODES,GEOMETRIES:GEOMETRIES,ATMOSPHERES:ATMOSPHERES});
}));

/* Pure filters for named Animation Library projects (v1 and v2).
 * Physical criteria describe the reference/base experiment, not every
 * keyframe; project kind/channel describe the animation contract itself.
 * No IndexedDB writes, rendering, or project normalization/mutation.
 */
(function(root,factory){
  var history=root.CurvatureModernExperimentHistoryFilters;
  if(typeof module==='object'&&module.exports)
    history=require('../ui/modern/ModernExperimentHistoryFilters');
  var api=factory(history);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationLibraryFilters=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(history){
  'use strict';
  var TYPES=['all','camera','physical','experimental'];
  var CHANNELS=['any','curvature','gradient'];
  var COUNTS=['any','zero','one','2-5','6-10','11+'];
  var OBJECT_COUNTS=['any','none','1-5','6+'];
  var DURATIONS=['any','under10','10-30','over30'];
  var SORTS=['updated-desc','updated-asc','name-asc','name-desc'];
  function choice(v,valid,fallback){return valid.includes(v)?v:fallback;}
  function normalize(input){
    var v=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
    var physics=history.normalize({mode:v.baseMode,geometry:v.geometry,
      atmosphere:v.atmosphere,geometryRelation:v.geometryRelation,
      refractionRelation:v.refractionRelation});
    return Object.freeze({
      query:typeof v.query==='string'?v.query.slice(0,160).trim():'',
      type:choice(v.type,TYPES,'all'),channel:choice(v.channel,CHANNELS,'any'),
      baseMode:physics.mode,geometry:physics.geometry,atmosphere:physics.atmosphere,
      geometryRelation:physics.mode==='compare'?physics.geometryRelation:'any',
      refractionRelation:physics.mode==='compare'?physics.refractionRelation:'any',
      frames:choice(v.frames,COUNTS,'any'),objects:choice(v.objects,OBJECT_COUNTS,'any'),
      duration:choice(v.duration,DURATIONS,'any'),
      sort:choice(v.sort,SORTS,'updated-desc')
    });
  }
  function update(filters,key,value){
    var v=Object.assign({},normalize(filters));if(!Object.prototype.hasOwnProperty.call(v,key))return normalize(v);
    v[key]=value;
    if(key==='baseMode'&&value==='scene'){
      v.geometryRelation='any';v.refractionRelation='any';
    }
    if((key==='geometryRelation'||key==='refractionRelation')&&value!=='any'&&v.baseMode!=='compare')
      v.baseMode='compare';
    return normalize(v);
  }
  function channel(project){
    if(project.mode!=='physical')return 'none';
    var target=project.version===2&&project.contract?project.contract.target:project.target;
    if(!target)return 'none';
    if(target.parameter==='surface.curvature')return 'curvature';
    if(target.parameter==='temperatureProfile.gradientKPerKm')return 'gradient';
    return 'none';
  }
  function countMatches(count,range){
    return range==='any'||range==='zero'&&count===0||range==='one'&&count===1||
      range==='2-5'&&count>=2&&count<=5||range==='6-10'&&count>=6&&count<=10||
      range==='11+'&&count>=11;
  }
  function durationMatches(ms,range){
    return range==='any'||range==='under10'&&ms<10000||
      range==='10-30'&&ms>=10000&&ms<=30000||range==='over30'&&ms>30000;
  }
  function reference(entry){
    var p=entry.project;
    return {name:p.name,description:p.description,experiment:p.baseExperiment};
  }
  function matches(entry,input){
    var f=normalize(input),p=entry.project;
    if(f.type!=='all'&&f.type!==p.mode)return false;
    if(f.channel!=='any'&&channel(p)!==f.channel)return false;
    if(!countMatches(p.keyframes.length,f.frames))return false;
    var groups=p.baseExperiment.scene.objects.NObjects;
    var nObjects=groups.reduce(function(sum,n){return sum+n;},0);
    if(f.objects==='none'&&nObjects!==0||f.objects==='1-5'&&!(nObjects>=1&&nObjects<=5)||
       f.objects==='6+'&&nObjects<6)return false;
    var ms=p.keyframes.reduce(function(n,k){return n+k.travelMs+k.holdMs;},0);
    if(!durationMatches(ms,f.duration))return false;
    var ref=reference(entry),physical={mode:f.baseMode,geometry:f.geometry,
      atmosphere:f.atmosphere,geometryRelation:f.geometryRelation,
      refractionRelation:f.refractionRelation,query:''};
    if(!history.matches(ref,physical))return false;
    var words=f.query.normalize('NFKC').toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if(!words.length)return true;
    var text=[p.name,p.description,p.mode==='camera'?'camera motion':
      p.mode==='physical'?'physics transition':'experimental unrestricted',
      channel(p)==='curvature'?'earth curvature':channel(p)==='gradient'?'temperature gradient':'',
      p.version===2?'v2 contract':'v1 legacy'].join(' ').normalize('NFKC').toLocaleLowerCase();
    return words.every(function(word){
      return text.includes(word)||history.matches(ref,Object.assign({},physical,{query:word}));
    });
  }
  function filter(entries,input){
    var f=normalize(input),result=entries.filter(function(e){return matches(e,f);});
    result.sort(function(a,b){
      if(f.sort==='name-asc'||f.sort==='name-desc'){
        var x=a.project.name.toLocaleLowerCase(),y=b.project.name.toLocaleLowerCase();
        var cmp=x<y?-1:x>y?1:0;
        if(cmp)return f.sort==='name-asc'?cmp:-cmp;
      }else{
        var delta=(a.updatedAt-b.updatedAt)*(f.sort==='updated-asc'?1:-1);
        if(delta)return delta;
      }
      return a.id<b.id?-1:a.id>b.id?1:0;
    });
    return result;
  }
  function active(input){var f=normalize(input);
    return !!(f.query||f.type!=='all'||f.channel!=='any'||f.baseMode!=='all'||
      f.geometry!=='any'||f.atmosphere!=='any'||f.geometryRelation!=='any'||
      f.refractionRelation!=='any'||f.frames!=='any'||f.objects!=='any'||f.duration!=='any'||
      f.sort!=='updated-desc');
  }
  return Object.freeze({normalize:normalize,update:update,filter:filter,matches:matches,
    active:active,TYPES:TYPES,CHANNELS:CHANNELS,COUNTS:COUNTS,OBJECT_COUNTS:OBJECT_COUNTS,
    DURATIONS:DURATIONS,SORTS:SORTS});
}));

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
const preferences=require('../src/ui/modern/ModernApplicationPreferences');
function panel(id){
  const start=html.lastIndexOf('<section ',html.indexOf('id="'+id+'"'));
  assert.ok(start>=0,id);
  return html.slice(start,html.indexOf('</section>',start)+10);
}
test('Surface and Atmosphere preserve one physical control per ID inside accessible folds',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,'no DOM control IDs duplicated');
  for(const [section,scope] of [['ModernPanelSurface','Scene'],['ModernComparePanelSurface','Compare']]){
    const content=panel(section);
    assert.match(content,new RegExp('id="Modern'+scope+'SurfaceGeometrySection" data-workspace-section="surface.geometry" open'));
    assert.match(content,new RegExp('id="ModernSurface'+scope+'Summary"'));
  }
  for(const [id,scope,modelId,warningId] of [
    ['ModernPanelAtmosphere','Scene','ModernAtmosphere','ModernAtmosphereInfo'],
    ['ModernComparePanelAtmosphere','Compare','ModernModelAtmosphere','ModernModelAtmosphereInfo']]){
    const content=panel(id);
    const caution=content.indexOf('id="ModernAtmosphere'+scope+'Caution"');
    const folds=content.indexOf('id="Modern'+scope+'AtmosphereProfileSection"');
    assert.ok(content.indexOf('id="'+modelId+'"')<folds,'model chooser never collapses');
    assert.ok(caution>0&&caution<folds,'warnings remain outside collapsed sections');
    for(const suffix of ['Profile','Explanation','Visibility','Shimmer'])
      assert.match(content,new RegExp('id="Modern'+scope+'Atmosphere'+suffix+'Section"'));
    assert.ok(content.indexOf('id="'+warningId+'"')>content.indexOf('id="Modern'+scope+'AtmosphereExplanationSection"'));
    assert.ok(content.includes('aria-label="Help: Model assumptions"'));
    assert.ok(content.includes('aria-label="Help: How this setting works"'));
  }
  assert.match(app,/function updatePhysicsPanelPresentation\(compare\)/);
  assert.match(app,/caution\.hidden=!cautionText/);
  assert.match(app,/profile\.hidden=!\[/);
});

test('new workspace fold settings round-trip independently for Scene and Compare; stale values are rejected',()=>{
  const source={workspace:{sections:{
    'scene.surface.geometry':false,'compare.surface.geometry':true,
    'scene.atmosphere.profile':false,'compare.atmosphere.profile':true,
    'scene.atmosphere.explanation':true,'compare.atmosphere.visibility':true,
    'compare.atmosphere.shimmer':false,'scene.atmosphere.shimmer':'true',
    'scene.atmosphere.doesNotExist':true
  }}};
  const normal=preferences.normalize(source);
  assert.equal(normal.workspace.sections['scene.surface.geometry'],false);
  assert.equal(normal.workspace.sections['compare.surface.geometry'],true);
  assert.equal(normal.workspace.sections['scene.atmosphere.shimmer'],undefined);
  assert.equal(normal.workspace.sections['scene.atmosphere.doesNotExist'],undefined);
  const values=new Map();
  const storage={getItem:key=>values.get(key)||null,setItem:(k,v)=>values.set(k,v)};
  preferences.write(storage,source);
  assert.deepEqual(preferences.read(storage).workspace.sections,normal.workspace.sections);
  assert.equal(preferences.read(storage).opticalQuality,'accurate');
});

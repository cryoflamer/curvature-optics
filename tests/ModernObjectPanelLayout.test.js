'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
const code=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
const prefs=require('../src/ui/modern/ModernApplicationPreferences');

test('Objects has two accessible shared groups, compact descriptions and stable field hosts',()=>{
  const panel=html.slice(html.indexOf('id="ModernPanelObjects"'),html.indexOf('id="ModernPanelDisplay"'));
  assert.match(panel,/aria-label="Help: object groups" data-tip=/);
  assert.doesNotMatch(panel,/Two physical object groups shared by Scene and both Compare models/);
  for(let i=0;i<2;i++){
    assert.match(panel,new RegExp('id="ModernObjectGroup'+i+'" data-workspace-section="objects.group'+(i+1)+'"'));
    assert.match(panel,new RegExp('id="ModernObjectGroupSummary'+i+'"'));
    assert.match(panel,new RegExp('id="ModernObjectFields'+i+'"'));
  }
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(ids.length,new Set(ids).size,'no duplicate static IDs');
});

test('Object editor retains all ten fields per group with optional, nested variation controls',()=>{
  assert.match(code,/fields\.slice\(0,6\)\.map\(field\)/);
  assert.match(code,/fields\.slice\(6\)\.map\(field\)/);
  assert.match(code,/id="ModernObjectVariations/);
  assert.match(code,/data-workspace-section="objects\.group/);
  for(const field of ['NObjects','ObjType','ObjDist','ObjDeltaDist','ObjSidePos','ObjSize',
    'ObjSideType','ObjSideVar','ObjSizeType','ObjSizeVar']){
    assert.match(code,new RegExp("\\['"+field+"','"),field);
  }
  assert.match(code,/bindObjectFields\(\);[\s\S]*bindSettingsTabs\(\);[\s\S]*bindHelp\(\);[\s\S]*bindDisplayPanels\(\);/,
    'all dynamic fields exist before help and workspace-fold binding');
  assert.match(code,/updateObjectGroupSummaries\(\);redraw\(\);return true/);
  assert.match(code,/function updateObjectGroupSummaries\(\)/);
});

test('nested variation folds are persisted independently in Scene and Compare',()=>{
  const input={workspace:{sections:{
    'scene.objects.group1.variations':true,
    'compare.objects.group1.variations':false,
    'scene.objects.group2.variations':false,
    'compare.objects.group2.variations':true,
    'scene.objects.group3.variations':true,
    'compare.objects.group1.variations.bogus':true,
    'scene.objects.group1':'false'
  }}};
  const normalized=prefs.normalize(input).workspace.sections;
  assert.equal(normalized['scene.objects.group1.variations'],true);
  assert.equal(normalized['compare.objects.group1.variations'],false);
  assert.equal(normalized['scene.objects.group2.variations'],false);
  assert.equal(normalized['compare.objects.group2.variations'],true);
  assert.equal(normalized['scene.objects.group3.variations'],undefined);
  assert.equal(normalized['compare.objects.group1.variations.bogus'],undefined);
  assert.equal(normalized['scene.objects.group1'],undefined);
  const values=new Map();
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  assert.equal(prefs.write(storage,input),true);
  assert.deepEqual(prefs.read(storage).workspace.sections,normalized);
  assert.equal(prefs.read(storage).opticalQuality,'accurate');
});

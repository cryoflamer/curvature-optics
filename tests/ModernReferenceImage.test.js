'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const references=require('../src/animation/ModernReferenceImage');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=';
const image=()=>({dataUrl:png,width:1,height:1});
const record=()=>({version:1,id:'causeway-observation',title:'Causeway observation',original:image()});

test('a minimal record preserves the original payload and does not invent provenance',()=>{
  const raw=record(),normalized=references.validate(raw);
  assert.deepEqual(normalized,raw);
  assert.notEqual(normalized,raw);assert.notEqual(normalized.original,raw.original);
  assert.ok(Object.isFrozen(normalized)&&Object.isFrozen(normalized.original));
  raw.original.width=25;assert.equal(normalized.original.width,1);
});
test('known, reported, estimated and unknown acquisition facts are distinct and immutable',()=>{
  const raw={...record(),thumbnail:image(),sourceUrl:' https://example.org/observation ',
    author:' Observer ',license:'Permission pending',description:' Description ',notes:' Crop uncertain ',
    cameraMetadata:{cameraHeightM:{status:'measured',value:10.8,uncertainty:0.15,notes:'survey datum'},
      equivalentFocalLengthMm:{status:'estimated',value:2000,notes:'from framing'},
      captureDate:{status:'reported',value:'2017-12-10'},
      location:{status:'reported',value:'hotel'},heightDatum:{status:'measured',value:'water level'},
      rollDeg:{status:'unknown',notes:'no EXIF'},pitchDeg:{status:'measured',value:0}}};
  const out=references.validate(raw);
  assert.equal(out.author,'Observer');assert.equal(out.sourceUrl,'https://example.org/observation');
  assert.equal(out.cameraMetadata.pitchDeg.value,0);
  assert.equal(out.cameraMetadata.cameraHeightM.uncertainty,0.15);
  assert.equal(out.cameraMetadata.equivalentFocalLengthMm.status,'estimated');
  assert.equal(out.cameraMetadata.captureDate.status,'reported');
  assert.deepEqual(out.cameraMetadata.rollDeg,{status:'unknown',notes:'no EXIF'});
  assert.equal(out.cameraMetadata.headingDeg,undefined);
  assert.ok(Object.isFrozen(out.cameraMetadata)&&Object.isFrozen(out.cameraMetadata.cameraHeightM)&&Object.isFrozen(out.thumbnail));
  raw.cameraMetadata.cameraHeightM.value=88;assert.equal(out.cameraMetadata.cameraHeightM.value,10.8);
  assert.deepEqual(references.validate(JSON.parse(JSON.stringify(out))),out);
});
for(const [label,change] of [
  ['unsupported version',{version:2}],['bad ID',{id:'../image'}],['empty title',{title:'   '}],
  ['model coupling',{atmosphere:'standard'}],['pose coupling',{camera:{Height:3}}],
  ['missing bytes',{original:{width:1,height:1}}],['remote original',{original:{...image(),dataUrl:'https://example.org/a.jpg'}}],
  ['SVG',{original:{...image(),dataUrl:'data:image/svg+xml;base64,PHN2Zz4='}}],
  ['MIME mismatch',{original:{...image(),dataUrl:png.replace('png','jpeg')}}],
  ['invalid alphabet',{original:{...image(),dataUrl:png.replace('iVBO','iVB!')}}],
  ['non-canonical padding',{original:{...image(),dataUrl:png.replace('II=','IJ=')}}],
  ['truncated base64 group',{original:{...image(),dataUrl:png.slice(0,-1)}}],
  ['invalid dimensions',{original:{...image(),width:0}}],
  ['fractional dimensions',{original:{...image(),width:1.5}}],
  ['pixel limit',{original:{...image(),width:20000,height:20000}}],
  ['oversized thumbnail dimensions',{thumbnail:{...image(),height:1025}}],
  ['unsafe link',{sourceUrl:'javascript:alert(1)'}],['credential link',{sourceUrl:'https://user:pass@example.org'}],
  ['backslash URL',{sourceUrl:'https://example.org\\evil'}],
  ['unknown fact with value',{cameraMetadata:{cameraHeightM:{status:'unknown',value:0}}}],
  ['measured with no value',{cameraMetadata:{cameraHeightM:{status:'measured'}}}],
  ['bad status',{cameraMetadata:{cameraHeightM:{status:'certain',value:3}}}],
  ['nonfinite number',{cameraMetadata:{cameraHeightM:{status:'estimated',value:Infinity}}}],
  ['invalid latitude',{cameraMetadata:{latitudeDeg:{status:'reported',value:91}}}],
  ['invalid heading',{cameraMetadata:{headingDeg:{status:'estimated',value:360}}}],
  ['invalid FOV',{cameraMetadata:{horizontalFovDeg:{status:'estimated',value:180}}}],
  ['negative uncertainty',{cameraMetadata:{pitchDeg:{status:'measured',value:0,uncertainty:-1}}}],
  ['text uncertainty',{cameraMetadata:{cameraModel:{status:'reported',value:'Camera',uncertainty:1}}}],
  ['unexpected metadata',{cameraMetadata:{surface:{status:'reported',value:'flat'}}}]
])test('rejects '+label,()=>assert.throws(()=>references.validate({...record(),...change}),RangeError));

test('raster bytes have separate bounded original and thumbnail policies',()=>{
  const dataUrl='data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(references.MAX_THUMBNAIL_BYTES)]).toString('base64');
  const raster={dataUrl,width:1,height:1};
  // Structural validation is not a decoder; this intentionally synthetic payload tests the boundary.
  assert.equal(references.validate({...record(),original:raster}).original.dataUrl,dataUrl);
  assert.throws(()=>references.validate({...record(),thumbnail:raster}),RangeError);
  const tooLarge='data:image/png;base64,'+'A'.repeat(4*Math.ceil((references.MAX_ORIGINAL_BYTES+3)/3));
  assert.throws(()=>references.validate({...record(),original:{...image(),dataUrl:tooLarge}}),RangeError);
});
test('JPEG and WebP signatures supported, no recoding at foundation boundary',()=>{
  // Header fixtures only; the future ingestion decoder checks full validity.
  const jpg='data:image/jpeg;base64,'+Buffer.from([255,216,255,217]).toString('base64');
  const webp='data:image/webp;base64,'+Buffer.from('RIFF\x04\x00\x00\x00WEBP','binary').toString('base64');
  for(const dataUrl of [jpg,webp])assert.equal(references.validate({...record(),original:{...image(),dataUrl}}).original.dataUrl,dataUrl);
});
test('collection rejects duplicate IDs, preserves order, and freezes owned records',()=>{
  const raw=[record(),{...record(),id:'another'}];
  const out=references.validateCollection(raw);
  assert.ok(Object.isFrozen(out));assert.deepEqual(out.map(r=>r.id),['causeway-observation','another']);
  raw.reverse();assert.equal(out[0].id,'causeway-observation');
  assert.throws(()=>references.validateCollection([record(),record()]),/Duplicate reference image ID/);
  assert.throws(()=>references.validateCollection({}),RangeError);
  assert.throws(()=>references.validateCollection(new Array(1)),RangeError);
  assert.deepEqual(references.validateCollection([]),[]);
});
test('classic script is loaded once before the application and works without Node dependencies',()=>{
  const root=path.resolve(__dirname,'..'),file='src/animation/ModernReferenceImage.js';
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  assert.equal(html.split('src="'+file+'"').length-1,1);
  assert.ok(html.indexOf(file)<html.indexOf('src/ui/modern/ModernApp.js'));
  const ctx=vm.createContext({URL,atob});
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
  const result=ctx.CurvatureModernReferenceImage.validate(record());
  assert.equal(result.id,record().id);assert.equal(result.original.dataUrl,png);
});

/* Browser-native Legacy observations. These are not Modern pixel or physics goldens. */
(function(root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LegacyBrowserReferenceExport = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function() {
'use strict';

var SAMPLE_INDICES = {TransLine: [0, 4, 7], Bedford: [0, 3, 6]};
var STABLE_FIELDS = ['Height','FocalLengthField','Roll','Nick','Pan','showModel',
  'rEarth','ObjType','NObjects','ObjDist','ObjDeltaDist'];

function assert(condition, message) { if (!condition) throw new Error(message); }
function nextFrame(win) { return new Promise(function(resolve) { win.requestAnimationFrame(resolve); }); }
function sleep(win, ms) { return new Promise(function(resolve) { win.setTimeout(resolve, ms); }); }
function retryable(message, code) {
  var error = new Error(message);
  error.code = code;
  return error;
}
function describeGraph(win) {
  var g = win.graph, canvas = g && g.Canvas;
  return 'canvas=' + (canvas ? canvas.width + 'x' + canvas.height : 'missing') +
    ', drawing=' + !!(g && g.IsDrawing && g.IsDrawing()) +
    ', drawPending=' + !!(g && g.IsDrawPending && g.IsDrawPending()) +
    ', onLoadFinished=' + (win.xOnLoadFinished === undefined ? 'unknown' : win.xOnLoadFinished);
}
function assertDemoState(win, options) {
  assert(!win.Demos.IsPlaying(), 'Stop the demo animation before capture (demo started moving)');
  if (options.demo) assert(win.Demos.CurrDemo && win.Demos.CurrDemo.Name === options.demo &&
    win.Demos.GetCurrPos() === options.sourceIndex, 'Unexpected Legacy demo state');
  return options.sourceState ? effectiveFields(win.CurveApp, options.sourceState) : null;
}
function hex(bytes) { return Array.from(bytes, function(b) { return b.toString(16).padStart(2, '0'); }).join(''); }
async function sha256(win, bytes) {
  assert(win.crypto && win.crypto.subtle, 'SHA-256 requires a secure context (serve via http://localhost)');
  return hex(new Uint8Array(await win.crypto.subtle.digest('SHA-256', bytes)));
}
function pngBlob(canvas) {
  return new Promise(function(resolve, reject) {
    try { canvas.toBlob(function(blob) {
      if (!blob || blob.type !== 'image/png') reject(new Error('Canvas PNG export failed'));
      else resolve(blob);
    }, 'image/png'); } catch (err) { reject(err); }
  });
}
function effectiveFields(model, sourceState) {
  var fields = {}, changed = [];
  Object.keys(sourceState).forEach(function(key) {
    assert(model[key] !== undefined, 'Missing applied field ' + key);
    fields[key] = JSON.parse(JSON.stringify(model[key]));
    if (JSON.stringify(fields[key]) !== JSON.stringify(sourceState[key])) changed.push(key);
  });
  STABLE_FIELDS.forEach(function(key) {
    if (Object.prototype.hasOwnProperty.call(sourceState, key))
      assert(JSON.stringify(fields[key]) === JSON.stringify(sourceState[key]),
        'Legacy state did not apply ' + key);
  });
  return {effectiveStateFields: fields, recomputedInputFields: changed};
}
function inspectCanvas(canvas) {
  assert(canvas && canvas.id === 'JsGraph1-Canvas' && canvas.isConnected,
    'Original Legacy Canvas unavailable');
  assert(canvas.width >= 16 && canvas.height >= 16, 'Canvas has no useful dimensions');
  var context = canvas.getContext('2d');
  assert(context, 'Original canvas must have a 2D context');
  var rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  var step = Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / 120));
  var colors = new Set(), opaqueSamples = 0;
  for (var y = 0; y < canvas.height; y += step) for (var x = 0; x < canvas.width; x += step) {
    var i = 4 * (y * canvas.width + x);
    if (rgba[i + 3]) opaqueSamples++;
    colors.add(rgba[i] + ',' + rgba[i+1] + ',' + rgba[i+2] + ',' + rgba[i+3]);
  }
  if (!opaqueSamples || colors.size <= 1) throw retryable(
    'Blank or uniform Legacy Canvas refused (' + canvas.width + 'x' + canvas.height +
    ', sampled colors=' + colors.size + ', opaque samples=' + opaqueSamples + ')', 'LEGACY_BLANK_CANVAS');
  var rect = canvas.getBoundingClientRect();
  return {rgba: rgba, width: canvas.width, height: canvas.height,
    cssWidth: rect.width, cssHeight: rect.height,
    sampleDistinctColors: colors.size, opaqueSamples: opaqueSamples};
}
async function capture(win, options) {
  assert(win && win.Demos && win.CurveApp && win.graph && win.graph.Canvas,
    'Legacy page not initialized');
  var engine = win.document.getElementById('MainCanvasRenderer');
  var comparison = win.document.getElementById('OpticsSceneComparison');
  assert(engine && engine.value === 'legacy' && comparison && comparison.value === 'original',
    'Select Legacy canvas and Original (legacy k) before capture');
  if (options.selectDemo) {
    assert(win.Demos.Find(options.demo) >= 0, 'Missing Legacy demo ' + options.demo);
    win.Demos.SetDemo(options.demo, false, options.sourceIndex);
  }
  assertDemoState(win, options);
  await win.document.fonts.ready;
  var attempts = options.maxRenderAttempts || (options.selectDemo ? 6 : 1);
  assert(Number.isInteger(attempts) && attempts >= 1 && attempts <= 10, 'Invalid capture attempt count');
  var pixel, pngBytes, imageSha, rgbaSha, applied, canvas;
  for (var attempt = 1; attempt <= attempts; attempt++) {
    if (options.onAttempt) options.onAttempt(attempt, attempts);
    try {
      // GraphX3DX silently catches DrawFunc exceptions; surface those for diagnostics.
      // The wrapper is temporary and restores the original renderer even on failure.
      var graph = win.graph, drawError = null, originalDraw = graph.DrawFunc;
      assert(typeof originalDraw === 'function', 'Original Legacy renderer unavailable');
      graph.DrawFunc = function() {
        try {return originalDraw.apply(this, arguments);}
        catch (err) {drawError = err; throw err;}
      };
      try {graph.Redraw();} finally {graph.DrawFunc = originalDraw;}
      if (drawError) throw retryable('Legacy renderer threw: ' + (drawError.message || drawError),
        'LEGACY_DRAW_ERROR');
      await nextFrame(win); await nextFrame(win);
      applied = assertDemoState(win, options);
      if ((graph.IsDrawing && graph.IsDrawing()) ||
          (graph.IsDrawPending && graph.IsDrawPending()))
        throw retryable('Legacy graph is still drawing (' + describeGraph(win) + ')',
          'LEGACY_DRAW_PENDING');
      canvas = graph.Canvas;
      pixel = inspectCanvas(canvas);
      var png = await pngBlob(canvas);
      pngBytes = new Uint8Array(await png.arrayBuffer());
      assert(pngBytes[0] === 137 && pngBytes[1] === 80 && pngBytes[2] === 78 &&
        pngBytes[3] === 71, 'Invalid PNG signature');
      imageSha = await sha256(win, pngBytes);
      rgbaSha = await sha256(win, pixel.rgba);
      // Canvas can be resized or redrawn while toBlob/crypto.subtle is pending.
      // Never associate a PNG with metadata from a different frame.
      var after = inspectCanvas(canvas);
      assertDemoState(win, options);
      if (after.width !== pixel.width || after.height !== pixel.height ||
          await sha256(win, after.rgba) !== rgbaSha)
        throw retryable('Canvas changed while encoding PNG (' + describeGraph(win) + ')',
          'LEGACY_FRAME_CHANGED');
      break;
    } catch (err) {
      if (attempt === attempts || !['LEGACY_BLANK_CANVAS','LEGACY_DRAW_PENDING',
        'LEGACY_FRAME_CHANGED'].includes(err.code)) {
        err.message += ' [attempt ' + attempt + '/' + attempts + '; ' + describeGraph(win) + ']';
        throw err;
      }
      // Allow asynchronous initial layout and the GraphX3DX resize loop to settle.
      await sleep(win, 100 + 100 * attempt);
    }
  }
  var fields = win.CurveApp;
  return {pngBytes: pngBytes, record: {
    demo: options.demo || (win.Demos.CurrDemo && win.Demos.CurrDemo.Name) || null,
    sourceIndex: options.sourceIndex === undefined ? null : options.sourceIndex,
    sourceState: options.sourceState || null,
    applied: applied,
    model: {observerHeightMetres: fields.Height, earthRadiusMetres: fields.rEarth,
      legacyRefractionK: fields.refractionCoeff, refractionSync: fields.refractionSync,
      legacyHorizonArcMetres: fields.dHorizon, cameraPanDegrees: fields.Pan,
      cameraNickDegrees: fields.Nick},
    canvas: {width: pixel.width, height: pixel.height, cssWidth: pixel.cssWidth,
      cssHeight: pixel.cssHeight, sampleDistinctColors: pixel.sampleDistinctColors,
      opaqueSamples: pixel.opaqueSamples, pixelSha256: rgbaSha, pngSha256: imageSha},
    userAgent: win.navigator.userAgent, devicePixelRatio: win.devicePixelRatio
  }};
}
function samplePlan(fixture) {
  assert(fixture && fixture.schemaVersion === 1 &&
    fixture.source === 'src/animation/CurvatureDemos.js', 'Unexpected fixture schema');
  assert(Array.isArray(fixture.scenarios) && fixture.scenarios.length === 2, 'Missing fixture groups');
  var items = [];
  fixture.scenarios.forEach(function(group) {
    var indices = SAMPLE_INDICES[group.demo];
    assert(indices && Array.isArray(group.samples) && group.samples.length === 3,
      'Unexpected fixture demo');
    group.samples.forEach(function(sample, n) {
      assert(sample.sourceIndex === indices[n] && sample.state &&
        sample.legacyQuery === '?demo=' + group.demo + '&pos=' + (sample.sourceIndex + 1),
        'Fixture scenario mismatch');
      items.push({demo: group.demo, sourceIndex: sample.sourceIndex,
        sourceState: sample.state, sourceQueryHint: sample.legacyQuery});
    });
  });
  assert(items.length === 6 && fixture.scenarios[0].demo === 'TransLine' &&
    fixture.scenarios[1].demo === 'Bedford', 'Expected six ordered samples');
  return items;
}
function filename(demo, index) {
  return String(demo || 'custom').toLowerCase().replace(/[^a-z0-9-]/g, '-') +
    (index === null || index === undefined ? '-current' : '-state-' + index) + '.canvas.png';
}
async function zipEntries(win, captures, fixtureSha256) {
  assert(win.GeometryDiagnosticsZip, 'GeometryDiagnosticsZip unavailable');
  var files = [], records = [];
  for (var i = 0; i < captures.length; i++) {
    var item = captures[i], name = filename(item.record.demo, item.record.sourceIndex);
    assert(!files.some(function(entry) {return entry.name === name;}), 'Duplicate capture ' + name);
    files.push({name: name, data: item.pngBytes});
    var record = JSON.parse(JSON.stringify(item.record));
    record.files = {canvasPng: name, canvasPngSha256: item.record.canvas.pngSha256};
    records.push(record);
  }
  var manifest = {schemaVersion: 1, evidenceKind: 'Legacy browser Canvas observation only; not Modern parity or physics validation',
    complete: true, captureMode: 'Opera/browser native, original Legacy Canvas',
    fixture: fixtureSha256 ? 'tests/fixtures/legacy-reference-scenarios.json' : null,
    fixtureSha256: fixtureSha256 || null, capturedAt: new Date().toISOString(),
    sampleCount: captures.length, samples: records};
  files.unshift({name: 'manifest.json', data: JSON.stringify(manifest, null, 2) + '\n'});
  return win.GeometryDiagnosticsZip.build(files);
}
function download(win, zip, name) {
  var url = win.URL.createObjectURL(zip), anchor = win.document.createElement('a');
  anchor.href = url; anchor.download = name;
  win.document.body.appendChild(anchor);
  try { anchor.click(); } finally {
    anchor.remove(); win.setTimeout(function() {win.URL.revokeObjectURL(url);}, 60000);
  }
}
async function loadFixture(win) {
  var url = new win.URL('tests/fixtures/legacy-reference-scenarios.json', win.location.href);
  var response = await win.fetch(url.href, {cache: 'no-store'});
  assert(response.ok, 'Could not fetch Legacy fixtures: HTTP ' + response.status + ' (use localhost HTTP)');
  var bytes = new Uint8Array(await response.arrayBuffer());
  var fixture = JSON.parse(new TextDecoder().decode(bytes));
  return {items: samplePlan(fixture), sha: await sha256(win, bytes)};
}
function freshPage(win, timeoutMs) {
  return new Promise(function(resolve, reject) {
    // A fully transparent/hidden iframe can have its painting deferred by Opera.
    // Keep a small, genuinely visible capture preview with a fixed child viewport.
    // This changes no state in the user's own Legacy page.
    var preview = win.document.createElement('div');
    preview.style.cssText = 'position:fixed;right:12px;bottom:12px;width:360px;height:253px;' +
      'overflow:hidden;z-index:2147483000;pointer-events:none;background:white;' +
      'border:1px solid #777;box-shadow:0 2px 8px #666;';
    var heading = win.document.createElement('div');
    heading.textContent = 'Legacy reference capture (temporary preview)';
    heading.style.cssText = 'height:27px;line-height:27px;padding-left:8px;' +
      'font:13px Arial,sans-serif;background:#eee;';
    preview.appendChild(heading);
    var frame = win.document.createElement('iframe');
    frame.title = 'Temporary Legacy reference capture';
    frame.style.cssText = 'position:absolute;left:0;top:28px;width:1440px;height:900px;' +
      'transform:scale(0.25);transform-origin:top left;border:0;background:white;';
    preview.appendChild(frame);
    var done = false, timer = win.setTimeout(function() {
      finish(new Error('Timed out loading Legacy capture frame'));}, timeoutMs);
    function finish(error) {
      if (done) return;
      done = true;
      win.clearTimeout(timer);
      if (error) {preview.remove(); reject(error);} else resolve({frame:frame, preview:preview});
    }
    frame.onerror = function() {finish(new Error('Failed to load Legacy capture frame'));};
    frame.onload = async function() {
      try {
        var child = frame.contentWindow, started = Date.now();
        while (!(child.xOnLoadFinished && child.document.readyState === 'complete' &&
          child.Demos && child.Demos.DemoList && child.Demos.DemoList.length === 9 &&
          child.graph && child.graph.Canvas && child.graph.Canvas.width >= 16 && child.CurveApp)) {
          assert(Date.now() - started < timeoutMs, 'Legacy frame did not initialize');
          await sleep(win, 50);
        }
        finish(null);
      } catch (err) {finish(err);}
    };
    frame.src = new win.URL('CurvatureApp.html', win.location.href).href;
    win.document.body.appendChild(preview);
  });
}
async function exportAll(win, update) {
  var fixture = await loadFixture(win), captures = [];
  for (var i = 0; i < fixture.items.length; i++) {
    var sample = fixture.items[i], page = null;
    var label = (i + 1) + '/6 ' + sample.demo + ' state ' + sample.sourceIndex;
    if (update) update('Loading ' + label);
    try {
      page = await freshPage(win, 20000);
      var child = page.frame.contentWindow;
      var result = await capture(child, {selectDemo: true, demo: sample.demo,
        sourceIndex: sample.sourceIndex, sourceState: sample.sourceState,
        onAttempt: function(attempt, count) {
          if (update) update('Rendering ' + label + ' (attempt ' + attempt + '/' + count + ')');
        }});
      result.record.sourceQueryHint = sample.sourceQueryHint;
      captures.push(result);
      if (update) update('Captured ' + label + ' (' + result.record.canvas.width + 'x' +
        result.record.canvas.height + ', ' + result.record.canvas.sampleDistinctColors + ' sampled colors)');
    } catch (err) {
      throw new Error('Capture ' + label + ' FAILED: ' + (err.message || err));
    } finally {if (page) page.preview.remove();}
  }
  // No partial ZIP is ever published if a frame failed.
  assert(captures.length === 6, 'Incomplete reference set');
  var zip = await zipEntries(win, captures, fixture.sha);
  download(win, zip, 'legacy-browser-references.zip');
  return captures.length;
}
async function exportCurrent(win) {
  var demo = win.Demos && win.Demos.CurrDemo;
  var result = await capture(win, {selectDemo:false, demo:demo ? demo.Name : null,
    sourceIndex: demo ? win.Demos.GetCurrPos() : null});
  var zip = await zipEntries(win, [result], null);
  download(win, zip, 'legacy-current-reference.zip');
  return 1;
}
function install(win) {
  var current = win.document.getElementById('LegacyReferenceCurrentButton');
  var all = win.document.getElementById('LegacyReferenceAllButton');
  var status = win.document.getElementById('LegacyReferenceExportStatus');
  if (!current || !all || !status) return;
  async function run(button, callback) {
    current.disabled = true; all.disabled = true; status.textContent = 'Preparing Legacy reference…';
    try {var count = await callback(function(message) {status.textContent = message;});
      status.textContent = 'Exported ' + count + ' Legacy Canvas reference(s). Check browser downloads.';
    } catch (err) {status.textContent = 'Reference export FAILED: ' + (err.message || err);
      if (win.console) win.console.error(err);
    } finally {current.disabled = false; all.disabled = false;}
  }
  current.addEventListener('click', function() {return run(current, function() {return exportCurrent(win);});});
  all.addEventListener('click', function() {return run(all, function(update) {return exportAll(win, update);});});
}
return {samplePlan: samplePlan, effectiveFields: effectiveFields, inspectCanvas: inspectCanvas,
  filename: filename, capture: capture, zipEntries: zipEntries, exportAll: exportAll,
  exportCurrent: exportCurrent, install: install};
}));

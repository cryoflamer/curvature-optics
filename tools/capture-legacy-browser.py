#!/usr/bin/env python3
"""Capture real Legacy canvas/browser evidence for selected demo states.

Browser output is an *observation*, not an independent physical or Modern oracle.
No screenshots/manifest are marked complete unless all six samples succeed.
"""

import argparse
import base64
import functools
import hashlib
import http.server
import json
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / 'tests/fixtures/legacy-reference-scenarios.json'
VIEWPORT = {'width': 1440, 'height': 900}
DPR = 1


class CaptureError(RuntimeError):
    pass


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def load_samples():
    source_bytes = FIXTURE.read_bytes()
    source = json.loads(source_bytes)
    if source.get('schemaVersion') != 1 or source.get('source') != 'src/animation/CurvatureDemos.js':
        raise CaptureError('Unexpected Legacy fixture schema/source')
    if [s.get('demo') for s in source.get('scenarios', [])] != ['TransLine', 'Bedford']:
        raise CaptureError('Unexpected demo fixture selection')
    samples = []
    for group in source['scenarios']:
        indices = [s.get('sourceIndex') for s in group.get('samples', [])]
        total = group.get('totalStates')
        if not isinstance(total, int) or indices != [0, total // 2, total - 1]:
            raise CaptureError(f'Unexpected or incomplete fixture selection: {group["demo"]}')
        for s in group['samples']:
            if not isinstance(s.get('state'), dict) or not s['state']:
                raise CaptureError('Empty Legacy state fixture')
            samples.append({'demo': group['demo'], 'sourceIndex': s['sourceIndex'],
                            'state': s['state'], 'sourceQueryHint': s['legacyQuery']})
    if len(samples) != 6:
        raise CaptureError('Expected exactly six Legacy states')
    return samples, sha256(source_bytes)


def plan():
    samples, source_hash = load_samples()
    return {
        'schemaVersion': 1,
        'evidenceKind': 'planned browser observations; NOT completed captures or Modern parity',
        'fixture': 'tests/fixtures/legacy-reference-scenarios.json',
        'fixtureSha256': source_hash,
        'captureMode': 'Legacy original Canvas / unmodified Demos.SetDemo with zero-based sourceIndex',
        'viewportCssPixels': VIEWPORT,
        'deviceScaleFactor': DPR,
        'samples': [{'demo': s['demo'], 'sourceIndex': s['sourceIndex']} for s in samples],
    }


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass


class LocalServer(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


# Only a known explicit set of fixture fields is expected not to be recomputed
# by CurveApp.Update(). Other fields are still reported in their applied form.
APPLY_JS = r"""({demo, index, sourceState}) => {
  if (typeof Demos !== 'object' || typeof CurveApp !== 'object' ||
      typeof graph !== 'object' || !graph.Canvas) throw Error('Legacy application not initialized');
  const engine = document.getElementById('MainCanvasRenderer');
  const comparison = document.getElementById('OpticsSceneComparison');
  if (!engine || engine.value !== 'legacy' || !comparison || comparison.value !== 'original')
    throw Error('Legacy original rendering mode is not selected');
  if (Demos.Find(demo) < 0) throw Error('Legacy demo not found: ' + demo);
  // Direct API uses zero-based source indices. The URL ?pos= parameter does NOT.
  Demos.SetDemo(demo, false, index);
  if (!Demos.CurrDemo || Demos.CurrDemo.Name !== demo || Demos.GetCurrPos() !== index ||
      Demos.IsPlaying()) throw Error('Wrong demo frame / animation still running');
  const stable = ['Height','FocalLengthField','Roll','Nick','Pan','showModel',
    'rEarth','ObjType','NObjects','ObjDist','ObjDeltaDist'];
  for (const key of stable) {
    if (Object.prototype.hasOwnProperty.call(sourceState, key) &&
        JSON.stringify(sourceState[key]) !== JSON.stringify(CurveApp[key]))
      throw Error('Original Legacy state did not apply field ' + key);
  }
  const effective = {};
  const changed = [];
  for (const key of Object.keys(sourceState)) {
    const actual = CurveApp[key];
    if (actual === undefined) throw Error('Missing applied Legacy field ' + key);
    effective[key] = JSON.parse(JSON.stringify(actual));
    if (JSON.stringify(actual) !== JSON.stringify(sourceState[key])) changed.push(key);
  }
  // Redraw only the *original* renderer. Do not substitute a headless Canvas model.
  graph.Redraw();
  return {
    effectiveStateFields: effective, recomputedInputFields: changed,
    model: {
      observerHeightMetres: CurveApp.Height, earthRadiusMetres: CurveApp.rEarth,
      legacyRefractionK: CurveApp.refractionCoeff, refractionSync: CurveApp.refractionSync,
      legacyHorizonArcMetres: CurveApp.dHorizon,
      cameraPanDegrees: CurveApp.Pan, cameraNickDegrees: CurveApp.Nick
    }
  };
}"""


CANVAS_JS = r"""async () => {
  if (!window.graph || !graph.Canvas || graph.Canvas.id !== 'JsGraph1-Canvas')
    throw Error('Expected original JsGraph1 Canvas is missing');
  const canvas = graph.Canvas;
  if (!canvas.isConnected || canvas.width < 16 || canvas.height < 16)
    throw Error('Original Canvas is empty or detached');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('Canvas 2D readback unavailable');
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const digest = await crypto.subtle.digest('SHA-256', rgba);
  const pixelSha256 = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  const colors = new Set();
  let opaqueSamples = 0;
  // Evenly sample a known grid; flag blank or non-rendered canvases.
  const step = Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / 120));
  for (let y = 0; y < canvas.height; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      const k = 4 * (y * canvas.width + x);
      if (rgba[k + 3] > 0) opaqueSamples++;
      colors.add(`${rgba[k]},${rgba[k + 1]},${rgba[k + 2]},${rgba[k + 3]}`);
    }
  }
  if (opaqueSamples === 0 || colors.size < 2)
    throw Error('Blank or uniform Canvas: refusing to record a reference');
  const dataUrl = canvas.toDataURL('image/png');
  if (!dataUrl.startsWith('data:image/png;base64,')) throw Error('PNG export failed');
  const rect = canvas.getBoundingClientRect();
  return {
    pngBase64: dataUrl.slice('data:image/png;base64,'.length), pixelSha256,
    width: canvas.width, height: canvas.height,
    cssWidth: rect.width, cssHeight: rect.height,
    sampleDistinctColors: colors.size, opaqueSamples
  };
}"""


def git_commit():
    return subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()


def capture_one(browser, base_url, stage, sample, timeout):
    label = f'{sample["demo"].lower()}-state-{sample["sourceIndex"]}'
    context = browser.new_context(viewport=VIEWPORT, device_scale_factor=DPR,
                                  locale='en-US', timezone_id='UTC', color_scheme='light',
                                  reduced_motion='reduce', service_workers='block')
    page = context.new_page()
    script_errors, local_http_errors = [], []
    page.on('pageerror', lambda err: script_errors.append(str(err)))
    page.on('response', lambda resp: local_http_errors.append(f'{resp.status} {resp.url}')
            if resp.status >= 400 and resp.url.startswith(base_url) else None)
    try:
        page.goto(base_url + '/CurvatureApp.html?ui=legacy', wait_until='load', timeout=timeout)
        page.wait_for_function("""() => typeof Demos === 'object' && Demos.DemoList.length === 9 &&
          typeof CurveApp === 'object' && typeof graph === 'object' && graph.Canvas &&
          graph.Canvas.width > 15 && graph.Canvas.height > 15""", timeout=timeout)
        applied = page.evaluate(APPLY_JS, {'demo': sample['demo'], 'index': sample['sourceIndex'],
                                            'sourceState': sample['state']})
        page.evaluate('() => document.fonts.ready')
        page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        canvas = page.evaluate(CANVAS_JS)
        if script_errors or local_http_errors:
            raise CaptureError(f'Legacy browser errors: {script_errors}; HTTP: {local_http_errors}')
        image = base64.b64decode(canvas.pop('pngBase64'), validate=True)
        if not image.startswith(b'\x89PNG\r\n\x1a\n'):
            raise CaptureError('Invalid Canvas PNG bytes')
        canvas_name = label + '.canvas.png'
        page_name = label + '.page.png'
        (stage / canvas_name).write_bytes(image)
        page.screenshot(path=str(stage / page_name), full_page=True, animations='disabled', timeout=timeout)
        if script_errors or local_http_errors:
            raise CaptureError(f'Legacy browser errors after screenshot: {script_errors}; HTTP: {local_http_errors}')
        page_image = (stage / page_name).read_bytes()
        if not page_image.startswith(b'\x89PNG\r\n\x1a\n'):
            raise CaptureError('Invalid page screenshot')
        return {
            'demo': sample['demo'], 'sourceIndex': sample['sourceIndex'],
            'sourceState': sample['state'], 'sourceQueryHint': sample['sourceQueryHint'],
            'applied': applied, 'effectiveCanvas': canvas,
            'devicePixelRatio': page.evaluate('window.devicePixelRatio'),
            'userAgent': page.evaluate('navigator.userAgent'),
            'files': {
                'canvasPng': canvas_name, 'canvasPngSha256': sha256(image),
                'fullPagePng': page_name, 'fullPagePngSha256': sha256(page_image),
            },
        }
    finally:
        context.close()


def capture(out, browser_path, timeout):
    samples, fixture_hash = load_samples()
    target = Path(out).expanduser().resolve()
    if target.exists():
        raise CaptureError(f'Output path already exists (will not overwrite): {target}')
    target.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=f'.{target.name}-incomplete-', dir=target.parent))
    try:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise CaptureError('Install Python Playwright first (pip install playwright)') from exc
        server = LocalServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            base = f'http://127.0.0.1:{server.server_address[1]}'
            with sync_playwright() as p:
                opts = {'headless': True, 'args': ['--no-sandbox']}
                if browser_path:
                    opts['executable_path'] = browser_path
                browser = p.chromium.launch(**opts)
                try:
                    records = [capture_one(browser, base, stage, s, timeout) for s in samples]
                    manifest = {
                        'schemaVersion': 1,
                        'complete': True,
                        'evidenceKind': 'Observed Legacy original canvas and page pixels; NOT independent physical truth or Modern parity',
                        'sourceGitCommit': git_commit(), 'fixtureSha256': fixture_hash,
                        'runtimeSourceSha256': {str(p.relative_to(ROOT)): sha256(p.read_bytes()) for p in [
                            ROOT / 'CurvatureApp.html', ROOT / 'src/animation/CurvatureDemos.js',
                            ROOT / 'src/app/CurvatureModel.js', ROOT / 'src/app/CurvatureAppRuntime.js',
                        ]},
                        'browserVersion': browser.version,
                        'operatingSystem': platform.platform(),
                        'viewportCssPixels': VIEWPORT, 'deviceScaleFactor': DPR,
                        'renderSelection': {'MainCanvasRenderer': 'legacy', 'OpticsSceneComparison': 'original'},
                        'samples': records,
                    }
                finally:
                    browser.close()
        finally:
            server.shutdown()
            server.server_close()
        (stage / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False, allow_nan=False) + '\n', encoding='utf-8')
        # Completed manifest is published only after six verified browser captures.
        if len(manifest['samples']) != 6:
            raise CaptureError('Incomplete Legacy browser capture')
        stage.rename(target)
    except Exception:
        shutil.rmtree(stage, ignore_errors=True)
        raise
    return target


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--plan', action='store_true', help='show six expected captures without starting a browser')
    ap.add_argument('--out', help='new output directory; must not already exist')
    ap.add_argument('--browser', default=None, help='Chromium executable (optional if Playwright browser installed)')
    ap.add_argument('--timeout', type=int, default=30000, help='per-page timeout in milliseconds')
    args = ap.parse_args(argv)
    try:
        if args.plan:
            print(json.dumps(plan(), indent=2, ensure_ascii=False))
            return 0
        if not args.out:
            raise CaptureError('Supply --out or use --plan to inspect the capture contract')
        if args.timeout < 1000:
            raise CaptureError('--timeout must be at least 1000 ms')
        target = capture(args.out, args.browser, args.timeout)
        print(f'Completed six Legacy browser captures: {target / "manifest.json"}')
        return 0
    except Exception as exc:
        print(f'Legacy browser capture FAILED: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())

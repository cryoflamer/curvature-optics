#!/usr/bin/env python3
"""Headless browser smoke check; captures actual tower 21 rendering and JS errors."""
import argparse
import functools
import http.server
import json
import pathlib
import socketserver
import threading
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='optics-check', help='Output directory for screenshots and report')
    ap.add_argument('--browser', default=None, help='Chromium executable path')
    ap.add_argument('--timeout', type=int, default=90000, help='Atmosphere calculation timeout (ms)')
    args = ap.parse_args()
    out = pathlib.Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    server = Server(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    errors = []
    report = {}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, executable_path=args.browser or '/usr/bin/chromium', args=['--no-sandbox'])
            page = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_address[1]}/CurvatureApp.html?ui=legacy', wait_until='load', timeout=30000)
            page.locator('#TransLineButton').click()
            page.evaluate("""() => {
                const el = document.querySelector('#OpticsMethod');
                if (el) { el.value = 'ray-tracing'; el.dispatchEvent(new Event('change',{bubbles:true})); }
            }""")
            # Use the application's actual mode selection if its control has a different id.
            page.evaluate("""() => { if (window.CurveApp) { CurveApp.opticsMode='ray-tracing'; CurveApp.showModel=1; if(window.graph) graph.Redraw(); } }""")
            page.locator('#InverseVacuumTower21').check()
            page.screenshot(path=str(out/'vacuum.png'), full_page=True)
            page.locator('#InverseAtmosphereTower21').click()
            page.wait_for_function("""() => {
                const s = document.querySelector('#InverseAtmosphereTower21Status');
                return s && /calculated|failed|error|no |missing/i.test(s.textContent);
            }""", timeout=args.timeout)
            page.screenshot(path=str(out/'atmosphere.png'), full_page=True)
            report['status'] = page.locator('#InverseAtmosphereTower21Status').inner_text()
            report['mode'] = page.evaluate('CurveApp.opticsMode')
            report['canvas_count'] = page.locator('canvas').count()
            browser.close()
    except Exception as exc:
        errors.append(f'browser check: {exc}')
    finally:
        server.shutdown()
    report['errors'] = errors
    (out/'report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if errors or not report.get('status', '').lower().startswith('calculated'):
        raise SystemExit(1)

if __name__ == '__main__':
    main()

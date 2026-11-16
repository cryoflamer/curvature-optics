"""Real-browser smoke checks for the statically served Modern application.

Run from the repository root after installing the Playwright Python package and
its Chromium browser: python -m unittest discover -s tests/browser -v

Every test receives an isolated browser context (including IndexedDB). A local
HTTP server is started inside the test process; no external host is required.
On failure, browser traces, screenshots and console diagnostics are saved under
browser-artifacts/ for the CI artifact uploader.
"""

from __future__ import annotations

import http.server
import os
from pathlib import Path
import threading
import unittest

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / 'browser-artifacts'


class QuietStaticHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format, *args):  # noqa: A002
        pass


class ModernBrowserSmoke(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), QuietStaticHandler)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.base_url = f'http://127.0.0.1:{cls.server.server_port}/CurvatureModern.html'
        cls.playwright = sync_playwright().start()
        launch = {'headless': True}
        if os.environ.get('CURVATURE_CHROMIUM_EXECUTABLE'):
            launch['executable_path'] = os.environ['CURVATURE_CHROMIUM_EXECUTABLE']
        cls.browser = cls.playwright.chromium.launch(**launch)

    @classmethod
    def tearDownClass(cls):
        try:
            cls.browser.close()
            cls.playwright.stop()
        finally:
            cls.server.shutdown()
            cls.server.server_close()
            cls.server_thread.join(timeout=5)

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 1440, 'height': 900})
        self.context.tracing.start(screenshots=True, snapshots=True, sources=True)
        self.page = self.context.new_page()
        self.page.set_default_timeout(15000)
        self.console = []
        self.page.on('pageerror', lambda exc: self.console.append('PAGE ERROR: ' + str(exc)))
        self.page.on('console', lambda msg: self.console.append(f'console.{msg.type}: {msg.text}'))
        self.page.on('requestfailed', lambda req: self.console.append('REQUEST FAILED: ' + req.url))

    def tearDown(self):
        failed = self._outcome is not None and not self._outcome.success
        if failed:
            ARTIFACTS.mkdir(parents=True, exist_ok=True)
            name = self.id().rsplit('.', 1)[-1]
            (ARTIFACTS / f'{name}.log').write_text('\n'.join(self.console), encoding='utf-8')
            try:
                self.page.screenshot(path=str(ARTIFACTS / f'{name}.png'), full_page=True, timeout=5000)
            except Exception as exc:
                (ARTIFACTS / f'{name}-screenshot-error.txt').write_text(str(exc), encoding='utf-8')
            try:
                self.context.tracing.stop(path=str(ARTIFACTS / f'{name}-trace.zip'))
            except Exception:
                pass
        else:
            self.context.tracing.stop()
        self.context.close()

    def open_modern(self):
        response = self.page.goto(self.base_url, wait_until='load', timeout=30000)
        self.assertEqual(response.status, 200)
        expect(self.page.locator('#ModernSceneTab')).to_be_visible()
        expect(self.page.locator('#ModernAnimationTab')).to_be_visible()

    def open_animation(self):
        self.page.locator('#ModernAnimationTab').click()
        expect(self.page.locator('#ModernAnimationWorkspace')).to_be_visible()
        expect(self.page.locator('#ModernAnimationLibrary').get_by_role('button', name='New project')).to_be_visible()

    def test_navigation_and_studio_bootstrap(self):
        self.open_modern()
        self.page.locator('#ModernCompareTab').click()
        expect(self.page.locator('#ModernCompareTab')).to_have_attribute('aria-pressed', 'true')
        self.open_animation()
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_wizard_can_be_opened_and_cancelled(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary').get_by_role('button', name='New project').click()
        wizard = self.page.locator('#ModernAnimationProjectWizard')
        expect(wizard).to_be_visible()
        expect(wizard).to_contain_text('Step 1 of 5')
        wizard.get_by_role('button', name='Cancel').click()
        expect(wizard).to_be_hidden()

    def test_working_draft_survives_reload(self):
        self.open_modern()
        self.open_animation()
        studio = self.page.locator('#ModernAnimationStudio')
        name = studio.get_by_label('Project name')
        name.fill('CI autosave workspace')
        expect(name).to_have_value('CI autosave workspace')
        # Give the IndexedDB debounce a chance, but the pagehide/localStorage
        # checkpoint must also protect the edit when reloading.
        self.page.wait_for_timeout(750)
        self.page.reload(wait_until='load')
        self.open_animation()
        expect(self.page.locator('#ModernAnimationStudio').get_by_label('Project name')).to_have_value(
            'CI autosave workspace'
        )

    def create_camera_project(self, name):
        """Create a real v2 project through the five-step wizard."""
        library = self.page.locator('#ModernAnimationLibrary')
        library.get_by_role('button', name='New project').click()
        wizard = self.page.locator('#ModernAnimationProjectWizard')
        wizard.get_by_role('button', name='Next').click()  # Camera Motion (default)
        wizard.get_by_role('button', name='Use current Scene/Compare as reference').click()
        wizard.get_by_role('button', name='Next').click()
        wizard.get_by_role('button', name='Next').click()  # Allowed changes
        wizard.get_by_label('Include reference as first keyframe').check()
        wizard.get_by_role('button', name='Next').click()
        wizard.get_by_label('Project name').fill(name)
        wizard.get_by_role('button', name='Create project').click()
        expect(library).to_contain_text('1 saved project', timeout=20000)

    def test_wizard_creates_persisted_project(self):
        self.open_modern()
        self.open_animation()
        self.create_camera_project('CI Camera Motion')
        self.page.reload(wait_until='load')
        self.open_animation()
        expect(self.page.locator('#ModernAnimationLibrary')).to_contain_text('CI Camera Motion')

    def test_keyframe_undo_redo_after_focus_leaves_editor(self):
        self.open_modern()
        self.open_animation()
        self.create_camera_project('CI Undo Camera Motion')
        editor = self.page.locator('#ModernAnimationStudio')
        frame_name = editor.get_by_label('Frame name')
        original = frame_name.input_value()
        self.assertTrue(original)
        frame_name.fill('CI renamed keyframe')
        expect(frame_name).to_have_value('CI renamed keyframe')
        # The old regression only listened for Ctrl+Z inside the Studio node.
        # Moving focus out of the editor must not lose keyboard undo.
        editor.locator('.modern-studio-header').click()
        self.page.keyboard.press('Control+z')
        expect(editor.get_by_label('Frame name')).to_have_value(original)
        self.page.keyboard.press('Control+y')
        expect(editor.get_by_label('Frame name')).to_have_value('CI renamed keyframe')


if __name__ == '__main__':
    unittest.main()

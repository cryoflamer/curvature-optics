"""Run one existing browser case with bounded MCP artifacts; no host access."""

import argparse
import base64
import importlib.metadata
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
CASE = "test_navigation_and_studio_bootstrap"
MAX_ARTIFACT = 8 * 1024 * 1024


def emit(name, data):
    if len(data) > MAX_ARTIFACT:
        raise ValueError("Artifact size exceeded")
    print("LOCAL_MCP_ARTIFACT_V1 " + name + " " + base64.b64encode(data).decode("ascii"),
          flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("success", "failure", "cancel"))
    mode = parser.parse_args().mode
    sys.path.insert(0, str(ROOT / "tests" / "browser"))
    import test_modern_smoke as smoke

    observation = {}
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="curvature-browser-") as directory:
        smoke.ARTIFACTS = Path(directory) / "diagnostics"

        class ReviewedCase(smoke.ModernBrowserSmoke):
            def test_navigation_and_studio_bootstrap(self):
                observation["browser_version"] = self.browser.version
                super().test_navigation_and_studio_bootstrap()
                observation["ui_verified"] = True
                observation["screenshot"] = self.page.screenshot(timeout=5000)
                if mode == "failure":
                    observation["intentional_failure"] = True
                    self.fail("Intentional MCP acceptance failure after verified browser test")
                if mode == "cancel":
                    print("MCP acceptance: browser active; awaiting cancellation", flush=True)
                    time.sleep(120)

        result = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite([ReviewedCase(CASE)]))
        screenshot = observation.pop("screenshot", None)
        # Existing test diagnostics are confined to the disposable tmpfs.
        fallback = smoke.ARTIFACTS / (CASE + ".png")
        if screenshot is None and fallback.is_file():
            with fallback.open("rb") as stream:
                screenshot = stream.read(MAX_ARTIFACT + 1)
        screenshot_ok = bool(screenshot) and len(screenshot) <= MAX_ARTIFACT
        passed = (result.wasSuccessful() and result.testsRun == 1
                  and not result.skipped and observation.get("ui_verified") is True
                  and screenshot_ok and mode == "success")
        report = {
            "case": CASE,
            "mode": mode,
            "playwright": importlib.metadata.version("playwright"),
            "python": sys.version.split()[0],
            "duration_seconds": round(time.monotonic() - started, 3),
            "tests_run": result.testsRun,
            "failures": len(result.failures),
            "errors": len(result.errors),
            "skipped": len(result.skipped),
            "screenshot_available": screenshot_ok,
            "passed": passed,
            **observation,
        }
        emit("report.json", json.dumps(report, sort_keys=True).encode("utf-8"))
        if screenshot_ok:
            emit("screenshot.png", screenshot)
        return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())

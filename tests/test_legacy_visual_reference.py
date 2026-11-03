"""Offline tests for the user-captured immutable Opera Legacy PNG evidence."""

import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / 'tools/validate-legacy-visual-reference.py'
spec = importlib.util.spec_from_file_location('legacy_visual_validator', SCRIPT)
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class LegacyVisualReferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture_bytes = validator.FIXTURE.read_bytes()
        cls.fixture = json.loads(cls.fixture_bytes)
        cls.fixture_sha = hashlib.sha256(cls.fixture_bytes).hexdigest()
        cls.baseline = validator.verify_archive(validator.BASELINE, cls.fixture, cls.fixture_sha)

    def test_real_approved_reference_is_complete_and_locked(self):
        lock = json.loads(validator.LOCK.read_text())
        self.assertEqual(lock['sha256'], validator.sha256(validator.BASELINE.read_bytes()))
        self.assertEqual(list(self.baseline), [
            ('TransLine', 0), ('TransLine', 4), ('TransLine', 7),
            ('Bedford', 0), ('Bedford', 3), ('Bedford', 6)])
        self.assertEqual({(w, h) for _, w, h, _ in self.baseline.values()}, {(1827, 1218)})
        self.assertGreater(sum(len(v[-1]) for v in self.baseline.values()), 50_000_000)

    def test_archive_has_correct_provenance_and_actual_recomputed_fields(self):
        with ZipFile(validator.BASELINE) as z:
            manifest = json.loads(z.read('manifest.json'))
        self.assertEqual(manifest['fixtureSha256'], self.fixture_sha)
        self.assertEqual(manifest['sampleCount'], 6)
        self.assertEqual(manifest['captureMode'],
                         'Opera/browser native, original Legacy Canvas')
        self.assertEqual(manifest['samples'][2]['applied']['recomputedInputFields'],
                         ['pressure', 'temperatureC'])
        self.assertEqual(manifest['samples'][0]['applied']['recomputedInputFields'], [])

    def test_identical_frames_are_exactly_equal_at_zero_tolerance(self):
        key = ('TransLine', 4)
        _, w, h, pixels = self.baseline[key]
        report, mask = validator.compare_rgba(pixels, pixels, w, h, 0)
        self.assertEqual(report['differentPixels'], 0)
        self.assertEqual(report['meanAbsoluteChannelError'], 0)
        self.assertEqual(report['regionDiffCounts3x3'], [[0] * 3 for _ in range(3)])
        self.assertFalse(any(mask))

    def test_differences_and_regions_have_explicit_units(self):
        a = bytes(4 * 9)
        b = bytearray(a)
        b[(2 * 3 + 2) * 4] = 7  # bottom-right region, red channel
        report, mask = validator.compare_rgba(a, b, 3, 3, 0)
        self.assertEqual(report['differentPixels'], 1)
        self.assertAlmostEqual(report['differentPercent'], 100 / 9)
        self.assertAlmostEqual(report['meanAbsoluteChannelError'], 7 / 36)
        self.assertEqual(report['maxChannelError'], 7)
        self.assertEqual(report['regionDiffCounts3x3'][2][2], 1)
        self.assertEqual(sum(map(sum, report['regionDiffCounts3x3'])), 1)
        self.assertEqual(report['differentPixels'], sum(mask))
        report2, _ = validator.compare_rgba(a, b, 3, 3, 7)
        self.assertEqual(report2['differentPixels'], 0)
        self.assertGreater(report2['meanAbsoluteChannelError'], 0,
                           'pixel threshold must not hide mean absolute error')
        diff = validator.encode_diff_png(3, 3, mask)
        self.assertEqual(validator.decode_png(diff), (3, 3,
            bytes([0, 0, 0, 0] * 8 + [255, 0, 0, 255])))

    def test_actual_baseline_pixel_mutation_fails_exact_comparison(self):
        key = ('Bedford', 0)
        original, w, h, pixels = self.baseline[key]
        altered = bytearray(pixels)
        # Change one known real RGBA pixel. A PNG re-encode can change file hashes
        # without changing pixels, but a changed pixel MUST change the verdict.
        altered[0] = (altered[0] + 1) % 256
        comparison = {key: (original, w, h, bytes(altered))}
        with tempfile.TemporaryDirectory() as temp:
            diff_dir = Path(temp) / 'diffs'
            reports = validator.compare_archives({key: self.baseline[key]}, comparison,
                                                 0, 0, 0, diff_dir)
            self.assertFalse(reports[0]['passed'])
            self.assertEqual(reports[0]['differentPixels'], 1)
            path = diff_dir / 'bedford-state-0.diff.png'
            self.assertTrue(path.is_file())
            dw, dh, diff = validator.decode_png(path.read_bytes())
            self.assertEqual((dw, dh), (w, h))
            self.assertEqual(diff[:4], b'\xff\x00\x00\xff')
            self.assertEqual(diff[4:8], b'\x00' * 4)
            tolerated = validator.compare_archives({key: self.baseline[key]}, comparison,
                                                  1, 0, 0.001)
            self.assertTrue(tolerated[0]['passed'])

    def test_png_crc_truncation_and_corrupt_payload_are_rejected(self):
        mask = bytearray([0, 1, 0, 1])
        valid = validator.encode_diff_png(2, 2, mask)
        self.assertEqual(validator.decode_png(valid)[:2], (2, 2))
        bad = bytearray(valid)
        bad[30] ^= 1  # IHDR CRC
        with self.assertRaisesRegex(validator.ValidationError, 'CRC'):
            validator.decode_png(bytes(bad))
        with self.assertRaisesRegex(validator.ValidationError, 'Truncated|missing'):
            validator.decode_png(valid[:-5])

    def test_unknown_manifest_state_and_incomplete_zip_are_rejected(self):
        with ZipFile(validator.BASELINE) as z:
            payload = {n: z.read(n) for n in z.namelist()}
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp) / 'bad.zip'
            missing = dict(payload)
            missing.pop('bedford-state-6.canvas.png')
            with ZipFile(p, 'w') as out:
                for name, data in missing.items():
                    out.writestr(name, data)
            with self.assertRaisesRegex(validator.ValidationError, 'exactly'):
                validator.verify_archive(p, self.fixture, self.fixture_sha)
            manifest = json.loads(payload['manifest.json'])
            manifest['samples'][1]['sourceIndex'] = 3
            changed = dict(payload)
            changed['manifest.json'] = json.dumps(manifest).encode()
            with ZipFile(p, 'w') as out:
                for name, data in changed.items():
                    out.writestr(name, data)
            with self.assertRaisesRegex(validator.ValidationError, 'source/demo/URL'):
                validator.verify_archive(p, self.fixture, self.fixture_sha)

    def test_broken_png_hash_and_incorrect_model_state_are_rejected(self):
        with ZipFile(validator.BASELINE) as z:
            payload = {n: z.read(n) for n in z.namelist()}
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp) / 'bad.zip'
            altered = dict(payload)
            image = bytearray(altered['transline-state-4.canvas.png'])
            image[-1] ^= 2
            altered['transline-state-4.canvas.png'] = bytes(image)
            with ZipFile(p, 'w') as out:
                for name, data in altered.items():
                    out.writestr(name, data)
            with self.assertRaisesRegex(validator.ValidationError, 'SHA-256 mismatch'):
                validator.verify_archive(p, self.fixture, self.fixture_sha)
            manifest = json.loads(payload['manifest.json'])
            manifest['samples'][0]['applied']['effectiveStateFields']['Height'] = 101
            altered = dict(payload)
            altered['manifest.json'] = json.dumps(manifest).encode()
            with ZipFile(p, 'w') as out:
                for name, data in altered.items():
                    out.writestr(name, data)
            with self.assertRaisesRegex(validator.ValidationError, 'recomputed fields'):
                validator.verify_archive(p, self.fixture, self.fixture_sha)

    def test_changed_applied_state_fails_even_if_pixels_are_identical(self):
        key = ('Bedford', 3)
        reference = {key: self.baseline[key]}
        record, w, h, rgba = self.baseline[key]
        changed = json.loads(json.dumps(record))
        changed['model']['cameraPanDegrees'] = 42
        with self.assertRaisesRegex(validator.ValidationError, 'model/atmosphere'):
            validator.compare_archives(reference, {key: (changed, w, h, rgba)}, 0, 0, 0)

    def test_script_verify_only_and_identical_candidate(self):
        # The same archived capture must compare with itself to exactly zero differences.
        self.assertEqual(validator.run(['--candidate', str(validator.BASELINE)]), 0)


if __name__ == '__main__':
    unittest.main()

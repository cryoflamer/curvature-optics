#!/usr/bin/env python3
"""Offline verification/comparison of actual Opera Legacy Canvas reference captures.

Only PNG RGBA8 non-interlaced frames are accepted (the original browser export format).
All PNG decoding, file integrity and comparison use the Python standard library.
This is a Legacy rendering regression check, not a Modern/physics equivalence test.
"""

import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys
import zlib
from zipfile import BadZipFile, ZipFile

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / 'tests/fixtures/legacy-reference-scenarios.json'
BASELINE = ROOT / 'tests/fixtures/legacy-browser-references.zip'
LOCK = ROOT / 'tests/fixtures/legacy-browser-reference-lock.json'
PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'
MAX_FRAME_PIXELS = 15_000_000
MAX_ARCHIVE_FILE = 35_000_000
STABLE_FIELDS = ('Height', 'FocalLengthField', 'Roll', 'Nick', 'Pan', 'showModel',
                 'rEarth', 'ObjType', 'NObjects', 'ObjDist', 'ObjDeltaDist')


class ValidationError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise ValidationError(message)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def png_chunk(kind, payload):
    return struct.pack('>I', len(payload)) + kind + payload + struct.pack(
        '>I', zlib.crc32(kind + payload) & 0xffffffff)


def decode_png(blob):
    """Validate PNG chunks/CRC and reconstruct decoded RGBA canvas pixels."""
    require(blob.startswith(PNG_SIGNATURE), 'Invalid PNG signature')
    offset = len(PNG_SIGNATURE)
    size = None
    compressed = bytearray()
    seen_iend = False
    seen_idat = False
    while offset < len(blob):
        require(offset + 12 <= len(blob), 'Truncated PNG chunk')
        length = struct.unpack_from('>I', blob, offset)[0]
        kind = blob[offset + 4:offset + 8]
        end = offset + 12 + length
        require(end <= len(blob), 'Truncated PNG payload')
        chunk = blob[offset + 8:offset + 8 + length]
        stored_crc = struct.unpack_from('>I', blob, offset + 8 + length)[0]
        require(zlib.crc32(kind + chunk) & 0xffffffff == stored_crc,
                'PNG chunk CRC mismatch: ' + repr(kind))
        offset = end
        if kind == b'IHDR':
            require(size is None and length == 13, 'Duplicate/invalid PNG IHDR')
            w, h, depth, kind_color, compression, flt, interlace = struct.unpack('>IIBBBBB', chunk)
            require(depth == 8 and kind_color == 6 and compression == 0 and flt == 0 and interlace == 0,
                    'PNG must be non-interlaced 8-bit RGBA (browser Canvas export)')
            require(0 < w * h <= MAX_FRAME_PIXELS and w > 0 and h > 0,
                    'PNG dimensions are absent or too large')
            size = (w, h)
        elif kind == b'IDAT':
            require(size is not None, 'PNG IDAT before IHDR')
            seen_idat = True
            require(len(compressed) + len(chunk) <= MAX_ARCHIVE_FILE, 'PNG IDAT too large')
            compressed.extend(chunk)
        elif kind == b'IEND':
            require(length == 0 and offset == len(blob), 'Invalid PNG end/trailing data')
            seen_iend = True
            break
        elif kind in (b'acTL', b'fdAT', b'fcTL'):
            raise ValidationError('Animated PNG is not a static Canvas capture')
        else:
            require(size is not None, 'PNG IHDR must be first')
            require(not (kind[0] & 32 == 0), 'Unsupported critical PNG chunk: ' + repr(kind))
    require(size is not None and seen_idat and seen_iend, 'PNG missing required chunks')
    w, h = size
    stride = w * 4
    expected = (stride + 1) * h
    try:
        inflator = zlib.decompressobj()
        raw = inflator.decompress(bytes(compressed), expected + 1)
        require(len(raw) == expected and inflator.eof and not inflator.unused_data and
                not inflator.unconsumed_tail, 'PNG scanline data size/stream invalid')
    except zlib.error as err:
        raise ValidationError('PNG deflate invalid: ' + str(err)) from err
    rgba = bytearray(stride * h)
    prev = bytearray(stride)
    for y in range(h):
        start = y * (stride + 1)
        filt = raw[start]
        line = bytearray(raw[start + 1:start + 1 + stride])
        require(filt <= 4, 'Invalid PNG scanline filter')
        if filt == 1:  # Sub
            for i in range(4, stride):
                line[i] = (line[i] + line[i - 4]) & 255
        elif filt == 2:  # Up
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif filt == 3:  # Average
            for i in range(stride):
                line[i] = (line[i] + ((line[i - 4] if i >= 4 else 0) + prev[i]) // 2) & 255
        elif filt == 4:  # Paeth
            for i in range(stride):
                a = line[i - 4] if i >= 4 else 0
                b = prev[i]
                c = prev[i - 4] if i >= 4 else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                predictor = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[i] = (line[i] + predictor) & 255
        rgba[y * stride:(y + 1) * stride] = line
        prev = line
    return w, h, bytes(rgba)


def encode_diff_png(w, h, mask):
    """Opaque red pixels represent differences, transparent pixels are unchanged."""
    require(len(mask) == w * h, 'Invalid diff mask')
    rows = bytearray()
    for y in range(h):
        rows.append(0)
        for flag in mask[y * w:(y + 1) * w]:
            rows.extend((255, 0, 0, 255) if flag else (0, 0, 0, 0))
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    return (PNG_SIGNATURE + png_chunk(b'IHDR', ihdr) +
            png_chunk(b'IDAT', zlib.compress(bytes(rows), 6)) + png_chunk(b'IEND', b''))


def inspect_pixels(w, h, rgba):
    step = max(1, min(w, h) // 120)
    colors = set()
    opaque = 0
    for y in range(0, h, step):
        for x in range(0, w, step):
            i = 4 * (y * w + x)
            pixel = rgba[i:i + 4]
            opaque += (pixel[3] != 0)
            colors.add(pixel)
    return len(colors), opaque


def source_samples(fixture):
    require(fixture.get('schemaVersion') == 1 and
            fixture.get('source') == 'src/animation/CurvatureDemos.js',
            'Unexpected source-fixture schema')
    require([s.get('demo') for s in fixture.get('scenarios', [])] == ['TransLine', 'Bedford'],
            'Unexpected source-fixture groups')
    result = []
    for group in fixture['scenarios']:
        total = group['totalStates']
        require([s.get('sourceIndex') for s in group['samples']] ==
                [0, total // 2, total - 1], 'Unexpected source-fixture indices')
        result.extend((group['demo'], s) for s in group['samples'])
    require(len(result) == 6, 'Expected six source states')
    return result


def verify_archive(path, fixture, fixture_hash):
    """Fail closed on missing/extra files, altered manifests, or corrupt Canvas pixels."""
    require(path.is_file(), 'Capture ZIP missing: ' + str(path))
    with ZipFile(path) as archive:
        infos = archive.infolist()
        names = [i.filename for i in infos]
        expected_samples = source_samples(fixture)
        expected_pngs = [f'{demo.lower()}-state-{sample["sourceIndex"]}.canvas.png'
                         for demo, sample in expected_samples]
        expected_names = ['manifest.json'] + expected_pngs
        require(len(names) == len(set(names)) and set(names) == set(expected_names),
                'Capture ZIP must contain exactly manifest.json and the six expected PNGs')
        require(all(info.file_size <= MAX_ARCHIVE_FILE for info in infos),
                'Oversized capture ZIP entry')
        manifest = json.loads(archive.read('manifest.json'))
        require(manifest.get('schemaVersion') == 1 and manifest.get('complete') is True and
                manifest.get('sampleCount') == 6 and len(manifest.get('samples', [])) == 6,
                'Incomplete or unexpected capture manifest')
        require(manifest.get('fixture') == 'tests/fixtures/legacy-reference-scenarios.json' and
                manifest.get('fixtureSha256') == fixture_hash, 'Capture fixture hash mismatch')
        require('Legacy' in manifest.get('captureMode', '') and
                'not Modern parity' in manifest.get('evidenceKind', ''),
                'Expected an original Legacy Canvas observation, not a Modern claim')
        frames = {}
        for ((demo, source), record, name) in zip(expected_samples, manifest['samples'], expected_pngs):
            label = f'{demo}[{source["sourceIndex"]}]'
            require(record.get('demo') == demo and record.get('sourceIndex') == source['sourceIndex']
                    and record.get('sourceState') == source['state'] and
                    record.get('sourceQueryHint') == source['legacyQuery'],
                    label + ': source/demo/URL does not match source fixture')
            applied = record.get('applied') or {}
            effective = applied.get('effectiveStateFields')
            require(isinstance(effective, dict) and set(effective) == set(source['state']),
                    label + ': incomplete applied state')
            changed = [k for k in source['state'] if effective[k] != source['state'][k]]
            require(applied.get('recomputedInputFields') == changed,
                    label + ': recomputed fields not accounted for')
            require(all(effective.get(k) == source['state'][k] for k in STABLE_FIELDS
                        if k in source['state']), label + ': geometry/camera state mismatch')
            require(record.get('devicePixelRatio', 0) > 0 and record.get('userAgent'),
                    label + ': missing capture environment')
            model = record.get('model') or {}
            for model_key, state_key in (('observerHeightMetres', 'Height'),
                                         ('earthRadiusMetres', 'rEarth'),
                                         ('cameraPanDegrees', 'Pan'), ('cameraNickDegrees', 'Nick')):
                require(model.get(model_key) == effective.get(state_key),
                        label + ': model/effective state inconsistent (' + model_key + ')')
            file_record = record.get('files') or {}
            canvas = record.get('canvas') or {}
            require(file_record.get('canvasPng') == name, label + ': unexpected PNG filename')
            blob = archive.read(name)
            blob_hash = sha256(blob)
            require(blob_hash == file_record.get('canvasPngSha256') == canvas.get('pngSha256'),
                    label + ': PNG SHA-256 mismatch')
            w, h, rgba = decode_png(blob)
            require((w, h) == (canvas.get('width'), canvas.get('height')),
                    label + ': PNG dimensions differ from manifest')
            require(sha256(rgba) == canvas.get('pixelSha256'),
                    label + ': decoded RGBA SHA-256 mismatch')
            colors, opaque = inspect_pixels(w, h, rgba)
            require(colors == canvas.get('sampleDistinctColors') and
                    opaque == canvas.get('opaqueSamples') and colors > 1 and opaque > 0,
                    label + ': blank frame or sampled Canvas metrics mismatch')
            frames[(demo, source['sourceIndex'])] = (record, w, h, rgba)
        return frames


def compare_rgba(a, b, w, h, threshold):
    """Return channel-level error metrics, a 3x3 location grid, and the diff mask."""
    require(len(a) == len(b) == w * h * 4, 'Different RGBA buffer lengths')
    differing = 0
    total_error = 0
    largest = 0
    regions = [[0] * 3 for _ in range(3)]
    mask = bytearray(w * h)
    for i in range(w * h):
        pos = i * 4
        d0 = abs(a[pos] - b[pos])
        d1 = abs(a[pos + 1] - b[pos + 1])
        d2 = abs(a[pos + 2] - b[pos + 2])
        d3 = abs(a[pos + 3] - b[pos + 3])
        maximum = max(d0, d1, d2, d3)
        total_error += d0 + d1 + d2 + d3
        if maximum > largest:
            largest = maximum
        if maximum > threshold:
            mask[i] = 1
            differing += 1
            x, y = i % w, i // w
            regions[min(2, y * 3 // h)][min(2, x * 3 // w)] += 1
    return {'differentPixels': differing, 'differentPercent': 100 * differing / (w * h),
            'meanAbsoluteChannelError': total_error / (w * h * 4),
            'maxChannelError': largest, 'regionDiffCounts3x3': regions}, mask


def compare_archives(reference, candidate, threshold, max_percent, max_mae, diff_dir=None):
    require(list(reference) == list(candidate), 'Reference/candidate sample identities differ')
    results = []
    if diff_dir is not None:
        require(not diff_dir.exists(), 'Diff output directory must not exist: ' + str(diff_dir))
        diff_dir.mkdir(parents=True)
    for key, (record, w, h, rgba) in reference.items():
        other, cw, ch, pixels = candidate[key]
        label = f'{key[0]}[{key[1]}]'
        # Geometry and computed Legacy state changes must not hide behind pixel tolerances.
        require(record['applied'] == other['applied'] and record['model'] == other['model'],
                label + ': applied model/atmosphere differs from reference')
        require((w, h) == (cw, ch), label + ': PNG dimensions differ')
        metrics, mask = compare_rgba(rgba, pixels, w, h, threshold)
        passed = (metrics['differentPercent'] <= max_percent and
                  metrics['meanAbsoluteChannelError'] <= max_mae)
        results.append({'demo': key[0], 'sourceIndex': key[1], 'passed': passed, **metrics})
        if diff_dir is not None and metrics['differentPixels']:
            target = diff_dir / f'{key[0].lower()}-state-{key[1]}.diff.png'
            target.write_bytes(encode_diff_png(w, h, mask))
    return results


def run(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference', type=Path, default=BASELINE,
                        help='Verified Legacy baseline ZIP (default: archived user capture)')
    parser.add_argument('--candidate', type=Path, help='New browser-native six-frame ZIP to compare')
    parser.add_argument('--pixel-threshold', type=int, default=0, help='Per-channel difference ignored, 0..255')
    parser.add_argument('--max-differing-percent', type=float, default=0,
                        help='Allowed percentage of pixels differing above threshold (default 0)')
    parser.add_argument('--max-mean-abs-error', type=float, default=0,
                        help='Allowed mean RGBA channel error 0..255 (default 0)')
    parser.add_argument('--diff-dir', type=Path,
                        help='New directory for red-on-transparent pixel-difference PNGs')
    args = parser.parse_args(argv)
    require(0 <= args.pixel_threshold <= 255, 'Pixel threshold must be 0..255')
    require(0 <= args.max_differing_percent <= 100, 'Different-pixel percent must be 0..100')
    require(0 <= args.max_mean_abs_error <= 255, 'Mean channel error must be 0..255')
    require(args.candidate or args.diff_dir is None, '--diff-dir requires --candidate')

    fixture_bytes = FIXTURE.read_bytes()
    fixture = json.loads(fixture_bytes)
    fixture_hash = sha256(fixture_bytes)
    if args.reference.resolve() == BASELINE.resolve():
        lock = json.loads(LOCK.read_text(encoding='utf-8'))
        require(lock.get('schemaVersion') == 1 and lock.get('archive') ==
                'tests/fixtures/legacy-browser-references.zip' and lock.get('sampleCount') == 6,
                'Legacy baseline lock has an unexpected schema')
        require(sha256(BASELINE.read_bytes()) == lock.get('sha256'),
                'Committed Legacy baseline archive differs from the approved lock')
    base = verify_archive(args.reference, fixture, fixture_hash)
    print('Legacy reference: VERIFIED 6/6 actual Canvas PNGs, source states, CRC and SHA-256')
    if not args.candidate:
        return 0
    candidate = verify_archive(args.candidate, fixture, fixture_hash)
    results = compare_archives(base, candidate, args.pixel_threshold,
                               args.max_differing_percent, args.max_mean_abs_error,
                               args.diff_dir)
    for item in results:
        print(f'{item["demo"]}[{item["sourceIndex"]}]: '
              f'{"PASS" if item["passed"] else "FAIL"} '
              f'{item["differentPixels"]:,} pixels ({item["differentPercent"]:.5f}%), '
              f'MAE={item["meanAbsoluteChannelError"]:.5f}, max delta={item["maxChannelError"]}, '
              f'regions={item["regionDiffCounts3x3"]}')
    passed = sum(r['passed'] for r in results)
    print(f'Legacy visual comparison: {passed}/6 within declared pixel tolerances')
    return 0 if passed == 6 else 1


if __name__ == '__main__':
    try:
        sys.exit(run())
    except (ValidationError, BadZipFile, OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        print('Legacy visual validation FAILED: ' + str(error), file=sys.stderr)
        sys.exit(1)

#!/usr/bin/env python3
"""Run all browser smoke tests or deterministic disjoint CI shards.

Each shard runs in its own process/browser; unittest's regular setup/teardown,
including per-test IndexedDB isolation and failure diagnostics, is preserved.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys
import time
import unittest


ROOT = Path(__file__).resolve().parents[1]


def individual_tests(suite):
    for item in suite:
        if isinstance(item, unittest.TestSuite):
            yield from individual_tests(item)
        else:
            yield item


class TimedResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.durations = []
        self._started_at = None

    def startTest(self, test):
        self._started_at = time.perf_counter()
        super().startTest(test)

    def stopTest(self, test):
        self.durations.append((time.perf_counter() - self._started_at, test.id()))
        super().stopTest(test)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shards', type=int, default=1, help='Number of CI processes')
    parser.add_argument('--shard', type=int, default=0, help='Zero-based shard index')
    parser.add_argument('--match', action='append', default=[], help='Run IDs containing this substring')
    parser.add_argument('--list', action='store_true', help='List selected cases, without executing them')
    args = parser.parse_args(argv)
    if args.shards < 1 or not 0 <= args.shard < args.shards:
        parser.error('--shards must be >= 1 and --shard must be in [0, shards)')

    discovered = unittest.TestLoader().discover(
        start_dir=str(ROOT / 'tests' / 'browser'), pattern='test_*.py')
    all_cases = sorted(individual_tests(discovered), key=lambda case: case.id())
    if args.match:
        all_cases = [case for case in all_cases if any(part in case.id() for part in args.match)]
    selected = [case for index, case in enumerate(all_cases) if index % args.shards == args.shard]
    if not selected:
        parser.error('No browser cases selected: check shard count and filters')
    print(f'Chromium shard {args.shard + 1}/{args.shards}: '
          f'{len(selected)} of {len(all_cases)} selected cases', flush=True)
    if args.list:
        for case in selected:
            print(case.id())
        return 0

    start = time.perf_counter()
    outcome = unittest.TextTestRunner(verbosity=2, resultclass=TimedResult).run(
        unittest.TestSuite(selected))
    print(f'Chromium shard {args.shard + 1}/{args.shards}: '
          f'{outcome.testsRun} cases in {time.perf_counter() - start:.1f}s',
          file=sys.stderr)
    for seconds, name in sorted(outcome.durations, reverse=True)[:10]:
        print(f'  {seconds:7.2f}s  {name}', file=sys.stderr)
    return 0 if outcome.wasSuccessful() and outcome.testsRun == len(selected) else 1


if __name__ == '__main__':
    sys.exit(main())

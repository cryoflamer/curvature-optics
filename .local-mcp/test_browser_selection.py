"""Focused offline regression tests for exact browser test selection."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    'browser_runner', Path(__file__).resolve().parents[1] / 'tools/run-browser-smoke.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class ExactSelectionTests(unittest.TestCase):
    def setUp(self):
        self.executed = []
        executed = self.executed

        class First(unittest.TestCase):
            def test_alpha(self):
                executed.append('alpha')

            def test_beta(self):
                executed.append('beta')

        class Second(unittest.TestCase):
            def test_beta(self):
                executed.append('other beta')

        # A discovered test class normally has a module-level qualified name.
        First.__qualname__ = 'First'
        Second.__qualname__ = 'Second'
        self.cases = [First('test_alpha'), First('test_beta'), Second('test_beta')]

    def test_exact_names_and_ids(self):
        chosen = runner.select_exact(self.cases, [self.cases[1].id(), 'test_alpha'])
        self.assertEqual(chosen, [self.cases[1], self.cases[0]])
        self.assertTrue(unittest.TestSuite(chosen).run(unittest.TestResult()).wasSuccessful())
        self.assertEqual(self.executed, ['beta', 'alpha'])

    def test_unknown_partial_and_ambiguous_rejected(self):
        for name in ('test_missing', 'test_alph', 'test_beta', '*', '--all'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                runner.select_exact(self.cases, [name])

    def test_duplicates_and_bounds_rejected(self):
        for names in ([], ['test_alpha'] * 2, ['test_alpha', self.cases[0].id()],
                      ['test_' + str(i) for i in range(9)]):
            with self.subTest(names=names), self.assertRaises(ValueError):
                runner.select_exact(self.cases, names)

    def test_cli_runs_only_selected_cases(self):
        with patch.object(unittest.TestLoader, 'discover', return_value=unittest.TestSuite(self.cases)):
            self.assertEqual(runner.main(['--exact', 'test_alpha']), 0)
        self.assertEqual(self.executed, ['alpha'])

    def test_cli_list_does_not_execute(self):
        with patch.object(unittest.TestLoader, 'discover', return_value=unittest.TestSuite(self.cases)):
            self.assertEqual(runner.main(['--exact', 'test_alpha', '--list']), 0)
        self.assertEqual(self.executed, [])

    def test_cli_rejects_before_execution(self):
        for args in (['--exact', 'test_beta'], ['--exact', 'test_missing'],
                     ['--exact', 'test_alpha', '--match', 'alpha'],
                     ['--exact', 'test_alpha', '--shards', '2']):
            with self.subTest(args=args), self.assertRaises(SystemExit) as error:
                with patch.object(unittest.TestLoader, 'discover', return_value=unittest.TestSuite(self.cases)):
                    runner.main(args)
            self.assertEqual(error.exception.code, 2)
        self.assertEqual(self.executed, [])


if __name__ == '__main__':
    unittest.main()

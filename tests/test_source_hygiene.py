"""
Guards against "Trojan Source" style problems: invisible or text-direction
characters hidden in source files, which can make code read differently
from how it runs. Write them as escapes (backslash-u plus 4 hex digits) instead.

Run with: python -m unittest discover -s tests -v
"""

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHECKED = {".js", ".mjs", ".py", ".html", ".css", ".json", ".md"}
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv"}
RANGES = [(0x200B, 0x200F), (0x202A, 0x202E), (0x2066, 0x2069), (0xFEFF, 0xFEFF)]
BAD = {chr(c) for lo, hi in RANGES for c in range(lo, hi + 1)}


class TestSourceHygiene(unittest.TestCase):
    """Scans every source file in the project."""
    def test_no_invisible_or_bidi_characters(self):
        problems = []
        for f in ROOT.rglob("*"):
            if not f.is_file() or f.suffix not in CHECKED or SKIP_DIRS & set(f.parts):
                continue
            for n, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
                found = sorted({f"U+{ord(ch):04X}" for ch in line if ch in BAD})
                if found:
                    problems.append(f"{f.relative_to(ROOT).as_posix()}:{n} {', '.join(found)}")
        self.assertEqual(problems, [], "Replace these characters with \\u escapes:\n" + "\n".join(problems))


if __name__ == "__main__":
    unittest.main()

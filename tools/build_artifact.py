#!/usr/bin/env python3
"""Inline styles.css and scripts/*.js into a single self-contained HTML
file, for publishing to the Claude Artifact preview only.

This is NOT part of the site's normal deployment — GitHub Pages serves
index.html, styles.css, and scripts/*.js directly, as separate files, with
no build step. This script exists purely because an Artifact preview has
to be one file with no sibling assets.

Usage:
    python tools/build_artifact.py [output_path]

If output_path is omitted, writes to a temp file and prints its path.
"""

import pathlib
import re
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent

html = (ROOT / "index.html").read_text(encoding="utf-8")

css = (ROOT / "styles.css").read_text(encoding="utf-8")
html = html.replace(
    '<link rel="stylesheet" href="styles.css">',
    "<style>\n" + css + "</style>",
)


def inline_script(match):
    src = match.group(1)
    content = (ROOT / src).read_text(encoding="utf-8")
    return "<script>\n" + content + "</script>"


html = re.sub(r'<script src="([^"]+)"></script>', inline_script, html)

out_path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else (
    pathlib.Path(tempfile.gettempdir()) / "alan-visona-artifact.html"
)
out_path.write_text(html, encoding="utf-8")
print(out_path)

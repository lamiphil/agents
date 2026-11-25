#!/usr/bin/env python3
"""Apply the portfolio artifact theme to a pi-artifacts source/index.html.

- Replaces the bundled Geist theme with an embedded Raleway @font-face (base64, SIL OFL)
  plus assets/portfolio.css. Artifact-specific CSS must sit after the marker comment
  `/* artifact */` inside the same <style>; it is preserved.
- Inlines assets/vd-edges.js once when the page uses <svg class="vd-edges">.
- Forces <html lang> to the given language (default en).

Idempotent: re-run after every edit.
Usage: apply-theme.py <path/to/source/index.html> [--lang en|fr]
"""
import base64
import re
import sys
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / "assets"
THEME_MARK = "/* portfolio theme */"
SCRIPT_MARK = "// portfolio vd-edges"
ARTIFACT_MARK = "/* artifact */"


def font_face() -> str:
    b64 = base64.b64encode((ASSETS / "raleway-latin.woff2").read_bytes()).decode()
    return (
        '@font-face { font-family: "Raleway"; font-style: normal; font-weight: 100 900; font-display: swap;'
        f' src: url(data:font/woff2;base64,{b64}) format("woff2"); }}'
    )


def main() -> int:
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return 2
    path = Path(args[0])
    lang = args[args.index("--lang") + 1] if "--lang" in args else "en"
    html = path.read_text()

    m = re.search(r"<style>(.*?)</style>", html, re.S)
    if not m:
        print(f"{path}: no <style> block found", file=sys.stderr)
        return 1
    body = m.group(1)
    specific = body.split(ARTIFACT_MARK, 1)[1] if ARTIFACT_MARK in body else ""
    theme = (ASSETS / "portfolio.css").read_text()
    style = f"<style>\n{THEME_MARK}\n{font_face()}\n{theme}\n{ARTIFACT_MARK}{specific.rstrip()}\n</style>"
    html = html[: m.start()] + style + html[m.end():]

    if 'class="vd-edges"' in html and SCRIPT_MARK not in html:
        js = (ASSETS / "vd-edges.js").read_text()
        html = html.replace("</body>", f"<script>\n{SCRIPT_MARK}\n{js}</script>\n</body>", 1)

    html = re.sub(r'<html lang="[^"]*">', f'<html lang="{lang}">', html, count=1)
    path.write_text(html)
    extras = ", vd-edges" if SCRIPT_MARK in html else ""
    print(f"✓ {path} (portfolio theme{extras}, lang={lang})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

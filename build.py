"""Build every X.src.html into X.html, embedding the Dyce logos as data URIs.

    python build.py            writes X.html next to each X.src.html
    python build.py --preview  also writes preview/X.html with tools/preview-stub.js
                               inlined before the page's first <script>

--root DIR builds in another folder (used by the tests).
"""
import argparse
import base64
import re
import sys
from pathlib import Path

LOGOS = {
    "LOGO_ORIG": "dyce-logo-original.png",
    "LOGO_INV": "dyce-logo-invert.png",
}
PLACEHOLDER = re.compile(r"\{\{([A-Za-z0-9_]+)\}\}")


def data_uri(path):
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def render(text, assets, name):
    def sub(m):
        key = m.group(1)
        if key not in LOGOS:
            raise SystemExit("%s: unknown placeholder {{%s}}" % (name, key))
        return data_uri(assets / LOGOS[key])
    return PLACEHOLDER.sub(sub, text)


def check_no_braces(html, name):
    # A spaced or mistyped placeholder ({{ LOGO_ORIG }}, {{LOGO-INV}}) does not match
    # PLACEHOLDER and would otherwise reach the page as text. Refuse any "{{" left over.
    i = html.find("{{")
    if i >= 0:
        end = html.find("}}", i)
        snippet = html[i: end + 2] if 0 <= end - i < 60 else html[i: i + 40]
        raise SystemExit("%s: output still contains %s; fix the placeholder" % (name, snippet))
    return html


def inline_stub(html, stub, name):
    i = html.find("<script")
    if i < 0:
        raise SystemExit("%s: no <script> to put the preview stub before" % name)
    return html[:i] + "<script>" + stub + "</script>" + html[i:]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent))
    args = ap.parse_args(argv)
    root = Path(args.root)
    sources = sorted(root.glob("*.src.html"))
    if not sources:
        print("No *.src.html files to build.")
        return 0
    stub = None
    if args.preview:
        stub_path = root / "tools" / "preview-stub.js"
        if not stub_path.is_file():
            raise SystemExit("--preview needs tools/preview-stub.js, which is missing")
        stub = stub_path.read_text(encoding="utf-8")
    for src in sources:
        out_name = src.name[: -len(".src.html")] + ".html"
        html = check_no_braces(
            render(src.read_text(encoding="utf-8"), root / "assets", src.name), src.name)
        preview = None
        if stub is not None:
            preview = check_no_braces(inline_stub(html, stub, src.name),
                                      "preview/" + out_name + " (with tools/preview-stub.js)")
        (root / out_name).write_text(html, encoding="utf-8", newline="")
        print("wrote", out_name)
        if preview is not None:
            (root / "preview").mkdir(exist_ok=True)
            (root / "preview" / out_name).write_text(preview, encoding="utf-8", newline="")
            print("wrote preview/" + out_name)
    return 0


if __name__ == "__main__":
    sys.exit(main())

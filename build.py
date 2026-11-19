"""Build every X.src.html into X.html, embedding the Dyce logos as data URIs
and inlining the parts/ files named in INCLUDES.

    python build.py            writes X.html next to each X.src.html
    python build.py --preview  also writes preview/X.html with tools/preview-stub.js
                               inlined before the page's first <script>
    python build.py --demo     also writes demo/pricing-demo.html from hub.src.html: the stub inlined in
                               demo mode (signed in as an invented person, straight into Pricing >
                               Supplier files, invented prices, every call answered in the page), the
                               font and connection allowances taken out so it asks no other host for anything

--root DIR builds in another folder (used by the tests).

Four more placeholders put the Pricing tab's code into the page, each as one expression:
  {{XLSX_LIB}}            vendor/xlsx.full.min.js, wrapped in a function that returns XLSX
  {{PRICING_ADAPTERS}}    pricing/adapters.js, as an object of its exports
  {{PRICING_EXPORTS}}     pricing/exports.js, as an object of its exports
  {{PRICING_GRID}}        pricing/grid.js, as an object of its exports
The three modules are ES modules for the Node tests. Here their `export` keywords are stripped and
the source is wrapped in a function that returns the exported names, so the files' private
names (adapters and exports both have a LAYOUTS) cannot clash. Every non-ASCII character is written as a unicode
escape, so the built page is plain ASCII there (the library holds thousands, em dashes among them).
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
INCLUDES = {
    "POOL_LIB_JS": "parts/pool-lib.js",
    "POOL_SCREEN_JS": "parts/pool-screen.js",
    "POOL_SCREEN_CSS": "parts/pool-screen.css",
    "COMMISSION_JS": "parts/commission.js",
    "COMMISSION_CSS": "parts/commission.css",
}
PLACEHOLDER = re.compile(r"\{\{([A-Za-z0-9_]+)\}\}")
# placeholder -> (source file, "lib" for a script that makes the global XLSX, "module" for an ES module)
CODE = {
    "XLSX_LIB": ("vendor/xlsx.full.min.js", "lib"),
    "PRICING_ADAPTERS": ("pricing/adapters.js", "module"),
    "PRICING_EXPORTS": ("pricing/exports.js", "module"),
    "PRICING_GRID": ("pricing/grid.js", "module"),
}
EXPORT = re.compile(r"^export\s+(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)", re.M)
BACKSLASH_BEFORE_NON_ASCII = re.compile("\\\\[^\u0000-\u007f]")


def data_uri(path):
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def ascii_only(code):
    # Inside a string, a regular expression or a comment, a unicode escape means what the character
    # meant. A backslash before a non-ASCII character (an identity escape) would change meaning
    # once escaped, so that is refused rather than guessed at.
    if BACKSLASH_BEFORE_NON_ASCII.search(code):
        raise SystemExit("inlined code has a backslash before a non-ASCII character; cannot escape it safely")
    out = []
    for ch in code:
        n = ord(ch)
        if n < 128:
            out.append(ch)
        elif n < 0x10000:
            out.append("\\u%04x" % n)
        else:
            n -= 0x10000
            out.append("\\u%04x\\u%04x" % (0xD800 + (n >> 10), 0xDC00 + (n & 0x3FF)))
    return "".join(out)


def code_expression(root, key):
    rel, kind = CODE[key]
    path = root / rel
    if not path.is_file():
        raise SystemExit("{{%s}} needs %s, which is missing" % (key, rel))
    src = path.read_text(encoding="utf-8")
    if "</script" in src.lower():
        raise SystemExit("%s contains </script, which would end the page's script early" % rel)
    if kind == "lib":
        # A UMD file: as a plain script it makes the global XLSX; inside this function it finds no
        # module or exports, so it does the same, and the function hands the object back.
        expr = "(function () {\n" + src + "\n;return XLSX;\n})()"
    else:
        names = EXPORT.findall(src)
        if not names:
            raise SystemExit("%s exports nothing" % rel)
        body = EXPORT.sub(lambda m: m.group(0)[len("export"):].lstrip(), src)
        if re.search(r"^\s*(export|import)\b", body, re.M):
            raise SystemExit("%s uses export or import in a form build.py does not strip" % rel)
        expr = "(function () {\n" + body + "\n;return { " + ", ".join(names) + " };\n})()"
    return ascii_only(expr)


def render(text, root, name):
    assets = root / "assets"

    def sub(m):
        key = m.group(1)
        if key in INCLUDES:
            path = root / INCLUDES[key]
            if not path.is_file():
                raise SystemExit("%s: {{%s}} needs %s, which is missing" % (name, key, INCLUDES[key]))
            return path.read_text(encoding="utf-8")
        if key in CODE:
            return code_expression(root, key)
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


def demo_page(html, stub, name):
    # A demo makes no request to any host: the web font link and the preconnect go (the page falls back
    # to Calibri), and the policy loses its font and connection allowances. The stub answers every call.
    html = re.sub(r'<link rel="(?:preconnect|stylesheet)" href="https://fonts\.[^>]*>\n?', "", html)
    csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"
    html, n = re.subn(r'(<meta http-equiv="Content-Security-Policy" content=")[^"]*(")', lambda m: m.group(1) + csp + m.group(2), html)
    if n != 1:
        raise SystemExit("%s: expected one Content-Security-Policy meta tag for the demo" % name)
    return check_no_braces(inline_stub(html, "window.__DEMO__ = true;\n" + stub, name), "demo/pricing-demo.html (with tools/preview-stub.js)")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent))
    args = ap.parse_args(argv)
    root = Path(args.root)
    sources = sorted(root.glob("*.src.html"))
    if not sources:
        print("No *.src.html files to build.")
        return 0
    stub = None
    if args.demo and not (root / "hub.src.html").is_file():
        raise SystemExit("--demo needs hub.src.html, which is missing")
    if args.preview or args.demo:
        stub_path = root / "tools" / "preview-stub.js"
        if not stub_path.is_file():
            raise SystemExit("--preview and --demo need tools/preview-stub.js, which is missing")
        stub = stub_path.read_text(encoding="utf-8")
    for src in sources:
        out_name = src.name[: -len(".src.html")] + ".html"
        html = check_no_braces(
            render(src.read_text(encoding="utf-8"), root, src.name), src.name)
        preview = None
        if args.preview:
            preview = check_no_braces(inline_stub(html, stub, src.name),
                                      "preview/" + out_name + " (with tools/preview-stub.js)")
        (root / out_name).write_text(html, encoding="utf-8", newline="")
        print("wrote", out_name)
        if preview is not None:
            (root / "preview").mkdir(exist_ok=True)
            (root / "preview" / out_name).write_text(preview, encoding="utf-8", newline="")
            print("wrote preview/" + out_name)
        if args.demo and src.name == "hub.src.html":
            (root / "demo").mkdir(exist_ok=True)
            (root / "demo" / "pricing-demo.html").write_text(demo_page(html, stub, src.name), encoding="utf-8", newline="")
            print("wrote demo/pricing-demo.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())

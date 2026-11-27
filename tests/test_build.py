import base64
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build.py"
ASSETS = ROOT / "assets"
SANITISER = re.compile(r"\n  // BEGIN DV SANITISER.*?\n  // END DV SANITISER\n", re.S)
# Where a Chromium browser is found for the sanitiser check; DV_BROWSER names another.
BROWSERS = [
    os.environ.get("DV_BROWSER", ""),
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    shutil.which("google-chrome") or "", shutil.which("chromium") or "", shutil.which("chrome") or "",
]
# The DPF figures tab's own files.
DPF_FILES = (ROOT / "dpf" / "import.js", ROOT / "dpf" / "import.test.js", ROOT / "parts" / "dpf.js",
             ROOT / "parts" / "dpf.css", ROOT / "tools" / "dpf-preview-check.js")
# The Commission Engine tab's own files.
COMMISSION_FILES = (ROOT / "parts" / "commission.js", ROOT / "parts" / "commission.css",
                    ROOT / "tools" / "ce-preview-pages.mjs", ROOT / "tools" / "ce-preview-check.js")
FIXTURE = (
    "<html><body><img src=\"{{LOGO_ORIG}}\"><img src=\"{{LOGO_INV}}\">"
    "<script>var page = 1;</script></body></html>"
)


def copy_pricing_code(folder):
    # The files {{XLSX_LIB}}, {{PRICING_ADAPTERS}}, {{PRICING_EXPORTS}}, {{PRICING_GRID}} and {{PRICING_HEALTH}} in hub.src.html read.
    (folder / "vendor").mkdir(exist_ok=True)
    (folder / "pricing").mkdir(exist_ok=True)
    shutil.copy(ROOT / "vendor" / "xlsx.full.min.js", folder / "vendor" / "xlsx.full.min.js")
    for name in ("adapters.js", "exports.js", "grid.js", "health.js"):
        shutil.copy(ROOT / "pricing" / name, folder / "pricing" / name)
    # {{DPF_IMPORT}}: the DPF figures tab's module.
    (folder / "dpf").mkdir(exist_ok=True)
    shutil.copy(ROOT / "dpf" / "import.js", folder / "dpf" / "import.js")


def run_build(folder, *args):
    return subprocess.run(
        [sys.executable, str(BUILD), "--root", str(folder), *args],
        capture_output=True, text=True,
    )


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        shutil.copytree(ASSETS, self.tmp / "assets")
        (self.tmp / "fixture.src.html").write_text(FIXTURE, encoding="utf-8")

    def test_no_placeholder_left(self):
        r = run_build(self.tmp)
        self.assertEqual(r.returncode, 0, r.stderr)
        out = (self.tmp / "fixture.html").read_text(encoding="utf-8")
        self.assertNotIn("{{", out)

    def test_data_uris_match_assets(self):
        run_build(self.tmp)
        out = (self.tmp / "fixture.html").read_text(encoding="utf-8")
        uris = re.findall(r'src="data:image/png;base64,([^"]+)"', out)
        self.assertEqual(len(uris), 2)
        self.assertEqual(base64.b64decode(uris[0]),
                         (ASSETS / "dyce-logo-original.png").read_bytes())
        self.assertEqual(base64.b64decode(uris[1]),
                         (ASSETS / "dyce-logo-invert.png").read_bytes())

    def test_unknown_placeholder_fails(self):
        (self.tmp / "fixture.src.html").write_text(FIXTURE + "{{LOGO_NOPE}}", encoding="utf-8")
        r = run_build(self.tmp)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("{{LOGO_NOPE}}", r.stderr)

    def test_preview_without_stub_fails(self):
        r = run_build(self.tmp, "--preview")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("preview-stub.js", r.stderr)

    def test_preview_inlines_stub_before_first_script(self):
        (self.tmp / "tools").mkdir()
        (self.tmp / "tools" / "preview-stub.js").write_text("var STUB = 42;", encoding="utf-8")
        r = run_build(self.tmp, "--preview")
        self.assertEqual(r.returncode, 0, r.stderr)
        out = (self.tmp / "preview" / "fixture.html").read_text(encoding="utf-8")
        self.assertIn("<script>var STUB = 42;</script>", out)
        self.assertLess(out.index("var STUB = 42;"), out.index("var page = 1;"))
        self.assertNotIn("{{", out)

    DEMO_HUB = (
        "<html><head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; connect-src https://x.test; font-src https://fonts.gstatic.com\">"
        "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n"
        "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Montserrat\">\n"
        "</head><body><img src=\"{{LOGO_INV}}\"><script>var page = 1;</script></body></html>"
    )

    def test_demo_builds_one_page_with_the_stub_in_demo_mode(self):
        (self.tmp / "hub.src.html").write_text(self.DEMO_HUB, encoding="utf-8")
        (self.tmp / "tools").mkdir()
        (self.tmp / "tools" / "preview-stub.js").write_text("var STUB = 42;", encoding="utf-8")
        r = run_build(self.tmp, "--demo")
        self.assertEqual(r.returncode, 0, r.stderr)
        out = (self.tmp / "demo" / "pricing-demo.html").read_text(encoding="utf-8")
        self.assertIn("<script>window.__DEMO__ = true;\nvar STUB = 42;</script>", out)
        self.assertLess(out.index("var STUB = 42;"), out.index("var page = 1;"))
        # No other host: the web font link, the preconnect and the policy's font and connection allowances are gone.
        self.assertNotIn("fonts.g", out)
        self.assertNotIn("connect-src", out)
        self.assertNotIn("{{", out)
        # The regular preview is not turned into a demo.
        r = run_build(self.tmp, "--preview")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn("__DEMO__", (self.tmp / "preview" / "hub.html").read_text(encoding="utf-8"))

    def test_demo_needs_the_hub_source_and_the_stub(self):
        r = run_build(self.tmp, "--demo")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("hub.src.html", r.stderr)
        (self.tmp / "hub.src.html").write_text(self.DEMO_HUB, encoding="utf-8")
        r = run_build(self.tmp, "--demo")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("preview-stub.js", r.stderr)

    def test_demo_is_git_ignored(self):
        self.assertIn("demo/", (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines())

    def test_spaced_placeholder_fails(self):
        (self.tmp / "fixture.src.html").write_text(FIXTURE + "<p>{{ LOGO_ORIG }}</p>", encoding="utf-8")
        r = run_build(self.tmp)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("{{", r.stderr)
        self.assertFalse((self.tmp / "fixture.html").exists())

    def test_mistyped_placeholder_fails(self):
        (self.tmp / "fixture.src.html").write_text(FIXTURE + "<img src=\"{{LOGO-INV}}\">", encoding="utf-8")
        r = run_build(self.tmp)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("{{LOGO-INV}}", r.stderr)
        self.assertFalse((self.tmp / "fixture.html").exists())

    def test_stub_with_braces_fails_preview(self):
        (self.tmp / "tools").mkdir()
        (self.tmp / "tools" / "preview-stub.js").write_text("var s = '{{LOGO_ORIG}}';", encoding="utf-8")
        r = run_build(self.tmp, "--preview")
        self.assertNotEqual(r.returncode, 0)
        self.assertFalse((self.tmp / "preview" / "fixture.html").exists())

    def test_include_inlined(self):
        (self.tmp / "parts").mkdir()
        (self.tmp / "parts" / "pool-lib.js").write_text("var LIB = {a: '{x}'};", encoding="utf-8")
        (self.tmp / "fixture.src.html").write_text(FIXTURE + "<script>{{POOL_LIB_JS}}</script>", encoding="utf-8")
        r = run_build(self.tmp)
        self.assertEqual(r.returncode, 0, r.stderr)
        out = (self.tmp / "fixture.html").read_text(encoding="utf-8")
        self.assertIn("<script>var LIB = {a: '{x}'};</script>", out)
        self.assertNotIn("{{", out)

    def test_missing_include_stops_build(self):
        (self.tmp / "fixture.src.html").write_text(FIXTURE + "<script>{{POOL_SCREEN_JS}}</script>", encoding="utf-8")
        r = run_build(self.tmp)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("parts/pool-screen.js", r.stderr)
        self.assertFalse((self.tmp / "fixture.html").exists())

    def test_code_placeholders_inline_wrapped_and_ascii(self):
        # Both modules keep a private LAYOUTS: each is wrapped in its own function, its export
        # keywords are stripped, and only the exports come out.
        (self.tmp / "pricing").mkdir()
        (self.tmp / "vendor").mkdir()
        (self.tmp / "pricing" / "adapters.js").write_text(
            "export const FORMATS = ['a'];\nconst LAYOUTS = { a: 1 };\n"
            "export function parseSupplierFile() { return LAYOUTS.a; }\n", encoding="utf-8")
        (self.tmp / "pricing" / "exports.js").write_text(
            "const LAYOUTS = { b: 2 };\nexport function workbookFor() { return LAYOUTS.b + 'café \u2014'; }\n",
            encoding="utf-8")
        (self.tmp / "vendor" / "xlsx.full.min.js").write_text(
            "var XLSX = {}; XLSX.note = 'a \u2014 b \U0001F600';", encoding="utf-8")
        (self.tmp / "fixture.src.html").write_text(
            "<script>const X = {{XLSX_LIB}}; const A = {{PRICING_ADAPTERS}}; const E = {{PRICING_EXPORTS}};</script>",
            encoding="utf-8")
        r = run_build(self.tmp)
        self.assertEqual(r.returncode, 0, r.stderr)
        out = (self.tmp / "fixture.html").read_text(encoding="utf-8")
        self.assertNotRegex(out, r"(?m)^export\b")
        self.assertNotIn("\u2014", out)
        self.assertTrue(out.isascii())
        self.assertIn("return { FORMATS, parseSupplierFile };", out)
        self.assertIn("return { workbookFor };", out)
        self.assertIn("a \\u2014 b \\ud83d\\ude00", out)
        node = shutil.which("node")
        if node:
            script = out[out.index("<script>") + 8: out.index("</script>")]
            check = subprocess.run(
                [node, "-e", script + "; console.log(JSON.stringify([X.note, A.parseSupplierFile(), "
                 "E.workbookFor(), Object.keys(A), Object.keys(E)]))"],
                capture_output=True, text=True, encoding="utf-8")
            self.assertEqual(check.returncode, 0, check.stderr)
            self.assertEqual(json.loads(check.stdout),
                             ["a \u2014 b \U0001F600", 1, "2café \u2014", ["FORMATS", "parseSupplierFile"], ["workbookFor"]])

    def test_code_placeholder_with_missing_file_fails(self):
        (self.tmp / "fixture.src.html").write_text("<script>const X = {{XLSX_LIB}};</script>", encoding="utf-8")
        r = run_build(self.tmp)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("vendor/xlsx.full.min.js", r.stderr)
        self.assertFalse((self.tmp / "fixture.html").exists())

    def test_code_with_script_end_fails(self):
        (self.tmp / "pricing").mkdir()
        (self.tmp / "pricing" / "exports.js").write_text("export const A = '</script>';", encoding="utf-8")
        (self.tmp / "fixture.src.html").write_text("<script>const E = {{PRICING_EXPORTS}};</script>", encoding="utf-8")
        r = run_build(self.tmp)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("</script", r.stderr)

    def test_no_src_files_does_nothing(self):
        (self.tmp / "fixture.src.html").unlink()
        r = run_build(self.tmp)
        self.assertEqual(r.returncode, 0)
        self.assertIn("No *.src.html", r.stdout)


class CommittedPagesTests(unittest.TestCase):
    def test_hub_html_is_the_build_of_hub_src(self):
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        shutil.copytree(ASSETS, tmp / "assets")
        shutil.copytree(ROOT / "parts", tmp / "parts")
        shutil.copytree(ROOT / "vendor", tmp / "vendor")
        shutil.copytree(ROOT / "pricing", tmp / "pricing")
        shutil.copytree(ROOT / "dpf", tmp / "dpf")
        shutil.copy(ROOT / "hub.src.html", tmp / "hub.src.html")
        copy_pricing_code(tmp)
        r = run_build(tmp)
        self.assertEqual(r.returncode, 0, r.stderr)
        # Line endings are normalised first: a checkout with core.autocrlf=true (and no
        # .gitattributes) gives CRLF in both files, and that is not a stale build.
        lf = lambda b: b.replace(b"\r\n", b"\n")
        self.assertEqual(lf((tmp / "hub.html").read_bytes()), lf((ROOT / "hub.html").read_bytes()),
                         "hub.html is not the build of hub.src.html: run python build.py")

    def test_preview_of_the_hub_builds(self):
        # The committed hub and stub, built as python build.py --preview builds them.
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        shutil.copytree(ASSETS, tmp / "assets")
        shutil.copytree(ROOT / "parts", tmp / "parts")
        shutil.copytree(ROOT / "vendor", tmp / "vendor")
        shutil.copytree(ROOT / "pricing", tmp / "pricing")
        shutil.copytree(ROOT / "dpf", tmp / "dpf")
        shutil.copy(ROOT / "hub.src.html", tmp / "hub.src.html")
        copy_pricing_code(tmp)
        (tmp / "tools").mkdir()
        shutil.copy(ROOT / "tools" / "preview-stub.js", tmp / "tools" / "preview-stub.js")
        r = run_build(tmp, "--preview")
        self.assertEqual(r.returncode, 0, r.stderr)
        preview = (tmp / "preview" / "hub.html").read_text(encoding="utf-8")
        self.assertIn("var DV_PAGES = [", preview)
        self.assertLess(preview.index("var DV_PAGES = ["), preview.index('const DV_ENDPOINT = "'))
        # The Commission Engine's preview pages, made by tools/ce-preview-pages.mjs.
        self.assertIn("var CE_PAGES = [", preview)
        self.assertLess(preview.index("var CE_PAGES = ["), preview.index('const CE_ENDPOINT = "'))

    def test_no_personal_address_in_the_hub_or_its_stub(self):
        # Made-up people only: the preview stub and the built page name nobody by address.
        for path in (ROOT / "hub.html", ROOT / "hub.src.html", ROOT / "tools" / "preview-stub.js", *COMMISSION_FILES, *DPF_FILES):
            self.assertNotIn("philip.brook", path.read_text(encoding="utf-8").lower(), path.name)

    def test_hub_csp_is_unchanged(self):
        # The DNA Viewer talks to the same Supabase host as comms-web; the policy is not loosened.
        csp = ("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; "
               "font-src https://fonts.gstatic.com; img-src data:; connect-src https://rlpnbwjppylhcpybpqim.supabase.co; "
               "base-uri 'none'; form-action 'none'")
        page = (ROOT / "hub.src.html").read_text(encoding="utf-8")
        self.assertEqual(page.count('http-equiv="Content-Security-Policy"'), 1)
        self.assertIn('<meta http-equiv="Content-Security-Policy" content="%s">' % csp, page)

    def test_dv_sanitiser_refuses_hostile_input(self):
        # The real sanitiser, cut out of the built hub.html (not a copy), run in a headless
        # Chromium over tools/dv-sanitise-check.js, which says what it checks.
        page = (ROOT / "hub.html").read_text(encoding="utf-8")
        blocks = SANITISER.findall(page)
        self.assertEqual(len(blocks), 1, "hub.html must hold one DV SANITISER block")
        self.assertIn("body.append(dvSanitise(", page, "the DNA Viewer draws pages through the block")
        browser = next((b for b in BROWSERS if b and Path(b).is_file()), None)
        if browser is None:
            self.skipTest("no Chromium browser found (set DV_BROWSER to one)")
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        # "<\/" is "</" inside a JavaScript string, and cannot end the page's <script> early.
        check = (ROOT / "tools" / "dv-sanitise-check.js").read_text(encoding="utf-8").replace("</", "<\\/")
        (tmp / "check.html").write_text(
            "<!doctype html><html><head><meta charset=\"utf-8\"></head><body><pre id=\"result\"></pre>"
            "<script>" + blocks[0] + check + "</script></body></html>", encoding="utf-8")
        try:
            r = subprocess.run(
                [browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
                 "--user-data-dir=" + str(tmp / "profile"), "--virtual-time-budget=5000", "--dump-dom",
                 (tmp / "check.html").as_uri()],
                capture_output=True, text=True, encoding="utf-8", timeout=60)
        except subprocess.TimeoutExpired:
            # A dialog the input opened (an alert() in a frame, say) holds the page open.
            self.fail("the check page did not finish in 60 seconds: the input blocked it, so it ran")
        m = re.search(r'<pre id="result">(.*?)</pre>', r.stdout, re.S)
        self.assertTrue(m and m.group(1), "the check page wrote no result: %s" % r.stderr[-500:])
        result = json.loads(html.unescape(m.group(1)))
        if os.environ.get("DV_SANITISE_REPORT"):
            print(json.dumps(result, indent=1, ensure_ascii=False))
        # 18 for the DNA Viewer, then 4 for the Commission Engine's filter box (checkbox, checked,
        # label and br; a checkbox's handler; a password type).
        self.assertEqual(result["cases"], 22)
        self.assertEqual(result["fired"], 0, "an alert() in the input ran")
        failed = [c for c in result["results"] if c["problems"]]
        self.assertEqual(failed, [], json.dumps(failed, indent=1, ensure_ascii=False))

    def test_pool_tab_and_its_parts(self):
        page = (ROOT / "hub.src.html").read_text(encoding="utf-8")
        # The tab sits after DNA Viewer and before DNA Admin, for the tick or the decider.
        i_dv, i_pool, i_admin = (page.index('{ id: "%s"' % t) for t in ("dna_viewer", "dashboard_pool", "dna_admin"))
        self.assertLess(i_dv, i_pool)
        self.assertLess(i_pool, i_admin)
        self.assertIn('{ id: "dashboard_pool", label: "Dashboard Pool", allowed: (t) => t.includes(POOL_REVIEW) || !!(me && me.is_decider === true),', page)
        self.assertIn('items: [{ id: "boards", label: "Boards" }, { id: "summary", label: "Summary" }],', page)
        # The screen reads PoolLib as it loads, so the helpers are inlined first; the CSS is in the style.
        self.assertLess(page.index("{{POOL_LIB_JS}}"), page.index("{{POOL_SCREEN_JS}}"))
        self.assertLess(page.index("{{POOL_SCREEN_CSS}}"), page.index("</style>"))
        # Sign-out clears every tool.
        self.assertIn("clearMain(); BE.reset(); DV.reset(); POOL.reset(); PR.reset(); CE.reset();", page)

    def test_pool_fixed_copy(self):
        page = (ROOT / "hub.src.html").read_text(encoding="utf-8")
        for copy in (
            "Vote on as many boards as you feel necessary, including ones outside your own area.",
            "These figures are as at 30/09/2026. This board could not be refreshed after the database changes of late October.",
            "The Dashboard Pool has not been loaded yet.",
            "You've reviewed ${reviewed} of ${all.length}",
            '"Decided: kept"', '"Decided: dropped"', 'text: "Pass"',
            "Show the figures as a table", "Full screen",
            # The decider's parts.
            "${n} reviewers have voted", 'const FLAG = "Votes changed since decided";',
            '"Keep this board"', '"Drop this board"', '"Clear decision"', '"Awaiting decision"',
        ):
            self.assertIn(copy, page)

    def test_pool_keeps_only_the_board_id(self):
        # The Dashboard Pool module stores nothing but the open board's id.
        page = (ROOT / "hub.src.html").read_text(encoding="utf-8")
        module = page[page.index("  const POOL = (() => {"):page.index("  // ---------- DNA Admin")]
        self.assertEqual(re.findall(r"putStored\(([^,]+),", module), ["BOARD_KEY"])
        self.assertIn('const BOARD_KEY = "hub.pool.board";', module)
        for word in ("localStorage", "sessionStorage", "indexedDB", "innerHTML", "insertAdjacentHTML"):
            self.assertNotIn(word, module)

    def test_no_em_dash_in_the_hub_or_its_stub(self):
        for path in (ROOT / "hub.src.html", ROOT / "tools" / "preview-stub.js", ROOT / "tools" / "pool-preview-check.js",
                     *COMMISSION_FILES, *DPF_FILES):
            self.assertEqual(path.read_text(encoding="utf-8").count(chr(0x2014)), 0, path.name)

    def test_pool_preview_in_a_browser(self):
        # The preview hub, signed in through the stub, driven by tools/pool-preview-check.js in a
        # headless Chromium: voting, Pass, drafts, the fallback caveat, storage, sign-out, the tab
        # for the decider without the tick, and the decider's count, flag, decisions and Summary.
        browser = next((b for b in BROWSERS if b and Path(b).is_file()), None)
        if browser is None:
            self.skipTest("no Chromium browser found (set DV_BROWSER to one)")
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        shutil.copytree(ASSETS, tmp / "assets")
        shutil.copytree(ROOT / "parts", tmp / "parts")
        shutil.copytree(ROOT / "vendor", tmp / "vendor")
        shutil.copytree(ROOT / "pricing", tmp / "pricing")
        shutil.copytree(ROOT / "dpf", tmp / "dpf")
        shutil.copy(ROOT / "hub.src.html", tmp / "hub.src.html")
        (tmp / "tools").mkdir()
        shutil.copy(ROOT / "tools" / "preview-stub.js", tmp / "tools" / "preview-stub.js")
        r = run_build(tmp, "--preview")
        self.assertEqual(r.returncode, 0, r.stderr)
        preview = (tmp / "preview" / "hub.html").read_text(encoding="utf-8")
        signed_in = ("<script>localStorage.clear(); localStorage.setItem('dyce.hub.token', 'stubcheck');"
                     " localStorage.setItem('dyce.hub.where', JSON.stringify({tool: 'dashboard_pool', item: 'boards'}));"
                     " localStorage.setItem('hub.pool.board', 'example_widgets');</script>")
        check = (ROOT / "tools" / "pool-preview-check.js").read_text(encoding="utf-8").replace("</", "<\\/")
        i = preview.index("<script")
        page = preview[:i] + signed_in + preview[i:]
        j = page.rindex("</body>")  # the stub's made-up emails hold "</body>" too
        page = page[:j] + "<script>" + check + "</script>" + page[j:]
        (tmp / "check.html").write_text(page, encoding="utf-8")
        for query in ("as=reviewer", "as=decider", "as=admin", "as=viewer", "as=reviewer&poolempty=1"):
            with self.subTest(query=query):
                r = subprocess.run(
                    [browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
                     "--user-data-dir=" + str(tmp / ("profile-" + re.sub(r"\W", "-", query))),
                     "--virtual-time-budget=20000", "--dump-dom", (tmp / "check.html").as_uri() + "?" + query],
                    capture_output=True, text=True, encoding="utf-8", timeout=120)
                found = re.findall(r'<pre id="result">(.*?)</pre>', r.stdout, re.S)
                self.assertTrue(found and found[-1], "the check wrote no result: %s" % r.stderr[-500:])
                result = json.loads(html.unescape(found[-1]))
                if os.environ.get("POOL_CHECK_REPORT"):
                    print(json.dumps(result, indent=1, ensure_ascii=False))
                self.assertTrue(result["results"], "no checks ran")
                failed = [c for c in result["results"] if not c["ok"]]
                self.assertEqual(failed, [], json.dumps(failed, indent=1, ensure_ascii=False))

    def test_rail_preview_in_a_browser(self):
        # The preview hub, signed in through the stub and starting in Broker Emails, driven by
        # tools/rail-preview-check.js in a headless Chromium: the open tool's menu folds away and
        # comes back, another tool opens with its menu, and a tool with no items has nothing to fold.
        browser = next((b for b in BROWSERS if b and Path(b).is_file()), None)
        if browser is None:
            self.skipTest("no Chromium browser found (set DV_BROWSER to one)")
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        shutil.copytree(ASSETS, tmp / "assets")
        shutil.copytree(ROOT / "parts", tmp / "parts")
        shutil.copytree(ROOT / "vendor", tmp / "vendor")
        shutil.copytree(ROOT / "pricing", tmp / "pricing")
        shutil.copytree(ROOT / "dpf", tmp / "dpf")
        shutil.copy(ROOT / "hub.src.html", tmp / "hub.src.html")
        (tmp / "tools").mkdir()
        shutil.copy(ROOT / "tools" / "preview-stub.js", tmp / "tools" / "preview-stub.js")
        r = run_build(tmp, "--preview")
        self.assertEqual(r.returncode, 0, r.stderr)
        preview = (tmp / "preview" / "hub.html").read_text(encoding="utf-8")
        signed_in = ("<script>localStorage.clear(); localStorage.setItem('dyce.hub.token', 'stubcheck');"
                     " localStorage.setItem('dyce.hub.where', JSON.stringify({tool: 'broker_emails', item: 'new'}));</script>")
        check = (ROOT / "tools" / "rail-preview-check.js").read_text(encoding="utf-8").replace("</", "<\\/")
        i = preview.index("<script")
        page = preview[:i] + signed_in + preview[i:]
        j = page.rindex("</body>")
        page = page[:j] + "<script>" + check + "</script>" + page[j:]
        (tmp / "check.html").write_text(page, encoding="utf-8")
        for query in ("as=admin", "as=approveonly"):
            with self.subTest(query=query):
                r = subprocess.run(
                    [browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
                     "--user-data-dir=" + str(tmp / ("profile-" + re.sub(r"\W", "-", query))),
                     "--virtual-time-budget=20000", "--dump-dom", (tmp / "check.html").as_uri() + "?" + query],
                    capture_output=True, text=True, encoding="utf-8", timeout=120)
                found = re.findall(r'<pre id="result">(.*?)</pre>', r.stdout, re.S)
                self.assertTrue(found and found[-1], "the check wrote no result: %s" % r.stderr[-500:])
                result = json.loads(html.unescape(found[-1]))
                if os.environ.get("RAIL_CHECK_REPORT"):
                    print(json.dumps(result, indent=1, ensure_ascii=False))
                self.assertTrue(result["results"], "no checks ran")
                failed = [c for c in result["results"] if not c["ok"]]
                self.assertEqual(failed, [], json.dumps(failed, indent=1, ensure_ascii=False))

    def test_price_screen_preview_in_a_browser(self):
        # The preview hub, signed in through the stub and starting in Pricing > Supplier files, driven by
        # tools/price-preview-check.js in a headless Chromium (Phil Brook, 19/11/2026): with no gas band
        # sets the grid shows the ladder and New band set; a blank new set stays blank and the preview
        # waits until it is filled; Save saves and never applies; Apply saves a new set, then applies;
        # names already used are refused; View only sees no New band set or Save.
        browser = next((b for b in BROWSERS if b and Path(b).is_file()), None)
        if browser is None:
            self.skipTest("no Chromium browser found (set DV_BROWSER to one)")
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        shutil.copytree(ASSETS, tmp / "assets")
        shutil.copytree(ROOT / "parts", tmp / "parts")
        shutil.copytree(ROOT / "vendor", tmp / "vendor")
        shutil.copytree(ROOT / "pricing", tmp / "pricing")
        shutil.copytree(ROOT / "dpf", tmp / "dpf")
        shutil.copy(ROOT / "hub.src.html", tmp / "hub.src.html")
        (tmp / "tools").mkdir()
        shutil.copy(ROOT / "tools" / "preview-stub.js", tmp / "tools" / "preview-stub.js")
        r = run_build(tmp, "--preview")
        self.assertEqual(r.returncode, 0, r.stderr)
        preview = (tmp / "preview" / "hub.html").read_text(encoding="utf-8")
        signed_in = ("<script>localStorage.clear(); localStorage.setItem('dyce.hub.token', 'stubcheck');"
                     " localStorage.setItem('dyce.hub.where', JSON.stringify({tool: 'pricing', item: 'files'}));</script>")
        check = (ROOT / "tools" / "price-preview-check.js").read_text(encoding="utf-8").replace("</", "<\\/")
        i = preview.index("<script")
        page = preview[:i] + signed_in + preview[i:]
        j = page.rindex("</body>")
        page = page[:j] + "<script>" + check + "</script>" + page[j:]
        (tmp / "check.html").write_text(page, encoding="utf-8")
        for query in ("as=pricing", "as=pricingview"):
            with self.subTest(query=query):
                r = subprocess.run(
                    [browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
                     "--user-data-dir=" + str(tmp / ("profile-" + re.sub(r"\W", "-", query))),
                     "--window-size=1440,900", "--virtual-time-budget=120000", "--dump-dom", (tmp / "check.html").as_uri() + "?" + query],
                    capture_output=True, text=True, encoding="utf-8", timeout=180)
                found = re.findall(r'<pre id="result">(.*?)</pre>', r.stdout, re.S)
                self.assertTrue(found and found[-1], "the check wrote no result: %s" % r.stderr[-500:])
                result = json.loads(html.unescape(found[-1]))
                if os.environ.get("PRICE_CHECK_REPORT"):
                    print(json.dumps(result, indent=1, ensure_ascii=False))
                self.assertTrue(result["results"], "no checks ran")
                failed = [c for c in result["results"] if not c["ok"]]
                self.assertEqual(failed, [], json.dumps(failed, indent=1, ensure_ascii=False))

    def test_margins_screen_in_a_browser(self):
        # The Margins screen as Phil Brook's Margins mockup (19/11/2026), driven by
        # tools/margins-preview-check.js in a headless Chromium: the On chart row takes four band sets at
        # most; the Cell detail shows the cell's figures and its product's versions, with Restore as a
        # new change; Review changes and Save with a reason save through band_sets_save; View only sees
        # no Manage, Restore or Review.
        browser = next((b for b in BROWSERS if b and Path(b).is_file()), None)
        if browser is None:
            self.skipTest("no Chromium browser found (set DV_BROWSER to one)")
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        shutil.copytree(ASSETS, tmp / "assets")
        shutil.copytree(ROOT / "parts", tmp / "parts")
        shutil.copytree(ROOT / "vendor", tmp / "vendor")
        shutil.copytree(ROOT / "pricing", tmp / "pricing")
        shutil.copytree(ROOT / "dpf", tmp / "dpf")
        shutil.copy(ROOT / "hub.src.html", tmp / "hub.src.html")
        (tmp / "tools").mkdir()
        shutil.copy(ROOT / "tools" / "preview-stub.js", tmp / "tools" / "preview-stub.js")
        r = run_build(tmp, "--preview")
        self.assertEqual(r.returncode, 0, r.stderr)
        preview = (tmp / "preview" / "hub.html").read_text(encoding="utf-8")
        signed_in = ("<script>localStorage.clear(); localStorage.setItem('dyce.hub.token', 'stubcheck');"
                     " localStorage.setItem('dyce.hub.where', JSON.stringify({tool: 'pricing', item: 'bands'}));</script>")
        check = (ROOT / "tools" / "margins-preview-check.js").read_text(encoding="utf-8").replace("</", "<\\/")
        i = preview.index("<script")
        page = preview[:i] + signed_in + preview[i:]
        j = page.rindex("</body>")
        page = page[:j] + "<script>" + check + "</script>" + page[j:]
        (tmp / "check.html").write_text(page, encoding="utf-8")
        for query in ("as=pricing", "as=pricingview"):
            with self.subTest(query=query):
                r = subprocess.run(
                    [browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
                     "--user-data-dir=" + str(tmp / ("profile-" + re.sub(r"\W", "-", query))),
                     "--window-size=1440,900", "--virtual-time-budget=120000", "--dump-dom", (tmp / "check.html").as_uri() + "?" + query],
                    capture_output=True, text=True, encoding="utf-8", timeout=180)
                found = re.findall(r'<pre id="result">(.*?)</pre>', r.stdout, re.S)
                self.assertTrue(found and found[-1], "the check wrote no result: %s" % r.stderr[-500:])
                result = json.loads(html.unescape(found[-1]))
                if os.environ.get("MARGINS_CHECK_REPORT"):
                    print(json.dumps(result, indent=1, ensure_ascii=False))
                self.assertTrue(result["results"], "no checks ran")
                failed = [c for c in result["results"] if not c["ok"]]
                self.assertEqual(failed, [], json.dumps(failed, indent=1, ensure_ascii=False))

    def test_price_screen_makes_and_saves_band_sets(self):
        # Phil Brook, 19/11/2026: the Price screen makes band sets (the Margins page's form, shared),
        # keeps a blank one blank, waits for every band before previewing, and saves without applying
        # through the same save step Apply uses.
        src = (ROOT / "hub.src.html").read_text(encoding="utf-8")
        mine = src[src.index("// BEGIN PRICING"): src.index("// END PRICING")]
        ws = mine[mine.index("function workspace("): mine.index("// Band sets and splits (spec 4.4)")]
        self.assertEqual(mine.count("function newSetCard("), 1)
        self.assertIn("newSetCard({", ws)
        self.assertIn("open(newSetCard({", mine)
        self.assertEqual(mine.count('btn("Add to the grid"'), 1, "the form is written once")
        self.assertIn('btn("New product", () => newSetPanel(), "ghost small")', ws)
        self.assertIn('const saveBtn = btn("Save", () => doSave(), "ghost");', ws)
        self.assertIn('const applyBtn = btn("Apply", () => doApply(), "");', ws)
        self.assertEqual(ws.count('call("band_sets_save"'), 1, "Save and Apply share one save step")
        # bundle_save once, in the one save step: a change makes a new product configuration (Phil
        # Brook, 20/11/2026); the screen no longer updates one or saves a choice without margins.
        self.assertEqual(ws.count('call("bundle_save"'), 1)
        self.assertNotIn("bundleId: p.bundle.bundleId", ws)
        self.assertIn("async function saveStep(", ws)
        save = ws[ws.index("async function doSave("): ws.index("async function doApply(")]
        self.assertIn("saveStep(", save)
        self.assertNotIn('"apply"', save)
        self.assertNotIn("preview_selection", save)
        self.assertIn("No price has changed.", save)
        self.assertIn("saveStep(", ws[ws.index("async function doApply("):])
        self.assertIn("Fill every band of \" + gap.name + \" to see the preview.", ws)
        self.assertIn("G.firstGap(", ws)
        # The screen opens on the current product configuration, and a change is named with today's date.
        self.assertIn("G.currentConfig(bs.bundles, bs.bandSets, file.supplierId)", ws)
        # 20/11/2026: what is live comes first; the most recently saved configuration is the fallback.
        self.assertIn("G.liveChoice(liveInfo && liveInfo.rows, file.supplierId, file.fuel, bs.bandSets, bs.bundles)", ws)
        self.assertIn("Current: the live products (no saved product configuration matches).", ws)
        self.assertIn("G.defaultConfigName(", ws)
        self.assertIn('"New product configuration:"', ws)
        self.assertIn('"More options"', ws)
        self.assertIn('"Use a different product configuration"', ws)
        self.assertNotIn("They are saved when you apply.", mine)
        # The rules still show their sentences.
        self.assertIn("Choose at most \" + MAX_PICKS + \" products.", ws)
        self.assertIn("G.selectionProblem(", ws)
        self.assertIn("STALE_TEXT(c.name)", ws)
        # The grid shows the ladder's bands when there are no band sets.
        self.assertIn("opts.emptyText", mine)
        stub = (ROOT / "tools" / "preview-stub.js").read_text(encoding="utf-8")
        self.assertIn("Gamma_gas_example_06112026.xlsx", stub)
        self.assertNotIn('addNamed("gas"', stub)

    def test_pricing_tab_is_in_the_built_hub(self):
        page = (ROOT / "hub.html").read_text(encoding="utf-8")
        src = (ROOT / "hub.src.html").read_text(encoding="utf-8")
        self.assertIn('id: "pricing", label: "Pricing"', page)
        self.assertIn('allowed: (t) => t.some((c) => c.startsWith("pricing."))', page)
        for item in ("files", "bands", "splits", "book"):
            self.assertIn('{ id: "%s"' % item, page)
        # Margins and Splits are two screens (plain-words change, 18/11/2026), margins first.
        self.assertIn('{ id: "bands", label: "Margins", need: PR_VIEW }', page)
        self.assertIn('{ id: "splits", label: "Splits", need: PR_VIEW }', page)
        self.assertLess(page.index('{ id: "bands"'), page.index('{ id: "splits"'))
        # Runs and publishing is gone: files are priced from the Supplier files workspace.
        self.assertNotIn('{ id: "runs", label: "Runs and publishing"', page)
        self.assertIn("/functions/v1/dna-pricing", page)
        # The three inlined modules: the spreadsheet library, the adapters and the exports.
        self.assertIn("SheetJS", page)
        self.assertIn("function parseSupplierFile(", page)
        self.assertIn("return { FORMATS, ROW_KEYS, parseSupplierFile };", page)
        self.assertIn("function workbookFor(", page)
        self.assertIn("return { BROKER_SHEET, BROKER_GAS_SHEET, UD_SHEET, BROKER_HEADER, BROKER_GAS_HEADER, UD_HEADER, UD_MIN_TERM_MONTHS, brokerSheet, brokerGasSheet, udUploadSheet, workbookFor };", page)
        self.assertIn("function selectionProblem(", page)
        self.assertIn("return { parseMargin,", page)
        self.assertIn("function bookHealth(", page)
        self.assertNotIn("{{", page)
        # The source holds the placeholders; the build holds the code.
        for key in ("XLSX_LIB", "PRICING_ADAPTERS", "PRICING_EXPORTS", "PRICING_GRID", "PRICING_HEALTH"):
            self.assertIn("{{%s}}" % key, src)
        self.assertNotRegex(page, r"(?m)^export\b")

    def test_no_em_dash_in_the_built_hub(self):
        # The inlined library holds em dashes; they are written as escapes, so none is in the page.
        self.assertNotIn("\u2014", (ROOT / "hub.html").read_text(encoding="utf-8"))
        self.assertNotIn("\u2014", (ROOT / "hub.src.html").read_text(encoding="utf-8"))

    def test_pricing_never_says_activate_and_keeps_no_data_in_storage(self):
        # R15: the page never activates a file. Browser storage holds only the hub's two keys.
        src = (ROOT / "hub.src.html").read_text(encoding="utf-8")
        mine = src[src.index("// BEGIN PRICING"): src.index("// END PRICING")]
        self.assertNotIn("activate", mine.lower())
        for word in ("localStorage", "sessionStorage", "indexedDB", "innerHTML", "getStored", "putStored"):
            self.assertNotIn(word, mine, word)
        self.assertEqual(set(re.findall(r"dyce\.hub\.[a-z]+", src)), {"dyce.hub.token", "dyce.hub.where"})

    def test_pricing_stub_answers_every_op_with_four_ticks(self):
        stub = (ROOT / "tools" / "preview-stub.js").read_text(encoding="utf-8")
        ops = ("overview split_list book_live book_rows book_check band_set_retire "
               "split_save split_publish apply publish_abandon output_upload_url output_record "
               "output_link band_sets band_set_history band_sets_save bundle_save bundle_retire ladder_save "
               "file_regions preview_selection").split()
        for op in ops:
            self.assertIn('"%s"' % op, stub, op)
        for tick in ("pricing.view", "pricing.load", "pricing.set", "pricing.publish"):
            self.assertIn('"%s"' % tick, stub, tick)
        self.assertIn("pricing:", stub)
        # Ops no screen calls any more have no stub answer (task 9).
        mine = stub[stub.index("// ---------- Pricing: the dna-pricing"): stub.index("// ---------- Commission Engine")]
        for gone in ("file_start", "file_rows", "file_finish", "file_reject", "run_set", "run_set_prepare", "preview", "band_set_get", "band_set_new", "band_set_copy", "band_set_save", "band_set_approve", "publish"):
            self.assertNotIn('"%s"' % gone, mine, gone)

    def test_supplier_files_has_no_hand_load_and_links_each_price_book_to_its_folder(self):
        src = (ROOT / "hub.src.html").read_text(encoding="utf-8")
        mine = src[src.index("// BEGIN PRICING"): src.index("// END PRICING")]
        self.assertIn('PR_HEALTH.folderUrl(b.folder), target: "_blank", rel: "noopener"', mine)
        self.assertNotIn("Load a file by hand", mine)
        for gone in ("loadCard", "file_start", "file_rows", "file_finish", "drawReport", "splitRows", "T.load"):
            self.assertNotIn(gone, mine, gone)

    def test_band_sets_and_splits_screen_calls_the_v2_ops(self):
        src = (ROOT / "hub.src.html").read_text(encoding="utf-8")
        mine = src[src.index("// BEGIN PRICING"): src.index("// END PRICING")]
        for op in ("band_sets", "band_set_history", "band_sets_save", "band_set_retire", "bundle_save",
                   "bundle_retire", "ladder_save", "split_list", "split_save", "split_publish"):
            self.assertIn('"%s"' % op, mine, op)
        for gone in ("band_set_new", "band_set_copy", "band_set_save", "band_set_approve", "function drawEditor", "async function splits("):
            self.assertNotIn(gone, mine, gone)
        # Publishing a split no longer reprices anything, so the page does not say it did.
        self.assertNotIn("r.runsPrepared", mine[mine.index("// Band sets and splits (spec 4.4)"): mine.index("// After Apply: wait for the book")])
        self.assertIn("G.toSavePayload(", mine)
        self.assertIn("return { show, reset, drawGrid };", mine)

    def test_pricing_page_shows_the_database_figures(self):
        # The load report shows the rows the database holds (M7); the hand-load card no longer reports runs
        # prepared; the preview shows the figures the function works out (sellAnnualPence, marginAnnualPence).
        src = (ROOT / "hub.src.html").read_text(encoding="utf-8")
        mine = src[src.index("// BEGIN PRICING"): src.index("// END PRICING")]
        self.assertIn("sellAnnualPence", mine)
        self.assertIn("marginAnnualPence", mine)
        self.assertNotIn("sell_tac_pence", mine)
        self.assertNotIn('"Rows loaded: " + comma(added)', mine)
        self.assertNotIn("runs_prepared", mine)
        self.assertNotIn("run_set_prepare", mine)
        self.assertNotIn("Load a file by hand", mine)
        stub = (ROOT / "tools" / "preview-stub.js").read_text(encoding="utf-8")
        self.assertIn("sellAnnualPence", stub)
        self.assertNotIn("runs_prepared", stub)

    def test_price_this_file_workspace_calls_the_v2_ops(self):
        src = (ROOT / "hub.src.html").read_text(encoding="utf-8")
        mine = src[src.index("// BEGIN PRICING"): src.index("// END PRICING")]
        for op in ("overview", "file_regions", "preview_selection", "apply", "band_sets", "band_sets_save", "bundle_save", "book_live", "publish_abandon"):
            self.assertIn('"%s"' % op, mine, op)
        for gone in ('call("run_set"', 'call("preview"', 'call("publish"', "async function runs(", "function previewCard(", "function prepareCard("):
            self.assertNotIn(gone, mine, gone)
        # The three states of a file the list shows, and the one sentence for a stale band set.
        self.assertIn('btn(f.state === "live" ? "Reprice" : "Price"', mine)
        self.assertIn("f.canApply", mine)
        self.assertIn("was made on an older ladder. Open it on Margins and save it again.", mine)
        self.assertIn("Separate acquisition and renewal", mine)
        self.assertNotIn("Same for acquisition and renewal", mine)
        for gone in ('"Update " + src.name', '"New version of "', '"Save the changed products"', '"Save as product configuration"'):
            self.assertNotIn(gone, mine, gone)
        self.assertIn("G.selectionProblem(", mine)
        self.assertIn("G.toPreviewItems(", mine)
        # Attention items are keyed by product and sale type (ruling P8), in camelCase, in the page and the stub.
        stub = (ROOT / "tools" / "preview-stub.js").read_text(encoding="utf-8")
        self.assertIn("attention.push({ product: it.product, saleType: it.saleType, issue:", stub)
        self.assertIn("rangeMinKwh:", stub)
        self.assertIn("rateCount:", stub)
        self.assertNotIn("range_min_kwh", mine)
        self.assertNotIn("a.label ||", mine)
        self.assertIn("a.rangeMinKwh", mine)
        # Edits are kept unless something was actually saved before a refusal.
        self.assertIn("if (err && err.savedSomething) {", mine)
        self.assertNotIn("afterSave", mine)
        self.assertIn("afterPublish(", mine)
        self.assertIn("makeFiles(", mine)
        # afterPublish and makeFiles are not inside a removed screen.
        self.assertIn("async function afterPublish(set, before, box, alive)", mine)

    def test_pricing_says_product_configuration_not_bundle(self):
        # Phil Brook, 19/11/2026: in what a person reads on the Pricing tab a bundle is a "product
        # configuration". Code names (bundleId, bundle_save, bundle_retire, the "bundle" switch value)
        # keep the old word; a text with a space in it is something a person reads.
        src = (ROOT / "hub.src.html").read_text(encoding="utf-8")
        mine = src[src.index("// BEGIN PRICING"): src.index("// END PRICING")]
        texts = [t for t in re.findall(r'"([^"\n]*)"', mine) if " " in t]
        self.assertEqual([t for t in texts if re.search(r"(?i)bundle|pricing configuration", t)], [])
        # Phil Brook, 19/11/2026: a band set is a "product" in what a person reads, and what was the
        # product (Standard, Gold and so on) is the "product type". Op names such as band_sets_save keep
        # the old words.
        self.assertEqual([t for t in texts if re.search(r"(?i)band sets?\b", t)], [])
        for text in ('"By product type"', 'field("Product type", prod)', '"Manage products"', '"New product"', '"Versions of this product"'):
            self.assertIn(text, mine, text)
        grid = (ROOT / "pricing" / "grid.js").read_text(encoding="utf-8")
        self.assertIn("rows.push({ k: 'Product type', v:", grid)
        self.assertEqual(re.findall(r"'[^'\n]*band sets?\b[^'\n]*'", grid), [])
        for text in ('"By product configuration"', '"New product configuration"', '"Edit product configuration members"',
                     '"Retire product configuration"', '"New product configuration:"', '"Use a different product configuration"',
                     '"None (all suppliers)"', '"All suppliers"'):
            self.assertIn(text, mine, text)

    def test_pricing_plain_words_and_usability(self):
        # The plain-words change (18/11/2026): the preview as a table of annual cost by usage and
        # term, Manage and a save bar on Margins, Check a price on the Live price book, region names,
        # and the database's attention codes as sentences.
        src = (ROOT / "hub.src.html").read_text(encoding="utf-8")
        mine = src[src.index("// BEGIN PRICING"): src.index("// END PRICING")]
        for text in ("function drawPivot(", '"All rates and margins"', '"Check before applying"', 'class: "savebar"',
                     '"Manage products"', "async function splitsPage(n)", '"Check a price"', 'call("book_check"',
                     "const ISSUE_TEXT = {", "const regionText = ", "const personName = ", '"Rebuild files"', '"Abandon update"'):
            self.assertIn(text, mine, text)
        for gone in ('"Engine version"', '"Proposed sell annual cost"', '"Make the files again"', '"Band sets to price with"',
                     '"Rows loaded of source"', '"Apply this choice"', "Nothing is saved until", '"Show it"'):
            self.assertNotIn(gone, mine, gone)
        # A grid item holding a wide table does not push the page sideways.
        self.assertIn("#pr .card > * { min-width: 0; }", src)

    def test_this_file_holds_no_em_dash(self):
        # M6: the em dashes this file tests for are written as escapes.
        self.assertNotIn("\u2014", Path(__file__).read_text(encoding="utf-8"))

    def test_commission_tab_and_its_parts(self):
        page = (ROOT / "hub.src.html").read_text(encoding="utf-8")
        # The tab sits after Dashboard Pool (and Pricing) and before DNA Admin, for any commission tick.
        i_pool, i_ce, i_admin = (page.index('{ id: "%s"' % t) for t in ("dashboard_pool", "commission", "dna_admin"))
        self.assertLess(i_pool, i_ce)
        self.assertLess(i_ce, i_admin)
        self.assertIn('const CE_VIEW = "commission.view", CE_DECIDE = "commission.decide";', page)
        self.assertIn('{ id: "commission", label: "Commission Engine", allowed: (t) => t.some((c) => c.startsWith("commission.")),', page)
        # Decide alone opens Lines and Exceptions (spec 4.2.1, the function's PAGE_TICKS); Decisions and
        # Runs need View. A need may be a list, and both menu filters read it through mayOpen.
        self.assertIn('items: [{ id: "lines", label: "Lines", group: "Monthly run", need: [CE_VIEW, CE_DECIDE] },', page)
        self.assertIn('{ id: "exceptions", label: "Exceptions", group: "Monthly run", need: [CE_VIEW, CE_DECIDE] },', page)
        self.assertIn("const mayOpen = (x) => !x.need || [].concat(x.need).some((c) => ticks().includes(c));", page)
        self.assertIn("const hasItems = (t) => t.items.some(mayOpen);", page)
        self.assertIn("const items = t.items.filter(mayOpen);", page)
        self.assertNotIn("ticks().includes(x.need)", page)
        self.assertNotIn("Piece 1 is read-only", page)
        self.assertNotIn("Piece 1 of the Commission Engine is read-only", page)
        self.assertIn('{ id: "decisions", label: "Decisions", group: "Monthly run", need: CE_VIEW },', page)
        self.assertIn('{ id: "runs", label: "Runs", group: "Monthly run", need: CE_VIEW }],', page)
        self.assertIn("render: renderCommission },", page)
        # The module uses the hub's session, helpers and sanitiser, so it is inlined inside the
        # hub's script after the sanitiser; its styles are in the style element.
        self.assertLess(page.index("  // END DV SANITISER"), page.index("{{COMMISSION_JS}}"))
        self.assertLess(page.index("{{COMMISSION_JS}}"), page.index("  // ---------- Dashboard Pool"))
        self.assertLess(page.index("{{COMMISSION_CSS}}"), page.index("</style>"))
        # Sign-out clears every tool, the Commission Engine last.
        self.assertIn("clearMain(); BE.reset(); DV.reset(); POOL.reset(); PR.reset(); CE.reset();", page)

    def test_commission_module_talks_only_to_its_function_and_keeps_nothing(self):
        js = (ROOT / "parts" / "commission.js").read_text(encoding="utf-8")
        self.assertIn('const CE_ENDPOINT = "https://rlpnbwjppylhcpybpqim.supabase.co/functions/v1/commission-engine";', js)
        # Its own allowlist of the function's pages (ruling R6), the four deciding pages added in piece 2;
        # DNA Viewer's pagePath is not widened. /uplift is a form action only, never a page.
        self.assertIn('const PAGES = new Set(["/runs", "/run", "/lines", "/line", "/exceptions", "/decisions", "/decision",'
                      ' "/decide", "/set-broker", "/choose-broker", "/resolve"]);', js)
        # A form that posts is an act call, its action named by the form's path.
        self.assertIn('const ACT = { "/decide": "decide", "/uplift": "enter_uplift", "/set-broker": "set_broker",'
                      ' "/choose-broker": "choose_broker", "/resolve": "resolve" };', js)
        self.assertIn('call("act", { action, fields })', js)
        # Every value of a form is sent, repeats kept, with the button that sent it (Yes or No).
        self.assertEqual(js.count("new FormData(f, e.submitter || null)"), 1, "one reading of a form, for get and post")
        # The dropdown saves on change; a blank No reason is stopped in the page by the function's
        # five characters, with the laptop's sentence.
        self.assertIn('r.addEventListener("change", onChange);', js)
        self.assertIn('r.addEventListener("keydown", onKeydown);', js)
        # A Yes from the keyboard waits for Save or Enter (Chrome and Edge fire change per arrow key);
        # only a Yes picked with the mouse or touch is sent at once. Unknown counts as the keyboard.
        self.assertIn('r.addEventListener("pointerdown", onPoint);', js)
        self.assertIn('r.addEventListener("mousedown", onPoint);', js)
        self.assertIn('if (by === "pointer") { if (why) why.hidden = true; decide(box, "Yes", ""); return; }', js)
        # A save keeps its place when go is the form's own next on the page's path ("this page").
        self.assertIn("keyOf(own) === keyOf(t)", js)
        self.assertIn(r'const BLANK = " \u00a0\t\r\n";', js)
        self.assertIn('"Withholding payment needs a stated reason. This is the row that stops a broker being paid, '
                      'and a blank reason is the one decision nobody can review later."', js)
        # Controls are held by the DOM while a call is on its way (the sanitiser drops a disabled attribute).
        self.assertIn("c.disabled = true", js)
        # The footer says what is written, and no longer that nothing changes.
        self.assertIn("Decisions, uplifts, brokers and resolutions you save here are written to dyce-prod straight away.", js)
        self.assertNotIn("Nothing on these pages changes", js)
        self.assertIn("body.append(dvSanitise(", js)
        self.assertIn("signal: AbortSignal.timeout(30000)", js)
        self.assertIn('showSignIn("Your session has ended. Sign in again.")', js)
        self.assertIn("return { show, reset };", js)
        self.assertEqual(js.count("fetch("), 1, "one fetch, to CE_ENDPOINT")
        # A link that moves the page under another menu item updates the line above the content and
        # the last place through the hub's own helpers.
        self.assertIn("if (it) { keepWhere(tool, it); setCrumb(tool, it); }", js)
        # Nothing stored: dyce.hub.where (the hub's own) is all that is kept, and the page's HTML
        # goes in only through the sanitiser.
        for word in ("localStorage", "sessionStorage", "indexedDB", "putStored", "getStored", "document.cookie",
                     "innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "location.hash", "history."):
            self.assertNotIn(word, js)

    def test_dv_page_paths_unchanged(self):
        page = (ROOT / "hub.src.html").read_text(encoding="utf-8")
        self.assertIn(r'const pagePath = (v) => !/[\x00-\x1f\\]/.test(v) && /^\/(?!\/)/.test(v);', page)
        self.assertIn('const PATHS = { search: "/", reporting: "/reporting", queue: "/queue" };', page)
        # The sanitiser's lists: label and br added, checkbox and checked for the filter box.
        self.assertIn('const HTML_TAGS = new Set(["a", "b", "br", "button", "div", "form", "h2", "h3", "i", "input", "label", '
                      '"option", "p", "section", "select", "span", "table", "tbody", "thead", "td", "th", "tr"]);', page)
        self.assertIn('input: ["type", "name", "value", "placeholder", "required", "accept", "checked"],', page)
        self.assertIn('/^(hidden|text|search|file|checkbox)$/i', page)

    def test_commission_preview_pages_in_the_stub(self):
        # The stub holds the four pages and their details, rendered by the function's own code.
        stub = (ROOT / "tools" / "preview-stub.js").read_text(encoding="utf-8")
        start = stub.index("  // BEGIN COMMISSION ENGINE PAGES")
        block = stub[start:stub.index("  // END COMMISSION ENGINE PAGES")]
        self.assertNotIn("</", block)
        self.assertNotIn("<!", block)
        paths = set(re.findall(r'"path":"(/[a-z-]+)"', block))
        self.assertTrue({"/runs", "/lines", "/exceptions", "/decisions", "/run", "/line", "/decision",
                         "/decide", "/set-broker", "/choose-broker", "/resolve"} <= paths, paths)
        self.assertIn('{ code: "commission.view", tool: "Commission Engine", label: "View" }', stub)
        # Piece 2: the Decide tick, the act op's answers and the function's own sentences.
        self.assertIn('{ code: "commission.decide", tool: "Commission Engine", label: "Decide" }', stub)
        self.assertIn("  var CE_SAY = {", block)
        self.assertIn("function ceAct(", stub)
        self.assertIn('ceview: "cy.example@dyce-energy.co.uk"', stub)
        self.assertIn('cedecide: "dee.example@dyce-energy.co.uk"', stub)

    def test_commission_preview_in_a_browser(self):
        # The preview hub, signed in through the stub, driven by tools/ce-preview-check.js in a
        # headless Chromium: the tab and its side menu, the four pages, links and the filter form
        # (repeated parameters kept), the broker search, a refusal, storage and sign-out.
        browser = next((b for b in BROWSERS if b and Path(b).is_file()), None)
        if browser is None:
            self.skipTest("no Chromium browser found (set DV_BROWSER to one)")
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        shutil.copytree(ASSETS, tmp / "assets")
        shutil.copytree(ROOT / "parts", tmp / "parts")
        shutil.copytree(ROOT / "vendor", tmp / "vendor")
        shutil.copytree(ROOT / "pricing", tmp / "pricing")
        shutil.copytree(ROOT / "dpf", tmp / "dpf")
        shutil.copy(ROOT / "hub.src.html", tmp / "hub.src.html")
        (tmp / "tools").mkdir()
        shutil.copy(ROOT / "tools" / "preview-stub.js", tmp / "tools" / "preview-stub.js")
        r = run_build(tmp, "--preview")
        self.assertEqual(r.returncode, 0, r.stderr)
        preview = (tmp / "preview" / "hub.html").read_text(encoding="utf-8")
        signed_in = ("<script>localStorage.clear(); localStorage.setItem('dyce.hub.token', 'stubcheck');"
                     " localStorage.setItem('dyce.hub.where', JSON.stringify({tool: 'commission', item: 'runs'}));</script>")
        check = (ROOT / "tools" / "ce-preview-check.js").read_text(encoding="utf-8").replace("</", "<\\/")
        i = preview.index("<script")
        page = preview[:i] + signed_in + preview[i:]
        j = page.rindex("</body>")
        page = page[:j] + "<script>" + check + "</script>" + page[j:]
        (tmp / "check.html").write_text(page, encoding="utf-8")
        # ?as=ceview: View only, so no decide control is drawn and nothing is sent. ?as=cedecide:
        # Decide only, so the menu is Lines and Exceptions, and Lines opens with its controls.
        for query in ("as=admin", "as=viewer", "as=ceview", "as=cedecide"):
            with self.subTest(query=query):
                r = subprocess.run(
                    [browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
                     "--user-data-dir=" + str(tmp / ("profile-" + re.sub(r"\W", "-", query))),
                     "--virtual-time-budget=60000", "--dump-dom", (tmp / "check.html").as_uri() + "?" + query],
                    capture_output=True, text=True, encoding="utf-8", timeout=180)
                found = re.findall(r'<pre id="result">(.*?)</pre>', r.stdout, re.S)
                self.assertTrue(found and found[-1], "the check wrote no result: %s" % r.stderr[-500:])
                result = json.loads(html.unescape(found[-1]))
                if os.environ.get("CE_CHECK_REPORT"):
                    print(json.dumps(result, indent=1, ensure_ascii=False))
                self.assertTrue(result["results"], "no checks ran")
                failed = [c for c in result["results"] if not c["ok"]]
                self.assertEqual(failed, [], json.dumps(failed, indent=1, ensure_ascii=False))

    def test_dpf_tab_and_its_parts(self):
        page = (ROOT / "hub.src.html").read_text(encoding="utf-8")
        # The tab sits after the Commission Engine and before DNA Admin, for the View tick.
        i_ce, i_dpf, i_admin = (page.index('{ id: "%s"' % t) for t in ("commission", "dpf", "dna_admin"))
        self.assertLess(i_ce, i_dpf)
        self.assertLess(i_dpf, i_admin)
        self.assertIn('const DPF_VIEW = "dpf.view", DPF_ENTER = "dpf.enter";', page)
        self.assertIn('{ id: "dpf", label: "DPF figures", allowed: (t) => t.includes(DPF_VIEW),', page)
        self.assertIn('items: [{ id: "months", label: "Months", need: DPF_VIEW }, { id: "history", label: "History", need: DPF_VIEW }],', page)
        # The module uses SheetJS and the hub's helpers, so it is inlined after both; its styles are in the style element.
        self.assertLess(page.index("const PR_XLSX = {{XLSX_LIB}};"), page.index("const DPF_IMPORT = {{DPF_IMPORT}};"))
        self.assertLess(page.index("{{COMMISSION_JS}}"), page.index("{{DPF_JS}}"))
        self.assertLess(page.index("{{DPF_JS}}"), page.index("  // ---------- Dashboard Pool"))
        self.assertLess(page.index("{{DPF_CSS}}"), page.index("</style>"))
        self.assertIn("CE.reset(); DPF.reset();", page)
        built = (ROOT / "hub.html").read_text(encoding="utf-8")
        self.assertIn("function readTemplate(", built)
        self.assertIn("function rowsForYear(", built)
        self.assertNotIn("readPlanWorkbook", built)
        self.assertNotRegex(built, r"(?m)^export\b")

    def test_dpf_module_calls_only_the_dpf_actions_and_keeps_nothing(self):
        js = (ROOT / "parts" / "dpf.js").read_text(encoding="utf-8")
        self.assertEqual(sorted(set(re.findall(r'api\("(dpf_[a-z_]+)"', js))),
                         ["dpf_history", "dpf_items", "dpf_save", "dpf_state"])
        self.assertNotIn("fetch(", js)
        for word in ("localStorage", "sessionStorage", "indexedDB", "putStored", "getStored", "innerHTML", "outerHTML", "insertAdjacentHTML"):
            self.assertNotIn(word, js)
        # Every source the page sends is one the design allows.
        self.assertEqual(sorted(set(re.findall(r'source: "([a-z_]+)"', js))), ["form", "template"])
        stub = (ROOT / "tools" / "preview-stub.js").read_text(encoding="utf-8")
        for action in ("dpf_items", "dpf_state", "dpf_save", "dpf_upload", "dpf_sign_off", "dpf_unsign", "dpf_history"):
            self.assertIn('"%s"' % action, stub, action)
        for persona in ('dpfview: "vera.example@dyce-energy.co.uk"', 'dpfenter: "eli.example@dyce-energy.co.uk"', 'dpfsign: "carl.example@dyce-energy.co.uk"'):
            self.assertIn(persona, stub)

    def test_dpf_preview_in_a_browser(self):
        # The preview hub, signed in through the stub and starting in DPF figures > Months, driven by
        # tools/dpf-preview-check.js in a headless Chromium: typing into the grid and saving, each
        # month's status with no sign-off, the template downloaded and read back into the grid,
        # History, and what View only, View and Enter, and no tick show.
        browser = next((b for b in BROWSERS if b and Path(b).is_file()), None)
        if browser is None:
            self.skipTest("no Chromium browser found (set DV_BROWSER to one)")
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        shutil.copytree(ASSETS, tmp / "assets")
        shutil.copytree(ROOT / "parts", tmp / "parts")
        shutil.copytree(ROOT / "vendor", tmp / "vendor")
        shutil.copytree(ROOT / "pricing", tmp / "pricing")
        shutil.copytree(ROOT / "dpf", tmp / "dpf")
        shutil.copy(ROOT / "hub.src.html", tmp / "hub.src.html")
        (tmp / "tools").mkdir()
        shutil.copy(ROOT / "tools" / "preview-stub.js", tmp / "tools" / "preview-stub.js")
        r = run_build(tmp, "--preview")
        self.assertEqual(r.returncode, 0, r.stderr)
        preview = (tmp / "preview" / "hub.html").read_text(encoding="utf-8")
        signed_in = ("<script>localStorage.clear(); localStorage.setItem('dyce.hub.token', 'stubcheck');"
                     " localStorage.setItem('dyce.hub.where', JSON.stringify({tool: 'dpf', item: 'months'}));</script>")
        check = (ROOT / "tools" / "dpf-preview-check.js").read_text(encoding="utf-8").replace("</", "<\\/")
        i = preview.index("<script")
        page = preview[:i] + signed_in + preview[i:]
        j = page.rindex("</body>")
        page = page[:j] + "<script>" + check + "</script>" + page[j:]
        (tmp / "check.html").write_text(page, encoding="utf-8")
        for query in ("as=dpfsign", "as=dpfenter", "as=dpfview", "as=viewer", "as=admin"):
            with self.subTest(query=query):
                r = subprocess.run(
                    [browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
                     "--user-data-dir=" + str(tmp / ("profile-" + re.sub(r"\W", "-", query))),
                     "--virtual-time-budget=60000", "--dump-dom", (tmp / "check.html").as_uri() + "?" + query],
                    capture_output=True, text=True, encoding="utf-8", timeout=180)
                found = re.findall(r'<pre id="result">(.*?)</pre>', r.stdout, re.S)
                self.assertTrue(found and found[-1], "the check wrote no result: %s" % r.stderr[-500:])
                result = json.loads(html.unescape(found[-1]))
                if os.environ.get("DPF_CHECK_REPORT"):
                    print(json.dumps(result, indent=1, ensure_ascii=False))
                self.assertTrue(result["results"], "no checks ran")
                failed = [c for c in result["results"] if not c["ok"]]
                self.assertEqual(failed, [], json.dumps(failed, indent=1, ensure_ascii=False))

    def test_send_html_only_forwards_to_the_hub(self):
        page = (ROOT / "send.html").read_text(encoding="utf-8")
        self.assertIn('<meta http-equiv="refresh" content="0; url=hub.html">', page)
        self.assertIn('<a href="hub.html">The broker emails page is now part of the DNA Hub</a>', page)
        self.assertNotIn("<script", page)
        self.assertNotIn("connect-src", page)


if __name__ == "__main__":
    unittest.main()


class DemoPageTests(unittest.TestCase):
    def test_the_built_demo_labels_every_screen_and_never_reaches_a_real_endpoint(self):
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        shutil.copytree(ASSETS, tmp / "assets")
        shutil.copytree(ROOT / "parts", tmp / "parts")
        (tmp / "tools").mkdir()
        shutil.copy(ROOT / "tools" / "preview-stub.js", tmp / "tools" / "preview-stub.js")
        shutil.copy(ROOT / "hub.src.html", tmp / "hub.src.html")
        copy_pricing_code(tmp)
        r = run_build(tmp, "--demo")
        self.assertEqual(r.returncode, 0, r.stderr)
        out = (tmp / "demo" / "pricing-demo.html").read_text(encoding="utf-8")
        self.assertIn("Demo: invented prices", out)
        self.assertIn("Reset demo", out)
        self.assertNotIn(chr(0x2014), out)
        # No request to any host: the policy allows none, there is no web font link, and the stub
        # replaces fetch so that in demo mode no address falls through to the page's own fetch.
        self.assertNotIn("connect-src", out)
        self.assertNotIn("fonts.googleapis", out)
        self.assertIn("var realFetch = !DEMO && window.fetch", out)
        self.assertIn("PR_ENDPOINT ? prCall(body)", out)
        # The regular preview and the published page have no demo.
        self.assertNotIn("__DEMO__ = true", (ROOT / "hub.src.html").read_text(encoding="utf-8"))

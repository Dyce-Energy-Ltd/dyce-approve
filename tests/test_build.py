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
# The Commission Engine tab's own files.
COMMISSION_FILES = (ROOT / "parts" / "commission.js", ROOT / "parts" / "commission.css",
                    ROOT / "tools" / "ce-preview-pages.mjs", ROOT / "tools" / "ce-preview-check.js")
FIXTURE = (
    "<html><body><img src=\"{{LOGO_ORIG}}\"><img src=\"{{LOGO_INV}}\">"
    "<script>var page = 1;</script></body></html>"
)


def copy_pricing_code(folder):
    # The files {{XLSX_LIB}}, {{PRICING_ADAPTERS}}, {{PRICING_EXPORTS}} and {{PRICING_GRID}} in hub.src.html read.
    (folder / "vendor").mkdir(exist_ok=True)
    (folder / "pricing").mkdir(exist_ok=True)
    shutil.copy(ROOT / "vendor" / "xlsx.full.min.js", folder / "vendor" / "xlsx.full.min.js")
    for name in ("adapters.js", "exports.js", "grid.js"):
        shutil.copy(ROOT / "pricing" / name, folder / "pricing" / name)


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
        for path in (ROOT / "hub.html", ROOT / "hub.src.html", ROOT / "tools" / "preview-stub.js", *COMMISSION_FILES):
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
                     *COMMISSION_FILES):
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

    def test_pricing_tab_is_in_the_built_hub(self):
        page = (ROOT / "hub.html").read_text(encoding="utf-8")
        src = (ROOT / "hub.src.html").read_text(encoding="utf-8")
        self.assertIn('id: "pricing", label: "Pricing"', page)
        self.assertIn('allowed: (t) => t.some((c) => c.startsWith("pricing."))', page)
        for item in ("files", "bands", "splits", "runs", "book"):
            self.assertIn('{ id: "%s"' % item, page)
        self.assertIn("/functions/v1/dna-pricing", page)
        # The three inlined modules: the spreadsheet library, the adapters and the exports.
        self.assertIn("SheetJS", page)
        self.assertIn("function parseSupplierFile(", page)
        self.assertIn("return { FORMATS, ROW_KEYS, parseSupplierFile };", page)
        self.assertIn("function workbookFor(", page)
        self.assertIn("return { BROKER_SHEET, UD_SHEET, BROKER_HEADER, UD_HEADER, brokerSheet, udUploadSheet, workbookFor };", page)
        self.assertIn("function selectionProblem(", page)
        self.assertIn("return { parseMargin,", page)
        self.assertNotIn("{{", page)
        # The source holds the placeholders; the build holds the code.
        for key in ("XLSX_LIB", "PRICING_ADAPTERS", "PRICING_EXPORTS", "PRICING_GRID"):
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
        ops = ("overview band_set_get split_list run_set preview book_live book_rows file_start file_rows "
               "file_finish file_reject band_set_new band_set_copy band_set_save band_set_approve band_set_retire "
               "split_save split_publish run_set_prepare publish publish_abandon output_upload_url output_record "
               "output_link").split()
        for op in ops:
            self.assertIn('"%s"' % op, stub, op)
        for tick in ("pricing.view", "pricing.load", "pricing.set", "pricing.publish"):
            self.assertIn('"%s"' % tick, stub, tick)
        self.assertIn("pricing:", stub)

    def test_pricing_page_shows_the_database_figures(self):
        # R31: the preview shows the figures pricing.preview_run works out at the usage typed (I1),
        # the load report the rows the database holds (M7), and a set can be prepared again (I3).
        src = (ROOT / "hub.src.html").read_text(encoding="utf-8")
        mine = src[src.index("// BEGIN PRICING"): src.index("// END PRICING")]
        self.assertIn("sell_annual_pence", mine)
        self.assertIn("margin_annual_pence", mine)
        self.assertNotIn("sell_tac_pence", mine)
        self.assertNotIn("margin_pence)", mine)
        self.assertIn("rep.row_count_loaded", mine)
        self.assertNotIn('"Rows loaded: " + comma(added)', mine)
        self.assertEqual(mine.count('call("run_set_prepare"'), 2, "on the set screen and after Abandon")
        self.assertIn("Prepare again", mine)
        stub = (ROOT / "tools" / "preview-stub.js").read_text(encoding="utf-8")
        self.assertIn("sell_annual_pence", stub)
        self.assertIn("row_count_loaded", stub)

    def test_this_file_holds_no_em_dash(self):
        # M6: the em dashes this file tests for are written as escapes.
        self.assertNotIn("\u2014", Path(__file__).read_text(encoding="utf-8"))

    def test_commission_tab_and_its_parts(self):
        page = (ROOT / "hub.src.html").read_text(encoding="utf-8")
        # The tab sits after Dashboard Pool (and Pricing) and before DNA Admin, for any commission tick.
        i_pool, i_ce, i_admin = (page.index('{ id: "%s"' % t) for t in ("dashboard_pool", "commission", "dna_admin"))
        self.assertLess(i_pool, i_ce)
        self.assertLess(i_ce, i_admin)
        self.assertIn('const CE_VIEW = "commission.view";', page)
        self.assertIn('{ id: "commission", label: "Commission Engine", allowed: (t) => t.some((c) => c.startsWith("commission.")),', page)
        self.assertIn('items: [{ id: "lines", label: "Lines", group: "Monthly run", need: CE_VIEW },', page)
        self.assertIn('{ id: "exceptions", label: "Exceptions", group: "Monthly run", need: CE_VIEW },', page)
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
        # Its own allowlist of the function's seven pages (ruling R6); DNA Viewer's pagePath is not widened.
        self.assertIn('const PAGES = new Set(["/runs", "/run", "/lines", "/line", "/exceptions", "/decisions", "/decision"]);', js)
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
        paths = set(re.findall(r'"path":"(/[a-z]+)"', block))
        self.assertTrue({"/runs", "/lines", "/exceptions", "/decisions", "/run", "/line", "/decision"} <= paths, paths)
        self.assertIn('{ code: "commission.view", tool: "Commission Engine", label: "View" }', stub)

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
        for query in ("as=admin", "as=viewer"):
            with self.subTest(query=query):
                r = subprocess.run(
                    [browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
                     "--user-data-dir=" + str(tmp / ("profile-" + re.sub(r"\W", "-", query))),
                     "--virtual-time-budget=20000", "--dump-dom", (tmp / "check.html").as_uri() + "?" + query],
                    capture_output=True, text=True, encoding="utf-8", timeout=120)
                found = re.findall(r'<pre id="result">(.*?)</pre>', r.stdout, re.S)
                self.assertTrue(found and found[-1], "the check wrote no result: %s" % r.stderr[-500:])
                result = json.loads(html.unescape(found[-1]))
                if os.environ.get("CE_CHECK_REPORT"):
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

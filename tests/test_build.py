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
FIXTURE = (
    "<html><body><img src=\"{{LOGO_ORIG}}\"><img src=\"{{LOGO_INV}}\">"
    "<script>var page = 1;</script></body></html>"
)


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
        shutil.copy(ROOT / "hub.src.html", tmp / "hub.src.html")
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
        shutil.copy(ROOT / "hub.src.html", tmp / "hub.src.html")
        (tmp / "tools").mkdir()
        shutil.copy(ROOT / "tools" / "preview-stub.js", tmp / "tools" / "preview-stub.js")
        r = run_build(tmp, "--preview")
        self.assertEqual(r.returncode, 0, r.stderr)
        preview = (tmp / "preview" / "hub.html").read_text(encoding="utf-8")
        self.assertIn("var DV_PAGES = [", preview)
        self.assertLess(preview.index("var DV_PAGES = ["), preview.index('const DV_ENDPOINT = "'))

    def test_no_personal_address_in_the_hub_or_its_stub(self):
        # Made-up people only: the preview stub and the built page name nobody by address.
        for path in (ROOT / "hub.html", ROOT / "hub.src.html", ROOT / "tools" / "preview-stub.js"):
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
        self.assertEqual(result["cases"], 18)
        self.assertEqual(result["fired"], 0, "an alert() in the input ran")
        failed = [c for c in result["results"] if c["problems"]]
        self.assertEqual(failed, [], json.dumps(failed, indent=1, ensure_ascii=False))

    def test_send_html_only_forwards_to_the_hub(self):
        page = (ROOT / "send.html").read_text(encoding="utf-8")
        self.assertIn('<meta http-equiv="refresh" content="0; url=hub.html">', page)
        self.assertIn('<a href="hub.html">The broker emails page is now part of the DNA Hub</a>', page)
        self.assertNotIn("<script", page)
        self.assertNotIn("connect-src", page)


if __name__ == "__main__":
    unittest.main()

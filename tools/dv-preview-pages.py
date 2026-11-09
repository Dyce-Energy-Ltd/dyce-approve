"""Copy the DNA Viewer's golden pages into tools/preview-stub.js, for the hub's preview.

    python tools/dv-preview-pages.py <golden folder>

<golden folder> is supabase/functions/dna-viewer/golden in a dyce-spine checkout: the pages the
dna-viewer function gives, made by the laptop contract library's own Python over invented data.
Each page becomes one answer of the preview stub's page op, shaped as the function's
{title, sub, badges, sections, html, sync}: the account pages' body is the history, then each
section as <section class="panel" id="..."> (golden INDEX.md), and the warning and sync badges,
which pages.json holds as HTML, become {text, state}. The lines between the BEGIN and END
markers in the stub are replaced; nothing else in it changes. Run it again when the goldens change.
"""
import html
import json
import re
import sys
from pathlib import Path

STUB = Path(__file__).resolve().parent / "preview-stub.js"
BEGIN = "  // BEGIN DNA VIEWER PAGES"
END = "  // END DNA VIEWER PAGES"
BADGE = re.compile(r'<span class="badge (ok|warn|critical|info|neutral)">(.*?)</span>')


def badges(text, name):
    found = [{"text": html.unescape(t), "state": s} for s, t in BADGE.findall(text or "")]
    if BADGE.sub("", text or "").strip():
        raise SystemExit("%s: badges that are not <span class=\"badge state\">: %r" % (name, text))
    return found


def page_body(folder, name, page):
    files = page["files"]
    if not page["sections"]:
        return (folder / files[0]).read_text(encoding="utf-8")
    body = ""
    if name + "-history.html" in files:
        body = (folder / (name + "-history.html")).read_text(encoding="utf-8")
    for pid, _label in page["sections"]:
        inner = (folder / ("%s-%s.html" % (name, pid))).read_text(encoding="utf-8")
        body += '<section class="panel" id="%s">%s</section>' % (pid, inner)
    return body


def main(argv):
    if len(argv) != 1:
        raise SystemExit(__doc__)
    folder = Path(argv[0])
    pages = json.loads((folder / "pages.json").read_text(encoding="utf-8"))
    lines = []
    for name, page in pages.items():
        answer = {
            "name": name,
            "requests": [page["request"]] + page.get("sameAs", []),
            "title": page["title"],
            "sub": page["sub"],
            "badges": badges(page["warnings"], name),
            "sections": [{"id": i, "label": l} for i, l in page["sections"]] if page["sections"] else None,
            "html": page_body(folder, name, page),
            "sync": {"text": page["sync"]["text"], "badges": badges(page["sync"]["badges"], name)},
        }
        # ASCII only, and no "</" or "<!", so the stub is safe inside the page's <script>.
        text = json.dumps(answer, ensure_ascii=True, separators=(",", ":"))
        lines.append("    " + text.replace("</", "<\\/").replace("<!", "<\\u0021") + ",")
    stub = STUB.read_text(encoding="utf-8")
    start, end = stub.index(BEGIN), stub.index(END)
    head = stub[:start] + BEGIN + ": made by tools/dv-preview-pages.py from dyce-spine's golden folder. Do not edit by hand.\n"
    block = "  var DV_PAGES = [\n" + "\n".join(lines) + "\n  ];\n"
    STUB.write_text(head + block + stub[end:], encoding="utf-8", newline="\n")
    print("wrote %d pages into %s" % (len(lines), STUB.name))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

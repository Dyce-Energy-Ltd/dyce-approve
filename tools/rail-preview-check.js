// A check of the rail's folding menu in the preview hub (preview/hub.html, with
// tools/preview-stub.js). tests/test_build.py builds the preview, puts this file at the end of the
// page, opens it in a headless browser signed in through the stub (?as= in the address), starting
// in Broker Emails, and reads the answer this writes into a pre element with the id "result". It is
// not part of any page the hub serves.
//
// ?as=admin: the open tool's menu shows under its name; clicking the open tool's name folds the
// menu away and brings it back without changing the page; the glow moves to the tool while folded;
// clicking another tool's name opens that tool with its menu showing; a move inside a folded tool
// keeps it folded. ?as=approveonly: Broker Emails has no menu items, so its name has nothing to
// fold and clicking it changes nothing.
(() => {
  const q = new URLSearchParams(location.search);
  const as = q.get("as") || "admin";
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: ok ? "" : String(detail ?? "") });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(f, tries) {
    for (let i = 0; i < (tries || 80); i++) { let v = null; try { v = f(); } catch { v = null; } if (v) return v; await sleep(50); }
    return null;
  }
  const $ = (s, r) => (r || document).querySelector(s);
  const tool = (id) => $(`#tabs button[data-tool="${id}"]`);
  const menu = () => $("#sidemenu");
  const shown = () => !menu().hidden;
  const crumb = () => $("#crumb").textContent;
  const glowY = () => parseInt(getComputedStyle($("#tabs")).getPropertyValue("--glow-y"), 10);
  const middleOf = (b) => { const r = b.getBoundingClientRect(); return Math.round(r.top - $("#tabs").getBoundingClientRect().top + r.height / 2); };
  function done() { const pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify({ as, results }); document.body.append(pre); }

  async function admin() {
    if (!(await until(() => tool("broker_emails") && menu().querySelector("button[data-item]")))) { check("the rail is drawn", false, $("#tabs").textContent); return; }
    const be = tool("broker_emails");
    check("open tool is current and expanded", be.getAttribute("aria-current") === "true" && be.getAttribute("aria-expanded") === "true",
      be.outerHTML);
    check("menu shows under the open tool", shown() && be.nextElementSibling === menu());
    check("another tool is not expanded", tool("dna_viewer").getAttribute("aria-expanded") === "false", tool("dna_viewer").outerHTML);
    const before = crumb();

    be.click(); await sleep(50);
    check("clicking the open tool folds its menu", !shown() && tool("broker_emails").getAttribute("aria-expanded") === "false", menu().hidden);
    check("folding leaves the page as it was", crumb() === before && !$("#be").hidden && tool("broker_emails").getAttribute("aria-current") === "true", crumb());
    // The glow slides for 300 ms, so wait for it to settle.
    check("the glow sits behind the tool while folded", await until(() => Math.abs(glowY() - middleOf(tool("broker_emails"))) <= 1),
      glowY() + " vs " + middleOf(tool("broker_emails")));

    tool("broker_emails").click(); await sleep(50);
    check("clicking it again brings the menu back", shown() && tool("broker_emails").getAttribute("aria-expanded") === "true", menu().hidden);
    const cur = menu().querySelector('[aria-current="page"]');
    check("the glow goes back to the current item", cur && await until(() => Math.abs(glowY() - middleOf(cur)) <= 1), glowY());

    tool("dna_viewer").click();
    await until(() => tool("dna_viewer") && tool("dna_viewer").getAttribute("aria-current") === "true");
    check("clicking another tool opens it with its menu", shown() && tool("dna_viewer").nextElementSibling === menu()
      && tool("dna_viewer").getAttribute("aria-expanded") === "true" && /^DNA Viewer/.test(crumb()), crumb());
    check("the previous tool is no longer expanded", tool("broker_emails").getAttribute("aria-expanded") === "false");

    tool("dna_viewer").click(); await sleep(50);
    check("the new tool folds too", !shown());
    window.showTool("dna_viewer", "reporting"); await sleep(50);
    check("a move inside a folded tool keeps it folded", !shown() && /Reporting$/.test(crumb()), crumb());

    tool("broker_emails").click();
    await until(() => tool("broker_emails").getAttribute("aria-current") === "true");
    check("moving to another tool opens its menu again", shown() && tool("broker_emails").getAttribute("aria-expanded") === "true");
  }

  async function approveOnly() {
    if (!(await until(() => tool("broker_emails")))) { check("the rail is drawn", false, $("#tabs").textContent); return; }
    await sleep(200);
    const be = tool("broker_emails");
    check("a tool with no menu items has nothing to fold", !be.hasAttribute("aria-expanded") && !shown(), be.outerHTML);
    const before = crumb();
    be.click(); await sleep(100);
    check("clicking it changes nothing", !shown() && crumb() === before && tool("broker_emails").getAttribute("aria-current") === "true", crumb());
  }

  (async () => {
    try {
      if (as === "approveonly") await approveOnly();
      else await admin();
    } catch (e) { check("the check ran", false, String(e && e.stack || e)); }
    done();
  })();
})();

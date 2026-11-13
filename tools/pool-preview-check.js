// A check of the Dashboard Pool tab in the preview hub (preview/hub.html, with
// tools/preview-stub.js). tests/test_build.py builds the preview, puts this file at the end of the
// page, opens it in a headless browser signed in through the stub (?as= in the address) and reads
// the answer this writes into a pre element with the id "result". It is not part of any page the
// hub serves.
//
// ?as=reviewer: the opening line, the count, marks, a vote, an audience tick, a change to Pass
// (the ticks clear), a typed note that survives moving to another board and a save there, the
// fallback caveat on the board that fell back, notes shown as text, the only storage key, and
// sign-out clearing the tool. ?as=decider: the tab shows without the Review tick, and voting is
// not offered, and the decision panel is. ?as=admin (the decider, who also holds the tick): "N of M
// reviewers have voted" with no names, the audience picks, a former reviewer's vote, the two
// filters, a decision, a later vote by Sam (through __stub.poolVote) raising the flag, saving the
// same decision again clearing it, clearing the decision, and the Summary's count, flag and
// reviewer filter. ?as=viewer: no tab. ?poolempty=1: the not-loaded sentence.
(() => {
  const FLAG = "Votes changed since decided";
  const FALLBACK = "These figures are as at 30/09/2026. This board could not be refreshed after the database changes of late October.";
  const OPENING = "Vote on as many boards as you feel necessary, including ones outside your own area.";
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
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const button = (text, r) => $$("button", r).find((b) => b.textContent.trim() === text);
  const boardButton = (id) => $(`#sidemenu button[data-board="${id}"]`);
  const text = (s) => ($(s) ? $(s).textContent : "");
  const voteLines = () => $$("#pool .pool-votes li").map((li) => li.firstChild.textContent);
  const calls = (action) => window.__stub.calls.filter((c) => c.action === action);
  const lastVote = () => { const c = calls("pool_vote"); return c.length ? c[c.length - 1] : null; };
  function done() { const pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify({ as, results }); document.body.append(pre); }

  async function reviewer() {
    if (!(await until(() => $("#pool .pool-board-head h2")))) { check("the board is drawn", false, document.body.textContent.slice(0, 300)); return; }
    check("opening line", text("#pool .stand") === OPENING, text("#pool .stand"));
    check("count starts at 0 of 3", text("#sidemenu .pool-count") === "You've reviewed 0 of 3", text("#sidemenu .pool-count"));
    const b1 = boardButton("example_widgets");
    check("board 1 marked To review and Decided: kept", b1 && /To review/.test(b1.textContent) && /Decided: kept/.test(b1.textContent), b1 && b1.textContent);
    check("the screen is drawn and scaled", $("#pool .dwrap .dscreen") && /scale\(/.test($("#pool .dwrap .dscreen").style.transform), $("#pool .dwrap") && $("#pool .dwrap").outerHTML.slice(0, 200));
    check("no caveat on a refreshed board", !$("#pool .pool-caveat"));
    check("decision line", text("#pool .pool-decision") === "Decided: kept, for Wallboard", text("#pool .pool-decision"));
    check("everyone's votes", voteLines().includes("Sam Example: Keep (Wallboard, App: Sales). Useful on the wall by the line."), voteLines().join(" | "));
    check("Full screen and the figures table are offered", button("Full screen", $("#pool")) && text("#pool details.pool-figs summary") === "Show the figures as a table");
    // The decider's parts are not drawn for a reviewer, though board 1's votes changed since it was decided.
    check("no decider parts for a reviewer", !button("Keep this board", $("#pool")) && !$("#pool .pool-voted") && !$("#pool .pool-picks") && !$(".pool-flag") && !$("#poolAwaiting") && !$("#poolChanged") && $("#pool .pool-decide").hidden,
      text("#pool .pool-decide") + " | " + text(".pool-flag"));

    // Vote Keep: saved, counted, marked.
    button("Keep", $("#pool")).click();
    await until(() => /Saved/.test(text("#pool .pool-saved")));
    check("Keep saved", lastVote() && lastVote().args.verdict === "keep" && lastVote().status === 200, JSON.stringify(lastVote()));
    check("count moves to 1 of 3", text("#sidemenu .pool-count") === "You've reviewed 1 of 3", text("#sidemenu .pool-count"));
    check("board 1 marked Keep", /Keep/.test(boardButton("example_widgets").textContent));
    check("Keep is pressed", button("Keep", $("#pool")).getAttribute("aria-pressed") === "true");

    // Clicking the chosen verdict again, with nothing else changed, sends nothing.
    const before = calls("pool_vote").length;
    button("Keep", $("#pool")).click();
    await sleep(400);
    check("re-clicking the chosen verdict sends no vote", calls("pool_vote").length === before, calls("pool_vote").length - before);

    // Tick an audience.
    const sales = $$("#pool fieldset.pool-aud label").find((l) => l.textContent.trim() === "App: Sales");
    check("audience ticks on Keep", !!sales);
    if (sales) { sales.querySelector("input").click(); await until(() => voteLines().includes("Rae Example: Keep (App: Sales)")); }
    check("audience saved", JSON.stringify(lastVote().args.audiences) === '["app_sales"]' && voteLines().includes("Rae Example: Keep (App: Sales)"), voteLines().join(" | "));

    // Change to Pass: the ticks clear and are not offered.
    $("#pool .pool-pass").click();
    await until(() => voteLines().includes("Rae Example: Pass"));
    check("Pass saved with no audiences", lastVote().args.verdict === "pass" && JSON.stringify(lastVote().args.audiences) === "[]", JSON.stringify(lastVote().args));
    check("no audience ticks on Pass", !$("#pool fieldset.pool-aud"));
    check("Pass is pressed", $("#pool .pool-pass").getAttribute("aria-pressed") === "true");
    check("board 1 marked Pass", /Pass/.test(boardButton("example_widgets").textContent));

    // A note typed and not saved survives moving to another board and a save there.
    const ta = $("#poolNote"); ta.value = "Typed, not saved"; ta.dispatchEvent(new Event("input", { bubbles: true }));
    boardButton("example_parcels").click();
    await until(() => /Parcels waiting/.test(text("#pool .pool-board-head h2")));
    check("board 2's note is empty", $("#poolNote").value === "", $("#poolNote").value);
    check("a note is text, not markup", voteLines().some((l) => l.includes("<i>Not</i> needed")) && !$("#pool .pool-votes i"), voteLines().join(" | "));
    button("Drop", $("#pool")).click();
    await until(() => voteLines().includes("Rae Example: Drop"));
    check("Drop saved on board 2", lastVote().args.board === "example_parcels" && lastVote().args.verdict === "drop");
    boardButton("example_widgets").click();
    await until(() => /Widgets made/.test(text("#pool .pool-board-head h2")));
    check("the typed note is still there", $("#poolNote").value === "Typed, not saved", $("#poolNote").value);
    check("the saved vote has no note yet", voteLines().includes("Rae Example: Pass"), voteLines().join(" | "));
    button("Save note", $("#pool")).click();
    await until(() => voteLines().includes("Rae Example: Pass. Typed, not saved"));
    check("Save note saves the note with the vote", lastVote().args.note === "Typed, not saved" && lastVote().args.verdict === "pass", JSON.stringify(lastVote().args));

    // The board that fell back carries the caveat above its screen.
    boardButton("example_plan").click();
    await until(() => /Plan against actual/.test(text("#pool .pool-board-head h2")));
    const cav = $("#pool .pool-caveat"), frame = $("#pool .pool-frame");
    check("fallback caveat, exact", cav && cav.textContent === FALLBACK, cav && cav.textContent);
    check("caveat above the screen", cav && frame && (cav.compareDocumentPosition(frame) & Node.DOCUMENT_POSITION_FOLLOWING));
    check("fallback board's figures date", /Figures as at 30\/09\/2026/.test(text("#pool .pool-board-head .hint")), text("#pool .pool-board-head .hint"));

    // The To review filter leaves only board 3, the one not yet marked; then the Summary counts.
    $("#poolToReview").click();
    await sleep(50);
    const left = $$("#sidemenu button[data-board]").map((b) => b.dataset.board);
    check("To review filter", JSON.stringify(left) === '["example_plan"]', left.join(","));
    button("Summary", $("#sidemenu")).click();
    await until(() => $("#pool table.pool-sum tbody tr"));
    const r1 = $$("#pool table.pool-sum tbody tr")[0];
    check("Summary row 1", r1 && [...r1.cells].map((c) => c.textContent).slice(2).join("|") === "1|0|0|1|Decided: kept, for Wallboard", r1 && [...r1.cells].map((c) => c.textContent).join("|"));

    // Only the open board's id is kept in storage.
    const keys = Object.keys(localStorage).sort();
    check("storage keys", JSON.stringify(keys) === JSON.stringify(["dyce.hub.token", "dyce.hub.where", "hub.pool.board"]), keys.join(","));
    check("open board id kept", localStorage.getItem("hub.pool.board") === "example_plan", localStorage.getItem("hub.pool.board"));

    // Sign-out clears the tool: nothing of the votes, notes or figures stays in the page.
    $("#signOutBtn").click();
    await sleep(200);
    check("sign-out removes the tool", !$("#pool") && !$(".pool-side") && !$("#signin").hidden);
    // The page's text without its scripts (the stub's invented data is in one).
    const shown = document.body.cloneNode(true);
    for (const n of shown.querySelectorAll("script")) n.remove();
    check("sign-out leaves no names or notes", !/Sam Example|Typed, not saved|Widgets made/.test(shown.textContent), shown.textContent.slice(0, 300));
    check("the open board's id stays", localStorage.getItem("hub.pool.board") === "example_plan");
  }

  async function decider() {
    if (!(await until(() => $("#pool .pool-board-head h2")))) { check("the board is drawn", false, document.body.textContent.slice(0, 300)); return; }
    check("tab shows without the Review tick", button("Dashboard Pool", $("#tabs")) && !/dashboard_pool\.review/.test(JSON.stringify(window.__stub.calls.find((c) => c.action === "me").answer)));
    check("decider learnt from pool_state", calls("pool_state").length >= 1);
    await until(() => /Voting needs/.test(text("#pool")));
    check("voting not offered", !button("Keep", $("#pool")) && /Voting needs the Review tick in DNA Admin\./.test(text("#pool")));
    check("the decision panel is offered", button("Keep this board", $("#pool")) && button("Drop this board", $("#pool")) && button("Clear decision", $("#pool")));
    check("N of M without the decider, who has no tick", text("#pool .pool-voted") === "1 of 1 reviewers have voted", text("#pool .pool-voted"));
  }

  // The decider, with the Review tick: Admin Example and Sam are the reviewers; Alex is a former one.
  async function admin() {
    const decideBox = () => $("#pool .pool-decide");
    const ticked = () => $$("#pool .pool-decide fieldset.pool-aud label").filter((l) => l.querySelector("input").checked).map((l) => l.textContent.trim());
    const tickIn = (label) => { const l = $$("#pool .pool-decide fieldset.pool-aud label").find((x) => x.textContent.trim() === label); if (l) l.querySelector("input").click(); return !!l; };
    const sideList = () => $$("#sidemenu button[data-board]").map((b) => b.dataset.board);
    const topFlag = () => $("#pool .pool-decision-box .pool-flag");
    const lastCall = (a) => { const c = calls(a); return c.length ? c[c.length - 1] : null; };
    if (!(await until(() => $("#pool .pool-board-head h2") && $("#pool .pool-voted")))) { check("the decider's board is drawn", false, document.body.textContent.slice(0, 300)); return; }

    // Board 1: Sam voted Keep after the decision, so the flag shows; Admin Example has not voted.
    check("N of M on board 1", text("#pool .pool-voted") === "1 of 2 reviewers have voted", text("#pool .pool-voted"));
    check("no names of who has not voted", !/Admin Example|admin\.example/.test(text("#pool")), text("#pool .pool-votes"));
    check("audience picks", text("#pool .pool-picks") === "Audiences picked: Wallboard 1 · App: Sales 1", text("#pool .pool-picks"));
    check("flag beside the decision", topFlag() && topFlag().textContent === FLAG, text("#pool .pool-decision-box"));
    check("flag in the board list", boardButton("example_widgets").textContent.includes(FLAG), boardButton("example_widgets").textContent);
    check("decision panel", !decideBox().hidden && button("Keep this board", decideBox()) && button("Drop this board", decideBox()) && button("Clear decision", decideBox()));
    check("ticks start from the kept decision", JSON.stringify(ticked()) === '["Wallboard"]', ticked().join(","));

    // The two filters.
    $("#poolChanged").click(); await sleep(50);
    check("Votes changed since decided filter", JSON.stringify(sideList()) === '["example_widgets"]', sideList().join(","));
    $("#poolChanged").click(); $("#poolAwaiting").click(); await sleep(50);
    check("Awaiting decision filter", JSON.stringify(sideList()) === '["example_plan","example_parcels"]', sideList().join(","));
    $("#poolAwaiting").click(); await sleep(50);

    // Board 2: Alex's vote is a former reviewer's and not counted; nothing picked, nothing ticked.
    boardButton("example_parcels").click();
    await until(() => /Parcels waiting/.test(text("#pool .pool-board-head h2")));
    check("former reviewer marked", voteLines().includes("Alex Example (former reviewer): Drop. <i>Not</i> needed: the depots have their own list."), voteLines().join(" | "));
    check("a former reviewer is not counted", text("#pool .pool-voted") === "0 of 2 reviewers have voted", text("#pool .pool-voted"));
    check("no audiences picked", text("#pool .pool-picks") === "No audiences picked yet." && ticked().length === 0, text("#pool .pool-picks") + " " + ticked().join(","));
    check("not decided, no Clear decision", /Not decided\./.test(text("#pool .pool-decide")) && !button("Clear decision", decideBox()) && $("#pool .pool-decision-box").hidden);

    // Decide: tick Wallboard (nothing is sent), then Keep this board.
    const d0 = calls("pool_decide").length;
    check("a tick is in the panel", tickIn("Wallboard"));
    await sleep(300);
    check("a tick alone sends nothing", calls("pool_decide").length === d0 && JSON.stringify(ticked()) === '["Wallboard"]', ticked().join(","));
    button("Keep this board", decideBox()).click();
    await until(() => text("#pool .pool-decision") === "Decided: kept, for Wallboard");
    check("decided", lastCall("pool_decide") && JSON.stringify(lastCall("pool_decide").args) === '{"board":"example_parcels","decision":"keep","audiences":["wall"]}' && lastCall("pool_decide").status === 200,
      JSON.stringify(lastCall("pool_decide")));
    check("no flag after deciding", !topFlag() && !boardButton("example_parcels").textContent.includes(FLAG));
    check("the board list shows the decision", /Decided: kept/.test(boardButton("example_parcels").textContent));

    // Sam votes after the decision, from elsewhere; the page sees it when the tool is shown again.
    window.__stub.poolVote("sam.example@dyce-energy.co.uk", "example_parcels", "maybe", ["app_ops"], "");
    $('#sidemenu button[data-item="boards"]').click();
    await until(() => topFlag());
    check("the later vote shows", voteLines().includes("Sam Example: Maybe (App: Operations)"), voteLines().join(" | "));
    check("the flag shows after a later vote", topFlag() && topFlag().textContent === FLAG && boardButton("example_parcels").textContent.includes(FLAG));
    check("N of M moves on", text("#pool .pool-voted") === "1 of 2 reviewers have voted", text("#pool .pool-voted"));
    check("the panel says how to clear the flag", text("#pool .pool-decide").includes(FLAG + ". Saving the decision again, changed or not, clears this."), text("#pool .pool-decide"));

    // Saving the same decision again is sent, and clears the flag.
    const d1 = calls("pool_decide").length;
    button("Keep this board", decideBox()).click();
    await until(() => !topFlag() && calls("pool_decide").length > d1);
    check("the same decision is sent again", calls("pool_decide").length === d1 + 1 && JSON.stringify(lastCall("pool_decide").args) === '{"board":"example_parcels","decision":"keep","audiences":["wall"]}',
      JSON.stringify(calls("pool_decide").slice(d1)));
    check("re-saving clears the flag", !topFlag() && !boardButton("example_parcels").textContent.includes(FLAG));

    // Clear the decision: Not decided, and the ticks go back to the most-picked audiences.
    button("Clear decision", decideBox()).click();
    await until(() => $("#pool .pool-decision-box").hidden);
    check("clear sent", lastCall("pool_clear") && JSON.stringify(lastCall("pool_clear").args) === '{"board":"example_parcels"}' && lastCall("pool_clear").status === 200, JSON.stringify(lastCall("pool_clear")));
    check("not decided again", /Not decided\./.test(text("#pool .pool-decide")) && !/Decided/.test(boardButton("example_parcels").textContent));
    check("ticks from the most-picked audiences", JSON.stringify(ticked()) === '["App: Operations"]', ticked().join(","));

    // Summary: counts, N of M, the flag, and one reviewer at a time.
    button("Summary", $("#sidemenu")).click();
    await until(() => $("#pool table.pool-sum tbody tr"));
    const row = (i) => [...$$("#pool table.pool-sum tbody tr")[i].cells].map((c) => c.textContent).slice(2).join("|");
    const heads = () => $$("#pool table.pool-sum thead th").map((t) => t.textContent).join("|");
    check("Summary headings", heads() === "#|Board|Keep|Maybe|Drop|Pass|Reviewers|Decision", heads());
    check("Summary row 1 with the flag", row(0) === "1|0|0|0|1 of 2 voted|Decided: kept, for Wallboard" + FLAG, row(0));
    check("Summary row 2", row(1) === "0|1|1|0|1 of 2 voted|Not decided", row(1));
    const who = $("#poolWho");
    const names = who ? [...who.options].map((o) => o.textContent) : [];
    check("reviewer filter lists those who voted", JSON.stringify(names) === '["Everyone","Alex Example (former reviewer)","Sam Example"]', names.join(","));
    who.value = "sam.example@dyce-energy.co.uk"; who.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(50);
    check("one reviewer: headings", heads() === "#|Board|Keep|Maybe|Drop|Pass|Their vote|Reviewers|Decision", heads());
    check("one reviewer: row 1", row(0) === "1|0|0|0|Sam Example: Keep (Wallboard, App: Sales). Useful on the wall by the line.|1 of 2 voted|Decided: kept, for Wallboard" + FLAG, row(0));
    check("one reviewer: row 3", row(2) === "0|0|0|1|Sam Example: Pass|1 of 2 voted|Not decided", row(2));
    check("the filter keeps its choice", $("#poolWho").value === "sam.example@dyce-energy.co.uk");
  }

  async function viewer() {
    await until(() => $("#tabs button"));
    await sleep(500);
    check("no Dashboard Pool tab", !button("Dashboard Pool", $("#tabs")), text("#tabs"));
    const probe = calls("pool_state");
    check("the one probe was refused", probe.length === 1 && probe[0].status === 400, JSON.stringify(probe));
    check("nothing of the pool drawn", !$("#pool"));
  }

  async function empty() {
    await until(() => /has not been loaded/.test(text("#pool")));
    check("not loaded sentence", $$("#pool p").some((p) => p.textContent === "The Dashboard Pool has not been loaded yet."), text("#pool"));
  }

  (async () => {
    try {
      if (q.get("poolempty") === "1") await empty();
      else if (as === "reviewer") await reviewer();
      else if (as === "decider") await decider();
      else if (as === "admin") await admin();
      else if (as === "viewer") await viewer();
    } catch (e) { check("the check ran", false, String(e && e.stack || e)); }
    done();
  })();
})();

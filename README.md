# Dyce broker email approval page and DNA Hub

## index.html: the approval page

A single static page. An approver opens it from the link in an approval email; it shows the broker email in full and records Approve or Reject through the comms-approve function in Dyce's database project.

It holds no data and no keys. The one-use link token arrives in the address fragment and is sent only to that function.

Source of the logic: Dyce-Energy-Ltd/dyce-spine, supabase/functions/comms-approve. Owner: Phil Brook.

## hub.html: the DNA Hub

`hub.html` is one sign-in for Dyce's tools. People on the hub's list sign in with an emailed 8-digit code; anyone else is turned away. It holds no data and no keys; it talks only to the comms-web function in Dyce's database project, and the DNA Viewer tab to the dna-viewer function there. The session token is kept in this browser's localStorage (key `dyce.hub.token`), and the last tool and menu item used under `dyce.hub.where`.

A navy bar across the top shows a tab for each tool the person may use, and a side menu moves around inside the tool. What a person sees follows their ticks, set in DNA Admin; the database checks the tick again on every call, so hiding a tab or menu item is tidiness, not the gate.

| Tool | Tick | What it allows |
|---|---|---|
| Broker Emails | Request | The *Price emails* menu: New email (choose the email, the document, the brokers and who approves it, send now or later), Recent sends, Bounced addresses |
| Broker Emails | Approve | Being offered as an approver, and approving from the approval email's link (index.html). Approve alone shows no menu items |
| Broker Emails | Renewals | The *Renewals* menu: Next 10 days, Recently sent, Stopped brokers (with Stop a broker); stop or restart a renewal email or a broker, always with a reason |
| Dashboard Pool | Review | Boards and Summary: voting Keep, Maybe, Drop or Pass on each candidate board, with audiences and a note, and seeing everyone's votes and the decisions |
| DNA Admin | DNA Admin | People and access (the grid of people and ticks), Who may sign in, Sign-in history, Changes made here |

**Mailing groups.** Step 3 of New email opens with a menu, *Who is it for?*: *Broker primary email (HubSpot company)* (the default, the brokers list as before) or *Broker Contact Segment*. Choosing the segment calls `segment_refresh`, shows the stored copy from `segment` at once, then asks `segment` every 2 seconds for up to 60 until the run has finished (told apart from the earlier run by its `started_at`, never by the browser clock), and ticks every contact. A line above the list gives the time of the copy in London time, or the failed fetch and the copy still shown; *Fetch again* repeats it. The list has the columns Email, Primary Associated Company ID and Name, and search matches any of them. Ticks are kept apart for each group and cleared when the group changes. Requests and previews carry `recipient_group` and either `broker_keys` or `contact_ids`, never both. Recent sends names the group of each send (a send with none was to broker primary emails) and Use again restores it. The approval page says `N addresses in the Broker Contact Segment` for a segment send. In the preview, `?segmentfail=1` makes the stub's fetch fail.

The Renewals items show what the renewals journey will send at its 09:30 weekday run in the next 10 days, grouped by the day each email goes, with the reason for any that will not go; the renewal emails already sent, 50 at a time, each viewable as stored in a sandboxed frame; and the stopped brokers. They never send anything, and while the journey's redirect is set they say where every email goes. They call the `renewals_*` actions of `comms.web_call`; the Price emails items call its broker email actions.

The DNA Viewer tab is the laptop contract library moved into the hub, behind three ticks: View (search, account pages, reporting, opening documents and invoices), Review queue (the queue, a folder's page and its actions) and Originals (opening a file's original, with its bank details). Its pages come from the dna-viewer function and are shown only after the page's allowlist sanitiser.

The Dashboard Pool tab is the voting round on the candidate dashboards, behind one tick, Review; the decider (Phil Brook, whose address is written only into the database function) sees the tab without it. *Boards* lists the boards by area in the side menu with each person's own mark (Keep, Maybe, Drop, Pass or To review) and any decision, and shows the chosen board's screen, how each question is answered, the vote (with audiences on Keep and Maybe, and a note) and everyone's votes; *Summary* gives every board's counts and decision. It calls the `pool_*` actions of `comms.web_call`. The boards, figures and votes are held in the page's memory only and dropped on sign-out; localStorage keeps only the open board's id (`hub.pool.board`). As `me` does not say who decides, someone without the tick asks `pool_state` once at sign-in; only the decider gets an answer.

`hub.html` is built from `hub.src.html` by `python build.py`, which embeds the logos from `assets/` and inlines the files in `parts/` named in `build.py`'s INCLUDES (`{{POOL_LIB_JS}}`, `{{POOL_SCREEN_JS}}`, `{{POOL_SCREEN_CSS}}`: the Dashboard Pool's helpers and board screen). `python build.py --preview` also writes `preview/hub.html` (git-ignored) with `tools/preview-stub.js`, which answers in place of comms-web with made-up people and brokers; choose who signs in with `?as=admin`, `requester`, `requestonly`, `renewalsonly`, `approveonly`, `adminonly`, `viewer` (DNA Viewer View only), `reviewer` (Dashboard Pool Review only), `decider` (Admin Example, the preview's decider, without the Review tick) or `none`; `?poolempty=1` makes the Dashboard Pool answer as not yet loaded. `python -m unittest discover -s tests` runs the build tests and `node --test tests/*.test.js` the Dashboard Pool helpers' tests; the sanitiser test and the Dashboard Pool preview check (`tools/pool-preview-check.js`) run in a headless Chrome or Edge (or the browser `DV_BROWSER` names) and are skipped when none is found.

Source of the logic: Dyce-Energy-Ltd/dyce-spine, supabase/functions/comms-web and the `comms`, `hub` and `renewals` schemas. Data class: Red (it shows names and addresses after sign-in). Owner: Phil Brook.

## send.html: forwards to the hub

The broker emails page is now part of the DNA Hub. `send.html` only forwards the browser to `hub.html` (a meta refresh and a link); it has no script. The hub removes the old page's localStorage keys (`dyce-send-token`, `dyce.tab`) when it opens.

## The shared origin

All GitHub Pages sites of the Dyce-Energy-Ltd organisation share the origin `https://dyce-energy-ltd.github.io`, so they share the hub's localStorage and the comms-web CORS allowance. **No other repository in the organisation may enable GitHub Pages** unless the hub first moves to its own domain.

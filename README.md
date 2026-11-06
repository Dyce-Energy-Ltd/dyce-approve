# Dyce broker email approval page and DNA Hub

## index.html: the approval page

A single static page. An approver opens it from the link in an approval email; it shows the broker email in full and records Approve or Reject through the comms-approve function in Dyce's database project.

It holds no data and no keys. The one-use link token arrives in the address fragment and is sent only to that function.

Source of the logic: Dyce-Energy-Ltd/dyce-spine, supabase/functions/comms-approve. Owner: Phil Brook.

## hub.html: the DNA Hub

`hub.html` is one sign-in for Dyce's tools. People on the hub's list sign in with an emailed 8-digit code; anyone else is turned away. It holds no data and no keys; it talks only to the comms-web function in Dyce's database project. The session token is kept in this browser's localStorage (key `dyce.hub.token`), and the last tool and menu item used under `dyce.hub.where`.

A navy bar across the top shows a tab for each tool the person may use, and a side menu moves around inside the tool. What a person sees follows their ticks, set in DNA Admin; the database checks the tick again on every call, so hiding a tab or menu item is tidiness, not the gate.

| Tool | Tick | What it allows |
|---|---|---|
| Broker Emails | Request | The *Price emails* menu: New email (choose the email, the document, the brokers and who approves it, send now or later), Recent sends, Bounced addresses |
| Broker Emails | Approve | Being offered as an approver, and approving from the approval email's link (index.html). Approve alone shows no menu items |
| Broker Emails | Renewals | The *Renewals* menu: Next 10 days, Recently sent, Stopped brokers (with Stop a broker); stop or restart a renewal email or a broker, always with a reason |
| DNA Admin | DNA Admin | People and access (the grid of people and ticks), Who may sign in, Sign-in history, Changes made here |

The Renewals items show what the renewals journey will send at its 09:30 weekday run in the next 10 days, grouped by the day each email goes, with the reason for any that will not go; the renewal emails already sent, 50 at a time, each viewable as stored in a sandboxed frame; and the stopped brokers. They never send anything, and while the journey's redirect is set they say where every email goes. They call the `renewals_*` actions of `comms.web_call`; the Price emails items call its broker email actions.

`hub.html` is built from `hub.src.html` by `python build.py`, which embeds the logos from `assets/`. `python build.py --preview` also writes `preview/hub.html` (git-ignored) with `tools/preview-stub.js`, which answers in place of comms-web with made-up people and brokers; choose who signs in with `?as=admin`, `requester`, `requestonly`, `renewalsonly`, `approveonly`, `adminonly` or `none`. `python -m unittest discover -s tests` runs the build tests.

Source of the logic: Dyce-Energy-Ltd/dyce-spine, supabase/functions/comms-web and the `comms`, `hub` and `renewals` schemas. Data class: Red (it shows names and addresses after sign-in). Owner: Phil Brook.

## send.html: forwards to the hub

The broker emails page is now part of the DNA Hub. `send.html` only forwards the browser to `hub.html` (a meta refresh and a link); it has no script. The hub removes the old page's localStorage keys (`dyce-send-token`, `dyce.tab`) when it opens.

## The shared origin

All GitHub Pages sites of the Dyce-Energy-Ltd organisation share the origin `https://dyce-energy-ltd.github.io`, so they share the hub's localStorage and the comms-web CORS allowance. **No other repository in the organisation may enable GitHub Pages** unless the hub first moves to its own domain.

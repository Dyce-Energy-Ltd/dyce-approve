# Dyce broker email approval page

A single static page. An approver opens it from the link in an approval email; it shows the broker email in full and records Approve or Reject through the comms-approve function in Dyce's database project.

It holds no data and no keys. The one-use link token arrives in the address fragment and is sent only to that function.

Source of the logic: Dyce-Energy-Ltd/dyce-spine, supabase/functions/comms-approve. Owner: Phil Brook.

## send.html: broker emails page

`send.html` lets anyone with a Dyce mailbox sign in with an emailed 8-digit code and request broker emails, choosing who approves. It holds no data and no keys; it talks only to the comms-web function in Dyce's database project. The session token is kept in this browser's localStorage.

All GitHub Pages sites of the Dyce-Energy-Ltd organisation share the origin `https://dyce-energy-ltd.github.io`, so they share that localStorage and the comms-web CORS allowance. **No other repository in the organisation may enable GitHub Pages** unless this page first moves to its own domain.

The page has two tabs, Broker price emails and Renewal emails, and remembers the last one used in this browser (localStorage key `dyce.tab`). The Renewal emails tab shows what the renewals journey will send at its 09:30 weekday run in the next 10 days, grouped by the day each email goes, with the reason for any that will not go; the renewal emails already sent, 50 at a time, each viewable as stored in a sandboxed frame; and the stopped brokers. Anyone signed in can stop or restart an email or a broker, always with a reason. The tab never sends anything, and while the journey's redirect is set it says where every email goes. It calls the `renewals_*` actions of `comms.web_call` through the same comms-web function.

Source of the logic: Dyce-Energy-Ltd/dyce-spine, supabase/functions/comms-web. Data class: Red (it shows broker names and addresses after sign-in). Owner: Phil Brook.

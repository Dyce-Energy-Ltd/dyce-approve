# Dyce broker email approval page

A single static page. An approver opens it from the link in an approval email; it shows the broker email in full and records Approve or Reject through the comms-approve function in Dyce's database project.

It holds no data and no keys. The one-use link token arrives in the address fragment and is sent only to that function.

Source of the logic: Dyce-Energy-Ltd/dyce-spine, supabase/functions/comms-approve. Owner: Phil Brook.

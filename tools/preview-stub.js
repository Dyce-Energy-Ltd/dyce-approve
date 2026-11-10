// Preview stub for hub.html. build.py --preview inlines this before the page's first script, in
// preview/ only; it never reaches the published page. It replaces fetch to the comms-web URL with
// canned answers shaped as comms-web and hub.web_action give them. Made-up people only.
//
// Who signs in comes from the preview URL: ?as=admin (Admin Example, every tick, the only DNA Admin),
// ?as=requester (Pat Example, Broker Emails Request and Renewals), ?as=requestonly (Kim Example,
// Request only), ?as=renewalsonly (Lee Example, Renewals only), ?as=approveonly (Max Example,
// Approve only), ?as=adminonly (Jo Example, DNA Admin only), ?as=none (an address with no access:
// "start" answers as for anyone, "finish" refuses).
// Any 8-digit code signs in, except 00000000, which gets the wrong-code sentence.
// window.__stub.calls lists every request; window.__stub.endSession() ends the session on the
// server side, so the next call answers signedOut; window.__stub.untick(code) removes a tick from
// whoever is signed in on the server side only, so the page's next call for it is refused (42501).
// window.__stub.delay[action] = ms holds back the answer to that action (or op) by ms instead of
// the usual 120 ms, e.g. __stub.delay.inputs = 4000 to sign out while Use again is on its way.
// The answer is decided when the request is made, as a server would have answered it then.
// Mailing groups: segment answers 25 made-up contacts (two share an address) with the time of the
// copy; segment_refresh starts a run that shows as running, then succeeded after 3 s (the copy time
// moves on). With ?segmentfail=1 the run fails instead and the copy is kept. A second refresh while
// one is running answers started false. The send S2 has no recipient_group, as sends made before
// groups existed.
// Broker Emails' answers (brokers, preview, sends, bounced, renewals_*) are made up, with
// example.test addresses, shaped as comms.web_call and renewals.web_action give them.
(function () {
  var ENDPOINT = "https://rlpnbwjppylhcpybpqim.supabase.co/functions/v1/comms-web";
  var as = (new URLSearchParams(location.search).get("as") || "admin").toLowerCase();
  var ADMIN = "admin.example@dyce-energy.co.uk";
  var PERSONA = {
    admin: ADMIN,
    requester: "pat.example@dyce-energy.co.uk",
    adminonly: "jo.example@dyce-energy.co.uk",
    requestonly: "kim.example@dyce-energy.co.uk",
    renewalsonly: "lee.example@dyce-energy.co.uk",
    approveonly: "max.example@dyce-energy.co.uk",
    none: null
  };
  var DOMAIN = /^[a-z0-9._%-]+@dyce-energy\.co\.uk$/;
  var FINISH_FAIL = "That code did not work. Check it and try again, or ask for a new code. After 5 wrong tries, wait an hour.";
  var LOCKOUT = "There must always be one active person with DNA Admin.";
  var NO_ACCESS = "You do not have access to this. Ask a DNA Admin to add it.";

  var permissions = [
    { code: "broker_emails.request", tool: "Broker Emails", label: "Request" },
    { code: "broker_emails.approve", tool: "Broker Emails", label: "Approve" },
    { code: "broker_emails.renewals", tool: "Broker Emails", label: "Renewals" },
    { code: "dna_admin.admin", tool: "DNA Admin", label: "DNA Admin" }
  ];
  var people = [
    { email: ADMIN, display_name: "Admin Example", active: true, grants: permissions.map(function (p) { return p.code; }), added_at: "2026-11-06T09:00:00+00:00", added_by: "migration" },
    { email: "pat.example@dyce-energy.co.uk", display_name: "Pat Example", active: true, grants: ["broker_emails.request", "broker_emails.renewals"], added_at: "2026-11-06T10:12:00+00:00", added_by: ADMIN },
    { email: "sam.example@dyce-energy.co.uk", display_name: "Sam Example", active: true, grants: ["broker_emails.request", "broker_emails.approve"], added_at: "2026-11-06T10:15:00+00:00", added_by: ADMIN },
    { email: "alex.example@dyce-energy.co.uk", display_name: "Alex Example", active: false, grants: [], added_at: "2026-11-06T10:20:00+00:00", added_by: ADMIN }
  ];
  // Jo is listed only in the adminonly preview, so in ?as=admin Admin Example is the only DNA Admin.
  if (as === "adminonly") {
    people.push({ email: "jo.example@dyce-energy.co.uk", display_name: "Jo Example", active: true, grants: ["dna_admin.admin"], added_at: "2026-11-06T10:25:00+00:00", added_by: ADMIN });
  }
  // The one-tick Broker Emails people are listed only in their own preview.
  var ONE_TICK = {
    requestonly: { name: "Kim Example", grants: ["broker_emails.request"] },
    renewalsonly: { name: "Lee Example", grants: ["broker_emails.renewals"] },
    approveonly: { name: "Max Example", grants: ["broker_emails.approve"] }
  };
  if (ONE_TICK[as]) {
    people.push({ email: PERSONA[as], display_name: ONE_TICK[as].name, active: true, grants: ONE_TICK[as].grants, added_at: "2026-11-06T10:30:00+00:00", added_by: ADMIN });
  }
  var changes = people.map(function (p) {
    return { at: p.added_at, by: p.added_by, for: p.email, what: p.email === ADMIN ? "Added as Admin Example, with every tick" : "Added as " + p.display_name };
  }).reverse();
  changes.unshift({ at: "2026-11-06T10:21:00+00:00", by: ADMIN, for: "alex.example@dyce-energy.co.uk", what: "Turned off" });
  var signIns = [
    { email: ADMIN, at: "2026-11-06T11:02:13+00:00", outcome: "signed_in" },
    { email: "pat.example@dyce-energy.co.uk", at: "2026-11-06T10:48:40+00:00", outcome: "wrong_code" },
    { email: "sam.example@dyce-energy.co.uk", at: "2026-11-06T10:31:05+00:00", outcome: "expired" },
    { email: "pat.example@dyce-energy.co.uk", at: "2026-11-05T16:20:00+00:00", outcome: "replaced" },
    { email: "pat.example@dyce-energy.co.uk", at: "2026-11-05T16:22:30+00:00", outcome: "signed_in" }
  ].sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  var refusedByHour = [
    { hour: "2026-11-06T10:00:00+00:00", count: 2 },
    { hour: "2026-11-05T15:00:00+00:00", count: 1 }
  ];
  var sessions = {};
  var ended = {};
  var calls = [];
  var delay = {};

  var person = function (email) { return people.find(function (p) { return p.email === email; }) || null; };
  var has = function (email, code) { var p = person(email); return !!(p && p.active && p.grants.indexOf(code) >= 0); };
  var otherActiveAdmin = function (email) { return people.some(function (p) { return p.email !== email && p.active && p.grants.indexOf("dna_admin.admin") >= 0; }); };
  var now = function () { return new Date(Math.floor(Date.now() / 1000) * 1000).toISOString().replace(".000Z", "+00:00"); };
  var copy = function (v) { return JSON.parse(JSON.stringify(v)); };
  var sorted = function (grants) { return permissions.map(function (p) { return p.code; }).filter(function (c) { return grants.indexOf(c) >= 0; }); };

  function refuse(msg) { var e = new Error(msg); e.sentence = msg; throw e; }

  function adminAction(me, action, args) {
    if (!has(me, "dna_admin.admin")) refuse("Only people with DNA Admin can do that.");
    var p;
    if (action === "admin_set_active" || action === "admin_set_grant") {
      p = person(String(args.email || "").trim().toLowerCase());
      if (!p) refuse("That person is not on the list.");
    }
    if (action === "admin_people") {
      return {
        permissions: copy(permissions),
        people: people.slice().sort(function (a, b) { return a.display_name.localeCompare(b.display_name) || a.email.localeCompare(b.email); })
          .map(function (x) { return { email: x.email, display_name: x.display_name, active: x.active, added_at: x.added_at, added_by: x.added_by, grants: sorted(x.grants) }; })
      };
    }
    if (action === "admin_add_person") {
      var raw = String(args.email == null ? "" : args.email).trim();
      var email = raw.toLowerCase();
      if (!/^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+$/.test(raw) || !DOMAIN.test(email)) refuse("Only a Dyce email address (@dyce-energy.co.uk) can be added.");
      var name = String(args.display_name == null ? "" : args.display_name).trim();
      if (!name) refuse("Give the person's name.");
      if (person(email)) refuse("That person is already on the list.");
      people.push({ email: email, display_name: name, active: true, grants: [], added_at: now(), added_by: me });
      changes.unshift({ at: now(), by: me, for: email, what: "Added as " + name });
      return { email: email };
    }
    if (action === "admin_set_active") {
      if (typeof args.active !== "boolean") refuse("Say whether the person is on or off.");
      if (args.active !== p.active) {
        if (!args.active && !otherActiveAdmin(p.email)) refuse(LOCKOUT);
        p.active = args.active;
        changes.unshift({ at: now(), by: me, for: p.email, what: args.active ? "Turned on" : "Turned off" });
      }
      return { email: p.email, active: args.active };
    }
    if (action === "admin_set_grant") {
      var perm = permissions.find(function (x) { return x.code === args.permission; });
      if (!perm) refuse("Unknown permission.");
      if (typeof args.granted !== "boolean") refuse("Say whether the tick is on or off.");
      var held = p.grants.indexOf(perm.code) >= 0;
      if (args.granted && !held) {
        p.grants.push(perm.code);
        changes.unshift({ at: now(), by: me, for: p.email, what: perm.label + " ticked" });
      } else if (!args.granted && held) {
        if (perm.code === "dna_admin.admin" && !otherActiveAdmin(p.email)) refuse(LOCKOUT);
        p.grants = p.grants.filter(function (c) { return c !== perm.code; });
        changes.unshift({ at: now(), by: me, for: p.email, what: perm.label + " unticked" });
      }
      return { email: p.email, permission: perm.code, granted: args.granted };
    }
    if (action === "admin_sign_ins") return { sign_ins: copy(signIns), refused_by_hour: copy(refusedByHour) };
    if (action === "admin_changes") return { changes: copy(changes.slice(0, 200)) };
    refuse("Unknown action.");
  }

  // ---------- Broker Emails. Made-up brokers, customers and meters; testing is on, so every
  // ticked broker collapses to one copy to the redirect address, as comms.preview_delivery does.
  var REDIRECT = ADMIN;
  var uuid = function () { return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, function () { return (Math.random() * 16 | 0).toString(16); }); };
  var beBrokers = [
    { broker_key: 101, broker_id: 11, broker_name: "Example Brokers A Ltd", email: "hello@brokers-a.example.test" },
    { broker_key: 102, broker_id: 12, broker_name: "Example Brokers B Ltd", email: "team@brokers-b.example.test" },
    { broker_key: 103, broker_id: 13, broker_name: "Example Brokers C Ltd", email: "office@brokers-c.example.test" },
    { broker_key: 104, broker_id: 14, broker_name: "Example Brokers D Ltd", email: "info@brokers-d.example.test" },
    { broker_key: 105, broker_id: 15, broker_name: "<b>Example</b> Brokers E Ltd", email: "deals@brokers-e.example.test" }
  ];
  // Mailing groups: the HubSpot Broker Contact Segment's copy, and the state of the fetch.
  var segFail = new URLSearchParams(location.search).get("segmentfail") === "1";
  var SEG_NAMES = ["Ada Example", "Ben Example", "Cat Example", "Dev Example", "Eve Example", "Finn Example", "Gus Example", "Hana Example", "Ivo Example", "Jess Example", "Kit Example", "Lou Example", "Mo Example", "Nia Example", "Oz Example", "Pia Example", "Quin Example", "Rae Example", "Sol Example", "Tia Example", "Uma Example", "Vic Example", "Wes Example"];
  var segContacts = SEG_NAMES.map(function (n, i) {
    var first = n.split(" ")[0].toLowerCase();
    return { hubspot_contact_id: String(5100000000 + i * 17), email: first + "@contacts-" + (i % 6 + 1) + ".example.test", name: n, primary_company_id: i % 7 === 3 ? null : String(30000000 + (i % 6) * 113) };
  });
  segContacts[4].name = "<b>Eve</b> Example";
  segContacts[9].name = null;
  segContacts.push({ hubspot_contact_id: "5100000900", email: "shared@contacts-1.example.test", name: "Shared One", primary_company_id: "30000000" });
  segContacts.push({ hubspot_contact_id: "5100000917", email: "shared@contacts-1.example.test", name: "Shared Two", primary_company_id: "30000000" });
  var segOld = new URLSearchParams(location.search).get("segmentold") === "1";
  // ?segmentold=1 makes the copy a day old, to see the dated line.
  var segCopiedAt = segOld ? new Date(Math.floor(Date.now() / 1000) * 1000 - 86400000).toISOString().replace(".000Z", "+00:00") : "2026-11-10T09:15:00+00:00";
  var segRun = { status: "succeeded", started_at: "2026-11-10T09:14:50+00:00", finished_at: "2026-11-10T09:15:00+00:00", error: null };
  var segKnown = function (ids) { return ids.every(function (id) { return segContacts.some(function (c) { return c.hubspot_contact_id === id; }); }); };

  var S1 = "11111111-1111-4111-8111-111111111111", S2 = "22222222-2222-4222-8222-222222222222", S3 = "33333333-3333-4333-8333-333333333333";
  var beSends = [
    { send_id: S1, subject: "New prices are live from 10/11/2026", category: "pricing", requested_at: "2026-11-06T09:40:00+00:00", send_after: null, broker_count: 5, sent_count: 0, delivered_count: 0, failed_count: 0, bounced_count: 0, clicked_count: 0, status: "awaiting_approval", requested_by: "@me", recipient_group: "broker_primary_email" },
    { send_id: S2, subject: "Prices withdrawn: submit contracts by 31/10/2026", category: "pricing", requested_at: "2026-10-28T14:05:00+00:00", send_after: null, broker_count: 5, sent_count: 1, delivered_count: 1, failed_count: 0, bounced_count: 0, clicked_count: 1, status: "sent", requested_by: "sam.example@dyce-energy.co.uk" },
    { send_id: S3, subject: "Example partner news, November", category: "newsletter", requested_at: "2026-11-05T16:20:00+00:00", send_after: "2026-11-20T09:00:00+00:00", broker_count: 4, sent_count: 0, delivered_count: 0, failed_count: 0, bounced_count: 0, clicked_count: 0, status: "approved", requested_by: "@me", recipient_group: "broker_contact_segment" }
  ];
  var beInputs = {};
  beInputs[S1] = { template_key: "new_prices", subject: beSends[0].subject, category: "pricing", link_url: "https://example.test/price-books", variables: { date: "2026-11-10", products: "fixed electricity and fixed gas", extra: "" }, recipient_group: "broker_primary_email" };
  beInputs[S2] = { template_key: "prices_withdrawn", subject: beSends[1].subject, category: "pricing", link_url: null, variables: { date: "2026-10-31", products: "fixed electricity", extra: "Call the TPI team with any questions." } };
  beInputs[S3] = { template_key: "own_email", subject: beSends[2].subject, category: "newsletter", link_url: "https://example.test/news", recipient_group: "broker_contact_segment", variables: { message: "Hello,\n\nThis is made-up preview text with **bold** words.\n\n- First point\n- Second point\n\nThe Dyce TPI team" } };
  // The stored email of each send (made up), as comms.send_inputs gives it: html with the logo
  // as cid:dyce-logo, and the file's name or null.
  var mailHtml = function (title, lines) {
    return '<!doctype html><html><body style="margin:0;padding:24px;font-family:Calibri,Arial,sans-serif;color:#0F2A34;background:#FFFFFF">'
      + '<img src="cid:dyce-logo" alt="Dyce Energy" width="120" style="display:block;margin:0 0 18px">'
      + '<h1 style="font-size:22px;margin:0 0 12px">' + title + '</h1>'
      + '<div style="height:3px;width:56px;background:#DE00B9;margin:0 0 18px"></div>'
      + lines.map(function (l) { return '<p style="margin:0 0 12px">' + l + '</p>'; }).join('')
      + '</body></html>';
  };
  beInputs[S1].html = mailHtml(beSends[0].subject, ["Hello,", "Our new price books for fixed electricity and fixed gas are live from 10/11/2026.", "The Dyce TPI team"]);
  beInputs[S1].attachment_filename = "Price book 10-11-2026.pdf";
  beInputs[S2].html = mailHtml(beSends[1].subject, ["Hello,", "Current fixed electricity prices close. Submit contracts by 31/10/2026.", "Call the TPI team with any questions.", "The Dyce TPI team"]);
  beInputs[S2].attachment_filename = null;
  beInputs[S3].html = mailHtml(beSends[2].subject, ["Hello,", "This is made-up preview text with <b>bold</b> words.", "The Dyce TPI team"]);
  beInputs[S3].attachment_filename = null;
  var beBounced = [
    { broker_name: "Example Brokers C Ltd", address: "old@brokers-c.example.test", last_at: "2026-11-03T10:15:00+00:00", times: 2, last_subject: "New prices are live from 03/11/2026", last_reason: "The mailbox does not exist.", last_type: "Bounced" },
    { broker_name: "Example Brokers D Ltd", address: "info@brokers-d.example.test", last_at: "2026-10-20T08:02:00+00:00", times: 1, last_subject: "", last_reason: "", last_type: "Complained" }
  ];
  var stopBy = function (by, at, reason) { return { by: by, at: at, reason: reason }; };
  var rwUpcoming = [
    { send_day: "2026-11-09", audience: "broker", days_before: null, to: "hello@brokers-a.example.test", cc: null, outcome: "queued", broker_id: 11, broker_name: "Example Brokers A Ltd", customer_name: null, broker_stop: null,
      contracts: [{ contract_id: 5001, days_before: 120, mpxn: "1200000000001", fuel: "Electricity", contract_end_date: "2027-03-09", stop: null }, { contract_id: 5002, days_before: 90, mpxn: "9000000001", fuel: "Gas", contract_end_date: "2027-02-07", stop: null }] },
    { send_day: "2026-11-09", audience: "customer", days_before: 60, to: "accounts@customer-one.example.test", cc: "hello@brokers-a.example.test", outcome: "queued", broker_id: 11, broker_name: "Example Brokers A Ltd", customer_name: "Example Customer One Ltd", broker_stop: null,
      contracts: [{ contract_id: 5003, days_before: 60, mpxn: "1200000000003", fuel: "Electricity", contract_end_date: "2027-01-08", stop: null }] },
    { send_day: "2026-11-09", audience: "customer", days_before: 60, to: "office@customer-two.example.test", cc: null, outcome: "queued", broker_id: 12, broker_name: "Example Brokers B Ltd", customer_name: "Example Customer Two Ltd", broker_stop: stopBy("sam.example@dyce-energy.co.uk", "2026-11-02T11:00:00+00:00", "Broker asked for no emails this month."),
      contracts: [{ contract_id: 5004, days_before: 60, mpxn: "9000000004", fuel: "Gas", contract_end_date: "2027-01-08", stop: null }] },
    { send_day: "2026-11-10", audience: "broker", days_before: 90, to: "team@brokers-b.example.test", cc: null, outcome: "broker_stopped", broker_id: 12, broker_name: "Example Brokers B Ltd", customer_name: null, broker_stop: stopBy("sam.example@dyce-energy.co.uk", "2026-11-02T11:00:00+00:00", "Broker asked for no emails this month."),
      contracts: [{ contract_id: 5005, days_before: 90, mpxn: "1200000000005", fuel: "Electricity", contract_end_date: "2027-02-08", stop: null }] },
    { send_day: "2026-11-10", audience: "customer", days_before: 30, to: "finance@customer-three.example.test", cc: "office@brokers-c.example.test", outcome: "stopped", broker_id: 13, broker_name: "Example Brokers C Ltd", customer_name: "Example Customer Three Ltd", broker_stop: null,
      contracts: [{ contract_id: 5006, days_before: 30, mpxn: "1200000000006", fuel: "Electricity", contract_end_date: "2026-12-10", stop: stopBy("pat.example@dyce-energy.co.uk", "2026-11-04T15:30:00+00:00", "Customer has renewed direct.") }] },
    { send_day: "2026-11-11", audience: "customer", days_before: 30, to: null, cc: "info@brokers-d.example.test", outcome: "no_address", broker_id: 14, broker_name: "Example Brokers D Ltd", customer_name: "Example Customer Four Ltd", broker_stop: null,
      contracts: [{ contract_id: 5007, days_before: 30, mpxn: null, fuel: "Gas", contract_end_date: "2026-12-11", stop: null }] }
  ];
  var rwSent = [
    { message_id: 9, sent_at: null, days_before: null, milestones: [120, 90], audience: "broker", intended_to: "office@brokers-c.example.test", actual_to: REDIRECT, intended_cc: null, actual_cc: null, status: "queued", subject: "Contracts coming up for renewal", can_stop: true },
    { message_id: 8, sent_at: "2026-11-06T09:31:12+00:00", days_before: 60, milestones: [60], audience: "customer", intended_to: "accounts@customer-five.example.test", actual_to: REDIRECT, intended_cc: "hello@brokers-a.example.test", actual_cc: null, status: "sent", subject: "Your energy contract ends on 05/01/2027", can_stop: false },
    { message_id: 7, sent_at: null, days_before: 30, milestones: [30], audience: "customer", intended_to: "office@customer-six.example.test", actual_to: REDIRECT, intended_cc: null, actual_cc: null, status: "failed", subject: "Your energy contract ends on 06/12/2026", can_stop: false },
    { message_id: 3, sent_at: "2026-11-02T09:30:40+00:00", days_before: 90, milestones: [90], audience: "broker", intended_to: "deals@brokers-e.example.test", actual_to: REDIRECT, intended_cc: null, actual_cc: null, status: "sent", subject: "Contracts coming up for renewal", can_stop: false }
  ];
  var rwBrokers = beBrokers.map(function (b) { return { broker_id: b.broker_id, broker_name: b.broker_name, email_address: b.email, stop: null }; });
  rwBrokers[1].stop = stopBy("sam.example@dyce-energy.co.uk", "2026-11-02T11:00:00+00:00", "Broker asked for no emails this month.");
  var rwHistory = { 12: [{ stopped_by: "pat.example@dyce-energy.co.uk", stopped_at: "2026-09-01T10:00:00+00:00", stop_reason: "Address being changed.", restarted_by: "sam.example@dyce-energy.co.uk", restarted_at: "2026-09-08T10:00:00+00:00", restart_reason: "New address in place." }] };
  // The stored email the View button shows. Its script and form must do nothing in the sandboxed frame.
  var STORED = "<table width=\"100%\" style=\"background:#FFFFFF\"><tr><td style=\"padding:24px;font-family:Calibri,Arial,sans-serif;color:#0F2A34\">"
    + "<img src=\"cid:dyce-logo\" alt=\"Dyce Energy\" height=\"40\" style=\"display:block;height:40px;width:auto;margin:0 0 22px\">"
    + "<p>Hello,</p><p>This is a made-up renewal email for the preview.</p>"
    + "<form action=\"https://example.test/\"><button>A form that cannot submit</button></form>"
    + "<scr" + "ipt>document.body.textContent = 'SCRIPT RAN';</scr" + "ipt>"
    + "<p>The Dyce TPI team</p></td></tr></table>";

  function brokerEmailsAction(me, action, args) {
    var mine = function (s) { var c = copy(s); if (c.requested_by === "@me") c.requested_by = me; return c; };
    if (action === "brokers") return copy(beBrokers);
    if (action === "preview") {
      var out = [], grp = args.recipient_group || "broker_primary_email";
      var ids = args.contact_ids || [];
      if ((args.broker_keys || []).length && ids.length) refuse("Choose brokers or contacts, not both.");
      if (grp === "broker_primary_email" && ids.length) refuse("Contacts can only be chosen for the Broker Contact Segment.");
      if (grp === "broker_contact_segment" && (args.broker_keys || []).length) refuse("Brokers can only be chosen for Broker primary email.");
      if (!segKnown(ids)) refuse("Some of those contacts are no longer in the segment. Reload it.");
      if ((args.broker_keys || []).length || ids.length) out.push({ deliver_to: REDIRECT, source: "redirect" });
      (args.extra_emails || []).forEach(function (e) { out.push({ deliver_to: e, source: "typed" }); });
      return out;
    }
    if (action === "segment") return { contacts: copy(segContacts), copied_at: segCopiedAt, last_run: copy(segRun) };
    if (action === "segment_refresh") {
      if (segRun && segRun.status === "running") return { started: false };
      segRun = { status: "running", started_at: now(), finished_at: null, error: null };
      setTimeout(function () {
        if (segFail) segRun = { status: "failed", started_at: segRun.started_at, finished_at: now(), error: "HubSpot answered 500 on page 3" };
        else { segCopiedAt = now(); segRun = { status: "succeeded", started_at: segRun.started_at, finished_at: segCopiedAt, error: null }; }
      }, 3000);
      return { started: true };
    }
    if (action === "sends") return { redirect_to: REDIRECT, sends: beSends.map(mine) };
    if (action === "recipients") {
      if (args.send_id === S2) return [{ deliver_to: REDIRECT, status: "delivered", click_count: 1, first_clicked_at: "2026-10-28T15:01:00+00:00" }];
      return [];
    }
    if (action === "inputs") { if (!beInputs[args.send_id]) refuse("Which email? Its send id is missing or not valid."); return copy(beInputs[args.send_id]); }
    if (action === "bounced") return copy(beBounced);
    if (action === "cancel" || action === "ask_again") {
      var s = beSends.find(function (x) { return x.send_id === args.send_id; });
      if (!s || mine(s).requested_by !== me) refuse("Only the person who requested this email can do that.");
      if (action === "ask_again") return { approvers: ["sam.example@dyce-energy.co.uk"] };
      s.status = "cancelled"; return { status: "cancelled" };
    }
    if (action === "attachment_start") return { id: uuid() };
    if (action === "attachment_part" || action === "attachment_finish") return { id: args.id };
    if (action === "request") {
      var r = args.request || {};
      if (!args.approver) refuse("Choose who approves this email.");
      var id = uuid();
      var rgrp = r.recipient_group || "broker_primary_email", rcount = (r.broker_keys || r.contact_ids || []).length;
      // As the database does, a segment send counts the distinct addresses among the selected contacts.
      if (rgrp === "broker_contact_segment") {
        var addrs = {};
        (r.contact_ids || []).forEach(function (id) { segContacts.forEach(function (c) { if (c.hubspot_contact_id === id) addrs[c.email.toLowerCase()] = 1; }); });
        rcount = Object.keys(addrs).length;
      }
      if ((r.broker_keys || []).length && (r.contact_ids || []).length) refuse("Choose brokers or contacts, not both.");
      if (rgrp === "broker_contact_segment" && !segKnown(r.contact_ids || [])) refuse("Some of those contacts are no longer in the segment. Reload it.");
      beSends.unshift({ send_id: id, subject: r.subject, category: r.category, requested_at: now(), send_after: r.send_after || null, broker_count: rcount, sent_count: 0, delivered_count: 0, failed_count: 0, bounced_count: 0, clicked_count: 0, status: "awaiting_approval", requested_by: me, recipient_group: rgrp });
      beInputs[id] = { template_key: r.template_key, subject: r.subject, category: r.category, link_url: r.link_url, variables: r.variables, recipient_group: rgrp };
      return { send_id: id, broker_count: rcount, redirected_to: REDIRECT, approvers: [args.approver] };
    }
    if (action === "renewals_upcoming") return { redirect_to: REDIRECT, go_live_date: "2026-11-02", emails: copy(rwUpcoming) };
    if (action === "renewals_sent") {
      var page = args.before_id != null ? rwSent.filter(function (x) { return x.message_id < args.before_id; }) : rwSent.slice(0, 3);
      var last = page.length ? page[page.length - 1].message_id : null;
      return { emails: copy(page), next_before_id: rwSent.some(function (x) { return last != null && x.message_id < last; }) ? last : null };
    }
    if (action === "renewals_email") {
      var m = rwSent.find(function (x) { return x.message_id === args.message_id; });
      if (!m) refuse("That email cannot be shown.");
      return { subject: m.subject, body_html: STORED };
    }
    if (action === "renewals_brokers") return copy(rwBrokers);
    if (action === "renewals_stopped") {
      return rwBrokers.filter(function (b) { return b.stop; }).map(function (b) { return { broker_id: b.broker_id, broker_name: b.broker_name, email_address: b.email_address, stop: copy(b.stop), history: copy(rwHistory[b.broker_id] || []) }; });
    }
    if (action === "renewals_stop" || action === "renewals_restart") {
      var stop = action === "renewals_stop";
      var reason = String(args.reason || "").trim();
      if (!reason || reason.length > 500) refuse("Give a reason, up to 500 characters.");
      if (args.broker_id != null) {
        var b = rwBrokers.find(function (x) { return x.broker_id === args.broker_id; });
        if (!b) refuse("That broker is not known.");
        if (stop === !!b.stop) refuse(stop ? "That broker is already stopped." : "That broker is not stopped.");
        if (stop) b.stop = stopBy(me, now(), reason);
        else { (rwHistory[b.broker_id] = rwHistory[b.broker_id] || []).unshift({ stopped_by: b.stop.by, stopped_at: b.stop.at, stop_reason: b.stop.reason, restarted_by: me, restarted_at: now(), restart_reason: reason }); b.stop = null; }
        rwUpcoming.forEach(function (e) {
          if (e.broker_id !== b.broker_id) return;
          if (e.audience === "broker" && (e.outcome === "queued" || e.outcome === "broker_stopped")) e.outcome = stop ? "broker_stopped" : "queued";
          e.broker_stop = stop ? copy(b.stop) : null;
          if (e.audience === "customer" && stop) e.cc = null;
        });
        return stop ? { stopped: 1 } : { restarted: 1 };
      }
      if (args.message_id != null) {
        if (!stop) refuse("A stopped email does not go again.");
        var msg = rwSent.find(function (x) { return x.message_id === args.message_id; });
        if (!msg || !msg.can_stop) refuse("That email has already gone or is not waiting.");
        msg.status = "stopped"; msg.can_stop = false; return { stopped: 1 };
      }
      var ids = (args.items || []).map(function (i) { return i.contract_id; });
      var n = 0;
      rwUpcoming.forEach(function (e) {
        e.contracts.forEach(function (c) {
          if (ids.indexOf(c.contract_id) < 0) return;
          c.stop = stop ? stopBy(me, now(), reason) : null; n++;
        });
        if (e.contracts.some(function (c) { return ids.indexOf(c.contract_id) >= 0; })) e.outcome = stop ? "stopped" : "queued";
      });
      return stop ? { stopped: n } : { restarted: n };
    }
    refuse("Unknown action.");
  }

  function answer(body) {
    var op = body && body.op;
    if (op === "start") return [200, { ok: true }];
    if (op === "finish") {
      var email = String(body.email || "").trim().toLowerCase();
      var p = person(email);
      if (!PERSONA[as] || email !== PERSONA[as] || !p || !p.active || body.code === "00000000") return [401, { ok: false, error: FINISH_FAIL }];
      var token = "stub" + Math.random().toString(16).slice(2) + Date.now().toString(16);
      sessions[token] = email;
      return [200, { ok: true, token: token }];
    }
    if (op === "sign_out") { delete sessions[body.token]; ended[body.token] = true; return [200, { ok: true }]; }
    if (op === "call") {
      var me = sessions[body.token];
      // A token left from an earlier preview load is honoured for the persona in the URL.
      if (!me && body.token && /^stub/.test(body.token) && !ended[body.token] && PERSONA[as]) { me = PERSONA[as]; sessions[body.token] = me; }
      if (!me || !person(me) || !person(me).active) return [401, { ok: false, signedOut: true }];
      var action = body.action, args = body.args || {};
      try {
        if (action === "me") {
          var p2 = person(me);
          // Approvers as comms.web_call lists them: active people with Approve, never the person
          // signed in; while testing, only those on the test list are available.
          var approvers = people.filter(function (x) { return x.active && x.email !== me && x.grants.indexOf("broker_emails.approve") >= 0; })
            .map(function (x) { return { email: x.email, display_name: x.display_name, available: true }; });
          approvers.push({ email: "unavailable.example@dyce-energy.co.uk", display_name: "Robin Unavailable", available: false });
          return [200, { ok: true, result: { email: me, display_name: p2.display_name, testing: true, approvers: approvers, ticks: p2.active ? sorted(p2.grants) : [] } }];
        }
        if (/^admin_/.test(action)) return [200, { ok: true, result: adminAction(me, action, args) }];
        if (/^renewals_/.test(action) ? !has(me, "broker_emails.renewals") : !has(me, "broker_emails.request")) refuse(NO_ACCESS);
        return [200, { ok: true, result: brokerEmailsAction(me, action, args) }];
      } catch (e) {
        if (e && e.sentence) return [400, { ok: false, error: e.sentence }];
        throw e;
      }
    }
    return [400, { ok: false, error: "The request was not valid." }];
  }

  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (url, init) {
    if (String(url) !== ENDPOINT) return realFetch ? realFetch(url, init) : Promise.reject(new Error("no fetch"));
    var body = {};
    try { body = JSON.parse((init && init.body) || "{}"); } catch (e) { body = {}; }
    var res = answer(body);
    calls.push({ op: body.op, action: body.action || null, args: body.args ? copy(body.args) : null, status: res[0], answer: copy(res[1]) });
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(new Response(JSON.stringify(res[1]), { status: res[0], headers: { "Content-Type": "application/json" } }));
      }, delay[body.action] || delay[body.op] || 120);
    });
  };
  window.__stub = {
    as: as,
    calls: calls,
    delay: delay,
    endSession: function () { Object.keys(sessions).forEach(function (k) { delete sessions[k]; ended[k] = true; }); },
    untick: function (code) {
      Object.keys(sessions).forEach(function (k) { var p = person(sessions[k]); if (p) p.grants = p.grants.filter(function (c) { return c !== code; }); });
    }
  };
})();

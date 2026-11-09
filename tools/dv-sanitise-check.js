// Hostile input for the DNA Viewer's sanitiser: the DV SANITISER block of hub.src.html.
// tests/test_build.py cuts that block out of hub.html, puts it and this file into one page, opens
// the page in a headless browser and reads the answer this writes into <pre id="result">. It is not
// part of any page the hub serves.
//
// Each case is [input, what the output must still hold ("" for nothing)]. The second part shows
// the sanitiser did not pass the case by dropping everything. Every element the sanitiser gives
// back is checked for: an on* attribute; a script, style, iframe, object, embed or noscript
// element; an href other than "#"; a data-dv-href that does not start with a single "/"; a style
// holding url( or expression. Any alert() the input manages to run is counted.
(() => {
  let fired = 0;
  window.alert = () => { fired++; };
  const CASES = [
    ['<img src=x onerror=alert(1)>', ""],
    ['<svg onload=alert(1)><rect width="4" height="4"></rect></svg>', '<rect width="4" height="4">'],
    ['<script>alert(1)</script><p>after</p>', "<p>after</p>"],
    ['<style>*{}</style><p>after</p>', "<p>after</p>"],
    ['<iframe src="javascript:alert(1)"></iframe><iframe srcdoc="<script>alert(1)</script>"></iframe>', ""],
    ['<object data="javascript:alert(1)"></object><embed src="javascript:alert(1)">', ""],
    ['<a href="javascript:alert(1)">x</a>', '<a href="#">x</a>'],
    ['<a href="//evil.example">x</a>', '<a href="#">x</a>'],
    ['<a href="/account?crn=1" onclick=x>x</a>', '<a data-dv-href="/account?crn=1" href="#">x</a>'],
    ['<svg><a href="/x"><text>x</text></a></svg>', "<svg></svg>"],
    ['<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>', "<svg></svg>"],
    ['<p style="background:url(https://evil.example/x)">x</p>', "<p>x</p>"],
    ['<p style="width:expression(alert(1))">x</p>', "<p>x</p>"],
    ['<p style="width:40%;background:url(x)">x</p>', '<p style="width:40%">x</p>'],
    ['<form action="//evil.example" method="post"><input name="a"></form>', '<form method="post"><input name="a"></form>'],
    // The page's parser runs with scripting off, so the title stays one attribute value; the
    // </noscript> after it is ignored while the <p> is open, so everything is inside noscript.
    ['<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>', ""],
    ['<noscript><p title="</noscript><img src=x onerror=alert(1)>"></p></noscript><p>after</p>', "<p>after</p>"],
    ['<p ONCLICK=alert(1) OnMouseOver=alert(1)>x</p><a HREF="/queue" ONCLICK=x>q</a>', '<p>x</p><a data-dv-href="/queue" href="#">q</a>'],
  ];
  const BANNED = new Set(["script", "style", "iframe", "object", "embed", "noscript"]);
  const SINGLE_SLASH = /^\/(?!\/)/;
  const stage = document.createElement("div");
  document.body.append(stage);
  const results = [];
  for (const [input, keeps] of CASES) {
    const box = document.createElement("div");
    box.append(dvSanitise(input));
    stage.append(box);
    const problems = [];
    for (const e of box.querySelectorAll("*")) {
      if (BANNED.has(e.localName)) problems.push("element " + e.localName);
      for (const a of e.attributes) {
        const name = a.localName.toLowerCase();
        if (name.startsWith("on")) problems.push("attribute " + a.name);
        if (name === "href" && a.value !== "#") problems.push("href " + a.value);
        if (name === "data-dv-href" && !SINGLE_SLASH.test(a.value)) problems.push("data-dv-href " + a.value);
        if (name === "style" && /url\s*\(|expression/i.test(a.value)) problems.push("style " + a.value);
      }
    }
    if (keeps && !box.innerHTML.includes(keeps)) problems.push("lost what it should keep: " + keeps);
    results.push({ input, output: box.innerHTML, problems });
  }
  // Give any handler that slipped through time to run before the answer is written.
  setTimeout(() => {
    document.getElementById("result").textContent = JSON.stringify({ cases: results.length, fired, results });
  }, 500);
})();

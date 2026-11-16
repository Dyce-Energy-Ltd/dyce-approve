  // The Spine Dictionary tab's pure helpers: no DOM, no network. Inlined into hub.html's script by
  // build.py (the SPINE_DICTIONARY_LIB_JS include), just before the tab's module, which reads them
  // as SpineDictLib; required by Node in tests/spine_dictionary_lib.test.js (ruling R2).
  const SpineDictLib = (() => {
    "use strict";
    // A view's name for a reader: underscores as spaces and a capital first letter
    // ("broker_comms" gives "Broker comms").
    function friendly(name) {
      const s = String(name ?? "").replace(/_+/g, " ").trim();
      return s ? s[0].toUpperCase() + s.slice(1) : "";
    }
    // A view comment's first line (the "One row per..." sentence), or "" when there is none.
    function firstLine(description) {
      if (typeof description !== "string") return "";
      return description.split("\n", 1)[0].trim();
    }
    // Every view whose friendly name, or any of whose columns' names or explanations, holds the
    // query, ignoring case, as [{view, columns}]: the views in their order, and in each only the
    // columns that hold it, in table order (none when only the view's name matches). The query is
    // plain text, not a pattern. An empty query gives nothing.
    function search(views, query) {
      const q = String(query ?? "").trim().toLowerCase();
      if (!q || !Array.isArray(views)) return [];
      const holds = (s) => typeof s === "string" && s.toLowerCase().includes(q);
      const out = [];
      for (const view of views) {
        if (!view || typeof view !== "object") continue;
        const columns = (Array.isArray(view.columns) ? view.columns : [])
          .filter((c) => c && typeof c === "object" && (holds(c.name) || holds(c.description)));
        if (columns.length || holds(friendly(view.name))) out.push({ view, columns });
      }
      return out;
    }
    const api = { friendly, firstLine, search };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    return api;
  })();

#!/usr/bin/env osascript -l JavaScript
//
// ax-driver.js — execute a whole AX flow in ONE osascript invocation.
//
// Driving a Tauri (WKWebView) app through the macOS accessibility tree: match
// elements by AXRole + AXName/AXDescription/value (never pixel coordinates),
// act with the AXPress action, and type into React-controlled inputs by
// focusing then issuing real key events (`keystroke`) so onChange fires.
//
// WHY ONE PASS: modals and menus re-render or close between separate osascript
// runs, so a scenario's open → fill → read → assert → cleanup must all happen
// inside a single invocation. The TS layer (ax.ts) builds the step list, calls
// this once, and asserts on the returned JSON transcript.
//
// Input  (argv[0]): JSON { "steps": [ {op,...}, ... ], "options": {...} }
// Output (stdout) : JSON { ok, window, reads, steps:[{op,ok,error?,value?}] }
//
// Ops:
//   resolveWindow  {title}                       focus the app window by its title
//   click / press  {role,name?,desc?,valuePrefix?,nth?,settle?}
//   fill           {role,text, label?|name?|nth?, settle?}   focus + keystroke
//   read           {role, as, label?|name?|nth?}             value -> reads[as]
//   waitFor        {role,name?,desc?,valuePrefix?,timeout?}  poll until present
//   assertExists   {role,name?,desc?,valuePrefix?,nth?, not?}
//   assertEquals   {get, equals}                 reads[get] === equals
//   assertContains {get, substring}              reads[get] includes substring
//   dump           {as?, maxDepth?}              capture interesting tree -> reads[as|"dump"]
//
// `label` finds the first element of `role` that appears (in document order)
// AFTER a static text whose value starts with the label string — robust against
// layout shifts. `nth` selects among position-deduped matches (virtualized
// lists render the AX tree twice).

function run(argv) {
  const se = Application("System Events");
  se.includeStandardAdditions = true;

  let input;
  try { input = JSON.parse(argv[0] || "{}"); }
  catch (e) { return JSON.stringify({ ok: false, error: "bad JSON input: " + e }); }
  const steps = input.steps || [];
  const opts = input.options || {};
  const stopOnError = opts.continueOnError ? false : true;

  // ---- AX primitives ----------------------------------------------------
  const safe = fn => { try { return fn(); } catch (e) { return null; } };
  const role = el => safe(() => el.role());
  const name = el => safe(() => el.name());
  const desc = el => safe(() => el.description());
  const val  = el => safe(() => { const v = el.value(); return (v !== null && typeof v !== "object") ? String(v) : null; });
  const pos  = el => safe(() => { const p = el.position(); return p ? [Math.round(p[0]), Math.round(p[1])] : null; });
  const kids = el => safe(() => el.uiElements()) || [];

  function flatten(el, depth, acc) {
    if (depth > 28) return acc;
    acc.push(el);
    const ks = kids(el);
    for (let i = 0; i < ks.length; i++) flatten(ks[i], depth + 1, acc);
    return acc;
  }
  function matcher(s) {
    return el => {
      if (s.role && role(el) !== s.role) return false;
      if (s.name != null && name(el) !== s.name) return false;
      if (s.desc != null && desc(el) !== s.desc) return false;
      if (s.valuePrefix != null) { const v = val(el); if (!v || v.indexOf(s.valuePrefix) !== 0) return false; }
      return true;
    };
  }
  // position-dedup so a doubly-rendered (virtualized) list counts once
  function dedup(list) {
    const seen = {}, out = [];
    for (let i = 0; i < list.length; i++) {
      const p = pos(list[i]);
      const k = p ? p[0] + "," + p[1] : "i" + i;
      if (!seen[k]) { seen[k] = true; out.push(list[i]); }
    }
    return out;
  }
  function findMatches(root, s) { return dedup(flatten(root, 0, []).filter(matcher(s))); }
  // early-exit DFS: returns the first match without flattening the whole tree
  function findFirst(root, pred, depth) {
    if (depth > 28) return null;
    if (pred(root)) return root;
    const ks = kids(root);
    for (let i = 0; i < ks.length; i++) {
      const hit = findFirst(ks[i], pred, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  function findOne(root, s) {
    // when a specific index is requested we must enumerate + position-dedup
    // (virtualized lists render twice); otherwise early-exit on the first match
    if (s.nth != null) { const m = findMatches(root, s); return m[s.nth] || null; }
    return findFirst(root, matcher(s), 0);
  }
  // first element of role `wantRole` after a static text whose value starts with
  // `label` — early-exit DFS that stops as soon as the field is located
  function fieldAfterLabel(root, label, wantRole) {
    let seenLabel = false, found = null;
    (function walk(el, depth) {
      if (found || depth > 28) return;
      const ro = role(el);
      if (!seenLabel) {
        if (ro === "AXStaticText") { const v = val(el); if (v && v.indexOf(label) === 0) seenLabel = true; }
      } else if (ro === wantRole) { found = el; return; }
      const ks = kids(el);
      for (let i = 0; i < ks.length && !found; i++) walk(ks[i], depth + 1);
    })(root, 0);
    return found;
  }
  function locate(s) {
    if (s.label != null) return fieldAfterLabel(win, s.label, s.role);
    return findOne(win, s);
  }
  function press(el) { el.actions["AXPress"].perform(); }

  // ---- state ------------------------------------------------------------
  let proc = null, win = null, winTitle = null;
  const reads = {};
  const results = [];

  function step(op, fn) {
    const r = { op };
    try { const out = fn(); if (out !== undefined) r.value = out; r.ok = true; }
    catch (e) { r.ok = false; r.error = String(e); }
    results.push(r);
    return r.ok;
  }

  // ---- execute ----------------------------------------------------------
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    let ok = true;
    switch (s.op) {
      case "resolveWindow": {
        ok = step("resolveWindow:" + s.title, () => {
          const procs = se.processes.whose({ backgroundOnly: false })();
          for (let p = 0; p < procs.length; p++) {
            const ws = safe(() => procs[p].windows()) || [];
            for (let w = 0; w < ws.length; w++) {
              if (name(ws[w]) === s.title) { proc = procs[p]; win = ws[w]; winTitle = s.title; break; }
            }
            if (win) break;
          }
          if (!win) throw "window '" + s.title + "' not found (is the app open?)";
          proc.frontmost = true;
          delay(s.settle != null ? s.settle : 0.4);
        });
        break;
      }
      case "click": case "press": {
        ok = step((s.op) + ":" + (s.name || s.desc || s.valuePrefix || s.role), () => {
          const el = locate(s);
          if (!el) throw "no element for " + JSON.stringify({ role: s.role, name: s.name, desc: s.desc });
          press(el);
          delay(s.settle != null ? s.settle : 0.6);
        });
        break;
      }
      case "fill": {
        ok = step("fill:" + (s.label || s.name || s.role), () => {
          const el = locate(s);
          if (!el) throw "no field for " + JSON.stringify({ role: s.role, label: s.label });
          el.focused = true;
          delay(0.2);
          se.keystroke(s.text);
          delay(s.settle != null ? s.settle : 0.3);
          return val(el);
        });
        break;
      }
      case "read": {
        ok = step("read:" + (s.label || s.name || s.role) + "->" + s.as, () => {
          const el = locate(s);
          if (!el) throw "no element to read for " + JSON.stringify({ role: s.role, label: s.label });
          const v = val(el);
          reads[s.as] = v;
          return v;
        });
        break;
      }
      case "waitFor": {
        ok = step("waitFor:" + (s.name || s.desc || s.valuePrefix || s.role), () => {
          const timeout = s.timeout != null ? s.timeout : 3;
          const deadline = timeout / 0.2;
          for (let t = 0; t < deadline; t++) {
            if (findOne(win, s)) return true;
            delay(0.2);
          }
          throw "timeout after " + timeout + "s waiting for " + JSON.stringify({ role: s.role, name: s.name });
        });
        break;
      }
      case "assertExists": {
        ok = step("assertExists:" + (s.name || s.desc || s.valuePrefix || s.role), () => {
          const found = !!findOne(win, s);
          if (s.not && found) throw "expected NOT to exist but found it";
          if (!s.not && !found) throw "expected to exist but not found";
          return found;
        });
        break;
      }
      case "assertEquals": {
        ok = step("assertEquals:" + s.get, () => {
          if (reads[s.get] !== s.equals) throw "expected '" + s.equals + "' got '" + reads[s.get] + "'";
          return true;
        });
        break;
      }
      case "assertContains": {
        ok = step("assertContains:" + s.get, () => {
          const v = reads[s.get] || "";
          if (v.indexOf(s.substring) === -1) throw "'" + v + "' does not contain '" + s.substring + "'";
          return true;
        });
        break;
      }
      case "dump": {
        ok = step("dump", () => {
          const maxDepth = s.maxDepth != null ? s.maxDepth : 24;
          const lines = [];
          (function walk(el, d) {
            if (d > maxDepth) return;
            const ro = role(el) || "?";
            if (/Button|Link|Field|CheckBox|RadioButton|ComboBox|PopUp|TextArea|StaticText|Heading|TabGroup|Slider|Menu/.test(ro)) {
              const nm = name(el), de = desc(el), v = val(el), p = pos(el);
              let lab = ro;
              if (nm) lab += " '" + nm + "'";
              if (de && de !== nm) lab += " desc='" + de + "'";
              if (v && v.length < 60) lab += " val='" + v.replace(/\n/g, "\\n") + "'";
              if (p) lab += " @" + p[0] + "," + p[1];
              lines.push("  ".repeat(d) + lab);
            }
            const ks = kids(el);
            for (let j = 0; j < ks.length; j++) walk(ks[j], d + 1);
          })(win || se.processes[0], 0);
          reads[s.as || "dump"] = lines.join("\n");
          return lines.length + " nodes";
        });
        break;
      }
      default:
        ok = step("unknown:" + s.op, () => { throw "unknown op '" + s.op + "'"; });
    }
    if (!ok && stopOnError) break;
  }

  const allOk = results.every(r => r.ok);
  return JSON.stringify({ ok: allOk, window: winTitle, reads: reads, steps: results });
}

"use strict";
var __dsPreview = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // ds-raw:__ds_raw__
  var require_ds_raw = __commonJS({
    "ds-raw:__ds_raw__"(exports, module) {
      module.exports = window.MyraUI;
    }
  });

  // shim:react-shim
  var require_react_shim = __commonJS({
    "shim:react-shim"(exports, module) {
      var R = window.React;
      function jsx2(t, p, k) {
        return R.createElement(t, k === void 0 ? p : Object.assign({ key: k }, p));
      }
      module.exports = R;
      module.exports.jsx = jsx2;
      module.exports.jsxs = jsx2;
      module.exports.jsxDEV = jsx2;
      module.exports.Fragment = R.Fragment;
    }
  });

  // .design-sync/previews/TableBody.tsx
  var TableBody_exports = {};
  __export(TableBody_exports, {
    InTable: () => InTable
  });

  // ds-shim:ds
  var ds_exports = {};
  __export(ds_exports, {
    default: () => ds_default
  });
  __reExport(ds_exports, __toESM(require_ds_raw()));
  var g = window.MyraUI;
  var ds_default = "default" in g ? g.default : g;

  // .design-sync/previews/TableBody.tsx
  var import_jsx_runtime = __toESM(require_react_shim());
  var runs = [
    { id: "run_9f2", card: "Refactor auth middleware", agent: "claude", status: "Running", elapsed: "2m 14s" },
    { id: "run_8a1", card: "Add cron scheduler tests", agent: "opencode", status: "Done", elapsed: "5m 02s" },
    { id: "run_7c4", card: "Fix sidecar port fallback", agent: "copilot", status: "Failed", elapsed: "0m 47s" }
  ];
  function statusVariant(s) {
    if (s === "Done") return "default";
    if (s === "Failed") return "destructive";
    return "secondary";
  }
  function InTable() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.Table, { style: { width: 560 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.TableCaption, { children: "Recent agent runs on the local board" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.TableHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.TableRow, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.TableHead, { children: "Run" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.TableHead, { children: "Card" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.TableHead, { children: "Agent" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.TableHead, { children: "Status" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.TableHead, { className: "text-right", children: "Elapsed" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.TableBody, { children: runs.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.TableRow, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.TableCell, { className: "font-mono text-xs text-muted-foreground", children: r.id }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.TableCell, { className: "font-medium", children: r.card }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.TableCell, { children: r.agent }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.TableCell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.Badge, { variant: statusVariant(r.status), children: r.status }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.TableCell, { className: "text-right tabular-nums", children: r.elapsed })
      ] }, r.id)) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.TableFooter, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.TableRow, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.TableCell, { colSpan: 4, children: "Total" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.TableCell, { className: "text-right tabular-nums", children: "8m 03s" })
      ] }) })
    ] });
  }
  return __toCommonJS(TableBody_exports);
})();

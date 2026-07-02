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

  // .design-sync/previews/DrawerFooter.tsx
  var DrawerFooter_exports = {};
  __export(DrawerFooter_exports, {
    RunSummaryDrawer: () => RunSummaryDrawer
  });

  // ds-shim:ds
  var ds_exports = {};
  __export(ds_exports, {
    default: () => ds_default
  });
  __reExport(ds_exports, __toESM(require_ds_raw()));
  var g = window.MyraUI;
  var ds_default = "default" in g ? g.default : g;

  // .design-sync/previews/DrawerFooter.tsx
  var import_jsx_runtime = __toESM(require_react_shim());
  function RunSummaryDrawer() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.Drawer, { defaultOpen: true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.DrawerContent, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.DrawerHeader, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DrawerTitle, { children: "Run summary" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DrawerDescription, { children: "Refactor auth middleware · claude · completed in 2m 14s" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "div",
        {
          style: {
            padding: "0 16px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 13
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "var(--muted-foreground)" }, children: "Files changed" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "4" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "var(--muted-foreground)" }, children: "Tests" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "128 passed" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "var(--muted-foreground)" }, children: "Working dir" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "~/src/myra/app" })
            ] })
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.DrawerFooter, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.Button, { children: "Move to Awaiting Review" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DrawerClose, { asChild: true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.Button, { variant: "outline", children: "Close" }) })
      ] })
    ] }) });
  }
  return __toCommonJS(DrawerFooter_exports);
})();

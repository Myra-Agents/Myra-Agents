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

  // .design-sync/previews/ItemTitle.tsx
  var ItemTitle_exports = {};
  __export(ItemTitle_exports, {
    RunList: () => RunList
  });

  // ds-shim:ds
  var ds_exports = {};
  __export(ds_exports, {
    default: () => ds_default
  });
  __reExport(ds_exports, __toESM(require_ds_raw()));
  var g = window.MyraUI;
  var ds_default = "default" in g ? g.default : g;

  // .design-sync/previews/ItemTitle.tsx
  var import_jsx_runtime = __toESM(require_react_shim());
  function BotIcon() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "3", y: "11", width: "18", height: "10", rx: "2" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "5", r: "2" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 7v4" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "8", y1: "16", x2: "8", y2: "16" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "16", y1: "16", x2: "16", y2: "16" })
    ] });
  }
  function RunList() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { width: 460 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.ItemGroup, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.Item, { variant: "outline", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.ItemHeader, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ItemTitle, { children: "Refactor auth middleware" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.Badge, { variant: "secondary", children: "In Progress" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ItemMedia, { variant: "icon", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BotIcon, {}) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.ItemContent, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ItemTitle, { children: "claude · headless" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ItemDescription, { children: "Patching the token expiry guard and re-running the suite." })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ItemActions, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.Button, { size: "sm", variant: "outline", children: "Open run" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ItemFooter, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 12, opacity: 0.7 }, children: "Started 2m ago · ~/repos/api" }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ItemSeparator, {}),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.Item, { variant: "outline", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ItemMedia, { variant: "icon", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BotIcon, {}) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.ItemContent, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ItemTitle, { children: "Generate release notes" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ItemDescription, { children: "opencode · completed in 41s." })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ItemActions, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.Button, { size: "sm", variant: "ghost", children: "View logs" }) })
      ] })
    ] }) });
  }
  return __toCommonJS(ItemTitle_exports);
})();

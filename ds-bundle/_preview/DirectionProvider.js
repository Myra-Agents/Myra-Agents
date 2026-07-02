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

  // .design-sync/previews/DirectionProvider.tsx
  var DirectionProvider_exports = {};
  __export(DirectionProvider_exports, {
    LtrRtl: () => LtrRtl
  });

  // ds-shim:ds
  var ds_exports = {};
  __export(ds_exports, {
    default: () => ds_default
  });
  __reExport(ds_exports, __toESM(require_ds_raw()));
  var g = window.MyraUI;
  var ds_default = "default" in g ? g.default : g;

  // .design-sync/previews/DirectionProvider.tsx
  var import_jsx_runtime = __toESM(require_react_shim());
  function Row({ label }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)"
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.Badge, { children: "agent" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 13 }, children: label })
        ]
      }
    );
  }
  function LtrRtl() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 12, width: 280 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DirectionProvider, { dir: "ltr", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "Left-to-right lane" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DirectionProvider, { dir: "rtl", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "اتجاه من اليمين لليسار" }) })
    ] });
  }
  return __toCommonJS(DirectionProvider_exports);
})();

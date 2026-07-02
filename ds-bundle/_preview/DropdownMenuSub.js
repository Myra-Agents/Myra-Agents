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

  // .design-sync/previews/DropdownMenuSub.tsx
  var DropdownMenuSub_exports = {};
  __export(DropdownMenuSub_exports, {
    RunActions: () => RunActions
  });

  // ds-shim:ds
  var ds_exports = {};
  __export(ds_exports, {
    default: () => ds_default
  });
  __reExport(ds_exports, __toESM(require_ds_raw()));
  var g = window.MyraUI;
  var ds_default = "default" in g ? g.default : g;

  // .design-sync/previews/DropdownMenuSub.tsx
  var import_jsx_runtime = __toESM(require_react_shim());
  function RunActions() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { minHeight: 420, minWidth: 460 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.DropdownMenu, { defaultOpen: true, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuTrigger, { asChild: true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.Button, { variant: "outline", size: "sm", children: "Run actions" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.DropdownMenuContent, { align: "start", style: { width: 248 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuLabel, { children: "Refactor auth middleware" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.DropdownMenuGroup, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.DropdownMenuItem, { children: [
            "Open run",
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuShortcut, { children: "⏎" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.DropdownMenuItem, { children: [
            "Re-run agent",
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuShortcut, { children: "⌘R" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.DropdownMenuItem, { children: [
            "View logs",
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuShortcut, { children: "⌘L" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuSeparator, {}),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuLabel, { children: "Options" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuCheckboxItem, { checked: true, children: "Stream output" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuCheckboxItem, { children: "Notify on finish" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuSeparator, {}),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuLabel, { children: "Agent" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.DropdownMenuRadioGroup, { value: "claude", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuRadioItem, { value: "claude", children: "claude" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuRadioItem, { value: "opencode", children: "opencode" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuRadioItem, { value: "copilot", children: "copilot" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuSeparator, {}),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.DropdownMenuSub, { defaultOpen: true, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuSubTrigger, { children: "Move to lane" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.DropdownMenuSubContent, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuItem, { children: "Todo" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuItem, { children: "In Progress" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuItem, { children: "Awaiting Review" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuSeparator, {}),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.DropdownMenuItem, { variant: "destructive", children: [
          "Delete run",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.DropdownMenuShortcut, { children: "⌫" })
        ] })
      ] })
    ] }) });
  }
  return __toCommonJS(DropdownMenuSub_exports);
})();

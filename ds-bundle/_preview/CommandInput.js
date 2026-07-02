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

  // .design-sync/previews/CommandInput.tsx
  var CommandInput_exports = {};
  __export(CommandInput_exports, {
    CommandPalette: () => CommandPalette
  });

  // ds-shim:ds
  var ds_exports = {};
  __export(ds_exports, {
    default: () => ds_default
  });
  __reExport(ds_exports, __toESM(require_ds_raw()));
  var g = window.MyraUI;
  var ds_default = "default" in g ? g.default : g;

  // .design-sync/previews/CommandInput.tsx
  var import_jsx_runtime = __toESM(require_react_shim());
  function CommandPalette() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        style: {
          width: 420,
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 8px 30px rgb(0 0 0 / 0.12)"
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.Command, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.CommandInput, { placeholder: "Type a command or search…" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.CommandList, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.CommandEmpty, { children: "No results found." }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.CommandGroup, { heading: "Actions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.CommandItem, { children: [
                "Run agent",
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.CommandShortcut, { children: "⌘R" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.CommandItem, { children: [
                "New card",
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.CommandShortcut, { children: "⌘N" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.CommandItem, { children: [
                "Materialize schedule",
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.CommandShortcut, { children: "⌘M" })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.CommandSeparator, {}),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.CommandGroup, { heading: "Navigation", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.CommandItem, { children: [
                "Open Logs",
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.CommandShortcut, { children: "⌘L" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.CommandItem, { children: [
                "Open Planner",
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.CommandShortcut, { children: "⌘P" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.CommandItem, { children: [
                "Settings",
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.CommandShortcut, { children: "⌘," })
              ] })
            ] })
          ] })
        ] })
      }
    );
  }
  return __toCommonJS(CommandInput_exports);
})();

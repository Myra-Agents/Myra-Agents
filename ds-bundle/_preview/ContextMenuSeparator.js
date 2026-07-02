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

  // ds-raw:__ds_raw__
  var require_ds_raw = __commonJS({
    "ds-raw:__ds_raw__"(exports, module) {
      module.exports = window.MyraUI;
    }
  });

  // .design-sync/previews/ContextMenuSeparator.tsx
  var ContextMenuSeparator_exports = {};
  __export(ContextMenuSeparator_exports, {
    CardMenu: () => CardMenu
  });
  var React = __toESM(require_react_shim());

  // ds-shim:ds
  var ds_exports = {};
  __export(ds_exports, {
    default: () => ds_default
  });
  __reExport(ds_exports, __toESM(require_ds_raw()));
  var g = window.MyraUI;
  var ds_default = "default" in g ? g.default : g;

  // .design-sync/previews/ContextMenuSeparator.tsx
  var import_jsx_runtime = __toESM(require_react_shim());
  function CardMenu() {
    const ref = React.useRef(null);
    React.useEffect(() => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: Math.round(r.left + 20),
          clientY: Math.round(r.bottom + 4)
        })
      );
    }, []);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { minHeight: 440, minWidth: 480, padding: 8 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.ContextMenu, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        ds_exports.ContextMenuTrigger,
        {
          ref,
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 64,
            width: 200,
            borderRadius: 8,
            border: "1px dashed var(--border)",
            color: "var(--muted-foreground)",
            fontSize: 13
          },
          children: "Right-click card"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.ContextMenuContent, { avoidCollisions: false, style: { width: 240 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ContextMenuLabel, { children: "Nightly test run" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.ContextMenuGroup, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.ContextMenuItem, { children: [
            "Open run",
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ContextMenuShortcut, { children: "⏎" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.ContextMenuItem, { children: [
            "Re-run agent",
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ContextMenuShortcut, { children: "⌘R" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.ContextMenuItem, { children: [
            "Copy prompt",
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ContextMenuShortcut, { children: "⌘C" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ContextMenuSeparator, {}),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ContextMenuCheckboxItem, { checked: true, children: "Pin to top" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ContextMenuCheckboxItem, { children: "Watch schedule" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ContextMenuSeparator, {}),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ContextMenuLabel, { children: "Priority" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.ContextMenuRadioGroup, { value: "high", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ContextMenuRadioItem, { value: "high", children: "High" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ContextMenuRadioItem, { value: "normal", children: "Normal" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ContextMenuRadioItem, { value: "low", children: "Low" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ContextMenuSeparator, {}),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.ContextMenuSub, { defaultOpen: true, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ContextMenuSubTrigger, { children: "Move to lane" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.ContextMenuSubContent, { avoidCollisions: false, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ContextMenuItem, { children: "Todo" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ContextMenuItem, { children: "In Progress" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ContextMenuItem, { children: "Done" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ContextMenuSeparator, {}),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.ContextMenuItem, { variant: "destructive", children: [
          "Delete run",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.ContextMenuShortcut, { children: "⌫" })
        ] })
      ] })
    ] }) });
  }
  return __toCommonJS(ContextMenuSeparator_exports);
})();

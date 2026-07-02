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

  // .design-sync/previews/SidebarGroupLabel.tsx
  var SidebarGroupLabel_exports = {};
  __export(SidebarGroupLabel_exports, {
    AppSidebar: () => AppSidebar
  });

  // ds-shim:ds
  var ds_exports = {};
  __export(ds_exports, {
    default: () => ds_default
  });
  __reExport(ds_exports, __toESM(require_ds_raw()));
  var g = window.MyraUI;
  var ds_default = "default" in g ? g.default : g;

  // .design-sync/previews/SidebarGroupLabel.tsx
  var import_jsx_runtime = __toESM(require_react_shim());
  function AppSidebar() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        style: {
          width: 580,
          height: 540,
          display: "flex",
          overflow: "hidden",
          border: "1px solid var(--border)",
          borderRadius: 12
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.SidebarProvider, { style: { minHeight: 0, width: "100%", height: "100%" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.Sidebar, { collapsible: "none", style: { height: "100%" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.SidebarHeader, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarTrigger, {}),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontWeight: 600, fontSize: 13 }, children: "Myra Agents" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarInput, { placeholder: "Search cards…" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.SidebarContent, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.SidebarGroup, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarGroupLabel, { children: "Workspace" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarGroupAction, { "aria-label": "New board", children: "+" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarGroupContent, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.SidebarMenu, { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.SidebarMenuItem, { children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarMenuButton, { isActive: true, children: "Kanban" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarMenuBadge, { children: "12" })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.SidebarMenuItem, { children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarMenuButton, { children: "Runs" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarMenuBadge, { children: "3" })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.SidebarMenuItem, { children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarMenuButton, { children: "Schedules" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarMenuAction, { "aria-label": "More", children: "···" })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.SidebarMenuItem, { children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarMenuButton, { children: "Planner" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.SidebarMenuSub, { children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarMenuSubItem, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarMenuSubButton, { isActive: true, children: "Backlog" }) }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarMenuSubItem, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarMenuSubButton, { children: "Roadmap" }) })
                    ] })
                  ] })
                ] }) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarSeparator, {}),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.SidebarGroup, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarGroupLabel, { children: "System" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarGroupContent, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ds_exports.SidebarMenu, { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarMenuItem, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarMenuButton, { children: "Logs" }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarMenuItem, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarMenuButton, { children: "Settings" }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarMenuSkeleton, { showIcon: true })
                ] }) })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarFooter, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarMenu, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarMenuItem, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarMenuButton, { children: "Sidecar · online" }) }) }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarRail, {})
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SidebarInset, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: 16 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, fontSize: 14, marginBottom: 6 }, children: "In Progress" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, color: "var(--muted-foreground)" }, children: "Refactor auth middleware · claude · 2m 14s elapsed" })
          ] }) })
        ] })
      }
    );
  }
  return __toCommonJS(SidebarGroupLabel_exports);
})();

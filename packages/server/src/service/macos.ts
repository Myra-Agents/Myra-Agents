import type { ServiceContext, ServiceInstaller } from "./types";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const LABEL = "dev.myra-agents.server";

function plistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** launchd LaunchAgent in ~/Library/LaunchAgents — per-user, RunAtLoad + KeepAlive. */
export const macosInstaller: ServiceInstaller = {
  mechanism: "launchd LaunchAgent",

  install({ binaryPath, env }: ServiceContext): void {
    const logDir = join(homedir(), ".myra-agents");
    mkdirSync(logDir, { recursive: true });
    const envBlock = Object.entries(env)
      .map(([k, v]) => `    <key>${esc(k)}</key>\n    <string>${esc(v)}</string>`)
      .join("\n");
    const plist = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      "<dict>",
      "  <key>Label</key>",
      `  <string>${LABEL}</string>`,
      "  <key>ProgramArguments</key>",
      "  <array>",
      `    <string>${esc(binaryPath)}</string>`,
      "  </array>",
      ...(envBlock ? ["  <key>EnvironmentVariables</key>", "  <dict>", envBlock, "  </dict>"] : []),
      "  <key>RunAtLoad</key>",
      "  <true/>",
      "  <key>KeepAlive</key>",
      "  <true/>",
      "  <key>StandardOutPath</key>",
      `  <string>${esc(join(logDir, "server.log"))}</string>`,
      "  <key>StandardErrorPath</key>",
      `  <string>${esc(join(logDir, "server.log"))}</string>`,
      "</dict>",
      "</plist>",
      "",
    ].join("\n");

    const path = plistPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, plist);

    // Reload: unload first so re-runs pick up a new binary path/env.
    try {
      execFileSync("launchctl", ["unload", path], { stdio: "ignore" });
    } catch {
      // not loaded yet
    }
    execFileSync("launchctl", ["load", "-w", path], { stdio: "inherit" });
  },

  uninstall(): void {
    const path = plistPath();
    try {
      execFileSync("launchctl", ["unload", "-w", path], { stdio: "ignore" });
    } catch {
      // not loaded
    }
    try {
      rmSync(path);
    } catch {
      // already gone
    }
  },
};

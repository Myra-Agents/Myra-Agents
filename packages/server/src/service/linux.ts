import type { ServiceContext, ServiceInstaller } from "./types";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";

const UNIT = "myra-server.service";

function unitPath(): string {
  return join(homedir(), ".config", "systemd", "user", UNIT);
}

function run(cmd: string, args: string[]): void {
  execFileSync(cmd, args, { stdio: "inherit" });
}

/**
 * systemd **user** unit — no root. `enable-linger` lets it run without an active
 * login session (so it survives logout and starts on boot).
 */
export const linuxInstaller: ServiceInstaller = {
  mechanism: "systemd user unit",

  install({ binaryPath, env }: ServiceContext): void {
    const environment = Object.entries(env)
      .map(([k, v]) => `Environment=${k}=${v}`)
      .join("\n");
    const unit = [
      "[Unit]",
      "Description=Myra Agents server",
      "After=network-online.target",
      "Wants=network-online.target",
      "",
      "[Service]",
      "Type=simple",
      `ExecStart=${binaryPath}`,
      "Restart=on-failure",
      "RestartSec=5",
      ...(environment ? [environment] : []),
      "",
      "[Install]",
      "WantedBy=default.target",
      "",
    ].join("\n");

    const path = unitPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, unit);

    run("systemctl", ["--user", "daemon-reload"]);
    run("systemctl", ["--user", "enable", "--now", UNIT]);
    // Best-effort: linger needs the username; ignore if loginctl is absent.
    try {
      run("loginctl", ["enable-linger", userInfo().username]);
    } catch {
      console.warn("[service] could not enable-linger; service may stop at logout");
    }
  },

  uninstall(): void {
    try {
      run("systemctl", ["--user", "disable", "--now", UNIT]);
    } catch {
      // not installed — fine
    }
    try {
      rmSync(unitPath());
    } catch {
      // already gone
    }
    try {
      run("systemctl", ["--user", "daemon-reload"]);
    } catch {
      // ignore
    }
  },
};

import type { ServiceContext, ServiceInstaller } from "./types";
import { execFileSync } from "node:child_process";

const TASK = "MyraServer";

/**
 * Task Scheduler ONLOGON task — no admin. Runs at the current user's logon.
 * Env is baked by wrapping the binary in a `cmd /c set X=Y&& ...` invocation.
 */
export const windowsInstaller: ServiceInstaller = {
  mechanism: "Task Scheduler (ONLOGON)",

  install({ binaryPath, env }: ServiceContext): void {
    const prefix = Object.entries(env)
      .map(([k, v]) => `set "${k}=${v}"&& `)
      .join("");
    // schtasks /tr takes a single command string; quote the exe path.
    const tr = prefix ? `cmd /c ${prefix}"${binaryPath}"` : `"${binaryPath}"`;
    execFileSync("schtasks", ["/create", "/tn", TASK, "/tr", tr, "/sc", "ONLOGON", "/f"], {
      stdio: "inherit",
    });
    // Kick it off now so the user doesn't have to log out/in.
    try {
      execFileSync("schtasks", ["/run", "/tn", TASK], { stdio: "inherit" });
    } catch {
      // run-now is best-effort
    }
  },

  uninstall(): void {
    try {
      execFileSync("schtasks", ["/delete", "/tn", TASK, "/f"], { stdio: "inherit" });
    } catch {
      // not installed
    }
  },
};

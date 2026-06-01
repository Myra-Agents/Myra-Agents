import { linuxInstaller } from "./linux";
import { macosInstaller } from "./macos";
import { type ServiceContext, type ServiceInstaller, serviceEnv } from "./types";
import { windowsInstaller } from "./windows";

/** Pick the installer for the current OS, or null when unsupported. */
function selectInstaller(): ServiceInstaller | null {
  switch (process.platform) {
    case "linux":
      return linuxInstaller;
    case "darwin":
      return macosInstaller;
    case "win32":
      return windowsInstaller;
    default:
      return null;
  }
}

/** Resolve the running binary path — for a compiled exe this is the exe itself. */
function binaryPath(): string {
  return process.execPath;
}

export function installService(): void {
  const installer = selectInstaller();
  if (!installer) {
    console.log(`[service] no service manager for ${process.platform}. Run manually:\n  ${binaryPath()} &`);
    return;
  }
  const ctx: ServiceContext = { binaryPath: binaryPath(), env: serviceEnv() };
  console.log(`[service] installing via ${installer.mechanism}…`);
  installer.install(ctx);
  console.log("[service] installed — myra-server will start on login/boot");
}

export function uninstallService(): void {
  const installer = selectInstaller();
  if (!installer) {
    console.log(`[service] no service manager for ${process.platform}; nothing to remove`);
    return;
  }
  console.log(`[service] removing ${installer.mechanism}…`);
  installer.uninstall();
  console.log("[service] removed");
}

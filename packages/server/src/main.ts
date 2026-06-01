import { deleteCredential, loadCredential } from "./connector/credential";
import { enroll } from "./connector/enroll";
import { installService, uninstallService } from "./service";
import { startServer } from "./start-server";
import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { hostname } from "node:os";
import { dirname } from "node:path";

/**
 * Unified `myra-server` entry. Routes on argv:
 *
 *   myra-server                  start the server (auto-dials hub if enrolled)
 *   myra-server enroll <code>    pair this machine to a hub
 *   myra-server status           print credential + whether the port is up
 *   myra-server unenroll         drop the hub credential
 *   myra-server install-service  install the per-user OS service
 *   myra-server uninstall-service stop + remove the service
 *
 * Env: MYRA_HUB_URL, MYRA_INSTANCE_ID, MYRA_INSTANCE_LABEL, PORT, MYRA_DIR.
 */
const USAGE = [
  "usage: myra-server [command]",
  "",
  "  (no command)          start the server",
  "  enroll <code>         pair to a hub (needs MYRA_HUB_URL)",
  "  status                show enrollment + running state",
  "  unenroll              drop the hub credential",
  "  install-self <dest>   copy this binary to a stable path",
  "  install-service       install the per-user OS service",
  "  uninstall-service     remove the OS service",
].join("\n");

async function runEnroll(code: string | undefined): Promise<void> {
  if (!code) {
    console.error("usage: myra-server enroll <pairing-code>");
    process.exit(1);
  }
  const hubUrl = process.env.MYRA_HUB_URL?.trim();
  if (!hubUrl) {
    console.error("MYRA_HUB_URL is required (e.g. http://127.0.0.1:4400)");
    process.exit(1);
  }
  const instanceId = process.env.MYRA_INSTANCE_ID?.trim() || hostname();
  const label = process.env.MYRA_INSTANCE_LABEL?.trim() || hostname();
  try {
    const cred = await enroll({ hubUrl, code, instanceId, label });
    console.log(`[enroll] paired "${cred.instanceId}" to ${cred.hubUrl} as user "${cred.userId}"`);
  } catch (err) {
    console.error(`[enroll] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

/**
 * Copy this running binary to a stable destination and mark it executable. The
 * desktop app calls `install-self <dest>` before enroll/install-service so the
 * OS service points at a stable path (`~/.myra-agents/bin/myra-server`) instead
 * of the app bundle, which moves on update.
 */
function runInstallSelf(dest: string | undefined): void {
  if (!dest) {
    console.error("usage: myra-server install-self <dest>");
    process.exit(1);
  }
  try {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(process.execPath, dest);
    if (process.platform !== "win32") chmodSync(dest, 0o755);
    console.log(`[install-self] copied → ${dest}`);
  } catch (err) {
    console.error(`[install-self] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

async function isServerUp(): Promise<boolean> {
  const port = Number(process.env.PORT ?? 4319);
  try {
    await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

async function runStatus(json: boolean): Promise<void> {
  const cred = loadCredential();
  const running = await isServerUp();
  if (json) {
    console.log(
      JSON.stringify({
        enrolled: cred !== null,
        hubUrl: cred?.hubUrl ?? null,
        userId: cred?.userId ?? null,
        instanceId: cred?.instanceId ?? null,
        label: cred?.label ?? null,
        running,
      }),
    );
    return;
  }
  if (cred) {
    console.log(`hub:        ${cred.hubUrl}`);
    console.log(`user:       ${cred.userId}`);
    console.log(`instance:   ${cred.instanceId} (${cred.label})`);
  } else {
    console.log("not enrolled (run: myra-server enroll <code>)");
  }
  console.log(`server:     ${running ? "running" : "stopped"}`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case undefined:
    case "start":
      await startServer();
      break;
    case "enroll":
      await runEnroll(rest[0]);
      break;
    case "status":
      await runStatus(rest.includes("--json"));
      break;
    case "unenroll":
      console.log(deleteCredential() ? "[unenroll] credential removed" : "[unenroll] not enrolled");
      break;
    case "install-self":
      runInstallSelf(rest[0]);
      break;
    case "install-service":
      installService();
      break;
    case "uninstall-service":
      uninstallService();
      break;
    case "help":
    case "-h":
    case "--help":
      console.log(USAGE);
      break;
    default:
      console.error(`unknown command: ${cmd}\n\n${USAGE}`);
      process.exit(1);
  }
}

await main();

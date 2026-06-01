/** Shared shape for the per-OS service installers. All run as the current user. */
export interface ServiceContext {
  /** Absolute path to the running `myra-server` binary (the start target). */
  binaryPath: string;
  /** Env vars to bake into the service definition (PORT, MYRA_DIR if set). */
  env: Record<string, string>;
}

export interface ServiceInstaller {
  /** Human label for logs (e.g. "systemd user unit"). */
  readonly mechanism: string;
  /** Write + enable the service. Throws on failure. */
  install(ctx: ServiceContext): void;
  /** Stop + remove the service. Idempotent; throws only on hard failure. */
  uninstall(): void;
}

/** Env worth carrying into the service (the credential file holds hub/token). */
export function serviceEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (process.env.PORT) env.PORT = process.env.PORT;
  if (process.env.MYRA_DIR) env.MYRA_DIR = process.env.MYRA_DIR;
  return env;
}

import { isTauri } from "@/lib/tauri";

/** Project token + host. Key absent → analytics is fully disabled. */
export const PH_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
export const PH_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

/**
 * Environment tag attached to every event + replay as a super property.
 * `next dev` / `tauri:dev` build with NODE_ENV=development; release builds are
 * production. Override with NEXT_PUBLIC_POSTHOG_ENV for staging/preview builds.
 */
export const PH_ENV: "development" | "production" =
  (process.env.NEXT_PUBLIC_POSTHOG_ENV as "development" | "production" | undefined) ??
  (process.env.NODE_ENV === "production" ? "production" : "development");

export const IS_DEV_ENV = PH_ENV !== "production";

/**
 * Master switch. Dev/test builds never send analytics — a key alone is not
 * enough: production env is required too. Set NEXT_PUBLIC_POSTHOG_DEV_CAPTURE=1
 * to opt back in when testing the analytics wiring itself.
 */
export const PH_ENABLED = Boolean(PH_KEY) && (!IS_DEV_ENV || process.env.NEXT_PUBLIC_POSTHOG_DEV_CAPTURE === "1");

function detectOS(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) return "macos";
  if (/Win/i.test(ua)) return "windows";
  if (/Linux|X11/i.test(ua)) return "linux";
  return "unknown";
}

/**
 * Super properties registered on init — stamped onto every event AND every
 * session replay, so you can filter/segment dev vs prod and desktop vs web.
 */
export function appContext(): Record<string, string> {
  return {
    environment: PH_ENV,
    surface: isTauri() ? "desktop" : "web",
    service: "app",
    os: detectOS(),
  };
}

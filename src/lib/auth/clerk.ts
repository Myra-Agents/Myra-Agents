import type { Clerk } from "@clerk/clerk-js";

/**
 * Thin wrapper over the framework-agnostic `@clerk/clerk-js` SDK. The app is a
 * **static export** (no `@clerk/nextjs` middleware/SSR), so we load the vanilla
 * SDK lazily in the browser and drive Clerk's hosted sign-in by redirect. Clerk
 * only proves identity at login; the hub owns the session afterwards
 * (`session.ts`), so this never touches the connector or runs server-side.
 */

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
/** Optional Clerk JWT template name (set `aud`/extra claims) — else the default session token. */
const TOKEN_TEMPLATE = process.env.NEXT_PUBLIC_CLERK_JWT_TEMPLATE?.trim() || undefined;

/** True when a publishable key is configured (auth is usable). */
export function isClerkConfigured(): boolean {
  return Boolean(PUBLISHABLE_KEY);
}

let clerkPromise: Promise<Clerk> | undefined;

/** Load + memoize the Clerk singleton. Throws if unconfigured or off-browser. */
async function getClerk(): Promise<Clerk> {
  if (typeof window === "undefined") throw new Error("Clerk is browser-only");
  if (!PUBLISHABLE_KEY) throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set");
  if (!clerkPromise) {
    clerkPromise = (async () => {
      const { Clerk: ClerkCtor } = await import("@clerk/clerk-js");
      const clerk = new ClerkCtor(PUBLISHABLE_KEY);
      await clerk.load();
      return clerk;
    })();
  }
  return clerkPromise;
}

/** Is there a live Clerk session right now? */
export async function hasClerkSession(): Promise<boolean> {
  if (!isClerkConfigured()) return false;
  const clerk = await getClerk();
  return Boolean(clerk.session);
}

/** Redirect to Clerk's hosted sign-in, returning to `returnUrl` afterwards. */
export async function signInWithClerk(returnUrl: string = window.location.href): Promise<void> {
  const clerk = await getClerk();
  await clerk.redirectToSignIn({ signInForceRedirectUrl: returnUrl, signUpForceRedirectUrl: returnUrl });
}

/** Mint a Clerk JWT for the hub to verify. Null if not signed in. */
export async function getClerkToken(): Promise<string | null> {
  if (!isClerkConfigured()) return null;
  const clerk = await getClerk();
  if (!clerk.session) return null;
  return (await clerk.session.getToken(TOKEN_TEMPLATE ? { template: TOKEN_TEMPLATE } : undefined)) ?? null;
}

/** Sign out of Clerk (best-effort; the hub session is cleared separately). */
export async function signOutOfClerk(): Promise<void> {
  if (!isClerkConfigured()) return;
  const clerk = await getClerk();
  await clerk.signOut();
}

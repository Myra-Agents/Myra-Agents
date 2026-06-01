import { useCallback, useEffect, useState } from "react";

import type { AccountInfo } from "@myra/shared";
import { invoke, isTauri } from "@tauri-apps/api/core";

import { isClerkConfigured, signInWithClerk } from "@/lib/auth/clerk";
import {
  getAccount,
  isAuthConfigured,
  isAuthenticated,
  signOut as sessionSignOut,
  subscribe,
} from "@/lib/auth/session";

/**
 * Reactive auth surface for the UI. `signIn` branches by runtime: the web does
 * Clerk's hosted redirect in-page; the desktop hands off to the system browser
 * via the `start_login` Tauri command (the `myra://` deep-link brings the
 * session back — see AuthBootstrap). `signOut` revokes + clears.
 */
export function useAuth() {
  const [account, setAccount] = useState<AccountInfo | null>(() => getAccount());
  const [authed, setAuthed] = useState<boolean>(() => isAuthenticated());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sync = () => {
      setAccount(getAccount());
      setAuthed(isAuthenticated());
    };
    const off = subscribe(sync);
    sync();
    return off;
  }, []);

  const signIn = useCallback(async () => {
    setBusy(true);
    try {
      if (isTauri()) await invoke("start_login");
      else await signInWithClerk();
    } finally {
      // Web redirects away; desktop just opened the browser — release the spinner.
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await sessionSignOut();
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    account,
    isAuthenticated: authed,
    /** Auth is usable at all (hub URL + Clerk key configured, or desktop). */
    configured: isAuthConfigured() && (isTauri() || isClerkConfigured()),
    busy,
    signIn,
    signOut,
  };
}

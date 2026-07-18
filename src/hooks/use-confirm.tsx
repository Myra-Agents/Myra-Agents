"use client";

import { type ReactNode, useCallback, useRef, useState } from "react";

import { useTranslations } from "next-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmOptions {
  /** Dialog heading. Defaults to the generic "Confirm". */
  title?: string;
  /** The question itself — what will happen if they accept. */
  description: string;
  /** Label for the accepting button. Defaults to "Confirm". */
  actionLabel?: string;
}

/**
 * `window.confirm`, as an AlertDialog.
 *
 * The Tauri webview rejects the native `confirm()` outright — the dialog
 * plugin's `dialog:default` permission set only covers message/open/save, so
 * every call dies as an unhandledRejection and the guarded action silently
 * never runs. This keeps the call sites' imperative shape
 * (`if (!(await confirm({…}))) return`) but renders the app's own dialog.
 *
 * Render `confirmDialog` once in the component's JSX; it is null until asked.
 */
export function useConfirm(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmDialog: ReactNode;
} {
  const t = useTranslations("common");
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      // A second ask while one is open answers the first with "no" rather than
      // leaving its caller awaiting forever.
      resolver.current?.(false);
      resolver.current = resolve;
      setOpts(options);
    });
  }, []);

  const confirmDialog = opts ? (
    <AlertDialog
      open
      onOpenChange={(open) => {
        // Escape / overlay click — same answer as Cancel.
        if (!open) settle(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{opts.title ?? t("confirm")}</AlertDialogTitle>
          <AlertDialogDescription>{opts.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => settle(true)}>{opts.actionLabel ?? t("confirm")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  return { confirm, confirmDialog };
}

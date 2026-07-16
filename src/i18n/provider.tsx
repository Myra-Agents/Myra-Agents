"use client";

import { type ReactNode, useEffect, useState } from "react";

import { NextIntlClientProvider } from "next-intl";

import { defaultLocale, defaultTimeZone, type Locale, locales } from "@/i18n/request";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const messages: Record<Locale, typeof en> = { en, fr };

function detectLocale(): Locale {
  if (typeof navigator !== "undefined") {
    const stored = localStorage.getItem("myra-agents-locale");
    if (stored && locales.includes(stored as Locale)) {
      return stored as Locale;
    }
    const browserLang = navigator.language.split("-")[0];
    if (locales.includes(browserLang as Locale)) {
      return browserLang as Locale;
    }
  }
  return defaultLocale;
}

/** Fired by {@link setAppLocale} so the provider re-renders in place. */
const LOCALE_CHANGED = "myra:locale-changed";

/**
 * The stored language choice as a picker value — "auto" when nothing is pinned,
 * which is not the same as {@link detectLocale}'s resolved locale.
 */
export function getStoredLocale(): "auto" | Locale {
  try {
    const stored = localStorage.getItem("myra-agents-locale");
    return stored && locales.includes(stored as Locale) ? (stored as Locale) : "auto";
  } catch {
    // No window (prerender) or localStorage blocked — "auto" is the safe read.
    return "auto";
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);

  useEffect(() => {
    const sync = () => setLocale(detectLocale());
    sync();
    window.addEventListener(LOCALE_CHANGED, sync);
    return () => window.removeEventListener(LOCALE_CHANGED, sync);
  }, []);

  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone={defaultTimeZone}>
      {children}
    </NextIntlClientProvider>
  );
}

export function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  useEffect(() => {
    const sync = () => setLocale(detectLocale());
    sync();
    window.addEventListener(LOCALE_CHANGED, sync);
    return () => window.removeEventListener(LOCALE_CHANGED, sync);
  }, []);
  return locale;
}

/**
 * Switch the app's language. Notifies {@link I18nProvider} instead of reloading
 * the window: a reload would wipe unsaved UI state, and the onboarding wizard
 * offers this on its second step — a reload there would drop the user back to
 * step one, losing whatever they had already typed.
 */
export function setAppLocale(locale: string) {
  if (locale === "auto") {
    localStorage.removeItem("myra-agents-locale");
  } else {
    localStorage.setItem("myra-agents-locale", locale);
  }
  window.dispatchEvent(new Event(LOCALE_CHANGED));
}

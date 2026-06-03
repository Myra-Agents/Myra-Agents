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

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);

  useEffect(() => {
    setLocale(detectLocale());
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
    setLocale(detectLocale());
  }, []);
  return locale;
}

export function setAppLocale(locale: string) {
  if (locale === "auto") {
    localStorage.removeItem("myra-agents-locale");
  } else {
    localStorage.setItem("myra-agents-locale", locale);
  }
  window.location.reload();
}

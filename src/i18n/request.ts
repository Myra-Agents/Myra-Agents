import { getRequestConfig } from "next-intl/server";

import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const defaultTimeZone = "Europe/Paris";

const messages: Record<Locale, typeof en> = { en, fr };

/**
 * Detect locale from navigator (client-side) or fall back to default.
 * In static export mode there's no server request, so this is only used
 * for the build-time default.
 */
export function detectLocale(): Locale {
  if (typeof navigator !== "undefined") {
    const browserLang = navigator.language.split("-")[0];
    if (locales.includes(browserLang as Locale)) {
      return browserLang as Locale;
    }
  }
  return defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = defaultLocale;
  return {
    locale,
    messages: messages[locale],
    timeZone: defaultTimeZone,
  };
});

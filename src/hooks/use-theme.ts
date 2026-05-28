"use client";

import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const THEME_STORAGE_KEY = "myra-agents-theme";
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") {
    return "system";
  }

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(storedTheme) ? storedTheme : "system";
  } catch {
    return "system";
  }
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system" && typeof window !== "undefined" && window.matchMedia?.(DARK_MEDIA_QUERY).matches) {
    return "dark";
  }

  return theme === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme): ResolvedTheme {
  const resolvedTheme = resolveTheme(theme);

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
    root.setAttribute("data-theme-mode", theme);
  }

  return resolvedTheme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (typeof document === "undefined") {
      return "light";
    }

    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  });

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
  }, []);

  useEffect(() => {
    const initialTheme = getStoredTheme();
    setThemeState(initialTheme);
    setResolvedTheme(applyTheme(initialTheme));
  }, []);

  useEffect(() => {
    const nextResolvedTheme = applyTheme(theme);
    setResolvedTheme(nextResolvedTheme);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore localStorage failures and keep the in-memory theme state.
    }

    if (typeof window === "undefined" || theme !== "system" || !window.matchMedia) {
      return;
    }

    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const handleChange = () => {
      setResolvedTheme(applyTheme("system"));
    };

    media.addEventListener("change", handleChange);

    return () => {
      media.removeEventListener("change", handleChange);
    };
  }, [theme]);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [resolvedTheme, setTheme, theme]);

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}

export function ThemeInitScript() {
  const code = `
    (function () {
      try {
        var storedTheme = window.localStorage.getItem("${THEME_STORAGE_KEY}");
        var theme =
          storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
            ? storedTheme
            : "system";
        var resolvedTheme =
          theme === "system" && window.matchMedia && window.matchMedia("${DARK_MEDIA_QUERY}").matches
            ? "dark"
            : theme === "dark"
              ? "dark"
              : "light";
        var root = document.documentElement;

        root.classList.toggle("dark", resolvedTheme === "dark");
        root.style.colorScheme = resolvedTheme;
        root.setAttribute("data-theme-mode", theme);
      } catch (error) {
        console.warn("ThemeInitScript error:", error);
      }
    })();
  `;

  return createElement("script", {
    // biome-ignore lint/security/noDangerouslySetInnerHtml: required for pre-hydration theme script
    dangerouslySetInnerHTML: {
      __html: code,
    },
  });
}

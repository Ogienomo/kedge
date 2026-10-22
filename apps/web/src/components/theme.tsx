"use client";

import { useCallback, useSyncExternalStore } from "react";

export type ThemePreference = "light" | "dark" | "system";
const KEY = "kd-theme";

/**
 * Inline script for <head>: applies the stored theme before first paint so
 * there is no flash of the wrong theme.
 */
export const themeScript = `(function(){try{var p=localStorage.getItem("${KEY}")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="light";}})();`;

function read(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(pref: ThemePreference): void {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const media = matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (read() === "system") apply("system");
  };
  media.addEventListener("change", onChange);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onChange);
  };
}

export function useTheme(): [ThemePreference, (p: ThemePreference) => void] {
  const pref = useSyncExternalStore(subscribe, read, () => "system" as const);
  const set = useCallback((p: ThemePreference) => {
    try {
      localStorage.setItem(KEY, p);
    } catch {
      // Storage may be unavailable (private mode); the theme still applies for this page.
    }
    apply(p);
    for (const l of listeners) l();
  }, []);
  return [pref, set];
}

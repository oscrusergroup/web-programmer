"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY, themePreference, type ThemePreference } from "@/lib/theme";

function applyTheme(preference: ThemePreference) {
  document.documentElement.dataset.theme = preference === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;
}

export function ThemeSelect() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const current = useRef<ThemePreference>("system");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function sync(value: string | null) {
      current.current = themePreference(value);
      setPreference(current.current);
      applyTheme(current.current);
    }
    let saved: string | null = null;
    try { saved = localStorage.getItem(THEME_STORAGE_KEY); } catch {}
    sync(saved);

    const systemChanged = () => applyTheme(current.current);
    const storageChanged = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) sync(event.newValue);
    };
    media.addEventListener("change", systemChanged);
    window.addEventListener("storage", storageChanged);
    return () => {
      media.removeEventListener("change", systemChanged);
      window.removeEventListener("storage", storageChanged);
    };
  }, []);

  const Icon = preference === "system" ? Monitor : preference === "dark" ? Moon : Sun;
  return (
    <label className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-soft px-2 py-2 text-muted sm:px-3">
      <Icon size={15} aria-hidden="true" className="hidden sm:block" />
      <span className="sr-only">Color theme</span>
      <select
        value={preference}
        onChange={event => {
          const next = themePreference(event.target.value);
          current.current = next;
          setPreference(next);
          applyTheme(next);
          try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch {}
        }}
        className="rounded bg-surface-soft text-xs font-medium text-ink [--select-inset:0px]"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}

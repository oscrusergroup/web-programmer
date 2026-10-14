export type ThemePreference = "system" | "light" | "dark";
export const THEME_STORAGE_KEY = "cartreader-theme";

export function themePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

// Runs in the document head before the body paints. Storage may be disabled
// by browser privacy settings; system preference still works in that case.
export const THEME_INIT_SCRIPT = `(() => {
  let preference = "system";
  try { preference = localStorage.getItem("${THEME_STORAGE_KEY}"); } catch {}
  document.documentElement.dataset.theme = preference === "light" || preference === "dark"
    ? preference : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
})();`;

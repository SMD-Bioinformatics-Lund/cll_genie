import { useEffect, useState, type ReactNode } from "react";
import { ThemeContext, type ThemePreference } from "./theme-context";

function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [preference, updatePreference] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem("cll-genie-theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  });
  const resolved = resolveTheme(preference);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(preference);
      document.documentElement.classList.toggle(
        "dark",
        resolveTheme(preference) === "dark",
      );
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  const setPreference = (next: ThemePreference) => {
    localStorage.setItem("cll-genie-theme", next);
    updatePreference(next);
  };

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

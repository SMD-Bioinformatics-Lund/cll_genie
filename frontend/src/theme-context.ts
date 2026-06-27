import { createContext, useContext } from "react";

export type ThemePreference = "light" | "dark" | "system";

export type ThemeContextValue = {
  preference: ThemePreference;
  resolved: "light" | "dark";
  setPreference: (preference: ThemePreference) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useAppTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value)
    throw new Error("useAppTheme must be used inside AppThemeProvider");
  return value;
}

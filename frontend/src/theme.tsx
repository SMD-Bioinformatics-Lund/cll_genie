import { useMemo, useState, type ReactNode } from "react";
import {
  createTheme,
  CssBaseline,
  ThemeProvider as MuiThemeProvider,
} from "@mui/material";
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

  const setPreference = (next: ThemePreference) => {
    localStorage.setItem("cll-genie-theme", next);
    document.documentElement.dataset.theme = resolveTheme(next);
    updatePreference(next);
  };

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: resolved,
          primary: { main: resolved === "dark" ? "#DF7849" : "#7B4925" },
          secondary: { main: resolved === "dark" ? "#7B4925" : "#DF7849" },
          background: {
            default: resolved === "dark" ? "#0d1419" : "#f6f8fb",
            paper: resolved === "dark" ? "#131e25" : "#ffffff",
          },
        },
        shape: { borderRadius: 10 },
        typography: {
          fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
          fontSize: 13,
          h1: { fontSize: "2rem", lineHeight: 1.15, fontWeight: 760 },
          h2: { fontSize: "1.75rem", lineHeight: 1.2, fontWeight: 750 },
          h3: { fontSize: "1.5rem", lineHeight: 1.25, fontWeight: 740 },
          h4: { fontSize: "1.25rem", lineHeight: 1.3, fontWeight: 720 },
          h5: { fontSize: "1.05rem", lineHeight: 1.35, fontWeight: 710 },
          h6: { fontSize: "0.95rem", lineHeight: 1.4, fontWeight: 700 },
          subtitle1: { fontSize: "0.9rem" },
          body1: { fontSize: "0.875rem", lineHeight: 1.55 },
          body2: { fontSize: "0.8rem", lineHeight: 1.5 },
          overline: {
            fontSize: "0.68rem",
            lineHeight: 1.8,
            letterSpacing: "0.09em",
          },
          button: {
            fontSize: "0.8rem",
            textTransform: "none",
            fontWeight: 700,
          },
        },
        components: {
          MuiButton: {
            defaultProps: { size: "small" },
            styleOverrides: {
              root: { minHeight: 34, paddingInline: 12, borderRadius: 8 },
            },
          },
          MuiTextField: {
            defaultProps: {
              fullWidth: true,
              variant: "outlined",
              size: "small",
            },
          },
          MuiFormControl: { defaultProps: { size: "small" } },
          MuiChip: { defaultProps: { size: "small" } },
          MuiTab: {
            styleOverrides: {
              root: { minHeight: 40, paddingBlock: 8, fontSize: "0.78rem" },
            },
          },
          MuiTabs: { styleOverrides: { root: { minHeight: 40 } } },
          MuiDialogTitle: {
            styleOverrides: {
              root: { fontSize: "1.1rem", padding: "16px 20px" },
            },
          },
          MuiDialogContent: {
            styleOverrides: { root: { paddingInline: 20 } },
          },
          MuiDialogActions: {
            styleOverrides: { root: { padding: "12px 20px 16px" } },
          },
        },
      }),
    [resolved],
  );

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

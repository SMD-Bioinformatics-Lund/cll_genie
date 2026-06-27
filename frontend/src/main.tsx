import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppThemeProvider } from "./theme";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppThemeProvider>
      <App />
    </AppThemeProvider>
  </StrictMode>,
);

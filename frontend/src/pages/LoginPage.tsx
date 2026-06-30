import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "../components/ui";
import { Dna, Eye, EyeOff } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { getProviders, login } from "../api";
import { Brand } from "../components/Brand";
import { ThemeControl } from "../components/ThemeControl";
import type { Provider, ProvidersPayload, Session } from "../types";

type Props = { onAuthenticated: (session: Session) => void };

export function LoginPage({ onAuthenticated }: Props) {
  const [metadata, setMetadata] = useState<ProvidersPayload | null>(null);
  const [provider, setProvider] = useState<Provider["id"]>("ldap");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProviders()
      .then((payload) => {
        setMetadata(payload);
        const primary = payload.providers.find((item) => item.id === "ldap");
        if (primary || payload.providers[0]) {
          setProvider((primary ?? payload.providers[0]).id);
        }
      })
      .catch(() =>
        setError("CLL Genie could not load its authentication configuration."),
      );
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      onAuthenticated(await login(provider, username, password));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <header className="login-header">
        <Brand />
        <ThemeControl />
      </header>

      <section className="login-layout">
        <div className="login-intro">
          <div className="login-orbit" aria-hidden="true">
            <Dna size={96} strokeWidth={1.25} />
          </div>
          <Typography component="h1" variant="h2" className="login-title">
            IGHV mutation analysis,
            <br /> from sequence to report.
          </Typography>
          <Typography className="login-description">
            A focused clinical workspace for LymphoTrack post processing,
            IMGT/V-QUEST analysis, interpretation, and traceable CLL reporting.
          </Typography>
        </div>

        <Paper component="section" className="login-card">
          <Typography component="h2" variant="h4" fontWeight={750}>
            Welcome back
          </Typography>
          <Typography color="text.secondary" className="mt-1.5 mb-6">
            Sign in to continue to CLL Genie.
          </Typography>

          {metadata && metadata.providers.length > 1 && (
            <Tabs
              value={provider}
              onChange={(_, next: Provider["id"]) => setProvider(next)}
              variant="fullWidth"
              aria-label="Authentication provider"
              className="mb-6"
            >
              {metadata.providers.map((item) => (
                <Tab key={item.id} value={item.id} label={item.label} />
              ))}
            </Tabs>
          )}

          {error && (
            <Alert severity="error" className="mb-4">
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={submit} noValidate>
            <TextField
              label={provider === "ldap" ? "Email" : "Username"}
              name="username"
              autoComplete={provider === "ldap" ? "email" : "username"}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoFocus
              disabled={loading}
              className="mb-4"
            />
            <TextField
              label="Password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={loading}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      edge="end"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              className="mb-5.0"
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={loading || !username.trim() || !password}
              startIcon={
                loading ? (
                  <CircularProgress size={18} color="inherit" />
                ) : undefined
              }
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </Box>

          <Typography variant="body2" color="text.secondary" className="mt-5.0">
            {provider === "ldap"
              ? "Use your organization credentials. Your CLL Genie access comes from your local user profile."
              : "Use your existing CLL Genie local account."}
          </Typography>
        </Paper>
      </section>

      <footer className="login-footer">
        <span>CLL Genie {metadata?.version ?? ""}</span>
        {metadata?.environment && metadata.environment !== "production" && (
          <span className="environment-badge">{metadata.environment}</span>
        )}
        <span>Section for Molecular Diagnostics</span>
      </footer>
    </main>
  );
}

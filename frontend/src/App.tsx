import { CircularProgress } from "./components/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { APP_BASE_PATH, getSession, logout } from "./api";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { SessionContext } from "./session-context";
import type { Session } from "./types";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});
const WorklistPage = lazy(() =>
  import("./pages/WorklistPage").then((m) => ({ default: m.WorklistPage })),
);
const SamplePage = lazy(() =>
  import("./pages/SamplePage").then((m) => ({ default: m.SamplePage })),
);
const AnalysisPage = lazy(() =>
  import("./pages/AnalysisPage").then((m) => ({ default: m.AnalysisPage })),
);
const SubmissionPage = lazy(() =>
  import("./pages/SubmissionPage").then((m) => ({ default: m.SubmissionPage })),
);
const ReportsPage = lazy(() =>
  import("./pages/ReportsPage").then((m) => ({ default: m.ReportsPage })),
);
const AdminRulesPage = lazy(() =>
  import("./pages/AdminRulesPage").then((m) => ({ default: m.AdminRulesPage })),
);
const AdminUsersPage = lazy(() =>
  import("./pages/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })),
);
const AdminAuditLogsPage = lazy(() =>
  import("./pages/AdminAuditLogsPage").then((m) => ({
    default: m.AdminAuditLogsPage,
  })),
);
const AdminOperationsPage = lazy(() =>
  import("./pages/AdminOperationsPage").then((m) => ({
    default: m.AdminOperationsPage,
  })),
);

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="centered-progress">
        <CircularProgress aria-label="Loading CLL Genie" />
      </div>
    );
  }

  if (!session) {
    return (
      <BrowserRouter basename={APP_BASE_PATH}>
        <LoginPage onAuthenticated={setSession} />
      </BrowserRouter>
    );
  }

  const signOut = async () => {
    await logout(session.csrf_token);
    queryClient.clear();
    setSession(null);
  };
  return (
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={{ session, signOut }}>
        <BrowserRouter basename={APP_BASE_PATH}>
          <Suspense
            fallback={
              <div className="centered-progress">
                <CircularProgress />
              </div>
            }
          >
            <Routes>
              <Route element={<AppLayout />}>
                <Route index element={<WorklistPage />} />
                <Route path="samples/:sampleId" element={<SamplePage />} />
                <Route
                  path="samples/:sampleId/analyze"
                  element={<AnalysisPage />}
                />
                <Route
                  path="samples/:sampleId/submissions/:submissionId"
                  element={<SubmissionPage />}
                />
                <Route path="reports" element={<ReportsPage />} />
                <Route
                  path="admin/rules"
                  element={
                    session.user.is_admin ? (
                      <AdminRulesPage />
                    ) : (
                      <Navigate to="/" />
                    )
                  }
                />
                <Route
                  path="admin/users"
                  element={
                    session.user.is_admin ? (
                      <AdminUsersPage />
                    ) : (
                      <Navigate to="/" />
                    )
                  }
                />
                <Route
                  path="admin/audit-logs"
                  element={
                    session.user.is_admin ? (
                      <AdminAuditLogsPage />
                    ) : (
                      <Navigate to="/" />
                    )
                  }
                />
                <Route
                  path="admin/operations"
                  element={
                    session.user.is_admin ? (
                      <AdminOperationsPage />
                    ) : (
                      <Navigate to="/" />
                    )
                  }
                />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster position="bottom-right" richColors />
      </SessionContext.Provider>
    </QueryClientProvider>
  );
}

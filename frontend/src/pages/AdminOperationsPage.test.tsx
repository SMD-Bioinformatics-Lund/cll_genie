import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionContext } from "../session-context";
import { AdminOperationsPage } from "./AdminOperationsPage";

const getTaskControls = vi.fn();
const updateTaskControl = vi.fn();
const runIngestionNow = vi.fn();

vi.mock("../api", () => ({
  getTaskControls: (...args: unknown[]) => getTaskControls(...args),
  updateTaskControl: (...args: unknown[]) => updateTaskControl(...args),
  runIngestionNow: (...args: unknown[]) => runIngestionNow(...args),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <SessionContext.Provider
      value={{
        session: {
          user: {
            username: "admin",
            fullname: "Administrator",
            email: "admin@example.test",
            roles: ["admin"],
            is_admin: true,
            can_analyze: true,
            can_moderate: true,
          },
          provider: "local",
          csrf_token: "csrf",
        },
        signOut: async () => {},
      }}
    >
      <QueryClientProvider client={queryClient}>
        <AdminOperationsPage />
      </QueryClientProvider>
    </SessionContext.Provider>,
  );
}

describe("AdminOperationsPage", () => {
  beforeEach(() => {
    getTaskControls.mockReset();
    updateTaskControl.mockReset();
    runIngestionNow.mockReset();
    getTaskControls.mockResolvedValue([
      {
        key: "automated_ingestion",
        label: "Automated ingestion",
        description: "Scheduled ingestion",
        enabled: true,
        updated_at: null,
        updated_by: null,
      },
      {
        key: "vquest_analysis",
        label: "IMGT/V-QUEST analysis",
        description: "Worker analysis",
        enabled: false,
        updated_at: null,
        updated_by: null,
      },
    ]);
    updateTaskControl.mockResolvedValue({
      key: "vquest_analysis",
      label: "IMGT/V-QUEST analysis",
      description: "Worker analysis",
      enabled: true,
    });
    runIngestionNow.mockResolvedValue({ task_id: "task-1", queued: true });
  });

  it("renders persisted task state and can queue ingestion", async () => {
    renderPage();

    expect(await screen.findByText("Automated ingestion")).toBeInTheDocument();
    expect(screen.getByText("IMGT/V-QUEST analysis")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /run ingestion now/i }));

    await waitFor(() => {
      expect(runIngestionNow).toHaveBeenCalledWith("csrf");
    });
  });

  it("toggles a task control with the session csrf token", async () => {
    renderPage();

    const switchControl = await screen.findByRole("switch", {
      name: /toggle imgt\/v-quest analysis/i,
    });
    fireEvent.click(switchControl);

    await waitFor(() => {
      expect(updateTaskControl).toHaveBeenCalledWith(
        "vquest_analysis",
        true,
        "csrf",
      );
    });
  });
});

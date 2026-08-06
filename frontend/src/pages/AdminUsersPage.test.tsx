import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionContext } from "../session-context";
import { AdminUsersPage } from "./AdminUsersPage";

const apiRequest = vi.fn();
vi.mock("../api", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
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
        <AdminUsersPage />
      </QueryClientProvider>
    </SessionContext.Provider>,
  );
}

describe("AdminUsersPage", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25 });
  });

  it("defaults new users to LDAP and exposes role checkboxes", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /add user/i }));

    expect(screen.getByRole("button", { name: /LDAP/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByLabelText(/^Password$/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /LymphoTrack admin/ }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("requires password confirmation only for local identities", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /add user/i }));
    fireEvent.click(screen.getByRole("button", { name: /Local/ }));

    expect(screen.getByLabelText(/^Password$/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirm password/)).toBeInTheDocument();
  });
});

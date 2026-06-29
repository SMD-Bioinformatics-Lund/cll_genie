import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SessionContext } from "../session-context";
import { SamplePage } from "./SamplePage";

describe("SamplePage", () => {
  it("renders its loading container initially", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <SessionContext.Provider
        value={{
          session: {
            user: {
              username: "analyst",
              fullname: "Test Analyst",
              email: null,
              roles: ["user"],
              is_admin: false,
              is_lymphotrack: false,
            },
            provider: "local",
            csrf_token: "test-token",
          },
          signOut: async () => {},
        }}
      >
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <SamplePage />
          </BrowserRouter>
        </QueryClientProvider>
      </SessionContext.Provider>,
    );

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});

import { describe, expect, it } from "vitest";
import { APP_BASE_PATH, applicationUrl } from "./api";

describe("application base path", () => {
  it("prefixes API and artifact routes exactly once", () => {
    expect(APP_BASE_PATH).toBe("/cll_genie");
    expect(applicationUrl("/api/v1/auth/me")).toBe("/cll_genie/api/v1/auth/me");
    expect(applicationUrl("/cll_genie/api/v1/auth/me")).toBe(
      "/cll_genie/api/v1/auth/me",
    );
  });
});

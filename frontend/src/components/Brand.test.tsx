// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Brand } from "./Brand";

describe("Brand", () => {
  it("exposes the product name to assistive technology", () => {
    render(<Brand />);
    expect(screen.getByLabelText("CLL Genie")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RuleBuilder } from "./RuleBuilder";

describe("RuleBuilder", () => {
  it("renders the empty visual rule editor", () => {
    render(<RuleBuilder conditions={[]} onChange={() => {}} />);

    expect(
      screen.getByText("No conditions defined. This rule will always match."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Condition" }),
    ).toBeInTheDocument();
  });
});

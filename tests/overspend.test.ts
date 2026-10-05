import { describe, expect, it } from "vitest";
import { overspendBlame } from "../src/overspend.js";

describe("where an overspend message is shown", () => {
  it("shows nothing while the plan is within Budget", () => {
    expect(
      overspendBlame({
        overBudget: false,
        lastChange: "irrigation",
        overInputs: [],
        selectedTechnologies: ["irrigation"],
      }),
    ).toEqual({ inputs: [], technology: undefined });
  });

  it("blames the Technology just selected, not the production inputs", () => {
    expect(
      overspendBlame({
        overBudget: true,
        lastChange: "granary",
        overInputs: ["cultivatedHectares", "fertilizedHectares"],
        selectedTechnologies: ["irrigation", "granary"],
      }),
    ).toEqual({ inputs: [], technology: "granary" });
  });

  it("keeps blaming the most recent production input that exceeds its maximum", () => {
    expect(
      overspendBlame({
        overBudget: true,
        lastChange: "preparedHectares",
        overInputs: ["cultivatedHectares", "preparedHectares"],
        selectedTechnologies: ["irrigation"],
      }),
    ).toEqual({ inputs: ["preparedHectares"], technology: undefined });
  });

  it("falls back to every over-maximum input when the last change is not one of them", () => {
    const overInputs = ["cultivatedHectares", "preparedHectares"] as const;
    expect(
      overspendBlame({
        overBudget: true,
        lastChange: "fertilizedHectares",
        overInputs,
        selectedTechnologies: [],
      }),
    ).toEqual({ inputs: [...overInputs], technology: undefined });
    expect(
      overspendBlame({
        overBudget: true,
        lastChange: undefined,
        overInputs,
        selectedTechnologies: [],
      }),
    ).toEqual({ inputs: [...overInputs], technology: undefined });
  });

  it("blames no card when the last change deselected a Technology", () => {
    expect(
      overspendBlame({
        overBudget: true,
        lastChange: "granary",
        overInputs: ["cultivatedHectares"],
        selectedTechnologies: ["irrigation"],
      }),
    ).toEqual({ inputs: ["cultivatedHectares"], technology: undefined });
  });
});

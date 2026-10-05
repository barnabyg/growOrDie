import type { ProductionInput } from "./turn.js";
import type { TechnologyId } from "./types.js";

/** Where the plan's inline overspend message belongs: at the change that took
 * the plan over Budget. */

/** The plan control the player changed most recently. */
export type PlanChange = ProductionInput | TechnologyId;

/** Production inputs and the Technology card that show the message. */
export interface OverspendBlame {
  inputs: ProductionInput[];
  technology: TechnologyId | undefined;
}

/** A Technology just selected is blamed alone. Otherwise the most recently
 * changed production input that exceeds its affordable maximum is blamed, or
 * every such input when that one does not. Nothing is blamed within Budget. */
export function overspendBlame(plan: {
  overBudget: boolean;
  lastChange: PlanChange | undefined;
  overInputs: readonly ProductionInput[];
  selectedTechnologies: readonly TechnologyId[];
}): OverspendBlame {
  const { overBudget, lastChange, overInputs, selectedTechnologies } = plan;
  if (!overBudget) return { inputs: [], technology: undefined };
  const technology = selectedTechnologies.find((id) => id === lastChange);
  if (technology) return { inputs: [], technology };
  const input = overInputs.find((id) => id === lastChange);
  return { inputs: input ? [input] : [...overInputs], technology: undefined };
}

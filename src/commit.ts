import { tons } from "./format.js";

/** What a commit button shows. The in-page button and the mobile commit bar
 * both render the same state, so they cannot disagree. */
export interface CommitButtonState {
  label: string;
  disabled: boolean;
  /** Committing is allowed but has a known cost, such as a food shortfall. */
  warning: boolean;
}

/** The Resolve button for the production plan. Resolving stays possible with
 * an ordinary-forecast shortfall, but the shortfall is stated on the button.
 * `locked` covers Collapse and blocked persistence. */
export function resolveButton(input: {
  balanceTons: number;
  complete: boolean;
  affordable: boolean;
  locked: boolean;
}): CommitButtonState {
  const shortfall = input.balanceTons < 0;
  return {
    label: shortfall
      ? `Resolve with ${tons(-input.balanceTons)} shortfall`
      : "Resolve harvest",
    disabled: !input.complete || !input.affordable || input.locked,
    warning: shortfall,
  };
}

/** The Finish year button for the Storage allocation. */
export function finishButton(input: {
  valid: boolean;
  locked: boolean;
}): CommitButtonState {
  return {
    label: "Finish year",
    disabled: !input.valid || input.locked,
    warning: false,
  };
}

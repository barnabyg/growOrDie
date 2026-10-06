import { formatCount, years } from "./format.js";
import type { SaveData } from "./persistence.js";
import { finalYear } from "./simulation.js";

/** What the Restart confirmation dialog says will be lost: the current run,
 * its chronicle and any Harvest awaiting allocation. */
export function restartWarning(save: SaveData): string {
  const parts = [
    `Your current run (Year ${finalYear(save.state)}, Population ${formatCount(save.state.population)}) will be replaced by a new run starting at Year 1.`,
  ];
  if (save.eventLog.length > 0) {
    parts.push(
      `Its chronicle of ${years(save.eventLog.length)} will be cleared.`,
    );
  }
  if (save.pendingTurn) {
    parts.push("The Harvest awaiting allocation will be discarded.");
  }
  parts.push("This cannot be undone.");
  return parts.join(" ");
}

import { formatCount as fmt, years } from "./format.js";
import { resourceHeader } from "./header.js";
import type { SaveData } from "./persistence.js";

/** What the Restart confirmation dialog says will be lost: the current run,
 * its chronicle and any Harvest awaiting allocation. */
export function restartWarning(save: SaveData): string {
  const { year } = resourceHeader(save);
  const parts = [
    `Your current run (Year ${year}, Population ${fmt(save.state.population)}) will be replaced by a new run starting at Year 1.`,
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

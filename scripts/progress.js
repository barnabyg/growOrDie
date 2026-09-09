import { appendFileSync } from "node:fs";

// Reporting must never change a test runner's outcome (including unwritable paths).
export function reportTest(event, filename = process.env.VERIFY_EVENTS_FILE) {
  if (!filename) return;
  try {
    appendFileSync(filename, `${JSON.stringify(event)}\n`);
  } catch {
    // Observational fallback: runner-native terminal output remains authoritative.
  }
}

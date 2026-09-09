import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createState,
  optionalDashboard,
  recordOutput,
  runStages,
} from "./dashboard.js";
import { runNode } from "./process.js";
import { STAGES } from "./verification-profile.js";

const directory = await mkdtemp(join(tmpdir(), "growordie-verify-"));
const events = join(directory, "tests.jsonl");
const state = createState(STAGES.map((stage) => stage.name));
const dashboard =
  !process.env.CI && process.env.VERIFY_DASHBOARD !== "0"
    ? await optionalDashboard(state)
    : null;
if (dashboard) console.log(`TEST_DASHBOARD_URL=${dashboard.url}`);
const poll = setInterval(async () => {
  try {
    const text = await readFile(events, "utf8");
    // A writer can be halfway through its final line when polled.
    state.tests = text
      .split("\n")
      .slice(0, -1)
      .map((line) => JSON.parse(line));
  } catch {
    // Test reporting is optional; terminal output is never affected.
  }
}, 200);
try {
  process.exitCode = await runStages(STAGES, state, (stage) => {
    console.log(`\n${stage.name}\n`);
    return runNode([process.env.npm_execpath, ...stage.args], {
      env: {
        ...process.env,
        npm_config_cache: join(directory, "npm-cache"),
        npm_config_update_notifier: "false",
        VERIFY_EVENTS_FILE: events,
        VERIFY_OUTPUT_DIR: join(directory, "browser-results"),
      },
      onOutput: (output) => recordOutput(state, output),
    });
  });
} finally {
  clearInterval(poll);
  try {
    state.tests = (await readFile(events, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    // Preserve already observed progress if reporting failed.
  }
  const reportDirectory = resolve(
    "verification-results",
    `${new Date(state.startedAt).toISOString().replaceAll(":", "-")}-${process.pid}`,
  );
  try {
    await mkdir(reportDirectory, { recursive: true });
    await writeFile(
      join(reportDirectory, "report.json"),
      JSON.stringify(state, null, 2),
    );
    console.log(`VERIFICATION_REPORT=${join(reportDirectory, "report.json")}`);
  } catch {
    console.log(
      "Static report unavailable; terminal result remains authoritative.",
    );
  }
  console.log(
    `Verification ${state.status}. Browser failure artifacts: ${directory}`,
  );
  // Keep the final state visible briefly without holding up completion.
  if (dashboard) {
    await new Promise((done) => setTimeout(done, 1200));
    await new Promise((done) => dashboard.server.close(done));
  }
}

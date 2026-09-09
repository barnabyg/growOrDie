import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createState,
  optionalDashboard,
  recordOutput,
  runStages,
  startDashboard,
} from "../scripts/dashboard.js";
import { STAGES } from "../scripts/verification-profile.js";
import { reportTest } from "../scripts/progress.js";
import { runNode } from "../scripts/process.js";

describe("verification observer", () => {
  it("keeps process exit status even when the output observer fails", async () => {
    expect(
      await runNode(
        ["-e", "console.log('observer fallback'); process.exitCode = 7"],
        {
          onOutput: () => {
            throw new Error("observer unavailable");
          },
        },
      ),
    ).toBe(7);
  });

  it("passes color preferences to subprocesses without conflicting environment flags", async () => {
    const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };
    let output = "";
    expect(
      await runNode(
        [
          "-e",
          "console.log(JSON.stringify({no: process.env.NO_COLOR, force: process.env.FORCE_COLOR}))",
        ],
        {
          env,
          onOutput: (chunk) => {
            output += chunk;
          },
        },
      ),
    ).toBe(0);
    expect(JSON.parse(output)).toEqual({ force: "0" });
    expect(env.NO_COLOR).toBe("1");
  });
  it("keeps required gate order and stops at the first failing gate with its exit status", async () => {
    expect(STAGES.map((stage) => stage.name)).toEqual([
      "Formatting",
      "Lint and style",
      "Compiler and types",
      "Static bug analysis",
      "Automated tests",
      "Dependency tree",
      "Vulnerability audit",
      "Secret scan",
      "Package integrity",
      "Static package build",
    ]);
    const state = createState(STAGES.map((stage) => stage.name));
    const calls = [];
    const code = await runStages(STAGES, state, async (stage) => {
      calls.push(stage.name);
      return calls.length === 3 ? 7 : 0;
    });
    expect(code).toBe(7);
    expect(calls).toHaveLength(3);
    expect(state.status).toBe("failed");
    expect(state.stages[3].status).toBe("pending");
  });

  it("records bounded recent output and completes all successful stages", async () => {
    const state = createState(["one"]);
    recordOutput(state, "x".repeat(30000));
    expect(state.output).toHaveLength(24000);
    expect(await runStages([{ name: "one" }], state, async () => 0)).toBe(0);
    expect(state.status).toBe("passed");
    expect(state.finishedAt).not.toBeNull();
  });

  it("isolates concurrent dashboards and exposes only observational endpoints", async () => {
    const first = await startDashboard(createState(["first"]));
    const second = await startDashboard(createState(["second"]));
    try {
      expect(first.url).not.toBe(second.url);
      expect(first.server.address().address).toBe("127.0.0.1");
      expect(
        (await (await fetch(`${first.url}/state`)).json()).stages[0].name,
      ).toBe("first");
      expect(
        (await (await fetch(`${second.url}/state`)).json()).stages[0].name,
      ).toBe("second");
      expect((await fetch(first.url)).status).toBe(200);
      expect((await fetch(`${first.url}/secret`)).status).toBe(404);
      expect(
        (await fetch(`${first.url}/state`, { method: "POST" })).status,
      ).toBe(405);
    } finally {
      await Promise.all(
        [first, second].map(
          ({ server }) => new Promise((done) => server.close(done)),
        ),
      );
    }
  });

  it("falls back when a dashboard cannot bind without changing verification results", async () => {
    const state = createState(["one"]);
    expect(
      await optionalDashboard(state, async () => {
        throw new Error("port unavailable");
      }),
    ).toBeNull();
    expect(await runStages([{ name: "one" }], state, async () => 0)).toBe(0);
  });

  it("reports native test outcomes but tolerates a broken reporter destination", async () => {
    const directory = await mkdtemp(join(tmpdir(), "growordie-reporter-test-"));
    try {
      const file = join(directory, "events.jsonl");
      reportTest({ name: "works", status: "passed" }, file);
      expect(JSON.parse((await readFile(file, "utf8")).trim()).status).toBe(
        "passed",
      );
      expect(() =>
        reportTest({ name: "ignored" }, join(directory, "absent", "events")),
      ).not.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

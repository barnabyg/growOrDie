import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listenFailure,
  needsInstall,
  openCommand,
  play,
  shouldOpen,
} from "../scripts/play.js";

const cleanup = [];
afterEach(async () => {
  for (const task of cleanup.splice(0)) await task();
});

async function project({ installedAt, lockedAt }) {
  const directory = await mkdtemp(join(tmpdir(), "growordie-play-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const lock = join(directory, "package-lock.json");
  await writeFile(lock, "{}");
  await utimes(lock, lockedAt, lockedAt);
  if (installedAt !== undefined) {
    await mkdir(join(directory, "node_modules"));
    const marker = join(directory, "node_modules/.package-lock.json");
    await writeFile(marker, "{}");
    await utimes(marker, installedAt, installedAt);
  }
  return directory;
}

function harness(overrides = {}) {
  const calls = [];
  const output = [];
  const errors = [];
  const options = {
    argv: [],
    env: {},
    install: async () => false,
    run: async (args) => {
      calls.push(args.join(" "));
      return 0;
    },
    start: async ({ port }) => {
      calls.push(`start ${port}`);
      return { address: () => ({ port }) };
    },
    open: (url) => calls.push(`open ${url}`),
    log: (line) => output.push(line),
    fail: (line) => errors.push(line),
    ...overrides,
  };
  return { calls, output, errors, options };
}

describe("install decision", () => {
  it("installs when node_modules is missing", async () => {
    expect(await needsInstall(await project({ lockedAt: 1000 }))).toBe(true);
  });

  it("installs when the lockfile is newer than the last install", async () => {
    const directory = await project({ installedAt: 1000, lockedAt: 2000 });
    expect(await needsInstall(directory)).toBe(true);
  });

  it("skips install when dependencies are up to date", async () => {
    const directory = await project({ installedAt: 2000, lockedAt: 1000 });
    expect(await needsInstall(directory)).toBe(false);
  });
});

describe("browser opening", () => {
  it("opens unless --no-open or NO_OPEN is given", () => {
    expect(shouldOpen([], {})).toBe(true);
    expect(shouldOpen(["--no-open"], {})).toBe(false);
    expect(shouldOpen([], { NO_OPEN: "1" })).toBe(false);
    expect(shouldOpen([], { NO_OPEN: "0" })).toBe(true);
  });

  it("uses each platform's default-browser launcher", () => {
    const url = "http://127.0.0.1:8000";
    expect(openCommand("win32", url).command).toBe("cmd");
    expect(openCommand("darwin", url)).toEqual({
      command: "open",
      args: [url],
    });
    expect(openCommand("linux", url)).toEqual({
      command: "xdg-open",
      args: [url],
    });
  });
});

describe("play", () => {
  it("installs, builds, starts and opens in order", async () => {
    const { calls, output, options } = harness({ install: async () => true });
    const result = await play(options);
    expect(result.code).toBe(0);
    expect(calls).toEqual([
      "ci",
      "run build",
      "start 8000",
      "open http://127.0.0.1:8000",
    ]);
    expect(output.at(-1)).toContain("Ctrl+C to stop");
  });

  it("skips install when up to date and honours PORT and --no-open", async () => {
    const { calls, options } = harness({
      argv: ["--no-open"],
      env: { PORT: "8123" },
    });
    expect((await play(options)).code).toBe(0);
    expect(calls).toEqual(["run build", "start 8123"]);
  });

  it("stops before serving when the build fails", async () => {
    const { calls, errors, options } = harness();
    options.run = async (args) => {
      calls.push(args.join(" "));
      return 2;
    };
    expect((await play(options)).code).toBe(2);
    expect(calls).toEqual(["run build"]);
    expect(errors).toEqual(["Build failed (exit 2)."]);
  });

  it("stops before building when npm ci fails", async () => {
    const { calls, options } = harness({ install: async () => true });
    options.run = async (args) => {
      calls.push(args.join(" "));
      return 1;
    };
    expect((await play(options)).code).toBe(1);
    expect(calls).toEqual(["ci"]);
  });

  it("reports a busy port in one line with a non-zero exit", async () => {
    const blocker = createServer();
    await new Promise((done) => blocker.listen(0, "127.0.0.1", done));
    cleanup.push(() => new Promise((done) => blocker.close(done)));
    const port = blocker.address().port;
    const { calls, errors, options } = harness({ env: { PORT: String(port) } });
    delete options.start;
    const result = await play(options);
    expect(result.code).toBe(1);
    expect(errors).toEqual([
      `Port ${port} is already in use. Stop the other server or set PORT to a free port.`,
    ]);
    expect(calls).toEqual(["run build"]);
  });

  it("describes other listen failures", () => {
    expect(listenFailure(new Error("boom"), 8000)).toBe(
      "Could not start the server: boom",
    );
  });
});

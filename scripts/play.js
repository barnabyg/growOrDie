// One-command local play: install when needed, build, serve and open the game.
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startGameServer } from "../server.js";

const root = fileURLToPath(new URL("..", import.meta.url));

/** True when `npm ci` has not run since package-lock.json last changed. */
export async function needsInstall(directory = root) {
  const modified = async (path) => {
    try {
      return (await stat(join(directory, path))).mtimeMs;
    } catch {
      return undefined;
    }
  };
  const installed = await modified("node_modules/.package-lock.json");
  const locked = await modified("package-lock.json");
  return (
    installed === undefined || (locked !== undefined && locked > installed)
  );
}

export function shouldOpen(argv = [], env = {}) {
  return !argv.includes("--no-open") && !["1", "true"].includes(env.NO_OPEN);
}

/** The platform's default-browser launcher for `url`. */
export function openCommand(platform, url) {
  if (platform === "win32")
    return { command: "cmd", args: ["/c", "start", '""', url] };
  if (platform === "darwin") return { command: "open", args: [url] };
  return { command: "xdg-open", args: [url] };
}

export function listenFailure(error, port) {
  return error?.code === "EADDRINUSE"
    ? `Port ${port} is already in use. Stop the other server or set PORT to a free port.`
    : `Could not start the server: ${error?.message ?? error}`;
}

/** Runs an npm script or command, preferring the npm that launched us. */
function runNpm(args, env = process.env) {
  // Run directly with node, there is no npm_execpath; Windows npm is npm.cmd.
  const [command, ...prefix] = env.npm_execpath?.endsWith(".js")
    ? [process.execPath, env.npm_execpath]
    : process.platform === "win32"
      ? ["cmd", "/d", "/c", "npm"]
      : ["npm"];
  return new Promise((accept) => {
    const child = spawn(command, [...prefix, ...args], {
      cwd: root,
      stdio: "inherit",
    });
    child.once("error", (error) => {
      process.stderr.write(`${error.message}\n`);
      accept(1);
    });
    child.once("close", (code) => accept(code ?? 1));
  });
}

function openBrowser(url, platform = process.platform) {
  const { command, args } = openCommand(platform, url);
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    windowsVerbatimArguments: platform === "win32",
  });
  child.once("error", () =>
    process.stderr.write(`Could not open a browser; visit ${url}\n`),
  );
  child.unref();
}

/**
 * Installs if needed, builds, then serves the game. Steps are injectable for
 * tests. Resolves to `{ code }` on failure or `{ code: 0, server, url }`.
 */
export async function play({
  argv = process.argv.slice(2),
  env = process.env,
  install = needsInstall,
  run = (args) => runNpm(args, env),
  start = startGameServer,
  open = openBrowser,
  log = (line) => process.stdout.write(`${line}\n`),
  fail = (line) => process.stderr.write(`${line}\n`),
} = {}) {
  if (await install()) {
    log("Installing dependencies (npm ci)...");
    const code = await run(["ci"]);
    if (code !== 0) {
      fail(`npm ci failed (exit ${code}).`);
      return { code };
    }
  }
  log("Building...");
  const code = await run(["run", "build"]);
  if (code !== 0) {
    fail(`Build failed (exit ${code}).`);
    return { code };
  }
  const port = Number(env.PORT ?? 8000);
  let server;
  try {
    server = await start({ port });
  } catch (error) {
    fail(listenFailure(error, port));
    return { code: 1 };
  }
  const url = `http://127.0.0.1:${server.address().port}`;
  log(`Grow or Die running at ${url} (Ctrl+C to stop)`);
  if (shouldOpen(argv, env)) open(url);
  return { code: 0, server, url };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { code, server } = await play();
  if (server) {
    process.once("SIGINT", () => {
      server.closeAllConnections();
      server.close(() => process.exit(0));
    });
  } else {
    process.exitCode = code;
  }
}

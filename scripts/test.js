import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNode } from "./process.js";

// Browser and HTTP checks use a fresh, isolated compilation, never a stale dist/.
const directory = await mkdtemp(join(tmpdir(), "growordie-tests-"));
try {
  let code = await runNode([
    "node_modules/typescript/bin/tsc",
    "-p",
    "tsconfig.build.json",
    "--outDir",
    directory,
  ]);
  const env = { ...process.env, TEST_GAME_MODULES: directory };
  if (code === 0)
    code = await runNode(["node_modules/vitest/vitest.mjs", "run"], { env });
  if (code === 0)
    code = await runNode(["node_modules/@playwright/test/cli.js", "test"], {
      env,
    });
  process.exitCode = code;
} finally {
  await rm(directory, { recursive: true, force: true });
}

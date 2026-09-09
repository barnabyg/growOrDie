import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNode } from "./process.js";

const directory = await mkdtemp(join(tmpdir(), "growordie-build-"));
try {
  process.exitCode = await runNode([
    "node_modules/typescript/bin/tsc",
    "-p",
    "tsconfig.build.json",
    "--outDir",
    directory,
  ]);
  if (process.exitCode === 0) {
    const files = await readdir(directory);
    const html = await readFile("index.html", "utf8");
    if (!files.includes("ui.js") || !html.includes('src="./dist/ui.js"'))
      throw new Error("Packaged HTML does not load the compiled UI");
    for (const file of files) {
      const source = await readFile(join(directory, file), "utf8");
      for (const match of source.matchAll(/from\s+["']\.\/([^"']+)["']/g)) {
        if (!files.includes(match[1]))
          throw new Error(`Missing packaged module: ${match[1]}`);
      }
    }
    console.log(
      `Validated static package: index.html and ${files.length} compiled modules`,
    );
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

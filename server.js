// Local development server: only browser entry points and compiled game modules.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export function createGameServer({
  modulesDirectory = resolve(root, "dist"),
} = {}) {
  return createServer(async (request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent((request.url ?? "/").split("?")[0]);
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
      return;
    }
    const entry = pathname === "/" || pathname === "/index.html";
    if (!entry && !/^\/dist\/[a-z][a-z0-9-]*\.js$/.test(pathname)) {
      response.writeHead(404).end("Not found");
      return;
    }
    try {
      const body = await readFile(
        entry
          ? resolve(root, "index.html")
          : resolve(modulesDirectory, pathname.slice("/dist/".length)),
      );
      response.writeHead(200, {
        "content-type": entry
          ? "text/html; charset=utf-8"
          : "text/javascript; charset=utf-8",
        "x-content-type-options": "nosniff",
        "cache-control": "no-store",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
}

export async function startGameServer({ port = 8000, modulesDirectory } = {}) {
  const server = createGameServer({ modulesDirectory });
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", accept);
  });
  return server;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = await startGameServer({
    port: Number(process.env.PORT ?? 8000),
  });
  console.log(
    `Grow or Die running at http://127.0.0.1:${server.address().port}`,
  );
}

import { afterEach, describe, expect, it } from "vitest";
import { request } from "node:http";
import { startGameServer } from "../server.js";

const servers = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise((done) => server.close(done))),
  );
});
async function serve() {
  const server = await startGameServer({
    port: 0,
    modulesDirectory: process.env.TEST_GAME_MODULES,
  });
  servers.push(server);
  return server;
}
function get(server, path, method = "GET") {
  return new Promise((accept, reject) => {
    request(
      { hostname: "127.0.0.1", port: server.address().port, path, method },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () =>
          accept({
            status: response.statusCode,
            body,
            headers: response.headers,
          }),
        );
      },
    )
      .on("error", reject)
      .end();
  });
}
describe("local asset server", () => {
  it("binds only loopback and serves the page and compiled modules", async () => {
    const server = await serve();
    expect(server.address().address).toBe("127.0.0.1");
    expect((await get(server, "/")).body).toContain("Grow or Die");
    const module = await get(server, "/dist/ui.js");
    expect(module.status).toBe(200);
    expect(module.headers["content-type"]).toContain("javascript");
    expect((await get(server, "/index.html?cache=1", "HEAD")).body).toBe("");
  });
  it("denies repository files and traversal including native Windows forms", async () => {
    const server = await serve();
    for (const path of [
      "/.git/config",
      "/package.json",
      "/src/ui.ts",
      "/node_modules/vitest/package.json",
      "/README.md",
      "/../package.json",
      "/%2e%2e/package.json",
      "/dist/../package.json",
      "/dist/%2e%2e%5cpackage.json",
      "/dist\\..\\package.json",
      "/C:/Windows/win.ini",
      "/dist/ui.js%00",
      "/dist/ui.js:secret",
      "//dist/ui.js",
      "/dist/ui.js.map",
    ]) {
      expect((await get(server, path)).status, path).toBe(404);
    }
    expect((await get(server, "/%zz")).status).toBe(400);
    expect((await get(server, "/", "POST")).status).toBe(405);
  });
});
